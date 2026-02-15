import { describe, expect, it } from "vitest";

import {
  isLikelyBlendOrStackProduct,
  isLikelyNonProductListing,
  isLikelyRetatrutideShorthand,
  normalizeAlias,
  stripAliasDescriptors,
  stripStorefrontNoise
} from "@/lib/alias/normalize";

describe("alias normalization", () => {
  it("normalizes punctuation and casing", () => {
    expect(normalizeAlias("  BPC-157 (10MG)  ")).toBe("bpc 157 10mg");
  });

  it("strips dosage and formulation suffix tokens", () => {
    const normalized = normalizeAlias("Tesamorelin 10 mg Vial");
    expect(stripAliasDescriptors(normalized)).toBe("tesamorelin");
  });

  it("preserves blend tokens so multi-compound products stay ambiguous", () => {
    const normalized = normalizeAlias("BPC-157 + TB-500 Blend 10mg");
    expect(stripAliasDescriptors(normalized)).toBe("bpc 157 tb 500 blend");
  });

  it("keeps meaningful compound qualifiers", () => {
    const normalized = normalizeAlias("CJC-1295 No DAC with IPA 5mg");
    expect(stripAliasDescriptors(normalized)).toBe("cjc 1295 no dac with ipa");
  });

  it("detects slash-delimited blends", () => {
    expect(isLikelyBlendOrStackProduct("Wolverine Blend - BPC-157 (10mg) / TB500 (10mg)")).toBe(true);
  });

  it("detects plus-delimited blends", () => {
    expect(isLikelyBlendOrStackProduct("BPC-157 + TB-500 (10mg/10mg)")).toBe(true);
  });

  it("does not misclassify concentration notation as a blend", () => {
    expect(isLikelyBlendOrStackProduct("Methylene Blue 20mg/ml")).toBe(false);
  });

  it("strips storefront CTA and pricing noise", () => {
    expect(stripStorefrontNoise("US Finished NG-1 RT $500.00 Add to Cart Add to cart")).toBe("NG-1 RT");
  });

  it("detects retatrutide shorthand aliases", () => {
    expect(isLikelyRetatrutideShorthand("US Finished NG-1 RT")).toBe(true);
    expect(isLikelyRetatrutideShorthand("GLP-3 20mg")).toBe(true);
  });

  it("flags non-product listing text", () => {
    expect(isLikelyNonProductListing("Quality-Driven Research Peptides")).toBe(true);
    expect(isLikelyNonProductListing("BPC-157 10mg Vial")).toBe(false);
  });
});
