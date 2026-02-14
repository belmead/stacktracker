import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSessionEmail } from "@/lib/admin-auth";
import { setCompoundCategories } from "@/lib/db/mutations";

const payloadSchema = z
  .object({
    compoundId: z.string().uuid(),
    categoryIds: z.array(z.string().uuid()).max(40),
    primaryCategoryId: z.string().uuid().nullable()
  })
  .superRefine((value, ctx) => {
    if (value.categoryIds.length === 0 && value.primaryCategoryId !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryCategoryId"],
        message: "Primary category requires at least one selected category."
      });
      return;
    }

    if (value.primaryCategoryId && !value.categoryIds.includes(value.primaryCategoryId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryCategoryId"],
        message: "Primary category must be one of the selected categories."
      });
    }
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

  try {
    await setCompoundCategories({
      compoundId: parsed.data.compoundId,
      categoryIds: parsed.data.categoryIds,
      primaryCategoryId: parsed.data.primaryCategoryId,
      actorEmail
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update categories."
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
