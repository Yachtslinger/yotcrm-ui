// src/app/api/debug/scrape-dump/route.ts
// One-shot diagnostic: renders a URL with Puppeteer and returns raw page text
// + all image URLs so we can see exactly what the browser gets.
// Usage: GET /api/debug/scrape-dump?url=https://oceanking.it/range/range-ducale/ducale-120/
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url param required" }, { status: 400 });

  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: "new" as never,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-blink-features=AutomationControlled", "--window-size=1440,900"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    // Scroll to load lazy content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 2 / 3));
    await new Promise(r => setTimeout(r, 1000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));

    // Extract everything useful
    const dump = await page.evaluate(() => {
      // Full page text
      const bodyText = document.body.innerText;

      // All headings
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4")).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim(),
      }));

      // All dt/dd pairs
      const dtPairs = Array.from(document.querySelectorAll("dt")).map(dt => ({
        label: (dt as HTMLElement).innerText.trim(),
        value: (dt.nextElementSibling as HTMLElement)?.innerText?.trim() || "",
      }));

      // All table rows
      const tableRows: { label: string; value: string }[] = [];
      document.querySelectorAll("tr").forEach(row => {
        const cells = Array.from(row.querySelectorAll("th,td")).map(c => (c as HTMLElement).innerText.trim());
        if (cells.length >= 2 && cells[0] && cells[1]) {
          tableRows.push({ label: cells[0], value: cells[1] });
        }
      });

      // All images
      const images = Array.from(document.querySelectorAll("img")).map(img => ({
        src: img.src || img.getAttribute("data-src") || "",
        alt: img.alt || "",
        width: img.naturalWidth || img.width,
      })).filter(i => i.src && !i.src.includes("data:"));

      // All anchor hrefs pointing to images
      const imageLinks = Array.from(document.querySelectorAll("a[href]"))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(h => /\.(jpe?g|png|webp)/i.test(h));

      // class names on spec-like containers
      const specContainers = Array.from(document.querySelectorAll("[class]"))
        .filter(el => /spec|tech|detail|measure|param|charact/i.test(el.className))
        .slice(0, 20)
        .map(el => ({
          class: el.className,
          text: (el as HTMLElement).innerText.slice(0, 200),
        }));

      return { bodyText, headings, dtPairs, tableRows, images, imageLinks, specContainers };
    });

    await browser.close();

    return NextResponse.json({
      ok: true,
      url,
      bodyTextLength: dump.bodyText.length,
      bodyTextSample: dump.bodyText.slice(0, 3000),
      headings: dump.headings.slice(0, 30),
      dtPairs: dump.dtPairs.slice(0, 50),
      tableRows: dump.tableRows.slice(0, 50),
      imageCount: dump.images.length,
      images: dump.images.slice(0, 40),
      imageLinks: dump.imageLinks.slice(0, 40),
      specContainers: dump.specContainers,
    });
  } catch (err) {
    await browser.close().catch(() => {});
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
