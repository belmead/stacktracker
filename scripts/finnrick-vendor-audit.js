#!/usr/bin/env node

/*
  Finnrick vendor audit:
  - Pull all Finnrick vendors
  - Exclude a user-provided set (already audited vendors)
  - Skip likely China/wholesale-style names (heuristic)
  - Discover vendor websites via DuckDuckGo
  - Verify direct online sales signals
  - Detect commerce platform + probe common public APIs
  - Write detailed JSON + concise CSV outputs to /tmp
*/

const fs = require("node:fs/promises");
const { URL } = require("node:url");
const cheerio = require("cheerio");

const FINNRICK_VENDORS_URL = "https://www.finnrick.com/vendors";

const EXCLUDED_VENDOR_NAMES = [
  "Paradigm Peptide",
  "Peptide Partners",
  "Polaris Peptides",
  "NextechLabs",
  "Skye Peptides",
  "Peptide Sciences",
  "Oupeptide",
  "Paramount Peptides",
  "Astro Peptides",
  "Amino Amigos",
  "Trusted Peptide",
  "Risynth Bio",
  "Orbitrex Peptides",
  "NUPEPS Peptides",
  "AdvancedResearchPep",
  "NextGen Peptides",
  "OmegAmino",
  "Chimera Peptides",
  "Peptide Technologies"
];

const CHINA_WHOLESALE_NAME_PATTERNS = [
  /\bshanghai\b/i,
  /\bshaanxi\b/i,
  /\bshandong\b/i,
  /\bnantong\b/i,
  /\bqingdao\b/i,
  /\bquingdao\b/i,
  /\bxian\b/i,
  /\bhunan\b/i,
  /\byongkang\b/i,
  /\bzhengzhou\b/i,
  /\bguangzhou\b/i,
  /\bguangdong\b/i,
  /\bningbo\b/i,
  /\bnanjing\b/i,
  /\bwuhan\b/i,
  /\bhybio\b/i,
  /\bzztai\b/i,
  /\bmedichem\b/i,
  /\btrading co\b/i,
  /\bchemical\b/i,
  /\btechnology center\b/i,
  /\bbiotech co\b/i,
  /\blimited\b/i
];

const SEARCH_RESULT_BLOCKLIST = new Set([
  "duckduckgo.com",
  "html.duckduckgo.com",
  "lite.duckduckgo.com",
  "bing.com",
  "www.bing.com",
  "finnrick.com",
  "www.finnrick.com",
  "reddit.com",
  "www.reddit.com",
  "youtube.com",
  "www.youtube.com",
  "x.com",
  "twitter.com",
  "www.twitter.com",
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
  "tiktok.com",
  "www.tiktok.com",
  "trustpilot.com",
  "www.trustpilot.com",
  "wikipedia.org",
  "www.wikipedia.org",
  "microsoft.com",
  "www.microsoft.com",
  "support.microsoft.com",
  "netflix.com",
  "www.netflix.com",
  "cambridge.org",
  "dictionary.cambridge.org",
  "theknot.com",
  "www.theknot.com"
]);

const KNOWN_ALREADY_GIVEN_HOSTS = new Set([
  "www.paradigm-peptide.com",
  "peptide.partners",
  "polarispeptides.com",
  "nextechlaboratories.com",
  "skyepeptides.com",
  "www.peptidesciences.com",
  "oupeptide.com",
  "paramountpeptides.com",
  "astropeptidesusa.com",
  "aminoamigos.com",
  "trustedpeptide.net",
  "risynthlab.com",
  "orbitrexpeptide.is",
  "nupeps.com",
  "advancedresearchpep.com",
  "ngpeptide.com",
  "omegamino.net",
  "chimeraorder.lovable.app",
  "peptidetech.co"
]);

const GENERIC_VENDOR_TOKENS = new Set([
  "peptide",
  "peptides",
  "research",
  "bio",
  "biotech",
  "health",
  "lab",
  "labs",
  "science",
  "co",
  "company",
  "official"
]);

