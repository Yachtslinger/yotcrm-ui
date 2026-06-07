import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { finalizeReport } from "@/lib/market-analysis/governance/reports";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const reportId = parseInt(id, 10);
  if (Number.isNaN(reportId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* by is optional */ }
  try {
    const { report, version } = finalizeReport(reportId, {
      by: typeof body?.by === "string" ? (body.by as string) : null,
    });
    return NextResponse.json({ ok: true, report, version });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
