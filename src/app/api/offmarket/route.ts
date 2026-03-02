import { NextResponse } from "next/server";
import {
  readPocketListings, createPocketListing, updatePocketListing, deletePocketListing,
  readIsoRequests, createIsoRequest, updateIsoRequest, deleteIsoRequest,
} from "@/lib/offmarket/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type");
  if (type === "iso") {
    const items = await readIsoRequests();
    return NextResponse.json({ ok: true, items });
  }
  const items = await readPocketListings();
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const type = body.type; // "pocket" or "iso"

    if (type === "iso") {
      const item = await createIsoRequest(body);
      return NextResponse.json({ ok: true, item }, { status: 201 });
    }
    const item = await createPocketListing(body);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    console.error("Failed to create offmarket item", error);
    return NextResponse.json({ ok: false, error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, type, ...updates } = body;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    if (type === "iso") {
      const item = await updateIsoRequest(Number(id), updates);
      return item
        ? NextResponse.json({ ok: true, item })
        : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const item = await updatePocketListing(Number(id), updates);
    return item
      ? NextResponse.json({ ok: true, item })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("Failed to update offmarket item", error);
    return NextResponse.json({ ok: false, error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id, type } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const deleted = type === "iso"
      ? await deleteIsoRequest(Number(id))
      : await deletePocketListing(Number(id));
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (error) {
    console.error("Failed to delete offmarket item", error);
    return NextResponse.json({ ok: false, error: "Failed to delete" }, { status: 500 });
  }
}
