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
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
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
  let out = src
    .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
    .replace(/[?&]format=webp/g, "").replace(/[?&]exact/g, "")
    .replace(/[?&]ratio=[^&]+/g, "").replace(/&&+/g, "&").replace(/[?&]$/, "");
  // boatsgroup.com resize URLs: add ?w=1200 if no size param yet
  // e.g. https://images.boatsgroup.com/resize/1/48/48/9034848_...jpg
  if (out.includes("boatsgroup.com/resize/") && !/[?&]w=/.test(out)) {
    out = out + (out.includes("?") ? "&" : "?") + "w=1200";
  }
  return out;
}
function isJunk(src: string) {
  return /logo|icon|sprite|flag|avatar|favicon/i.test(src)
    || src.includes("servedby.boatsgroup.com")  // ad network
    || /youtube\.com|youtu\.be|vimeo\.com/i.test(src);  // video URLs
}

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
    let src = m.originalImageUrl || m.url || m.thumbnailUrl || "";
    if (src.startsWith("//")) src = "https:" + src;   // normalise protocol-relative
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

  // Only attempt Redux parse if the page actually contains the key.
  // A real YachtWorld listing page ALWAYS has __REDUX_STATE__.
  // If it's absent, the response is a CF challenge / redirect — fall through to Puppeteer.
  if (html && html.includes("__REDUX_STATE__")) {
    const redux = extractReduxState(html);
    const data = (redux as any)?.app?.data;
    if (data && data.id) {
      mapReduxToVessel(data, vessel);
      // media[] from Redux contains all listing images — no DOM sweep needed
      vessel.images = dedupeImages(vessel.images);
      console.log(`[YachtWorld] Strategy 1 (plain fetch) succeeded: ${vessel.images.length} images`);
      return vessel;
    }
    // Redux key present but parse/data failed — still fall through to Puppeteer
    console.warn("[YachtWorld] __REDUX_STATE__ found but data.id missing — falling through to Puppeteer");
  }

  // ── Strategy 2: Puppeteer + stealth → page.content() → extractReduxState ────
  // After stealth bypasses CF, we grab the rendered HTML via page.content() and
  // run the same extractReduxState() + mapReduxToVessel() as Strategy 1.
  // This avoids Puppeteer JSON serialization issues entirely — the SSR-embedded
  // __REDUX_STATE__ is a text string in the HTML, not a runtime window object.
  puppeteerExtra.use(StealthPlugin());
  let browser = null;
  try {
    browser = await puppeteerExtra.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-blink-features=AutomationControlled"],
    });
    const page = await (browser as any).newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    // domcontentloaded is enough — __REDUX_STATE__ is in SSR HTML, not dynamic
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Get rendered HTML from Puppeteer and parse Redux state from it
    const renderedHtml: string = await page.content();
    console.log(`[YachtWorld] Puppeteer got ${renderedHtml.length} bytes, hasRedux=${renderedHtml.includes("__REDUX_STATE__")}`);

    if (renderedHtml.includes("__REDUX_STATE__")) {
      const redux = extractReduxState(renderedHtml);
      const data  = (redux as any)?.app?.data;
      if (data && data.id) {
        mapReduxToVessel(data, vessel);
      } else {
        console.warn("[YachtWorld] Puppeteer: __REDUX_STATE__ found but data.id missing");
      }
    } else {
      console.warn("[YachtWorld] Puppeteer: __REDUX_STATE__ not in rendered HTML (CF challenge?)");
    }

    vessel.images = dedupeImages(vessel.images);
    console.log(`[YachtWorld] Puppeteer succeeded: ${vessel.images.length} images`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[YachtWorld] Puppeteer failed:", msg);
    // If we have nothing useful from Strategy 1, surface the error so callers know
    if (!vessel.loa && !vessel.beam && !vessel.engines && vessel.images.length === 0) {
      throw new Error(`YachtWorld scrape failed (Puppeteer): ${msg}`);
    }
  } finally {
    if (browser) { try { await (browser as any).close(); } catch { /**/ } }
  }

  return vessel;
}
