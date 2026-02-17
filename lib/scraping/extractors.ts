import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { buildExtractedOffer, extractPriceCents } from "@/lib/scraping/normalize";
import type { ExtractedOffer } from "@/lib/types";

interface ExtractContext {
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
}

interface JsonMap {
  [key: string]: unknown;
}

interface InertiaVariantLike {
  id?: string | number;
  amount?: string | number;
  unit?: string;
  price?: string | number;
  discounted_price?: string | number;
  sold_out?: boolean | number;
  num_available?: number;
  archived?: boolean | number;
}

interface InertiaProductLike {
  name?: string;
  slug?: string;
  variants?: unknown;
  archived?: boolean | number;
}

interface WixWarmupProductLike {
  name?: string;
  price?: string | number;
  formattedPrice?: string;
  urlPart?: string;
  isInStock?: boolean;
  productType?: string;
  inventory?: {
    status?: string;
  };
}

const EXCLUDED_PATH_PATTERNS = [/\/cart\b/, /\/checkout\b/, /\/my-account\b/, /\/account\b/, /\/wishlist\b/, /\/search\b/, /\/blog\b/];
const REQUIRED_PATH_PATTERNS = [
  /\/product\//,
  /\/products\//,
  /\/product-page\//,
  /\/product-category\//,
  /\/shop\/?/,
  /\/\d+-[a-z0-9-]+\.html(?:$|[?#])/i
];
const EXCLUDED_QUERY_KEYS = ["add-to-cart", "add_to_cart", "add-to-wishlist", "add_to_wishlist"];

function isLikelyProductUrl(urlValue: string): boolean {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }

  const normalizedPath = url.pathname.toLowerCase();
  if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return false;
  }

  for (const key of EXCLUDED_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      return false;
    }
  }

  return REQUIRED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

function toAbsoluteUrl(baseUrl: string, href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function cleanupText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function candidateSelectors(): string[] {
  return [
    "li.ajax_block_product",
    ".ajax_block_product",
    ".product-container",
    ".product-miniature",
    "article",
    "li.product",
    ".product",
    ".product-card",
    ".card",
    ".grid-item",
    ".collection-product",
    ".item",
    "[data-product]"
  ];
}

function pickProductName($root: cheerio.CheerioAPI, node: AnyNode): string | null {
  const el = $root(node);
  const heading =
    cleanupText(
      el.find("h1, h2, h3, h4, h5, .product-title, .product-name, .title, [data-product-title]").first().text()
    ) ||
    cleanupText(el.find("a").first().text()) ||
    cleanupText(el.text()).slice(0, 140);

  if (!heading) {
    return null;
  }

  return heading;
}

function pickProductHref($root: cheerio.CheerioAPI, node: AnyNode, pageUrl: string): string | null {
  const el = $root(node);
  const prioritizedHrefCandidates = el
    .find("a.product-name[href], a.product_img_link[href], a[itemprop='url'][href], a.product-image[href]")
    .toArray()
    .map((anchor) => $root(anchor).attr("href"))
    .filter((href): href is string => Boolean(href));
  const hrefCandidates = [
    ...prioritizedHrefCandidates,
    ...el
      .find("a[href]")
      .toArray()
      .map((anchor) => $root(anchor).attr("href"))
      .filter((href): href is string => Boolean(href))
  ];

  if (el.closest("a[href]").length > 0) {
    const closestHref = el.closest("a[href]").attr("href");
    if (closestHref) {
      hrefCandidates.push(closestHref);
    }
  }

  const selfHref = el.attr("href");
  if (selfHref) {
    hrefCandidates.push(selfHref);
  }

  for (const href of hrefCandidates) {
    const absolute = toAbsoluteUrl(pageUrl, href);
    if (absolute && isLikelyProductUrl(absolute)) {
      return absolute;
    }
  }

  const href = hrefCandidates[0];
  if (!href) {
    return null;
  }

  return toAbsoluteUrl(pageUrl, href);
}

function pickPriceFromText(rawText: string): number | null {
  return extractPriceCents(rawText);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function parseJsonLd(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    return [JSON.parse(trimmed)];
  } catch {
    // Some sites inject control chars in JSON-LD script blocks.
    const sanitized = trimmed.replace(/\u0000/g, "").trim();
    if (!sanitized) {
      return [];
    }

    try {
      return [JSON.parse(sanitized)];
    } catch {
      return [];
    }
  }
}

function hasType(node: JsonMap, expected: string): boolean {
  const rawType = node["@type"];
  if (typeof rawType === "string") {
    return rawType.toLowerCase() === expected.toLowerCase();
  }

  if (Array.isArray(rawType)) {
    return rawType.some((value) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase());
  }

  return false;
}

function collectProductNodes(value: unknown, out: JsonMap[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectProductNodes(item, out);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const node = value as JsonMap;
  if (hasType(node, "Product")) {
    out.push(node);
  }

  for (const nested of Object.values(node)) {
    if (typeof nested === "object" && nested !== null) {
      collectProductNodes(nested, out);
    }
  }
}

function readSchemaPriceCents(product: JsonMap, offer: JsonMap): number | null {
  const directPrice = offer.price ?? product.price;
  if (typeof directPrice === "number") {
    return Math.round(directPrice * 100);
  }

  if (typeof directPrice === "string") {
    const parsed = Number(directPrice.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100);
    }
  }

  const priceSpec = offer.priceSpecification;
  if (priceSpec && typeof priceSpec === "object") {
    const specPrice = (priceSpec as JsonMap).price;
    if (typeof specPrice === "number") {
      return Math.round(specPrice * 100);
    }

    if (typeof specPrice === "string") {
      const parsed = Number(specPrice.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed * 100);
      }
    }
  }

  return null;
}

function parsePriceCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

function parseInertiaDataPage(html: string): JsonMap | null {
  const $ = cheerio.load(html);
  const raw = $("#app").attr("data-page");
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as JsonMap) : null;
  } catch {
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&");

    try {
      const parsed = JSON.parse(decoded) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as JsonMap) : null;
    } catch {
      return null;
    }
  }
}

function parseWixWarmupData(html: string): JsonMap | null {
  const $ = cheerio.load(html);
  const raw = $("#wix-warmup-data").text();
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as JsonMap) : null;
  } catch {
    return null;
  }
}

function collectWixWarmupProducts(value: unknown, out: WixWarmupProductLike[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectWixWarmupProducts(item, out);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const node = value as {
    productsWithMetaData?: {
      list?: unknown;
    };
  };

  const list = node.productsWithMetaData?.list;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item && typeof item === "object") {
        out.push(item as WixWarmupProductLike);
      }
    }
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") {
      collectWixWarmupProducts(nested, out);
    }
  }
}

function extractFromWixWarmupData(html: string, context: ExtractContext): ExtractedOffer[] {
  const parsed = parseWixWarmupData(html);
  if (!parsed) {
    return [];
  }

  const products: WixWarmupProductLike[] = [];
  collectWixWarmupProducts(parsed, products);
  if (products.length === 0) {
    return [];
  }

  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  for (const product of products) {
    if (product.productType && product.productType.toLowerCase() !== "physical") {
      continue;
    }

    const productName = cleanupText(typeof product.name === "string" ? product.name : "");
    if (!productName) {
      continue;
    }

    const priceCents = parsePriceCents(product.price ?? product.formattedPrice);
    if (!priceCents || priceCents <= 0) {
      continue;
    }

    const urlPart = typeof product.urlPart === "string" ? product.urlPart.trim() : "";
    const rawProductUrl = urlPart ? `/product-page/${urlPart}` : context.pageUrl;
    const productUrl = toAbsoluteUrl(context.pageUrl, rawProductUrl) ?? context.pageUrl;
    if (!isLikelyProductUrl(productUrl)) {
      continue;
    }

    const inventoryStatus = typeof product.inventory?.status === "string" ? product.inventory.status.toLowerCase() : "";
    const isInStock =
      typeof product.isInStock === "boolean" ? product.isInStock : inventoryStatus ? inventoryStatus !== "out_of_stock" : true;

    const offer = buildExtractedOffer({
      vendorPageId: context.vendorPageId,
      vendorId: context.vendorId,
      pageUrl: context.pageUrl,
      productUrl,
      productName,
      priceCents,
      availabilityText: isInStock ? "in_stock" : "out_of_stock",
      payload: {
        extractor: "wix_warmup_data"
      }
    });

    pushUnique(offers, offer, seen);
  }

  return offers;
}

