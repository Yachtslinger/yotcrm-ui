import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getExtraction } from "@/lib/market-analysis/governance/extractions";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const row = getExtraction(parseInt(id, 10));
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  let extracted: unknown = null;
  try { extracted = JSON.parse(row.extracted_json); } catch { extracted = row.extracted_json; }
  return NextResponse.json({ ok: true, extraction: { ...row, extracted } });
}
