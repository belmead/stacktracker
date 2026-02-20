import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSessionEmail } from "@/lib/admin-auth";
import { createCompoundFromReview, markReviewIgnored, markReviewResolvedWithCompound } from "@/lib/db/mutations";

const resolveExistingSchema = z.object({
  action: z.literal("resolve_existing"),
  compoundId: z.string().uuid()
});

const createNewSchema = z.object({
  action: z.literal("create_new"),
  compoundName: z.string().min(2).max(120)
});

const ignoreSchema = z.object({
  action: z.literal("ignore")
});

const payloadSchema = z.union([resolveExistingSchema, createNewSchema, ignoreSchema]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const actorEmail = await getAdminSessionEmail();
  if (!actorEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.action === "resolve_existing") {
    await markReviewResolvedWithCompound({
      reviewId: id,
      compoundId: parsed.data.compoundId,
      actorEmail
    });
  } else if (parsed.data.action === "create_new") {
    await createCompoundFromReview({
      reviewId: id,
      compoundName: parsed.data.compoundName,
      actorEmail
    });
  } else {
    await markReviewIgnored({
      reviewId: id,
      actorEmail
    });
  }

  return NextResponse.json({ ok: true });
}
