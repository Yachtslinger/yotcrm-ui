import { NextRequest, NextResponse } from "next/server";
import { listMatchesForPage, updateListingMatchStatus, getMatchDetail } from "@/lib/matches/storage";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const filters = {
      batchId: sp.get("batchId") ? Number(sp.get("batchId")) : undefined,
      confidence: sp.get("confidence") || undefined,
      minScore: sp.get("minScore") ? Number(sp.get("minScore")) : undefined,
      maxScore: sp.get("maxScore") ? Number(sp.get("maxScore")) : undefined,
      make: sp.get("make") || undefined,
      yearMin: sp.get("yearMin") ? Number(sp.get("yearMin")) : undefined,
      yearMax: sp.get("yearMax") ? Number(sp.get("yearMax")) : undefined,
      loaMin: sp.get("loaMin") ? Number(sp.get("loaMin")) : undefined,
      loaMax: sp.get("loaMax") ? Number(sp.get("loaMax")) : undefined,
      budgetMin: sp.get("budgetMin") ? Number(sp.get("budgetMin")) : undefined,
      budgetMax: sp.get("budgetMax") ? Number(sp.get("budgetMax")) : undefined,
      leadStatus: sp.get("leadStatus") || undefined,
      status: sp.get("status") || undefined,
      search: sp.get("search") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : 50,
    };

    // If matchId param, return single detail
    const matchId = sp.get("matchId");
    if (matchId) {
      const detail = getMatchDetail(Number(matchId));
      if (!detail) return NextResponse.json({ error: "Match not found" }, { status: 404 });
      return NextResponse.json(detail);
    }

    const result = listMatchesForPage(filters);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[matches/list] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { matchId, status, notes } = body;

    if (!matchId || !status) {
      return NextResponse.json({ error: "matchId and status required" }, { status: 400 });
    }

    const valid = ["new", "contacted", "dismissed", "snoozed"];
    if (!valid.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Use: ${valid.join(", ")}` }, { status: 400 });
    }

    updateListingMatchStatus(Number(matchId), status, notes);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[matches/list] POST Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
