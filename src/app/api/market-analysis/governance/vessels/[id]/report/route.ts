import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { createOrRefreshReport } from "@/lib/market-analysis/governance/reports";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const vesselId = parseInt(id, 10);
  if (Number.isNaN(vesselId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* all fields optional */ }
  try {
    const result = await createOrRefreshReport(vesselId, {
      mode: body?.mode,
      by: typeof body?.by === "string" ? (body.by as string) : null,
      narrative: body?.narrative === true,
    });
    return NextResponse.json({ ok: true, report: result?.report, sections: result?.sections });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
