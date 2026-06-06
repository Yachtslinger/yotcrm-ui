import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { listComps } from "@/lib/market-analysis/governance/comps";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const vesselIdRaw = sp.get("vesselId");
  const vesselId = vesselIdRaw != null ? parseInt(vesselIdRaw, 10) : undefined;
  const status = sp.get("status") || undefined;
  const type = sp.get("type") || undefined;
  return NextResponse.json({ ok: true, comps: listComps({ vesselId, status, type }) });
}
