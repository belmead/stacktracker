import type { ExtractedOffer, NormalizedVariant } from "@/lib/types";

export interface ParsedProductName {
  compoundRawName: string;
  formulationCode: string;
  formulationLabel: string;
  displaySizeLabel: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
}

const FORMULATION_RULES: Array<{ code: string; label: string; patterns: RegExp[] }> = [
  { code: "vial", label: "Vial", patterns: [/\bvial\b/, /lyophilized/, /injectable/, /for injection/] },
  { code: "cream", label: "Cream", patterns: [/\bcream\b/, /topical/] },
  { code: "troche", label: "Troche", patterns: [/\btroche\b/] },
  { code: "spray", label: "Spray", patterns: [/\bspray\b/, /nasal/] },
  { code: "capsule", label: "Capsule", patterns: [/\bcapsules?\b/, /\bcaps\b/] },
  { code: "tablet", label: "Tablet", patterns: [/\btablet\b/, /\btab\b/] },
  { code: "solution", label: "Solution", patterns: [/\bsolution\b/, /liquid/] },
  { code: "gel", label: "Gel", patterns: [/\bgel\b/] }
];

const COMPOUND_PATTERNS: Array<{ alias: string; regex: RegExp }> = [
  { alias: "BPC-157", regex: /\bbpc\s*-?\s*157\b/i },
  { alias: "Retatrutide", regex: /\bretatrutide\b|\bglp\s*-?\s*3\b|\ber\s*-?\s*rt\b|\b[a-z]?\s*-?rt\b/i },
  { alias: "CJC-1295", regex: /\bcjc\s*-?\s*1295\b/i },
  { alias: "Ipamorelin", regex: /\bipamorelin\b/i },
  { alias: "Tesamorelin", regex: /\btesamorelin\b/i },
  { alias: "Semaglutide", regex: /\bsemaglutide\b/i },
  { alias: "Tirzepatide", regex: /\btirzepatide\b/i }
];

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function detectFormulation(productName: string): { code: string; label: string } {
  const text = productName.toLowerCase();

  for (const rule of FORMULATION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { code: rule.code, label: rule.label };
    }
  }

  return { code: "other", label: "Other" };
}

export function inferCompoundRawName(productName: string): string {
  for (const pattern of COMPOUND_PATTERNS) {
    if (pattern.regex.test(productName)) {
      return pattern.alias;
    }
  }

  const cleaned = productName.replace(/\([^)]*\)/g, " ");
  const splitters = [" - ", " | ", ": ", " by "];
  for (const splitter of splitters) {
    if (cleaned.includes(splitter)) {
      return normalizeWhitespace(cleaned.split(splitter)[0]);
    }
  }

  return normalizeWhitespace(cleaned.split(",")[0]).slice(0, 120);
}

function parsePackageQuantity(text: string): { quantity: number | null; unit: string | null } {
  const multiPack = text.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(vials?|capsules?|troches?|sprays?|tablets?)/i);
  if (multiPack) {
    return {
      quantity: Number(multiPack[1]),
      unit: multiPack[2].toLowerCase().replace(/s$/, "")
    };
  }

  const count = text.match(/(\d+(?:\.\d+)?)\s*(capsules?|troches?|sprays?|tablets?)/i);
  if (count) {
    return {
      quantity: Number(count[1]),
      unit: count[2].toLowerCase().replace(/s$/, "")
    };
  }

  const vialCount = text.match(/(\d+(?:\.\d+)?)\s*(vials?)/i);
  if (vialCount) {
    return {
      quantity: Number(vialCount[1]),
      unit: "vial"
    };
  }

  return {
    quantity: null,
    unit: null
  };
}

function parseStrength(text: string): { value: number | null; unit: string | null; label: string } {
  const values = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(mcg|ug|mg|g|ml|l|oz|fl\s*oz)\b/gi));
  if (values.length === 0) {
    return {
      value: null,
      unit: null,
      label: "Standard"
    };
  }

  const strongest = values[0];
  const value = Number(strongest[1]);
  const unit = strongest[2].toLowerCase().replace(/\s+/g, " ");

  const label = `${value}${unit}`.replace(" ", "");

  return {
    value,
    unit,
    label
  };
}

export function parseProductName(productName: string): ParsedProductName {
  const normalizedName = normalizeWhitespace(productName);
  const formulation = detectFormulation(normalizedName);
  const strength = parseStrength(normalizedName);
  const packageInfo = parsePackageQuantity(normalizedName);

  const sizeLabel =
    strength.value && strength.unit
      ? `${strength.value}${strength.unit}`
      : packageInfo.quantity && packageInfo.unit
        ? `${packageInfo.quantity} ${packageInfo.unit}`
        : "Standard";

  return {
    compoundRawName: inferCompoundRawName(normalizedName),
    formulationCode: formulation.code,
    formulationLabel: formulation.label,
    displaySizeLabel: sizeLabel,
    strengthValue: strength.value,
    strengthUnit: strength.unit,
    packageQuantity: packageInfo.quantity,
    packageUnit: packageInfo.unit
  };
}

export function toNormalizedVariant(parsed: ParsedProductName): NormalizedVariant {
  return {
    formulationCode: parsed.formulationCode,
    displaySizeLabel: parsed.displaySizeLabel,
    strengthValue: parsed.strengthValue,
    strengthUnit: parsed.strengthUnit,
    packageQuantity: parsed.packageQuantity,
    packageUnit: parsed.packageUnit,
    totalMassMg: null,
    totalVolumeMl: null,
    totalCountUnits: null
  };
}

export function extractPriceCents(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "");
  const matches = cleaned.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (!matches) {
    return null;
  }

  const value = Number(matches[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}

export function isInStock(text: string): boolean {
  const lowered = text.toLowerCase();
  return !/out of stock|sold out|unavailable|backorder/.test(lowered);
}

export function buildExtractedOffer(input: {
  vendorPageId: string;
  vendorId: string;
  pageUrl: string;
  productUrl: string;
  productName: string;
  priceCents: number;
  payload?: Record<string, unknown>;
  availabilityText?: string;
}): ExtractedOffer {
  const parsed = parseProductName(input.productName);

  return {
    vendorPageId: input.vendorPageId,
    vendorId: input.vendorId,
    pageUrl: input.pageUrl,
    productUrl: input.productUrl,
    productName: normalizeWhitespace(input.productName),
    compoundRawName: parsed.compoundRawName,
    formulationRaw: parsed.formulationCode,
    sizeRaw: parsed.displaySizeLabel,
    currencyCode: "USD",
    listPriceCents: input.priceCents,
    available: isInStock(input.availabilityText ?? input.productName),
    rawPayload: {
      parsed,
      ...(input.payload ?? {})
    }
  };
}
