/**
 * GET /api/market-analysis/pdf?id=X
 * Renders the HTML report through puppeteer and returns a PDF.
 */
import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalysis } from "@/lib/market-analysis/storage";
import { generateMarketReport } from "@/lib/market-analysis/template";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });

  const ma = getMarketAnalysis(parseInt(id));
  if (!ma) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const html = generateMarketReport(ma, true);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", "--disable-gpu",
        "--no-first-run", "--no-zygote", "--single-process",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    const safeName = [ma.subject_year, ma.subject_make, ma.subject_model, ma.subject_vessel]
      .filter(Boolean).join("-").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-market-analysis.pdf"`,
      },
    });
  } finally {
    if (browser) await browser.close();
  }
}
