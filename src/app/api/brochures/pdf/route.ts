// GET /api/brochures/pdf?slug=...
// Generates a PDF using Puppeteer with the dedicated PDF template.
//
// Uses brochure-pdf-template (print-first: A4 landscape, real cover page,
// no nav/tabs/interactive elements, all images eager-loaded) — not the
// web brochure template. The two have different constraints (paginated
// print vs. scrolling interactive web) and were previously fighting over
// one template, which produced blank cover pages, tab buttons printed as
// PDF elements, and empty gallery grids where lazy images never loaded.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";
import { generatePdfBrochureHTML } from "@/lib/brochure-pdf-template";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");

  // Load brochure data directly — no internal HTTP needed
  const row = getBrochure(safeSlug);
  if (!row) return NextResponse.json({ error: "Brochure not found" }, { status: 404 });

  const html = generatePdfBrochureHTML(row.vessel, row.brokers || DEFAULT_BROKERS);

  let browser: import("puppeteer").Browser | undefined;
  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: "new" as never,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    // A4 landscape at 96dpi: 1123 × 794. Matching the viewport to the print
    // size means the DOM lays out exactly as the printed pages will.
    await page.setViewport({ width: 1123, height: 794, deviceScaleFactor: 2 });

    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });

    // Belt-and-suspenders wait for images. networkidle0 usually suffices but
    // a large gallery can have late-arriving CDN responses; force an explicit
    // decode of every img before we snapshot.
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete && img.naturalHeight > 0
        ? Promise.resolve()
        : new Promise<void>(res => {
            img.addEventListener("load",  () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          })
      ));
    });

    // Small settle for fonts to fully render after all images resolve.
    await new Promise(r => setTimeout(r, 800));

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    await browser.close();

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeSlug}-brochure.pdf"`,
      },
    });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    const msg = err instanceof Error ? err.message : "PDF generation failed";
    console.error("[brochures/pdf]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
