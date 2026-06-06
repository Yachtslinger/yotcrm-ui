import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getSource } from "@/lib/market-analysis/governance/sources";
import { getVessel } from "@/lib/market-analysis/governance/vessels";
import { runCompExtraction } from "@/lib/market-analysis/governance/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const sourceId = Number(body?.sourceId);
  if (!Number.isInteger(sourceId)) {
    return NextResponse.json({ ok: false, error: "sourceId is a required integer" }, { status: 400 });
  }
  const format = body?.format === "ai" ? "ai" : "denison";
  const source = getSource(sourceId);
  if (!source) return NextResponse.json({ ok: false, error: "source not found" }, { status: 404 });

  let vesselId: number | null = null;
  if (body?.vesselId != null) {
    vesselId = Number(body.vesselId);
    if (!Number.isInteger(vesselId)) {
      return NextResponse.json({ ok: false, error: "vesselId must be an integer when provided" }, { status: 400 });
    }
    if (!getVessel(vesselId)) return NextResponse.json({ ok: false, error: "vessel not found" }, { status: 404 });
  }

  try {
    const result = await runCompExtraction({
      sourceId,
      content: source.content_text,
      vesselId,
      format,
      sourceLabel: source.label || `source:${sourceId}`,
      model: typeof body?.model === "string" ? (body.model as string) : undefined,
      triggeredBy: typeof body?.triggeredBy === "string" ? (body.triggeredBy as string) : null,
      createdBy: typeof body?.createdBy === "string" ? (body.createdBy as string) : null,
    });
    return NextResponse.json({ ok: true, extractionId: result.extractionId, comps: result.comps });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
