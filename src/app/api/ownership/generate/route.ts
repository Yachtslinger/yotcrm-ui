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

// Agreed hull value for insurance — what a surveyor sets on a quality used vessel.
// This is market value + ~25-30% premium, NOT new-build replacement cost.
// Nadan (46m, asking $14M) → surveyor agrees ~$18-22M → use $22M bracket
function insuredValue(m: number): number {
  if (m < 24) return 2_000_000;  if (m < 28) return 3_800_000;
  if (m < 32) return 6_200_000;  if (m < 36) return 9_500_000;
  if (m < 40) return 13_500_000; if (m < 45) return 17_500_000;
  if (m < 50) return 22_000_000; if (m < 55) return 30_000_000;
  if (m < 62) return 42_000_000; return 58_000_000;
}

// Routine engineering base (routine ops, NOT capital). Age mult applied separately.
function engBaseVal(m: number): number {
  if (m < 24) return 28_000;  if (m < 28) return 40_000;
  if (m < 32) return 55_000;  if (m < 36) return 72_000;
  if (m < 40) return 90_000;  if (m < 45) return 112_000;
  if (m < 50) return 138_000; if (m < 55) return 172_000;
  if (m < 62) return 215_000; return 275_000;
}

function captainMid(m: number): number {
  if (m < 24) return 110_000; if (m < 28) return 130_000;
  if (m < 32) return 148_000; if (m < 36) return 162_000;
  if (m < 40) return 172_000; if (m < 45) return 182_000;
  if (m < 50) return 192_000; if (m < 55) return 210_000;
  if (m < 62) return 232_000; return 260_000;
}

// Age multiplier — capped at 1.30 max for routine engineering
// (older vessels need more maintenance but it doesn't grow to 1.6x)
function ageMult(yr: number): number {
  const age = 2026 - yr;
  if (age >= 20) return 1.30; if (age >= 15) return 1.22;
  if (age >= 12) return 1.14; if (age >= 8)  return 1.07;
  return 1.0;
}

function fuelBurnLph(m: number): number {
  if (m < 28) return 50;  if (m < 32) return 68;  if (m < 36) return 88;
  if (m < 40) return 108; if (m < 45) return 128; if (m < 50) return 148;
  if (m < 55) return 188; return 238;
}

function dockMonthlyPerFt(port: string): { l: number; m: number; h: number } {
  const p = port.toLowerCase();
  if (p.includes("mediterr") || p.includes(" med")) return { l: 55, m: 90,  h: 165 };
  if (p.includes("florida")  || p.includes("east")) return { l: 28, m: 48,  h: 82  };
  if (p.includes("gulf"))                            return { l: 22, m: 36,  h: 62  };
  if (p.includes("caribbean"))                       return { l: 22, m: 38,  h: 68  };
  if (p.includes("pacific")  || p.includes("alaska"))return { l: 18, m: 30,  h: 52  };
  if (p.includes("worldwide")|| p.includes("expedi"))return { l: 35, m: 60,  h: 115 };
  return { l: 28, m: 48, h: 82 };
}

