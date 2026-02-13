import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { buildExtractedOffer, extractPriceCents } from "@/lib/scraping/normalize";
import type { ExtractedOffer } from "@/lib/types";

interface ExtractContext {
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
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
  const href =
    el.find("a[href]").first().attr("href") ||
    el.closest("a[href]").attr("href") ||
    el.attr("href");

  return toAbsoluteUrl(pageUrl, href);
}

function pickPriceFromText(rawText: string): number | null {
  return extractPriceCents(rawText);
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

    if (offers.length >= 10) {
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
    if (!productUrl) {
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

  const primary = extractFromCards(input.html, context);
  if (primary.length >= 3) {
    return primary;
  }

  const fallback = extractFromAnchors(input.html, context);
  const merged = [...primary];
  const seen = new Set(merged.map((item) => `${item.vendorId}::${item.productUrl}`));

  for (const offer of fallback) {
    pushUnique(merged, offer, seen);
  }

  return merged;
}
