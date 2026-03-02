import { NextResponse } from "next/server";
import { listMatches, updateMatchStatus } from "@/lib/market/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const status = new URL(req.url).searchParams.get("status") || undefined;
    const matches = listMatches(status);
    return NextResponse.json({ ok: true, matches });
  } catch (err) {
    console.error("Failed to list matches", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { id, status, notes } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ ok: false, error: "id and status required" }, { status: 400 });
    }
    const ok = updateMatchStatus(Number(id), status, notes);
    return NextResponse.json({ ok });
  } catch (err) {
    console.error("Match update error", err);
    return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}
