import { env } from "@/lib/env";
import {
  detectSafeModeAccessBlockedResponse,
  formatSafeModeAccessBlockedError
} from "@/lib/scraping/access-blocks";
import { extractOffersFromHtml } from "@/lib/scraping/extractors";
import { buildExtractedOffer } from "@/lib/scraping/normalize";
import type { ExtractedOffer } from "@/lib/types";

export interface DiscoveryTarget {
  vendorPageId: string;
  vendorId: string;
  vendorName: string;
  websiteUrl: string;
  pageUrl: string;
}

export interface DiscoveryAttempt {
  source: "woocommerce_store_api" | "shopify_products_api" | "html" | "firecrawl";
  success: boolean;
  offers: number;
  durationMs: number;
  error?: string;
}

type ApiDiscoverySource = "woocommerce_store_api" | "shopify_products_api";

export interface DiscoveryResult {
  offers: ExtractedOffer[];
  source: string | null;
  origin: string | null;
  attempts: DiscoveryAttempt[];
  diagnostics: DiscoveryDiagnostic[];
}

interface InvalidPricingPriceFields {
  price: string | number | null;
  regular_price: string | number | null;
  sale_price: string | number | null;
}

interface InvalidPricingParsedFields {
  price: number | null;
  regular_price: number | null;
  sale_price: number | null;
}

export interface InvalidPricingProductSample {
  productId: string | null;
  productName: string | null;
  observedPriceFields: InvalidPricingPriceFields;
  parsedPriceCents: InvalidPricingParsedFields;
}

export interface InvalidPricingPayloadDiagnostic {
  code: "INVALID_PRICING_PAYLOAD";
  source: "woocommerce_store_api";
  pageUrl: string;
  origin: string;
  productsObserved: number;
  productCandidates: number;
  candidatesWithPriceFields: number;
  candidatesWithPositivePrice: number;
  observedPriceFieldCounts: {
    price: number;
    regular_price: number;
    sale_price: number;
  };
  sampledProducts: InvalidPricingProductSample[];
}

export type DiscoveryDiagnostic = InvalidPricingPayloadDiagnostic;

interface CachedApiOffer {
  productUrl: string;
  productName: string;
  compoundRawName: string;
  formulationRaw: string | null;
  sizeRaw: string | null;
  currencyCode: "USD";
  listPriceCents: number;
  available: boolean;
  rawPayload: Record<string, unknown>;
}

interface CachedApiResult {
  source: ApiDiscoverySource;
  offers: CachedApiOffer[];
}

export interface DiscoveryCache {
  apiResultsByOrigin: Map<string, CachedApiResult>;
  unsupportedSourcesByOrigin: Map<string, Set<ApiDiscoverySource>>;
}

interface SourceExtractionResult {
  offers: ExtractedOffer[];
  origin: string | null;
  diagnostics: DiscoveryDiagnostic[];
}

export function createDiscoveryCache(): DiscoveryCache {
  return {
    apiResultsByOrigin: new Map(),
    unsupportedSourcesByOrigin: new Map()
  };
}

interface FetchJsonResult {
  status: number;
  payload: unknown | null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function urlOrigins(target: DiscoveryTarget): string[] {
  const origins: string[] = [];

  try {
    origins.push(new URL(target.pageUrl).origin);
  } catch {
    // noop
  }

  try {
    origins.push(new URL(target.websiteUrl).origin);
  } catch {
    // noop
  }

  return unique(origins);
}

function buildHtmlFallbackUrls(target: DiscoveryTarget): string[] {
  const urls: string[] = [];

  try {
    urls.push(new URL(target.pageUrl).toString());
  } catch {
    // noop
  }

  try {
    urls.push(new URL("/", target.websiteUrl).toString());
  } catch {
    // noop
  }

  return unique(urls);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDiscoveryError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown";
  }

  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  const parts: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (current instanceof Error) {
      const message = current.message.trim();
      if (message.length > 0 && !parts.includes(message)) {
        parts.push(message);
      }

      const code = (current as Error & { code?: string }).code;
      if (typeof code === "string" && code.length > 0) {
        const normalizedCode = `code=${code}`;
        if (!parts.includes(normalizedCode)) {
          parts.push(normalizedCode);
        }
      }

      const cause = (current as Error & { cause?: unknown }).cause;
      if (cause) {
        queue.push(cause);
      }
    }
  }

  const combined = parts.join(" | ").trim();
  if (!combined) {
    return "unknown";
  }

  return combined.slice(0, 240);
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("aborted")
  );
}

