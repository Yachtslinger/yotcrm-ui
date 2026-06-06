import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { resolveProposal } from "@/lib/market-analysis/governance/proposals";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";

const ACTIONS = ["accept", "edit_accept", "reject", "override"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const pid = parseInt(id, 10);
  if (Number.isNaN(pid)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const action = String(body?.action ?? "");
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be one of accept|edit_accept|reject|override" }, { status: 400 });
  }
  try {
    const result = resolveProposal(pid, {
      action: action as "accept" | "edit_accept" | "reject" | "override",
      value: typeof body?.value === "string" ? (body.value as string) : null,
      by: typeof body?.by === "string" ? (body.by as string) : null,
      notes: typeof body?.notes === "string" ? (body.notes as string) : null,
    });
    return NextResponse.json({ ok: true, proposal: result.proposal, field: result.field });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
