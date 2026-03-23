/**
 * Northrop & Johnson scraper — Algolia prod_YACHTS index
 *
 * N&J is a Next.js SPA; all listing URLs return the same JS shell.
 * Their Algolia credentials are public in the homepage JS bundle.
 * This provider calls the Algolia API directly — no HTML parsing.
 *
 * URL patterns:
 *   https://www.northropandjohnson.com/yachts-for-sale/[vessel-slug]/
 *   https://nj2019.northropandjohnson.com/yachts-for-sale/[vessel-slug]/
 *
 * Field coverage: ~25 structured fields from Algolia hit object.
 */
import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, mToFt, ftToM, galToL, lToGal } from "../utils";

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

  return vessel;
}
