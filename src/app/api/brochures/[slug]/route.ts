import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const BROCHURES_DIR =
  process.env.BROCHURES_DIR ||
  path.join(process.env.HOME || "", "YotCRM", "Brochures");

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug.replace(/[^a-zA-Z0-9._-]/g, ""); // sanitize
  const filePath = path.join(BROCHURES_DIR, slug.endsWith(".html") ? slug : `${slug}.html`);

  if (!fs.existsSync(filePath)) {
    return new NextResponse("Brochure not found", { status: 404 });
  }

  const html = fs.readFileSync(filePath, "utf-8");
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
