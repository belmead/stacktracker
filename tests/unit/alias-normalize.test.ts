import { describe, expect, it } from "vitest";

import {
  isLikelyArgirelineAlias,
  isLikelyCagrilintideShorthand,
  isLikelyCjcNoDacAlias,
  isLikelyBlendOrStackProduct,
  isLikelyCjcWithDacAlias,
  isLikelyNonProductListing,
  isLikelyPalTetrapeptide7Alias,
  isLikelyRetatrutideShorthand,
  isLikelySemaglutideShorthand,
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

  it("strips generic peptide suffix tokens", () => {
    const normalized = normalizeAlias("Cardiogen Peptide (20MG)");
    expect(stripAliasDescriptors(normalized)).toBe("cardiogen");
  });

  it("strips standalone pack counts tied to descriptor tokens", () => {
    const normalized = normalizeAlias("THYMALIN 10 mg (10 vials)");
    expect(stripAliasDescriptors(normalized)).toBe("thymalin");
  });

  it("preserves compound numeric identity while stripping dosage choice tails", () => {
    const normalized = normalizeAlias("BPC-157 Peptide 5mg/10mg/20mg");
    expect(stripAliasDescriptors(normalized)).toBe("bpc 157");
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

  it("strips batch-note and kit storefront noise", () => {
    expect(stripStorefrontNoise("Selank 10mg (Current batch tested at 12mg) with Air Dispersal Kit")).toBe("Selank 10mg");
  });

  it("strips html entities from storefront text", () => {
    expect(normalizeAlias("CJC-1295 &#8211; With DAC (10mg)")).toBe("cjc 1295 with dac 10mg");
  });

  it("detects retatrutide shorthand aliases", () => {
    expect(isLikelyRetatrutideShorthand("US Finished NG-1 RT")).toBe(true);
    expect(isLikelyRetatrutideShorthand("GLP-3 20mg")).toBe(true);
    expect(isLikelyRetatrutideShorthand("ER-RT (10mg)")).toBe(true);
    expect(isLikelyRetatrutideShorthand("R 30MG (10 Vials)")).toBe(true);
    expect(isLikelyRetatrutideShorthand("R 30")).toBe(false);
    expect(isLikelyRetatrutideShorthand("R 30mcg")).toBe(false);
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
    expect(isLikelyTirzepatideShorthand("GLP2-T 20mg")).toBe(true);
    expect(isLikelyTirzepatideShorthand("GLP-2TZ 100MG")).toBe(true);
    expect(isLikelyTirzepatideShorthand("GLP1-T 60mg")).toBe(true);
    expect(isLikelyTirzepatideShorthand("GLP-2 (T) (10mg)")).toBe(true);
    expect(isLikelyTirzepatideShorthand("T 60MG")).toBe(true);
    expect(isLikelyTirzepatideShorthand("T 60")).toBe(false);
    expect(isLikelyTirzepatideShorthand("T 60mcg")).toBe(false);
  });

  it("detects semaglutide shorthand aliases", () => {
    expect(isLikelySemaglutideShorthand("Semaglutide 10mg")).toBe(true);
    expect(isLikelySemaglutideShorthand("GLP1-S")).toBe(true);
    expect(isLikelySemaglutideShorthand("GLP-1 (S) (10mg)")).toBe(true);
    expect(isLikelySemaglutideShorthand("GLP1")).toBe(true);
    expect(isLikelySemaglutideShorthand("S 10MG")).toBe(true);
    expect(isLikelySemaglutideShorthand("S 10")).toBe(false);
    expect(isLikelySemaglutideShorthand("S 10mcg")).toBe(false);
    expect(isLikelySemaglutideShorthand("GLP-1 TZ 10mg")).toBe(false);
  });

  it("detects cjc-1295 with dac aliases", () => {
    expect(isLikelyCjcWithDacAlias("CJC-1295 – With DAC (10mg)")).toBe(true);
    expect(isLikelyCjcWithDacAlias("CJC-1295 no DAC (with IPA)")).toBe(false);
  });

  it("detects cjc-1295 no dac aliases", () => {
    expect(isLikelyCjcNoDacAlias("CJC-1295 no DAC 5mg (Mod GRF 1-29)")).toBe(true);
    expect(isLikelyCjcNoDacAlias("CJC-1295 no DAC (with IPA)")).toBe(true);
    expect(isLikelyCjcNoDacAlias("CJC-1295 with DAC 10mg")).toBe(false);
  });

  it("detects argireline aliases", () => {
    expect(isLikelyArgirelineAlias("Acetyl Hexapeptide-8 (Argireline) 200MG")).toBe(true);
    expect(isLikelyArgirelineAlias("Argireline 50mg")).toBe(true);
    expect(isLikelyArgirelineAlias("BPC-157 10mg")).toBe(false);
  });

  it("detects pal tetrapeptide-7 aliases", () => {
    expect(isLikelyPalTetrapeptide7Alias("Pal Tetrapeptide-7 (Matrixyl 3000) 200MG")).toBe(true);
    expect(isLikelyPalTetrapeptide7Alias("Matrixyl 3000 100mg")).toBe(true);
    expect(isLikelyPalTetrapeptide7Alias("CJC-1295 10mg")).toBe(false);
  });

  it("flags non-product listing text", () => {
    expect(isLikelyNonProductListing("Quality-Driven Research Peptides")).toBe(true);
    expect(isLikelyNonProductListing("Pre-Workout TAD (10MG) $65.00 Add to Cart")).toBe(true);
    expect(isLikelyNonProductListing("NeuroboliX Dissolving Strips")).toBe(true);
    expect(isLikelyNonProductListing("CU+ Silk Body Cream")).toBe(true);
    expect(isLikelyNonProductListing("BPC-157 10mg Vial")).toBe(false);
  });
});
