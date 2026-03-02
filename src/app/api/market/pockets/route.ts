import { NextResponse } from "next/server";
import { readPocketListings, createPocketListing, updatePocketListing, deletePocketListing } from "@/lib/offmarket/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const listings = await readPocketListings();
    return NextResponse.json({ ok: true, listings });
  } catch (err) {
    console.error("Failed to list pocket listings", err);
    return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;
    if (action === "delete" && id) {
      const ok = await deletePocketListing(Number(id));
      return NextResponse.json({ ok });
    }
    if (action === "update" && id) {
      const updated = await updatePocketListing(Number(id), data);
      return NextResponse.json({ ok: true, listing: updated });
    }
    const listing = await createPocketListing(data);
    return NextResponse.json({ ok: true, listing }, { status: 201 });
  } catch (err) {
    console.error("Pocket listing error", err);
    return NextResponse.json({ ok: false, error: "Operation failed" }, { status: 500 });
  }
}
