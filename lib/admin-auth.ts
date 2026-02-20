import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";

function hashToken(token: string): string {
  return crypto.createHmac("sha256", env.ADMIN_AUTH_SECRET).update(token).digest("hex");
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function adminCookieName(): string {
  return env.ADMIN_SESSION_COOKIE || "st_admin_session";
}

export async function createMagicLink(email: string, ipAddress: string | null, userAgent: string | null): Promise<string> {
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.ADMIN_MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await sql`
    insert into admin_magic_links (email, token_hash, expires_at, requested_ip, requested_user_agent)
    values (${email.toLowerCase()}, ${tokenHash}, ${expiresAt.toISOString()}, ${ipAddress}, ${userAgent})
  `;

  return token;
}

export async function consumeMagicLink(token: string, ipAddress: string | null, userAgent: string | null): Promise<boolean> {
  const tokenHash = hashToken(token);

  const records = await sql<{
    id: string;
    email: string;
    expiresAt: string;
    consumedAt: string | null;
  }[]>`
    select id, email, expires_at, consumed_at
    from admin_magic_links
    where token_hash = ${tokenHash}
    limit 1
  `;

  const record = records[0];
  if (!record || record.consumedAt) {
    return false;
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return false;
  }

  const sessionToken = generateOpaqueToken();
  const sessionHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);

  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      update admin_magic_links
      set consumed_at = now(), consumed_ip = ${ipAddress}, consumed_user_agent = ${userAgent}
      where id = ${record.id}
    `;

    await q`
      insert into admin_sessions (email, session_hash, expires_at, created_ip, created_user_agent)
      values (${record.email}, ${sessionHash}, ${expiresAt.toISOString()}, ${ipAddress}, ${userAgent})
    `;
  });

  const cookieStore = await cookies();
  cookieStore.set(adminCookieName(), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/"
  });

  return true;
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(adminCookieName());
}

export async function getAdminSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName())?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const rows = await sql<
    {
      email: string;
      expiresAt: string;
      revokedAt: string | null;
    }[]
  >`
    select email, expires_at, revoked_at
    from admin_sessions
    where session_hash = ${tokenHash}
    limit 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.revokedAt || new Date(row.expiresAt).getTime() < Date.now()) {
    return null;
  }

  return row.email;
}

export async function assertAdminSession(): Promise<string> {
  const email = await getAdminSessionEmail();
  if (!email) {
    redirect("/admin/login");
  }

  return email;
}

export async function revokeSessionToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await sql`
    update admin_sessions
    set revoked_at = now()
    where session_hash = ${tokenHash}
  `;
}
