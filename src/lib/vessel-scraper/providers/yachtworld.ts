/**
 * YachtWorld scraper — v5
 *
 * YachtWorld SSR-embeds all listing data as:
 *   <script>var __REDUX_STATE__={"app":{"data":{...full listing...}}}</script>
 *
 * Both strategies parse the same way — extract that JSON string from raw HTML,
 * then mapReduxToVessel() maps every field to VesselData.
 *
 * Strategy 1 — plain fetch (fast, ~3s when CF allows Railway IPs through)
 * Strategy 2 — Puppeteer (slower, ~20s, bypasses CF JS challenges)
 * Slug fallback — always seeds name/year/builder from URL regardless
 */
import puppeteer from "puppeteer";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, dedupeImages } from "../utils";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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
    const SINGLE = new Set(["sunseeker","azimut","ferretti","benetti","princess",
      "cranchi","riva","pershing","fairline","jeanneau","beneteau","hatteras",
      "viking","formula","chaparral"]);
    result.builder =
      SINGLE.has(words[0]?.toLowerCase()) || words.length <= 2
        ? words[0]
        : words.slice(0, -1).join(" ");
    result.name = `${result.year} ${words.join(" ")}`;
  }
  return result;
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function upscale(src: string): string {
  // Normalise protocol-relative URLs first
  if (src.startsWith("//")) src = "https:" + src;
  let out = src
    .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/g, "")
    .replace(/[?&]exact/g, "")
    .replace(/[?&]ratio=[^&]+/g, "")
    .replace(/&&+/g, "&")
    .replace(/[?&]$/, "");
  // boatsgroup resize URLs — inject ?w=1200 if no size param exists
  if (out.includes("boatsgroup.com/resize/") && !/[?&]w=/.test(out)) {
    out += (out.includes("?") ? "&" : "?") + "w=1200";
  }
  return out;
}

function isJunk(src: string): boolean {
  return (
    /logo|icon|sprite|flag|avatar|favicon/i.test(src) ||
    src.includes("servedby.boatsgroup.com") ||   // ad network
    /youtube\.com|youtu\.be|vimeo\.com/i.test(src) // video links
  );
}

// ── Parse __REDUX_STATE__ from raw HTML ───────────────────────────────────────
function extractReduxState(html: string): Record<string, unknown> | null {
  const marker = "var __REDUX_STATE__=";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0, i = jsonStart, inStr = false, esc = false;
  for (; i < Math.min(html.length, jsonStart + 3_000_000); i++) {
    const c = html[i];
    if (esc)            { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true; continue; }
    if (c === '"')      { inStr = !inStr; continue; }
    if (inStr)          continue;
    if (c === "{")      depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(html.slice(jsonStart, i + 1)); }
  catch { return null; }
}

