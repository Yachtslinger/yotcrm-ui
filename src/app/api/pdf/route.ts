import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCRIPTS_DIR = process.env.SCRIPTS_DIR || "/app/scripts";
const DATA_DIR = process.env.DATA_DIR || "/app/data/listings";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, broker = "will", logo = "slinger" } = body as {
      url?: string; broker?: string; logo?: string;
    };

    if (!url) {
      return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
    }

    // Determine site type
    const hostname = new URL(url).hostname.toLowerCase();
    const isDenison = hostname.includes("denisonyachtsales.com");
    const isYachtWorld = hostname.includes("yachtworld.com");
    const isYatco = hostname.includes("yatco.com");


    if (!isDenison && !isYachtWorld && !isYatco) {
      return NextResponse.json(
        { ok: false, error: "Unsupported site. Use denisonyachtsales.com, yachtworld.com, or yatco.com URLs." },
        { status: 400 }
      );
    }

    // Step 1: Extract listing data
    // For Denison and YachtWorld: use the unified extractListingData.js
    // For YATCO: use legacy scraper
    let scrapeCmd: string;
    if (isYatco) {
      const scrapeScript = path.join(SCRIPTS_DIR, "scrapeYatco.js");
      scrapeCmd = `node "${scrapeScript}" "${url}"`;
    } else {
      const extractScript = path.join(SCRIPTS_DIR, "lib", "extractListingData.js");
      scrapeCmd = `node "${extractScript}" "${url}"`;
    }

    try {
      execSync(scrapeCmd, {
        cwd: path.dirname(SCRIPTS_DIR),
        timeout: 60000,
        stdio: "pipe",
        env: { ...process.env, DATA_DIR },
      });
    } catch (scrapeErr: unknown) {
      const stderr = scrapeErr instanceof Error && "stderr" in scrapeErr
        ? String((scrapeErr as { stderr: unknown }).stderr) : "";
      const stdout = scrapeErr instanceof Error && "stdout" in scrapeErr
        ? String((scrapeErr as { stdout: unknown }).stdout) : "";
      return NextResponse.json({
        ok: false,
        error: `Scraping failed: ${stderr || stdout || (scrapeErr instanceof Error ? scrapeErr.message : "Unknown")}`,
      }, { status: 502 });
    }

    // Step 2: Find most recently created listing directory
    const dirs = fs.readdirSync(DATA_DIR)
      .map(d => ({ name: d, fullPath: path.join(DATA_DIR, d) }))
      .filter(d => fs.statSync(d.fullPath).isDirectory())
      .sort((a, b) => fs.statSync(b.fullPath).mtimeMs - fs.statSync(a.fullPath).mtimeMs);

    if (dirs.length === 0) {
      return NextResponse.json({ ok: false, error: "No listing directory found after scrape" }, { status: 500 });
    }
    const listingDir = dirs[0].fullPath;
    const listingName = dirs[0].name;

    const jsonPath = path.join(listingDir, "listing.json");
    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ ok: false, error: "Scraper ran but produced no data." }, { status: 502 });
    }
    const scraped = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    if (!scraped.title && !scraped.price) {
      return NextResponse.json({ ok: false, error: "Scraper got empty data — likely blocked by bot protection." }, { status: 502 });
    }


    // Step 3: Generate PDF
    const brokerFlag = ["will", "paolo", "both"].includes(broker) ? broker : "will";
    const logoFlag = ["slinger", "denison"].includes(logo) ? logo : "slinger";
    const pdfScript = path.join(SCRIPTS_DIR, "generateListingPDF.js");
    try {
      execSync(`node "${pdfScript}" "${listingDir}" --broker=${brokerFlag} --logo=${logoFlag}`, {
        cwd: path.dirname(SCRIPTS_DIR),
        timeout: 60000,
        stdio: "pipe",
      });
    } catch (pdfErr: unknown) {
      const stderr = pdfErr instanceof Error && "stderr" in pdfErr
        ? String((pdfErr as { stderr: unknown }).stderr) : "";
      return NextResponse.json({
        ok: false,
        error: `PDF generation failed: ${stderr || (pdfErr instanceof Error ? pdfErr.message : "Unknown")}`,
      }, { status: 500 });
    }

    // Step 4: Return the PDF info
    const suffix = brokerFlag === "will" ? "" : `-${brokerFlag}`;
    const expectedName = `${listingName}${suffix}.pdf`;
    const expectedPath = path.join(listingDir, expectedName);

    if (!fs.existsSync(expectedPath)) {
      return NextResponse.json({ ok: false, error: "PDF generation completed but file not found" }, { status: 500 });
    }

    const stat = fs.statSync(expectedPath);
    return NextResponse.json({
      ok: true,
      listing: listingName,
      metadata: scraped,
      pdfs: [{
        name: expectedName,
        size: stat.size,
        downloadUrl: `/api/pdf/download?file=${encodeURIComponent(listingName + "/" + expectedName)}`,
      }],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


// GET: List all existing PDFs
export async function GET() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return NextResponse.json({ ok: true, listings: [] });
    }
    const listings = fs.readdirSync(DATA_DIR)
      .map(d => {
        const dirPath = path.join(DATA_DIR, d);
        if (!fs.statSync(dirPath).isDirectory()) return null;
        const pdfs = fs.readdirSync(dirPath).filter(f => f.endsWith(".pdf"));
        if (pdfs.length === 0) return null;
        let metadata: Record<string, unknown> = {};
        const jsonPath = path.join(dirPath, "listing.json");
        if (fs.existsSync(jsonPath)) {
          try { metadata = JSON.parse(fs.readFileSync(jsonPath, "utf-8")); } catch {}
        }
        return {
          name: d, metadata,
          pdfs: pdfs.map(p => ({
            name: p, size: fs.statSync(path.join(dirPath, p)).size,
            downloadUrl: `/api/pdf/download?file=${encodeURIComponent(d + "/" + p)}`,
          })),
          created: fs.statSync(dirPath).mtimeMs,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.created || 0) - (a?.created || 0));
    return NextResponse.json({ ok: true, listings });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

// DELETE: Remove a specific PDF or entire listing
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { listing, pdf } = body as { listing?: string; pdf?: string };
    if (!listing) {
      return NextResponse.json({ ok: false, error: "Missing listing name" }, { status: 400 });
    }
    const safeListing = listing.replace(/[^a-zA-Z0-9._-]/g, "");
    const listingDir = path.join(DATA_DIR, safeListing);
    if (!listingDir.startsWith(DATA_DIR) || !fs.existsSync(listingDir)) {
      return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });
    }
    if (pdf) {
      const safePdf = pdf.replace(/[^a-zA-Z0-9._-]/g, "");
      const pdfPath = path.join(listingDir, safePdf);
      if (fs.existsSync(pdfPath) && pdfPath.endsWith(".pdf")) fs.unlinkSync(pdfPath);
      const remaining = fs.readdirSync(listingDir).filter(f => f.endsWith(".pdf"));
      if (remaining.length === 0) {
        fs.rmSync(listingDir, { recursive: true, force: true });
        return NextResponse.json({ ok: true, deleted: "listing", listing: safeListing });
      }
      return NextResponse.json({ ok: true, deleted: "pdf", file: safePdf });
    } else {
      fs.rmSync(listingDir, { recursive: true, force: true });
      return NextResponse.json({ ok: true, deleted: "listing", listing: safeListing });
    }
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
