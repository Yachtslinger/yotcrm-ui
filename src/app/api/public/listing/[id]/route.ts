import { NextRequest, NextResponse } from "next/server";
import { readListing } from "@/lib/listings/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = readListing(Number(id));
  if (!listing || listing.status === "withdrawn") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, listing });
}
