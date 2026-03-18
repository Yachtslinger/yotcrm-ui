/**
 * YachtWorld scraper — v4
 *
 * Discovery: YachtWorld SSR-embeds all listing data as:
 *   <script>var __REDUX_STATE__={"app":{"data":{...full listing...}}}</script>
 *
 * This JSON contains EVERYTHING: specs, engines, tanks, images, price, location.
 * It's in the static HTML — no JS execution, no Cloudflare risk.
 *
 * Strategy:
 *   1. Plain fetch (fast, works when CF doesn't block)
 *   2. Puppeteer stealth fallback (if CF blocks plain fetch)
 *   3. Slug fallback (always populates name/year/builder)
 */
import puppeteer from "puppeteer";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, cleanHeadline, dedupeImages } from "../utils";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ── Slug fallback ─────────────────────────────────────────────────────────────
function parseSlug(url: string): Partial<VesselData> {
  const slug = url.split("/").filter(Boolean).pop() || "";
  const result: Partial<VesselData> = {};
  const yearMatch = slug.match(/^(\d{4})-/);
  if (yearMatch) result.year = parseInt(yearMatch[1]);
  const idMatch = slug.match(/-(\d{6,8})$/);
  if (yearMatch && idMatch) {
    const middle = slug.replace(/^\d{4}-/, "").replace(/-?\d{6,8}$/, "");
    const words = middle.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1));
    const SINGLE = new Set(["sunseeker","azimut","ferretti","benetti","princess","cranchi","riva","pershing","fairline","jeanneau","beneteau","hatteras","viking","formula","chaparral"]);
    result.builder = SINGLE.has(words[0]?.toLowerCase()) || words.length <= 2
      ? words[0]
      : words.slice(0, -1).join(" ");
    result.name = `${result.year} ${words.join(" ")}`;
  }
  return result;
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function upscale(src: string): string {
  return src
    .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/g, "").replace(/[?&]exact/g, "")
    .replace(/[?&]ratio=[^&]+/g, "").replace(/&&+/g, "&").replace(/[?&]$/, "");
}
function isJunk(src: string) { return /logo|icon|sprite|flag|avatar|favicon/i.test(src); }

