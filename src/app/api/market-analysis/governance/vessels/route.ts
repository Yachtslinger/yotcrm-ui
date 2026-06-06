import { NextRequest, NextResponse } from "next/server";
import { isGovernanceEnabled } from "@/lib/market-analysis/governance/flag";
import { createVessel, listVessels } from "@/lib/market-analysis/governance/vessels";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET() {
  if (!isGovernanceEnabled()) return notFound();
  return NextResponse.json({ ok: true, vessels: listVessels() });
}

export async function POST(req: NextRequest) {
  if (!isGovernanceEnabled()) return notFound();
  try {
    const body = await req.json();
    const vessel = createVessel({
      displayName: body?.displayName,
      boatId: body?.boatId ?? null,
      listingId: body?.listingId ?? null,
      createdBy: body?.createdBy ?? null,
    });
    return NextResponse.json({ ok: true, vessel });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
