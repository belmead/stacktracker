import { describe, expect, it } from "vitest";

import { detectSingleUnitOfferExclusion, parseProductName } from "@/lib/scraping/normalize";

describe("parseProductName", () => {
  it("detects vial formulation and strength", () => {
    const parsed = parseProductName("BPC-157 10mg Vial");

    expect(parsed.compoundRawName).toBe("BPC-157 10mg Vial");
    expect(parsed.formulationCode).toBe("vial");
    expect(parsed.strengthValue).toBe(10);
    expect(parsed.strengthUnit).toBe("mg");
  });

  it("infers vial formulation for mass-unit peptide listings without explicit form factor", () => {
    const parsed = parseProductName("BPC-157 10mg");

    expect(parsed.formulationCode).toBe("vial");
    expect(parsed.formulationLabel).toBe("Vial");
    expect(parsed.displaySizeLabel).toBe("10mg");
  });

  it("detects plural vial wording as vial formulation", () => {
    const parsed = parseProductName("BPC-157 10mg 10 vials");

    expect(parsed.formulationCode).toBe("vial");
    expect(parsed.packageQuantity).toBe(10);
    expect(parsed.packageUnit).toBe("vial");
  });

  it("infers vial formulation when product titles include HTML entity separators", () => {
    const parsed = parseProductName("BPC-157 &#8211; 10mg");

    expect(parsed.formulationCode).toBe("vial");
    expect(parsed.displaySizeLabel).toBe("10mg");
  });

  it("does not infer vial for non-mass strengths", () => {
    const parsed = parseProductName("BPC-157 10ml");

    expect(parsed.formulationCode).toBe("other");
    expect(parsed.displaySizeLabel).toBe("10ml");
  });

  it("detects capsule pack quantity", () => {
    const parsed = parseProductName("Retatrutide 30 Capsules");

    expect(parsed.formulationCode).toBe("capsule");
    expect(parsed.packageQuantity).toBe(30);
    expect(parsed.packageUnit).toBe("capsule");
  });

  it("does not collapse blend products into a single compound alias", () => {
    const parsed = parseProductName("Wolverine Blend BPC-157 10mg TB500 10mg");

    expect(parsed.compoundRawName).toContain("Wolverine Blend");
    expect(parsed.compoundRawName).toContain("TB500");
  });

  it("strips storefront noise from inferred alias text", () => {
    const parsed = parseProductName("US Finished NG-1 RT $500.00 Add to Cart Add to cart");

    expect(parsed.compoundRawName).toBe("NG-1 RT");
  });

  it("flags multi-vial offers outside single-unit MVP scope", () => {
    const parsed = parseProductName("BPC-157 10mg (10 vials)");
    const exclusion = detectSingleUnitOfferExclusion({
      productName: "BPC-157 10mg (10 vials)",
      parsed
    });

    expect(exclusion).toMatchObject({
      code: "package_quantity_gt_1"
    });
  });

  it("flags pack/kit wording outside single-unit MVP scope", () => {
    const exclusion = detectSingleUnitOfferExclusion({
      productName: "CJC-1295 with DAC 10mg starter kit"
    });

    expect(exclusion).toMatchObject({
      code: "kit_keyword"
    });
  });

  it("keeps single-vial offers in MVP scope", () => {
    const exclusion = detectSingleUnitOfferExclusion({
      productName: "BPC-157 10mg Vial"
    });

    expect(exclusion).toBeNull();
  });
});
