import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getComp } from "@/lib/market-analysis/governance/comps";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const comp = getComp(parseInt(id, 10));
  return comp
    ? NextResponse.json({ ok: true, comp })
    : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
