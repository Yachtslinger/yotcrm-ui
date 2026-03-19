// GET /api/brochures/html?slug=...
// Returns the complete brochure as a raw text/html response.
// Used by the brochure iframe viewer so the template renders in its own
// document context — no YotCRM shell, no style conflicts.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";
import { generateBrochureHTML } from "@/lib/brochure-template";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return new NextResponse("slug required", { status: 400 });
  }

  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");
  const row = getBrochure(safeSlug);
  if (!row) {
    return new NextResponse("Brochure not found", { status: 404 });
  }

  const html = generateBrochureHTML(row.vessel, row.brokers || DEFAULT_BROKERS);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "no-store",
    },
  });
}
