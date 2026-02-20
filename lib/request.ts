import type { MetricType, TrendRange } from "@/lib/types";

const METRICS: MetricType[] = ["price_per_mg", "price_per_ml", "price_per_vial", "price_per_unit"];
const RANGES: TrendRange[] = ["1w", "1m", "6m", "1y"];

export function parseMetric(value: string | null | undefined, fallback: MetricType = "price_per_mg"): MetricType {
  if (value && METRICS.includes(value as MetricType)) {
    return value as MetricType;
  }
  return fallback;
}

export function parseTrendRange(value: string | null | undefined, fallback: TrendRange = "1m"): TrendRange {
  if (value && RANGES.includes(value as TrendRange)) {
    return value as TrendRange;
  }
  return fallback;
}

export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function pickMetricForFormulation(input: {
  requestedMetric: MetricType;
  formulationCode: string;
}): MetricType {
  const formulation = input.formulationCode.toLowerCase();

  if (formulation === "vial" || formulation === "injectable" || formulation === "lyophilized_vial") {
    return input.requestedMetric === "price_per_ml" ? "price_per_mg" : input.requestedMetric;
  }

  if (formulation === "cream" || formulation === "solution" || formulation === "spray" || formulation === "gel") {
    if (input.requestedMetric === "price_per_mg") {
      return "price_per_ml";
    }
  }

  if (formulation === "capsule" || formulation === "troche" || formulation === "tablet") {
    if (input.requestedMetric === "price_per_mg" || input.requestedMetric === "price_per_ml") {
      return "price_per_unit";
    }
  }

  return input.requestedMetric;
}
