import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createMagicLink } from "@/lib/admin-auth";
import { sendAdminAlert } from "@/lib/alerts";
import { env } from "@/lib/env";

const payloadSchema = z.object({
  email: z.string().email()
});

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  const payload = payloadSchema.safeParse(body);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = payload.data.email.toLowerCase();

  // Keep this endpoint non-enumerable.
  if (email !== env.ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ ok: true });
  }

  const ipAddress = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const token = await createMagicLink(email, ipAddress, userAgent);

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const verificationUrl = `${appUrl}/api/admin/auth/verify?token=${token}`;

  await sendAdminAlert(
    "Stack Tracker admin magic link",
    `<p>Use this link to sign in:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link expires in ${env.ADMIN_MAGIC_LINK_TTL_MINUTES} minutes.</p>`
  );

  return NextResponse.json({
    ok: true,
    ...(process.env.NODE_ENV !== "production" ? { devMagicLink: verificationUrl } : {})
  });
}
