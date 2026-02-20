import { describe, expect, it } from "vitest";

import { parseMetric, parsePositiveInt, parseTrendRange, pickMetricForFormulation } from "@/lib/request";

describe("request parsing", () => {
  it("falls back on invalid metric", () => {
    expect(parseMetric("invalid", "price_per_mg")).toBe("price_per_mg");
  });

  it("parses valid trend range", () => {
    expect(parseTrendRange("6m", "1m")).toBe("6m");
  });

  it("parses positive integers", () => {
    expect(parsePositiveInt("4", 1)).toBe(4);
    expect(parsePositiveInt("0", 1)).toBe(1);
  });

  it("adapts metric based on formulation", () => {
    expect(pickMetricForFormulation({ requestedMetric: "price_per_mg", formulationCode: "cream" })).toBe("price_per_ml");
    expect(pickMetricForFormulation({ requestedMetric: "price_per_ml", formulationCode: "vial" })).toBe("price_per_mg");
  });
});
