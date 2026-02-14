import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createMagicLink } from "@/lib/admin-auth";
import { sendAdminAlert } from "@/lib/alerts";
import { env } from "@/lib/env";

const payloadSchema = z.object({
  email: z.string().email()
});

const GENERIC_OK_MESSAGE = "If your email is authorized, a magic link has been sent.";

function baseResponsePayload() {
  const emailDeliveryConfigured = Boolean(env.RESEND_API_KEY && env.ALERT_FROM_EMAIL && env.ALERT_TO_EMAIL);

  return {
    ok: true,
    message: GENERIC_OK_MESSAGE,
    ...(process.env.NODE_ENV !== "production"
      ? {
          devHint:
            emailDeliveryConfigured
              ? "Local dev: check server logs for the magic link."
              : "Local dev: email delivery is not configured. If authorized, the magic link is printed in the server logs."
        }
      : {})
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json().catch(() => null);
  const payload = payloadSchema.safeParse(body);

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const email = payload.data.email.toLowerCase();

  // Keep this endpoint non-enumerable.
  if (email !== env.ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json(baseResponsePayload());
  }

  const ipAddress = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const token = await createMagicLink(email, ipAddress, userAgent);

  const appUrl = process.env.NODE_ENV === "production" ? (env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin) : request.nextUrl.origin;
  const verificationUrl = `${appUrl}/api/admin/auth/verify?token=${token}`;

  if (process.env.NODE_ENV !== "production") {
    console.info(`[admin-auth] local magic link for ${email}: ${verificationUrl}`);
  }

  if (env.RESEND_API_KEY && env.ALERT_FROM_EMAIL && env.ALERT_TO_EMAIL) {
    try {
      await sendAdminAlert(
        "Stack Tracker admin magic link",
        `<p>Use this link to sign in:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link expires in ${env.ADMIN_MAGIC_LINK_TTL_MINUTES} minutes.</p>`
      );
    } catch (error) {
      console.warn("[admin-auth] email delivery failed", error);
    }
  }

  return NextResponse.json(baseResponsePayload());
}
