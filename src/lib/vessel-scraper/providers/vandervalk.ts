/**
 * Van der Valk Shipyard scraper — vandervalkshipyard.com
 *
 * Key quirks:
 *  - <h1> contains a logo <img>, NOT the vessel name — never use h1 text
 *  - Vessel name is in og:title or the URL slug (/fleet/one/ → "ONE")
 *  - Hero image: og:image is reliable; gallery uses data-src lazy loading
 *  - Specs in dl/dt/dd, two-column tables, and flex spec-item blocks
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

export async function scrapeVanDerValk(url: string): Promise<VesselData> {
  // Try direct fetch first (fast, works on Railway without headless Chrome)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      // Check we got real content (not a JS-only shell)
      if (html.includes("key-specs") || html.includes("other-specs") || html.includes("LOA")) {
        return parseVanDerValk(url, html);
      }
    }
  } catch { /* fall through to Puppeteer */ }

  // Puppeteer fallback for JS-rendered content
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    headless: "new" as never,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--disable-blink-features=AutomationControlled"],
  });
  let html = "";
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 50000 });
    await new Promise(r => setTimeout(r, 3500));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));
    html = await page.content();
  } finally {
    await browser.close();
  }
  return parseVanDerValk(url, html);
}

export function parseVanDerValk(url: string, html: string): VesselData {
  const $ = cheerio.load(html);
  const vessel = emptyVessel(url);

  vessel.builder = "Van der Valk Continental Shipyards";

  // ── Name: NEVER h1 (it contains the logo img) ────────────────────────────
  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const pgTitle = $("title").text() || "";
  const slugMatch = url.match(/\/fleet\/([^/?#]+)/i);
  const slugName = slugMatch
    ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : "";
  vessel.name = cleanHeadline(ogTitle) || cleanHeadline(pgTitle) || slugName || "";

  // ── Description ───────────────────────────────────────────────────────────
  const ogDesc = clean($('meta[property="og:description"]').attr("content") || "");
  if (ogDesc.length > 80) {
    vessel.description = ogDesc;
  } else {
    const paras: string[] = [];
    $("main p, article p, .entry-content p, .content p, section p").each((_, el) => {
      const t = clean($(el).text());
      if (t.length > 80 && !/cookie|privacy|©|copyright/i.test(t)) paras.push(t);
    });
    vessel.description = paras.slice(0, 4).join("\n\n");
  }

  // ── Specs ─────────────────────────────────────────────────────────────────
  // 1. .key-specs: <div><strong>LOA</strong><span>34.13m</span></div>
  $(".key-specs div, .key-specs > *").each((_, el) => {
    const label = $(el).find("strong").first().text();
    const value = $(el).find("span").first().text();
    if (label && value) assignSpec(vessel, label, value);
  });

  // 2. .other-specs columns: <p><strong>Label</strong><br/>Value<br/>...</p>
  $(".other-specs p").each((_, p) => {
    const html = $(p).html() || "";
    // Split on <br> variants then pair strong/text
    const parts = html.split(/<br\s*\/?>/i);
    for (let i = 0; i < parts.length - 1; i++) {
      const strongMatch = parts[i].match(/<strong[^>]*>(.*?)<\/strong>/i);
      if (strongMatch) {
        const label = strongMatch[1].replace(/<[^>]+>/g, "").trim();
        // Value is the next part (strip any remaining tags)
        const val = parts[i + 1].replace(/<[^>]+>/g, "").trim();
        if (label && val) assignSpec(vessel, label, val);
      }
    }
  });

  // 3. dl/dt/dd (VdV's primary spec pattern on some pages)
  $("dl").each((_, dl) => {
    $(dl).find("dt").each((_, dt) => {
      assignSpec(vessel, $(dt).text(), $(dt).next("dd").text());
    });
  });
  // 4. Tables
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length >= 2) assignSpec(vessel, cells.eq(0).text(), cells.eq(1).text());
  });
  // 5. Flex/grid spec blocks (other sites)
  $(".spec, .spec-item, .specification__item, .specs__item, .tech-specs__item, .specification-item, [class*='spec-row']").each((_, el) => {
    const ch = $(el).children().toArray();
    if (ch.length >= 2) assignSpec(vessel, $(ch[0]).text(), $(ch[1]).text());
  });
  // 6. inline label: value in p/li
  $("p, li").each((_, el) => {
    if ($(el).children("a,p,div,ul,ol").length > 0) return;
    const text = clean($(el).text());
    const m = text.match(/^([A-Z][^:]{2,50}):\s*(.{1,250})$/);
    if (m) assignSpec(vessel, m[1], m[2]);
  });

  // ── Images ────────────────────────────────────────────────────────────────
  const rawImgs: { src: string; alt: string }[] = [];

  // og:image — always the best hero
  const ogImg = $('meta[property="og:image"]').attr("content");
  if (ogImg && !isJunk(ogImg)) rawImgs.push({ src: ogImg, alt: vessel.name });

  // Swiper/gallery with data-src (lazy loaded)
  $(".swiper-slide img, .gallery img, .gallery-item img, figure img, .lightbox img").each((_, img) => {
    const src = $(img).attr("data-src") || $(img).attr("data-lazy-src") || $(img).attr("data-lazy") || $(img).attr("src") || "";
    const alt = clean($(img).attr("alt") || "");
    if (src && !isJunk(src)) rawImgs.push({ src: toAbs(src, url), alt });
  });

  // Anchor-wrapped lightbox images
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/\.(jpe?g|png|webp)/i.test(href) && !isJunk(href)) {
      rawImgs.push({ src: toAbs(href, url), alt: "" });
    }
  });

  // Background images in style attributes
  $("[style]").each((_, el) => {
    const m = ($(el).attr("style") || "").match(/url\(['"]?([^'")\s]+\.(?:jpe?g|png|webp))/i);
    if (m && !isJunk(m[1])) rawImgs.push({ src: toAbs(m[1], url), alt: "" });
  });

  // General fallback — all img tags with data-src or src
  $("img").each((_, img) => {
    const src = $(img).attr("data-src") || $(img).attr("data-lazy-src") || $(img).attr("data-lazy") || $(img).attr("src") || "";
    const alt = clean($(img).attr("alt") || "");
    if (src && /\.(jpe?g|png|webp)/i.test(src) && !isJunk(src)) {
      rawImgs.push({ src: toAbs(src, url), alt });
    }
  });

  vessel.images = dedupeImages(rawImgs);

  // ── Features ─────────────────────────────────────────────────────────────
  const feats: string[] = [];
  $("ul li, ol li").each((_, li) => {
    if ($(li).closest("nav,footer,header,.menu").length) return;
    const t = clean($(li).text());
    if (t.length > 8 && t.length < 200 && !/menu|home|contact|privacy|cookie|©/i.test(t)) feats.push(t);
  });
  vessel.features = [...new Set(feats)].slice(0, 30);

  if (!vessel.location) vessel.location = "The Netherlands";

  return vessel;
}

function toAbs(src: string, base: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  try { return new URL(src, base).href; } catch { return src; }
}

function isJunk(src: string): boolean {
  return /logo|icon|sprite|pixel|flag|avatar|favicon|\.svg|placeholder/i.test(src);
}
