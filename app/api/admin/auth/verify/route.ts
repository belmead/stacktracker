import { NextRequest, NextResponse } from "next/server";

import { consumeMagicLink } from "@/lib/admin-auth";

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/admin/login?error=missing_token", request.url));
  }

  const ipAddress = request.headers.get("x-forwarded-for") ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const ok = await consumeMagicLink(token, ipAddress, userAgent);

  if (!ok) {
    return NextResponse.redirect(new URL("/admin/login?error=invalid_or_expired", request.url));
  }

  return NextResponse.redirect(new URL("/admin", request.url));
}
