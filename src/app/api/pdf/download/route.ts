import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || "/app/data/listings";

export async function GET(req: NextRequest) {
  try {
    const file = req.nextUrl.searchParams.get("file");
    if (!file) {
      return NextResponse.json({ error: "Missing file param" }, { status: 400 });
    }

    // Sanitize path to prevent directory traversal
    const safePath = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(DATA_DIR, safePath);

    if (!fullPath.startsWith(DATA_DIR) || !fullPath.endsWith(".pdf")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);
    const filename = path.basename(fullPath);

    // Use inline disposition so iOS Safari renders the PDF
    // in SFSafariViewController with a Done button (not Apple Books)
    const disposition = req.nextUrl.searchParams.get("dl") === "1"
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[API Error] GET /api/pdf/download:", message);
    return NextResponse.json({ error: "Failed to download PDF", detail: message }, { status: 500 });
  }
}
