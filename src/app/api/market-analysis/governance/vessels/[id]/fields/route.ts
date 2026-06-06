import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { setVesselField, verifyVesselField } from "@/lib/market-analysis/governance/vessels";
import { GovError } from "@/lib/market-analysis/governance/errors";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isGovernanceEnabled()) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { id } = await params;
  const vesselId = parseInt(id, 10);
  if (Number.isNaN(vesselId)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const fieldKey = String(body?.fieldKey ?? "").trim();
  const action = String(body?.action ?? "");
  const by = typeof body?.by === "string" ? (body.by as string) : null;
  if (!fieldKey) return NextResponse.json({ ok: false, error: "fieldKey is required" }, { status: 400 });
  if (action !== "set" && action !== "verify") {
    return NextResponse.json({ ok: false, error: "action must be set|verify" }, { status: 400 });
  }
  try {
    if (action === "set") {
      if (body?.value == null || String(body.value).trim() === "") {
        return NextResponse.json({ ok: false, error: "value is required for set" }, { status: 400 });
      }
      const field = setVesselField(vesselId, fieldKey, String(body.value), by);
      return NextResponse.json({ ok: true, field });
    }
    const field = verifyVesselField(vesselId, fieldKey, by);
    return NextResponse.json({ ok: true, field });
  } catch (err) {
    if (err instanceof GovError) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
