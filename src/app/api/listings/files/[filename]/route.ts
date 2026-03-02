import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = process.env.LISTING_FILES_DIR
  || path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/app/data", "listing-files");

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const decoded = decodeURIComponent(filename);

  // Prevent path traversal
  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const filepath = path.join(UPLOAD_DIR, decoded);
  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(decoded).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(filepath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${decoded}"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
