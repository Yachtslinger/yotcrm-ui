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
  { patterns: ["navigation class", "nav class", "navalclass"],          field: "navalClass" },
  { patterns: ["classification society", "class society"],              field: "classification" },
  { patterns: ["classification", "class ", "bureau veritas", "rina", "dnv", "lloyds"], field: "classification" },
  { patterns: ["gross ton", "gross tonnage", "gt ", "g.t.", "gross register", "grt"], field: "grossTonnage" },
  { patterns: ["location", "located"],                                  field: "location" },
  { patterns: ["refit year", "last refit"],                             field: "refitYear" },
  { patterns: ["refit detail", "refit description", "refit info"],      field: "refitDetails" },

  // ── Dimensions ────────────────────────────────────────────────────────────
  { patterns: ["loa", "length overall", "length (oa)", "hull length", "length over all", "length, m", "length (m)", "length m"], field: "loa" },
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
  { patterns: ["stabiliser make", "stabilizer make", "stabiliser brand"], field: "stabiliserMake" },
  { patterns: ["zero speed stabiliser", "zero speed stabilizer", "zero speed stab"], field: "zeroSpeedStabs" },
  { patterns: ["stabiliser", "stabilizer", "fin stabiliser"],          field: "stabilisers" },

  // ── Performance ───────────────────────────────────────────────────────────
  { patterns: ["max speed", "maximum speed", "top speed", "top speed, knots"], field: "maxSpeed" },
  { patterns: ["cruise speed", "cruising speed", "service speed", "cruising speed, knots"], field: "cruiseSpeed" },
  { patterns: ["economy speed", "economical speed", "economic speed"], field: "economySpeed" },
  { patterns: ["range (cruise)", "range cruise", "range at cruise", "range, nm", "range (nm)", "range nm", "^range$"], field: "range" },
  { patterns: ["range (economy)", "range economy", "range at economy"], field: "rangeEconomy" },

  // ── Electrical & Generators ───────────────────────────────────────────────
  { patterns: ["generator set", "genset", "generator brand", "^generator$"], field: "gensets" },
  { patterns: ["generator output", "generator kw", "generator power"],  field: "generatorKW" },
  { patterns: ["shore power"],                                          field: "shorepower" },
  { patterns: ["voltage system", "electrical system", "voltage"],      field: "voltageSystem" },
  { patterns: ["emergency generator", "emergency gen"],                field: "emergencyGen" },
  { patterns: ["air condition", "hvac", "a/c"],                       field: "airCon" },
  { patterns: ["a/c make", "air con make", "hvac make"],               field: "airConMake" },

  // ── Tanks ─────────────────────────────────────────────────────────────────
  { patterns: ["fuel capacity", "fuel tank", "fuel, l", "fuel (l)", "fuel l"],  field: "fuelTank" },
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
