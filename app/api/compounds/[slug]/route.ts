import { NextResponse } from "next/server";

import { defaultMetricForFormulation } from "@/lib/metrics";
import { getCompoundBySlug, getDefaultVariantId, getVariantById, getVariantFilters } from "@/lib/db/queries";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, context: RouteContext): Promise<Response> {
  const { slug } = await context.params;
  const compound = await getCompoundBySlug(slug);

  if (!compound) {
    return NextResponse.json({ error: "Compound not found" }, { status: 404 });
  }

  const [filters, defaultVariantId] = await Promise.all([getVariantFilters(compound.id), getDefaultVariantId(compound.id)]);
  const defaultVariant = defaultVariantId ? await getVariantById(defaultVariantId) : null;

  return NextResponse.json({
    compound,
    variants: filters,
    defaultVariantId,
    defaultMetric: defaultMetricForFormulation(defaultVariant?.formulationCode ?? "vial")
  });
}
