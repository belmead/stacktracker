const UNIT_TOKENS = new Set(["mg", "mcg", "ug", "g", "ml", "iu", "unit", "units"]);

const DESCRIPTOR_TOKENS = new Set([
  "peptide",
  "peptides",
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
  /\bus finished\b/gi,
  /\(?\s*current\s+batch\s+tested\s+at\s+\d+(?:\.\d+)?\s?(?:mg|mcg|ug|g|ml|iu|units?)\s*\)?/gi,
  /\bwith\s+air\s+dispersal\s+kit\b/gi
];
const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi;
const PRICE_PATTERN = /\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g;
const RETATRUTIDE_SHORTHAND_PATTERNS = [/\bretatrutide\b/i, /\breta\b/i, /\bglp[\s-]?3\b/i, /\bng[\s-]?1[\s-]?rt\b/i];
const RETATRUTIDE_RT_CONTEXT_PATTERN = /\brt\b/i;
const RETATRUTIDE_RT_CONTEXT_HINT_PATTERN = /\b(ng|glp|finished|reta|pharma|er|elite)\b/i;
const TIRZEPATIDE_SHORTHAND_PATTERNS = [
  /\btirzepatide\b/i,
  /\btirz\b/i,
  /\bglp[\s-]?1\s*tz\b/i,
  /\bglp[\s-]?[12]\s*(?:[- ]|\(\s*)?t(?:z)?\s*\)?\b/i,
  /\bng[\s-]?tz\b/i
];
const TIRZEPATIDE_TZ_PATTERN = /\btz\b/i;
const TIRZEPATIDE_TZ_CONTEXT_PATTERN = /\b(glp|tirz|ng|er|elite)\b/i;
const SEMAGLUTIDE_SHORTHAND_PATTERNS = [/\bsemaglutide\b/i, /\bsema\b/i, /\bglp[\s-]?1\s*(?:[- ]?s|\(\s*s\s*\))\b/i];
const SEMAGLUTIDE_BARE_GLP1_PATTERN = /\bglp[\s-]?1\b/i;
const SEMAGLUTIDE_EXCLUSION_PATTERN = /\b(tz|tirz|reta|retatrutide|rt|cag)\b/i;
const NON_TRACKABLE_SUPPLEMENT_PATTERNS = [
  /\bpre[\s-]?workout\b/i,
  /\bdissolv(?:able|ing)\s+strips?\b/i,
  /\bhair\s+growth\s+formulation\b/i,
  /\bbody\s+cream\b/i,
  /\bconditioner\b/i,
  /\beye\s*glow\b/i,
  /\bt-?shirt\b/i
];

function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function stripStorefrontNoise(input: string): string {
  if (!input) {
    return "";
  }

  let text = input.replace(HTML_ENTITY_PATTERN, " ").replace(/\|/g, " ").replace(PRICE_PATTERN, " ");
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
    const prev = tokens[index - 1];

    if (/^\d+(?:\.\d+)?(mg|mcg|ug|g|ml|iu|units?)$/.test(token)) {
      continue;
    }

    if (/^\d+(?:\.\d+)?$/.test(token) && next && UNIT_TOKENS.has(next)) {
      index += 1;
      continue;
    }

    const isStandaloneNumericToken = /^\d+(?:\.\d+)?$/.test(token);
    const hasPackOrUnitContextBefore =
      !!prev &&
      (UNIT_TOKENS.has(prev) ||
        DESCRIPTOR_TOKENS.has(prev) ||
        /^\d+(?:\.\d+)?(mg|mcg|ug|g|ml|iu|units?)$/.test(prev) ||
        /^x\d+$/.test(prev) ||
        /^\d+x$/.test(prev));
    const isTrailingPackCount = index === tokens.length - 2;

    if (isStandaloneNumericToken && next && DESCRIPTOR_TOKENS.has(next) && (hasPackOrUnitContextBefore || isTrailingPackCount)) {
      continue;
    }

    if (/^x\d+$/.test(token) || /^\d+x$/.test(token)) {
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

  // Paired dose notation (for example 10mg/6.4mg) usually indicates combined actives.
  if (/\b\d+(?:\.\d+)?\s?(mg|mcg|ug|g|iu|units?)\s*\/\s*\d+(?:\.\d+)?\s?\1\b/i.test(lowered)) {
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

export function isLikelyTirzepatideShorthand(input: string): boolean {
  if (!input) {
    return false;
  }

  const cleaned = stripStorefrontNoise(input);
  if (!cleaned) {
    return false;
  }

  if (TIRZEPATIDE_SHORTHAND_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return true;
  }

  return TIRZEPATIDE_TZ_PATTERN.test(cleaned) && TIRZEPATIDE_TZ_CONTEXT_PATTERN.test(cleaned);
}

export function isLikelySemaglutideShorthand(input: string): boolean {
  if (!input) {
    return false;
  }

  const cleaned = stripStorefrontNoise(input);
  if (!cleaned) {
    return false;
  }

  if (SEMAGLUTIDE_SHORTHAND_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return true;
  }

  if (/\bglp[\s-]?[23]\b/i.test(cleaned)) {
    return false;
  }

  if (!SEMAGLUTIDE_BARE_GLP1_PATTERN.test(cleaned)) {
    return false;
  }

  return !SEMAGLUTIDE_EXCLUSION_PATTERN.test(cleaned);
}

export function isLikelyCagrilintideShorthand(input: string): boolean {
  const normalized = normalizeAlias(input);
  if (!normalized) {
    return false;
  }

  const stripped = stripAliasDescriptors(normalized);
  const candidate = stripped || normalized;
  return candidate === "cag" || candidate.includes("cagrilintide") || candidate.includes("cagrilinitide");
}

export function isLikelyCjcWithDacAlias(input: string): boolean {
  const stripped = stripAliasDescriptors(normalizeAlias(input));
  if (!stripped) {
    return false;
  }

  return stripped === "cjc 1295 with dac";
}

export function isLikelyCjcNoDacAlias(input: string): boolean {
  const stripped = stripAliasDescriptors(normalizeAlias(input));
  if (!stripped) {
    return false;
  }

  if (!stripped.includes("cjc 1295") || !stripped.includes("no dac")) {
    return false;
  }

  return stripped.includes("with ipa") || stripped.includes("mod grf") || stripped.includes("grf 1 29");
}

export function isLikelyArgirelineAlias(input: string): boolean {
  const stripped = stripAliasDescriptors(normalizeAlias(input));
  if (!stripped) {
    return false;
  }

  return stripped.includes("argireline") || stripped.includes("acetyl hexapeptide 8");
}

export function isLikelyPalTetrapeptide7Alias(input: string): boolean {
  const stripped = stripAliasDescriptors(normalizeAlias(input));
  if (!stripped) {
    return false;
  }

  return stripped.includes("pal tetrapeptide 7") || stripped.includes("matrixyl 3000");
}

export function isLikelyNonProductListing(input: string): boolean {
  const cleaned = stripStorefrontNoise(input);
  const normalized = normalizeAlias(cleaned);
  if (!normalized) {
    return true;
  }

  if (NON_TRACKABLE_SUPPLEMENT_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return true;
  }

  return normalized === "research peptides" || normalized === "best sellers";
}
