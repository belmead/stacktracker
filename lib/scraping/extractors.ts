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

const EXCLUDED_PATH_PATTERNS = [/\/cart\b/, /\/checkout\b/, /\/my-account\b/, /\/account\b/, /\/wishlist\b/, /\/search\b/, /\/blog\b/];
const REQUIRED_PATH_PATTERNS = [/\/product\//, /\/products\//, /\/product-category\//, /\/shop\/?/];
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
    cleanupText(el.find("h1, h2, h3, h4, .product-title, .title, [data-product-title]").first().text()) ||
    cleanupText(el.find("a").first().text()) ||
    cleanupText(el.text()).slice(0, 140);

  if (!heading) {
    return null;
  }

  return heading;
}

function pickProductHref($root: cheerio.CheerioAPI, node: AnyNode, pageUrl: string): string | null {
  const el = $root(node);
  const hrefCandidates = el
    .find("a[href]")
    .toArray()
    .map((anchor) => $root(anchor).attr("href"))
    .filter((href): href is string => Boolean(href));

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

  const structured = extractFromJsonLd(input.html, context);
  if (structured.length >= 3) {
    return structured;
  }

  const primary = extractFromCards(input.html, context);
  const merged = [...structured];
  const seen = new Set(merged.map((item) => `${item.vendorId}::${item.productUrl}`));

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
