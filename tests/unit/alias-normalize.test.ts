import { describe, expect, it } from "vitest";

import {
  isLikelyCagrilintideShorthand,
  isLikelyBlendOrStackProduct,
  isLikelyCjcWithDacAlias,
  isLikelyNonProductListing,
  isLikelyRetatrutideShorthand,
  isLikelyTirzepatideShorthand,
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

  it("strips count suffixes like x30/x100", () => {
    const normalized = normalizeAlias("Tesofensine Tablets x100");
    expect(stripAliasDescriptors(normalized)).toBe("tesofensine");
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

  it("detects keyword-based stack and blend labels", () => {
    expect(isLikelyBlendOrStackProduct("Energy Stack")).toBe(true);
    expect(isLikelyBlendOrStackProduct("2X Blend CJC-1295 No DAC (5mg) / Ipamorelin (5mg)")).toBe(true);
  });

  it("does not misclassify concentration notation as a blend", () => {
    expect(isLikelyBlendOrStackProduct("Methylene Blue 20mg/ml")).toBe(false);
  });

  it("detects paired-dose blend notation", () => {
    expect(isLikelyBlendOrStackProduct("Thymosin Alpha 1 (TA1) Complex Thymulin (10mg/6.4mg)")).toBe(true);
  });

  it("strips storefront CTA and pricing noise", () => {
    expect(stripStorefrontNoise("US Finished NG-1 RT $500.00 Add to Cart Add to cart")).toBe("NG-1 RT");
  });

  it("strips html entities from storefront text", () => {
    expect(normalizeAlias("CJC-1295 &#8211; With DAC (10mg)")).toBe("cjc 1295 with dac 10mg");
  });

  it("detects retatrutide shorthand aliases", () => {
    expect(isLikelyRetatrutideShorthand("US Finished NG-1 RT")).toBe(true);
    expect(isLikelyRetatrutideShorthand("GLP-3 20mg")).toBe(true);
    expect(isLikelyRetatrutideShorthand("ER-RT (10mg)")).toBe(true);
  });

  it("detects cagrilintide shorthand aliases", () => {
    expect(isLikelyCagrilintideShorthand("Cag (5MG)")).toBe(true);
    expect(isLikelyCagrilintideShorthand("Cagrilinitide 5mg")).toBe(true);
  });

  it("detects tirzepatide shorthand aliases", () => {
    expect(isLikelyTirzepatideShorthand("Tirzepatide 10mg")).toBe(true);
    expect(isLikelyTirzepatideShorthand("GLP-1 TZ (10MG)")).toBe(true);
    expect(isLikelyTirzepatideShorthand("NG-TZ 10mg")).toBe(true);
    expect(isLikelyTirzepatideShorthand("ER-TZ 10mg")).toBe(true);
  });

  it("detects cjc-1295 with dac aliases", () => {
    expect(isLikelyCjcWithDacAlias("CJC-1295 – With DAC (10mg)")).toBe(true);
    expect(isLikelyCjcWithDacAlias("CJC-1295 no DAC (with IPA)")).toBe(false);
  });

  it("flags non-product listing text", () => {
    expect(isLikelyNonProductListing("Quality-Driven Research Peptides")).toBe(true);
    expect(isLikelyNonProductListing("Pre-Workout TAD (10MG) $65.00 Add to Cart")).toBe(true);
    expect(isLikelyNonProductListing("BPC-157 10mg Vial")).toBe(false);
  });
});
