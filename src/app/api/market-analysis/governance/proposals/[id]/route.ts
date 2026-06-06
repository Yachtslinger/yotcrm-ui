import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getProposal } from "@/lib/market-analysis/governance/proposals";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const proposal = getProposal(parseInt(id, 10));
  return proposal
    ? NextResponse.json({ ok: true, proposal })
    : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
