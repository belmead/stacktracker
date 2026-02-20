import { NextResponse } from "next/server";

import { getCompoundSelectorOptions, getHomePayload } from "@/lib/db/queries";
import { parseMetric } from "@/lib/request";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const metric = parseMetric(searchParams.get("metric"), "price_per_mg");

  const [home, compounds] = await Promise.all([getHomePayload(metric), getCompoundSelectorOptions()]);

  return NextResponse.json({
    metric,
    heroHeadline: home.heroHeadline,
    heroSubhead: home.heroSubhead,
    compounds,
    cards: home.cards
  });
}
