import { NextRequest, NextResponse } from "next/server";
import { listThreads } from "@/lib/comms/storage";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const limit = parseInt(sp.get("limit") ?? "50");
  const offset = parseInt(sp.get("offset") ?? "0");
  const result = listThreads({ status, limit, offset });
  return NextResponse.json({ ok: true, ...result });
}