// ── Map Redux data → VesselData ───────────────────────────────────────────────
function mapReduxToVessel(data: Record<string, unknown>, vessel: VesselData): void {
  const d = data as Record<string, any>;

  // Identity
  if (d.boatName)  vessel.name    = clean(d.boatName);
  if (d.make)      vessel.builder = clean(d.make);
  if (d.year)      vessel.year    = parseInt(String(d.year));
  if (d.hull?.hin)      (vessel as any).hullNumber = d.hull.hin;
  if (d.hull?.material) vessel.hullMaterial        = clean(d.hull.material);
  if (d.hull?.shape)    vessel.hullForm            = clean(d.hull.shape);
  if (d.legal?.flagOfRegistry) vessel.flagState    = d.legal.flagOfRegistry;

  // Price
  const usd = d.price?.type?.amount?.USD;
  if (usd && !vessel.price) vessel.price = `$${Number(usd).toLocaleString("en-US")}`;

  // Location
  const loc = d.location?.address;
  if (loc && !vessel.location)
    vessel.location = [loc.city, loc.subdivision, loc.country].filter(Boolean).join(", ");

  // Description
  if (d.descriptionNoHTML && !vessel.description)
    vessel.description = clean(String(d.descriptionNoHTML)).slice(0, 2000);

  // Dimensions
  const dims = d.specifications?.dimensions;
  if (dims) {
    if (dims.lengths?.nominal?.ft && !vessel.loa)
      vessel.loa = `${dims.lengths.nominal.ft} ft / ${dims.lengths.nominal.m} m`;
    if (dims.beam?.ft && !vessel.beam)
      vessel.beam = `${dims.beam.ft} ft / ${dims.beam.m} m`;
    if (dims.maxDraft?.ft && !vessel.draft)
      vessel.draft = `${dims.maxDraft.ft} ft / ${dims.maxDraft.m} m`;
    if (dims.minDraft?.ft)  (vessel as any).draftMin  = `${dims.minDraft.ft} ft`;
    if (dims.maxBridge?.ft) (vessel as any).airDraft  = `${dims.maxBridge.ft} ft`;
  }

  // Performance
  const spd = d.specifications?.speedDistance;
  if (spd) {
    if (spd.maxSpeed?.kn && !vessel.maxSpeed)
      vessel.maxSpeed = `${spd.maxSpeed.kn} kn`;
    if (spd.cruisingSpeed?.kn && !vessel.cruiseSpeed)
      vessel.cruiseSpeed = `${spd.cruisingSpeed.kn} kn`;
    if (spd.range?.nmi && !vessel.range)
      vessel.range = `${spd.range.nmi} nmi`;
  }

  // Accommodation
  const acc = d.specifications?.accommodation;
  if (acc) {
    if (acc.cabins     != null && !vessel.staterooms) vessel.staterooms = String(acc.cabins);
    if (acc.guestCabins != null) (vessel as any).guestCabins = String(acc.guestCabins);
    if (acc.crewCabins  != null) vessel.crewCabins = String(acc.crewCabins);
    if (acc.passengers  != null && !vessel.guests) vessel.guests = String(acc.passengers);
    if (acc.crew        != null && !vessel.crew)   vessel.crew   = String(acc.crew);
  }

  // Propulsion
  const engines: any[] = d.propulsion?.engines || [];
  if (engines.length && !vessel.engines) {
    const e = engines[0];
    const parts = [e.make, e.model].filter(Boolean);
    if (parts.length)        vessel.engines  = parts.join(" ");
    if (e.power?.hp)         vessel.power    = `${e.power.hp} hp`;
    if (e.hours != null)     (vessel as any).engineHours = `${e.hours} hrs`;
    if (e.fuel)              (vessel as any).fuelType    = clean(e.fuel);
    if (e.driveType)         vessel.propulsion = clean(e.driveType);
  }
  if (engines.length > 1) vessel.engines = `${engines.length}x ${vessel.engines}`;
  if (d.fuelType && !(vessel as any).fuelType) (vessel as any).fuelType = clean(d.fuelType);

  // Tanks
  const tanks = d.tanks as Record<string, any[]> | undefined;
  if (tanks) {
    const fuel = tanks.fuel?.[0]?.capacity;
    if (fuel && !vessel.fuelTank)
      vessel.fuelTank = `${Math.round(fuel.gal).toLocaleString("en-US")} gal / ${Math.round(fuel.l).toLocaleString("en-US")} lt`;
    const fresh = tanks.fresh?.[0]?.capacity || tanks.freshWater?.[0]?.capacity;
    if (fresh && !vessel.freshWater)
      vessel.freshWater = `${Math.round(fresh.gal).toLocaleString("en-US")} gal / ${Math.round(fresh.l).toLocaleString("en-US")} lt`;
    const hold = tanks.holding?.[0]?.capacity;
    if (hold && !vessel.holdingTank)
      vessel.holdingTank = `${Math.round(hold.gal)} gal / ${Math.round(hold.l)} lt`;
  }

  // Class / type fallbacks
  if (d.class && !vessel.hullForm) vessel.hullForm = clean(String(d.class).replace(/-/g, " "));

  // Images — media[] is the canonical source; no DOM sweep needed
  const media: any[] = d.media || [];
  for (const m of media) {
    if (m.mediaType === "video" || m.videoUrl) continue; // skip videos
    let src = m.originalImageUrl || m.url || m.thumbnailUrl || "";
    if (!src) continue;
    if (src.startsWith("//")) src = "https:" + src;
    if (!src.startsWith("http") || isJunk(src)) continue;
    vessel.images.push({ src: upscale(src), alt: m.title || vessel.name });
  }

  // Videos
  const videos = media.filter(m => m.mediaType === "video" || m.videoUrl);
  if (videos.length) {
    (vessel as any).videos = videos.map(m => ({
      url: m.videoUrl || m.url || "",
      type: m.mediaType === "youtube" ? "youtube" : "other",
      thumbnail: m.thumbnailUrl || "",
      title: m.title || "",
    })).filter((v: any) => v.url);
  }
}

