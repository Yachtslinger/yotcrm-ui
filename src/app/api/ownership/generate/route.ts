import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function parseLoaFt(loa: string): number {
  if (!loa) return 100;
  const m = loa.match(/([\d.]+)\s*m/i);
  if (m) return parseFloat(m[1]) * 3.28084;
  const ft = loa.match(/([\d.]+)\s*(ft|')/i);
  if (ft) return parseFloat(ft[1]);
  const n = parseFloat(loa);
  return !isNaN(n) ? (n > 25 ? n : n * 3.28084) : 100;
}
function parseYear(yr: string | number): number {
  const y = parseInt(String(yr).split("/")[0].split("-")[0]);
  return y > 1960 && y < 2030 ? y : 2010;
}
function r5(n: number) { return Math.round(n / 5000) * 5000; }
function r1(n: number) { return Math.round(n / 1000) * 1000; }

/* ═══════════════════════════════════════════════════════════════════════════
   SIZE BRACKET  (Crewfinders 5-band system)
═══════════════════════════════════════════════════════════════════════════ */
type Band = "b70" | "b100" | "b130" | "b160" | "b190";
function band(lft: number): Band {
  if (lft < 100) return "b70";
  if (lft < 130) return "b100";
  if (lft < 160) return "b130";
  if (lft < 190) return "b160";
  return "b190";
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREW SALARY TABLE  — sourced from Crewfinders 2025 placement records
   Each tuple: [low, mid, high] annual USD
═══════════════════════════════════════════════════════════════════════════ */
const SAL: Record<string, Record<Band, [number, number, number]>> = {
  captain:          { b70:[84,102,120], b100:[120,138,156], b130:[156,174,192], b160:[192,210,228], b190:[228,260,295] },
  first_officer:    { b70:[54,60,66],   b100:[66,72,78],    b130:[78,84,90],    b160:[90,93,95],    b190:[102,115,130] },
  bosun:            { b70:[48,51,54],   b100:[54,57,60],    b130:[60,63,66],    b160:[66,69,72],    b190:[66,72,80]    },
  deckhand:         { b70:[42,45,48],   b100:[48,51,54],    b130:[54,57,60],    b160:[60,63,66],    b190:[60,66,72]    },
  chief_engineer:   { b70:[72,78,84],   b100:[84,90,96],    b130:[96,108,120],  b160:[120,132,144], b190:[144,162,180] },
  asst_engineer:    { b70:[48,54,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  chef_culinary:    { b70:[60,66,72],   b100:[72,78,84],    b130:[84,90,96],    b160:[96,102,108],  b190:[108,118,130] },
  chef_cook:        { b70:[54,57,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  chief_stew:       { b70:[54,57,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  stew_2nd:         { b70:[42,45,48],   b100:[48,51,54],    b130:[54,57,60],    b160:[60,63,66],    b190:[66,72,78]    },
  stew_3rd:         { b70:[40,43,46],   b100:[45,48,52],    b130:[50,53,57],    b160:[55,58,62],    b190:[60,65,72]    },
  eto_av:           { b70:[55,62,70],   b100:[65,73,82],    b130:[78,87,96],    b160:[90,100,112],  b190:[105,118,132] },
};

// Day-rate captain (owner-operated or seasonal hire), annual cost ≈ N days × rate/day
const DAY_RATE_CAP: Record<Band, [number, number, number]> = {
  b70:  [385,425,480],   // $/day
  b100: [435,475,540],
  b130: [485,530,600],
  b160: [560,625,710],
  b190: [660,750,850],
};

function salScenario(key: string, b: Band): { low: number; mid: number; high: number } {
  const t = SAL[key]?.[b] ?? SAL.deckhand[b];
  return { low: t[0] * 1000, mid: t[1] * 1000, high: t[2] * 1000 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FUEL  — HP-based formula from brake-specific fuel consumption data
   Source: marine diesel burns ≈0.4 lb/HP/hr; diesel = 7.2 lb/gal
   Load factor by hull type at cruise: displacement 38%, semi 60%, planing 78%
═══════════════════════════════════════════════════════════════════════════ */
function calcFuel(
  hpTotal: number, hullType: string, annualHrs: number
): { low: number; mid: number; high: number } {
  const loads: Record<string, [number, number, number]> = {
    displacement: [0.30, 0.38, 0.52],
    semi:         [0.48, 0.60, 0.76],
    planing:      [0.65, 0.78, 0.90],
  };
  const load = loads[hullType] ?? loads.semi;
  const prices = [4.60, 5.10, 5.70]; // $/gal low/mid/high (blended US + international)
  const hrs = [Math.round(annualHrs * 0.55), annualHrs, Math.round(annualHrs * 1.55)];
  const gph = (i: number) => (hpTotal * load[i] * 0.4) / 7.2;
  const factor = 1.15; // adds 15% for generator + tender fuel
  return {
    low:  r5(gph(0) * hrs[0] * prices[0] * factor),
    mid:  r5(gph(1) * hrs[1] * prices[1] * factor),
    high: r5(gph(2) * hrs[2] * prices[2] * factor),
  };
}

// LOA fallback (only used if engineHp not provided)
function fuelFallback(lft: number, hullType: string, annualHrs: number) {
  // Rough GPH by LOA for fallback only
  const gphMid = hullType === "planing"   ? lft * 0.50 :
                 hullType === "semi"       ? lft * 0.30 :
                                            lft * 0.15; // displacement
  const factor = 1.15;
  return {
    low:  r5(gphMid * 0.55 * annualHrs * 0.55 * 4.60 * factor),
    mid:  r5(gphMid * annualHrs * 5.10 * factor),
    high: r5(gphMid * 1.55 * annualHrs * 1.55 * 5.70 * factor),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   INSURANCE  — agreed hull value (user input) × rate
   Rates from marine underwriter ranges; adjusts for age
═══════════════════════════════════════════════════════════════════════════ */
function calcHullInsurance(
  agreedValue: number, age: number, isCharter: boolean
): { low: number; mid: number; high: number } {
  let baseRate = 0.0110; // standard private, professional crew
  if (age > 20)     baseRate += 0.0030;
  else if (age > 15) baseRate += 0.0020;
  else if (age > 10) baseRate += 0.0010;
  if (isCharter)    baseRate += 0.0025;
  return {
    low:  r5(agreedValue * (baseRate - 0.0035)),
    mid:  r5(agreedValue * baseRate),
    high: r5(agreedValue * (baseRate + 0.0055)),
  };
}

// Fallback agreed hull value when user hasn't entered one
function estimatedAgreedValue(lft: number): number {
  // Conservative market-based estimates for typical brokerage vessels
  if (lft < 60)  return 600_000;   if (lft < 70)  return 1_100_000;
  if (lft < 80)  return 2_000_000; if (lft < 90)  return 3_200_000;
  if (lft < 100) return 4_500_000; if (lft < 115) return 6_500_000;
  if (lft < 130) return 9_500_000; if (lft < 150) return 14_000_000;
  if (lft < 165) return 19_000_000;if (lft < 185) return 26_000_000;
  return 38_000_000;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCKAGE  — monthly rate per foot × 12 months × transient/port factor
   Sources: Fort Lauderdale $40-70/ft/mo; San Diego $20-40; Med $55-120+
═══════════════════════════════════════════════════════════════════════════ */
function dockageAnnual(lft: number, port: string) {
  const p = port.toLowerCase();
  let rates: [number, number, number];
  if (p.includes("mediterr") || p.includes(" med"))    rates = [55, 90, 165];
  else if (p.includes("florida") || p.includes("east")) rates = [35, 55, 92];
  else if (p.includes("gulf"))                          rates = [25, 42, 70];
  else if (p.includes("caribbean"))                     rates = [28, 46, 80];
  else if (p.includes("pacific") || p.includes("alaska"))rates = [22, 36, 62];
  else if (p.includes("worldwide") || p.includes("expedi"))rates = [40, 68, 125];
  else rates = [35, 55, 92]; // default Florida
  const transientFactor = 1.28; // home berth + transient stops + port dues
  return {
    low:  r5(lft * rates[0] * 12 * transientFactor),
    mid:  r5(lft * rates[1] * 12 * transientFactor),
    high: r5(lft * rates[2] * 12 * transientFactor),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAPITAL RESERVES  — four separate buckets
═══════════════════════════════════════════════════════════════════════════ */

// Bucket 1: Paint reserve (annualized)
// Sources: full fairing $450-550/ft job; standard GRP $200-280/ft; explorer roll+tip $80-120/ft
function paintReserve(lft: number, finish: string, hullMaterial: string): { low: number; mid: number; high: number } {
  const mat = (hullMaterial || "").toLowerCase();
  const isSteelAlu = mat.includes("steel") || mat.includes("alum");

  let jobCostPerFt: number, cycleYrs: number;
  if (finish === "explorer") {
    jobCostPerFt = 100; cycleYrs = 3;               // roll-and-tip commercial
  } else if (finish === "standard") {
    jobCostPerFt = isSteelAlu ? 280 : 230; cycleYrs = isSteelAlu ? 4 : 6;
  } else {
    // luxury full fairing
    jobCostPerFt = isSteelAlu ? 480 : 520; cycleYrs = isSteelAlu ? 5 : 7;
  }
  const jobM = lft * jobCostPerFt;
  return {
    low:  r5(jobM * 0.80 / cycleYrs),
    mid:  r5(jobM / cycleYrs),
    high: r5(jobM * 1.35 / cycleYrs),
  };
}

// Bucket 2: Annual haul-out + antifoul (separate from paint cycle)
// $15-20/ft haul fee + $110-140/ft antifoul in warm water
function haulAntifoul(lft: number, port: string): { low: number; mid: number; high: number } {
  const p = port.toLowerCase();
  const biennial = p.includes("alaska") || p.includes("pacific north"); // cold water → every 2yr
  const ratePerFt = biennial ? [40, 65, 90] : [100, 130, 165]; // $/ft/yr or /2yr
  return {
    low:  r5(lft * ratePerFt[0]),
    mid:  r5(lft * ratePerFt[1]),
    high: r5(lft * ratePerFt[2]),
  };
}

// Bucket 3: Engine overhaul reserve (HP-based, annualized from hours to overhaul)
// Overhaul cost per engine by HP; interval by engine tier
function engineOverhaulReserve(hpTotal: number, annualHrs: number): { low: number; mid: number; high: number } {
  // Cost per single engine overhaul, based on HP
  const hpPerEngine = hpTotal / 2;
  const ovCost = hpPerEngine < 300  ? 35_000 :
                 hpPerEngine < 600  ? 65_000 :
                 hpPerEngine < 1200 ? 120_000 :
                 hpPerEngine < 2000 ? 185_000 : 280_000;
  const intervalHrs = hpPerEngine >= 1200 ? 17_000 : 13_000; // MTU = longer interval
  const annualService = Math.round(hpPerEngine / 100) * 1_100 * 2; // both engines

  const reserve = (ovCost * 2) / intervalHrs * annualHrs;
  return {
    low:  r5(reserve * 0.65 + annualService * 0.80),
    mid:  r5(reserve + annualService),
    high: r5(reserve * 1.50 + annualService * 1.30),
  };
}

// Bucket 4: Systems reserve (electronics, generator, HVAC, watermaker, etc.)
function systemsReserve(lft: number, age: number): { low: number; mid: number; high: number } {
  // Electronics refresh every 8yr + generator + HVAC + watermaker annualized
  const ageAdj = age > 15 ? 1.4 : age > 8 ? 1.2 : 1.0;
  return {
    low:  r5(lft * 280 * ageAdj),
    mid:  r5(lft * 480 * ageAdj),
    high: r5(lft * 780 * ageAdj),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROUTINE ENGINEERING MAINTENANCE (separate from capital reserves above)
   Covers: routine service, filters, consumables, minor repairs, surveys
   Age-adjusted using a gentler multiplier (not the old aggressive 1.9x)
═══════════════════════════════════════════════════════════════════════════ */
function routineEngineering(lft: number, age: number, hpTotal: number): { low: number; mid: number; high: number } {
  // Base: $600-900/ft/yr for routine ops, HP adds engine service complexity
  const hpBonus = Math.round(hpTotal / 100) * 800;
  const ageFactor = age > 20 ? 1.45 : age > 15 ? 1.30 : age > 10 ? 1.18 : age > 5 ? 1.08 : 1.0;
  const base = lft * 700 * ageFactor + hpBonus;
  return {
    low:  r5(base * 0.70),
    mid:  r5(base),
    high: r5(base * 1.45),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREW BUILDER  — takes array of position keys, returns full salary model
═══════════════════════════════════════════════════════════════════════════ */
interface PositionResult {
  role: string; low: number; mid: number; high: number;
}

const POSITION_LABELS: Record<string, string> = {
  captain:        "Captain",
  first_officer:  "First Officer / Chief Officer",
  bosun:          "Bosun / 2nd Mate",
  deckhand:       "Deckhand",
  deckhand_2:     "2nd Deckhand",
  chief_engineer: "Chief Engineer",
  asst_engineer:  "Assistant Engineer / 2nd Engineer",
  chef_culinary:  "Chef (Culinary-Trained)",
  chef_cook:      "Chef / Cook",
  chief_stew:     "Chief Stewardess",
  stew_2nd:       "2nd Stewardess",
  stew_3rd:       "3rd Stewardess",
  eto_av:         "ETO / AV-IT Technician",
};

// Day-rate captain (owner-operated or seasonal) — annual cost at N days
function dayRateCaptainAnnual(lft: number): { low: number; mid: number; high: number } {
  const b = band(lft);
  const r = DAY_RATE_CAP[b];
  // Low = 60 days, Mid = 100 days, High = 160 days
  return { low: r5(r[0]*60), mid: r5(r[1]*100), high: r5(r[2]*160) };
}

function buildCrewFromPositions(
  positionKeys: string[],
  lft: number,
  isDayRateCaptain: boolean,
): {
  breakdown: PositionResult[];
  totals: { low: number; mid: number; high: number };
  count: number;
  fullTimeCount: number;
} {
  const b = band(lft);
  const breakdown: PositionResult[] = [];

  for (const key of positionKeys) {
    let sal: { low: number; mid: number; high: number };
    if (key === "captain" && isDayRateCaptain) {
      sal = dayRateCaptainAnnual(lft);
    } else {
      const rawKey = key === "deckhand_2" ? "deckhand" : key;
      sal = salScenario(rawKey, b);
    }
    breakdown.push({
      role: POSITION_LABELS[key] ?? key,
      ...sal,
    });
  }

  const totals = {
    low:  breakdown.reduce((s, p) => s + p.low,  0),
    mid:  breakdown.reduce((s, p) => s + p.mid,  0),
    high: breakdown.reduce((s, p) => s + p.high, 0),
  };

  // Full-time count for food/health: day-rate captain doesn't count full time
  const fullTimeCount = positionKeys.filter(k => !(k === "captain" && isDayRateCaptain)).length;

  return { breakdown, totals, count: positionKeys.length, fullTimeCount };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESET CREW PACKAGES  — returns position keys for each preset
═══════════════════════════════════════════════════════════════════════════ */
function crewPresetPositions(preset: string, lft: number): { keys: string[]; isDayRate: boolean } {
  if (preset === "owner")          return { keys: [], isDayRate: false };
  if (preset === "captain_day")    return { keys: ["captain"], isDayRate: true };
  if (preset === "captain_only")   return { keys: ["captain"], isDayRate: false };
  if (preset === "captain_mate")   return { keys: ["captain", "bosun"], isDayRate: false };
  if (preset === "cap_eng_stew")   return { keys: ["captain","chief_engineer","chief_stew"], isDayRate: false };
  if (preset === "full_private") {
    const base = ["captain","chief_engineer","chef_culinary","chief_stew","deckhand"];
    if (lft >= 130) base.push("stew_2nd"); // larger vessel adds 2nd stew
    return { keys: base, isDayRate: false };
  }
  if (preset === "charter") {
    const base = ["captain","chief_engineer","chef_culinary","chief_stew","stew_2nd","deckhand"];
    if (lft >= 130) { base.push("bosun"); base.push("stew_3rd"); }
    return { keys: base, isDayRate: false };
  }
  // custom — caller provides keys directly
  return { keys: [], isDayRate: false };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CREW SUPPORT COSTS  — per-person annual costs beyond base salary
═══════════════════════════════════════════════════════════════════════════ */
function crewSupportCosts(
  fullTimeCount: number,
  totalCount: number,
  isLuxury: boolean,
) {
  const r1l = (n: number) => Math.round(n / 1000) * 1000;
  const foodPerDay = isLuxury ? 48 : 38; // $ per crew per day (365 days)

  return {
    // Full-time only
    foodBeverage:    { low: r5(fullTimeCount*34*365),          mid: r5(fullTimeCount*foodPerDay*365), high: r5(fullTimeCount*65*365) },
    crewHealth:      { low: r5(fullTimeCount*4500),             mid: r5(fullTimeCount*6000),            high: r5(fullTimeCount*8500) },
    // All crew (including day-rate)
    recruitment:     { low: r1l(totalCount*2500),              mid: r1l(totalCount*4000),              high: r1l(totalCount*7500) },
    travel:          { low: r1l(fullTimeCount*3500),            mid: r1l(fullTimeCount*5200),           high: r1l(fullTimeCount*9000) },
    accommodation:   { low: r1l(fullTimeCount*900),             mid: r1l(fullTimeCount*1500),           high: r1l(fullTimeCount*2600) },
    uniforms:        { low: r1l(fullTimeCount*1000),            mid: r1l(fullTimeCount*1600),           high: r1l(fullTimeCount*2600) },
    training:        { low: r1l(fullTimeCount*1400),            mid: r1l(fullTimeCount*2200),           high: r1l(fullTimeCount*3800) },
    medical:         { low: r1l(fullTimeCount*800),             mid: r1l(fullTimeCount*1300),           high: r1l(fullTimeCount*2200) },
    dayWorkers:      { low: r1l(8_000),                        mid: r1l(fullTimeCount > 0 ? 14_000 : 4_000), high: r1l(28_000) },
    entertainment:   { low: r1l(fullTimeCount*450+1000),        mid: r1l(fullTimeCount*800+1500),       high: r1l(fullTimeCount*1500+3000) },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REMAINING OPERATIONAL COSTS  — LOA-scaled line items
═══════════════════════════════════════════════════════════════════════════ */
function operationsItems(lft: number, lm: number, isLux: boolean) {
  // Galley = owner/guest food, beverages, entertaining (NOT crew food)
  const galLow  = r5(Math.max(18_000, lm*680));
  const galMid  = r5(Math.max(28_000, lm*1_100));
  const galHigh = r5(Math.max(55_000, lm*1_900));
  return {
    agency:       { low: r1(lm*240),  mid: r1(lm*440),  high: r1(lm*800) },
    audioVisual:  { low: r1(lm*70),   mid: r1(lm*150),  high: r1(lm*280) },
    auto:         { low: r1(lm*80),   mid: r1(lm*150),  high: r1(lm*265) },
    bridge:       { low: r1(lm*90),   mid: r1(lm*165),  high: r1(lm*285) },
    computer:     { low: r1(lm*80),   mid: r1(lm*150),  high: r1(lm*260) },
    deck:         { low: r1(lm*300),  mid: r1(lm*520),  high: r1(lm*880) },
    dockExpress:  { low: r1(lm*55),   mid: r1(lm*105),  high: r1(lm*185) },
    galley:       { low: galLow,      mid: galMid,       high: galHigh },
    interior:     { low: r5(lm*(isLux?550:300)),  mid: r5(lm*(isLux?1000:520)),  high: r5(lm*(isLux?1600:820)) },
    launches:     { low: r1(lm*130),  mid: r1(lm*230),  high: r1(lm*420) },
    mailFreight:  { low: r1(lm*50),   mid: r1(lm*95),   high: r1(lm*170) },
    office:       { low: r1(lm*60),   mid: r1(lm*110),  high: r1(lm*190) },
    safetyMedical:{ low: r1(lm*105),  mid: r1(lm*190),  high: r1(lm*345) },
    security:     { low: r1(lm*60),   mid: r1(lm*120),  high: r1(lm*240) },
    survey:       { low: r1(lm*160),  mid: r1(lm*285),  high: r1(lm*500) },
    warehousing:  { low: r1(lm*75),   mid: r1(lm*145),  high: r1(lm*255) },
  };
}

function commsItems() {
  return {
    phone:  { low: 7_000,  mid: 10_000, high: 15_000 },
    satTV:  { low: 5_000,  mid: 7_000,  high: 11_000 },
    satcom: { low: 18_000, mid: 28_000, high: 46_000 }, // Starlink Maritime + backup
  };
}

function adminItems(lm: number) {
  return {
    professionalFees: { low: r1(lm*320), mid: r1(lm*580), high: r1(lm*1000) },
    bankCharges:      { low: 3_000,      mid: 4_500,       high: 7_500 },
    managementTravel: { low: r1(lm*80),  mid: r1(lm*155),  high: r1(lm*280) },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MANAGEMENT FEE  — optional, three tiers; default OFF
═══════════════════════════════════════════════════════════════════════════ */
function managementFee(tier: string, subTotal: { low: number; mid: number; high: number }) {
  if (tier === "admin") {
    // Flat light management: survey co-ordination, flag renewal, bookkeeping
    const lm_est = 30; // use a rough estimate
    void lm_est;
    return { low: 15_000, mid: 25_000, high: 40_000 };
  }
  if (tier === "full") {
    // 5-8% of operating budget (Ocean Independence / Burgess range)
    return {
      low:  r5(subTotal.low  * 0.045),
      mid:  r5(subTotal.mid  * 0.062),
      high: r5(subTotal.high * 0.085),
    };
  }
  return { low: 0, mid: 0, high: 0 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   P&I + CREW HEALTH  (insurance lines not in H&M)
═══════════════════════════════════════════════════════════════════════════ */
function piAndCrewHealth(hm: { low: number; mid: number; high: number }, fullTimeCount: number) {
  return {
    pi: { low: r5(hm.low*0.10), mid: r5(hm.mid*0.10), high: r5(hm.high*0.10) },
    crewHealth: { low: r5(fullTimeCount*4500), mid: r5(fullTimeCount*6000), high: r5(fullTimeCount*8500) },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADDITIONAL CAPITAL ITEMS (AV, interior refresh, tenders/toys)
═══════════════════════════════════════════════════════════════════════════ */
function additionalCapital(lm: number) {
  return {
    av:          { low: r1(lm*85),  mid: r1(lm*190), high: r1(lm*380) },
    interior:    { low: r1(lm*230), mid: r1(lm*470), high: r1(lm*860) },
    tendersToys: { low: r1(lm*170), mid: r1(lm*360), high: r1(lm*680) },
    other:       { low: r1(lm*180), mid: r1(lm*350), high: r1(lm*660) },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN ASSEMBLER
═══════════════════════════════════════════════════════════════════════════ */
function buildBudget(opts: {
  lft: number; lm: number; yr: number; age: number;
  hpTotal: number; hullType: string;
  agreedHullValue: number;
  annualHrs: number; port: string;
  finish: string; hullMaterial: string;
  positionKeys: string[]; isDayRateCaptain: boolean;
  managementTier: string;
}) {
  const { lft, lm, yr, age, hpTotal, hullType, agreedHullValue,
          annualHrs, port, finish, hullMaterial, positionKeys,
          isDayRateCaptain, managementTier } = opts;
  const isLux = finish === "luxury";

  // ── 1. Crew ─────────────────────────────────────────────────────────
  const crew = buildCrewFromPositions(positionKeys, lft, isDayRateCaptain);
  const support = crewSupportCosts(crew.fullTimeCount, crew.count, isLux);

  // ── 2. Fuel ─────────────────────────────────────────────────────────
  const fuel = hpTotal > 0
    ? calcFuel(hpTotal, hullType, annualHrs)
    : fuelFallback(lft, hullType, annualHrs);

  // ── 3. Insurance ────────────────────────────────────────────────────
  const hm = calcHullInsurance(agreedHullValue, age, false);
  const { pi, crewHealth } = piAndCrewHealth(hm, crew.fullTimeCount);

  // ── 4. Dockage ──────────────────────────────────────────────────────
  const dock = dockageAnnual(lft, port);

  // ── 5. Routine engineering (ops maintenance) ─────────────────────────
  const eng = routineEngineering(lft, age, hpTotal > 0 ? hpTotal : lft * 12);

  // ── 6. Ops, comms, admin ─────────────────────────────────────────────
  const ops   = operationsItems(lft, lm, isLux);
  const comms = commsItems();
  const admin = adminItems(lm);

  // ── 7. Annual haul-out + antifoul (genuinely annual — stays in running cost) ──
  const haul = haulAntifoul(lft, port);

  // ── 7b. Capital events — NOT in annual total, shown as footnotes ─────
  // Paint
  const hullMatL = hullMaterial.toLowerCase();
  const isMetal  = hullMatL.includes("steel") || hullMatL.includes("alum");
  const paintPfFt = finish === "explorer" ? "$80-120" :
                    isMetal ? (lft >= 130 ? "$1,200-2,000" : "$400-700") :
                    (lft >= 130 ? "$1,500-3,000" : "$500-900");
  const paintJob  = isMetal ? lft * (lft>=130?1600:550) : lft * (lft>=130?2200:700);
  const paintCycle = finish === "explorer" ? 3 : isMetal ? 4 : lft >= 130 ? 6 : 7;
  const paintEvent = {
    label:       "Full Paint Job",
    totalEst:    Math.round(paintJob / 50000) * 50000,
    perFt:       paintPfFt,
    periodYears: paintCycle,
    note:        `~${paintPfFt}/ft · typically every ${paintCycle} years · not included in annual figure above`,
  };
  // Engine overhaul
  const hpe = (hpTotal > 0 ? hpTotal : lft * 12) / 2;
  const ovCostPer = hpe < 300 ? 35_000 : hpe < 600 ? 65_000 : hpe < 1200 ? 120_000 : hpe < 2000 ? 185_000 : 280_000;
  const ovInterval = hpe >= 1200 ? 17_000 : 13_000;
  const ovYrs = annualHrs > 0 ? Math.round(ovInterval / annualHrs) : 15;
  const engineEvent = {
    label:         "Engine Overhaul (per engine)",
    costPerEngine: ovCostPer,
    numEngines:    2,
    intervalHours: ovInterval,
    yearsAtCurrentUse: ovYrs,
    note: `~$${(ovCostPer/1000).toFixed(0)}K per engine · at ${ovInterval.toLocaleString()}hr intervals · approx every ${ovYrs} yrs at ${annualHrs} hrs/yr`,
  };
  // Systems / electronics
  const sysEst = Math.round(lft * (lft >= 150 ? 1200 : lft >= 100 ? 800 : 500) / 10000) * 10000;
  const systemsEvent = {
    label:       "Electronics & Systems Refresh",
    totalEst:    sysEst,
    periodYears: 8,
    note:        `~$${(sysEst/1000).toFixed(0)}K · navigation, AV, satcom hardware · typically every 8 years`,
  };
  // Interior refit
  const intEst = Math.round(lft * (lft >= 150 ? 1800 : lft >= 100 ? 1200 : 700) / 10000) * 10000;
  const interiorEvent = {
    label:       "Interior Refit / Soft Goods",
    totalEst:    intEst,
    periodYears: 10,
    note:        `~$${(intEst/1000).toFixed(0)}K · upholstery, soft goods, galley — every 8-12 years depending on use`,
  };

  const capitalEvents = { paint: paintEvent, engines: engineEvent, systems: systemsEvent, interior: interiorEvent };

  // ── 8. Sub-total (pre-management) ──────────────────────────────────
  // NOTE: paintCap, engCap, sysCap, addCap are NOT in annual total —
  // they are capital events shown as footnotes only.
  const allItems = [
    crew.totals, support.foodBeverage, support.recruitment, support.travel,
    support.accommodation, support.uniforms, support.training, support.medical,
    support.dayWorkers, support.entertainment,
    comms.phone, comms.satTV, comms.satcom,
    eng, fuel, dock, haul, ops.galley, ops.interior, ops.agency, ops.audioVisual,
    ops.auto, ops.bridge, ops.computer, ops.deck, ops.dockExpress, ops.launches,
    ops.mailFreight, ops.office, ops.safetyMedical, ops.security, ops.survey, ops.warehousing,
    hm, pi, crewHealth,
    admin.professionalFees, admin.bankCharges, admin.managementTravel,
  ];
  type S3 = { low: number; mid: number; high: number };
  const subTotal: S3 = {
    low:  allItems.reduce((a, b) => a + (b as S3).low,  0),
    mid:  allItems.reduce((a, b) => a + (b as S3).mid,  0),
    high: allItems.reduce((a, b) => a + (b as S3).high, 0),
  };

  // ── 9. Management fee ────────────────────────────────────────────────
  const mgmtFee = managementFee(managementTier, subTotal);

  const grandTotal: S3 = {
    low:  subTotal.low  + mgmtFee.low,
    mid:  subTotal.mid  + mgmtFee.mid,
    high: subTotal.high + mgmtFee.high,
  };

  // ── 10. Assemble CostModel (same shape as before for page compatibility) ──
  const model = {
    crew: {
      salaries:      { ...crew.totals, breakdown: crew.breakdown },
      recruitment:    support.recruitment,
      travel:         support.travel,
      accommodation:  support.accommodation,
      uniforms:       support.uniforms,
      training:       support.training,
      foodBeverage:   support.foodBeverage,
      medical:        support.medical,
      dayWorkers:     support.dayWorkers,
      entertainment:  support.entertainment,
    },
    communications: { phone: comms.phone, satTV: comms.satTV, satcom: comms.satcom },
    operations: {
      agency: ops.agency, audioVisual: ops.audioVisual, auto: ops.auto,
      bridge: ops.bridge, computer: ops.computer, deck: ops.deck,
      dockExpress: ops.dockExpress, engineering: eng, fuels: fuel,
      galley: ops.galley, interior: ops.interior, launches: ops.launches,
      mailFreight: ops.mailFreight, office: ops.office, dockage: dock,
      safetyMedical: ops.safetyMedical, security: ops.security,
      survey: ops.survey, warehousing: ops.warehousing,
    },
    insurance: { hull: hm, pi, crewHealth },
    administrative: {
      professionalFees: admin.professionalFees,
      bankCharges:      admin.bankCharges,
      managementFee:    mgmtFee,
      managementTravel: admin.managementTravel,
    },
    capital: {
      // Only genuinely annual items here — paint/overhaul/systems are in capitalEvents footnotes
      haulAntifoul:    haul,
      // Legacy field aliases so existing table rows don't break
      av:              { low: 0, mid: 0, high: 0 },
      engineeringDeck: { low: 0, mid: 0, high: 0 },
      interior:        { low: 0, mid: 0, high: 0 },
      paint:           { low: 0, mid: 0, high: 0 },
      tendersToys:     { low: 0, mid: 0, high: 0 },
      other:           { low: 0, mid: 0, high: 0 },
    },
    capitalEvents,  // footnotes — NOT summed into annual total
  };

  // Per-crew rates for live slider on the page
  const perCrew = {
    salJr:         { low: 45_000, mid: 58_000, high: 75_000 },
    foodDaily:     { low: 34,     mid: isLux ? 48 : 38, high: 65 },
    health:        { low: 4_500,  mid: 6_000,  high: 8_500 },
    travel:        { low: 3_500,  mid: 5_200,  high: 9_000 },
    uniform:       { low: 1_000,  mid: 1_600,  high: 2_600 },
    training:      { low: 1_400,  mid: 2_200,  high: 3_800 },
    namedSalaries: crew.breakdown,
  };

  return { model, grandTotal, subTotal, crew, perCrew, agreedHullValue };
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST HANDLER
═══════════════════════════════════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vessel, url,
      agreedHullValue,          // user-entered agreed/insured hull value
      engineHpTotal,            // total combined HP
      hullType = "semi",        // 'displacement' | 'semi' | 'planing'
      annualHours = 800,
      homePort = "Florida / US East Coast",
      vesselFinish = "luxury",  // 'luxury' | 'standard' | 'explorer'
      managementTier = "none",  // 'none' | 'admin' | 'full'
      crewPreset = "full_private",
      customPositions,          // string[] of position keys when preset="custom"
    } = body;

    const v: Record<string,string> = vessel || {};

    // ── Parse vessel profile ──────────────────────────────────────────
    const lft   = parseLoaFt(v.loa || "100");
    const lm    = lft / 3.28084;
    const yr    = parseYear(v.year || "2010");
    const age   = 2026 - yr;
    const hullMat = (v.hullMaterial || v.hull || "").toLowerCase();
    const hpTotal = engineHpTotal || 0; // 0 = fallback to LOA-based

    // ── Determine agreed hull value ───────────────────────────────────
    const hullValue = agreedHullValue || estimatedAgreedValue(lft);

    // ── Determine crew positions ──────────────────────────────────────
    let positionKeys: string[];
    let isDayRateCaptain: boolean;

    if (crewPreset === "custom" && customPositions?.length) {
      positionKeys     = customPositions as string[];
      isDayRateCaptain = customPositions.includes("captain_day");
      // Normalise: if captain_day was passed, convert to captain for salary lookup
      positionKeys = positionKeys.map(k => k === "captain_day" ? "captain" : k);
    } else {
      const preset = crewPresetPositions(crewPreset, lft);
      positionKeys     = preset.keys;
      isDayRateCaptain = preset.isDayRate;
    }

    // ── Build budget ──────────────────────────────────────────────────
    const budget = buildBudget({
      lft, lm, yr, age,
      hpTotal,
      hullType,
      agreedHullValue: hullValue,
      annualHrs: annualHours,
      port: homePort,
      finish: vesselFinish,
      hullMaterial: hullMat,
      positionKeys,
      isDayRateCaptain,
      managementTier,
    });

    const gt    = budget.grandTotal;
    const crew  = budget.crew;

    // ── Claude: narrative text only ───────────────────────────────────
    const vesselLine = [
      v.name || "Vessel",
      v.builder ? `by ${v.builder}` : "",
      yr ? `(${yr})` : "",
      v.loa ? `· ${v.loa}` : `· ${lft.toFixed(0)}ft`,
      hpTotal ? `· ${hpTotal}HP ${hullType}` : "",
      hullMat ? `· ${hullMat} hull` : "",
    ].filter(Boolean).join(" ");

    const crewLine = crew.breakdown.length === 0
      ? "owner-operated, no paid crew"
      : crew.breakdown.map(p => `${p.role} ($${Math.round(p.mid/1000)}K)`).join(", ");

    const prompt = `You are a senior yacht management advisor. Write narrative for an annual ownership cost analysis.

VESSEL: ${vesselLine}
URL: ${url || ""}
OPERATING PROFILE: ${annualHours} hrs/yr · ${homePort} · ${vesselFinish} finish · ${hullType} hull
CREW: ${crewLine} | Total salaries mid: $${crew.totals.mid.toLocaleString()}
HULL INSURED AT: $${(hullValue/1_000_000).toFixed(1)}M
MANAGEMENT: ${managementTier === "none" ? "owner-managed, no management company" : managementTier}
GRAND TOTAL: LOW $${gt.low.toLocaleString()} | MID $${gt.mid.toLocaleString()} | HIGH $${gt.high.toLocaleString()}

Respond with ONLY this JSON object. No preamble, no markdown fences.

{
  "assumptions": "2-3 sentences: crew configuration, insured hull value used, why it was chosen, age of vessel and what that means for maintenance.",
  "rangeExplanation": "2-3 sentences: what specifically drives the low vs high gap — dockage tier, crew quality, capital reserve pace.",
  "categoryBreakdown": "3-4 sentences: name the 4 biggest cost categories by mid dollar amount and approximate % of total each represents.",
  "crewStructureNote": "2-3 sentences: describe the crew package, list positions and mid salaries, what the total crew cost is, what removing one person saves.",
  "keyDrivers": "4 bullets (one sentence each): the 4 biggest cost drivers for this specific vessel — be specific to the vessel's age, size, power, and region."
}`;

    let narrative = {
      assumptions: `${age}-year-old vessel insured at $${(hullValue/1_000_000).toFixed(1)}M agreed hull value. Crew: ${crewLine || "none"}. Model uses ${hullType} hull fuel formula at ${annualHours} hrs/yr from ${homePort}.`,
      rangeExplanation: `Low assumes lean operation, fewer transient port calls, and minimal capital spend. High reflects active use, premium dockage, and full capital reserve funding.`,
      categoryBreakdown: `Crew salaries ($${crew.totals.mid.toLocaleString()} mid) are the largest single category. H&M insurance on the $${(hullValue/1_000_000).toFixed(1)}M hull, engineering maintenance, and dockage follow. Capital reserves for paint, haul-out, and systems make up the remainder.`,
      crewStructureNote: crewLine === "owner-operated, no paid crew"
        ? "Vessel is owner-operated with no professional crew. All operational tasks are handled by the owner, significantly reducing annual cost vs. a crewed operation."
        : `Crew package: ${crewLine}. Total annual crew cost mid: $${crew.totals.mid.toLocaleString()}. Removing one junior crew member typically saves $85-110K/yr all-in including salary and support costs.`,
      keyDrivers: `• H&M insurance anchored to $${(hullValue/1_000_000).toFixed(1)}M agreed hull value — this is the primary fixed cost driver after crew. • ${hullType === "planing" ? "High-powered planing hull burns fuel at a rate 3-4x higher than a displacement vessel of equal length — fuel is a material variable cost." : hullType === "displacement" ? "Displacement hull is highly fuel-efficient — fuel cost is modest even at extended hours." : "Semi-displacement hull has moderate fuel consumption — hours on the water directly scales this line."} • ${age > 15 ? `At ${age} years old, maintenance and capital reserves are elevated — the vessel is beyond its first major service cycle.` : `At ${age} years, vessel is in its early service life — routine maintenance is predictable and capital reserves building toward first major cycle.`} • ${homePort.includes("Florida") || homePort.includes("east") ? "Fort Lauderdale/Florida dockage rates ($40-70/ft/month) are among the highest in US waters — home berth is a significant fixed annual cost." : homePort.includes("Med") ? "Mediterranean dockage is the most expensive globally — seasonal berth contracts can represent 10-15% of total annual budget." : "Regional dockage rates are moderate — there is flexibility to optimize slip costs through marina selection."}`
    };

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1800,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as { content?: { type: string; text?: string }[] };
        const raw = aiData.content?.find(b => b.type === "text")?.text || "";
        const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
        if (start !== -1 && end > start) {
          const parsed = JSON.parse(raw.slice(start, end + 1));
          if (parsed.assumptions)       narrative.assumptions       = parsed.assumptions;
          if (parsed.rangeExplanation)  narrative.rangeExplanation  = parsed.rangeExplanation;
          if (parsed.categoryBreakdown) narrative.categoryBreakdown = parsed.categoryBreakdown;
          if (parsed.crewStructureNote) narrative.crewStructureNote = parsed.crewStructureNote;
          if (parsed.keyDrivers)        narrative.keyDrivers        = parsed.keyDrivers;
        }
      }
    } catch { /* narrative failure is non-fatal; defaults used */ }

    // ── Assemble final response ───────────────────────────────────────
    const model = {
      vesselName:    v.name || "Vessel",
      vesselUrl:     url || "",
      _meta: {
        crewCount:      crew.count,
        fullTimeCount:  crew.fullTimeCount,
        loa_m:          lm,
        loa_ft:         lft,
        buildYear:      yr,
        age,
        hullType,
        hpTotal,
        agreedHullValue: hullValue,
        managementTier,
        crewPreset,
        perCrew:        budget.perCrew,
        positionKeys,
        isDayRateCaptain,
      },
      ...budget.model,
      ...narrative,
    };

    return NextResponse.json({ ok: true, model });
  } catch (err) {
    console.error("Ownership generate error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
