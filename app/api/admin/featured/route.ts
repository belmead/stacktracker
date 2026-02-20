import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSessionEmail } from "@/lib/admin-auth";
import { updateFeaturedCompounds } from "@/lib/db/mutations";

const payloadSchema = z.object({
  orderedCompoundIds: z.array(z.string().uuid()).length(5),
  source: z.enum(["auto", "manual"]).default("manual"),
  pinned: z.boolean().default(true)
});

export async function POST(request: Request): Promise<Response> {
  const actorEmail = await getAdminSessionEmail();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await updateFeaturedCompounds({
    orderedCompoundIds: parsed.data.orderedCompoundIds,
    source: parsed.data.source,
    pinned: parsed.data.pinned,
    actorEmail
  });

  return NextResponse.json({ ok: true });
}