// ── Helper: fetch HTML and try to parse Redux state ───────────────────────────
function parseHtml(html: string, vessel: VesselData): boolean {
  if (!html.includes("__REDUX_STATE__")) return false;
  const redux = extractReduxState(html);
  const data  = (redux as any)?.app?.data;
  if (!data?.id) return false;
  mapReduxToVessel(data, vessel);
  vessel.images = dedupeImages(vessel.images);
  return true;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function scrapeYachtWorld(url: string): Promise<VesselData> {
  const vessel = emptyVessel(url);

  // Always seed from slug — cheap, never fails
  const slug = parseSlug(url);
  if (slug.name)    vessel.name    = slug.name;
  if (slug.year)    vessel.year    = slug.year;
  if (slug.builder) vessel.builder = slug.builder;

  // ── Strategy 1: plain fetch ───────────────────────────────────────────────
  // Fast (~3s). Works whenever Railway IPs aren't blocked by Cloudflare.
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,*/*",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const html = await res.text();
      if (parseHtml(html, vessel)) {
        console.log(`[YachtWorld] Strategy 1 OK: ${vessel.images.length} images, loa=${vessel.loa}`);
        return vessel;
      }
      console.log(`[YachtWorld] Strategy 1: HTML ok but no Redux (CF challenge?), trying Puppeteer`);
    }
  } catch (e) {
    console.log(`[YachtWorld] Strategy 1 fetch error: ${e instanceof Error ? e.message : e}`);
  }

  // ── Strategy 2: Puppeteer ─────────────────────────────────────────────────
  // Slower (~20s). Renders the page fully, defeating JS-based CF challenges.
  // Uses page.content() → same parseHtml() path as Strategy 1.
  let browser: any = null;
  try {
    browser = await (puppeteer as any).launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // networkidle0 waits for CF challenge JS to complete and redirect
    await page.goto(url, { waitUntil: "networkidle0", timeout: 45_000 });
    let html: string = await page.content();

    // If CF challenge is still present, wait up to 15s for it to resolve
    if (!html.includes("__REDUX_STATE__")) {
      try {
        await page.waitForFunction(
          () => document.documentElement.innerHTML.includes("__REDUX_STATE__"),
          { timeout: 15_000, polling: 500 }
        );
        html = await page.content();
      } catch {
        // CF didn't resolve — will log below and return slug data
      }
    }

    console.log(`[YachtWorld] Puppeteer: ${html.length} bytes, hasRedux=${html.includes("__REDUX_STATE__")}`);
    parseHtml(html, vessel);
    console.log(`[YachtWorld] Puppeteer done: ${vessel.images.length} images, loa=${vessel.loa}`);
  } catch (err) {
    console.error("[YachtWorld] Puppeteer error:", err instanceof Error ? err.message : err);
  } finally {
    if (browser) { try { await browser.close(); } catch { /**/ } }
  }

  // Always return whatever we have — at minimum slug data (name/year/builder)
  return vessel;
}
