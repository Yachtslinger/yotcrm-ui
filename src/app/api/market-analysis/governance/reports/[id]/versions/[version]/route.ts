import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getReportVersion } from "@/lib/market-analysis/governance/reports";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id, version } = await params;
  const reportId = parseInt(id, 10);
  const versionNum = parseInt(version, 10);
  if (Number.isNaN(reportId) || Number.isNaN(versionNum)) {
    return NextResponse.json({ ok: false, error: "Invalid id/version" }, { status: 400 });
  }
  const v = getReportVersion(reportId, versionNum);
  if (!v) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, version: v });
}
