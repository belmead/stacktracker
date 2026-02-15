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

function collapseWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function normalizeAlias(input: string): string {
  return collapseWhitespace(input.toLowerCase().replace(/[^a-z0-9]+/g, " "));
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
