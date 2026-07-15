/**
 * Northrop & Johnson scraper — three-layer:
 *   L1: Algolia prod_YACHTS index (fast, structured numeric fields).
 *   L2: full HTML page — Algolia only carries a summary card, but N&J
 *       publishes proper spec tables with everything (engines, tanks,
 *       heads, designers, range, description prose, full image gallery).
 *   L3: aiExtractSpecs from the URL scraper's shared pipeline fills any
 *       remaining empty fields from prose (called by the router after
 *       this provider returns).
 *
 * The Algolia hit is used first because it gives us reliable numeric
 * conversions (LOA meters/feet, beam, tank capacity in liters). The HTML
 * pass then adds every field Algolia does not carry.
 *
 * URL patterns:
 *   https://www.northropandjohnson.com/yachts-for-sale/[vessel-slug]/
 *   https://nj2019.northropandjohnson.com/yachts-for-sale/[vessel-slug]/
 */
import * as cheerio from "cheerio";
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, lToGal, assignSpec } from "../utils";

const ALGOLIA_APP  = "7MSII23CDS";
const ALGOLIA_KEY  = "94864180b077ae0768d78b0324ce1552";
const ALGOLIA_BASE = `https://${ALGOLIA_APP}-dsn.algolia.net/1/indexes/prod_YACHTS`;

