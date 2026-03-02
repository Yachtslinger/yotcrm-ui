import { NextResponse } from "next/server";
import {
  listVesselOwners, createVesselOwner, updateVesselOwner, deleteVesselOwner,
  runMatchesForOwner, getMatchesForOwner,
} from "@/lib/market/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const owners = listVesselOwners();
    return NextResponse.json({ ok: true, owners });
  } catch (err) {
    console.error("Failed to list owners", err);
    return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === "delete" && id) {
      const ok = deleteVesselOwner(Number(id));
      return NextResponse.json({ ok });
    }
    if (action === "update" && id) {
      const updated = updateVesselOwner(Number(id), data);
      // Re-run matches after update
      if (updated) runMatchesForOwner(updated.id);
      return NextResponse.json({ ok: true, owner: updated });
    }
    if (action === "matches" && id) {
      const matches = getMatchesForOwner(Number(id));
      return NextResponse.json({ ok: true, matches });
    }

    // Default: create + auto-match
    const owner = createVesselOwner(data);
    const matches = runMatchesForOwner(owner.id);
    return NextResponse.json({
      ok: true, owner, matches,
      matchCount: matches.length,
    }, { status: 201 });
  } catch (err) {
    console.error("Owner error", err);
    return NextResponse.json({ ok: false, error: "Operation failed" }, { status: 500 });
  }
}
