import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { runVendorScheduledCycle } from "@/lib/jobs/vendors";

async function handle(request: NextRequest): Promise<Response> {
  if (!isAuthorizedInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runVendorScheduledCycle();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
