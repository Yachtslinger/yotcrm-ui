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

  // ── Strategy 2: Puppeteer + stealth → window.__REDUX_STATE__ ───────────────
  // puppeteer-extra-plugin-stealth patches 20+ browser fingerprints so CF
  // treats the headless browser as a real user — bypasses JS challenge pages.
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
    // Use domcontentloaded then explicitly wait for __REDUX_STATE__ to be set.
    // networkidle2 fires too early on CF challenge pages — this ensures the real
    // YachtWorld listing page has SSR-rendered its Redux state before we evaluate.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForFunction(
      () => !!(window as any).__REDUX_STATE__?.app?.data?.id,
      { timeout: 20000 }
    ).catch(() => {/* CF challenge or listing not found — evaluate will return null */});

    // __REDUX_STATE__ is set by SSR — available immediately without waiting for analytics
    // NOTE: We extract ONLY primitives inside evaluate() to avoid Puppeteer JSON
    // serialization failures caused by large HTML strings (descriptions[78]) and
    // complex nested objects in the full Redux state.
    const reduxData = await page.evaluate(() => {
      const d = (window as any).__REDUX_STATE__?.app?.data;
      if (!d) return null;
      const dims    = d.specifications?.dimensions;
      const spd     = d.specifications?.speedDistance;
      const acc     = d.specifications?.accommodation;
      const engines: any[] = d.propulsion?.engines || [];
      const tanks   = d.tanks || {};
      const media: any[] = d.media || [];
      return {
        // Identity
        id:          d.id,
        boatName:    d.boatName || "",
        make:        d.make || "",
        year:        d.year || 0,
        fuelType:    d.fuelType || "",
        class:       d.class || "",
        type:        d.type || "",
        // Description
        descriptionNoHTML: (d.descriptionNoHTML || "").slice(0, 2000),
        // Hull
        hull: { material: d.hull?.material || "", shape: d.hull?.shape || "", hin: d.hull?.hin || "" },
        // Price
        price: d.price?.type?.amount?.USD || 0,
        // Location
        location: { city: d.location?.address?.city || "", sub: d.location?.address?.subdivision || "", country: d.location?.address?.country || "" },
        // Dimensions
        dims: dims ? {
          loaft: dims.lengths?.nominal?.ft || 0, loam: dims.lengths?.nominal?.m || 0,
          beamft: dims.beam?.ft || 0, beamm: dims.beam?.m || 0,
          draftft: dims.maxDraft?.ft || 0, draftm: dims.maxDraft?.m || 0,
          draftMinft: dims.minDraft?.ft || 0,
          airDraftft: dims.maxBridge?.ft || 0,
        } : null,
        // Performance
        spd: spd ? {
          maxKn: spd.maxSpeed?.kn || 0, cruiseKn: spd.cruisingSpeed?.kn || 0, rangeNmi: spd.range?.nmi || 0,
        } : null,
        // Accommodation
        acc: acc ? {
          cabins: acc.cabins ?? -1, guestCabins: acc.guestCabins ?? -1,
          crewCabins: acc.crewCabins ?? -1, passengers: acc.passengers ?? -1, crew: acc.crew ?? -1,
        } : null,
        // Engines
        engines: engines.map((e: any) => ({
          make: e.make || "", model: e.model || "",
          hp: e.power?.hp || 0, hours: e.hours ?? -1,
          fuel: e.fuel || "", driveType: e.driveType || "",
        })),
        // Tanks
        tanks: {
          fuelGal: tanks.fuel?.[0]?.capacity?.gal || 0,  fuelL: tanks.fuel?.[0]?.capacity?.l || 0,
          freshGal: (tanks.fresh || tanks.freshWater)?.[0]?.capacity?.gal || 0,
          freshL:   (tanks.fresh || tanks.freshWater)?.[0]?.capacity?.l   || 0,
          holdGal: tanks.holding?.[0]?.capacity?.gal || 0, holdL: tanks.holding?.[0]?.capacity?.l || 0,
        },
        // Media — normalise protocol-relative URLs (//images.boatsgroup.com/...) to https:
        images: media
          .filter((m: any) => (m.mediaType === "image" || m.originalImageUrl || m.url) && !(/logo|icon|sprite|flag|avatar/i.test(m.url || "")))
          .map((m: any) => {
            let src = m.originalImageUrl || m.url || m.thumbnailUrl || "";
            if (src.startsWith("//")) src = "https:" + src;
            return { src, title: m.title || "" };
          })
          .filter((m: any) => m.src.startsWith("http")),
        videos: media
          .filter((m: any) => m.mediaType === "video" || m.videoUrl)
          .map((m: any) => ({ url: m.videoUrl || m.url || "", thumb: m.thumbnailUrl || "", title: m.title || "" }))
          .filter((m: any) => m.url),
      };
    });

    if (reduxData && reduxData.id) {
      // Map the extracted primitives to VesselData
      const d = reduxData;
      if (d.boatName)  vessel.name    = d.boatName.trim();
      if (d.make)      vessel.builder = d.make.trim();
      if (d.year)      vessel.year    = d.year;
      if (d.hull?.hin)      (vessel as any).hullNumber   = d.hull.hin;
      if (d.hull?.material) vessel.hullMaterial          = d.hull.material;
      if (d.hull?.shape)    vessel.hullForm              = d.hull.shape;
      if (d.fuelType)       (vessel as any).fuelType     = d.fuelType;
      if (d.class && !vessel.hullForm) vessel.hullForm   = d.class.replace(/-/g," ");
      if (d.price)     vessel.price   = `$${Number(d.price).toLocaleString("en-US")}`;
      const loc = d.location;
      if (loc && (loc.city || loc.sub || loc.country) && !vessel.location)
        vessel.location = [loc.city, loc.sub, loc.country].filter(Boolean).join(", ");
      if (d.descriptionNoHTML && !vessel.description) vessel.description = d.descriptionNoHTML.trim();
      // Dims
      if (d.dims) {
        const dim = d.dims;
        if (dim.loaft   && !vessel.loa)   vessel.loa   = `${dim.loaft} ft / ${dim.loam} m`;
        if (dim.beamft  && !vessel.beam)  vessel.beam  = `${dim.beamft} ft / ${dim.beamm} m`;
        if (dim.draftft && !vessel.draft) vessel.draft = `${dim.draftft} ft / ${dim.draftm} m`;
        if (dim.draftMinft) (vessel as any).draftMin  = `${dim.draftMinft} ft`;
        if (dim.airDraftft) (vessel as any).airDraft  = `${dim.airDraftft} ft`;
      }
      // Perf
      if (d.spd) {
        if (d.spd.maxKn    && !vessel.maxSpeed)    vessel.maxSpeed    = `${d.spd.maxKn} kn`;
        if (d.spd.cruiseKn && !vessel.cruiseSpeed) vessel.cruiseSpeed = `${d.spd.cruiseKn} kn`;
        if (d.spd.rangeNmi && !vessel.range)       vessel.range       = `${d.spd.rangeNmi} nmi`;
      }
      // Acc
      if (d.acc) {
        if (d.acc.cabins >= 0      && !vessel.staterooms) vessel.staterooms  = String(d.acc.cabins);
        if (d.acc.guestCabins >= 0)  (vessel as any).guestCabins            = String(d.acc.guestCabins);
        if (d.acc.crewCabins >= 0)   vessel.crewCabins                       = String(d.acc.crewCabins);
        if (d.acc.passengers >= 0  && !vessel.guests)     vessel.guests      = String(d.acc.passengers);
        if (d.acc.crew >= 0        && !vessel.crew)       vessel.crew        = String(d.acc.crew);
      }
      // Engines
      if (d.engines?.length && !vessel.engines) {
        const e0 = d.engines[0];
        const parts = [e0.make, e0.model].filter(Boolean);
        if (parts.length)         vessel.engines      = parts.join(" ");
        if (e0.hp)                vessel.power        = `${e0.hp} hp`;
        if (e0.hours >= 0)        (vessel as any).engineHours = `${e0.hours} hrs`;
        if (e0.fuel)              (vessel as any).fuelType    = e0.fuel;
        if (e0.driveType)         vessel.propulsion   = e0.driveType;
        if (d.engines.length > 1) vessel.engines      = `${d.engines.length}x ${vessel.engines}`;
      }
      // Tanks
      if (d.tanks) {
        const t = d.tanks;
        if (t.fuelGal  && !vessel.fuelTank)   vessel.fuelTank   = `${Math.round(t.fuelGal).toLocaleString("en-US")} gal / ${Math.round(t.fuelL).toLocaleString("en-US")} lt`;
        if (t.freshGal && !vessel.freshWater) vessel.freshWater = `${Math.round(t.freshGal).toLocaleString("en-US")} gal / ${Math.round(t.freshL).toLocaleString("en-US")} lt`;
        if (t.holdGal  && !vessel.holdingTank) vessel.holdingTank = `${Math.round(t.holdGal)} gal / ${Math.round(t.holdL)} lt`;
      }
      // Media
      if (d.images?.length) {
        const seen = new Set(vessel.images.map((i: any) => i.src));
        for (const img of d.images) {
          const up = upscale(img.src);
          if (!seen.has(up)) { seen.add(up); vessel.images.push({ src: up, alt: img.title || vessel.name }); }
        }
      }
      if (d.videos?.length) {
        (vessel as any).videos = d.videos.map((v: any) => ({ url: v.url, type: "other", thumbnail: v.thumb, title: v.title }));
      }
    }

    // NOTE: We rely exclusively on the media[] array from __REDUX_STATE__ for images.
    // A broad DOM querySelectorAll("img") sweep catches ads, recommended listings,
    // and duplicate thumbnails — so we skip it entirely.

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
