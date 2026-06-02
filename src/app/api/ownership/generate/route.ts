import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function parseLoaMeters(loa: string): number {
  if (!loa) return 30;
  const m = loa.match(/([\d.]+)\s*m/i);
  if (m) return parseFloat(m[1]);
  const ft = loa.match(/([\d.]+)\s*(ft|')/i);
  if (ft) return parseFloat(ft[1]) / 3.28084;
  const n = parseFloat(loa);
  return !isNaN(n) ? (n > 25 ? n : n * 3.28084) : 30;
}
function parseYear(yr: string | number): number {
  const y = parseInt(String(yr).split("/")[0].split("-")[0]);
  return y > 1960 && y < 2030 ? y : 2010;
}
function parseCrewCount(c: string | number): number {
  const n = parseInt(String(c));
  return n > 0 && n < 40 ? n : 5;
}
function r5(n: number): number { return Math.round(n / 5000) * 5000; }
function r1(n: number): number { return Math.round(n / 1000) * 1000; }

/* ─── Lookup tables ────────────────────────────────────────────────────────── */
function insuredValue(m: number): number {
  if (m < 24) return 3_000_000;  if (m < 28) return 5_500_000;
  if (m < 32) return 9_000_000;  if (m < 36) return 14_000_000;
  if (m < 40) return 19_000_000; if (m < 45) return 25_000_000;
  if (m < 50) return 32_000_000; if (m < 55) return 42_000_000;
  if (m < 62) return 56_000_000; return 75_000_000;
}
function engBaseVal(m: number): number {
  if (m < 24) return 32_000;  if (m < 28) return 48_000;
  if (m < 32) return 65_000;  if (m < 36) return 85_000;
  if (m < 40) return 108_000; if (m < 45) return 135_000;
  if (m < 50) return 168_000; if (m < 55) return 210_000;
  if (m < 62) return 265_000; return 340_000;
}
function captainMid(m: number): number {
  if (m < 24) return 110_000; if (m < 28) return 130_000;
  if (m < 32) return 148_000; if (m < 36) return 162_000;
  if (m < 40) return 172_000; if (m < 45) return 182_000;
  if (m < 50) return 192_000; if (m < 55) return 210_000;
  if (m < 62) return 232_000; return 260_000;
}
function ageMult(yr: number): number {
  const age = 2026 - yr;
  if (age >= 20) return 1.90; if (age >= 15) return 1.60;
  if (age >= 12) return 1.32; if (age >= 8)  return 1.14;
  return 1.0;
}
function fuelBurnLph(m: number): number {
  if (m < 28) return 55;  if (m < 32) return 75;  if (m < 36) return 95;
  if (m < 40) return 115; if (m < 45) return 135; if (m < 50) return 155;
  if (m < 55) return 195; return 245;
}
function dockMonthlyPerFt(port: string): { l: number; m: number; h: number } {
  const p = port.toLowerCase();
  if (p.includes("mediterr") || p.includes(" med")) return { l:55, m:90,  h:165 };
  if (p.includes("florida")  || p.includes("east")) return { l:30, m:52,  h:88  };
  if (p.includes("gulf"))                            return { l:24, m:40,  h:68  };
  if (p.includes("caribbean"))                       return { l:25, m:43,  h:75  };
  if (p.includes("pacific")  || p.includes("alaska"))return { l:20, m:33,  h:56  };
  if (p.includes("worldwide")|| p.includes("expedi"))return { l:38, m:66,  h:122 };
  return { l:30, m:52, h:88 };
}

/* ─── Full deterministic budget builder ────────────────────────────────────── */
// Minimum realistic crew — only enforced for true superyachts (35m+). Smaller vessels can be owner-operated.
function minCrewForSize(m: number): number {
  if (m >= 60) return 10; if (m >= 55) return 8;
  if (m >= 50) return 7;  if (m >= 43) return 6;
  if (m >= 38) return 5;  if (m >= 35) return 4;
  return 0; // < 35m (115ft): no minimum — owner can run it themselves
}

function buildBudget(v: Record<string,string>, port: string, style: string, hrs: number) {
  const lm   = parseLoaMeters(v.loa || "");
  const lft  = lm * 3.28084;
  const yr   = parseYear(v.year || "");
  const am   = ageMult(yr);
  // Use the larger of parsed crew count or size-based minimum (scraper often misses captain's cabin)
  const cc   = Math.max(parseCrewCount(v.crew || ""), minCrewForSize(lm));
  const isLux = !style.toLowerCase().includes("explorer") && !style.toLowerCase().includes("commercial");
  const isExp = !isLux;

  const hrsL = Math.round(hrs * 0.55);
  const hrsH = Math.round(hrs * 1.55);

  // ── Salaries ────────────────────────────────────────────────────────
  // Named positions in priority order — only include up to cc positions
  const capM = captainMid(lm);
  const S = {
    cap:  { l: r5(capM*0.82), m: capM,            h: r5(capM*1.20) },
    eng:  { l: r5(capM*0.74*0.82), m: r5(capM*0.74), h: r5(capM*0.74*1.18) },
    chef: { l: r5(capM*0.62*0.82), m: r5(capM*0.62), h: r5(capM*0.62*1.18) },
    stew: { l: r5(capM*0.55*0.82), m: r5(capM*0.55), h: r5(capM*0.55*1.18) },
    jr:   { l: 58_000,             m: 70_000,         h: 85_000 },
  };
  const jrCt = Math.max(0, cc - 4);
  // Only sum salaries for positions actually included (cc may be < 4)
  const salL = (cc>=1?S.cap.l:0)+(cc>=2?S.eng.l:0)+(cc>=3?S.chef.l:0)+(cc>=4?S.stew.l:0)+jrCt*S.jr.l;
  const salM = (cc>=1?S.cap.m:0)+(cc>=2?S.eng.m:0)+(cc>=3?S.chef.m:0)+(cc>=4?S.stew.m:0)+jrCt*S.jr.m;
  const salH = (cc>=1?S.cap.h:0)+(cc>=2?S.eng.h:0)+(cc>=3?S.chef.h:0)+(cc>=4?S.stew.h:0)+jrCt*S.jr.h;

  // ── Other crew ──────────────────────────────────────────────────────
  const foodDailyMid = isLux ? 48 : 36;
  const crewFood = { l: r5(cc*34*365), m: r5(cc*foodDailyMid*365), h: r5(cc*65*365) };
  const recruit  = { l: r1(cc*2800),  m: r1(cc*4200),  h: r1(cc*7500) };
  const travel   = { l: r1(cc*3500),  m: r1(cc*5500),  h: r1(cc*9500) };
  const accom    = { l: r1(cc*1000),  m: r1(cc*1600),  h: r1(cc*2800) };
  const uniform  = { l: r1(cc*1100),  m: r1(cc*1700),  h: r1(cc*2800) };
  const training = { l: r1(cc*1600),  m: r1(cc*2500),  h: r1(cc*4200) };
  const medical  = { l: r1(cc*900),   m: r1(cc*1500),  h: r1(cc*2500) };
  const dayWork  = { l: r1(lm*400),   m: r1(lm*700),   h: r1(lm*1300) };
  const entmt    = { l: r1(cc*500),   m: r1(cc*900),   h: r1(cc*1600) };

  // ── Comms ───────────────────────────────────────────────────────────
  const phone  = { l: 7_000,  m: 10_000, h: 15_000 };
  const satTv  = { l: 5_000,  m: 7_000,  h: 11_000 };
  const satcom = { l: 20_000, m: 30_000, h: 48_000 };

  // ── Operations ──────────────────────────────────────────────────────
  const eBase = engBaseVal(lm);
  // HIGH engineering = 1.28x mid (elevated use year, not a refit year)
  const eng  = { l: r5(eBase*am*0.70), m: r5(eBase*am), h: r5(eBase*am*1.28) };
  const fuelGph = fuelBurnLph(lm) * 0.264172;
  // HIGH fuel = more hours + slightly higher fuel price, capped at 1.35x mid
  const fuel = { l: r5(hrsL*fuelGph*4.6), m: r5(hrs*fuelGph*5.0), h: r5(hrsH*fuelGph*5.3) };
  const dr   = dockMonthlyPerFt(port);
  const dock = { l: r5(lft*dr.l*12*1.28), m: r5(lft*dr.m*12*1.28), h: r5(lft*dr.h*12*1.28) };
  const galley   = {
    // Floor scales with vessel size: 92ft private yacht ≠ 150ft charter yacht
    l: r5(Math.max(18_000, lm * 680)),
    m: r5(Math.max(28_000, lm * 1_050)),
    h: r5(Math.max(50_000, lm * 1_800)),
  };
  const interior = { l: r5(lm*(isLux?600:350)),  m: r5(lm*(isLux?1050:550)),  h: r5(lm*(isLux?1650:850)) };
  const agency   = { l: r1(lm*280),   m: r1(lm*480),   h: r1(lm*850) };
  const av       = { l: r1(lm*80),    m: r1(lm*160),   h: r1(lm*290) };
  const auto_v   = { l: r1(lm*90),    m: r1(lm*160),   h: r1(lm*280) };
  const bridge   = { l: r1(lm*100),   m: r1(lm*180),   h: r1(lm*290) };
  const computer = { l: r1(lm*90),    m: r1(lm*160),   h: r1(lm*260) };
  const deck     = { l: r1(lm*320),   m: r1(lm*550),   h: r1(lm*920) };
  const dockExp  = { l: r1(lm*60),    m: r1(lm*110),   h: r1(lm*190) };
  const launches = { l: r1(lm*140),   m: r1(lm*240),   h: r1(lm*420) };
  const mail     = { l: r1(lm*55),    m: r1(lm*100),   h: r1(lm*175) };
  const office   = { l: r1(lm*65),    m: r1(lm*115),   h: r1(lm*195) };
  const safety   = { l: r1(lm*110),   m: r1(lm*200),   h: r1(lm*360) };
  const security = { l: r1(lm*70),    m: r1(lm*135),   h: r1(lm*260) };
  const survey   = { l: r1(lm*170),   m: r1(lm*300),   h: r1(lm*520) };
  const ware     = { l: r1(lm*80),    m: r1(lm*150),   h: r1(lm*260) };

  // ── Insurance ───────────────────────────────────────────────────────
  const hv  = insuredValue(lm);
  const hm  = { l: r5(hv*0.0082), m: r5(hv*0.0118), h: r5(hv*0.0168) };
  const pi  = { l: r5(hm.l*0.10), m: r5(hm.m*0.10), h: r5(hm.h*0.10) };
  const crewH = { l: r5(cc*4800), m: r5(cc*6200),   h: r5(cc*8500) };

  // ── Administrative ──────────────────────────────────────────────────
  const profFees = { l: r1(lm*350), m: r1(lm*600),  h: r1(lm*1050) };
  const bankCh   = { l: 3_000,      m: 4_500,        h: 7_000 };
  const mgmtTrav = { l: r1(lm*90),  m: r1(lm*170),  h: r1(lm*300) };

  // ── Capital ─────────────────────────────────────────────────────────
  const paintCycle = isExp ? 3 : 5;
  const paintJob   = isExp ? lft*380 : lft*2100;
  const paint      = { l: r5(paintJob*0.80/paintCycle), m: r5(paintJob/paintCycle), h: r5(paintJob*1.35/paintCycle) };
  // Capital: HIGH = 1.25x mid (aggressive maintenance year, NOT a refit/paint year — that would be exceptional)
  const capEng     = { l: r5(eBase*0.90*am*0.62), m: r5(eBase*0.90*am), h: r5(eBase*0.90*am*1.25) };
  const capAv      = { l: r1(lm*90),  m: r1(lm*200),  h: r1(lm*400) };
  const capInt     = { l: r1(lm*280), m: r1(lm*560),  h: r1(lm*1000) };
  const capTend    = { l: r1(lm*200), m: r1(lm*400),  h: r1(lm*750) };
  const capOther   = { l: r1(lm*200), m: r1(lm*380),  h: r1(lm*700) };

  // ── Management fee (computed after sub-total) ────────────────────────
  const preMgmt = {
    l: salL+crewFood.l+recruit.l+travel.l+accom.l+uniform.l+training.l+medical.l+dayWork.l+entmt.l
      +phone.l+satTv.l+satcom.l
      +eng.l+fuel.l+dock.l+galley.l+interior.l+agency.l+av.l+auto_v.l+bridge.l+computer.l
      +deck.l+dockExp.l+launches.l+mail.l+office.l+safety.l+security.l+survey.l+ware.l
      +hm.l+pi.l+crewH.l
      +profFees.l+bankCh.l+mgmtTrav.l
      +paint.l+capEng.l+capAv.l+capInt.l+capTend.l+capOther.l,
    m: salM+crewFood.m+recruit.m+travel.m+accom.m+uniform.m+training.m+medical.m+dayWork.m+entmt.m
      +phone.m+satTv.m+satcom.m
      +eng.m+fuel.m+dock.m+galley.m+interior.m+agency.m+av.m+auto_v.m+bridge.m+computer.m
      +deck.m+dockExp.m+launches.m+mail.m+office.m+safety.m+security.m+survey.m+ware.m
      +hm.m+pi.m+crewH.m
      +profFees.m+bankCh.m+mgmtTrav.m
      +paint.m+capEng.m+capAv.m+capInt.m+capTend.m+capOther.m,
    h: salH+crewFood.h+recruit.h+travel.h+accom.h+uniform.h+training.h+medical.h+dayWork.h+entmt.h
      +phone.h+satTv.h+satcom.h
      +eng.h+fuel.h+dock.h+galley.h+interior.h+agency.h+av.h+auto_v.h+bridge.h+computer.h
      +deck.h+dockExp.h+launches.h+mail.h+office.h+safety.h+security.h+survey.h+ware.h
      +hm.h+pi.h+crewH.h
      +profFees.h+bankCh.h+mgmtTrav.h
      +paint.h+capEng.h+capAv.h+capInt.h+capTend.h+capOther.h,
  };
  const mgmt = { l: r5(preMgmt.l*0.040), m: r5(preMgmt.m*0.062), h: r5(preMgmt.h*0.085) };

  // ── Salary breakdown array — only named positions actually filled ────
  const allNamedPositions = [
    { role:"Captain",                     low:S.cap.l,  mid:S.cap.m,  high:S.cap.h  },
    { role:"Chief Engineer / First Mate", low:S.eng.l,  mid:S.eng.m,  high:S.eng.h  },
    { role:"Chef",                        low:S.chef.l, mid:S.chef.m, high:S.chef.h },
    { role:"Chief Stewardess",            low:S.stew.l, mid:S.stew.m, high:S.stew.h },
  ];
  const jrNames = ["2nd Stewardess","Deckhand","2nd Deckhand","3rd Stewardess","Bosun","Additional Crew"];
  const breakdown = allNamedPositions.slice(0, Math.min(cc, 4));
  for (let i = 0; i < jrCt; i++) {
    breakdown.push({ role: jrNames[i] || `Crew ${5+i}`, low:S.jr.l, mid:S.jr.m, high:S.jr.h });
  }

  return {
    lm, lft, yr, am, cc, hv, salL, salM, salH, breakdown,
    // Per-crew cost rates for real-time crew adjustment in UI
    perCrew: {
      salJr:          { low: S.jr.l,  mid: S.jr.m,  high: S.jr.h  },
      foodDaily:      { low: 34,      mid: isLux ? 48 : 36, high: 65 },
      health:         { low: 4_800,   mid: 6_200,   high: 8_500 },
      travel:         { low: 3_500,   mid: 5_500,   high: 9_500 },
      uniform:        { low: 1_100,   mid: 1_700,   high: 2_800 },
      training:       { low: 1_600,   mid: 2_500,   high: 4_200 },
      // Named positions in removal order (for slider going below base count)
      namedSalaries:  allNamedPositions,
    },
    model: {
      crew: {
        salaries:    { low:salL, mid:salM, high:salH, breakdown },
        recruitment: recruit,  travel,        accommodation: accom,
        uniforms:    uniform,  training,      foodBeverage:  crewFood,
        medical,               dayWorkers:    dayWork,       entertainment: entmt,
      },
      communications: { phone, satTV: satTv, satcom },
      operations: {
        agency, audioVisual: av, auto: auto_v, bridge, computer, deck,
        dockExpress: dockExp, engineering: eng, fuels: fuel, galley,
        interior, launches,  mailFreight: mail, office, dockage: dock,
        safetyMedical: safety, security, survey, warehousing: ware,
      },
      insurance: { hull: hm, pi, crewHealth: crewH },
      administrative: { professionalFees: profFees, bankCharges: bankCh, managementFee: mgmt, managementTravel: mgmtTrav },
      capital: { av: capAv, engineeringDeck: capEng, interior: capInt, paint, tendersToys: capTend, other: capOther },
    },
    grandTotal: { l: preMgmt.l + mgmt.l, m: preMgmt.m + mgmt.m, h: preMgmt.h + mgmt.h },
  };
}

/* ═══ 40–80 ft SEGMENT ══════════════════════════════════════════════════════
   A separate cost engine for sub-80ft vessels. These boats run a different
   ownership regime: owner-operated or single-captain crew, agreed-value hull
   insurance, dry-stack / per-foot wet slips, and no management-company or
   flag-state overhead. Output uses the SAME CostModel shape as buildBudget so
   the table / analysis / PDF UI is reused unchanged — categories that do not
   apply to this segment are returned as zero. crewMode is user-selected:
   "owner" (no paid crew), "captain" (one captain, day-rate), "captain_mate"
   (full-time captain + mate).
*/

// Dry-stack / wet-slip monthly rate per foot by region (small-craft market).
function smallDockPerFt(port: string): { l: number; m: number; h: number } {
  const p = port.toLowerCase();
  if (p.includes("mediterr") || p.includes(" med")) return { l: 32, m: 52, h: 95 };
  if (p.includes("florida")  || p.includes("east")) return { l: 18, m: 30, h: 52 };
  if (p.includes("gulf"))                            return { l: 14, m: 24, h: 40 };
  if (p.includes("caribbean"))                       return { l: 16, m: 27, h: 46 };
  if (p.includes("pacific")  || p.includes("alaska"))return { l: 13, m: 21, h: 36 };
  if (p.includes("worldwide")|| p.includes("expedi"))return { l: 20, m: 34, h: 60 };
  return { l: 18, m: 30, h: 52 };
}

// Agreed hull value for sub-80ft craft (what these actually sell for), by metres.
function smallAgreedValue(m: number): number {
  const ft = m * 3.28084;
  if (ft < 45) return 450_000;   if (ft < 50) return 750_000;
  if (ft < 55) return 1_100_000; if (ft < 60) return 1_600_000;
  if (ft < 65) return 2_300_000; if (ft < 70) return 3_200_000;
  if (ft < 75) return 4_400_000; return 6_000_000;
}

// Day-rate captain: annual cost assuming part-time engagement (~120 days/yr mid).
function smallCaptainAnnual(m: number): { l: number; m: number; h: number } {
  const ft = m * 3.28084;
  const rate = ft < 50 ? 480 : ft < 60 ? 560 : ft < 70 ? 650 : 760; // $/day mid
  return { l: r5(rate * 75 * 0.9), m: r5(rate * 120), h: r5(rate * 180 * 1.1) };
}

type SmallOpts = { crewMode: "owner" | "captain" | "captain_mate" };

function buildSmallBudget(
  v: Record<string,string>, port: string, style: string, hrs: number, opts: SmallOpts
) {
  const lm   = parseLoaMeters(v.loa || "");
  const lft  = lm * 3.28084;
  const yr   = parseYear(v.year || "");
  const am   = ageMult(yr);
  const isLux = !style.toLowerCase().includes("explorer") && !style.toLowerCase().includes("commercial");
  const Z = { low: 0, mid: 0, high: 0 };

  const hrsL = Math.round(hrs * 0.55);
  const hrsH = Math.round(hrs * 1.55);

  // ── Crew (depends on user-selected crewMode) ────────────────────────
  const capAnnual = smallCaptainAnnual(lm);
  let salL = 0, salM = 0, salH = 0;
  const breakdown: { role: string; low: number; mid: number; high: number }[] = [];
  if (opts.crewMode === "captain" || opts.crewMode === "captain_mate") {
    breakdown.push({ role: "Captain (day-rate)", low: capAnnual.l, mid: capAnnual.m, high: capAnnual.h });
    salL += capAnnual.l; salM += capAnnual.m; salH += capAnnual.h;
  }
  if (opts.crewMode === "captain_mate") {
    const mate = { l: r5(capAnnual.l * 0.62), m: r5(capAnnual.m * 0.62), h: r5(capAnnual.h * 0.62) };
    breakdown.push({ role: "Mate / Deckhand", low: mate.l, mid: mate.m, high: mate.h });
    salL += mate.l; salM += mate.m; salH += mate.h;
  }
  const cc = breakdown.length;
  const sal = { low: salL, mid: salM, high: salH };

  // Crew support costs — scaled to paid headcount; zero when owner-operated.
  const crewFood = cc ? { low: r1(cc*22*120), mid: r1(cc*30*120), high: r1(cc*42*120) } : Z;
  const uniform  = cc ? { low: r1(cc*400),    mid: r1(cc*650),    high: r1(cc*1000) }   : Z;
  const training = cc ? { low: r1(cc*600),    mid: r1(cc*1000),   high: r1(cc*1700) }   : Z;
  const crewH    = opts.crewMode === "captain_mate"
    ? { low: r5(cc*4200), mid: r5(cc*5400), high: r5(cc*7200) } : Z; // only full-time crew

  // ── Operations ──────────────────────────────────────────────────────
  const eBase = engBaseVal(lm) * 0.55; // small-craft engineering runs lighter
  const eng  = { low: r5(eBase*am*0.70), mid: r5(eBase*am), high: r5(eBase*am*1.55) };
  const fuelGph = Math.max(8, fuelBurnLph(lm) * 0.45) * 0.264172;
  const fuel = { low: r5(hrsL*fuelGph*4.8), mid: r5(hrs*fuelGph*5.1), high: r5(hrsH*fuelGph*5.6) };
  const dr   = smallDockPerFt(port);
  const dock = { low: r5(lft*dr.l*12), mid: r5(lft*dr.m*12), high: r5(lft*dr.h*12) };
  // Haul-out, bottom paint, winterizing — folded into warehousing line.
  const haulStore = { low: r5(lft*55 + 1500), mid: r5(lft*95 + 2600), high: r5(lft*160 + 4200) };
  const deck     = { low: r1(lm*120), mid: r1(lm*210), high: r1(lm*360) };
  const galley   = { low: r5(Math.max(6_000, lm*260)), mid: r5(Math.max(11_000, lm*460)), high: r5(Math.max(18_000, lm*760)) };
  const interior = { low: r1(lm*(isLux?120:70)), mid: r1(lm*(isLux?220:130)), high: r1(lm*(isLux?360:210)) };
  const safety   = { low: r1(lm*45), mid: r1(lm*85), high: r1(lm*150) };
  const survey   = { low: r1(lm*55), mid: r1(lm*100), high: r1(lm*175) };
  const bridge   = { low: r1(lm*40), mid: r1(lm*75), high: r1(lm*130) };
  const launches = { low: r1(lm*55), mid: r1(lm*100), high: r1(lm*180) };

  // ── Insurance — agreed value, not GT replacement ────────────────────
  const hv  = smallAgreedValue(lm);
  const hm  = { low: r5(hv*0.0125), mid: r5(hv*0.0165), high: r5(hv*0.0225) };
  const pi  = { low: r5(hm.low*0.12), mid: r5(hm.mid*0.12), high: r5(hm.high*0.12) };

  // ── Capital ─────────────────────────────────────────────────────────
  const paintCycle = isLux ? 7 : 9;
  const paintJob   = lft * (isLux ? 850 : 420);
  const paint    = { low: r5(paintJob*0.80/paintCycle), mid: r5(paintJob/paintCycle), high: r5(paintJob*1.35/paintCycle) };
  const capEng   = { low: r5(eBase*0.85*am*0.62), mid: r5(eBase*0.85*am), high: r5(eBase*0.85*am*1.6) };
  const capTend  = { low: r1(lm*80), mid: r1(lm*160), high: r1(lm*300) };
  const capOther = { low: r1(lm*90), mid: r1(lm*180), high: r1(lm*340) };

  // ── Communications — modest for this segment ────────────────────────
  const phone  = { low: 1_200, mid: 2_000, high: 3_200 };
  const satcom = { low: 1_500, mid: 3_000, high: 6_000 }; // Starlink Maritime tier

  const model = {
    crew: {
      salaries: { ...sal, breakdown },
      recruitment: Z, travel: Z, accommodation: Z,
      uniforms: uniform, training, foodBeverage: crewFood,
      medical: Z, dayWorkers: Z, entertainment: Z,
    },
    communications: { phone, satTV: Z, satcom },
    operations: {
      agency: Z, audioVisual: Z, auto: Z, bridge, computer: Z, deck,
      dockExpress: Z, engineering: eng, fuels: fuel, galley, interior,
      launches, mailFreight: Z, office: Z, dockage: dock,
      safetyMedical: safety, security: Z, survey, warehousing: haulStore,
    },
    insurance: { hull: hm, pi, crewHealth: crewH },
    administrative: { professionalFees: Z, bankCharges: Z, managementFee: Z, managementTravel: Z },
    capital: { av: Z, engineeringDeck: capEng, interior: Z, paint, tendersToys: capTend, other: capOther },
  };

  // Grand total = sum of every mid/low/high across the model.
  const all: Scenario[] = [
    model.crew.salaries, model.crew.uniforms, model.crew.training, model.crew.foodBeverage,
    model.communications.phone, model.communications.satcom,
    model.operations.bridge, model.operations.deck, model.operations.engineering,
    model.operations.fuels, model.operations.galley, model.operations.interior,
    model.operations.launches, model.operations.dockage, model.operations.safetyMedical,
    model.operations.survey, model.operations.warehousing,
    model.insurance.hull, model.insurance.pi, model.insurance.crewHealth,
    model.capital.engineeringDeck, model.capital.paint, model.capital.tendersToys, model.capital.other,
  ];
  const grandTotal = {
    l: all.reduce((a, b) => a + b.low, 0),
    m: all.reduce((a, b) => a + b.mid, 0),
    h: all.reduce((a, b) => a + b.high, 0),
  };

  return { lm, lft, yr, am, cc, hv, salL, salM, salH, breakdown, model, grandTotal };
}

type Scenario = { low: number; mid: number; high: number };

/* Normalize any cost object to {low,mid,high}. buildBudget emits {l,m,h};
   buildSmallBudget emits {low,mid,high}. The frontend CostModel expects
   {low,mid,high} everywhere, so we convert the whole model tree here. */
function toScenario(o: unknown): unknown {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    const r = o as Record<string, unknown>;
    if ("l" in r && "m" in r && "h" in r && typeof r.l === "number") {
      return { low: r.l as number, mid: r.m as number, high: r.h as number };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(r)) out[k] = toScenario(r[k]);
    return out;
  }
  if (Array.isArray(o)) return o.map(toScenario);
  return o;
}

/* ─── Route handler ─────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const { vessel, url, annualHours, charterWeeks, homePort, vesselStyle, segment, crewMode } = await req.json();
    if (!vessel && !url) return NextResponse.json({ ok: false, error: "vessel data required" }, { status: 400 });

    const v     = vessel || {} as Record<string,string>;
    const hrs   = annualHours  || 800;
    const port  = homePort     || "Florida / US East Coast";
    const style = vesselStyle  || "Luxury / Full Fairing & Paint";
    const charter = charterWeeks || 0;
    const seg   = segment === "small" ? "small" : "super";
    const cMode: SmallOpts["crewMode"] =
      crewMode === "owner" || crewMode === "captain_mate" ? crewMode : "captain";

    // ── Step 1: compute every number in TypeScript ────────────────────────
    const budget = seg === "small"
      ? buildSmallBudget(v, port, style, hrs, { crewMode: cMode })
      : buildBudget(v, port, style, hrs);
    const gt = budget.grandTotal;
    // Normalize cost tree to {low,mid,high} for the frontend + prompt below.
    const nModel = toScenario(budget.model) as {
      insurance: { hull: Scenario };
      operations: { engineering: Scenario; dockage: Scenario; fuels: Scenario };
      crew: { salaries: { breakdown: { role: string; mid: number }[] } };
    };

    // ── Step 2: ask Claude only for the 5 narrative text fields ──────────
    const vesselDesc = [
      `${v.name || "Unknown"} — ${v.builder || ""} ${v.year || ""}, ${v.loa || ""}, ${v.crew || budget.cc} crew`,
      `Engines: ${v.engines || "Unknown"}  Hull: ${v.hullMaterial || "Unknown"}`,
      `${(v.description || "").slice(0, 350)}`,
    ].join("\n");

    const narrativePrompt = `You are a senior yacht management advisor writing the narrative section of an annual ownership cost analysis.

VESSEL: ${vesselDesc}
URL: ${url || ""}
OPERATING PROFILE: ${hrs} hrs/yr | ${port} | ${style}${charter > 0 ? ` | ${charter} charter weeks` : ""}
SEGMENT: ${seg === "small"
  ? `40–80 ft class — ${cMode === "owner" ? "owner-operated, no paid crew" : cMode === "captain_mate" ? "full-time captain and mate" : "single day-rate captain"}. This is a privately run vessel: no yacht-management company, no flag-state/ISM overhead, agreed-value hull insurance, dry-stack or per-foot wet-slip dockage. Write in terms an owner-operator understands; do not reference professional crew structures that do not apply.`
  : `Superyacht class — professionally crewed and managed.`}

COMPUTED BUDGET SUMMARY (do not invent different numbers — refer to these in your narrative):
• Crew salaries (${budget.cc} crew): $${budget.salM.toLocaleString()} mid
• H&M Insurance (${(budget.hv/1_000_000).toFixed(1)}M insured value): $${nModel.insurance.hull.mid.toLocaleString()} mid
• Engineering (age-adjusted ${budget.am.toFixed(1)}x): $${nModel.operations.engineering.mid.toLocaleString()} mid
• Dockage (${port}): $${nModel.operations.dockage.mid.toLocaleString()} mid
• Fuel: $${nModel.operations.fuels.mid.toLocaleString()} mid
• Grand total: LOW $${gt.l.toLocaleString()} | MID $${gt.m.toLocaleString()} | HIGH $${gt.h.toLocaleString()}

Write ONLY a JSON object with exactly these 5 string fields. No other text.

{
  "assumptions": "2-3 sentences: state the crew count and why, the insured hull value used and how it was calculated, and the age adjustment applied to engineering.",
  "rangeExplanation": "2-3 sentences: what specifically drives the low vs high gap for this vessel — dockage region, crew tier, capex pace.",
  "categoryBreakdown": "3-4 sentences: name the top 4 cost categories by dollar amount, state approximate mid totals, and note what % of the grand total each represents.",
  "crewStructureNote": "2-3 sentences: list every crew position with their mid annual salary, state the total crew cost, and note what removing one crew member would save.",
  "keyDrivers": "List the 4 biggest cost drivers for this specific vessel, one sentence each explaining why it is so significant here."
}`;

    let narrativeText = "";
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          messages: [{ role: "user", content: narrativePrompt }],
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as { content?: { type: string; text?: string }[] };
        narrativeText = aiData.content?.find(b => b.type === "text")?.text || "";
      }
    } catch { /* narrative failure is non-fatal */ }

    // Parse narrative JSON (fall back to defaults if Claude fails)
    const bd = nModel.crew.salaries.breakdown || [];
    const crewLine = seg === "small"
      ? (cMode === "owner"
          ? `This vessel is owner-operated with no paid crew, so crew payroll is $0. The owner absorbs captaining and routine maintenance directly.`
          : `Crew is ${bd.map(r => `${r.role} ($${(r.mid||0).toLocaleString()})`).join(" and ")}, total $${budget.salM.toLocaleString()} mid — engaged on a day-rate rather than full-time salaried basis.`)
      : `Mid scenario staffs ${budget.cc} crew including Captain ($${(bd[0]?.mid||0).toLocaleString()}), Chief Engineer ($${(bd[1]?.mid||0).toLocaleString()}), Chef ($${(bd[2]?.mid||0).toLocaleString()}), and Chief Stewardess ($${(bd[3]?.mid||0).toLocaleString()}), with additional crew rounding out the complement. Total salaries mid: $${budget.salM.toLocaleString()}.`;
    const valueLabel = seg === "small" ? "agreed hull value" : "insured replacement value";
    let narrative = {
      assumptions: `Mid scenario assumes ${seg === "small" && cMode === "owner" ? "no paid crew (owner-operated)" : `${budget.cc} paid crew`}, ${port} home port, ${hrs} hours/year cruising, hull insured at $${(budget.hv/1_000_000).toFixed(1)}M ${valueLabel}, and a ${budget.am.toFixed(1)}x age multiplier applied to engineering on this ${2026 - budget.yr}-year-old vessel.`,
      rangeExplanation: `The low-to-high spread is driven primarily by dockage location, ${seg === "small" ? "haul-out and yard scope" : "crew quality tier"}, fuel hours, and the pace of capital expenditure on paint and engineering reserves.`,
      categoryBreakdown: `Hull & Machinery insurance ($${nModel.insurance.hull.mid.toLocaleString()} mid) reflects the $${(budget.hv/1_000_000).toFixed(1)}M ${valueLabel}. Engineering ($${nModel.operations.engineering.mid.toLocaleString()} mid) is adjusted for the vessel's age. Dockage ($${nModel.operations.dockage.mid.toLocaleString()} mid), fuel, and capital reserves account for the remainder.`,
      crewStructureNote: crewLine,
      keyDrivers: `${seg === "small" && cMode !== "owner" ? "Day-rate captain engagement" : seg === "small" ? "Dockage and storage" : "Crew payroll"} is among the largest annual costs. Hull & Machinery insurance is a significant fixed cost tied to the $${(budget.hv/1_000_000).toFixed(1)}M ${valueLabel}. Engineering maintenance is shaped by a ${budget.am.toFixed(1)}x age multiplier reflecting ${2026 - budget.yr} years of service. Dockage and fuel together represent variable cost tied to how intensively and where the vessel is run.`,
    };

    if (narrativeText) {
      const stripped = narrativeText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jStart = stripped.indexOf("{");
      const jEnd   = stripped.lastIndexOf("}");
      if (jStart !== -1 && jEnd > jStart) {
        try {
          const parsed = JSON.parse(stripped.slice(jStart, jEnd + 1));
          if (parsed.assumptions)      narrative.assumptions      = parsed.assumptions;
          if (parsed.rangeExplanation) narrative.rangeExplanation = parsed.rangeExplanation;
          if (parsed.categoryBreakdown)narrative.categoryBreakdown= parsed.categoryBreakdown;
          if (parsed.crewStructureNote)narrative.crewStructureNote= parsed.crewStructureNote;
          if (parsed.keyDrivers)       narrative.keyDrivers       = parsed.keyDrivers;
        } catch { /* keep defaults */ }
      }
    }

    // ── Step 3: assemble final model ─────────────────────────────────────
    const model = {
      vesselName: v.name || "Vessel",
      vesselUrl:  url || v.url || "",
      segment:    seg,
      crewMode:   seg === "small" ? cMode : undefined,
      // Meta for real-time crew adjustment in the UI
      _meta: {
        crewCount:   budget.cc,
        loa_m:       budget.lm,
        buildYear:   budget.yr,
        perCrew:     (budget as {perCrew?: unknown}).perCrew ?? null,
      },
      ...(nModel as object),
      assumptions:       narrative.assumptions,
      rangeExplanation:  narrative.rangeExplanation,
      categoryBreakdown: narrative.categoryBreakdown,
      crewStructureNote: narrative.crewStructureNote,
      keyDrivers:        narrative.keyDrivers,
    };

    return NextResponse.json({ ok: true, model });
  } catch (err) {
    console.error("Ownership model error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
