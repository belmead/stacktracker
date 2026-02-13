import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { runFinnrickSyncJob } from "@/lib/jobs/finnrick";

async function handle(request: NextRequest): Promise<Response> {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runFinnrickSyncJob();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
