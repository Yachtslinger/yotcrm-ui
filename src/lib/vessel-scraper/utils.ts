import type { VesselData, VesselImage } from "./types";
import { load as cheerioLoad } from "cheerio";

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
    if (/logo|icon|sprite|pixel|placeholder|svg|persons?\/|broker|agent|staff|farzan|avatar/i.test(src)) return false;
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
        (result as unknown as Record<string, unknown>)[key] = v;
      }
    } else if (typeof v === "string" && !(result[key] as string)) {
      (result as unknown as Record<string, unknown>)[key] = v;
    } else if (typeof v === "number" && result[key] === null) {
      (result as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return result;
}

/**
 * Spec label → VesselData field mapping.
 * Keys are lowercase substrings to match against spec labels.
 */
export const SPEC_MAP: { patterns: string[]; field: keyof VesselData }[] = [
  // ── Identity / admin ──────────────────────────────────────────────────────
  { patterns: ["asking price", "price (usd)", "price usd", "^price$"], field: "price" },
  { patterns: ["price (eur)", "price eur", "asking price eur", "eur price"], field: "askingPriceEUR" },
  { patterns: ["vat status", "vat paid", "tax status"],                  field: "vatStatus" },
  { patterns: ["stock no", "stock number", "ref no", "ref number", "listing ref"], field: "stockNumber" },
  { patterns: ["hull no", "hull number"],                                field: "hullNumber" },
  { patterns: ["imo"],                                                   field: "imoNumber" },
  { patterns: ["mmsi"],                                                  field: "mmsiNumber" },
  { patterns: ["registry", "port of registry"],                         field: "registryPort" },
  { patterns: ["home port", "homeport", "lying at", "lying"],           field: "homePort" },
  { patterns: ["flag"],                                                  field: "flagState" },
  { patterns: ["navigation class", "nav class", "navalclass"],          field: "navClass" },
  { patterns: ["classification society", "class society"],              field: "classification" },
  { patterns: ["classification", "class ", "bureau veritas", "rina", "dnv", "lloyds"], field: "classification" },
  { patterns: ["gross ton", "gross tonnage", "gt ", "g.t.", "gross register", "grt"], field: "grossTonnage" },
  { patterns: ["location", "located"],                                  field: "location" },
  { patterns: ["refit year", "last refit"],                             field: "refitYear" },
  { patterns: ["refit detail", "refit description", "refit info"],      field: "refitDetails" },

  // ── Dimensions ────────────────────────────────────────────────────────────
  { patterns: ["loa", "length overall", "length (oa)", "hull length", "length over all", "length, m", "length (m)", "length m", "^length$"], field: "loa" },
  { patterns: ["lwl", "waterline length", "length waterline"],          field: "lwl" },
  { patterns: ["beam max", "maximum beam", "max beam"],                 field: "beamMax" },
  { patterns: ["beam", "breadth", "beam, m", "beam (m)", "beam m"],    field: "beam" },
  { patterns: ["draft (max)", "max draft", "maximum draft", "draught (max)", "max draught", "draught, m", "draft, m", "draught m", "draft m", "draught", "draft"], field: "draft" },
  { patterns: ["draft (min)", "min draft", "minimum draft"],           field: "draftMin" },
  { patterns: ["air draft", "air draught"],                            field: "airDraft" },
  { patterns: ["freeboard"],                                           field: "freeboard" },
  { patterns: ["displacement", "displacement, tons", "displacement (t)"], field: "displacement" },
  { patterns: ["number of decks", "deck count", "decks"],              field: "deckCount" },

  // ── Hull & Construction ───────────────────────────────────────────────────
  { patterns: ["hull form", "hull type", "hull shape"],                field: "hullForm" },
  { patterns: ["hull material", "construction material", "hull construction", "hull"], field: "hullMaterial" },
  { patterns: ["deck material"],                                       field: "deckMaterial" },
  { patterns: ["superstructure"],                                      field: "superstructure" },
  { patterns: ["paint system", "paint"],                               field: "paintSystem" },
  { patterns: ["windows", "glazing", "window"],                        field: "windowGlazing" },
  { patterns: ["keel type", "keel"],                                   field: "keelType" },

  // ── Design ────────────────────────────────────────────────────────────────
  { patterns: ["exterior design", "exterior designer", "exterior styling", "exterior by"], field: "exteriorDesign" },
  { patterns: ["interior design", "interior designer", "interior by"], field: "interiorDesign" },
  { patterns: ["naval architect", "naval arch"],                       field: "navalArchitect" },
  { patterns: ["interior style"],                                      field: "interiorStyle" },
  { patterns: ["color scheme", "colour scheme"],                       field: "colorScheme" },

  // ── Propulsion ────────────────────────────────────────────────────────────
  { patterns: ["main engine", "engine brand", "engine type", "engine &", "engines", "^engine$", "engine,"], field: "engines" },
  { patterns: ["engine hp", "engine power", "power output", "total power", "mhp", "bhp", "engine power, hp"], field: "power" },
  { patterns: ["engine hours"],                                        field: "engineHours" },
  { patterns: ["gearbox", "gear box"],                                 field: "gearbox" },
  { patterns: ["propulsion type", "propulsion system", "propulsion"],  field: "propulsion" },
  { patterns: ["shaft count", "number of shafts", "shafts"],          field: "shaftCount" },
  { patterns: ["propeller", "propellor"],                             field: "propellers" },
  { patterns: ["bow thruster"],                                        field: "bowThruster" },
  { patterns: ["stern thruster"],                                      field: "sternThruster" },
  { patterns: ["stabiliser make", "stabilizer make", "stabiliser brand"], field: "stabilisersMake" },
  { patterns: ["zero speed stabiliser", "zero speed stabilizer", "zero speed stab"], field: "zeroSpeedStabilisers" },
  { patterns: ["stabiliser", "stabilizer", "fin stabiliser"],          field: "stabilisers" },

  // ── Performance ───────────────────────────────────────────────────────────
  { patterns: ["max speed", "maximum speed", "top speed", "top speed, knots"], field: "maxSpeed" },
  { patterns: ["cruise speed", "cruising speed", "service speed", "cruising speed, knots"], field: "cruiseSpeed" },
  { patterns: ["economy speed", "economical speed", "economic speed"], field: "economySpeed" },
  { patterns: ["range (cruise)", "range cruise", "range at cruise", "range, nm", "range (nm)", "range nm", "^range$"], field: "range" },
  { patterns: ["range (economy)", "range economy", "range at economy"], field: "transitRange" },

  // ── Electrical & Generators ───────────────────────────────────────────────
  { patterns: ["generator set", "genset", "generator brand", "^generator$"], field: "gensets" },
  { patterns: ["generator output", "generator kw", "generator power"],  field: "generatorKW" },
  { patterns: ["shore power"],                                          field: "shorepower" },
  { patterns: ["voltage system", "electrical system", "voltage"],      field: "voltageSystem" },
  { patterns: ["emergency generator", "emergency gen"],                field: "emergencyGenerator" },
  { patterns: ["air condition", "hvac", "a/c"],                       field: "airCon" },
  { patterns: ["a/c make", "air con make", "hvac make"],               field: "airConMake" },

  // ── Tanks ─────────────────────────────────────────────────────────────────
  { patterns: ["fuel capacity", "fuel tank", "fuel, l", "fuel (l)", "fuel l", "^fuel$"],  field: "fuelTank" },
  { patterns: ["fuel type"],                                            field: "fuelType" },
  { patterns: ["fresh water", "freshwater", "water capacity", "water tank", "fresh water, l", "fresh water (l)"], field: "freshWater" },
  { patterns: ["holding tank", "black water"],                         field: "holdingTank" },
  { patterns: ["grey water", "gray water"],                            field: "greyWater" },
  { patterns: ["lube oil"],                                            field: "lubeOil" },
  { patterns: ["sewage treatment"],                                    field: "sewageTreatment" },
  { patterns: ["water maker capacity", "watermaker capacity"],         field: "waterMakerCapacity" },
  { patterns: ["water maker", "watermaker", "reverse osmosis"],        field: "waterMaker" },

  // ── Accommodation ─────────────────────────────────────────────────────────
  { patterns: ["guest", "passengers", "pax", "^guests$"],              field: "guests" },
  { patterns: ["owner", "owners cabin", "owner's cabin", "master cabin"], field: "ownersCabin" },
  { patterns: ["guest cabin", "guest stateroom"],                      field: "guestCabins" },
  { patterns: ["stateroom", "cabin", "sleeping", "^cabins$"],          field: "staterooms" },
  { patterns: ["crew cabin", "crew stateroom"],                        field: "crewCabins" },
  { patterns: ["crew mess"],                                           field: "crewMess" },
  { patterns: ["crew capacity", "crew number", "number of crew", "^crew$"], field: "crew" },
  { patterns: ["interior area", "living area", "deck area", "total area", "gross area"], field: "livingSpace" },

  // ── Amenities ─────────────────────────────────────────────────────────────
  { patterns: ["flybridge"],                                           field: "flybridge" },
  { patterns: ["beach club"],                                          field: "beachClub" },
  { patterns: ["swimming platform", "swim platform"],                  field: "swimmingPlatform" },
  { patterns: ["jacuzzi", "hot tub", "whirlpool"],                    field: "jacuzzi" },
  { patterns: ["gym", "gymnasium", "fitness"],                         field: "gym" },
  { patterns: ["cinema", "theatre", "theater"],                        field: "cinema" },
  { patterns: ["tender count", "number of tenders"],                   field: "tenderCount" },
  { patterns: ["water toys", "toys"],                                  field: "toys" },
  { patterns: ["tender", "garage", "toy garage"],                      field: "tender" },
  { patterns: ["garage detail"],                                       field: "garage" },

  // ── Navigation & Comms ────────────────────────────────────────────────────
  { patterns: ["navigation system", "nav equipment", "navigation"],    field: "navigation" },
  { patterns: ["radar"],                                               field: "radar" },
  { patterns: ["chart plotter", "chartplotter"],                       field: "chartPlotter" },
  { patterns: ["autopilot"],                                           field: "autopilot" },
  { patterns: ["satcom", "vsat", "satellite comm"],                    field: "satcom" },
  { patterns: ["ais"],                                                 field: "aisSystem" },
  { patterns: ["anchoring system", "anchor system"],                   field: "anchoring" },
  { patterns: ["windlass"],                                            field: "windlass" },

  // ── Safety ────────────────────────────────────────────────────────────────
  { patterns: ["fire suppression", "fire fighting", "fire system"],    field: "fireSuppression" },
  { patterns: ["life raft", "liferaft"],                               field: "lifeRafts" },
  { patterns: ["mob system", "man overboard"],                         field: "mobSystem" },
  { patterns: ["helideck", "helipad", "helicopter"],                   field: "helideck" },

  // ── Condition & Service ───────────────────────────────────────────────────
  { patterns: ["last survey", "survey date"],                          field: "lastSurvey" },
  { patterns: ["last dry dock", "last drydock", "last haul"],          field: "lastDrydock" },
  { patterns: ["last service", "last maintenance", "last refit"],      field: "lastService" },

  // ── Identity fallbacks ────────────────────────────────────────────────────
  { patterns: ["builder", "shipyard", "manufacturer"],                 field: "builder" },
  { patterns: ["^model$", "model name"],                               field: "name" },
  { patterns: ["year built", "year of build", "delivery year", "^year$", "delivery", "built"], field: "year" },
];

// Fields that should always display in dual metric/imperial
const DUAL_MEASURE_FIELDS = new Set<keyof VesselData>([
  "loa","lwl","beam","beamMax","draft","draftMin","airDraft","freeboard",
  "displacement","fuelTank","freshWater","holdingTank","greyWater",
  "waterMakerCapacity","livingSpace"
]);

/**
 * Some sites encode the unit inside the label rather than the value, e.g.:
 *   ruyachts.com:  "Length, m"  => "24.97"   →  we want value "24.97 m"
 *                  "Fuel, l"    => "5,900"    →  we want value "5,900 lt"
 *                  "Top speed, knots" => "33" →  we want value "33 kn"
 * This map normalises the raw unit token to a standard display suffix.
 */
const LABEL_UNIT_NORM: Record<string, string> = {
  m: "m", metres: "m", meters: "m",
  ft: "ft", feet: "ft",
  l: "lt", lt: "lt", litre: "lt", litres: "lt", liter: "lt", liters: "lt",
  nm: "nm",
  knot: "kn", knots: "kn", kn: "kn",
  hp: "HP", mhp: "HP", bhp: "HP",
  kw: "kW",
  grt: "GRT", gt: "GT",
  ton: "t", tons: "t", t: "t",
};

/** Assign a label:value pair to the correct VesselData field */
export function assignSpec(vessel: VesselData, label: string, value: string): void {
  // Strip trailing punctuation (colon, semicolon, period, comma) and whitespace
  // BEFORE pattern matching. Many DOM labels arrive as "Length:" / "Price:" /
  // "Builder:" which previously broke exact-match patterns like "^length$" and
  // "^price$" and forced substring patterns to do extra work.
  let l = label.toLowerCase().trim().replace(/[:;.]+$/, "").trim();
  const v = clean(value);
  if (!v || v === "—" || v === "-" || v === "n/a" || l.length < 2) return;

  // ── Unit-in-label extraction ─────────────────────────────────────────────
  // Handles patterns like "Length, m", "Fuel (l)", "Top speed, knots"
  let enrichedValue = v;
  const unitSuffixMatch = l.match(/[,\s]+\(?([\w]+)\)?$/);
  if (unitSuffixMatch) {
    const rawUnit = unitSuffixMatch[1].toLowerCase();
    const normUnit = LABEL_UNIT_NORM[rawUnit];
    if (normUnit) {
      // Strip the unit from label so SPEC_MAP can match cleanly
      l = l.slice(0, unitSuffixMatch.index!).trim().replace(/[,\s]+$/, "");
      // Only append unit if value looks like a bare number (no unit already present)
      if (/^[\d,.\s×x\-–\/]+$/.test(v) && !/ [a-zA-Z]/.test(v)) {
        enrichedValue = `${v} ${normUnit}`;
      }
    }
  }

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
        // Sanity guard: short-fact fields must stay short. A value running
        // longer than a phrase is almost certainly a mis-grabbed sentence
        // fragment. Prose fields (refitDetails) are exempt.
        if (field !== "refitDetails" && (v.length > 120 || v.split(/\s+/).length > 16)) continue;
        let v2 = DUAL_MEASURE_FIELDS.has(field) ? dualMeasure(enrichedValue) : enrichedValue;

        // ── Engine HP extraction ─────────────────────────────────────────
        // If assigning to engines and the value contains HP (e.g. "2 x Caterpillar C12 715.00hp"),
        // split the HP into vessel.power and strip it from the engine string.
        if (field === "engines") {
          const hpMatch = v2.match(/\s+([\d,.]+)\s*(?:hp|HP|bhp|mhp|kW|KW)\s*(?:each|total)?/i);
          if (hpMatch) {
            if (!vessel.power) vessel.power = hpMatch[1].replace(/,/g, "") + " " + hpMatch[0].trim().replace(/[\d,.]+\s*/,"");
            v2 = v2.slice(0, hpMatch.index).trim();
          }
        }

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

/**
 * mineFromText — extract vessel spec fields from free-form listing prose.
 * Run AFTER structured parsing; only fills fields still empty.
 * Covers: engines, hours, performance, accommodation, nav/comms,
 *         stabilisers, thrusters, gensets, tanks, amenities, design credits.
 */
export function mineFromText(vessel: VesselData, raw: string): void {
  if (!raw || raw.length < 20) return;
  const t = raw.replace(/\s+/g, " ");

  // Helper: set field only if currently empty
  const set = (field: keyof VesselData, value: string) => {
    if (value && !(vessel as unknown as Record<string, unknown>)[field as string])
      (vessel as unknown as Record<string, unknown>)[field as string] = value.trim();
  };
  const setNum = (field: keyof VesselData, value: number) => {
    if (!(vessel as unknown as Record<string, unknown>)[field as string])
      (vessel as unknown as Record<string, unknown>)[field as string] = value;
  };
  const grab = (p: RegExp): string => {
    const m = t.match(p);
    return m ? (m[1] || m[0]).trim() : "";
  };

  // ── Engines ────────────────────────────────────────────────────────────────
  if (!vessel.engines) {
    // "powered by twin MTU 12V 4000 M93" / "2x Caterpillar C32 ACERT"
    const eng =
      grab(/[Pp]owered by\s+(twin|2\s*x|two|triple|3\s*x|quad|4\s*x)\s+([A-Za-z][A-Za-z0-9\-\s]{2,30}?)\s+(?:diesel\s+)?(?:engine|motor)/i) ||
      grab(/(\d+\s*[Xx×]\s*[A-Z][a-zA-Z]+\s+[A-Z0-9\-]{2,}(?:\s+[A-Z][A-Z0-9]{1,})?)/i) ||
      grab(/[Mm]ain\s+engines?[:\s]+([A-Za-z][A-Za-z0-9\s\-×x,]{3,60}?)(?:\.|,|\n)/i);
    if (eng) set("engines", eng);
  }

  // ── Engine hours ────────────────────────────────────────────────────────────
  if (!vessel.engineHours) {
    // "Port: 1,819 hrs / Stbd: 1,824 hrs"  or  "1,200 engine hours"
    const portH = t.match(/(?:[Pp]ort|PS|P)[:\s-]+(\d[\d,]+)\s*(?:hrs?|hours?)/i);
    const stbdH = t.match(/(?:[Ss]t(?:ar)?bd?|SB|S)[:\s-]+(\d[\d,]+)\s*(?:hrs?|hours?)/i);
    if (portH && stbdH) {
      set("engineHours", `Port: ${portH[1]} hrs / Stbd: ${stbdH[1]} hrs`);
    } else {
      const eh = grab(/(\d[\d,]+)\s*(?:engine\s*)?hours?\s*(?:each|per\s*engine|on\s+(?:both|each))?/i) ||
                 grab(/engine\s+hours?[:\s]+(\d[\d,]+)/i) ||
                 grab(/(?:approx\.?\s*)?(\d[\d,]+)\s*hrs?\s+(?:on|per)\s+(?:each|the)\s+(?:main\s+)?engine/i);
      if (eh) set("engineHours", `${eh} hrs`);
    }
  }

  // ── Power ──────────────────────────────────────────────────────────────────
  if (!vessel.power) {
    const pw = grab(/([\d,.]+)\s*(?:hp|HP|bhp|mhp|kW|KW)\s*(?:each|per\s+engine|total)?/i) ||
               grab(/(?:total\s+)?power\s+(?:output\s+)?(?:of\s+)?(\d[\d,]+\s*(?:hp|kW))/i);
    // Guard: must be ≥100 to avoid capturing knot speeds (e.g. "15.5 kn" → "15")
    if (pw) {
      const n = parseFloat(pw.replace(/,/g, ""));
      if (!isNaN(n) && n >= 100) set("power", pw);
    }
  }

  // ── Max speed ──────────────────────────────────────────────────────────────
  if (!vessel.maxSpeed) {
    const ms = grab(/(?:top|max(?:imum)?)\s+speed\s+(?:of\s+)?([\d.]+)\s*(?:knots?|kn)/i) ||
               grab(/([\d.]+)\s*(?:knots?|kn)\s+(?:top|max(?:imum)?|full)/i) ||
               grab(/reaches?\s+(?:a\s+)?(?:top\s+)?(?:max(?:imum)?\s+)?speed\s+of\s+([\d.]+)\s*(?:knots?|kn)/i);
    if (ms) set("maxSpeed", `${ms} kn`);
  }

  // ── Cruise speed ────────────────────────────────────────────────────────────
  if (!vessel.cruiseSpeed) {
    const cs = grab(/cruis(?:es?|ing)\s+(?:comfortably\s+)?(?:at\s+)?([\d.]+)\s*(?:knots?|kn)/i) ||
               grab(/(?:service|cruise|cruising)\s+speed\s+(?:of\s+)?([\d.]+)\s*(?:knots?|kn)/i);
    if (cs) set("cruiseSpeed", `${cs} kn`);
  }

  // ── Range ───────────────────────────────────────────────────────────────────
  if (!vessel.range) {
    const rm = t.match(/([\d,]+)\s*(?:nautical\s+)?(?:miles?|nm)\s+(?:at|@)\s+([\d.]+)\s*(?:knots?|kn)/i);
    if (rm) set("range", `${rm[1]} nm @ ${rm[2]} kn`);
    else {
      const r2 = grab(/range\s+(?:of\s+)?([\d,]+)\s*(?:nautical\s+)?(?:miles?|nm)/i) ||
                 grab(/([\d,]+)\s*(?:nautical\s+)?(?:nm|mile)s?\s+range/i);
      if (r2) set("range", `${r2} nm`);
    }
  }

  // ── Accommodation ────────────────────────────────────────────────────────────
  if (!vessel.guests) {
    const g = grab(/accommodates?\s+(?:up\s+to\s+)?(\d+)\s+guests?/i) ||
              grab(/(?:up\s+to\s+)?(\d+)\s+guests?\s+(?:in|across)/i) ||
              grab(/maximum\s+(?:of\s+)?(\d+)\s+(?:overnight\s+)?guests?/i);
    if (g) set("guests", g);
  }
  if (!vessel.staterooms) {
    const sr = grab(/(\d+)\s+(?:guest\s+)?staterooms?/i) ||
               grab(/(\d+)\s+(?:en-?suite\s+)?cabins?(?!\s+crew)/i) ||
               grab(/accommodation\s+(?:comprises?\s+)?(?:of\s+)?(\d+)\s+cabins?/i);
    if (sr) set("staterooms", sr);
  }
  if (!vessel.crew) {
    const cr = grab(/(?:up\s+to\s+|total\s+of\s+)?(\d+)\s+crew\b/i) ||
               grab(/crew\s+(?:of|capacity[:\s]+)(\d+)/i) ||
               grab(/(?:a\s+)?crew\s+complement\s+(?:of\s+)?(\d+)/i);
    if (cr) set("crew", cr);
  }

  // ── Stabilisers ──────────────────────────────────────────────────────────────
  if (!vessel.stabilisers) {
    const brands = "Seakeeper|Naiad|Trac|CMC|ABT|Quantum|Sleipner|Wesmar|Side-Power";
    const stab =
      grab(new RegExp(`((?:${brands})[A-Za-z0-9\\s\\-]+?(?:gyro(?:scopic)?|fin|stabiliz(?:a?tion|er|or)|zero.speed)[A-Za-z0-9\\s\\-]*)`, "i")) ||
      grab(new RegExp(`((?:zero.speed\\s+)?(?:fin\\s+)?stabiliz(?:a?tion|er|or)s?\\s+(?:by\\s+|make:\\s*)?(?:${brands})[A-Za-z0-9\\s\\-]*)`, "i")) ||
      grab(new RegExp(`(?:${brands})\\s+[A-Za-z0-9\\s\\-]*?stabiliz(?:a?tion|er|or)`, "i")) ||
      grab(/zero.speed\s+stabiliz(?:a?tion|er|or)s?/i) ||
      grab(/fin\s+stabiliz(?:a?tion|er|or)s?/i) ||
      grab(/gyroscopic\s+stabiliz(?:a?tion|er|or)s?/i);
    if (stab) set("stabilisers", stab);
  }
  if (!vessel.zeroSpeedStabilisers && /zero.speed\s+stabiliz/i.test(t))
    set("zeroSpeedStabilisers", "Yes");

  // ── Thrusters ────────────────────────────────────────────────────────────────
  if (!vessel.bowThruster) {
    const bt = grab(/bow\s+thruster[s]?(?:[:\s]+)([A-Za-z0-9\s\-kW]+?)(?:,|\.|and\s+stern)/i) ||
               (/(bow\s+(?:and\s+stern\s+)?thruster)/i.test(t) ? "Yes" : "");
    if (bt) set("bowThruster", bt);
  }
  if (!vessel.sternThruster) {
    const st = grab(/stern\s+thruster[s]?(?:[:\s]+)([A-Za-z0-9\s\-kW]+?)(?:,|\.)/i) ||
               (/stern\s+thruster/i.test(t) ? "Yes" : "");
    if (st) set("sternThruster", st);
  }

  // ── Gensets ───────────────────────────────────────────────────────────────────
  if (!vessel.gensets) {
    const gs =
      grab(/(\d+\s*[Xx×]\s*[A-Za-z][A-Za-z0-9\s\-]+?\s*(?:\d+\s*)?kW\s*generators?)/i) ||
      grab(/(?:two|three|2|3)\s+([A-Za-z][A-Za-z0-9\s]+?)\s+generators?(?:\s+each\s+[\d]+\s*kW)?/i) ||
      grab(/generators?[:\s]+(\d+\s*[Xx×]\s*[A-Za-z][A-Za-z0-9\s\-kW]{3,40})/i);
    if (gs) set("gensets", gs);
  }

  // ── Navigation / comms ─────────────────────────────────────────────────────
  const NAV_BRANDS = "Furuno|Garmin|Simrad|Raymarine|Navionics|B&G|Icom|Standard Horizon|JRC|Koden|Northstar|Lowrance|Humminbird|Chartmaster";
  if (!vessel.radar) {
    const r = grab(new RegExp(`((?:${NAV_BRANDS})\\s+[A-Za-z0-9\\-\\s]{1,20}?\\s*radar)`, "i")) ||
              grab(/([A-Za-z]+\s+radar\s+(?:IMO|ARPA)?)/i);
    if (r) set("radar", r);
  }
  if (!vessel.chartPlotter) {
    const cp = grab(new RegExp(`((?:${NAV_BRANDS})\\s+[A-Za-z0-9\\-\\s]{1,20}?\\s*(?:chart\\s*plotter|MFD|multifunction))`, "i")) ||
               grab(/([A-Za-z]+\s+(?:\d+\s+)?chart\s*plotter)/i);
    if (cp) set("chartPlotter", cp);
  }
  if (!vessel.autopilot) {
    const ap = grab(new RegExp(`((?:${NAV_BRANDS})\\s+[A-Za-z0-9\\-\\s]{0,15}?autopilot)`, "i")) ||
               grab(/autopilot[:\s]+([A-Za-z][A-Za-z0-9\s\-]{2,30})/i);
    if (ap) set("autopilot", ap);
  }
  if (!vessel.aisSystem) {
    const ais = grab(new RegExp(`((?:${NAV_BRANDS})\\s+[A-Za-z0-9\\-\\s]{0,10}?AIS)`, "i")) ||
                (/\bAIS\b/.test(t) ? "AIS" : "");
    if (ais) set("aisSystem", ais);
  }
  if (!vessel.satcom) {
    const stlk = (t.match(/Starlink/gi) || []).length;
    const irid = /Iridium/i.test(t);
    const inm  = /Inmarsat/i.test(t);
    const kvh  = /KVH/i.test(t);
    if (stlk > 0 || irid || inm || kvh) {
      const parts: string[] = [];
      if (stlk > 0) parts.push(stlk > 1 ? `Starlink x${stlk}` : "Starlink");
      if (inm)  parts.push("Inmarsat");
      if (irid) parts.push("Iridium");
      if (kvh)  parts.push("KVH");
      set("satcom", parts.join(", "));
    }
  }

  // ── Navigation summary ─────────────────────────────────────────────────────
  if (!vessel.navigation) {
    const navParts: string[] = [];
    if (vessel.radar)       navParts.push(vessel.radar);
    if (vessel.chartPlotter && vessel.chartPlotter !== vessel.radar) navParts.push(vessel.chartPlotter);
    if (vessel.autopilot)   navParts.push(vessel.autopilot);
    if (vessel.aisSystem && vessel.aisSystem !== "AIS") navParts.push(vessel.aisSystem);
    // Look for additional nav equipment in text
    const echoM = grab(/([A-Za-z]+\s+echosounder)/i);
    if (echoM) navParts.push(echoM);
    if (navParts.length > 1) set("navigation", navParts.join(", "));
  }

  // ── Design credits ──────────────────────────────────────────────────────────
  if (!vessel.exteriorDesign) {
    const ed = grab(/exterior\s+(?:design|styling|designer)\s+by\s+([A-Za-z][A-Za-z\s&\-\.]{2,40}?)(?:\.|,|and\s+interior|\n)/i) ||
               grab(/(?:designed|styled)\s+(?:externally\s+)?by\s+([A-Za-z][A-Za-z\s&\-\.]{2,30}?)\s+(?:for\s+the\s+exterior|exterior)/i);
    if (ed) set("exteriorDesign", ed);
  }
  if (!vessel.interiorDesign) {
    const id = grab(/interior\s+(?:design|styling|designer)\s+(?:by\s+)?([A-Za-z][A-Za-z\s&\-\.]{2,40}?)(?:\.|,|\n)/i) ||
               grab(/([A-Za-z][A-Za-z\s&\-]{3,30}?)\s+(?:studio|design(?:ers?)?)\s+(?:created|designed|executed)\s+the\s+interior/i);
    if (id) set("interiorDesign", id);
  }
  if (!vessel.navalArchitect) {
    const na = grab(/naval\s+arch(?:itect(?:ure)?|\.)\s+(?:by\s+)?([A-Za-z][A-Za-z\s&\-\.]{2,30}?)(?:\.|,|\n)/i);
    if (na) set("navalArchitect", na);
  }

  // ── Hull & classification ────────────────────────────────────────────────────
  if (!vessel.hullMaterial) {
    if (/steel\s+hull/i.test(t)) set("hullMaterial", "Steel");
    else if (/alumini(?:um|um)\s+hull/i.test(t)) set("hullMaterial", "Aluminium");
    else if (/fibreglass|fiberglass|grp\s+hull|frp\s+hull/i.test(t)) set("hullMaterial", "GRP / Fibreglass");
    else if (/composite\s+hull/i.test(t)) set("hullMaterial", "Composite");
    else if (/carbon\s+(?:fibre|fiber)\s+hull/i.test(t)) set("hullMaterial", "Carbon fibre");
  }
  if (!vessel.classification) {
    const cl = grab(/(?:built\s+to\s+|classed\s+with\s+|classified\s+by\s+)?(Lloyd'?s?\s+Register[A-Za-z\s,]+|Bureau\s+Veritas[A-Za-z\s,]*|RINA[A-Za-z\s,]*|DNV(?:\s+GL)?[A-Za-z\s,]*|ABS[A-Za-z\s,]*)/i);
    if (cl) set("classification", cl.trim().replace(/\s+/g," "));
  }

  // ── Refit ──────────────────────────────────────────────────────────────────
  if (!vessel.refitYear) {
    const ry = grab(/(?:refit|refitted|refurbished|re-?fit(?:ted)?)\s+in\s+((?:19|20)\d{2})/i) ||
               grab(/((?:19|20)\d{2})\s+refit/i);
    if (ry) set("refitYear", ry);
  }

  // ── Amenities from keywords ─────────────────────────────────────────────────
  if (!vessel.flybridge && /flybridge/i.test(t)) set("flybridge", "Yes");
  if (!vessel.beachClub && /beach\s*club/i.test(t)) set("beachClub", "Yes");
  if (!vessel.jacuzzi && /jacuzzi|hot\s*tub|whirlpool/i.test(t)) set("jacuzzi", "Yes");
  if (!vessel.gym && /\bgym\b|gymnasium|fitness\s+(?:room|center|centre)/i.test(t)) set("gym", "Yes");
  if (!vessel.cinema && /cinema|theatre|theater|screening\s+room/i.test(t)) set("cinema", "Yes");
  if (!vessel.helideck && /helide(?:ck|cks)|helipad|helicopter\s+landing/i.test(t)) set("helideck", "Yes");
  if (!vessel.swimmingPlatform && /swim(?:ming)?\s+platform/i.test(t)) set("swimmingPlatform", "Yes");

  // ── Tender ──────────────────────────────────────────────────────────────────
  if (!vessel.tender) {
    const td = grab(/([A-Za-z]+\s+\d{3,4})\s+[Tt]ender/i) ||
               grab(/([\d.]+\s*(?:m|ft)[^\n,]{0,30}tender[^\n,]*)/i) ||
               grab(/tender[:\s]+([A-Za-z0-9\s\-\.]{4,40}?)(?:,|\.|\n)/i);
    if (td) set("tender", td);
  }

  // ── Water toys ──────────────────────────────────────────────────────────────
  if (!vessel.toys) {
    const toyList: string[] = [];
    if (/jet\s*ski|waverunner|pwc/i.test(t)) toyList.push("Jet ski");
    if (/seabob/i.test(t)) toyList.push("Seabob");
    if (/wakeboard/i.test(t)) toyList.push("Wakeboard");
    if (/water\s*ski(?!\s+tender)/i.test(t)) toyList.push("Water skis");
    if (/kayak/i.test(t)) toyList.push("Kayak(s)");
    if (/paddleboard|SUP\b/i.test(t)) toyList.push("Paddleboard(s)");
    if (/inflatable/i.test(t)) toyList.push("Inflatables");
    if (/efoil|e-foil/i.test(t)) toyList.push("eFoil");
    if (/scuba|dive\s+(?:equipment|gear)/i.test(t)) toyList.push("Dive equipment");
    if (/snorkel/i.test(t)) toyList.push("Snorkelling gear");
    if (/windsurfer/i.test(t)) toyList.push("Windsurfer");
    if (toyList.length) set("toys", toyList.join(", "));
  }

  // ── Fuel tank from prose ─────────────────────────────────────────────────────
  if (!vessel.fuelTank) {
    const fuelL = t.match(/([\d,]+)\s*(?:litr?e?s?|lt|l)\s+(?:of\s+)?fuel/i);
    const fuelG = t.match(/([\d,]+)\s*(?:us\s*)?gal(?:lon)?\s+fuel/i);
    if (fuelL) set("fuelTank", lToGal(parseInt(fuelL[1].replace(/,/g,""))));
    else if (fuelG) set("fuelTank", galToL(parseInt(fuelG[1].replace(/,/g,""))));
  }

  // ── Watermaker ───────────────────────────────────────────────────────────────
  if (!vessel.waterMaker) {
    const wm = grab(/([A-Za-z][A-Za-z0-9\s\-]+?)\s*water\s*maker/i) ||
               (/reverse\s*osmosis|watermaker|water\s*maker/i.test(t) ? "Yes" : "");
    if (wm) set("waterMaker", wm);
  }

  // ── Year fallback from prose ─────────────────────────────────────────────────
  if (!vessel.year) {
    const ym = t.match(/delivered\s+in\s+((?:19|20)\d{2})/i) ||
               t.match(/built\s+(?:in\s+)?((?:19|20)\d{2})/i) ||
               t.match(/launched\s+(?:in\s+)?((?:19|20)\d{2})/i);
    if (ym) setNum("year", parseInt(ym[1]));
  }

  // ── LOA from prose ────────────────────────────────────────────────────────────
  if (!vessel.loa) {
    const lm = t.match(/(\d+(?:\.\d+)?)\s*(?:metre|meter)s?\s+(?:motor\s+)?yacht/i) ||
               t.match(/(\d+(?:\.\d+)?\s*m)\s*(?:\/|,|\s)\s*(\d+(?:\.\d+)?)\s*(?:ft|')/i) ||
               t.match(/(\d+)\s*(?:ft|foot|feet)\s+(?:motor\s+)?yacht/i);
    if (lm) set("loa", lm[2] ? `${lm[1]}/${lm[2]}` : lm[1]);
  }

  // ── Location fallback ─────────────────────────────────────────────────────────
  if (!vessel.location) {
    const loc = grab(/(?:currently\s+)?(?:located|lying|berthed|moored)\s+(?:at\s+|in\s+)([A-Za-z][A-Za-z,\s]{3,40}?)(?:\.|,|\n)/i);
    if (loc) set("location", loc);
  }
}

// ─── Layer 3: AI-assisted spec extraction ────────────────────────────────────
/**
 * aiExtractSpecs — uses Claude Haiku to extract vessel specs from prose text.
 *
 * Called AFTER JSON-LD parsing (Layer 1) and regex mining (Layer 2).
 * Only fills fields still empty — never overwrites structured data.
 * Cost: ~$0.001 per listing on Haiku. Fails silently if no API key.
 *
 * Requires ANTHROPIC_API_KEY env var set on Railway.
 */
export async function aiExtractSpecs(vessel: VesselData, text: string): Promise<void> {
  if (!text || text.length < 100) return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return; // no key → L1+L2 results stand, no crash

  // Only ask Claude about fields that are still empty after L1+L2
  type ExtractField = { field: keyof VesselData; hint: string };
  const EXTRACTABLE: ExtractField[] = [
    { field: "engines",              hint: "main engine make and model e.g. 'Twin MTU 12V 4000 M93' or '2x CAT C32 ACERT'" },
    { field: "engineHours",          hint: "engine operating hours e.g. '1,200 hrs' or 'Port: 1,200 / Stbd: 1,180 hrs'" },
    { field: "engineMake",           hint: "engine manufacturer only e.g. 'MTU', 'Caterpillar', 'MAN', 'Volvo Penta'" },
    { field: "engineModel",          hint: "engine model only e.g. '12V 4000 M93', 'C32 ACERT', 'D13'" },
    { field: "power",                hint: "total power output e.g. '2 × 2,638 HP' or '3,650 HP total'" },
    { field: "gensets",              hint: "generator full description including make and kW e.g. '2 × 60 kW Kohler'" },
    { field: "generatorKW",          hint: "generator output per unit e.g. '60 kW each' or '120 kW'" },
    { field: "generatorHours",       hint: "generator operating hours e.g. '800 hrs'" },
    { field: "stabilisers",          hint: "stabilization system full description — brand, type, model" },
    { field: "stabilisersMake",      hint: "stabilizer manufacturer e.g. 'Naiad', 'Seakeeper', 'CMC Marine'" },
    { field: "zeroSpeedStabilisers", hint: "zero-speed stabilizer brand or 'Yes' if confirmed" },
    { field: "bowThruster",          hint: "bow thruster — brand and power e.g. 'Sleipner 60 kW'" },
    { field: "sternThruster",        hint: "stern thruster — brand and power" },
    { field: "davitMake",            hint: "davit or crane manufacturer e.g. 'Opacmare', 'Besenzoni', 'Mar Quipt'" },
    { field: "davitCapacity",        hint: "davit lifting capacity e.g. '3 ton', '3,000 kg SWL'" },
    { field: "radar",                hint: "radar system brand and model e.g. 'Furuno FAR-2228'" },
    { field: "chartPlotter",         hint: "chart plotter or MFD brand and model e.g. 'Garmin GPSMAP 8616'" },
    { field: "autopilot",            hint: "autopilot brand and model e.g. 'Furuno NavPilot 711'" },
    { field: "satcom",               hint: "satellite comms — Starlink, VSAT, Inmarsat, Iridium, KVH etc." },
    { field: "aisSystem",            hint: "AIS transceiver brand and model" },
    { field: "tender",               hint: "main tender description — make, model, length" },
    { field: "tenderMake",           hint: "tender manufacturer e.g. 'Rand Boats', 'Williams', 'Castoldi'" },
    { field: "tenderModel",          hint: "tender model e.g. 'Picnic 17', 'Turbojet 285'" },
    { field: "tenderLength",         hint: "tender length e.g. '5.2 m / 17 ft'" },
    { field: "tenderCount",          hint: "number of tenders aboard" },
    { field: "beachClub",            hint: "beach club description — features, fold-down sections, sq m" },
    { field: "swimmingPlatform",     hint: "swim platform type e.g. 'Hydraulic', 'Electric fold-down', 'Opacmare'" },
    { field: "toys",                 hint: "water toys list — jet ski, seabob, kayak, paddleboard, efoil, dive gear etc." },
    { field: "jacuzzi",              hint: "'Yes' if jacuzzi, hot tub or whirlpool mentioned" },
    { field: "gym",                  hint: "'Yes' if gym or fitness room mentioned" },
    { field: "cinema",               hint: "'Yes' if cinema, theater or screening room mentioned" },
    { field: "helideck",             hint: "'Yes' if helideck or helipad mentioned" },
    { field: "refitYear",            hint: "year of most recent refit e.g. '2022'" },
    { field: "refitDetails",         hint: "summary of refit work performed" },
    { field: "lastSurvey",           hint: "date of last survey e.g. '2023'" },
    { field: "lastDrydock",          hint: "date of last dry dock or haul-out" },
    { field: "maxSpeed",             hint: "maximum speed in knots e.g. '17 kn'" },
    { field: "cruiseSpeed",          hint: "cruising speed e.g. '12 kn'" },
    { field: "range",                hint: "cruising range in NAUTICAL MILES exactly as stated — never convert to statute miles, never add decimals e.g. '4,000 nm' or '9,000+ nm'" },
    { field: "fuelTank",             hint: "total fuel capacity e.g. '30,000 lt / 7,925 gal'" },
    { field: "freshWater",           hint: "fresh water capacity e.g. '8,000 lt / 2,113 gal'" },
    { field: "waterMaker",           hint: "watermaker brand and capacity e.g. 'Spectra 1,200 lt/day'" },
    { field: "guests",               hint: "maximum overnight guests as a number e.g. '12'" },
    { field: "staterooms",           hint: "number of guest staterooms or cabins e.g. '6'" },
    { field: "crew",                 hint: "crew complement e.g. '8'" },
    { field: "hullMaterial",         hint: "hull construction material e.g. 'Steel', 'Aluminium', 'GRP'" },
    { field: "classification",       hint: "classification society e.g. 'Lloyd's Register', 'Bureau Veritas', 'RINA'" },
    { field: "flagState",            hint: "flag state / country of registration e.g. 'Cayman Islands'" },
    { field: "navalArchitect",       hint: "naval architect or designer firm" },
    { field: "exteriorDesign",       hint: "exterior design studio or designer" },
    { field: "interiorDesign",       hint: "interior design studio or designer" },
    { field: "fireSuppression",      hint: "fire suppression system type e.g. 'CO2', 'FM-200'" },
    { field: "lifeRafts",            hint: "life raft count and brand" },
    { field: "voltageSystem",        hint: "onboard voltage e.g. '220/380V 50Hz, 110/220V 60Hz'" },
    { field: "shorepower",           hint: "shore power connection spec" },
    { field: "fuelConsumption",      hint: "fuel consumption at cruise e.g. '450 lt/hr at 12 kn'" },
    { field: "displacement",         hint: "displacement in tonnes" },
    { field: "grossTonnage",         hint: "gross tonnage (GT) number" },
    { field: "location",             hint: "current location where vessel is lying or berthed" },
    { field: "description",          hint: "a flowing 2-4 paragraph marketing description of the vessel, drawn from the listing's own descriptive prose — do NOT invent details, only rephrase/condense what the listing states" },
  ];

  const needed = EXTRACTABLE.filter(({ field }) => {
    const v = (vessel as unknown as Record<string, unknown>)[field as string];
    return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  });
  if (needed.length === 0) return;

  const fieldList = needed.map(({ field, hint }) => `"${field}": ${hint}`).join("\n");

  const prompt = `Extract vessel specification data from this yacht listing.
Return ONLY a valid JSON object. Include only fields you can find in the text.
Omit fields not mentioned. Never invent values. Keep values concise and factual.

Fields to find:
${fieldList}

Listing text:
${text.slice(0, 18000)}

JSON:`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return;
    const data = await res.json();
    const raw = (data?.content?.[0]?.text || "").trim();
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      const m = jsonStr.match(/\{[\s\S]+\}/);
      if (!m) return;
      try { extracted = JSON.parse(m[0]); } catch { return; }
    }

    // Apply only to still-empty fields — L1/L2 data is never overwritten
    for (const [key, value] of Object.entries(extracted)) {
      if (!value || typeof value !== "string" || value.trim() === "") continue;
      // Filter out AI "I don't know" responses — these are useless noise
      const vLow = value.toLowerCase().trim();
      if (/^not\s+(mentioned|found|specified|available|provided|stated|indicated|given|listed|noted|included|discussed|detailed)|^unknown$|^n\/a$|^none$|^unspecified$|^unclear$/i.test(vLow)) continue;
      const field = key as keyof VesselData;
      // Sanity guard: short-fact fields must stay short. Rejects sentence
      // fragments that brittle parsing (or a confused AI) may produce —
      // e.g. a paragraph landing in "fuelTank". Prose fields are exempt.
      const PROSE_FIELDS = new Set(["description", "refitDetails", "toys"]);
      if (!PROSE_FIELDS.has(field as string)) {
        const val = (value as string).trim();
        if (val.length > 120 || val.split(/\s+/).length > 16) continue;
      }
      const current = (vessel as unknown as Record<string, unknown>)[field as string];
      if (current === undefined || current === null || (typeof current === "string" && current.trim() === "")) {
        (vessel as unknown as Record<string, unknown>)[field as string] = (value as string).trim();
      }
    }
    vessel.aiExtracted = true;
  } catch {
    // Network error, timeout, parse failure — fail silently, L1+L2 stand
  }
}


/**
 * fetchPageText — fetch a listing URL and return its clean, visible text.
 *
 * Used to give aiExtractSpecs the FULL page content, not just whatever
 * prose the structured scraper happened to capture. Strips scripts,
 * styles, nav, header, and footer so the AI sees the listing body.
 * Fails silently (returns "") on any network/parse error.
 */
export async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerioLoad(html);
    // Drop everything that isn't listing content.
    $("script, style, noscript, nav, header, footer, svg, iframe, form").remove();
    const text = $("body").text();
    return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim().slice(0, 30000);
  } catch {
    return "";
  }
}