async function fetchJson(url: string): Promise<FetchJsonResult> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            "user-agent": env.SCRAPER_USER_AGENT,
            accept: "application/json,text/plain,*/*",
            "accept-language": "en-US,en;q=0.9"
          },
          cache: "no-store"
        },
        45_000
      );

      const text = await response.text();
      const bodyText = text.toLowerCase();
      const safeModeBlocked = detectSafeModeAccessBlockedResponse({
        statusCode: response.status,
        serverHeader: response.headers.get("server")?.toLowerCase() ?? "",
        bodyText,
        cfRay: response.headers.get("cf-ray")
      });

      if (safeModeBlocked && safeModeBlocked.statusCode !== null) {
        throw new Error(
          formatSafeModeAccessBlockedError({
            provider: safeModeBlocked.provider,
            statusCode: safeModeBlocked.statusCode,
            cfRay: safeModeBlocked.cfRay
          })
        );
      }

      const payload = text.trim()
        ? (() => {
            try {
              return JSON.parse(text) as unknown;
            } catch {
              return null;
            }
          })()
        : null;

      if (attempt < maxAttempts && isTransientHttpStatus(response.status)) {
        await sleep(350 * attempt);
        continue;
      }

      return {
        status: response.status,
        payload
      };
    } catch (error) {
      if (attempt < maxAttempts && isTransientNetworkError(error)) {
        await sleep(350 * attempt);
        continue;
      }

      throw error;
    }
  }

  return {
    status: 599,
    payload: null
  };
}

function toPriceCents(value: number, minorUnit: number): number {
  if (minorUnit === 2) {
    return Math.round(value);
  }

  if (minorUnit < 2) {
    return Math.round(value * Math.pow(10, 2 - minorUnit));
  }

  return Math.round(value / Math.pow(10, minorUnit - 2));
}

function toAbsoluteUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseWooPriceCents(product: Record<string, unknown>): number | null {
  const prices = product.prices;
  if (!prices || typeof prices !== "object") {
    const priceHtml = typeof product.price_html === "string" ? product.price_html : null;
    if (priceHtml) {
      return parseWooPriceHtmlCents(priceHtml);
    }

    return null;
  }

  const pricesMap = prices as Record<string, unknown>;
  const minorUnit = typeof pricesMap.currency_minor_unit === "number" ? pricesMap.currency_minor_unit : 2;
  const priceHtml = typeof product.price_html === "string" ? product.price_html : null;
  const displayPrice = priceHtml ? parseWooPriceHtmlCents(priceHtml) : null;
  if (displayPrice !== null && displayPrice > 0) {
    return displayPrice;
  }

  const parsedPrice = parseWooPriceFieldCents(pricesMap.price ?? product.price, minorUnit);
  if (parsedPrice !== null && parsedPrice > 0) {
    return parsedPrice;
  }

  const parsedSalePrice = parseWooPriceFieldCents(pricesMap.sale_price ?? product.sale_price, minorUnit);
  if (parsedSalePrice !== null && parsedSalePrice > 0) {
    return parsedSalePrice;
  }

  const parsedRegularPrice = parseWooPriceFieldCents(pricesMap.regular_price ?? product.regular_price, minorUnit);
  if (parsedRegularPrice !== null && parsedRegularPrice > 0) {
    return parsedRegularPrice;
  }

  return null;
}

function parseWooPriceFieldCents(priceRaw: unknown, minorUnit: number): number | null {
  if (typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw >= 0) {
    return toPriceCents(priceRaw, minorUnit);
  }

  if (typeof priceRaw === "string" && priceRaw.trim().length > 0) {
    const parsed = Number(priceRaw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 0) {
      if (priceRaw.includes(".")) {
        return Math.round(parsed * 100);
      }

      return toPriceCents(parsed, minorUnit);
    }
  }

  return null;
}

