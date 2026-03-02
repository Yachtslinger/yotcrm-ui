import { NextResponse } from "next/server";
import {
  listBuyerSearches, createBuyerSearch, updateBuyerSearch, deleteBuyerSearch,
  runMatchesForISO, getMatchesForISO,
} from "@/lib/market/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const searches = listBuyerSearches();
    return NextResponse.json({ ok: true, searches });
  } catch (err) {
    console.error("Failed to list ISO requests", err);
    return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, id, ...data } = body;

    if (action === "delete" && id) {
      const ok = deleteBuyerSearch(Number(id));
      return NextResponse.json({ ok });
    }
    if (action === "update" && id) {
      const updated = updateBuyerSearch(Number(id), data);
      if (updated) runMatchesForISO(updated.id);
      return NextResponse.json({ ok: true, search: updated });
    }
    if (action === "matches" && id) {
      const matches = getMatchesForISO(Number(id));
      return NextResponse.json({ ok: true, matches });
    }

    // Map preferences → description for backward compat
    if (data.preferences && !data.description) {
      data.description = data.preferences;
    }

    // Create + auto-match
    const search = createBuyerSearch(data);
    const matches = runMatchesForISO(search.id);
    return NextResponse.json({
      ok: true, search, matches,
      matchCount: matches.length,
    }, { status: 201 });
  } catch (err) {
    console.error("ISO request error", err);
    return NextResponse.json({ ok: false, error: "Operation failed" }, { status: 500 });
  }
}
