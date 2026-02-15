import { describe, expect, it } from "vitest";

import { parseProductName } from "@/lib/scraping/normalize";

describe("parseProductName", () => {
  it("detects vial formulation and strength", () => {
    const parsed = parseProductName("BPC-157 10mg Vial");

    expect(parsed.compoundRawName).toBe("BPC-157 10mg Vial");
    expect(parsed.formulationCode).toBe("vial");
    expect(parsed.strengthValue).toBe(10);
    expect(parsed.strengthUnit).toBe("mg");
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
});
