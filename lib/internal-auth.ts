import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

export function isAuthorizedInternalRequest(request: NextRequest): boolean {
  if (request.headers.has("x-vercel-cron")) {
    return true;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return false;
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  return token === env.CRON_SECRET;
}
