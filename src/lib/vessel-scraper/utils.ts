import type { VesselData, VesselImage } from "./types";

/** Remove excessive whitespace, trim */
export function clean(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Clean and strip known junk suffixes from a headline */
export function cleanHeadline(s?: string): string {
  if (!s) return "";
  return s
    .replace(/\s*[-–|]\s*(Denison|YachtWorld|Yacht\s*World|BoatTrader|boats\.com|YATCO|JamesEdition|Boat\s*International|Ocean\s*King|Van\s*der\s*Valk).*$/i, "")
    .replace(/\s*[-–|]\s*Yacht(s|ing)?\s*(Sales?|for\s*Sale)?.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise a measurement string — keeps original format, just trims */
export function normMeasure(s?: string | null): string {
  return clean(s).replace(/\s*([mM]|ft|kn|nm|kW|hp|HP|KW)\b/g, (m) => ` ${m.trim()}`).trim();
}

/** Convert metres to feet representation: "34.1 m / 111'10\"" */
export function mToFt(metres: number): string {
  const totalInches = metres * 39.3701;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${metres.toFixed(1)} m / ${ft}'${inches}"`;
}

/** Convert feet (+ optional inches) to metres */
export function ftToM(feet: number, inches = 0): string {
  const m = (feet * 12 + inches) * 0.0254;
  return `${m.toFixed(2)} m / ${feet}'${inches > 0 ? inches + '"' : ""}`;
}

/** Convert US gallons to litres: "6,504 gal / 24,620 lt" */
export function galToL(gallons: number): string {
  const litres = Math.round(gallons * 3.78541);
  return `${gallons.toLocaleString("en-US")} gal / ${litres.toLocaleString("en-US")} lt`;
}

/** Convert litres to US gallons: "24,620 lt / 6,504 gal" */
export function lToGal(litres: number): string {
  const gallons = Math.round(litres / 3.78541);
  return `${litres.toLocaleString("en-US")} lt / ${gallons.toLocaleString("en-US")} gal`;
}

/**
 * Normalise any measurement string to dual metric/imperial display.
 * Handles: feet/inches, gallons, litres, metres, knots, nm.
 * If already dual (contains " / ") passes through unchanged.
 */
export function dualMeasure(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim();
  if (s.includes(" / ") || s.includes("/")) return s; // already dual

  // Feet + inches: 25' 7" or 25'7" or 25 ft
  const ftInM = s.match(/^(\d+)'\s*(\d+)"/);
  if (ftInM) return ftToM(parseInt(ftInM[1]), parseInt(ftInM[2]));
  const ftOnlyM = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|')\s*$/i);
  if (ftOnlyM) return ftToM(parseFloat(ftOnlyM[1]));

  // Metres: 34.13m or 34.13 m
  const mM = s.match(/^(\d+(?:\.\d+)?)\s*m(?:etres?|eters?)?\s*$/i);
  if (mM) return mToFt(parseFloat(mM[1]));

  // US Gallons: 6,504 Gallons or 6504 gal
  const galM = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:us\s*)?gal(?:lons?)?\s*$/i);
  if (galM) return galToL(parseFloat(galM[1].replace(/,/g, "")));

  // Litres: 24,620 lt / liters / litres
  const ltM = s.match(/^([\d,]+(?:\.\d+)?)\s*(?:lt|litr(?:e|es?|s)|liters?)\s*$/i);
  if (ltM) return lToGal(parseFloat(ltM[1].replace(/,/g, "")));

  // Gallons with litre equivalent already in parens: "6,504 Gallons (24,620 L)"
  const galParenM = s.match(/^([\d,]+)\s*[Gg]al(?:lons?)?\s*\(([\d,]+)\s*[Ll]/);
  if (galParenM) return galToL(parseFloat(galParenM[1].replace(/,/g, "")));

  return s; // unchanged — knots, nm, HP etc. are universal
}

/** Parse a raw number from a messy string */
export function parseNum(s: string): number | null {
  const m = s.replace(/,/g, "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

/** Deduplicate images by src, filter out logos/icons */
export function dedupeImages(imgs: VesselImage[]): VesselImage[] {
  const seen = new Set<string>();
  return imgs.filter(({ src }) => {
    if (!src || seen.has(src)) return false;
    if (/logo|icon|sprite|pixel|placeholder|svg/i.test(src)) return false;
    if (!/^https?:\/\//i.test(src)) return false;
    seen.add(src);
    return true;
  });
}

/** Merge a scraped vessel onto a base — only fills empty fields */
export function mergeVessel(base: VesselData, patch: Partial<VesselData>): VesselData {
  const result = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof VesselData;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if ((result[key] as unknown[]).length === 0) {
        (result as Record<string, unknown>)[key] = v;
      }
    } else if (typeof v === "string" && !(result[key] as string)) {
      (result as Record<string, unknown>)[key] = v;
    } else if (typeof v === "number" && result[key] === null) {
      (result as Record<string, unknown>)[key] = v;
    }
  }
  return result;
}

/**
 * Spec label → VesselData field mapping.
 * Keys are lowercase substrings to match against spec labels.
 */
export const SPEC_MAP: { patterns: string[]; field: keyof VesselData }[] = [
  { patterns: ["loa", "length overall", "length (oa)", "hull length", "length over all"], field: "loa" },
  { patterns: ["lwl", "waterline"],                                            field: "lwl" },
  { patterns: ["beam", "breadth"],                                             field: "beam" },
  { patterns: ["draft", "draught"],                                            field: "draft" },
  { patterns: ["displacement"],                                                field: "displacement" },
  { patterns: ["gross ton", "gross tonnage", "gt ", "g.t.", "gross register"], field: "grossTonnage" },
  { patterns: ["classification", "class ", "bureau veritas", "rina", "dnv"],   field: "classification" },
  { patterns: ["flag"],                                                         field: "flagState" },
  { patterns: ["hull form", "hull type", "hull shape"],                        field: "hullForm" },
  { patterns: ["hull material", "construction material", "hull construction"], field: "hullMaterial" },
  { patterns: ["superstructure"],                                              field: "superstructure" },
  { patterns: ["exterior design", "exterior designer", "exterior styling"],    field: "exteriorDesign" },
  { patterns: ["interior design", "interior designer"],                        field: "interiorDesign" },
  { patterns: ["naval architect", "naval arch"],                               field: "navalArchitect" },
  { patterns: ["engine brand", "main engine", "engines", "engine type", "engine &", "^engine$", "engine "],  field: "engines" },
  { patterns: ["engine hp", "engine power", "power output", "total power", "mhp", "bhp"], field: "power" },
  { patterns: ["gearbox", "gear box", "gear ratio"],                           field: "gearbox" },
  { patterns: ["propulsion type", "propulsion system"],                        field: "propulsion" },
  { patterns: ["propeller", "propellor", "shaft &", "shaft/"],                 field: "propellers" },
  { patterns: ["generator", "genset"],                                         field: "gensets" },
  { patterns: ["bow thruster"],                                                field: "bowThruster" },
  { patterns: ["stern thruster"],                                              field: "sternThruster" },
  { patterns: ["air condition", "hvac", "a/c"],                               field: "airCon" },
  { patterns: ["max speed", "maximum speed", "top speed"],                    field: "maxSpeed" },
  { patterns: ["cruise speed", "cruising speed", "service speed"],            field: "cruiseSpeed" },
  { patterns: ["range"],                                                       field: "range" },
  { patterns: ["fuel capacity", "fuel tank"],                                  field: "fuelTank" },
  { patterns: ["fresh water", "freshwater", "water capacity", "water tank"],   field: "freshWater" },
  { patterns: ["holding tank", "sewage"],                                      field: "holdingTank" },
  { patterns: ["lube oil"],                                                    field: "lubeOil" },
  { patterns: ["guest", "passengers", "pax"],                                  field: "guests" },
  { patterns: ["stateroom", "cabin", "guest cabin", "sleeping"],               field: "staterooms" },
  { patterns: ["crew capacity", "crew number", "number of crew"],              field: "crew" },
  { patterns: ["crew cabin", "crew stateroom"],                                field: "crewCabins" },
  { patterns: ["tender", "garage", "toy"],                                     field: "tender" },
  { patterns: ["interior area", "living area", "deck area", "total area"],     field: "livingSpace" },
  { patterns: ["navigation", "nav equipment"],                                 field: "navigation" },
  { patterns: ["stabiliser", "stabilizer", "fin stabiliser"],                  field: "stabilisers" },
  { patterns: ["water maker", "watermaker", "reverse osmosis"],                field: "waterMaker" },
  { patterns: ["builder", "shipyard", "manufacturer"],                         field: "builder" },
  { patterns: ["model"],                                                        field: "name" },
  { patterns: ["year built", "year of build", "delivery year", "^year$", "year "], field: "year" },
  { patterns: ["location", "lying"],                                           field: "location" },
  { patterns: ["asking price", "price"],                                        field: "price" },
];

// Fields that should always display in dual metric/imperial
const DUAL_MEASURE_FIELDS = new Set<keyof VesselData>([
  "loa","lwl","beam","beamMax","draft","draftMin","airDraft","displacement","fuelTank","freshWater","holdingTank","greyWater","waterMakerCapacity","livingSpace"
]);

/** Assign a label:value pair to the correct VesselData field */
export function assignSpec(vessel: VesselData, label: string, value: string): void {
  const l = label.toLowerCase().trim();
  const v = clean(value);
  if (!v || v === "—" || v === "-" || v === "n/a" || l.length < 2) return;

  for (const { patterns, field } of SPEC_MAP) {
    if (patterns.some(p => {
      // Pattern starting with ^ means exact match
      if (p.startsWith("^") && p.endsWith("$")) return l === p.slice(1,-1).toLowerCase();
      if (p.startsWith("^")) return l.startsWith(p.slice(1).toLowerCase());
      return l.includes(p.toLowerCase());
    })) {
      if (field === "year") {
        if (!vessel.year) {
          const y = parseNum(v);
          if (y && y > 1900 && y <= new Date().getFullYear() + 10) vessel.year = y;
        }
      } else if (Array.isArray(vessel[field])) {
        // skip
      } else if (!(vessel[field] as string)) {
        const v2 = DUAL_MEASURE_FIELDS.has(field) ? dualMeasure(v) : v;
        (vessel as unknown as Record<string, unknown>)[field] = v2;
      }
      return;
    }
  }
  // stockNumber fallback for hull no / stock no
  if ((l.includes("hull no") || l.includes("stock no") || l === "hull number") && !vessel.stockNumber) {
    vessel.stockNumber = v;
  }
}