/** Extract vessel name from N&J URL slug */
function nameFromUrl(url: string): string {
  const m = url.match(/\/yachts-for-sale\/([^/?#]+)/i);
  return m ? m[1].replace(/-/g, " ").trim() : "";
}

export async function scrapeNorthropJohnson(url: string): Promise<VesselData> {
  const vessel = emptyVessel(url);
  const query = nameFromUrl(url);
  if (!query) throw new Error(`N&J: cannot extract vessel name from URL: ${url}`);

  const res = await fetch(`${ALGOLIA_BASE}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-algolia-application-id": ALGOLIA_APP,
      "x-algolia-api-key": ALGOLIA_KEY,
    },
    body: JSON.stringify({ query, hitsPerPage: 3 }),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`N&J Algolia API: ${res.status}`);

  const json = await res.json();
  const hits: Record<string, unknown>[] = json.hits || [];
  if (!hits.length) throw new Error(`N&J: no yacht found for "${query}"`);

  // Pick best match — prefer exact name match, else first result
  const slug = query.toLowerCase();
  const hit = hits.find(h =>
    String(h.name || "").toLowerCase() === slug ||
    String(h.url || "").toLowerCase().includes(slug.replace(/ /g, "-"))
  ) || hits[0];

  const str = (k: string) => clean(String(hit[k] ?? ""));
  const num = (k: string) => { const n = parseFloat(String(hit[k] ?? "")); return isNaN(n) ? null : n; };

  // ── Identity ──────────────────────────────────────────────────────────────
  vessel.name     = str("name");
  vessel.builder  = str("builder");
  vessel.year     = num("year_built") ?? num("year_model") ?? null;
  vessel.flagState = str("flag");
  vessel.location = [str("city"), str("state"), str("country")].filter(Boolean).join(", ");
  vessel.hullMaterial = str("hull_material");
  vessel.stockNumber  = str("hull_identification_number") || str("objectID") || "";

  // ── Price ─────────────────────────────────────────────────────────────────
  const priceFormatted = str("price_formatted");
  const canShow = hit["can_show_price"];
  if (canShow === true || canShow === "True") {
    vessel.price = priceFormatted || "";
  }

  // ── Dimensions ───────────────────────────────────────────────────────────
  const loaM  = num("loa_meters");  const loaFt = num("loa_feet");
  const beamM = num("beam_meters"); const beamFt = num("beam_feet");
  const draftM = num("maximum_draft_meters"); const draftFt = num("maximum_draft_feet");
  const lwlM = num("lwl_meters");

  if (loaM)  vessel.loa  = `${loaM.toFixed(1)} m / ${loaFt ?? Math.round(loaM * 3.28084)}'`;
  if (beamM) vessel.beam = `${beamM.toFixed(1)} m / ${beamFt ?? Math.round(beamM * 3.28084)}'`;
  if (draftM) vessel.draft = `${draftM.toFixed(2)} m / ${draftFt ?? Math.round(draftM * 3.28084)}'`;
  if (lwlM) vessel.lwl = `${lwlM.toFixed(1)} m`;

  const gt = num("gross_tonnage");
  if (gt) vessel.grossTonnage = `${gt.toLocaleString("en-US")} GT`;

  // ── Tanks ─────────────────────────────────────────────────────────────────
  const fuelL = num("fuel_tank_capacity_liters");
  if (fuelL && fuelL > 0) vessel.fuelTank = lToGal(fuelL);

  // ── Accommodation ─────────────────────────────────────────────────────────
  const guests = num("guests"); const cabins = num("cabins"); const crew = num("crew");
  if (guests) vessel.guests    = String(guests);
  if (cabins) vessel.staterooms = String(cabins);
  if (crew)   vessel.crew      = String(crew);

  // ── Propulsion / performance ──────────────────────────────────────────────
  vessel.fuelType = str("fuel_type");
  const maxKn  = num("maximum_speed"); const cruKn = num("cruise_speed");
  if (maxKn)  vessel.maxSpeed    = `${maxKn} kn`;
  if (cruKn)  vessel.cruiseSpeed = `${cruKn} kn`;

  // ── Design ────────────────────────────────────────────────────────────────
  const designer = str("designer");
  if (designer) vessel.exteriorDesign = designer;

  // ── Refit ─────────────────────────────────────────────────────────────────
  const refitYear = num("year_refit");
  if (refitYear && refitYear > 1900) vessel.refitYear = String(refitYear);

  // ── Tax / listing ─────────────────────────────────────────────────────────
  vessel.vatStatus = str("tax_status") || undefined;

  // ── Images ────────────────────────────────────────────────────────────────
  const heroImg = str("image");
  if (heroImg && /^https?:\/\//i.test(heroImg)) {
    vessel.images.push({ src: heroImg, alt: vessel.name });
  }

  // ── Layer 2: full HTML page ──────────────────────────────────────────────
  // N&J's Next.js shell hydrates from an Algolia hit but the fully-rendered
  // page contains the complete spec block (engines, tanks, heads, hull
  // config, designers), description prose, and the full image gallery —
  // none of which come through Algolia. Fetch it and parse.
  try {
    const htmlRes = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0 Safari/537.36" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      augmentFromHtml(vessel, html);
    }
  } catch { /* HTML augment is best-effort; Algolia results stand alone */ }

  return vessel;
}

/**
 * Parse every visible spec table on an N&J listing page and route each row
 * through the shared assignSpec() helper — the same one Denison uses. Also
 * pulls the description prose and the full image gallery. Every field the
 * Algolia summary did not already fill gets written here.
 */
function augmentFromHtml(vessel: VesselData, html: string): void {
  const $ = cheerio.load(html);

  // Spec tables — N&J renders each spec section as a proper <table>. Every
  // <tr> is Label / Value. assignSpec handles the label → field mapping.
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td, th");
    if (cells.length >= 2) {
      const label = $(cells[0]).text();
      const value = $(cells[1]).text();
      if (label && value) assignSpec(vessel, label, value);
    }
  });

  // Definition lists (some N&J templates use dl/dt/dd instead of tables).
  $("dt").each((_, dt) => {
    const label = $(dt).text();
    const value = $(dt).next("dd").text();
    if (label && value) assignSpec(vessel, label, value);
  });

  // Description — N&J puts the write-up prose inside the main content area
  // between the hero and the specs. Take the longest paragraph cluster.
  if (!vessel.description) {
    const paragraphs: string[] = [];
    $("p").each((_, p) => {
      const t = clean($(p).text());
      if (t.length >= 80) paragraphs.push(t);
    });
    // Filter obvious boilerplate (broker disclaimers, cookie notices).
    const meaningful = paragraphs.filter(p =>
      !/cookie|privacy|centrally listed|not intended to convey|please contact/i.test(p) &&
      !/©\s*\d{4}/i.test(p)
    );
    if (meaningful.length) {
      vessel.description = meaningful.slice(0, 8).join("\n\n").slice(0, 4000);
    }
  }

  // Images — N&J's page shows a full gallery. Pull every images.northrop*
  // URL that looks like a listing photo, strip render params (?w=&h=…),
  // dedupe, cap at 60.
  const seen = new Set(vessel.images.map(i => i.src));
  const found: string[] = [];
  $("img[src], img[data-src]").each((_, img) => {
    const raw = $(img).attr("src") || $(img).attr("data-src") || "";
    if (/images\.northropandjohnson\.com\/yacht\//i.test(raw)) {
      const canonical = raw.split("?")[0];
      if (!seen.has(canonical) && !found.includes(canonical)) found.push(canonical);
    }
  });
  // Also scan the raw HTML for background-image URLs (some galleries use CSS).
  const bgMatches = html.matchAll(/https?:\/\/images\.northropandjohnson\.com\/yacht\/[^\s"'?]+/gi);
  for (const m of bgMatches) {
    const url = m[0];
    if (!seen.has(url) && !found.includes(url)) found.push(url);
  }
  for (const src of found.slice(0, 60)) {
    vessel.images.push({ src, alt: vessel.name });
  }
}
