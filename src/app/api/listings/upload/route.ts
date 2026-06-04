import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120; // allow multi-file batches to complete

// Notes on body size on the App Router:
//   - Next.js 15 Route Handlers stream the request body — Next itself
//     doesn't cap it (unlike Server Actions, which are limited by
//     next.config.ts's serverActions.bodySizeLimit).
//   - The 'spins then nothing' failure on large photo batches was driven by
//     the response, not the request: every uploaded file was being base64-
//     encoded and shipped back in JSON (so the route could optionally
//     re-attach the bytes for outbound email). 5 phone photos at 5 MB each
//     produced a ~33 MB JSON response — slow, memory-heavy, and on Railway
//     occasionally times out before reaching the client. Images don't need
//     this round-trip (they're referenced by URL); PDFs do (email attaches
//     them later). The conditional base64 below fixes that.

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

      // Only allow PDFs, common doc types, and common image formats
      const ext = path.extname(file.name).toLowerCase();
      if (![".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".tiff", ".tif", ".bmp"].includes(ext)) {
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
      // Base64-in-response is only needed for PDFs/docs that get re-attached
      // to outbound emails (see /api/listings/send). Images are referenced by
      // URL only, so skipping the base64 round-trip there cuts the response
      // size by ~33% and avoids ballooning a 50 MB photo batch into a 67 MB
      // JSON payload.
      const isImage = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".tiff", ".tif", ".bmp"].includes(ext);
      uploaded.push({
        label,
        url: `/api/listings/files/${encodeURIComponent(filename)}`,
        filename,
        size: file.size,
        content_b64: isImage ? "" : buffer.toString("base64"),
      });
    }

    return NextResponse.json({ ok: true, files: uploaded });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
