import { describe, expect, it } from "vitest";

import { parseProductName } from "@/lib/scraping/normalize";

describe("parseProductName", () => {
  it("detects vial formulation and strength", () => {
    const parsed = parseProductName("BPC-157 10mg Vial");

    expect(parsed.compoundRawName).toBe("BPC-157");
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
});
