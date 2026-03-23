/**
 * Fraser Yachts scraper — Kontent.ai CMS API
 *
 * Fraser's site is a Nuxt.js SPA (server returns an empty 3KB shell).
 * BUT their Kontent.ai CMS delivery key is public in their JS bundle.
 * We call deliver.kontent.ai directly — structured JSON, no HTML parsing.
 *
 * URL patterns:
 *   https://www.fraseryachts.com/en/yacht-for-sale/VESSEL-NAME/
 *   https://www.fraseryachts.com/en/yacht-for-charter/VESSEL-NAME/
 *
 * Field coverage: ~50+ structured fields including all dimensions, engines,
 * generators (up to 5), speeds, range, fuel, accommodation, images, prices.
 */

import type { VesselData } from "../types";
import { emptyVessel } from "../types";
import { clean, mToFt, ftToM, galToL, lToGal } from "../utils";

// Public Kontent.ai delivery credentials baked into Fraser's frontend JS
const KONTENT_PROJECT = "3bf3a169-546e-0010-21f7-a952f77e34c4";
const DELIVERY_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjMmVjYjMwYWU2NTk0OTc2OTM0NWZjZDA4MDNiNWZiYyIsImlhdCI6MTc3MDcyOTYzOCwibmJmIjoxNzcwNzI5NjM4LCJleHAiOjE4MDIyNjU2MDAsInZlciI6IjIuMC4wIiwic2NvcGVfaWQiOiJhNDMzYWI5NjE3ODE0ZGRkOTNkZDc1OGQwNmE2NDEwYiIsInByb2plY3RfY29udGFpbmVyX2lkIjoiODAyZTFiODQ1M2E0MDBlMDc1NjQ2Y2QxNDNmMGU4MTAiLCJhdWQiOiJkZWxpdmVyLmtvbnRlbnQuYWkifQ.neDxKj8PzK4hYo7CawGpDGw9ZTmCC1hpB8RIvUCuCUw";
const KONTENT_BASE   = `https://deliver.kontent.ai/${KONTENT_PROJECT}`;

