import { NextResponse } from "next/server";

import {
  getCompoundBySlug,
  getDefaultVariantId,
  getOffersForVariant,
  getVariantByFilter,
  getVariantById
} from "@/lib/db/queries";
import { parseMetric, parsePositiveInt, pickMetricForFormulation } from "@/lib/request";

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
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 10), 20);

  const requestedMetric = parseMetric(searchParams.get("metric"), "price_per_mg");
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

  const offers = await getOffersForVariant({
    variantId: variant.id,
    metric,
    page,
    pageSize
  });

  return NextResponse.json({
    compound,
    variant,
    metric,
    ...offers
  });
}
