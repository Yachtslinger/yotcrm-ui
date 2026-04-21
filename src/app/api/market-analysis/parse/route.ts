/**
 * POST /api/market-analysis/parse
 * Accepts multipart form with one or more PDF files and a "source" label.
 * Returns extracted CompRecord[] array.
 */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { parseCompPdf } from "@/lib/market-analysis/parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const execFileAsync = promisify(execFile);

// Python script to extract raw text from PDF using pdfplumber
const EXTRACT_SCRIPT = `
import sys, json, pdfplumber

pdf_path = sys.argv[1]
pages_text = []
try:
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=True) or ""
            pages_text.append(text)
except Exception as e:
    pages_text = []

print(json.dumps({"pages": pages_text}))
`.trim();

async function extractPdfText(filePath: string): Promise<string> {
  const scriptPath = path.join(os.tmpdir(), `ma_extract_${Date.now()}.py`);
  fs.writeFileSync(scriptPath, EXTRACT_SCRIPT);
  try {
    const { stdout } = await execFileAsync("python3", [scriptPath, filePath], {
      timeout: 45000, maxBuffer: 20 * 1024 * 1024,
    });
    const data = JSON.parse(stdout.trim());
    return (data.pages as string[]).join("\n\n");
  } finally {
    fs.unlinkSync(scriptPath);
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const source = (form.get("source") as string) || "unknown";
    const results: ReturnType<typeof parseCompPdf> = [];

    const files = form.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
    }

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const tmpPath = path.join(os.tmpdir(), `ma_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, buf);
      try {
        const text = await extractPdfText(tmpPath);
        const comps = parseCompPdf(text, source);
        results.push(...comps);
      } finally {
        fs.unlinkSync(tmpPath);
      }
    }

    return NextResponse.json({ ok: true, comps: results, count: results.length });
  } catch (err) {
    console.error("market-analysis/parse error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