function formatVariantAmount(amount: string | number | undefined, unit: string | undefined): string | null {
  if (amount === undefined || amount === null || !unit || !unit.trim()) {
    return null;
  }

  const amountValue = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return null;
  }

  const normalizedAmount = Number.isInteger(amountValue) ? String(amountValue) : String(amountValue).replace(/\.?0+$/, "");
  const normalizedUnit = unit.trim().toLowerCase();

  return `${normalizedAmount}${normalizedUnit}`;
}

function extractFromInertiaDataPage(html: string, context: ExtractContext): ExtractedOffer[] {
  const parsed = parseInertiaDataPage(html);
  if (!parsed) {
    return [];
  }

  const props = parsed.props;
  if (!props || typeof props !== "object") {
    return [];
  }

  const products = (props as { products?: unknown }).products;
  if (!Array.isArray(products)) {
    return [];
  }

  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  for (const rawProduct of products) {
    if (!rawProduct || typeof rawProduct !== "object") {
      continue;
    }

    const product = rawProduct as InertiaProductLike;
    if (product.archived === true || product.archived === 1) {
      continue;
    }

    const productName = cleanupText(typeof product.name === "string" ? product.name : "");
    if (!productName) {
      continue;
    }

    const basePath = typeof product.slug === "string" && product.slug.trim() ? `/products/${product.slug.trim()}` : "";
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length === 0) {
      continue;
    }

    for (const rawVariant of variants) {
      if (!rawVariant || typeof rawVariant !== "object") {
        continue;
      }

      const variant = rawVariant as InertiaVariantLike;
      if (variant.archived === true || variant.archived === 1) {
        continue;
      }

      const priceCents = parsePriceCents(variant.discounted_price ?? variant.price);
      if (!priceCents || priceCents <= 0) {
        continue;
      }

      const amount = formatVariantAmount(variant.amount, variant.unit);
      const fullName = amount ? `${productName} ${amount}` : productName;

      const variantId = typeof variant.id === "string" || typeof variant.id === "number" ? String(variant.id) : "";
      const rawProductUrl = variantId && basePath ? `${basePath}?variant=${variantId}` : basePath || context.pageUrl;
      const productUrl = toAbsoluteUrl(context.pageUrl, rawProductUrl) ?? context.pageUrl;
      if (!isLikelyProductUrl(productUrl)) {
        continue;
      }

      const soldOut = variant.sold_out === true || variant.sold_out === 1;
      const hasInventory = typeof variant.num_available === "number" ? variant.num_available > 0 : true;
      const available = !soldOut && hasInventory;

      const offer = buildExtractedOffer({
        vendorPageId: context.vendorPageId,
        vendorId: context.vendorId,
        pageUrl: context.pageUrl,
        productUrl,
        productName: fullName,
        priceCents,
        availabilityText: available ? "in_stock" : "out_of_stock",
        payload: {
          extractor: "inertia_data_page"
        }
      });

      pushUnique(offers, offer, seen);
    }
  }

  return offers;
}

function extractFromJsonLd(html: string, context: ExtractContext): ExtractedOffer[] {
  const $ = cheerio.load(html);
  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text();
    for (const parsed of parseJsonLd(raw)) {
      const products: JsonMap[] = [];
      collectProductNodes(parsed, products);

      for (const product of products) {
        const name = cleanupText(typeof product.name === "string" ? product.name : "");
        if (!name) {
          continue;
        }

        const productUrl =
          toAbsoluteUrl(context.pageUrl, typeof product.url === "string" ? product.url : undefined) ?? context.pageUrl;
        if (productUrl && !isLikelyProductUrl(productUrl)) {
          continue;
        }

        const schemaOffers = asArray<unknown>(product.offers);
        const offerNodes = schemaOffers.length > 0 ? schemaOffers : [product];
        for (const offerNode of offerNodes) {
          if (!offerNode || typeof offerNode !== "object") {
            continue;
          }

          const offer = offerNode as JsonMap;
          const priceCents = readSchemaPriceCents(product, offer);
          if (!priceCents || priceCents <= 0) {
            continue;
          }

          const offerUrl =
            toAbsoluteUrl(
              context.pageUrl,
              typeof offer.url === "string" ? offer.url : typeof product.url === "string" ? product.url : undefined
            ) ?? context.pageUrl;
          if (offerUrl && !isLikelyProductUrl(offerUrl)) {
            continue;
          }

          const availabilityText = cleanupText(
            `${typeof offer.availability === "string" ? offer.availability : ""} ${typeof product.availability === "string" ? product.availability : ""}`
          );

          const extracted = buildExtractedOffer({
            vendorPageId: context.vendorPageId,
            vendorId: context.vendorId,
            pageUrl: context.pageUrl,
            productUrl: offerUrl,
            productName: name,
            priceCents,
            availabilityText,
            payload: {
              extractor: "json_ld"
            }
          });

          pushUnique(offers, extracted, seen);
        }
      }
    }
  });

  return offers;
}

