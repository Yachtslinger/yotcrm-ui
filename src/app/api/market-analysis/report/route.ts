import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalysis } from "@/lib/market-analysis/storage";
import { generateMarketReport } from "@/lib/market-analysis/template";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "No id" }, { status: 400 });
  const ma = getMarketAnalysis(parseInt(id));
  if (!ma) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const html = generateMarketReport(ma);
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
