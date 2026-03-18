/**
 * YachtWorld scraper — v3
 * YachtWorld uses a React SPA. After JS runs:
 *   - window.digitalData.product[0].productInfo  → name, price, location, year, specs
 *   - document.querySelectorAll('img[src*="boatsgroup"]') → all gallery images
 *   - document.querySelector('h1')               → vessel title
 *   - URL slug                                    → year / make / model fallback
 */
import puppeteer from "puppeteer";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages, assignSpec } from "../utils";

// ── URL slug parser ───────────────────────────────────────────────────────────
function parseSlug(url: string): Partial<VesselData> {
  const slug = url.split("/").filter(Boolean).pop() || "";
  const result: Partial<VesselData> = {};
  const yearMatch = slug.match(/^(\d{4})-/);
  if (yearMatch) result.year = parseInt(yearMatch[1]);
  const idMatch = slug.match(/-(\d{6,8})$/);
  const listingId = idMatch?.[1] || null;
  if (yearMatch && listingId) {
    const middle = slug.replace(/^\d{4}-/, "").replace(/-?\d{6,8}$/, "");
    const words = middle.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1));
    result.builder = words[0] || "";
    result.name = `${result.year} ${words.join(" ")}`;
  }
  return result;
}

function upscale(src: string): string {
  if (!src) return src;
  return src
    .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/g, "")
    .replace(/[?&]exact/g, "")
    .replace(/[?&]ratio=[^&]+/g, "")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/, "");
}

export async function scrapeYachtWorld(url: string): Promise<VesselData> {
  const slugData = parseSlug(url);
  const vessel = emptyVessel(url);

  // Seed from slug immediately — these are always available
  if (slugData.name)    vessel.name    = slugData.name;
  if (slugData.year)    vessel.year    = slugData.year;
  if (slugData.builder) vessel.builder = slugData.builder;

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    // Stealth: hide automation signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      (window as any).chrome = { runtime: {} };
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    // Give analytics scripts (digitalData) extra time to populate after network idle
    await new Promise(r => setTimeout(r, 2000));

    // ── Extract everything via page.evaluate() ────────────────────────────
    const extracted = await page.evaluate(() => {
      // 1. window.digitalData.product — rich structured data YachtWorld sets after React hydrates
      const dd = (window as any).digitalData;
      const product = dd?.product?.[0]?.productInfo || dd?.product?.productInfo || null;

      // 2. All boatsgroup gallery images (rendered src attributes, not data-src)
      const imgEls = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
      const imageSrcs = imgEls
        .map(img => img.getAttribute("data-src") || img.src || "")
        .filter(src => src.includes("boatsgroup.com") && !/(logo|icon|sprite|flag|avatar)/i.test(src));

      // 3. DOM fallbacks
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      const priceEl = (
        document.querySelector('[data-testid="listing-price"]') ||
        document.querySelector('[class*="listingPrice"]') ||
        document.querySelector('[class*="price-display"]') ||
        Array.from(document.querySelectorAll('[class*="price" i]'))
          .find(el => /US\$|\$[\d,]{4}/.test(el.textContent || ""))
      );
      const priceText = priceEl?.textContent?.trim() || "";

      const locationEl = (
        document.querySelector('[data-testid*="location"]') ||
        document.querySelector('[class*="location" i]')
      );
      const locationText = locationEl?.textContent?.trim() || "";

      // 4. Spec items from DOM
      const specRows: { label: string; value: string }[] = [];
      document.querySelectorAll("dl dt").forEach(dt => {
        const dd2 = dt.nextElementSibling;
        if (dd2?.tagName === "DD") {
          specRows.push({ label: dt.textContent?.trim() || "", value: dd2.textContent?.trim() || "" });
        }
      });
      document.querySelectorAll('[data-testid*="spec"], [class*="spec-row"], [class*="specRow"]').forEach(el => {
        const label = el.querySelector('[class*="label" i], [class*="key" i], strong')?.textContent?.trim() || "";
        const value = el.querySelector('[class*="value" i], [class*="data" i], span:last-child')?.textContent?.trim() || "";
        if (label && value) specRows.push({ label, value });
      });

      // 5. Description
      const descEl = document.querySelector('[data-testid*="description"], [class*="description" i] p');
      const description = descEl?.textContent?.trim() || "";

      return { product, imageSrcs, h1, priceText, locationText, specRows, description };
    });

    // ── Map extracted data to vessel ──────────────────────────────────────

    // From window.digitalData.product — always overrides slug (more authoritative)
    if (extracted.product) {
      const p = extracted.product;
      // Always overwrite slug data with real product data
      if (p.manufacturer) vessel.builder = clean(String(p.manufacturer));
      if (p.yearBuilt)    vessel.year    = parseInt(String(p.yearBuilt));
      if (p.listedPrice) {
        const n = parseFloat(String(p.listedPrice).replace(/[^0-9.]/g, ""));
        if (!isNaN(n) && n > 10000) vessel.price = `$${n.toLocaleString("en-US")}`;
      }
      const nameParts = [p.yearBuilt, p.manufacturer, p.model].filter(Boolean);
      if (nameParts.length) vessel.name = cleanHeadline(nameParts.join(" ")) || vessel.name;
      if (p.location && !vessel.location) {
        const loc = p.location;
        vessel.location = [loc.city, loc.stateProvince, loc.country]
          .filter(Boolean)
          .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(", ");
      }
      if (p.boatLength && !vessel.loa) vessel.loa = `${p.boatLength} ft`;
    }

    // Title from H1
    if (extracted.h1 && (!vessel.name || vessel.name === slugData.name)) {
      vessel.name = cleanHeadline(extracted.h1) || vessel.name;
    }

    // Price from DOM — only use if digitalData didn't provide it
    // Target the main listing price, not related listing prices
    if (!vessel.price && extracted.priceText) {
      const priceMatch = extracted.priceText.match(/US\$([\d,]+)/);
      if (priceMatch) vessel.price = `$${priceMatch[1]}`;
    }

    // Location from DOM
    if (!vessel.location && extracted.locationText) {
      vessel.location = extracted.locationText;
    }

    // Spec rows from DOM
    for (const row of extracted.specRows) {
      if (row.label && row.value) assignSpec(vessel, row.label, row.value);
    }

    // Description
    if (!vessel.description && extracted.description) {
      vessel.description = extracted.description;
    }

    // Images — upscale all boatsgroup thumbnails
    const seen = new Set<string>();
    for (const src of extracted.imageSrcs) {
      const up = upscale(src);
      if (!seen.has(up)) {
        seen.add(up);
        vessel.images.push({ src: up, alt: vessel.name });
      }
    }
    vessel.images = dedupeImages(vessel.images);

  } catch (err) {
    console.error("[YachtWorld] Puppeteer failed:", err instanceof Error ? err.message : err);
    // Return what we have from slug — at least name/year/builder
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }

  return vessel;
}
