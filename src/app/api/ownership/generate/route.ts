import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

/* ─── USAGE PATTERNS — define Low/Mid/High engine hours directly ─────────
   Replaces the old ×0.55 / ×1.55 multiplier. Mid is the planning number.
   Source: typical private yacht usage, not commercial defaults.             */
const USAGE_PATTERNS: Record<string, [number, number, number]> = {
  light_private:  [100, 200, 350],   // weekend / holiday only
  normal_private: [200, 350, 600],   // typical owner, 3-4 active months
  active_owner:   [350, 600, 900],   // regular seasonal + offshore passages
  charter_heavy:  [550, 850, 1300],  // professional charter or liveaboard
};

/* ─── CONDITION RATING + CORRECTIVE REPAIR ────────────────────────────────
   Corrective allowance = routine engineering × factor.
   Not predicting a blown chiller — gives a defensible repair reserve
   without claiming precision. Default: unknown (conservative).              */
const CONDITION_FACTORS: Record<string, number> = {
  excellent: 0.05,
  good:      0.10,
  average:   0.20,
  deferred:  0.40,
  unknown:   0.25,
};

/* ─── SIZE BRACKET (Crewfinders 5-band) ────────────────────────────────── */
type Band = "b70" | "b100" | "b130" | "b160" | "b190";
function band(lft: number): Band {
  if (lft < 100) return "b70";
  if (lft < 130) return "b100";
  if (lft < 160) return "b130";
  if (lft < 190) return "b160";
  return "b190";
}

