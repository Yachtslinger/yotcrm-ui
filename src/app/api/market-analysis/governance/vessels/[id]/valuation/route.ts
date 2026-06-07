import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getVessel } from "@/lib/market-analysis/governance/vessels";
import { runGovernedValuation } from "@/lib/market-analysis/governance/valuation";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const vesselId = parseInt(id, 10);
  if (Number.isNaN(vesselId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  if (!getVessel(vesselId)) return NextResponse.json({ ok: false, error: "vessel not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* mode optional */ }
  try {
    const r = runGovernedValuation(vesselId, { mode: body?.mode });
    return NextResponse.json({
      ok: true, mode: r.mode, subject: r.subject, valuation: r.valuation,
      soldCompCount: r.soldCompCount, activeCompCount: r.activeCompCount, sufficient: r.sufficient,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