function normalizeName(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const accept = opts.accept ?? "text/html,application/xhtml+xml";
  const userAgent = opts.userAgent ?? "Mozilla/5.0 (compatible; StackTrackerVendorAudit/1.0)";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept
      }
    });

    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      text
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      headers: {},
      text: "",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBingTrackingLink(url) {
  const encoded = url.searchParams.get("u");
  if (!encoded) {
    return null;
  }

  const payload = encoded.replace(/^a1/, "");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    if (/^https?:\/\//i.test(decoded)) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

function unwrapSearchLink(href) {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, "https://www.bing.com");
    if (url.hostname.includes("duckduckgo.com") && url.pathname.startsWith("/l/")) {
      const target = url.searchParams.get("uddg");
      if (target) {
        return decodeURIComponent(target);
      }
    }

    if (url.hostname.includes("bing.com") && url.pathname.startsWith("/ck/a")) {
      const decoded = decodeBingTrackingLink(url);
      if (decoded) {
        return decoded;
      }
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function hostnameOf(urlValue) {
  try {
    return new URL(urlValue).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isBlockedSearchHost(hostname) {
  if (!hostname) {
    return true;
  }

  if (SEARCH_RESULT_BLOCKLIST.has(hostname)) {
    return true;
  }

  for (const blocked of SEARCH_RESULT_BLOCKLIST) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return true;
    }
  }

  return false;
}

function tokenized(value) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function compactAlphaNum(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function scoreCandidateUrl(vendorName, candidateUrl) {
  let score = 0;
  const host = hostnameOf(candidateUrl);
  if (!host) {
    return -100;
  }

  const tokens = tokenized(vendorName);
  const hostPlain = host.replace(/^www\./, "");
  const hostCompact = compactAlphaNum(hostPlain);

  if (KNOWN_ALREADY_GIVEN_HOSTS.has(hostPlain) || KNOWN_ALREADY_GIVEN_HOSTS.has(host)) {
    score -= 8;
  }

  for (const token of tokens) {
    if (token.length < 3) {
      continue;
    }

    if (hostPlain.includes(token)) {
      score += 3;
    }

    if (hostCompact.includes(token)) {
      score += 2;
    }
  }

  if (hostPlain.includes("peptide")) {
    score += 2;
  }

  if (hostPlain.endsWith(".com") || hostPlain.endsWith(".net") || hostPlain.endsWith(".org")) {
    score += 1;
  }

  if (hostPlain.includes("shop")) {
    score += 1;
  }

  if (hostPlain.includes("duckduckgo")) {
    score -= 20;
  }

  return score;
}

function likelyChinaWholesaleByName(vendorName) {
  for (const pattern of CHINA_WHOLESALE_NAME_PATTERNS) {
    if (pattern.test(vendorName)) {
      return true;
    }
  }

  const name = normalizeName(vendorName);
  const hasBusinessSuffix = /\b(co|ltd|limited)\b/.test(name);
  const hasSupplierTerm = /\b(chemical|technology|trading|biotech)\b/.test(name);
  if (hasBusinessSuffix && hasSupplierTerm) {
    return true;
  }

  return false;
}

function overlapScore(vendorName, candidateText) {
  const vendorTokens = tokenized(vendorName).filter((token) => token.length >= 4);
  if (vendorTokens.length === 0) {
    return 0;
  }

  const haystack = normalizeName(candidateText || "");
  let hits = 0;
  for (const token of vendorTokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }

  return hits / vendorTokens.length;
}

function extractIdentityText(html) {
  const $ = cheerio.load(html || "");
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const h2 = $("h2").first().text().replace(/\s+/g, " ").trim();
  return [title, h1, h2].filter(Boolean).join(" | ");
}

function hasUniqueTokenMatch(vendorName, candidateText) {
  const tokens = tokenized(vendorName).filter(
    (token) => token.length >= 4 && !GENERIC_VENDOR_TOKENS.has(token) && !/^\d+$/.test(token)
  );
  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeName(candidateText || "");
  return tokens.some((token) => haystack.includes(token));
}

function detectPlatform(html, finalUrl, headers) {
  const body = (html || "").toLowerCase();
  const hs = Object.entries(headers || {})
    .map(([k, v]) => `${k}:${v}`.toLowerCase())
    .join("\n");
  const final = (finalUrl || "").toLowerCase();

  if (/cdn\.shopify\.com|shopify\.theme|myshopify\.com/.test(body) || /x-shopify/.test(hs)) {
    return "Shopify";
  }

  if (/wp-content|wp-includes|wp-json/.test(body)) {
    if (/woocommerce|wc-cart-fragments|wp-content\/plugins\/woocommerce|add_to_cart_button|wc-ajax/.test(body)) {
      return "WooCommerce (WordPress)";
    }
    return "WordPress";
  }

  if (/wixstatic\.com|wix\.com|parastorage\.com/.test(body)) {
    return "Wix";
  }

  if (/bigcommerce|cdn\d+\.bigcommerce\.com|stencil-utils/.test(body) || /x-bc-/.test(hs)) {
    return "BigCommerce";
  }

  if (/lovable\.app/.test(final) || /lovable/.test(body)) {
    return "Lovable app";
  }

  if (/squarespace|static\.squarespace\.com/.test(body)) {
    return "Squarespace";
  }

  if (/webflow/.test(body) || /webflow\.io/.test(final)) {
    return "Webflow";
  }

  return "Custom/Unknown";
}

function saleSignals(html) {
  const lower = (html || "").toLowerCase();
  const text = lower.replace(/\s+/g, " ");

  const hasDollarPrice = /\$\s?\d{1,4}(?:[.,]\d{2})?/.test(html);
  const hasUsdPrice = /usd\s?\d{1,4}(?:[.,]\d{2})?/.test(text);
  const hasPrice = hasDollarPrice || hasUsdPrice;

  const hasAddToCart =
    /add to cart|add-to-cart|buy now|checkout|cart/.test(text) ||
    /wc_add_to_cart|product-form__submit|data-add-to-cart/.test(lower);

  const hasProductPath = /\/product\/|\/products\/|\/shop\/|\/collections\//.test(lower);
  const hasCatalogWords = /shop all|catalog|collections|featured products|our products/.test(text);

  const hasContactOnly = /contact us for pricing|request quote|inquiry only|minimum order|moq|wholesale only/.test(text);

  return {
    hasPrice,
    hasAddToCart,
    hasProductPath,
    hasCatalogWords,
    hasContactOnly,
    directOnlineSale: hasPrice && (hasAddToCart || hasProductPath || hasCatalogWords) && !hasContactOnly
  };
}

function usSignals(html, urlValue) {
  const lower = (html || "").toLowerCase();
  const domain = hostnameOf(urlValue);

  const positive =
    /\busa\b|\bunited states\b|\bus shipping\b|\bships from (the )?us\b|\bmade in usa\b|\bus warehouse\b/.test(lower) ||
    /\.(us)$/.test(domain);

  const negative =
    /\bchina\b|\bshanghai\b|\bguangzhou\b|\bshenzhen\b|\bfactory direct\b|\bwholesale\b/.test(lower) ||
    /\.(cn)$/.test(domain);

  return {
    likelyUs: positive && !negative,
    positive,
    negative
  };
}

async function probeApi(baseUrl) {
  const probes = [
    {
      key: "woo_store_products",
      path: "/wp-json/wc/store/v1/products?per_page=1"
    },
    {
      key: "shopify_products",
      path: "/products.json?limit=1"
    },
    {
      key: "wp_json",
      path: "/wp-json"
    }
  ];

  const out = {};
  await Promise.all(
    probes.map(async (probe) => {
      let target;
      try {
        target = new URL(probe.path, baseUrl).toString();
      } catch {
        out[probe.key] = { error: "invalid_base_url" };
        return;
      }

      const result = await fetchText(target, {
        timeoutMs: 7_000,
        accept: "application/json,text/plain,*/*"
      });

      const contentType = (result.headers["content-type"] || "").split(";")[0];
      out[probe.key] = {
        status: result.status,
        contentType,
        url: result.url,
        okJson: result.ok && contentType.includes("application/json")
      };
    })
  );

  return out;
}

function apiMethodFromProbes(probes) {
  const woo = probes.woo_store_products;
  const shop = probes.shopify_products;
  if (woo && woo.status === 200 && woo.okJson) {
    return "WooCommerce Store API (public)";
  }
  if (shop && shop.status === 200 && shop.okJson) {
    return "Shopify products.json (public)";
  }
  return null;
}

async function searchVendorWebsite(vendorName) {
  const candidates = [];
  const queries = [
    `"${vendorName}" peptide official site`,
    `"${vendorName}" peptides`
  ];

  for (const query of queries) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetchText(url, { timeoutMs: 10_000 });
    if (!response.ok) {
      continue;
    }

    const $ = cheerio.load(response.text);
    const resultAnchors = $("li.b_algo h2 a");
    resultAnchors.each((_, node) => {
      const href = $(node).attr("href");
      const title = $(node).text().replace(/\s+/g, " ").trim();
      const target = unwrapSearchLink(href);
      if (!target) {
        return;
      }
      const host = hostnameOf(target);
      if (!host || isBlockedSearchHost(host)) {
        return;
      }
      if (!/^https?:\/\//i.test(target)) {
        return;
      }

      const relevance = overlapScore(vendorName, `${title} ${host}`);
      const categoryHint = /(peptide|bio|research|lab|labs|pharma|science|compounding|health|medical)/i.test(
        `${host} ${title}`
      );
      if (relevance < 0.35) {
        return;
      }
      if (relevance < 0.55 && !categoryHint) {
        return;
      }

      const scoreFromUrl = scoreCandidateUrl(vendorName, target);
      const scoreFromTitle = overlapScore(vendorName, title) * 6;
      const score = scoreFromUrl + scoreFromTitle;
      if (score < 1) {
        return;
      }

      candidates.push({
        url: target,
        host,
        title,
        score
      });
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    const key = candidate.host.replace(/^www\./, "");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
    if (deduped.length >= 5) {
      break;
    }
  }

  return deduped;
}

function pickBestAnalysis(analyses) {
  if (analyses.length === 0) {
    return null;
  }

  let best = analyses[0];
  let bestScore = -1;

  for (const analysis of analyses) {
    let score = 0;
    if (analysis.sale.directOnlineSale) {
      score += 50;
    }
    if (analysis.sale.hasPrice) {
      score += 12;
    }
    if (analysis.sale.hasAddToCart) {
      score += 12;
    }
    if (analysis.sale.hasProductPath || analysis.sale.hasCatalogWords) {
      score += 8;
    }
    if (analysis.us.likelyUs) {
      score += 8;
    }
    if (analysis.apiMethod) {
      score += 10;
    }
    score += Math.max(analysis.searchScore || 0, 0);
    score += Math.round((analysis.identityMatch || 0) * 20);
    if (analysis.uniqueTokenMatched) {
      score += 8;
    } else {
      score -= 18;
    }

    if ((analysis.identityMatch || 0) < 0.2) {
      score -= 20;
    }

    if (score > bestScore) {
      best = analysis;
      bestScore = score;
    }
  }

  return best;
}

async function analyzeWebsite(candidate, vendorName) {
  const root = await fetchText(candidate.url, { timeoutMs: 10_000 });
  if (!root.ok) {
    return {
      website: candidate.url,
      finalUrl: candidate.url,
      status: 0,
      error: root.error || "fetch_failed",
      searchScore: candidate.score,
      sale: {
        hasPrice: false,
        hasAddToCart: false,
        hasProductPath: false,
        hasCatalogWords: false,
        hasContactOnly: false,
        directOnlineSale: false
      },
      us: { likelyUs: false, positive: false, negative: false },
      identityText: "",
      identityMatch: 0,
      uniqueTokenMatched: false,
      peptideContext: false,
      platform: "Unknown",
      probes: {},
      apiMethod: null
    };
  }

  const identityText = extractIdentityText(root.text);
  const identityMaterial = `${identityText} ${hostnameOf(root.url)}`;
  const identityMatch = overlapScore(vendorName, identityMaterial);
  const uniqueTokenMatched = hasUniqueTokenMatch(vendorName, identityMaterial);
  const platform = detectPlatform(root.text, root.url, root.headers);
  const sale = saleSignals(root.text);
  if (identityMatch < 0.25) {
    sale.directOnlineSale = false;
  }
  const us = usSignals(root.text, root.url);
  const probes = await probeApi(root.url);
  const apiMethod = apiMethodFromProbes(probes);
  const peptideContext =
    /\bpeptide\b|\bamino\b|\btirzepatide\b|\bsemaglutide\b|\bretatrutide\b|\bcjc\b|\bbpc-?157\b|\btb-?500\b|\bipamorelin\b/.test(
      root.text.toLowerCase()
    );
  const ecommercePlatform =
    platform === "WooCommerce (WordPress)" || platform === "Shopify" || platform === "BigCommerce";
  sale.directOnlineSale =
    identityMatch >= 0.25 &&
    uniqueTokenMatched &&
    peptideContext &&
    sale.hasPrice &&
    !sale.hasContactOnly &&
    (Boolean(apiMethod) || (ecommercePlatform && sale.hasAddToCart && (sale.hasProductPath || sale.hasCatalogWords)));

  return {
    website: candidate.url,
    finalUrl: root.url,
    status: root.status,
    searchScore: candidate.score,
    identityText,
    identityMatch,
    uniqueTokenMatched,
    peptideContext,
    platform,
    sale,
    us,
    probes,
    apiMethod
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = Array.from({ length: items.length });
  let nextIndex = 0;

  async function run() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      output[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return output;
}

async function fetchFinnrickVendors() {
  const response = await fetchText(FINNRICK_VENDORS_URL, {
    timeoutMs: 20_000
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Finnrick vendors page: ${response.error || "unknown"}`);
  }

  const $ = cheerio.load(response.text);
  const rows = [];

  $('a[href^="/vendors/"]').each((_, link) => {
    const href = $(link).attr("href") || "";
    const slug = href.replace("/vendors/", "").trim();
    const name = $(link).text().replace(/\s+/g, " ").trim();
    if (!slug || !name) {
      return;
    }
    rows.push({ name, slug });
  });

  return [...new Map(rows.map((row) => [row.slug, row])).values()];
}

function toCsv(rows) {
  const headers = ["vendor_name", "slug", "website", "final_url", "direct_online_sale", "likely_us", "platform", "api_method"];
  const esc = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        esc(row.name),
        esc(row.slug),
        esc(row.website),
        esc(row.finalUrl),
        esc(row.directOnlineSale),
        esc(row.likelyUs),
        esc(row.platform),
        esc(row.apiMethod || "")
      ].join(",")
    );
  }

  return lines.join("\n");
}

async function main() {
  const excluded = new Set(EXCLUDED_VENDOR_NAMES.map(normalizeName));
  const allVendors = await fetchFinnrickVendors();

  const remaining = allVendors.filter((vendor) => !excluded.has(normalizeName(vendor.name)));
  const skippedChinaWholesale = remaining.filter((vendor) => likelyChinaWholesaleByName(vendor.name));
  const auditQueueAll = remaining.filter((vendor) => !likelyChinaWholesaleByName(vendor.name));
  const auditLimit = Number(process.env.AUDIT_LIMIT || 0);
  const auditQueue = auditLimit > 0 ? auditQueueAll.slice(0, auditLimit) : auditQueueAll;

  console.log(`[audit] total vendors on Finnrick: ${allVendors.length}`);
  console.log(`[audit] excluded (already provided): ${allVendors.length - remaining.length}`);
  console.log(`[audit] skipped likely China/wholesale by name: ${skippedChinaWholesale.length}`);
  console.log(`[audit] remaining for website/platform audit: ${auditQueue.length}`);
  if (auditLimit > 0) {
    console.log(`[audit] AUDIT_LIMIT active: ${auditLimit}`);
  }

  const audited = await mapWithConcurrency(auditQueue, 4, async (vendor, index) => {
    await sleep(100);
    const candidates = await searchVendorWebsite(vendor.name);
    const topCandidates = candidates.slice(0, 3);

    const analyses = [];
    for (const candidate of topCandidates) {
      const result = await analyzeWebsite(candidate, vendor.name);
      analyses.push(result);
      if (result.sale.directOnlineSale && result.apiMethod) {
        break;
      }
    }

    const best = pickBestAnalysis(analyses);
    const row = {
      name: vendor.name,
      slug: vendor.slug,
      candidates: topCandidates,
      analysis: best,
      allAnalyses: analyses
    };

    const progress = `${index + 1}/${auditQueue.length}`;
    const website = best?.finalUrl || best?.website || "n/a";
    const status = best?.sale.directOnlineSale ? "direct-sale" : "no-direct-sale";
    console.log(`[audit] ${progress} ${vendor.name} -> ${website} (${status})`);
    return row;
  });

  const normalized = audited.map((item) => {
    const analysis = item.analysis;
    return {
      name: item.name,
      slug: item.slug,
      website: analysis?.website || null,
      finalUrl: analysis?.finalUrl || null,
      directOnlineSale: Boolean(analysis?.sale.directOnlineSale),
      likelyUs: Boolean(analysis?.us.likelyUs),
      platform: analysis?.platform || "Unknown",
      apiMethod: analysis?.apiMethod || null,
      status: analysis?.status || 0,
      identityMatch: Number(analysis?.identityMatch || 0),
      identityText: analysis?.identityText || "",
      uniqueTokenMatched: Boolean(analysis?.uniqueTokenMatched),
      peptideContext: Boolean(analysis?.peptideContext),
      probes: analysis?.probes || {},
      saleSignals: analysis?.sale || null,
      usSignals: analysis?.us || null,
      candidates: item.candidates
    };
  });

  const likelyUsDirectSale = normalized.filter((row) => row.directOnlineSale && row.likelyUs);
  const directSaleUnknownUs = normalized.filter((row) => row.directOnlineSale && !row.likelyUs);
  const withApi = normalized.filter((row) => row.apiMethod);

  const platformCounts = {};
  for (const row of likelyUsDirectSale) {
    platformCounts[row.platform] = (platformCounts[row.platform] || 0) + 1;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    input: {
      totalFinnrickVendors: allVendors.length,
      excludedProvidedCount: allVendors.length - remaining.length,
      skippedLikelyChinaWholesaleCount: skippedChinaWholesale.length,
      auditedCount: auditQueue.length
    },
    summary: {
      likelyUsDirectSaleCount: likelyUsDirectSale.length,
      directSaleUnknownUsCount: directSaleUnknownUs.length,
      withApiCount: withApi.length,
      platformCountsLikelyUsDirectSale: platformCounts
    },
    skippedLikelyChinaWholesale: skippedChinaWholesale,
    likelyUsDirectSale,
    directSaleUnknownUs,
    auditedAll: normalized
  };

  await fs.writeFile("/tmp/finnrick-vendor-audit.json", JSON.stringify(output, null, 2), "utf8");
  await fs.writeFile("/tmp/finnrick-vendor-audit.csv", toCsv(normalized), "utf8");

  console.log("[audit] wrote /tmp/finnrick-vendor-audit.json");
  console.log("[audit] wrote /tmp/finnrick-vendor-audit.csv");
  console.log(
    `[audit] likely US + direct online sale: ${likelyUsDirectSale.length}, direct sale but unknown US signal: ${directSaleUnknownUs.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
