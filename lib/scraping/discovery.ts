import { env } from "@/lib/env";
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
  error?: string;
}

export interface DiscoveryResult {
  offers: ExtractedOffer[];
  source: string | null;
  attempts: DiscoveryAttempt[];
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

async function fetchJson(url: string): Promise<FetchJsonResult> {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent": env.SCRAPER_USER_AGENT,
        accept: "application/json,text/plain,*/*"
      },
      cache: "no-store"
    },
    30_000
  );

  const text = await response.text();
  if (!text.trim()) {
    return { status: response.status, payload: null };
  }

  try {
    return {
      status: response.status,
      payload: JSON.parse(text)
    };
  } catch {
    return {
      status: response.status,
      payload: null
    };
  }
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
    return null;
  }

  const pricesMap = prices as Record<string, unknown>;
  const minorUnit = typeof pricesMap.currency_minor_unit === "number" ? pricesMap.currency_minor_unit : 2;
  const priceRaw = pricesMap.price ?? pricesMap.regular_price;

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

async function extractFromWooCommerceApi(target: DiscoveryTarget): Promise<ExtractedOffer[]> {
  const origins = urlOrigins(target);
  for (const origin of origins) {
    const collected: ExtractedOffer[] = [];

    for (let page = 1; page <= 3; page += 1) {
      const endpoint = new URL("/wp-json/wc/store/v1/products", origin);
      endpoint.searchParams.set("per_page", "100");
      endpoint.searchParams.set("page", String(page));

      const result = await fetchJson(endpoint.toString());
      if (result.status === 404) {
        break;
      }

      const offers = offersFromWooCommercePayload({
        payload: result.payload,
        target
      });

      if (offers.length === 0) {
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
      return deduped;
    }
  }

  return [];
}

async function extractFromShopifyApi(target: DiscoveryTarget): Promise<ExtractedOffer[]> {
  const origins = urlOrigins(target);
  for (const origin of origins) {
    const endpoint = new URL("/products.json", origin);
    endpoint.searchParams.set("limit", "250");

    const result = await fetchJson(endpoint.toString());
    if (result.status >= 400) {
      continue;
    }

    const offers = offersFromShopifyPayload({
      payload: result.payload,
      target
    });

    if (offers.length > 0) {
      return offers;
    }
  }

  return [];
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
}): Promise<DiscoveryResult> {
  const attempts: DiscoveryAttempt[] = [];

  try {
    const wooOffers = await extractFromWooCommerceApi(input.target);
    attempts.push({
      source: "woocommerce_store_api",
      success: wooOffers.length > 0,
      offers: wooOffers.length
    });
    if (wooOffers.length > 0) {
      return {
        offers: wooOffers,
        source: "woocommerce_store_api",
        attempts
      };
    }
  } catch (error) {
    attempts.push({
      source: "woocommerce_store_api",
      success: false,
      offers: 0,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  try {
    const shopifyOffers = await extractFromShopifyApi(input.target);
    attempts.push({
      source: "shopify_products_api",
      success: shopifyOffers.length > 0,
      offers: shopifyOffers.length
    });
    if (shopifyOffers.length > 0) {
      return {
        offers: shopifyOffers,
        source: "shopify_products_api",
        attempts
      };
    }
  } catch (error) {
    attempts.push({
      source: "shopify_products_api",
      success: false,
      offers: 0,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  try {
    const html = await input.fetchPageHtml(input.target.pageUrl);
    const htmlOffers = extractOffersFromHtml({
      html,
      vendorPageId: input.target.vendorPageId,
      vendorId: input.target.vendorId,
      pageUrl: input.target.pageUrl
    });
    attempts.push({
      source: "html",
      success: htmlOffers.length > 0,
      offers: htmlOffers.length
    });
    if (htmlOffers.length > 0) {
      return {
        offers: htmlOffers,
        source: "html",
        attempts
      };
    }
  } catch (error) {
    attempts.push({
      source: "html",
      success: false,
      offers: 0,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  if (env.FIRECRAWL_API_KEY) {
    try {
      const firecrawlHtml = await scrapeHtmlWithFirecrawl(input.target.pageUrl);
      if (!firecrawlHtml) {
        attempts.push({
          source: "firecrawl",
          success: false,
          offers: 0
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
          offers: firecrawlOffers.length
        });
        if (firecrawlOffers.length > 0) {
          return {
            offers: firecrawlOffers,
            source: "firecrawl",
            attempts
          };
        }
      }
    } catch (error) {
      attempts.push({
        source: "firecrawl",
        success: false,
        offers: 0,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return {
    offers: [],
    source: null,
    attempts
  };
}
