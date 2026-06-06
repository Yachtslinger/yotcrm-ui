import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getSource } from "@/lib/market-analysis/governance/sources";
import { getVessel } from "@/lib/market-analysis/governance/vessels";
import { runVesselExtraction } from "@/lib/market-analysis/governance/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const sourceId = Number(body?.sourceId);
  const vesselId = Number(body?.vesselId);
  if (!Number.isInteger(sourceId) || !Number.isInteger(vesselId)) {
    return NextResponse.json({ ok: false, error: "sourceId and vesselId are required integers" }, { status: 400 });
  }
  const source = getSource(sourceId);
  if (!source) return NextResponse.json({ ok: false, error: "source not found" }, { status: 404 });
  const vessel = getVessel(vesselId);
  if (!vessel) return NextResponse.json({ ok: false, error: "vessel not found" }, { status: 404 });

  try {
    const result = await runVesselExtraction({
      sourceId,
      vesselId,
      content: source.content_text,
      model: typeof body?.model === "string" ? (body.model as string) : undefined,
      triggeredBy: typeof body?.triggeredBy === "string" ? (body.triggeredBy as string) : null,
      createdBy: typeof body?.createdBy === "string" ? (body.createdBy as string) : null,
    });
    return NextResponse.json({ ok: true, extractionId: result.extractionId, proposals: result.proposals });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
