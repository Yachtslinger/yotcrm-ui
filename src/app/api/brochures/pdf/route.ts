// GET /api/brochures/pdf?slug=...
// Generates a PDF using Puppeteer by rendering the brochure HTML directly
// (no internal HTTP request — avoids auth/network issues on Railway).
import { NextRequest, NextResponse } from "next/server";
import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";
import { generateBrochureHTML } from "@/lib/brochure-template";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const safeSlug = slug.replace(/[^a-zA-Z0-9._-]/g, "");

  // Load brochure data directly — no internal HTTP needed
  const row = getBrochure(safeSlug);
  if (!row) return NextResponse.json({ error: "Brochure not found" }, { status: 404 });

  const html = generateBrochureHTML(row.vessel, row.brokers || DEFAULT_BROKERS);

  // Determine base URL so relative assets resolve correctly
  const envBase = process.env.NEXT_PUBLIC_BASE_URL;
  const requestHost = req.headers.get("host") || "";
  const protocol = requestHost.includes("railway.app") ? "https" : "http";
  const baseUrl = envBase || (requestHost ? `${protocol}://${requestHost}` : `http://localhost:${process.env.PORT || 8080}`);

  let browser: import("puppeteer").Browser | undefined;
  try {
    const puppeteer = (await import("puppeteer")).default;
    browser = await puppeteer.launch({
      headless: "new" as never,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(45000);
    await page.setViewport({ width: 1440, height: 900 });

    // Use setContent with the base URL so fonts/images load
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 40000 });

    // Let fonts/images settle
    await new Promise(r => setTimeout(r, 2500));

    // Freeze animations, reveal all scroll-reveal elements
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; }
        .reveal { opacity: 1 !important; transform: none !important; }
        nav { position: relative !important; }`,
    });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
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
