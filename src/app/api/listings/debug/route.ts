import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  const uploadDir = process.env.LISTING_FILES_DIR
    || path.join(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : "/app/data", "listing-files");

  let files: string[] = [];
  let dirExists = false;
  let dirWritable = false;

  try {
    dirExists = fs.existsSync(uploadDir);
    if (dirExists) {
      files = fs.readdirSync(uploadDir);
      // Test writability
      const testFile = path.join(uploadDir, ".write-test");
      try { fs.writeFileSync(testFile, "ok"); fs.unlinkSync(testFile); dirWritable = true; } catch {}
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    env: {
      LISTING_FILES_DIR: process.env.LISTING_FILES_DIR || "(not set)",
      DB_PATH: process.env.DB_PATH || "(not set)",
      DATA_DIR: process.env.DATA_DIR || "(not set)",
    },
    resolvedUploadDir: uploadDir,
    dirExists,
    dirWritable,
    fileCount: files.length,
    files: files.slice(0, 20),
    dataExists: fs.existsSync("/data"),
    appDataExists: fs.existsSync("/app/data"),
  });
}
