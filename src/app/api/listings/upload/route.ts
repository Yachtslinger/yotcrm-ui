import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const UPLOAD_DIR = process.env.LISTING_FILES_DIR
  || path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/app/data", "listing-files");

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/__+/g, "_")
    .substring(0, 200);
}

export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const formData = await req.formData();
    const listingId = formData.get("listing_id") as string;
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
    }

    const uploaded: { label: string; url: string; filename: string; size: number; content_b64: string }[] = [];

    for (const file of files) {
      if (!file.name || file.size === 0) continue;

      // Only allow PDFs and common doc types
      const ext = path.extname(file.name).toLowerCase();
      if (![".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"].includes(ext)) {
        continue;
      }

      // Generate unique filename: listingId_timestamp_originalname
      const ts = Date.now();
      const safe = sanitize(file.name);
      const filename = listingId ? `${listingId}_${ts}_${safe}` : `${ts}_${safe}`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // Write file
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filepath, buffer);

      const label = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
      // Include base64 content so it survives container restarts (stored in DB)
      const content_b64 = buffer.toString("base64");
      uploaded.push({
        label,
        url: `/api/listings/files/${encodeURIComponent(filename)}`,
        filename,
        size: file.size,
        content_b64,
      });
    }

    return NextResponse.json({ ok: true, files: uploaded });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
