import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getVessel, getVesselFields } from "@/lib/market-analysis/governance/vessels";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const vesselId = parseInt(id, 10);
  if (Number.isNaN(vesselId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  const vessel = getVessel(vesselId);
  if (!vessel) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, vessel, fields: getVesselFields(vesselId) });
}
