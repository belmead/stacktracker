import { describe, expect, it } from "vitest";

import { computeMetricPrices, resolveVariantTotals } from "@/lib/metrics";

describe("metrics", () => {
  it("computes per-mg and per-vial values for vial products", () => {
    const totals = resolveVariantTotals({
      strengthValue: 10,
      strengthUnit: "mg",
      packageQuantity: 1,
      packageUnit: "vial"
    });

    const prices = computeMetricPrices(5000, {
      formulationCode: "vial",
      displaySizeLabel: "10mg",
      strengthValue: totals.strengthValue,
      strengthUnit: totals.strengthUnit,
      packageQuantity: totals.packageQuantity,
      packageUnit: totals.packageUnit,
      totalMassMg: totals.totalMassMg,
      totalVolumeMl: totals.totalVolumeMl,
      totalCountUnits: totals.totalCountUnits
    });

    expect(prices.price_per_mg).toBe(500);
    expect(prices.price_per_vial).toBe(5000);
    expect(prices.price_per_ml).toBeNull();
  });

  it("computes per-unit for capsule products", () => {
    const totals = resolveVariantTotals({
      strengthValue: null,
      strengthUnit: null,
      packageQuantity: 30,
      packageUnit: "capsule"
    });

    const prices = computeMetricPrices(9000, {
      formulationCode: "capsule",
      displaySizeLabel: "30 capsules",
      strengthValue: totals.strengthValue,
      strengthUnit: totals.strengthUnit,
      packageQuantity: totals.packageQuantity,
      packageUnit: totals.packageUnit,
      totalMassMg: totals.totalMassMg,
      totalVolumeMl: totals.totalVolumeMl,
      totalCountUnits: totals.totalCountUnits
    });

    expect(prices.price_per_unit).toBe(300);
  });
});
