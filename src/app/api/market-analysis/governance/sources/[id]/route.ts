import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { getSource } from "@/lib/market-analysis/governance/sources";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const source = getSource(parseInt(id, 10));
  return source
    ? NextResponse.json({ ok: true, source })
    : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
