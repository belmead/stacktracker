import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { clearAdminSession, revokeSessionToken } from "@/lib/admin-auth";
import { env } from "@/lib/env";

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.ADMIN_SESSION_COOKIE)?.value;

  if (token) {
    await revokeSessionToken(token);
  }

  await clearAdminSession();

  return NextResponse.json({ ok: true });
}
