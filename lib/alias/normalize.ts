const UNIT_TOKENS = new Set(["mg", "mcg", "ug", "g", "ml", "iu", "unit", "units"]);

const DESCRIPTOR_TOKENS = new Set([
  "vial",
  "vials",
  "capsule",
  "capsules",
  "tablet",
  "tablets",
  "tab",
  "tabs",
  "troche",
  "troches",
  "spray",
  "sprays",
  "cream",
  "gel",
  "solution",
  "injectable",
  "injection",
  "nasal",
  "oral",
  "subq",
  "sq",
  "subcutaneous",
  "lyophilized",
  "lyophilised",
  "bottle",
  "bottles",
  "kit",
  "kits",
  "pack",
  "packs",
  "count",
  "ct",
  "qty",
  "quantity"
]);

const BLEND_KEYWORD_PATTERN = /\b(blend|stack|combo|mix)\b/i;
const STOREFRONT_NOISE_PATTERNS = [
  /\badd to cart\b/gi,
  /\bselect options\b/gi,
  /\bchoose options\b/gi,
  /\bcoming soon\b/gi,
  /\bread more\b/gi,
  /\bbuy now\b/gi,
  /\bthis product has multiple variants[^.]*\.?/gi,
  /\bquality[\s-]*driven research peptides\b/gi,
  /\bus finished\b/gi
];
const PRICE_PATTERN = /\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g;
const RETATRUTIDE_SHORTHAND_PATTERNS = [/\bretatrutide\b/i, /\breta\b/i, /\bglp[\s-]?3\b/i, /\bng[\s-]?1[\s-]?rt\b/i];
const RETATRUTIDE_RT_CONTEXT_PATTERN = /\brt\b/i;
const RETATRUTIDE_RT_CONTEXT_HINT_PATTERN = /\b(ng|glp|finished|reta|pharma)\b/i;

function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function stripStorefrontNoise(input: string): string {
  if (!input) {
    return "";
  }

  let text = input.replace(/\|/g, " ").replace(PRICE_PATTERN, " ");
  for (const pattern of STOREFRONT_NOISE_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  return collapseWhitespace(text);
}

export function normalizeAlias(input: string): string {
  return collapseWhitespace(stripStorefrontNoise(input).toLowerCase().replace(/[^a-z0-9]+/g, " "));
}

export function stripAliasDescriptors(aliasNormalized: string): string {
  if (!aliasNormalized) {
    return "";
  }

  const tokens = aliasNormalized.split(" ").filter(Boolean);
  const kept: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];

    if (/^\d+(?:\.\d+)?(mg|mcg|ug|g|ml|iu|units?)$/.test(token)) {
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(token) && next && UNIT_TOKENS.has(next)) {
      index += 1;
      continue;
    }

    if (DESCRIPTOR_TOKENS.has(token)) {
      continue;
    }

    kept.push(token);
  }

  return collapseWhitespace(kept.join(" "));
}

export function isLikelyBlendOrStackProduct(input: string): boolean {
  if (!input) {
    return false;
  }

  const lowered = input.toLowerCase();

  if (BLEND_KEYWORD_PATTERN.test(lowered)) {
    return true;
  }

  if (/\s\+\s/.test(lowered) || /\s\/\s/.test(lowered)) {
    return true;
  }

  const dosageMentions = lowered.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|ug|g|iu|ml)\b/g) ?? [];
  if (dosageMentions.length >= 2 && /\b(?:and|with)\b/.test(lowered)) {
    return true;
  }

  return false;
}

export function isLikelyRetatrutideShorthand(input: string): boolean {
  if (!input) {
    return false;
  }

  const cleaned = stripStorefrontNoise(input);
  if (!cleaned) {
    return false;
  }

  if (RETATRUTIDE_SHORTHAND_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return true;
  }

  return RETATRUTIDE_RT_CONTEXT_PATTERN.test(cleaned) && RETATRUTIDE_RT_CONTEXT_HINT_PATTERN.test(cleaned);
}

export function isLikelyNonProductListing(input: string): boolean {
  const normalized = normalizeAlias(input);
  if (!normalized) {
    return true;
  }

  return normalized === "research peptides" || normalized === "best sellers";
}
