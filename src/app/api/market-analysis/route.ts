import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalyses, getMarketAnalysis, saveMarketAnalysis, updateMarketAnalysis, deleteMarketAnalysis } from "@/lib/market-analysis/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const a = getMarketAnalysis(parseInt(id));
    return a ? NextResponse.json({ ok: true, analysis: a }) : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, analyses: getMarketAnalyses() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = saveMarketAnalysis(body);
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  updateMarketAnalysis(id, data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "No id" }, { status: 400 });
  deleteMarketAnalysis(parseInt(id));
  return NextResponse.json({ ok: true });
}