function pushUnique(offers: ExtractedOffer[], offer: ExtractedOffer, seen: Set<string>): void {
  const key = `${offer.vendorId}::${offer.productUrl}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  offers.push(offer);
}

function extractFromCards(html: string, context: ExtractContext): ExtractedOffer[] {
  const $ = cheerio.load(html);
  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  for (const selector of candidateSelectors()) {
    const nodes = $(selector);
    if (nodes.length === 0) {
      continue;
    }

    nodes.each((_, node) => {
      const name = pickProductName($, node);
      if (!name || name.length < 3) {
        return;
      }

      const text = cleanupText($(node).text());
      const priceCents = pickPriceFromText(text);
      if (!priceCents || priceCents <= 0) {
        return;
      }

      const productUrl = pickProductHref($, node, context.pageUrl) ?? context.pageUrl;

      const offer = buildExtractedOffer({
        vendorPageId: context.vendorPageId,
        vendorId: context.vendorId,
        pageUrl: context.pageUrl,
        productUrl,
        productName: name,
        priceCents,
        availabilityText: text,
        payload: {
          extractor: "card_selector",
          selector
        }
      });

      pushUnique(offers, offer, seen);
    });

    if (offers.length >= 120) {
      break;
    }
  }

  return offers;
}

function extractFromAnchors(html: string, context: ExtractContext): ExtractedOffer[] {
  const $ = cheerio.load(html);
  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    const productUrl = toAbsoluteUrl(context.pageUrl, href);
    if (!productUrl || !isLikelyProductUrl(productUrl)) {
      return;
    }

    const anchorText = cleanupText($(node).text());
    const surroundingText = cleanupText($(node).parent().text());
    const combined = `${anchorText} ${surroundingText}`.trim();

    const priceCents = pickPriceFromText(combined);
    if (!priceCents || priceCents <= 0) {
      return;
    }

    const productName = anchorText || surroundingText.slice(0, 120);
    if (!productName || productName.length < 3) {
      return;
    }

    const offer = buildExtractedOffer({
      vendorPageId: context.vendorPageId,
      vendorId: context.vendorId,
      pageUrl: context.pageUrl,
      productUrl,
      productName,
      priceCents,
      availabilityText: combined,
      payload: {
        extractor: "anchor_fallback"
      }
    });

    pushUnique(offers, offer, seen);
  });

  return offers;
}

export function extractOffersFromHtml(input: {
  html: string;
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
}): ExtractedOffer[] {
  const context: ExtractContext = {
    vendorPageId: input.vendorPageId,
    vendorId: input.vendorId,
    pageUrl: input.pageUrl
  };

  const inertia = extractFromInertiaDataPage(input.html, context);
  if (inertia.length >= 3) {
    return inertia;
  }

  const wixWarmup = extractFromWixWarmupData(input.html, context);
  const structured = extractFromJsonLd(input.html, context);
  const primary = extractFromCards(input.html, context);
  const merged = [...inertia];
  const seen = new Set(merged.map((item) => `${item.vendorId}::${item.productUrl}`));

  for (const offer of wixWarmup) {
    pushUnique(merged, offer, seen);
  }

  if (merged.length >= 3) {
    return merged;
  }

  for (const offer of structured) {
    pushUnique(merged, offer, seen);
  }

  if (merged.length >= 3) {
    return merged;
  }

  for (const offer of primary) {
    pushUnique(merged, offer, seen);
  }

  if (merged.length >= 3) {
    return merged;
  }

  const fallback = extractFromAnchors(input.html, context);
  for (const offer of fallback) {
    pushUnique(merged, offer, seen);
  }

  return merged;
}
