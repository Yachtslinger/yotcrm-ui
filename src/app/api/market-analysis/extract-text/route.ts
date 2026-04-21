/**
 * POST /api/market-analysis/extract-text
 * Accepts a PDF file, extracts all raw text, and returns it.
 * Used for supplemental analysis PDFs (Denison reports, YachtWorld exports, etc.)
 * The text is passed to Claude as additional context during analysis generation.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

const EXTRACT_SCRIPT = `
import sys, json, warnings
warnings.filterwarnings("ignore")
import pdfplumber

pdf_path = sys.argv[1]
pages = []
try:
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
except Exception as e:
    pages = []

full_text = "\\n\\n".join(pages)
print(json.dumps({"text": full_text, "pages": len(pages)}))
`.trim();

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `ma_supp_${Date.now()}.pdf`);
    const scriptPath = path.join(os.tmpdir(), `ma_supp_script_${Date.now()}.py`);
    fs.writeFileSync(tmpPath, buf);
    fs.writeFileSync(scriptPath, EXTRACT_SCRIPT);

    try {
      const { stdout } = await execFileAsync("python3", [scriptPath, tmpPath], {
        timeout: 45000, maxBuffer: 10 * 1024 * 1024,
      });
      const data = JSON.parse(stdout.trim());
      return NextResponse.json({ ok: true, text: data.text, pages: data.pages, fileName: file.name });
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    }
  } catch (err) {
    console.error("extract-text error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
