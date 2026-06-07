import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { buildVesselExport } from "@/lib/market-analysis/governance/export";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const vesselId = parseInt(id, 10);
  if (Number.isNaN(vesselId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  try {
    const exported = buildVesselExport(vesselId);
    return NextResponse.json({ ok: true, export: exported });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
