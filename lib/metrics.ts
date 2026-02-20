import type { MetricPriceMap, MetricType, NormalizedVariant } from "@/lib/types";

const MG_IN_G = 1000;
const ML_IN_L = 1000;
const ML_IN_OZ = 29.5735;

function toMassMg(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const normalized = unit.trim().toLowerCase();
  if (normalized === "mg") {
    return value;
  }
  if (normalized === "mcg" || normalized === "ug") {
    return value / MG_IN_G;
  }
  if (normalized === "g") {
    return value * MG_IN_G;
  }
  return null;
}

function toVolumeMl(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const normalized = unit.trim().toLowerCase();
  if (normalized === "ml") {
    return value;
  }
  if (normalized === "l") {
    return value * ML_IN_L;
  }
  if (normalized === "oz" || normalized === "fl oz") {
    return value * ML_IN_OZ;
  }
  return null;
}

export function resolveVariantTotals(input: {
  strengthValue: number | null;
  strengthUnit: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
}): Pick<
  NormalizedVariant,
  "totalMassMg" | "totalVolumeMl" | "totalCountUnits" | "packageUnit" | "packageQuantity" | "strengthUnit" | "strengthValue"
> {
  const quantity = input.packageQuantity && input.packageQuantity > 0 ? input.packageQuantity : 1;

  const totalMassMg =
    input.strengthValue && input.strengthUnit
      ? (toMassMg(input.strengthValue, input.strengthUnit) ?? 0) * quantity
      : null;

  const totalVolumeMl =
    input.strengthValue && input.strengthUnit
      ? (toVolumeMl(input.strengthValue, input.strengthUnit) ?? 0) * quantity
      : null;

  const totalCountUnits =
    input.packageUnit && ["capsule", "troche", "tablet", "unit", "dose", "spray"].includes(input.packageUnit)
      ? quantity
      : null;

  return {
    strengthValue: input.strengthValue,
    strengthUnit: input.strengthUnit,
    packageQuantity: quantity,
    packageUnit: input.packageUnit,
    totalMassMg: totalMassMg && totalMassMg > 0 ? totalMassMg : null,
    totalVolumeMl: totalVolumeMl && totalVolumeMl > 0 ? totalVolumeMl : null,
    totalCountUnits
  };
}

export function computeMetricPrices(listPriceCents: number, variant: NormalizedVariant): MetricPriceMap {
  if (!Number.isFinite(listPriceCents) || listPriceCents <= 0) {
    return {
      price_per_mg: null,
      price_per_ml: null,
      price_per_vial: null,
      price_per_unit: null
    };
  }

  const price_per_mg = variant.totalMassMg ? Number((listPriceCents / variant.totalMassMg).toFixed(4)) : null;
  const price_per_ml = variant.totalVolumeMl ? Number((listPriceCents / variant.totalVolumeMl).toFixed(4)) : null;

  const price_per_vial =
    variant.packageUnit?.toLowerCase().includes("vial") && variant.packageQuantity
      ? Number((listPriceCents / variant.packageQuantity).toFixed(2))
      : null;

  const price_per_unit =
    variant.totalCountUnits && variant.totalCountUnits > 0
      ? Number((listPriceCents / variant.totalCountUnits).toFixed(2))
      : null;

  return {
    price_per_mg,
    price_per_ml,
    price_per_vial,
    price_per_unit
  };
}

export function defaultMetricForFormulation(formulationCode: string): MetricType {
  const normalized = formulationCode.toLowerCase();

  if (normalized === "vial" || normalized === "injectable" || normalized === "lyophilized_vial") {
    return "price_per_mg";
  }

  if (normalized === "spray" || normalized === "solution" || normalized === "liquid") {
    return "price_per_ml";
  }

  if (normalized === "capsule" || normalized === "troche" || normalized === "tablet") {
    return "price_per_unit";
  }

  if (normalized === "cream" || normalized === "gel") {
    return "price_per_ml";
  }

  return "price_per_unit";
}

export function bestMetricValue(prices: MetricPriceMap, preferred: MetricType): number | null {
  const ordered: MetricType[] = [preferred, "price_per_mg", "price_per_ml", "price_per_vial", "price_per_unit"];
  for (const metric of ordered) {
    const value = prices[metric];
    if (value !== null) {
      return value;
    }
  }
  return null;
}

export function formatPriceCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export function formatMetricLabel(metric: MetricType): string {
  switch (metric) {
    case "price_per_mg":
      return "Price per mg";
    case "price_per_ml":
      return "Price per mL";
    case "price_per_vial":
      return "Price per vial";
    case "price_per_unit":
      return "Price per unit";
    default:
      return "Price";
  }
}