/* ─── Full deterministic budget builder ────────────────────────────────────── */
function buildBudget(v: Record<string, string>, port: string, style: string, hrs: number) {
  const lm   = parseLoaMeters(v.loa || "");
  const lft  = lm * 3.28084;
  const yr   = parseYear(v.year || "");
  const am   = ageMult(yr);
  const cc   = parseCrewCount(v.crew || "");
  const isLux = !style.toLowerCase().includes("explorer") && !style.toLowerCase().includes("commercial");
  const isExp = !isLux;

  const hrsL = Math.round(hrs * 0.55);
  const hrsH = Math.round(hrs * 1.55);

  /* ── Crew salaries ──────────────────────────────────────────────────────── */
  const capM = captainMid(lm);
  const S = {
    cap:  { l: r5(capM * 0.82), m: capM,            h: r5(capM * 1.20) },
    eng:  { l: r5(capM * 0.74 * 0.82), m: r5(capM * 0.74), h: r5(capM * 0.74 * 1.18) },
    chef: { l: r5(capM * 0.62 * 0.82), m: r5(capM * 0.62), h: r5(capM * 0.62 * 1.18) },
    stew: { l: r5(capM * 0.55 * 0.82), m: r5(capM * 0.55), h: r5(capM * 0.55 * 1.18) },
    jr:   { l: 58_000,                 m: 70_000,           h: 85_000 },
  };
  const jrCt = Math.max(0, cc - 4);
  const salL = S.cap.l + S.eng.l + S.chef.l + S.stew.l + jrCt * S.jr.l;
  const salM = S.cap.m + S.eng.m + S.chef.m + S.stew.m + jrCt * S.jr.m;
  const salH = S.cap.h + S.eng.h + S.chef.h + S.stew.h + jrCt * S.jr.h;

  /* ── Crew support costs ─────────────────────────────────────────────────── */
  const foodDailyMid = isLux ? 46 : 34;
  const crewFood = { l: r5(cc * 32 * 365), m: r5(cc * foodDailyMid * 365), h: r5(cc * 62 * 365) };
  const recruit  = { l: r1(cc * 2_500),  m: r1(cc * 4_000),  h: r1(cc * 7_000) };
  const travel   = { l: r1(cc * 3_200),  m: r1(cc * 5_200),  h: r1(cc * 9_000) };
  const accom    = { l: r1(cc * 900),    m: r1(cc * 1_500),  h: r1(cc * 2_600) };
  const uniform  = { l: r1(cc * 1_000),  m: r1(cc * 1_600),  h: r1(cc * 2_600) };
  const training = { l: r1(cc * 1_400),  m: r1(cc * 2_200),  h: r1(cc * 3_800) };
  const medical  = { l: r1(cc * 800),    m: r1(cc * 1_300),  h: r1(cc * 2_200) };
  const dayWork  = { l: r1(lm * 300),    m: r1(lm * 550),    h: r1(lm * 1_050) };
  const entmt    = { l: r1(cc * 450),    m: r1(cc * 800),    h: r1(cc * 1_500) };

  /* ── Communications ─────────────────────────────────────────────────────── */
  const phone  = { l: 7_000,  m: 10_000, h: 15_000 };
  const satTv  = { l: 5_000,  m: 7_000,  h: 11_000 };
  const satcom = { l: 20_000, m: 30_000, h: 48_000 };

  /* ── Operations ─────────────────────────────────────────────────────────── */
  const eBase = engBaseVal(lm);
  const eng  = { l: r5(eBase * am * 0.72), m: r5(eBase * am),      h: r5(eBase * am * 1.50) };
  const fuelGph = fuelBurnLph(lm) * 0.264172;
  const fuel = { l: r5(hrsL * fuelGph * 4.6), m: r5(hrs * fuelGph * 5.0), h: r5(hrsH * fuelGph * 5.5) };
  const dr   = dockMonthlyPerFt(port);
  const dock = { l: r5(lft * dr.l * 12 * 1.25), m: r5(lft * dr.m * 12 * 1.25), h: r5(lft * dr.h * 12 * 1.25) };
  const galley   = { l: r5(Math.max(40_000, lm * 850)),  m: r5(Math.max(60_000, lm * 1_350)), h: r5(Math.max(95_000, lm * 2_200)) };
  const interior = { l: r5(lm * (isLux ? 550 : 300)),    m: r5(lm * (isLux ? 950 : 500)),    h: r5(lm * (isLux ? 1_500 : 780)) };
  const agency   = { l: r1(lm * 250),  m: r1(lm * 440),  h: r1(lm * 780) };
  const av       = { l: r1(lm * 70),   m: r1(lm * 140),  h: r1(lm * 260) };
  const auto_v   = { l: r1(lm * 80),   m: r1(lm * 145),  h: r1(lm * 255) };
  const bridge   = { l: r1(lm * 90),   m: r1(lm * 160),  h: r1(lm * 270) };
  const computer = { l: r1(lm * 80),   m: r1(lm * 145),  h: r1(lm * 240) };
  const deck     = { l: r1(lm * 290),  m: r1(lm * 500),  h: r1(lm * 850) };
  const dockExp  = { l: r1(lm * 55),   m: r1(lm * 100),  h: r1(lm * 175) };
  const launches = { l: r1(lm * 125),  m: r1(lm * 215),  h: r1(lm * 380) };
  const mail     = { l: r1(lm * 50),   m: r1(lm * 90),   h: r1(lm * 160) };
  const office   = { l: r1(lm * 58),   m: r1(lm * 105),  h: r1(lm * 180) };
  const safety   = { l: r1(lm * 100),  m: r1(lm * 180),  h: r1(lm * 320) };
  const security = { l: r1(lm * 62),   m: r1(lm * 120),  h: r1(lm * 235) };
  const survey   = { l: r1(lm * 150),  m: r1(lm * 270),  h: r1(lm * 470) };
  const ware     = { l: r1(lm * 70),   m: r1(lm * 135),  h: r1(lm * 240) };

  /* ── Insurance ──────────────────────────────────────────────────────────── */
  const hv    = insuredValue(lm);
  const hm    = { l: r5(hv * 0.0082), m: r5(hv * 0.0118), h: r5(hv * 0.0168) };
  const pi    = { l: r5(hm.l * 0.10), m: r5(hm.m * 0.10), h: r5(hm.h * 0.10) };
  const crewH = { l: r5(cc * 4_500),  m: r5(cc * 5_800),  h: r5(cc * 8_000) };

  /* ── Administrative ─────────────────────────────────────────────────────── */
  const profFees = { l: r1(lm * 320),  m: r1(lm * 560),   h: r1(lm * 980) };
  const bankCh   = { l: 3_000,         m: 4_000,           h: 6_500 };
  const mgmtTrav = { l: r1(lm * 80),   m: r1(lm * 155),   h: r1(lm * 275) };

  /* ── Capital improvements (annualised reserves) ─────────────────────────── */
  const paintCycle = isExp ? 3 : 5;
  const paintJob   = isExp ? lft * 350 : lft * 1_950;
  const paint      = { l: r5(paintJob * 0.80 / paintCycle), m: r5(paintJob / paintCycle), h: r5(paintJob * 1.35 / paintCycle) };
  // Cap eng reserve: lower multiplier — this is planned capex, not emergency spend
  const capEng     = { l: r5(eBase * 0.72 * am * 0.60), m: r5(eBase * 0.72 * am), h: r5(eBase * 0.72 * am * 1.60) };
  const capAv      = { l: r1(lm * 80),   m: r1(lm * 175),  h: r1(lm * 360) };
  const capInt     = { l: r1(lm * 240),  m: r1(lm * 480),  h: r1(lm * 880) };
  const capTend    = { l: r1(lm * 170),  m: r1(lm * 350),  h: r1(lm * 660) };
  const capOther   = { l: r1(lm * 175),  m: r1(lm * 335),  h: r1(lm * 620) };

  /* ── Management fee (after sub-total) ───────────────────────────────────── */
  function sum(items: {l:number;m:number;h:number}[], key: "l"|"m"|"h") {
    return items.reduce((acc, i) => acc + i[key], 0);
  }
  const allItems = [
    {l:salL,m:salM,h:salH}, crewFood, recruit, travel, accom, uniform, training, medical, dayWork, entmt,
    phone, satTv, satcom,
    eng, fuel, dock, galley, interior, agency, av, auto_v, bridge, computer, deck,
    dockExp, launches, mail, office, safety, security, survey, ware,
    hm, pi, crewH, profFees, bankCh, mgmtTrav,
    paint, capEng, capAv, capInt, capTend, capOther,
  ];
  const preMgmt = { l: sum(allItems,"l"), m: sum(allItems,"m"), h: sum(allItems,"h") };
  const mgmt    = { l: r5(preMgmt.l * 0.038), m: r5(preMgmt.m * 0.058), h: r5(preMgmt.h * 0.080) };

  /* ── Salary breakdown ───────────────────────────────────────────────────── */
  const jrNames = ["2nd Stewardess","Deckhand","2nd Deckhand","3rd Stewardess","Bosun","Additional Crew"];
  const breakdown = [
    { role: "Captain",                     low: S.cap.l,  mid: S.cap.m,  high: S.cap.h  },
    { role: "Chief Engineer / First Mate", low: S.eng.l,  mid: S.eng.m,  high: S.eng.h  },
    { role: "Chef",                        low: S.chef.l, mid: S.chef.m, high: S.chef.h },
    { role: "Chief Stewardess",            low: S.stew.l, mid: S.stew.m, high: S.stew.h },
  ];
  for (let i = 0; i < jrCt; i++) {
    breakdown.push({ role: jrNames[i] || `Crew ${5 + i}`, low: S.jr.l, mid: S.jr.m, high: S.jr.h });
  }

  const model = {
    crew: {
      salaries:    { low: salL, mid: salM, high: salH, breakdown },
      recruitment: recruit,  travel,       accommodation: accom,
      uniforms:    uniform,  training,     foodBeverage:  crewFood,
      medical,               dayWorkers:   dayWork,       entertainment: entmt,
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
  };

  return {
    lm, lft, yr, am, cc, hv,
    salL, salM, salH, breakdown,
    grandTotal: { l: preMgmt.l + mgmt.l, m: preMgmt.m + mgmt.m, h: preMgmt.h + mgmt.h },
    model,
  };
}

/* ─── Route handler ─────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const { vessel, url, annualHours, charterWeeks, homePort, vesselStyle } = await req.json();
    if (!vessel && !url) return NextResponse.json({ ok: false, error: "vessel data required" }, { status: 400 });

    const v     = (vessel || {}) as Record<string, string>;
    const hrs   = annualHours  || 800;
    const port  = homePort     || "Florida / US East Coast";
    const style = vesselStyle  || "Luxury / Full Fairing & Paint";
    const charter = charterWeeks || 0;

    const budget = buildBudget(v, port, style, hrs);
    const gt     = budget.grandTotal;

    /* ── Ask Claude only for narrative text ─────────────────────────────── */
    const vesselDesc = [
      `${v.name || "Vessel"} — ${v.builder || ""} ${v.year || ""}, ${v.loa || ""}, ${budget.cc} crew`,
      `Engines: ${v.engines || "Unknown"}  |  Hull: ${v.hullMaterial || "Unknown"}`,
      `${(v.description || "").slice(0, 350)}`,
    ].join("\n");

    const narrativePrompt = `You are a senior yacht management advisor writing the narrative section of an annual ownership cost analysis. Return ONLY a JSON object with exactly these 5 string fields — no other text.

VESSEL: ${vesselDesc}
URL: ${url || ""}
PROFILE: ${hrs} hrs/yr | ${port} | ${style}${charter > 0 ? ` | ${charter} charter weeks` : ""}

COMPUTED BUDGET (reference these exact numbers in your narrative):
• Crew (${budget.cc} positions): $${budget.salM.toLocaleString()} salaries mid
• H&M Insurance (agreed hull $${(budget.hv / 1_000_000).toFixed(0)}M): $${budget.model.insurance.hull.mid.toLocaleString()} mid
• Engineering (age adj. ×${budget.am.toFixed(2)}): $${budget.model.operations.engineering.mid.toLocaleString()} mid
• Dockage: $${budget.model.operations.dockage.mid.toLocaleString()} mid
• Fuel (${hrs} hrs): $${budget.model.operations.fuels.mid.toLocaleString()} mid
• Grand total — LOW $${gt.l.toLocaleString()} | MID $${gt.m.toLocaleString()} | HIGH $${gt.h.toLocaleString()}

{
  "assumptions": "2-3 sentences: crew count, insured value rationale, age multiplier applied.",
  "rangeExplanation": "2-3 sentences: what drives low vs high for this specific vessel.",
  "categoryBreakdown": "3-4 sentences: top 4 cost categories with dollar amounts and % of grand total.",
  "crewStructureNote": "2-3 sentences: each position with mid salary, total, and savings from removing one crew.",
  "keyDrivers": "Top 4 cost drivers — one sentence each on why it matters for this vessel."
}`;

    let narrative = {
      assumptions:       `Mid scenario assumes ${budget.cc} crew, ${port} home port at ${hrs} hours/year, hull insured at $${(budget.hv / 1_000_000).toFixed(0)}M agreed value, with a ×${budget.am.toFixed(2)} age multiplier applied to engineering on this ${2026 - budget.yr}-year-old vessel.`,
      rangeExplanation:  `Low-to-high spread is driven by dockage location and marina tier, crew compensation level, fuel hours, and the pace of capital expenditure on paint and engineering reserves.`,
      categoryBreakdown: `Crew salaries ($${budget.salM.toLocaleString()} mid) are the largest single category. H&M insurance ($${budget.model.insurance.hull.mid.toLocaleString()} mid) reflects the $${(budget.hv / 1_000_000).toFixed(0)}M agreed hull value. Engineering ($${budget.model.operations.engineering.mid.toLocaleString()} mid) is age-adjusted. Dockage, fuel, and annualised capital reserves account for the remainder of the budget.`,
      crewStructureNote: `Mid scenario staffs ${budget.cc} crew: Captain $${budget.breakdown[0]?.mid.toLocaleString()}, Chief Engineer $${budget.breakdown[1]?.mid.toLocaleString()}, Chef $${budget.breakdown[2]?.mid.toLocaleString()}, Chief Stewardess $${budget.breakdown[3]?.mid.toLocaleString()}, plus ${Math.max(0, budget.cc - 4)} additional crew. Total mid salaries: $${budget.salM.toLocaleString()}.`,
      keyDrivers:        `Crew payroll is the dominant cost at roughly 30% of the annual budget. H&M insurance at 1.18% of the $${(budget.hv / 1_000_000).toFixed(0)}M agreed hull value is the second-largest fixed cost. Engineering maintenance is elevated by the vessel's age. Dockage and fuel scale directly with usage intensity and home port selection.`,
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
          messages: [{ role: "user", content: narrativePrompt }],
        }),
      });
      if (aiRes.ok) {
        const aiData = await aiRes.json() as { content?: { type: string; text?: string }[] };
        const raw = aiData.content?.find(b => b.type === "text")?.text || "";
        const s = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const js = s.indexOf("{"), je = s.lastIndexOf("}");
        if (js !== -1 && je > js) {
          const p = JSON.parse(s.slice(js, je + 1));
          if (p.assumptions)       narrative.assumptions       = p.assumptions;
          if (p.rangeExplanation)  narrative.rangeExplanation  = p.rangeExplanation;
          if (p.categoryBreakdown) narrative.categoryBreakdown = p.categoryBreakdown;
          if (p.crewStructureNote) narrative.crewStructureNote = p.crewStructureNote;
          if (p.keyDrivers)        narrative.keyDrivers        = p.keyDrivers;
        }
      }
    } catch { /* narrative failure non-fatal — defaults used */ }

    const model = {
      vesselName: v.name || "Vessel",
      vesselUrl:  url || v.url || "",
      ...budget.model,
      ...narrative,
    };

    return NextResponse.json({ ok: true, model });
  } catch (err) {
    console.error("Ownership model error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
