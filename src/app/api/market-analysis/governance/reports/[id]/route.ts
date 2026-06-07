import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getReport } from "@/lib/market-analysis/governance/reports";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (Number.isNaN(reportId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  const r = getReport(reportId);
  if (!r) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, report: r.report, sections: r.sections });
}
