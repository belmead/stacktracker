import { NextResponse } from "next/server";

import { getCompoundBySlug, getDefaultVariantId, getTrendPoints, getVariantByFilter, getVariantById } from "@/lib/db/queries";
import { parseMetric, parseTrendRange, pickMetricForFormulation } from "@/lib/request";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { slug } = await context.params;
  const compound = await getCompoundBySlug(slug);

  if (!compound) {
    return NextResponse.json({ error: "Compound not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const requestedMetric = parseMetric(searchParams.get("metric"), "price_per_mg");
  const range = parseTrendRange(searchParams.get("range"), "1m");

  const selectedVariantId = searchParams.get("variantId");
  let variant = selectedVariantId ? await getVariantById(selectedVariantId) : null;

  if (!variant) {
    variant = await getVariantByFilter({
      compoundId: compound.id,
      formulationCode: searchParams.get("formulation"),
      sizeLabel: searchParams.get("size")
    });
  }

  if (!variant) {
    const defaultVariantId = await getDefaultVariantId(compound.id);
    variant = defaultVariantId ? await getVariantById(defaultVariantId) : null;
  }

  if (!variant) {
    return NextResponse.json({ error: "No variants found for this compound" }, { status: 404 });
  }

  const metric = pickMetricForFormulation({
    requestedMetric,
    formulationCode: variant.formulationCode
  });

  const points = await getTrendPoints({
    variantId: variant.id,
    metric,
    range
  });

  return NextResponse.json({
    compound,
    variant,
    metric,
    range,
    points
  });
}
