import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { listProposals } from "@/lib/market-analysis/governance/proposals";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const vesselIdRaw = sp.get("vesselId");
  const vesselId = vesselIdRaw != null ? parseInt(vesselIdRaw, 10) : undefined;
  const status = sp.get("status") || undefined;
  return NextResponse.json({ ok: true, proposals: listProposals({ vesselId, status }) });
}
