import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { reviewComp } from "@/lib/market-analysis/governance/comps";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const cid = parseInt(id, 10);
  if (Number.isNaN(cid)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const action = String(body?.action ?? "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "action must be approve|reject" }, { status: 400 });
  }
  try {
    const comp = reviewComp(cid, { action, by: typeof body?.by === "string" ? (body.by as string) : null });
    return NextResponse.json({ ok: true, comp });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