/* ─── CREW SALARY TABLE — Crewfinders 2025 ──────────────────────────────── */
const SAL: Record<string, Record<Band, [number, number, number]>> = {
  captain:        { b70:[84,102,120], b100:[120,138,156], b130:[156,174,192], b160:[192,210,228], b190:[228,260,295] },
  first_officer:  { b70:[54,60,66],   b100:[66,72,78],    b130:[78,84,90],    b160:[90,93,95],    b190:[102,115,130] },
  bosun:          { b70:[48,51,54],   b100:[54,57,60],    b130:[60,63,66],    b160:[66,69,72],    b190:[66,72,80]    },
  deckhand:       { b70:[42,45,48],   b100:[48,51,54],    b130:[54,57,60],    b160:[60,63,66],    b190:[60,66,72]    },
  chief_engineer: { b70:[72,78,84],   b100:[84,90,96],    b130:[96,108,120],  b160:[120,132,144], b190:[144,162,180] },
  asst_engineer:  { b70:[48,54,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  chef_culinary:  { b70:[60,66,72],   b100:[72,78,84],    b130:[84,90,96],    b160:[96,102,108],  b190:[108,118,130] },
  chef_cook:      { b70:[54,57,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  chief_stew:     { b70:[54,57,60],   b100:[60,63,66],    b130:[66,69,72],    b160:[72,78,84],    b190:[84,90,100]   },
  stew_2nd:       { b70:[42,45,48],   b100:[48,51,54],    b130:[54,57,60],    b160:[60,63,66],    b190:[66,72,78]    },
  stew_3rd:       { b70:[40,43,46],   b100:[45,48,52],    b130:[50,53,57],    b160:[55,58,62],    b190:[60,65,72]    },
  eto_av:         { b70:[55,62,70],   b100:[65,73,82],    b130:[78,87,96],    b160:[90,100,112],  b190:[105,118,132] },
};
const DAY_RATE_CAP: Record<Band, [number, number, number]> = {
  b70:[385,425,480], b100:[435,475,540], b130:[485,530,600], b160:[560,625,710], b190:[660,750,850],
};
function salScenario(key: string, b: Band) {
  const t = SAL[key]?.[b] ?? SAL.deckhand[b];
  return { low: t[0]*1000, mid: t[1]*1000, high: t[2]*1000 };
}

/* ─── FUEL — HP formula with explicit [low,mid,high] hours ──────────────── */
function calcFuel(hpTotal: number, hullType: string, hrs: [number,number,number]) {
  const loads: Record<string,[number,number,number]> = {
    displacement: [0.30,0.38,0.52], semi: [0.48,0.60,0.76], planing: [0.65,0.78,0.90],
  };
  const load = loads[hullType] ?? loads.semi;
  const prices = [4.60, 5.10, 5.70];
  const gph = (i: number) => (hpTotal * load[i] * 0.4) / 7.2;
  const factor = 1.15; // generator + tender add-on fallback
  return {
    low:  r5(gph(0) * hrs[0] * prices[0] * factor),
    mid:  r5(gph(1) * hrs[1] * prices[1] * factor),
    high: r5(gph(2) * hrs[2] * prices[2] * factor),
  };
}
function fuelFallback(lft: number, hullType: string, hrs: [number,number,number]) {
  const gph = hullType==="planing" ? lft*0.50 : hullType==="semi" ? lft*0.30 : lft*0.15;
  const prices = [4.60, 5.10, 5.70]; const factor = 1.15;
  return {
    low:  r5(gph * hrs[0] * prices[0] * factor),
    mid:  r5(gph * hrs[1] * prices[1] * factor),
    high: r5(gph * hrs[2] * prices[2] * factor),
  };
}

/* ─── CORRECTIVE REPAIR ALLOWANCE ────────────────────────────────────────── */
function correctiveRepair(eng: {low:number;mid:number;high:number}, condition: string) {
  const f = CONDITION_FACTORS[condition] ?? CONDITION_FACTORS.unknown;
  return { low: r5(eng.low*f), mid: r5(eng.mid*f), high: r5(eng.high*f) };
}

/* ─── INSURANCE ─────────────────────────────────────────────────────────── */
function calcHullInsurance(agreedValue: number, age: number, isCharter: boolean) {
  let rate = 0.0110;
  if (age>20) rate+=0.0030; else if (age>15) rate+=0.0020; else if (age>10) rate+=0.0010;
  if (isCharter) rate+=0.0025;
  return { low:r5(agreedValue*(rate-0.0035)), mid:r5(agreedValue*rate), high:r5(agreedValue*(rate+0.0055)) };
}
function estimatedAgreedValue(lft: number): number {
  if (lft<60) return 600_000; if (lft<70) return 1_100_000; if (lft<80) return 2_000_000;
  if (lft<90) return 3_200_000; if (lft<100) return 4_500_000; if (lft<115) return 6_500_000;
  if (lft<130) return 9_500_000; if (lft<150) return 14_000_000; if (lft<165) return 19_000_000;
  if (lft<185) return 26_000_000; return 38_000_000;
}

/* ─── DOCKAGE ────────────────────────────────────────────────────────────── */
function dockageAnnual(lft: number, port: string) {
  const p = port.toLowerCase();
  let rates: [number,number,number];
  if (p.includes("mediterr")||p.includes(" med")) rates=[55,90,165];
  else if (p.includes("florida")||p.includes("east")) rates=[35,55,92];
  else if (p.includes("gulf")) rates=[25,42,70];
  else if (p.includes("caribbean")) rates=[28,46,80];
  else if (p.includes("pacific")||p.includes("alaska")) rates=[22,36,62];
  else if (p.includes("worldwide")||p.includes("expedi")) rates=[40,68,125];
  else rates=[35,55,92];
  const tf = 1.28;
  return { low:r5(lft*rates[0]*12*tf), mid:r5(lft*rates[1]*12*tf), high:r5(lft*rates[2]*12*tf) };
}

/* ─── HAUL-OUT + ANTIFOUL ────────────────────────────────────────────────── */
function haulAntifoul(lft: number, port: string) {
  const biennial = port.toLowerCase().includes("alaska")||port.toLowerCase().includes("pacific north");
  const r = biennial ? [40,65,90] : [100,130,165];
  return { low:r5(lft*r[0]), mid:r5(lft*r[1]), high:r5(lft*r[2]) };
}

/* ─── ROUTINE ENGINEERING ────────────────────────────────────────────────── */
function routineEngineering(lft: number, age: number, hpTotal: number) {
  const hpBonus = Math.round(hpTotal/100)*800;
  const af = age>20?1.45:age>15?1.30:age>10?1.18:age>5?1.08:1.0;
  const base = lft*700*af+hpBonus;
  return { low:r5(base*0.70), mid:r5(base), high:r5(base*1.45) };
}

/* ─── CREW ───────────────────────────────────────────────────────────────── */
interface PositionResult { role:string; low:number; mid:number; high:number; }
const POSITION_LABELS: Record<string,string> = {
  captain:"Captain", first_officer:"First Officer / Chief Officer", bosun:"Bosun / 2nd Mate",
  deckhand:"Deckhand", deckhand_2:"2nd Deckhand", chief_engineer:"Chief Engineer",
  asst_engineer:"Assistant Engineer / 2nd Engineer", chef_culinary:"Chef (Culinary-Trained)",
  chef_cook:"Chef / Cook", chief_stew:"Chief Stewardess", stew_2nd:"2nd Stewardess",
  stew_3rd:"3rd Stewardess", eto_av:"ETO / AV-IT Technician",
};
function dayRateCaptainAnnual(lft: number) {
  const r = DAY_RATE_CAP[band(lft)];
  return { low:r5(r[0]*60), mid:r5(r[1]*100), high:r5(r[2]*160) };
}
function buildCrewFromPositions(keys: string[], lft: number, isDayRate: boolean) {
  const b = band(lft); const breakdown: PositionResult[] = [];
  for (const key of keys) {
    const sal = (key==="captain"&&isDayRate) ? dayRateCaptainAnnual(lft)
              : salScenario(key==="deckhand_2"?"deckhand":key, b);
    breakdown.push({ role:POSITION_LABELS[key]??key, ...sal });
  }
  return {
    breakdown,
    totals: { low:breakdown.reduce((s,p)=>s+p.low,0), mid:breakdown.reduce((s,p)=>s+p.mid,0), high:breakdown.reduce((s,p)=>s+p.high,0) },
    count: keys.length,
    fullTimeCount: keys.filter(k=>!(k==="captain"&&isDayRate)).length,
  };
}
function crewPresetPositions(preset: string, lft: number): {keys:string[];isDayRate:boolean} {
  if (preset==="owner")        return {keys:[],isDayRate:false};
  if (preset==="captain_day")  return {keys:["captain"],isDayRate:true};
  if (preset==="captain_only") return {keys:["captain"],isDayRate:false};
  if (preset==="captain_mate") return {keys:["captain","bosun"],isDayRate:false};
  if (preset==="cap_eng_stew") return {keys:["captain","chief_engineer","chief_stew"],isDayRate:false};
  if (preset==="full_private") {
    const b=["captain","chief_engineer","chef_culinary","chief_stew","deckhand"];
    if(lft>=130)b.push("stew_2nd");
    return {keys:b,isDayRate:false};
  }
  if (preset==="charter") {
    const b=["captain","chief_engineer","chef_culinary","chief_stew","stew_2nd","deckhand"];
    if(lft>=130){b.push("bosun");b.push("stew_3rd");}
    return {keys:b,isDayRate:false};
  }
  return {keys:[],isDayRate:false};
}
function crewSupportCosts(fullTimeCount: number, totalCount: number, isLuxury: boolean) {
  const r1l=(n:number)=>Math.round(n/1000)*1000;
  const fpd = isLuxury?48:38;
  return {
    foodBeverage:  {low:r5(fullTimeCount*34*365),  mid:r5(fullTimeCount*fpd*365), high:r5(fullTimeCount*65*365)},
    crewHealth:    {low:r5(fullTimeCount*4500),     mid:r5(fullTimeCount*6000),    high:r5(fullTimeCount*8500)},
    recruitment:   {low:r1l(totalCount*2500),       mid:r1l(totalCount*4000),      high:r1l(totalCount*7500)},
    travel:        {low:r1l(fullTimeCount*3500),     mid:r1l(fullTimeCount*5200),   high:r1l(fullTimeCount*9000)},
    accommodation: {low:r1l(fullTimeCount*900),      mid:r1l(fullTimeCount*1500),   high:r1l(fullTimeCount*2600)},
    uniforms:      {low:r1l(fullTimeCount*1000),     mid:r1l(fullTimeCount*1600),   high:r1l(fullTimeCount*2600)},
    training:      {low:r1l(fullTimeCount*1400),     mid:r1l(fullTimeCount*2200),   high:r1l(fullTimeCount*3800)},
    medical:       {low:r1l(fullTimeCount*800),      mid:r1l(fullTimeCount*1300),   high:r1l(fullTimeCount*2200)},
    dayWorkers:    {low:r1l(8000),                   mid:r1l(fullTimeCount>0?14000:4000), high:r1l(28000)},
    entertainment: {low:r1l(fullTimeCount*450+1000), mid:r1l(fullTimeCount*800+1500),high:r1l(fullTimeCount*1500+3000)},
  };
}

/* ─── OPERATIONS, COMMS, ADMIN ──────────────────────────────────────────── */
function operationsItems(lft: number, lm: number, isLux: boolean) {
  const galLow=r5(Math.max(18000,lm*680)), galMid=r5(Math.max(28000,lm*1100)), galHigh=r5(Math.max(55000,lm*1900));
  return {
    agency:{low:r1(lm*240),mid:r1(lm*440),high:r1(lm*800)},
    audioVisual:{low:r1(lm*70),mid:r1(lm*150),high:r1(lm*280)},
    auto:{low:r1(lm*80),mid:r1(lm*150),high:r1(lm*265)},
    bridge:{low:r1(lm*90),mid:r1(lm*165),high:r1(lm*285)},
    computer:{low:r1(lm*80),mid:r1(lm*150),high:r1(lm*260)},
    deck:{low:r1(lm*300),mid:r1(lm*520),high:r1(lm*880)},
    dockExpress:{low:r1(lm*55),mid:r1(lm*105),high:r1(lm*185)},
    galley:{low:galLow,mid:galMid,high:galHigh},
    interior:{low:r5(lm*(isLux?550:300)),mid:r5(lm*(isLux?1000:520)),high:r5(lm*(isLux?1600:820))},
    launches:{low:r1(lm*130),mid:r1(lm*230),high:r1(lm*420)},
    mailFreight:{low:r1(lm*50),mid:r1(lm*95),high:r1(lm*170)},
    office:{low:r1(lm*60),mid:r1(lm*110),high:r1(lm*190)},
    safetyMedical:{low:r1(lm*105),mid:r1(lm*190),high:r1(lm*345)},
    security:{low:r1(lm*60),mid:r1(lm*120),high:r1(lm*240)},
    survey:{low:r1(lm*160),mid:r1(lm*285),high:r1(lm*500)},
    warehousing:{low:r1(lm*75),mid:r1(lm*145),high:r1(lm*255)},
  };
}
function commsItems() {
  return { phone:{low:7000,mid:10000,high:15000}, satTV:{low:5000,mid:7000,high:11000}, satcom:{low:18000,mid:28000,high:46000} };
}
function adminItems(lm: number) {
  return {
    professionalFees:{low:r1(lm*320),mid:r1(lm*580),high:r1(lm*1000)},
    bankCharges:{low:3000,mid:4500,high:7500},
    managementTravel:{low:r1(lm*80),mid:r1(lm*155),high:r1(lm*280)},
  };
}
function managementFee(tier: string, sub: {low:number;mid:number;high:number}) {
  if (tier==="admin") return {low:15000,mid:25000,high:40000};
  if (tier==="full")  return {low:r5(sub.low*0.045),mid:r5(sub.mid*0.062),high:r5(sub.high*0.085)};
  return {low:0,mid:0,high:0};
}
function piAndCrewHealth(hm: {low:number;mid:number;high:number}, ftc: number) {
  return {
    pi:{low:r5(hm.low*0.10),mid:r5(hm.mid*0.10),high:r5(hm.high*0.10)},
    crewHealth:{low:r5(ftc*4500),mid:r5(ftc*6000),high:r5(ftc*8500)},
  };
}

/* ─── BUILD BUDGET ───────────────────────────────────────────────────────── */
function buildBudget(opts: {
  lft:number; lm:number; yr:number; age:number; hpTotal:number; hullType:string;
  agreedHullValue:number; annualHrsTriple:[number,number,number]; port:string;
  finish:string; hullMaterial:string; positionKeys:string[]; isDayRateCaptain:boolean;
  managementTier:string; vesselCondition:string;
}) {
  const {lft,lm,yr:_yr,age,hpTotal,hullType,agreedHullValue,annualHrsTriple,port,
         finish,hullMaterial:_hm,positionKeys,isDayRateCaptain,managementTier,vesselCondition} = opts;
  void _yr; void _hm;
  const isLux = finish==="luxury";

  const crew    = buildCrewFromPositions(positionKeys,lft,isDayRateCaptain);
  const support = crewSupportCosts(crew.fullTimeCount,crew.count,isLux);
  const fuel    = hpTotal>0 ? calcFuel(hpTotal,hullType,annualHrsTriple) : fuelFallback(lft,hullType,annualHrsTriple);
  const hm      = calcHullInsurance(agreedHullValue,age,false);
  const {pi,crewHealth} = piAndCrewHealth(hm,crew.fullTimeCount);
  const dock    = dockageAnnual(lft,port);
  const eng     = routineEngineering(lft,age,hpTotal>0?hpTotal:lft*12);
  const corrective = correctiveRepair(eng,vesselCondition);
  const ops     = operationsItems(lft,lm,isLux);
  const comms   = commsItems();
  const admin   = adminItems(lm);
  const haul    = haulAntifoul(lft,port);

  const capitalEvents = {
    disclaimer:`This model covers annual operating costs only. Major capital events — full paint refits, engine overhauls, electronics upgrades, and interior refits — are excluded. These vary enormously by vessel condition, engine hours, and maintenance history and cannot be responsibly estimated without a full pre-purchase survey. Plan for them as a separate budget conversation with your broker and captain.`,
  };

  type S3 = {low:number;mid:number;high:number};
  const allItems:S3[] = [
    crew.totals,support.foodBeverage,support.recruitment,support.travel,support.accommodation,
    support.uniforms,support.training,support.medical,support.dayWorkers,support.entertainment,
    comms.phone,comms.satTV,comms.satcom,
    eng,corrective,fuel,dock,haul,ops.galley,ops.interior,ops.agency,ops.audioVisual,
    ops.auto,ops.bridge,ops.computer,ops.deck,ops.dockExpress,ops.launches,
    ops.mailFreight,ops.office,ops.safetyMedical,ops.security,ops.survey,ops.warehousing,
    hm,pi,crewHealth,admin.professionalFees,admin.bankCharges,admin.managementTravel,
  ];
  const subTotal:S3 = {
    low:allItems.reduce((a,b)=>a+b.low,0),
    mid:allItems.reduce((a,b)=>a+b.mid,0),
    high:allItems.reduce((a,b)=>a+b.high,0),
  };
  const mgmtFee = managementFee(managementTier,subTotal);
  const grandTotal:S3 = {low:subTotal.low+mgmtFee.low,mid:subTotal.mid+mgmtFee.mid,high:subTotal.high+mgmtFee.high};

  const model = {
    crew:{
      salaries:{...crew.totals,breakdown:crew.breakdown},
      recruitment:support.recruitment,travel:support.travel,accommodation:support.accommodation,
      uniforms:support.uniforms,training:support.training,foodBeverage:support.foodBeverage,
      medical:support.medical,dayWorkers:support.dayWorkers,entertainment:support.entertainment,
    },
    communications:{phone:comms.phone,satTV:comms.satTV,satcom:comms.satcom},
    operations:{
      agency:ops.agency,audioVisual:ops.audioVisual,auto:ops.auto,bridge:ops.bridge,
      computer:ops.computer,deck:ops.deck,dockExpress:ops.dockExpress,
      engineering:eng, corrective,                      // ← corrective is new
      fuels:fuel,galley:ops.galley,interior:ops.interior,launches:ops.launches,
      mailFreight:ops.mailFreight,office:ops.office,dockage:dock,
      safetyMedical:ops.safetyMedical,security:ops.security,survey:ops.survey,warehousing:ops.warehousing,
    },
    insurance:{hull:hm,pi,crewHealth},
    administrative:{
      professionalFees:admin.professionalFees,bankCharges:admin.bankCharges,
      managementFee:mgmtFee,managementTravel:admin.managementTravel,
    },
    capital:{
      haulAntifoul:haul,
      av:{low:0,mid:0,high:0},engineeringDeck:{low:0,mid:0,high:0},interior:{low:0,mid:0,high:0},
      paint:{low:0,mid:0,high:0},tendersToys:{low:0,mid:0,high:0},other:{low:0,mid:0,high:0},
    },
    capitalEvents,
  };

  const perCrew = {
    salJr:{low:45000,mid:58000,high:75000},
    foodDaily:{low:34,mid:isLux?48:38,high:65},
    health:{low:4500,mid:6000,high:8500},
    travel:{low:3500,mid:5200,high:9000},
    uniform:{low:1000,mid:1600,high:2600},
    training:{low:1400,mid:2200,high:3800},
    namedSalaries:crew.breakdown,
  };

  return {model,grandTotal,subTotal,crew,perCrew,agreedHullValue};
}

/* ─── POST HANDLER ───────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      vessel, url,
      agreedHullValue,
      engineHpTotal,
      hullType = "semi",
      // New: use pattern instead of a single number
      usagePattern = "normal_private",
      annualHours,                          // optional manual override for mid hrs
      homePort = "Florida / US East Coast",
      vesselFinish = "luxury",
      managementTier = "none",
      // New: vessel condition rating
      vesselCondition = "unknown",
      crewPreset = "full_private",
      customPositions,
    } = body;

    const v: Record<string,string> = vessel||{};
    const lft   = parseLoaFt(v.loa||"100");
    const lm    = lft/3.28084;
    const yr    = parseYear(v.year||"2010");
    const age   = 2026-yr;
    const hpTotal = engineHpTotal||0;
    const hullValue = agreedHullValue||estimatedAgreedValue(lft);

    // Resolve hours: use pattern, or fall back to manual entry with ×0.55/×1.55 scaling
    const patternHrs = USAGE_PATTERNS[usagePattern];
    const midHrs = annualHours ?? patternHrs?.[1] ?? 350;
    const annualHrsTriple: [number,number,number] = patternHrs
      ?? [Math.round(midHrs*0.55), midHrs, Math.round(midHrs*1.55)];

    // Crew
    let positionKeys: string[]; let isDayRateCaptain: boolean;
    if (crewPreset==="custom"&&customPositions?.length) {
      positionKeys = (customPositions as string[]).map((k:string)=>k==="captain_day"?"captain":k);
      isDayRateCaptain = (customPositions as string[]).includes("captain_day");
    } else {
      const preset = crewPresetPositions(crewPreset,lft);
      positionKeys = preset.keys; isDayRateCaptain = preset.isDayRate;
    }

    const budget = buildBudget({
      lft,lm,yr,age,hpTotal,hullType,agreedHullValue:hullValue,
      annualHrsTriple,port:homePort,finish:vesselFinish,hullMaterial:(v.hullMaterial||v.hull||"").toLowerCase(),
      positionKeys,isDayRateCaptain,managementTier,vesselCondition,
    });

    const gt = budget.grandTotal; const crew = budget.crew;
    const crewLine = crew.breakdown.length===0
      ? "owner-operated, no paid crew"
      : crew.breakdown.map(p=>`${p.role} ($${Math.round(p.mid/1000)}K)`).join(", ");

    const conditionLabel: Record<string,string> = {
      excellent:"Excellent",good:"Good",average:"Average",deferred:"Deferred",unknown:"Unknown (no survey)"
    };

    const prompt = `You are a senior yacht management advisor. Write narrative for an estimated annual operating budget.

VESSEL: ${[v.name||"Vessel",v.builder?`by ${v.builder}`:"",yr?`(${yr})`:"",v.loa?`· ${v.loa}`:`· ${lft.toFixed(0)}ft`,hpTotal?`· ${hpTotal}HP ${hullType}`:""].filter(Boolean).join(" ")}
OPERATING PROFILE: ${usagePattern} — ${annualHrsTriple[1]} hrs/yr mid · ${homePort} · ${vesselFinish} · ${hullType} hull
VESSEL CONDITION: ${conditionLabel[vesselCondition]??vesselCondition}
CREW: ${crewLine} | Total salaries mid: $${crew.totals.mid.toLocaleString()}
HULL INSURED AT: $${(hullValue/1_000_000).toFixed(1)}M
MANAGEMENT: ${managementTier==="none"?"owner-managed, no management company":managementTier}
ESTIMATED ANNUAL OPERATING BUDGET: LOW $${gt.low.toLocaleString()} | MID $${gt.mid.toLocaleString()} | HIGH $${gt.high.toLocaleString()}

Respond with ONLY this JSON object. No preamble, no markdown fences.
{
  "assumptions": "2-3 sentences: crew, insured hull value, usage pattern (${usagePattern}), vessel condition and what it means for the corrective repair allowance.",
  "rangeExplanation": "2-3 sentences: what drives the spread — hours, dockage tier, condition rating effect on corrective repairs.",
  "categoryBreakdown": "3-4 sentences: 4 biggest cost categories by mid dollar and % of total.",
  "crewStructureNote": "2-3 sentences: describe the crew package, positions, total crew cost, what removing one person saves.",
  "keyDrivers": "4 bullets: biggest cost drivers specific to this vessel age, size, power, condition, and region."
}`;

    let narrative = {
      assumptions:`${age}-year-old vessel, insured at $${(hullValue/1_000_000).toFixed(1)}M. Condition: ${conditionLabel[vesselCondition]??vesselCondition}. Usage profile: ${usagePattern} (${annualHrsTriple[0]}/${annualHrsTriple[1]}/${annualHrsTriple[2]} hrs low/mid/high). Crew: ${crewLine||"none"}.`,
      rangeExplanation:`Low reflects light use (${annualHrsTriple[0]} hrs), economy dockage, and minimal corrective repair in a well-managed year. High reflects active use (${annualHrsTriple[2]} hrs), premium berths, and elevated corrective repair exposure.`,
      categoryBreakdown:`Crew ($${crew.totals.mid.toLocaleString()} mid) is the largest category at approximately ${Math.round(crew.totals.mid/gt.mid*100)}% of total. H&M insurance, engineering/corrective, and dockage follow as the next largest items.`,
      crewStructureNote:crewLine==="owner-operated, no paid crew"?"Vessel is owner-operated with no professional crew.":
        `Crew: ${crewLine}. Total mid crew cost: $${crew.totals.mid.toLocaleString()}. Removing one junior position typically saves $80-110K/yr fully loaded.`,
      keyDrivers:`• H&M insurance on $${(hullValue/1_000_000).toFixed(1)}M hull is a fixed annual cost regardless of use. • ${hullType==="planing"?"High HP planing hull — fuel is a material variable; hours directly multiply this cost.":hullType==="displacement"?"Displacement hull is fuel-efficient — fuel cost is modest relative to size.":"Semi-displacement hull — moderate fuel cost that scales directly with hours used."} • ${age>15?`At ${age} years, corrective repair allowance is elevated — the vessel is beyond its first major service cycle.`:`At ${age} years, vessel is in early service life — corrective repair exposure is low.`} • ${vesselCondition==="deferred"?"Deferred maintenance flag: corrective allowance is set at 40% of routine engineering — budget for significant near-term repairs.":vesselCondition==="unknown"?"No survey data: corrective allowance is set conservatively at 25% of routine engineering until a survey is completed.":"Condition is "+conditionLabel[vesselCondition]+": corrective allowance set at "+Math.round((CONDITION_FACTORS[vesselCondition]??0.25)*100)+"% of routine engineering."}`
    };

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||"","anthropic-version":"2023-06-01"},
        signal:AbortSignal.timeout(40000),
        body:JSON.stringify({model:"claude-opus-4-6",max_tokens:1800,messages:[{role:"user",content:prompt}]}),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as {content?:{type:string;text?:string}[]};
        const raw = aiData.content?.find(b=>b.type==="text")?.text||"";
        const start=raw.indexOf("{"),end=raw.lastIndexOf("}");
        if (start!==-1&&end>start) {
          const parsed=JSON.parse(raw.slice(start,end+1));
          if (parsed.assumptions)       narrative.assumptions=parsed.assumptions;
          if (parsed.rangeExplanation)  narrative.rangeExplanation=parsed.rangeExplanation;
          if (parsed.categoryBreakdown) narrative.categoryBreakdown=parsed.categoryBreakdown;
          if (parsed.crewStructureNote) narrative.crewStructureNote=parsed.crewStructureNote;
          if (parsed.keyDrivers)        narrative.keyDrivers=parsed.keyDrivers;
        }
      }
    } catch { /* non-fatal */ }

    const model = {
      vesselName:v.name||"Vessel", vesselUrl:url||"",
      _meta:{
        crewCount:crew.count,fullTimeCount:crew.fullTimeCount,loa_m:lm,loa_ft:lft,
        buildYear:yr,age,hullType,hpTotal,agreedHullValue:hullValue,
        managementTier,crewPreset,vesselCondition,
        usagePattern,annualHrsTriple,
        perCrew:budget.perCrew,positionKeys,isDayRateCaptain,
      },
      ...budget.model,
      ...narrative,
    };

    return NextResponse.json({ok:true,model});
  } catch(err) {
    console.error("Ownership generate error:",err);
    return NextResponse.json({ok:false,error:err instanceof Error?err.message:"Generation failed"},{status:500});
  }
}