// ── Parse __REDUX_STATE__ from HTML ──────────────────────────────────────────
function extractReduxState(html: string): Record<string, unknown> | null {
  // The variable is set as: var __REDUX_STATE__={...};
  // It can be large (500k+) so we need to extract via bracket matching
  const marker = "var __REDUX_STATE__=";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  // Find matching closing brace
  let depth = 0, i = jsonStart, inStr = false, esc = false;
  for (; i < Math.min(html.length, jsonStart + 2000000); i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  try {
    return JSON.parse(html.slice(jsonStart, i + 1));
  } catch {
    return null;
  }
}

// ── Map __REDUX_STATE__ data to VesselData ────────────────────────────────────
function mapReduxToVessel(data: Record<string, unknown>, vessel: VesselData): void {
  const d = data as Record<string, any>;

  // Identity
  if (d.boatName)  vessel.name    = clean(d.boatName);  // actual vessel name (e.g. "iiWii")
  if (d.make)      vessel.builder = clean(d.make);
  if (d.year)      vessel.year    = parseInt(String(d.year));
  if (d.hull?.hin) (vessel as any).hullNumber = d.hull.hin;
  if (d.hull?.material) vessel.hullMaterial = clean(d.hull.material);
  if (d.hull?.shape)    vessel.hullForm     = clean(d.hull.shape);
  if (d.legal?.flagOfRegistry) vessel.flagState = d.legal.flagOfRegistry;

  // Price
  const usd = d.price?.type?.amount?.USD;
  if (usd && !vessel.price) vessel.price = `$${Number(usd).toLocaleString("en-US")}`;

  // Location
  const loc = d.location?.address;
  if (loc && !vessel.location) {
    vessel.location = [loc.city, loc.subdivision, loc.country].filter(Boolean).join(", ");
  }

  // Description (plain text version)
  if (d.descriptionNoHTML && !vessel.description) {
    vessel.description = clean(String(d.descriptionNoHTML)).slice(0, 2000);
  }

  // Dimensions
  const dims = d.specifications?.dimensions;
  if (dims) {
    if (dims.lengths?.nominal?.ft && !vessel.loa) vessel.loa = `${dims.lengths.nominal.ft} ft / ${dims.lengths.nominal.m} m`;
    if (dims.beam?.ft && !vessel.beam)            vessel.beam = `${dims.beam.ft} ft / ${dims.beam.m} m`;
    if (dims.maxDraft?.ft && !vessel.draft)       vessel.draft = `${dims.maxDraft.ft} ft / ${dims.maxDraft.m} m`;
    if (dims.minDraft?.ft && !(vessel as any).draftMin) (vessel as any).draftMin = `${dims.minDraft.ft} ft`;
    if (dims.maxBridge?.ft && !(vessel as any).airDraft) (vessel as any).airDraft = `${dims.maxBridge.ft} ft`;
  }

  // Performance
  const spd = d.specifications?.speedDistance;
  if (spd) {
    if (spd.maxSpeed?.kn && !vessel.maxSpeed)     vessel.maxSpeed = `${spd.maxSpeed.kn} kn`;
    if (spd.cruisingSpeed?.kn && !vessel.cruiseSpeed) vessel.cruiseSpeed = `${spd.cruisingSpeed.kn} kn`;
    if (spd.range?.nmi && !vessel.range)          vessel.range = `${spd.range.nmi} nmi`;
  }

  // Accommodation
  const acc = d.specifications?.accommodation;
  if (acc) {
    if (acc.cabins != null && !vessel.staterooms) vessel.staterooms = String(acc.cabins);
    if (acc.guestCabins != null)                  (vessel as any).guestCabins = String(acc.guestCabins);
    if (acc.crewCabins != null)                   vessel.crewCabins = String(acc.crewCabins);
    if (acc.passengers != null && !vessel.guests) vessel.guests = String(acc.passengers);
    if (acc.crew != null && !vessel.crew)         vessel.crew = String(acc.crew);
  }

  // Propulsion
  const engines: any[] = d.propulsion?.engines || [];
  if (engines.length && !vessel.engines) {
    const eng = engines[0];
    const parts = [eng.make, eng.model].filter(Boolean);
    if (parts.length) vessel.engines = parts.join(" ");
    if (eng.power?.hp && !vessel.power) vessel.power = `${eng.power.hp} hp`;
    if (eng.hours != null && !(vessel as any).engineHours) (vessel as any).engineHours = `${eng.hours} hrs`;
    if (eng.fuel && !(vessel as any).fuelType) (vessel as any).fuelType = clean(eng.fuel);
    if (eng.driveType) vessel.propulsion = clean(eng.driveType);
  }
  if (engines.length > 1) {
    vessel.engines = `${engines.length}x ${vessel.engines}`;
  }

  // Fuel type from top-level
  if (d.fuelType && !(vessel as any).fuelType) (vessel as any).fuelType = clean(d.fuelType);

  // Tanks
  const tanks = d.tanks as Record<string, any[]> | undefined;
  if (tanks) {
    const fuelTank = tanks.fuel?.[0]?.capacity;
    if (fuelTank && !vessel.fuelTank) {
      const gal = Math.round(fuelTank.gal);
      const lt  = Math.round(fuelTank.l);
      vessel.fuelTank = `${gal.toLocaleString("en-US")} gal / ${lt.toLocaleString("en-US")} lt`;
    }
    const freshTank = tanks.fresh?.[0]?.capacity || tanks.freshWater?.[0]?.capacity;
    if (freshTank && !vessel.freshWater) {
      const gal = Math.round(freshTank.gal);
      const lt  = Math.round(freshTank.l);
      vessel.freshWater = `${gal.toLocaleString("en-US")} gal / ${lt.toLocaleString("en-US")} lt`;
    }
    const holdTank = tanks.holding?.[0]?.capacity;
    if (holdTank && !vessel.holdingTank) {
      vessel.holdingTank = `${Math.round(holdTank.gal)} gal / ${Math.round(holdTank.l)} lt`;
    }
  }

  // Hull / class
  if (d.class && !vessel.hullForm) vessel.hullForm = clean(String(d.class).replace(/-/g, " "));
  if (d.type)  (vessel as any).propulsion = (vessel as any).propulsion || clean(d.type);

  // Videos
  const media: any[] = d.media || [];
  const videoMedia = media.filter((m: any) => m.mediaType === "video" || m.videoUrl);
  if (videoMedia.length) {
    (vessel as any).videos = videoMedia.map((m: any) => ({
      url: m.videoUrl || m.url || "",
      type: m.mediaType === "youtube" ? "youtube" : "other",
      thumbnail: m.thumbnailUrl || "",
      title: m.title || "",
    })).filter((v: any) => v.url);
  }

  // Images from media array (full resolution)
  const imgMedia = media.filter((m: any) => m.mediaType === "image" || m.originalImageUrl || m.url);
  for (const m of imgMedia) {
    const src = m.originalImageUrl || m.url || m.thumbnailUrl || "";
    if (src && src.startsWith("http") && !isJunk(src)) {
      vessel.images.push({ src: upscale(src), alt: m.title || vessel.name });
    }
  }

  // Title (broker-supplied listing title, not vessel name)
  // Keep as notes if different from vessel name
  if (d.title && d.title !== vessel.name) {
    (vessel as any).notes = clean(d.title);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function scrapeYachtWorld(url: string): Promise<VesselData> {
  const slugData = parseSlug(url);
  const vessel = emptyVessel(url);

  // Always seed from slug (cheap, always available)
  if (slugData.name)    vessel.name    = slugData.name;
  if (slugData.year)    vessel.year    = slugData.year;
  if (slugData.builder) vessel.builder = slugData.builder;

  // ── Strategy 1: Plain fetch → parse __REDUX_STATE__ ──────────────────────
  // Works when Cloudflare doesn't challenge the request (Railway IPs sometimes pass)
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Accept": "text/html,*/*" },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) html = await res.text();
  } catch { /* fall through */ }

  if (html && !html.includes("checking your browser") && !html.includes("cf-browser-verification")) {
    const redux = extractReduxState(html);
    const data = (redux as any)?.app?.data;
    if (data && data.id) {
      mapReduxToVessel(data, vessel);
      if (vessel.images.length < 5) {
        // Supplement with raw HTML boatsgroup URLs
        const bgRx = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)[^\s"'<>]*/gi;
        let m: RegExpExecArray | null;
        const seen = new Set(vessel.images.map(i => i.src));
        while ((m = bgRx.exec(html)) !== null) {
          const up = upscale(m[0]);
          if (!seen.has(up) && !isJunk(up)) { seen.add(up); vessel.images.push({ src: up, alt: vessel.name }); }
        }
      }
      vessel.images = dedupeImages(vessel.images);
      return vessel;
    }
  }

  // ── Strategy 2: Puppeteer → window.__REDUX_STATE__ via evaluate ───────────
  // Always works — bypasses Cloudflare challenge, accesses JS state directly
  let browser = null;
  try {
    browser = await (puppeteer as any).launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-blink-features=AutomationControlled"],
    });
    const page = await (browser as any).newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // __REDUX_STATE__ is set by SSR — available immediately without waiting for analytics
    const reduxData = await page.evaluate(() => (window as any).__REDUX_STATE__?.app?.data || null);

    if (reduxData && reduxData.id) {
      mapReduxToVessel(reduxData, vessel);
    }

    // Rendered images — pick up anything mapReduxToVessel may have missed
    const imgSrcs: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map((img: any) => img.getAttribute("data-src") || img.src || "")
        .filter((src: string) => src.includes("boatsgroup.com") && !/logo|icon|sprite|flag|avatar/i.test(src))
    );
    const seen = new Set(vessel.images.map(i => i.src));
    for (const src of imgSrcs) {
      const up = upscale(src);
      if (!seen.has(up)) { seen.add(up); vessel.images.push({ src: up, alt: vessel.name }); }
    }

    // Price fallback from DOM if __REDUX_STATE__ didn't have it
    if (!vessel.price) {
      const priceText: string = await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if ((el as Element).children.length <= 2 && /US\$[\d,]{4,}/.test((el as Element).textContent || "")) {
            return (el as Element).textContent?.trim() || "";
          }
        }
        return "";
      });
      const pm = priceText.match(/US\$([\d,]+)/);
      if (pm) vessel.price = `$${pm[1]}`;
    }

    vessel.images = dedupeImages(vessel.images);
  } catch (err) {
    console.error("[YachtWorld] Puppeteer failed:", err instanceof Error ? err.message : err);
  } finally {
    if (browser) { try { await (browser as any).close(); } catch { /**/ } }
  }

  return vessel;
}