/** Extract vessel name slug from Fraser URL — returns UPPERCASE for Kontent.ai query */
function slugFromUrl(url: string): string {
  // /en/yacht-for-sale/vessel-name/ → "VESSEL NAME"
  const m = url.match(/\/yacht-for-(?:sale|charter)\/([^/?#]+)/i);
  if (!m) return "";
  // Convert hyphenated slug to space-separated uppercase
  return m[1].replace(/-/g, " ").trim().toUpperCase();
}

/** Try multiple name variants to handle slug→name mismatches */
async function fetchYachtData(name: string): Promise<Record<string, { value: unknown }> | null> {
  const variants = [
    name,
    // Some listings have articles removed: "THE YACHT" → "YACHT"
    name.replace(/^THE\s+/i, ""),
    // Roman numerals sometimes differ: "YACHTNAME II" vs "YACHTNAME 2"
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const variant of variants) {
    const apiUrl = `${KONTENT_BASE}/items?system.type=yacht_data&elements.name=${encodeURIComponent(variant)}&limit=1`;
    const res = await fetch(apiUrl, {
      headers: { "Authorization": `Bearer ${DELIVERY_KEY}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!res.ok) continue;
    const json = await res.json();
    const items = json.items || [];
    if (items.length > 0) return items[0].elements as Record<string, { value: unknown }>;
  }
  return null;
}

/** Safe element value getter */
function val(elements: Record<string, { value: unknown }>, key: string): string {
  const v = elements?.[key]?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map((x: unknown) => {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") return (x as Record<string,string>).name || (x as Record<string,string>).codename || "";
    return "";
  }).filter(Boolean).join(", ");
  return clean(String(v));
}

function num(elements: Record<string, { value: unknown }>, key: string): number | null {
  const v = elements?.[key]?.value;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/** Combine feet + inches into dual display */
function buildFtM(ft: number | null, inches: number | null, m: number | null): string {
  if (m && m > 0) {
    const totalFt = ft ?? Math.floor(m * 3.28084);
    const totalIn = inches ?? Math.round((m * 3.28084 - totalFt) * 12);
    return `${m.toFixed(1)} m / ${totalFt}'${totalIn > 0 ? totalIn + '"' : ""}`;
  }
  if (ft && ft > 0) {
    const metres = ((ft * 12 + (inches ?? 0)) * 0.0254);
    return `${metres.toFixed(2)} m / ${ft}'${inches && inches > 0 ? inches + '"' : ""}`;
  }
  return "";
}

export async function scrapeFraser(url: string): Promise<VesselData> {
  const vessel = emptyVessel(url);
  const name = slugFromUrl(url);
  if (!name) throw new Error(`Fraser: cannot extract vessel name from URL: ${url}`);

  const e = await fetchYachtData(name);
  if (!e) throw new Error(`Fraser: no yacht found for "${name}" — try pasting the page source`);

  // ── Identity ──────────────────────────────────────────────────────────────
  vessel.name      = val(e, "name") || name;
  vessel.builder   = val(e, "buildername");
  vessel.year      = num(e, "builtyear") ?? null;
  vessel.flagState = val(e, "flag");
  vessel.stockNumber = val(e, "yachtid");
  vessel.classification = val(e, "yachtclass");
  vessel.location  = val(e, "currentlocation") || val(e, "homeport") || "";
  vessel.homePort  = val(e, "homeport") || undefined;
  vessel.vatStatus = val(e, "vatstatus") || undefined;

  // ── Price ─────────────────────────────────────────────────────────────────
  const usd = num(e, "cms_saleprice_usd");
  const eur = num(e, "cms_saleprice_eur");
  const poa = val(e, "poa");
  if (poa === "true" || poa === "1") {
    vessel.price = "Price on Application";
  } else if (usd && usd > 0) {
    vessel.price = `$${Math.round(usd).toLocaleString("en-US")}`;
  } else if (eur && eur > 0) {
    vessel.price = `€${Math.round(eur).toLocaleString("en-US")}`;
    vessel.askingPriceEUR = `€${Math.round(eur).toLocaleString("en-US")}`;
  }
  if (eur && eur > 0) vessel.askingPriceEUR = `€${Math.round(eur).toLocaleString("en-US")}`;

  // ── Dimensions ───────────────────────────────────────────────────────────
  const loaM  = num(e, "loa_meter");
  const loaFt = num(e, "loa_feet");
  const loaIn = num(e, "loa_inches");
  vessel.loa  = val(e, "loa_text") || buildFtM(loaFt, loaIn, loaM);

  const beamM  = num(e, "beam_meter");
  const beamFt = num(e, "beam_feet");
  const beamIn = num(e, "beam_inches");
  vessel.beam  = buildFtM(beamFt, beamIn, beamM);

  const draftM  = num(e, "draft_meter");
  const draftFt = num(e, "draft_feet");
  const draftIn = num(e, "draft_inches");
  vessel.draft  = buildFtM(draftFt, draftIn, draftM);

  const lwlM = num(e, "lwl_meter");
  if (lwlM) vessel.lwl = `${lwlM} m`;

  const gt = num(e, "grosston");
  if (gt) vessel.grossTonnage = val(e, "grosston_formatted") || `${gt} GT`;

  vessel.displacement = val(e, "displacement") || "";

  // ── Hull & design ─────────────────────────────────────────────────────────
  vessel.hullMaterial   = val(e, "hullmaterialname");
  vessel.exteriorDesign = val(e, "exteriordesigner");
  vessel.interiorDesign = val(e, "interiordesigner");
  vessel.navalArchitect = val(e, "navalarchitect") || val(e, "navalarchitectname") || "";
  vessel.refitYear      = val(e, "refityear") || undefined;
  vessel.refitDetails   = val(e, "refitdetails") || undefined;

  // ── Propulsion ────────────────────────────────────────────────────────────
  vessel.engines = [
    val(e, "mainengine"),
    val(e, "numberofengine") ? `× ${val(e, "numberofengine")}` : "",
  ].filter(Boolean).join(" ");
  vessel.power        = val(e, "enginehp") ? `${val(e, "enginehp")} HP` : val(e, "enginepower") ? `${val(e, "enginepower")} kW` : "";
  vessel.engineHours  = val(e, "enginehours") || undefined;
  vessel.propulsion   = val(e, "propulsiontype") || val(e, "drivetraintype") || "";
  vessel.gearbox      = val(e, "gearbox") || "";
  vessel.bowThruster  = val(e, "bowthruster") || "";
  vessel.sternThruster = val(e, "sternthruster") || "";

  // Stabilisers
  const stabType = val(e, "stabilizersspeed");  // "None" | "At Anchor" | "Underway" | "Both"
  const finType  = val(e, "fintype");
  const hasStab  = val(e, "stabilizers");
  if (stabType && stabType !== "None") {
    vessel.stabilisers = [finType, stabType !== "None" ? `stabilizers (${stabType})` : ""].filter(Boolean).join(" ") || "Yes";
    if (stabType === "At Anchor" || stabType === "Both") vessel.zeroSpeedStabilisers = "Yes";
  } else if (hasStab === "true") {
    vessel.stabilisers = finType || "Yes";
  }

  // ── Generators ───────────────────────────────────────────────────────────
  const genParts: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const make = val(e, `generator${i}`);
    const kw   = val(e, `generator${i}_kw`);
    if (make || kw) genParts.push([make, kw ? `${kw} kW` : ""].filter(Boolean).join(" "));
  }
  if (genParts.length) {
    vessel.gensets    = genParts.join(", ");
    const firstKW = num(e, "generator1_kw");
    if (firstKW) vessel.generatorKW = `${firstKW} kW each`;
  }
  vessel.emergencyGenerator = val(e, "emergencygenerator") || undefined;

  // ── Performance ───────────────────────────────────────────────────────────
  const maxKn  = num(e, "maxspeed");
  const cruKn  = num(e, "cruisespeed");
  const ecoKn  = num(e, "economicalspeed");
  const rangNm = num(e, "economicalrange") || num(e, "cruiserange");
  if (maxKn)  vessel.maxSpeed    = `${maxKn} kn`;
  if (cruKn)  vessel.cruiseSpeed = `${cruKn} kn`;
  if (ecoKn)  vessel.economySpeed = `${ecoKn} kn`;
  if (rangNm) vessel.range = `${rangNm.toLocaleString("en-US")} nm`;

  // ── Tanks ─────────────────────────────────────────────────────────────────
  const fuelL   = num(e, "fuel_litre");
  const fuelGal = num(e, "fuel_galon");
  if (fuelL && fuelL > 0) {
    const gal = fuelGal ?? Math.round(fuelL / 3.78541);
    vessel.fuelTank = `${fuelL.toLocaleString("en-US")} lt / ${gal.toLocaleString("en-US")} gal`;
  } else if (fuelGal && fuelGal > 0) {
    vessel.fuelTank = galToL(fuelGal);
  }

  const waterL = num(e, "freshwater_litre") || num(e, "water_litre");
  if (waterL && waterL > 0) vessel.freshWater = lToGal(waterL);

  // ── Accommodation ─────────────────────────────────────────────────────────
  const sleepGuests   = num(e, "sleepingguests");
  const cruiseGuests  = num(e, "cruisingguests");
  const guestCabinsN  = num(e, "guestcabins") || num(e, "cabins");
  const crewN         = num(e, "crew");
  const crewCabinsN   = num(e, "crewcabins");
  if (sleepGuests && sleepGuests > 0)  vessel.guests    = String(sleepGuests);
  else if (cruiseGuests && cruiseGuests > 0) vessel.guests = String(cruiseGuests);
  if (guestCabinsN && guestCabinsN > 0) vessel.staterooms = String(guestCabinsN);
  if (crewN && crewN > 0)              vessel.crew       = String(crewN);
  if (crewCabinsN && crewCabinsN > 0)  vessel.crewCabins = String(crewCabinsN);

  // ── Amenities from featureslist ────────────────────────────────────────────
  const featureStr = val(e, "featureslist");
  if (featureStr) {
    const feats = featureStr.split(/[,;]/).map(f => f.trim()).filter(Boolean);
    vessel.features = feats.slice(0, 30);
    const fl = featureStr.toLowerCase();
    if (/flybridge/i.test(fl))  vessel.flybridge = "Yes";
    if (/beach club/i.test(fl)) vessel.beachClub = "Yes";
    if (/jacuzzi|hot tub/i.test(fl)) vessel.jacuzzi = "Yes";
    if (/gym|fitness/i.test(fl)) vessel.gym = "Yes";
    if (/cinema|theatre/i.test(fl)) vessel.cinema = "Yes";
    if (/helide|helipad/i.test(fl)) vessel.helideck = "Yes";
    if (/swim.*platform|pool/i.test(fl)) vessel.swimmingPlatform = "Yes";
    if (/elevator|lift/i.test(fl)) vessel.features.push("Elevator");
  }

  // ── Description ───────────────────────────────────────────────────────────
  const rawDesc = val(e, "salesexpertview") || val(e, "description") || "";
  vessel.description = rawDesc.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 6000);

  // ── Images ────────────────────────────────────────────────────────────────
  // salesimage1 … salesimage20 + gallery_asset
  for (let i = 1; i <= 20; i++) {
    const src = val(e, `salesimage${i}`);
    if (src && /^https?:\/\//i.test(src)) {
      // Prefer highest resolution — strip query params that downscale
      const clean_src = src.split("?")[0];
      vessel.images.push({ src: clean_src, alt: vessel.name });
    }
  }
  // gallery_asset may have additional images as JSON array
  try {
    const gallery = e["gallery_asset"]?.value;
    if (Array.isArray(gallery)) {
      for (const asset of gallery as Record<string,unknown>[]) {
        const assetUrl = String((asset as Record<string,unknown>).url || "");
        if (assetUrl && /^https?:\/\//i.test(assetUrl) && /\.(jpe?g|png|webp)/i.test(assetUrl)) {
          vessel.images.push({ src: assetUrl.split("?")[0], alt: vessel.name });
        }
      }
    }
  } catch { /* skip */ }

  // Dedupe images
  const seen = new Set<string>();
  vessel.images = vessel.images.filter(img => {
    if (seen.has(img.src)) return false;
    seen.add(img.src);
    return true;
  });

  return vessel;
}
