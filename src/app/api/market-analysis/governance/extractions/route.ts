import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { createExtraction, listExtractions } from "@/lib/market-analysis/governance/extractions";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest) {
  if (!isGovernanceEnabled()) return notFound();
  const sp = req.nextUrl.searchParams;
  const sourceIdRaw = sp.get("sourceId");
  const targetType = sp.get("targetType") || undefined;
  const sourceId = sourceIdRaw != null ? parseInt(sourceIdRaw, 10) : undefined;
  return NextResponse.json({
    ok: true,
    extractions: listExtractions({ sourceId, targetType }),
  });
}

export async function POST(req: NextRequest) {
  if (!isGovernanceEnabled()) return notFound();
  try {
    const body = await req.json();
    const extraction = createExtraction({
      sourceId: Number(body?.sourceId),
      targetType: body?.targetType,
      targetId: body?.targetId ?? null,
      model: body?.model ?? null,
      triggeredBy: body?.triggeredBy ?? null,
      extracted: body?.extracted ?? {},
      originalStatus: body?.originalStatus ?? null,
    });
    return NextResponse.json({ ok: true, extraction });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
