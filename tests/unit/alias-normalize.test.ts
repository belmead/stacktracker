import { describe, expect, it } from "vitest";

import { normalizeAlias, stripAliasDescriptors } from "@/lib/alias/normalize";

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
});