function parseWooPriceHtmlCents(priceHtml: string): number | null {
  const normalized = priceHtml.trim();
  if (!normalized) {
    return null;
  }

  const insMatch = normalized.match(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i);
  if (insMatch && insMatch[1]) {
    const insPrice = parseLastCurrencyLikeValueToCents(insMatch[1]);
    if (insPrice !== null && insPrice > 0) {
      return insPrice;
    }
  }

  const fallbackPrice = parseLastCurrencyLikeValueToCents(normalized);
  if (fallbackPrice !== null && fallbackPrice > 0) {
    return fallbackPrice;
  }

  return null;
}

function parseLastCurrencyLikeValueToCents(input: string): number | null {
  const text = input.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ");
  const matches = Array.from(text.matchAll(/(\d[\d,]*(?:\.\d{1,2})?)/g));
  if (matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1]?.[1] ?? null;
  if (!last) {
    return null;
  }

  const numeric = Number(last.replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function normalizeWooPriceField(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  return null;
}

function normalizeWooProductId(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function inspectWooInvalidPricingPayload(input: {
  payload: unknown;
  target: DiscoveryTarget;
  origin: string;
}): InvalidPricingPayloadDiagnostic | null {
  if (!Array.isArray(input.payload)) {
    return null;
  }

  let productsObserved = 0;
  let productCandidates = 0;
  let candidatesWithPriceFields = 0;
  let candidatesWithPositivePrice = 0;
  const observedPriceFieldCounts = {
    price: 0,
    regular_price: 0,
    sale_price: 0
  };
  const sampledProducts: InvalidPricingProductSample[] = [];

  for (const item of input.payload) {
    if (!item || typeof item !== "object") {
      continue;
    }

    productsObserved += 1;
    const product = item as Record<string, unknown>;
    const productId = normalizeWooProductId(product.id);
    const productName = typeof product.name === "string" ? product.name.trim() || null : null;

    if (!productName && !productId) {
      continue;
    }

    productCandidates += 1;

    const pricesMap =
      product.prices && typeof product.prices === "object" ? (product.prices as Record<string, unknown>) : null;
    const minorUnit = typeof pricesMap?.currency_minor_unit === "number" ? pricesMap.currency_minor_unit : 2;

    const observedPriceFields: InvalidPricingPriceFields = {
      price: normalizeWooPriceField(pricesMap?.price ?? product.price),
      regular_price: normalizeWooPriceField(pricesMap?.regular_price ?? product.regular_price),
      sale_price: normalizeWooPriceField(pricesMap?.sale_price ?? product.sale_price)
    };

    const parsedPriceCents: InvalidPricingParsedFields = {
      price: parseWooPriceFieldCents(observedPriceFields.price, minorUnit),
      regular_price: parseWooPriceFieldCents(observedPriceFields.regular_price, minorUnit),
      sale_price: parseWooPriceFieldCents(observedPriceFields.sale_price, minorUnit)
    };

    const hasAnyPriceField =
      observedPriceFields.price !== null ||
      observedPriceFields.regular_price !== null ||
      observedPriceFields.sale_price !== null;

    if (hasAnyPriceField) {
      candidatesWithPriceFields += 1;
    }

    if (observedPriceFields.price !== null) {
      observedPriceFieldCounts.price += 1;
    }
    if (observedPriceFields.regular_price !== null) {
      observedPriceFieldCounts.regular_price += 1;
    }
    if (observedPriceFields.sale_price !== null) {
      observedPriceFieldCounts.sale_price += 1;
    }

    const hasPositivePrice =
      (parsedPriceCents.price !== null && parsedPriceCents.price > 0) ||
      (parsedPriceCents.regular_price !== null && parsedPriceCents.regular_price > 0) ||
      (parsedPriceCents.sale_price !== null && parsedPriceCents.sale_price > 0);

    if (hasPositivePrice) {
      candidatesWithPositivePrice += 1;
    }

    if (sampledProducts.length < 5) {
      sampledProducts.push({
        productId,
        productName,
        observedPriceFields,
        parsedPriceCents
      });
    }
  }

  if (productCandidates === 0 || candidatesWithPriceFields === 0 || candidatesWithPositivePrice > 0) {
    return null;
  }

  return {
    code: "INVALID_PRICING_PAYLOAD",
    source: "woocommerce_store_api",
    pageUrl: input.target.pageUrl,
    origin: input.origin,
    productsObserved,
    productCandidates,
    candidatesWithPriceFields,
    candidatesWithPositivePrice,
    observedPriceFieldCounts,
    sampledProducts
  };
}

function dedupeOffers(offers: ExtractedOffer[]): ExtractedOffer[] {
  const seen = new Set<string>();
  const deduped: ExtractedOffer[] = [];

  for (const offer of offers) {
    const key = `${offer.vendorId}::${offer.productUrl}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(offer);
  }

  return deduped;
}

function toCachedApiOffers(offers: ExtractedOffer[]): CachedApiOffer[] {
  return offers.map((offer) => ({
    productUrl: offer.productUrl,
    productName: offer.productName,
    compoundRawName: offer.compoundRawName,
    formulationRaw: offer.formulationRaw,
    sizeRaw: offer.sizeRaw,
    currencyCode: offer.currencyCode,
    listPriceCents: offer.listPriceCents,
    available: offer.available,
    rawPayload: offer.rawPayload
  }));
}

function fromCachedApiOffers(input: {
  target: DiscoveryTarget;
  offers: CachedApiOffer[];
}): ExtractedOffer[] {
  return input.offers.map((offer) => ({
    vendorPageId: input.target.vendorPageId,
    vendorId: input.target.vendorId,
    pageUrl: input.target.pageUrl,
    productUrl: offer.productUrl,
    productName: offer.productName,
    compoundRawName: offer.compoundRawName,
    formulationRaw: offer.formulationRaw,
    sizeRaw: offer.sizeRaw,
    currencyCode: offer.currencyCode,
    listPriceCents: offer.listPriceCents,
    available: offer.available,
    rawPayload: offer.rawPayload
  }));
}

function cacheUnsupportedSource(input: {
  cache?: DiscoveryCache;
  origin: string;
  source: ApiDiscoverySource;
}): void {
  if (!input.cache) {
    return;
  }

  const existing = input.cache.unsupportedSourcesByOrigin.get(input.origin);
  if (existing) {
    existing.add(input.source);
    return;
  }

  input.cache.unsupportedSourcesByOrigin.set(input.origin, new Set([input.source]));
}

function isSourceUnsupported(input: {
  cache?: DiscoveryCache;
  origin: string;
  source: ApiDiscoverySource;
}): boolean {
  const unsupported = input.cache?.unsupportedSourcesByOrigin.get(input.origin);
  return unsupported?.has(input.source) ?? false;
}

function isDefinitiveUnsupportedStatus(status: number): boolean {
  return status === 401 || status === 404 || status === 410;
}

export function offersFromWooCommercePayload(input: {
  payload: unknown;
  target: DiscoveryTarget;
}): ExtractedOffer[] {
  if (!Array.isArray(input.payload)) {
    return [];
  }

  const offers: ExtractedOffer[] = [];
  const defaultOrigin = urlOrigins(input.target)[0] ?? input.target.pageUrl;
  for (const item of input.payload) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const product = item as Record<string, unknown>;
    const productName = typeof product.name === "string" ? product.name.trim() : "";
    if (!productName) {
      continue;
    }

    const priceCents = parseWooPriceCents(product);
    if (!priceCents || priceCents <= 0) {
      continue;
    }

    const permalink = typeof product.permalink === "string" ? product.permalink : "";
    const slug = typeof product.slug === "string" ? product.slug : "";
    const fallbackUrl = slug ? `${defaultOrigin}/product/${slug}` : input.target.pageUrl;
    const rawProductUrl = permalink || fallbackUrl;
    const productUrl = toAbsoluteUrl(rawProductUrl, input.target.pageUrl) ?? input.target.pageUrl;

    const stockStatus = typeof product.stock_status === "string" ? product.stock_status : "";
    const isInStock = typeof product.is_in_stock === "boolean" ? product.is_in_stock : undefined;
    const availabilityText =
      stockStatus || (isInStock === true ? "in_stock" : isInStock === false ? "out_of_stock" : "unknown");

    offers.push(
      buildExtractedOffer({
        vendorPageId: input.target.vendorPageId,
        vendorId: input.target.vendorId,
        pageUrl: input.target.pageUrl,
        productUrl,
        productName,
        priceCents,
        availabilityText,
        payload: {
          extractor: "woocommerce_store_api"
        }
      })
    );
  }

  return dedupeOffers(offers);
}

export function offersFromShopifyPayload(input: {
  payload: unknown;
  target: DiscoveryTarget;
}): ExtractedOffer[] {
  if (!input.payload || typeof input.payload !== "object") {
    return [];
  }

  const products = (input.payload as { products?: unknown }).products;
  if (!Array.isArray(products)) {
    return [];
  }

  const origin = urlOrigins(input.target)[0] ?? "";
  const offers: ExtractedOffer[] = [];

  for (const item of products) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const product = item as Record<string, unknown>;
    const title = typeof product.title === "string" ? product.title.trim() : "";
    const handle = typeof product.handle === "string" ? product.handle : "";
    if (!title || !handle) {
      continue;
    }

    const baseProductUrl = `${origin}/products/${handle}`;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length === 0) {
      continue;
    }

    for (const rawVariant of variants) {
      if (!rawVariant || typeof rawVariant !== "object") {
        continue;
      }

      const variant = rawVariant as Record<string, unknown>;
      const rawPrice = variant.price;
      const parsedPrice = typeof rawPrice === "string" ? Number(rawPrice) : typeof rawPrice === "number" ? rawPrice : NaN;
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        continue;
      }

      const variantTitle = typeof variant.title === "string" ? variant.title.trim() : "";
      const variantSuffix = variantTitle && variantTitle.toLowerCase() !== "default title" ? ` ${variantTitle}` : "";
      const productName = `${title}${variantSuffix}`.trim();
      const variantId =
        typeof variant.id === "number" ? String(variant.id) : typeof variant.id === "string" ? variant.id : null;
      const rawProductUrl = variantId ? `${baseProductUrl}?variant=${variantId}` : baseProductUrl;
      const productUrl = toAbsoluteUrl(rawProductUrl, input.target.pageUrl) ?? input.target.pageUrl;

      const available = typeof variant.available === "boolean" ? variant.available : true;
      const availabilityText = available ? "in_stock" : "out_of_stock";

      offers.push(
        buildExtractedOffer({
          vendorPageId: input.target.vendorPageId,
          vendorId: input.target.vendorId,
          pageUrl: input.target.pageUrl,
          productUrl,
          productName,
          priceCents: Math.round(parsedPrice * 100),
          availabilityText,
          payload: {
            extractor: "shopify_products_api"
          }
        })
      );
    }
  }

  return dedupeOffers(offers);
}

async function extractFromWooCommerceApi(target: DiscoveryTarget, cache?: DiscoveryCache): Promise<SourceExtractionResult> {
  const diagnostics: DiscoveryDiagnostic[] = [];

  const origins = urlOrigins(target);
  for (const origin of origins) {
    const cached = cache?.apiResultsByOrigin.get(origin);
    if (cached?.source === "woocommerce_store_api") {
      return {
        offers: fromCachedApiOffers({
          target,
          offers: cached.offers
        }),
        origin,
        diagnostics: []
      };
    }

    if (
      isSourceUnsupported({
        cache,
        origin,
        source: "woocommerce_store_api"
      })
    ) {
      continue;
    }

    const collected: ExtractedOffer[] = [];
    let definitiveUnsupported = false;

    for (let page = 1; page <= 3; page += 1) {
      const endpoint = new URL("/wp-json/wc/store/v1/products", origin);
      endpoint.searchParams.set("per_page", "100");
      endpoint.searchParams.set("page", String(page));
      endpoint.searchParams.set("doing_wp_cron", String(Date.now()));

      const result = await fetchJson(endpoint.toString());
      if (isDefinitiveUnsupportedStatus(result.status)) {
        definitiveUnsupported = true;
        break;
      }

      const offers = offersFromWooCommercePayload({
        payload: result.payload,
        target
      });

      if (offers.length === 0) {
        const invalidPricing = inspectWooInvalidPricingPayload({
          payload: result.payload,
          target,
          origin
        });
        if (invalidPricing) {
          diagnostics.push(invalidPricing);
        }

        if (page === 1) {
          break;
        }

        break;
      }

      collected.push(...offers);

      if (page < 3 && offers.length >= 100) {
        continue;
      }

      break;
    }

    const deduped = dedupeOffers(collected);
    if (deduped.length > 0) {
      cache?.apiResultsByOrigin.set(origin, {
        source: "woocommerce_store_api",
        offers: toCachedApiOffers(deduped)
      });

      return {
        offers: deduped,
        origin,
        diagnostics: []
      };
    }

    if (definitiveUnsupported) {
      cacheUnsupportedSource({
        cache,
        origin,
        source: "woocommerce_store_api"
      });
    }
  }

  return {
    offers: [],
    origin: null,
    diagnostics
  };
}

async function extractFromShopifyApi(target: DiscoveryTarget, cache?: DiscoveryCache): Promise<SourceExtractionResult> {
  const origins = urlOrigins(target);
  for (const origin of origins) {
    const cached = cache?.apiResultsByOrigin.get(origin);
    if (cached?.source === "shopify_products_api") {
      return {
        offers: fromCachedApiOffers({
          target,
          offers: cached.offers
        }),
        origin,
        diagnostics: []
      };
    }

    if (
      isSourceUnsupported({
        cache,
        origin,
        source: "shopify_products_api"
      })
    ) {
      continue;
    }

    const endpoint = new URL("/products.json", origin);
    endpoint.searchParams.set("limit", "250");

    const result = await fetchJson(endpoint.toString());
    if (result.status >= 400) {
      if (isDefinitiveUnsupportedStatus(result.status)) {
        cacheUnsupportedSource({
          cache,
          origin,
          source: "shopify_products_api"
        });
      }
      continue;
    }

    const offers = offersFromShopifyPayload({
      payload: result.payload,
      target
    });

    if (offers.length > 0) {
      const deduped = dedupeOffers(offers);
      cache?.apiResultsByOrigin.set(origin, {
        source: "shopify_products_api",
        offers: toCachedApiOffers(deduped)
      });

      return {
        offers: deduped,
        origin,
        diagnostics: []
      };
    }
  }

  return {
    offers: [],
    origin: null,
    diagnostics: []
  };
}

async function scrapeHtmlWithFirecrawl(pageUrl: string): Promise<string | null> {
  if (!env.FIRECRAWL_API_KEY) {
    return null;
  }

  const endpoint = `${env.FIRECRAWL_API_BASE_URL.replace(/\/$/, "")}/scrape`;
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: pageUrl,
        formats: ["html"],
        onlyMainContent: false,
        timeout: 45_000,
        proxy: "auto",
        headers: {
          "user-agent": env.SCRAPER_USER_AGENT
        }
      })
    },
    60_000
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const html = (data as { html?: unknown }).html;
  if (typeof html === "string" && html.trim().length > 0) {
    return html;
  }

  return null;
}

export async function discoverOffers(input: {
  target: DiscoveryTarget;
  fetchPageHtml: (pageUrl: string) => Promise<string>;
  cache?: DiscoveryCache;
}): Promise<DiscoveryResult> {
  const attempts: DiscoveryAttempt[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];

  const wooStartedAt = Date.now();
  try {
    const wooResult = await extractFromWooCommerceApi(input.target, input.cache);
    diagnostics.push(...wooResult.diagnostics);
    const wooOffers = wooResult.offers;
    attempts.push({
      source: "woocommerce_store_api",
      success: wooOffers.length > 0,
      offers: wooOffers.length,
      durationMs: Date.now() - wooStartedAt
    });
    if (wooOffers.length > 0) {
      return {
        offers: wooOffers,
        source: "woocommerce_store_api",
        origin: wooResult.origin,
        attempts,
        diagnostics
      };
    }
  } catch (error) {
    attempts.push({
      source: "woocommerce_store_api",
      success: false,
      offers: 0,
      durationMs: Date.now() - wooStartedAt,
      error: formatDiscoveryError(error)
    });
  }

  const shopifyStartedAt = Date.now();
  try {
    const shopifyResult = await extractFromShopifyApi(input.target, input.cache);
    const shopifyOffers = shopifyResult.offers;
    attempts.push({
      source: "shopify_products_api",
      success: shopifyOffers.length > 0,
      offers: shopifyOffers.length,
      durationMs: Date.now() - shopifyStartedAt
    });
    if (shopifyOffers.length > 0) {
      return {
        offers: shopifyOffers,
        source: "shopify_products_api",
        origin: shopifyResult.origin,
        attempts,
        diagnostics
      };
    }
  } catch (error) {
    attempts.push({
      source: "shopify_products_api",
      success: false,
      offers: 0,
      durationMs: Date.now() - shopifyStartedAt,
      error: formatDiscoveryError(error)
    });
  }

  const htmlStartedAt = Date.now();
  try {
    const htmlCandidateUrls = buildHtmlFallbackUrls(input.target);
    let htmlOffers: ExtractedOffer[] = [];
    const htmlErrors: string[] = [];

    for (const candidateUrl of htmlCandidateUrls) {
      const html = await input.fetchPageHtml(candidateUrl);
      if (!html.trim()) {
        htmlErrors.push(`${candidateUrl}:empty_html`);
        continue;
      }

      const extracted = extractOffersFromHtml({
        html,
        vendorPageId: input.target.vendorPageId,
        vendorId: input.target.vendorId,
        pageUrl: candidateUrl
      });

      if (extracted.length > htmlOffers.length) {
        htmlOffers = extracted;
      }

      if (extracted.length > 0) {
        break;
      }
    }

    const htmlError = htmlOffers.length === 0 && htmlErrors.length > 0 ? htmlErrors.join(" | ").slice(0, 240) : undefined;
    attempts.push({
      source: "html",
      success: htmlOffers.length > 0,
      offers: htmlOffers.length,
      durationMs: Date.now() - htmlStartedAt,
      error: htmlError
    });
    if (htmlOffers.length > 0) {
      return {
        offers: htmlOffers,
        source: "html",
        origin: null,
        attempts,
        diagnostics
      };
    }
  } catch (error) {
    attempts.push({
      source: "html",
      success: false,
      offers: 0,
      durationMs: Date.now() - htmlStartedAt,
      error: formatDiscoveryError(error)
    });
  }

  if (env.FIRECRAWL_API_KEY) {
    const firecrawlStartedAt = Date.now();
    try {
      const firecrawlHtml = await scrapeHtmlWithFirecrawl(input.target.pageUrl);
      if (!firecrawlHtml) {
        attempts.push({
          source: "firecrawl",
          success: false,
          offers: 0,
          durationMs: Date.now() - firecrawlStartedAt
        });
      } else {
        const firecrawlOffers = extractOffersFromHtml({
          html: firecrawlHtml,
          vendorPageId: input.target.vendorPageId,
          vendorId: input.target.vendorId,
          pageUrl: input.target.pageUrl
        });
        attempts.push({
          source: "firecrawl",
          success: firecrawlOffers.length > 0,
          offers: firecrawlOffers.length,
          durationMs: Date.now() - firecrawlStartedAt
        });
        if (firecrawlOffers.length > 0) {
          return {
            offers: firecrawlOffers,
            source: "firecrawl",
            origin: null,
            attempts,
            diagnostics
          };
        }
      }
    } catch (error) {
      attempts.push({
        source: "firecrawl",
        success: false,
        offers: 0,
        durationMs: Date.now() - firecrawlStartedAt,
        error: formatDiscoveryError(error)
      });
    }
  }

  return {
    offers: [],
    source: null,
    origin: null,
    attempts,
    diagnostics
  };
}
