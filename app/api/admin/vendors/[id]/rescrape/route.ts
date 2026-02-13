import { NextResponse } from "next/server";

import { getAdminSessionEmail } from "@/lib/admin-auth";
import { queueManualRescrape } from "@/lib/db/mutations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_: Request, context: RouteContext): Promise<Response> {
  const actorEmail = await getAdminSessionEmail();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  await queueManualRescrape({
    vendorId: id,
    actorEmail
  });

  return NextResponse.json({ ok: true, status: "queued" });
}
