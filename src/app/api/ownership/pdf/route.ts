import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
export const maxDuration = 60;

type Scenario = { low: number; mid: number; high: number };

function fmt(n: number) { return "$" + Math.round(Math.max(0,n)).toLocaleString("en-US"); }
function pct(n: number, total: number) { return total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "0%"; }
function sectionTotal(items: Scenario[]): Scenario {
  return { low: items.reduce((a,b)=>a+b.low,0), mid: items.reduce((a,b)=>a+b.mid,0), high: items.reduce((a,b)=>a+b.high,0) };
}

function eff(path: string, s: Scenario, overrides: Record<string,number>, excluded: string[]): Scenario {
  if (excluded.includes(path)) return {low:0,mid:0,high:0};
  return { low: overrides[`${path}.low`]??s.low, mid: overrides[`${path}.mid`]??s.mid, high: overrides[`${path}.high`]??s.high };
}

function row(label: string, s: Scenario, bold = false, show = {low:true,mid:true,high:true}, desc = ""): string {
  if (s.low === 0 && s.mid === 0 && s.high === 0 && !bold) return "";
  const style = bold ? `style="font-weight:700;background:#1a1a2e;border-top:1px solid #b8933a40;"` : `style="border-bottom:1px solid #ffffff08;"`;
  const labelEl = bold
    ? `<span style="color:#b8933a">${label}</span>`
    : `<div style="color:#cbd5e1">${label}</div>${desc?`<div style="font-size:10px;color:#475569;margin-top:1px;line-height:1.4">${desc}</div>`:""}`;
  return `<tr ${style}>
    <td style="padding:${bold?"7px":"5px"} 10px ${bold?"7px":"5px"} 16px;font-size:12px;">${labelEl}</td>
    ${show.low ?`<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#4ade80":"#e2e8f0"};vertical-align:top;">${bold?fmt(s.low):`<span style="color:#4ade80">${fmt(s.low)}</span>`}</td>`:""}
    ${show.mid ?`<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#facc15":"#e2e8f0"};vertical-align:top;">${fmt(s.mid)}</td>`:""}
    ${show.high?`<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#f87171":"#e2e8f0"};vertical-align:top;">${bold?fmt(s.high):`<span style="color:#f87171">${fmt(s.high)}</span>`}</td>`:""}
  </tr>`;
}

function subrow(label: string, s: Scenario, show = {low:true,mid:true,high:true}): string {
  if (s.low === 0 && s.mid === 0 && s.high === 0) return "";
  return `<tr style="border-bottom:1px solid #ffffff05;">
    <td style="padding:3px 10px 3px 28px;font-size:11px;color:#64748b">↳ ${label}</td>
    ${show.low ?`<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.low)}</td>`:""}
    ${show.mid ?`<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.mid)}</td>`:""}
    ${show.high?`<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.high)}</td>`:""}
  </tr>`;
}

function sectionHeader(label: string, show = {low:true,mid:true,high:true}): string {
  const span = 1+(show.low?1:0)+(show.mid?1:0)+(show.high?1:0);
  return `<tr><td colspan="${span}" style="padding:14px 10px 4px 16px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b8933a;border-top:1px solid #b8933a30;">${label}</td></tr>`;
}

function scale(s: Scenario, f: number): Scenario {
  return { low: Math.round(s.low*f), mid: Math.round(s.mid*f), high: Math.round(s.high*f) };
}

/* ─── Pie chart ─────────────────────────────────────────────────────────── */
const PIE_COLORS = ["#b8933a","#38bdf8","#34d399","#a78bfa","#fb923c","#06b6d4"];
const PIE_LABELS = ["Crew","Communications","Operations","Insurance","Administrative","Annual Haul-Out"];
const PIE_DESCS  = [
  "Salaries, food, recruitment, travel, uniforms, training, medical, day workers, and entertainment.",
  "Satellite broadband (Starlink/KVH/Inmarsat), satellite TV, and crew mobile phone plans.",
  "Routine engineering, corrective repair allowance, fuel, dockage, galley, deck, port agents, and all operational departments.",
  "Hull & Machinery (physical damage), Protection & Indemnity (third-party liability), and crew health insurance.",
  "Professional/legal fees, flag-state costs, management fees (if applicable), banking, and owner/manager travel.",
  "Annual haul-out fee, antifouling paint application, zinc anodes, prop inspection, and seacock service.",
];

function buildDonutSvg(values: number[], total: number): string {
  const cx = 250, cy = 250, outerR = 200, innerR = 115;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  let paths = "", labelLines = "", cur = 0;
  values.forEach((v, i) => {
    if (v === 0) return;
    const sweep = (v / total) * 360;
    const s = toRad(cur), e = toRad(cur + sweep);
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${(cx+outerR*Math.cos(s)).toFixed(2)} ${(cy+outerR*Math.sin(s)).toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${(cx+outerR*Math.cos(e)).toFixed(2)} ${(cy+outerR*Math.sin(e)).toFixed(2)} L ${(cx+innerR*Math.cos(e)).toFixed(2)} ${(cy+innerR*Math.sin(e)).toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${(cx+innerR*Math.cos(s)).toFixed(2)} ${(cy+innerR*Math.sin(s)).toFixed(2)} Z`;
    paths += `<path d="${d}" fill="${PIE_COLORS[i]}" stroke="#0d1117" stroke-width="2" opacity="0.92"/>`;
    if (sweep >= 18) {
      const mid = toRad(cur + sweep/2), lr = (outerR+innerR)/2;
      labelLines += `<text x="${(cx+lr*Math.cos(mid)).toFixed(2)}" y="${(cy+lr*Math.sin(mid)).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#0d1117" font-family="Arial,sans-serif">${((v/total)*100).toFixed(0)}%</text>`;
    }
    cur += sweep;
  });
  return `<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" width="320" height="320">
    ${paths}${labelLines}
    <text x="${cx}" y="${cy-20}" text-anchor="middle" font-size="13" fill="#64748b" font-family="Arial,sans-serif">ANNUAL TOTAL</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="22" font-weight="700" fill="#facc15" font-family="Arial,sans-serif">${fmt(total)}</text>
    <text x="${cx}" y="${cy+34}" text-anchor="middle" font-size="12" fill="#64748b" font-family="Arial,sans-serif">per year</text>
  </svg>`;
}

export async function POST(req: NextRequest) {
  try {
    const { model, scenarios, overrides = {}, excludedPaths = [] } = await req.json();
    if (!model) return NextResponse.json({ ok: false, error: "model required" }, { status: 400 });
    const show = { low: false, mid: true, high: false, ...scenarios };
    const m = model;
    const e = (path: string, s: Scenario) => eff(path, s, overrides as Record<string,number>, excludedPaths as string[]);

    /* ── Crew ─────────────────────────────────────────────────────── */
    const crewBreakdown = ((m.crew.salaries.breakdown ?? []) as {role:string;low:number;mid:number;high:number}[])
      .filter(r => !(excludedPaths as string[]).includes(`crew.salaries.${r.role}`))
      .map(r => ({ role: r.role, ...e(`crew.salaries.${r.role}`, r) }));
    const crewSalTot = sectionTotal(crewBreakdown);

    const crewSupportRows: [string, Scenario, string][] = [
      ["Recruitment Fees", e("crew.recruitment",   m.crew.recruitment),   "Placement agency fee — industry standard 10–15% of first-year salary per hire. Crew turnover in professional yachting averages 18–24 months — this is a recurring cost, not a one-time event."],
      ["Travel",           e("crew.travel",        m.crew.travel),        "Crew rotation flights between vessel and home airports as the boat moves seasonally. Covers round-trips for vacation relief, delivery positioning, and captain travel for training. An active vessel with seasonal movement can generate $3,000–$6,000 per crew member in airfare alone."],
      ["Accommodation",    e("crew.accommodation", m.crew.accommodation), "Shoreside hotel during shipyard haul-outs, extended port stays, or periods when crew cannot live aboard. At $180–$280/night per person, a two-week yard period for a full crew is significant."],
      ["Uniforms",         e("crew.uniforms",      m.crew.uniforms),      "Annual full kit per crew member: polo shirts, fleece, foul-weather jacket and trousers, deck shoes, safety vest. High-use items require annual replacement to maintain professional appearance."],
      ["Training & Cert.", e("crew.training",      m.crew.training),      "STCW and flag-state certifications renew every 5 years, but annual refreshers are standard. Includes first aid, firefighting, sea survival, and role-specific qualifications. Budget $1,500–$4,000 per crew member per year."],
      ["Food & Beverages", e("crew.foodBeverage",  m.crew.foodBeverage),  "All food and beverages consumed by the professional crew — separate from owner/guest provisioning. Budgeted at $35–$65 per crew member per day, 365 days a year. A 5-person crew eats $65,000–$120,000 annually."],
      ["Medical Expenses", e("crew.medical",       m.crew.medical),       "Annual physicals (required by flag state for licensed officers), prescription costs, and vessel medical kit replenishment. Emergency treatment is covered separately by crew health insurance."],
      ["Day Workers",      e("crew.dayWorkers",    m.crew.dayWorkers),    "Certified tradespeople for tasks the core crew cannot perform: electricians, refrigeration engineers, riggers, divers, canvas specialists. Also delivery crew for vessel repositioning."],
      ["Entertainment",    e("crew.entertainment", m.crew.entertainment), "Crew morale and welfare — port excursions, crew dinners ashore, onboard events. Industry standard $75–$150/crew/month. Well-managed crew welfare directly reduces costly turnover."],
    ];
    const crewSupportTot = sectionTotal(crewSupportRows.map(r=>r[1]));
    const crewT = sectionTotal([crewSalTot, crewSupportTot]);

    /* ── Communications ───────────────────────────────────────────── */
    const commRows: [string, Scenario, string][] = [
      ["Phone & Cellular", e("communications.phone",  m.communications.phone),  "Captain and key crew mobile plans — local SIMs plus international roaming. Typically $80–$150/month per line. The captain must be reachable at all times."],
      ["Satellite TV",     e("communications.satTV",  m.communications.satTV),  "DirecTV, SKY, or equivalent plus marine dish service agreement. Crew welfare and guest entertainment during passages and at anchor."],
      ["Satcom / Data",    e("communications.satcom", m.communications.satcom), "Primary vessel broadband — Starlink Maritime ($250–$500/month), KVH V7-HTS ($1,000–$3,000/month), or Inmarsat. Includes weather routing, sat phone airtime, and fleet tracking."],
    ];
    const commT = sectionTotal(commRows.map(r=>r[1]));

    /* ── Operations ───────────────────────────────────────────────── */
    const engFull = e("operations.engineering", m.operations.engineering);
    const corrective = e("operations.corrective", m.operations.corrective ?? {low:0,mid:0,high:0});
    const engMech = scale(engFull, 0.40);
    const engSys  = scale(engFull, 0.35);
    const engDeck = scale(engFull, 0.25);

    // Dockage — use sub-rows when available
    const hasDockageSplit = m.operations.dockageHomeBerth != null;
    const dockHomeBerth = e("operations.dockageHomeBerth", m.operations.dockageHomeBerth ?? {low:0,mid:0,high:0});
    const dockTransient = e("operations.dockageTransient", m.operations.dockageTransient ?? {low:0,mid:0,high:0});
    const dockPortDues  = e("operations.dockagePortDues",  m.operations.dockagePortDues  ?? {low:0,mid:0,high:0});
    const dockTotal     = e("operations.dockage",          m.operations.dockage);

    // Fuel confidence
    const fuelConf: string = m.operations.fuelConfidence ?? "medium";
    const fuelBasis: string = m.operations.fuelBasis ?? "HP-formula estimate";
    const confDot = fuelConf==="high" ? "🟢 High confidence" : fuelConf==="medium" ? "🟡 Medium confidence" : "🔴 Low confidence — consider entering known GPH";

    const nonDockOps: [string, Scenario, string, boolean][] = [
      ["Agency",               e("operations.agency",       m.operations.agency),       "Port agent fees — customs clearance, fuel arrangements, dock reservations. A good agent saves more than they cost. Expect $500–$2,500 per call.", false],
      ["Audio Visual",         e("operations.audioVisual",  m.operations.audioVisual),  "Annual maintenance of onboard entertainment — TV screens, speakers, streaming hardware. Marine environments are hard on consumer AV electronics.", false],
      ["Auto",                 e("operations.auto",         m.operations.auto),         "Vehicle costs in home port — provisioning runs, parts pickup, crew/guest airport transfers.", false],
      ["Bridge",               e("operations.bridge",       m.operations.bridge),       "Chart subscriptions (NOAA, C-MAP, Navionics), pilot books, tide tables, and mandated safety replacements (flares, EPIRB releases).", false],
      ["Computer / IT",        e("operations.computer",     m.operations.computer),     "Vessel computers, navigation software, network equipment, and IT maintenance.", false],
      ["Deck",                 e("operations.deck",         m.operations.deck),         "Lines, fenders, dock lines, teak maintenance products, polishing compounds, and deck hardware. High-consumption on any active vessel.", false],
      ["Dock Express",         e("operations.dockExpress",  m.operations.dockExpress),  "Expedited freight forwarding. When a critical part fails offshore, overnight shipping at $200–$500 is far cheaper than the downtime alternative.", false],
      ["Engineering — Mechanical Service", engMech, "Annual engine services (oil, filters, impellers, zincs, belts, hoses), transmission, gearbox, running gear, and propeller shaft seals. Frequency scales with engine hours.", false],
      ["Engineering — Systems",            engSys,  "AC service, watermaker membrane/UV lamp, generator annual service, bow thruster, hydraulics. Deferred maintenance here typically means an emergency repair at sea.", false],
      ["Engineering — Deck & Hull",        engDeck, "Structural inspections (critical on steel), zinc anode replacement, cutlass bearings, deck hardware lubrication, minor hull repairs. The hull is your primary asset.", false],
      ["Corrective Repair Allowance",      corrective, `Reserve for unscheduled repairs — not routine maintenance, but the leaking shaft seals, failed chiller, and generator issues that happen during ownership. Set at ${m._meta?.vesselCondition==="excellent"?"5%":m._meta?.vesselCondition==="good"?"10%":m._meta?.vesselCondition==="average"?"20%":m._meta?.vesselCondition==="deferred"?"40%":"25%"} of routine engineering based on vessel condition (${m._meta?.vesselCondition ?? "unknown"}).`, false],
      ["Fuels & Lubricants",   e("operations.fuels",        m.operations.fuels),        `${confDot} · ${fuelBasis}`, false],
      ["Galley (Guest Prov.)", e("operations.galley",       m.operations.galley),       "All food, wines, spirits, and consumables served to owner and guests — entirely separate from crew provisions above. Provisioning spend varies enormously by lifestyle.", false],
      ["Interior",             e("operations.interior",     m.operations.interior),     "Cleaning products, soft goods maintenance, linen refresh, flower arrangements, cabin amenities, and small appliance replacement.", false],
      ["Launches & Tenders",   e("operations.launches",     m.operations.launches),     "Tender fuel, engine oil, annual outboard service, tender insurance. Used multiple times daily — often underbudgeted.", false],
      ["Mail & Freight",       e("operations.mailFreight",  m.operations.mailFreight),  "Vessel mail forwarding, registered courier for official documents, standard freight for non-urgent parts.", false],
      ["Office",               e("operations.office",       m.operations.office),       "Vessel stationery, document printing (SMS manuals, crew contracts), USCG documentation renewal, state registration.", false],
      ["Safety & Medical",     e("operations.safetyMedical",m.operations.safetyMedical),"EPIRB service, flare kit replacement (3-year expiry), fire extinguisher recharges, life raft repacking (~$800–$1,500), first aid restocking. Not optional.", false],
      ["Security",             e("operations.security",     m.operations.security),     "Port security charges (some jurisdictions), watchman services during owner absence, marina monitoring.", false],
      ["Survey & Cert.",       e("operations.survey",       m.operations.survey),       "Annual USCG/flag-state inspection, insurance-required surveys, biennial out-of-water survey. $2,000–$6,000 per survey — required by insurer and flag state.", false],
      ["Warehousing & Storage",e("operations.warehousing",  m.operations.warehousing),  "Off-vessel storage of seasonal equipment, spare parts inventory, water toys, extra linens. Typically $300–$600/month.", false],
    ];

    const opT = sectionTotal([
      ...nonDockOps.map(r=>r[1]),
      hasDockageSplit ? sectionTotal([dockHomeBerth, dockTransient, dockPortDues]) : dockTotal,
    ]);

    /* ── Insurance ────────────────────────────────────────────────── */
    const insRows: [string, Scenario, string][] = [
      ["Hull & Machinery",      e("insurance.hull",       m.insurance.hull),       "Physical damage coverage — grounding, collision, fire, theft, sinking. Premium = agreed hull value × rate. Rates typically 0.75–1.75% depending on age, use, and territory."],
      ["Protection & Indemnity",e("insurance.pi",         m.insurance.pi),         "Third-party liability — bodily injury, property damage, wreck removal, oil pollution. Required by most marinas and mandatory internationally."],
      ["Crew Health Insurance", e("insurance.crewHealth", m.insurance.crewHealth), "Medical, dental, and emergency repatriation for all full-time crew. STCW compliance — this is a regulatory requirement, not a discretionary benefit."],
    ];
    const insT = sectionTotal(insRows.map(r=>r[1]));

    /* ── Administrative ───────────────────────────────────────────── */
    const adminRows: [string, Scenario, string][] = [
      ["Professional Fees",  e("administrative.professionalFees", m.administrative.professionalFees), "Maritime attorneys, flag-state lawyers, corporate structure maintenance, and yacht-specialist accountants. Maritime law is a specialist discipline — rates are above standard legal/accounting."],
      ["Bank Charges",       e("administrative.bankCharges",      m.administrative.bankCharges),      "Account fees, international wires (significant when buying fuel or paying crew overseas), and currency conversion. An active offshore vessel generates dozens of international transfers annually."],
      ["Management Fee",     e("administrative.managementFee",    m.administrative.managementFee),    "Yacht management company fee — procurement, crew HR, financial reporting, compliance. Typically 5–8% of budget. Shows $0 for owner-managed vessels."],
      ["Management Travel",  e("administrative.managementTravel", m.administrative.managementTravel), "Owner's representative or management company visits — condition inspections, yard supervision, captain reviews."],
    ];
    const adminT = sectionTotal(adminRows.map(r=>r[1]));

    /* ── Haul-out ─────────────────────────────────────────────────── */
    const haulAntifoul = e("capital.haulAntifoul", m.capital.haulAntifoul ?? {low:0,mid:0,high:0});

    /* ── Grand total ──────────────────────────────────────────────── */
    const gt = sectionTotal([crewT, commT, opT, insT, adminT, haulAntifoul]);
    const pieVals = [crewT.mid, commT.mid, opT.mid, insT.mid, adminT.mid, haulAntifoul.mid];
    const pieSvg  = buildDonutSvg(pieVals, gt.mid);

    const today = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
    const scols = (show.low?1:0)+(show.mid?1:0)+(show.high?1:0);

    /* ── HTML page 1 — table ──────────────────────────────────────── */
    const page1 = `
<div class="page">
  <div class="header">
    <div>
      <div class="brand">Denison Yachting · Estimated Annual Operating Budget</div>
      <div class="vessel">${m.vesselName}</div>
      <div class="sub">Prepared by YotCRM · All figures in USD · Excludes acquisition, taxes, financing, depreciation, and major capital/refit events</div>
    </div>
    <div class="date">Generated ${today}</div>
  </div>
  <div class="scenarios" style="grid-template-columns:repeat(${scols},1fr)">
    ${show.low  ?`<div class="sc-card" style="background:#0d2818;border:1px solid #4ade8040"><div class="sc-label" style="color:#4ade80">LOW SCENARIO</div><div class="sc-val" style="color:#4ade80">${fmt(gt.low)}</div><div class="sc-sub">per year</div></div>`:""}
    ${show.mid  ?`<div class="sc-card" style="background:#2a2000;border:1px solid #facc1540"><div class="sc-label" style="color:#facc15">MID SCENARIO</div><div class="sc-val" style="color:#facc15">${fmt(gt.mid)}</div><div class="sc-sub">per year</div></div>`:""}
    ${show.high ?`<div class="sc-card" style="background:#2a0a0a;border:1px solid #f8717140"><div class="sc-label" style="color:#f87171">HIGH SCENARIO</div><div class="sc-val" style="color:#f87171">${fmt(gt.high)}</div><div class="sc-sub">per year</div></div>`:""}
  </div>
  <table>
    <thead><tr>
      <th style="color:#64748b;text-align:left">Category</th>
      ${show.low ?`<th style="color:#4ade80">Low</th>`:""}
      ${show.mid ?`<th style="color:#facc15">Mid</th>`:""}
      ${show.high?`<th style="color:#f87171">High</th>`:""}
    </tr></thead>
    <tbody>
      ${sectionHeader("CREW",show)}
      ${crewBreakdown.map(r=>row(`  ${r.role}`,r,false,show)).join("")}
      ${crewSupportRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL CREW",crewT,true,show)}

      ${sectionHeader("COMMUNICATIONS",show)}
      ${commRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL COMMUNICATIONS",commT,true,show)}

      ${sectionHeader("OPERATIONS",show)}
      ${nonDockOps.map(([l,s,d,b])=>row(l,s,b,show,d)).join("")}
      ${hasDockageSplit ? `
        ${row("Home Berth (Annual Berth Fee)", dockHomeBerth, false, show, "Annual berth contract — LOA × regional rate/ft/month × 12")}
        ${row("Transient Marina & Port Calls", dockTransient, false, show, "Estimated 18% of home berth cost — covers in-season transient stops")}
        ${row("Port Dues, Utilities & Storm", dockPortDues,  false, show, "Estimated 10% of home berth — port fees, utilities, storm storage")}
      ` : row("Ports, Dockage & Customs", dockTotal, false, show, "Home berth plus transient stops, port dues, and customs fees")}
      ${row("TOTAL OPERATIONS",opT,true,show)}

      ${sectionHeader("INSURANCE",show)}
      ${insRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL INSURANCE",insT,true,show)}

      ${sectionHeader("ADMINISTRATIVE",show)}
      ${adminRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL ADMINISTRATIVE",adminT,true,show)}

      ${haulAntifoul.mid>0?`
      ${sectionHeader("ANNUAL HAUL-OUT & ANTIFOUL",show)}
      ${row("Haul-out, Antifoul & Bottom Work",haulAntifoul,false,show,"Annual lift-out and pressure wash, full antifouling reapplication, zinc anode replacement, propeller polish, and seacock service. In warm Gulf Stream waters this is a true annual cost.")}
      ${row("TOTAL HAUL-OUT",haulAntifoul,true,show)}
      `:""}

      <tr style="border-top:2px solid #b8933a60">
        <td style="padding:10px 10px 10px 16px;font-size:13px;font-weight:700;color:#b8933a;letter-spacing:0.04em">ESTIMATED ANNUAL OPERATING BUDGET</td>
        ${show.low ?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#4ade80">${fmt(gt.low)}</td>`:""}
        ${show.mid ?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#facc15">${fmt(gt.mid)}</td>`:""}
        ${show.high?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#f87171">${fmt(gt.high)}</td>`:""}
      </tr>
    </tbody>
  </table>

  ${m.capitalEvents?.disclaimer?`
  <div style="margin:12px 0;padding:12px 14px;background:rgba(251,146,60,.07);border:1px solid rgba(251,146,60,.25);border-radius:8px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#fb923c;margin-bottom:5px">Capital Events — Excluded from Annual Figure</div>
    <div style="font-size:11px;color:#94a3b8;line-height:1.55">${m.capitalEvents.disclaimer}</div>
  </div>`:""}

  <div class="analysis">
    ${[["Use Assumptions",m.assumptions],["Cost Range Explanation",m.rangeExplanation],["Category Breakdown",m.categoryBreakdown],["Crew Structure Note",m.crewStructureNote],["Key Cost Drivers",m.keyDrivers]].map(([t,c])=>`<div class="a-section"><div class="a-title">${t}</div><div class="a-body">${String(c).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div></div>`).join("")}
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>`;

    /* ── HTML page 2 — pie chart ──────────────────────────────────── */
    const legendRows = PIE_LABELS.map((cat,i)=>`
      <div style="display:flex;gap:14px;align-items:flex-start;padding:13px 15px;border-radius:8px;background:#161b22;border:1px solid ${PIE_COLORS[i]}30;margin-bottom:9px">
        <div style="width:12px;height:12px;border-radius:3px;background:${PIE_COLORS[i]};flex-shrink:0;margin-top:2px"></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <span style="font-size:12px;font-weight:700;color:${PIE_COLORS[i]}">${cat}</span>
            <span style="font-size:12px;font-weight:700;color:#e2e8f0">${fmt(pieVals[i])} <span style="font-size:10px;color:#64748b">(${pct(pieVals[i],gt.mid)})</span></span>
          </div>
          <p style="font-size:11px;color:#64748b;line-height:1.55">${PIE_DESCS[i]}</p>
        </div>
      </div>`).join("");

    const page2 = `
<div class="page" style="page-break-before:always">
  <div class="header">
    <div>
      <div class="brand">Denison Yachting · Estimated Annual Operating Budget</div>
      <div class="vessel">${m.vesselName} — Budget Breakdown</div>
      <div class="sub">Mid Scenario · ${fmt(gt.mid)} per year</div>
    </div>
    <div class="date">Generated ${today}</div>
  </div>
  <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:24px">
    <div style="flex-shrink:0">${pieSvg}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:9px;align-content:start">
      ${PIE_LABELS.map((cat,i)=>`
        <div style="background:#161b22;border:1px solid ${PIE_COLORS[i]}40;border-radius:8px;padding:10px 12px">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
            <div style="width:9px;height:9px;border-radius:2px;background:${PIE_COLORS[i]}"></div>
            <span style="font-size:10px;font-weight:700;color:${PIE_COLORS[i]}">${cat}</span>
          </div>
          <div style="font-size:14px;font-weight:700;color:#f1f5f9">${fmt(pieVals[i])}</div>
          <div style="font-size:9px;color:#64748b;margin-top:1px">${pct(pieVals[i],gt.mid)} of total</div>
        </div>`).join("")}
    </div>
  </div>
  <div style="border-top:1px solid #21262d;padding-top:18px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b8933a;margin-bottom:12px">Category Descriptions</div>
    ${legendRows}
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>`;

    /* ── HTML page 3 — reserve planning (optional) ────────────────── */
    const rp = m.reservePlan;
    const page3 = rp ? `
<div class="page" style="page-break-before:always">
  <div class="header">
    <div>
      <div class="brand">Denison Yachting · Reserve Planning</div>
      <div class="vessel">${m.vesselName} — Long-Range Reserve Budget</div>
      <div class="sub">Suggested annual reserves for major future work · NOT included in the operating budget</div>
    </div>
    <div class="date">Generated ${today}</div>
  </div>
  <div style="background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:8px;padding:12px 16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#a78bfa;margin-bottom:3px">Reserve Plan Total — Mid Scenario</div>
      <div style="font-size:22px;font-weight:700;color:#a78bfa">${fmt(rp.total.mid)}/yr</div>
      <div style="font-size:11px;color:#64748b;margin-top:3px">Operating + Reserve combined: ${fmt(gt.mid + rp.total.mid)}/yr — this is closer to true ownership cost</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:10px;color:#64748b">Low / High range</div>
      <div style="font-size:13px;font-weight:600;color:#e2e8f0">${fmt(rp.total.low)} – ${fmt(rp.total.high)}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="color:#64748b;text-align:left">Reserve Category</th>
      ${show.low ?`<th style="color:#4ade80">Low</th>`:""}
      ${show.mid ?`<th style="color:#a78bfa">Mid</th>`:""}
      ${show.high?`<th style="color:#f87171">High</th>`:""}
    </tr></thead>
    <tbody>
      ${[
        ["Paint & Fairing (annualised)",  rp.paint,      "Full paint job cost ÷ cycle years. Luxury full-fairing: $450–$550/ft job on a 7-year cycle. Explorer: $100/ft on a 3-year cycle."],
        ["Teak Deck Maintenance",         rp.teak,       "Annual sanding, resealing, and gradual panel replacement. Luxury vessels with full teak decks spend $15,000–$40,000/yr to maintain appearance."],
        ["Engine Overhaul Reserve",       rp.engines,    "HP-based overhaul cost divided by typical interval hours × annual engine hours. Rebuilds at 13,000–17,000hrs cost $130,000–$560,000 per vessel."],
        ["Generators & Major Systems",    rp.generators, "Generator overhaul reserve plus HVAC compressor, watermaker membrane, and major system refits annualised."],
        ["Stabilizer Rebuild",            rp.stabilizers,"Fin rebuild and actuator service — typically needed every 8–12 years. More significant on vessels over 10 years old."],
        ["Electronics & Navigation",      rp.electronics,"Full bridge and nav refresh every 8 years — chartplotters, radar, AIS, autopilot, VHF, depth, and weather systems."],
        ["AV / IT Infrastructure",        rp.avIT,       "Entertainment systems refresh every 5 years — displays, speakers, streaming hardware, and network infrastructure."],
        ["Soft Goods & Interior",         rp.softGoods,  "Upholstery reupholstering, linen replacement, carpet, mattresses, and cabin soft goods on an 8-year refresh cycle."],
        ["Tenders & Water Toys",          rp.tenders,    "Tender and toy replacement reserve — rigid tenders last 7–10 years; PWC and inflatables shorter."],
        ["Class / Special Survey",        rp.classSurvey,"For classed vessels: 5-year special survey and 2.5-year intermediate costs annualised. Non-classed: insurance survey cycle."],
        ["Other / Contingency",           rp.other,      "Unplanned reserve for items not captured above — typically 2–4% of operating budget as a contingency allowance."],
      ].map(([l,s,d])=>row(l as string,s as Scenario,false,show,d as string)).join("")}
      <tr style="border-top:2px solid rgba(167,139,250,.4)">
        <td style="padding:10px 10px 10px 16px;font-size:13px;font-weight:700;color:#a78bfa">RESERVE PLAN TOTAL</td>
        ${show.low ?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#4ade80">${fmt(rp.total.low)}</td>`:""}
        ${show.mid ?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#a78bfa">${fmt(rp.total.mid)}</td>`:""}
        ${show.high?`<td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#f87171">${fmt(rp.total.high)}</td>`:""}
      </tr>
    </tbody>
  </table>
  <div style="margin-top:16px;padding:12px 14px;background:#161b22;border-radius:8px;border:1px solid #21262d;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:6px">Important Note on Reserve Planning</div>
    <div style="font-size:11px;color:#94a3b8;line-height:1.6">These figures are suggested annual reserves, not guaranteed costs. Actual amounts will depend on vessel-specific condition (a full pre-purchase survey is essential), actual engine hours, maintenance history, and owner quality standards. This reserve section is provided to give a realistic picture of long-term ownership economics — most ownership budgets omit it entirely, which is why vessel owners are routinely surprised by major expenditures.</div>
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>` : "";

    const css = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e2e8f0;font-family:'Helvetica Neue',Arial,sans-serif}
.page{padding:26px 32px;max-width:900px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #b8933a50}
.brand{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#b8933a;margin-bottom:4px}
.vessel{font-size:20px;font-weight:700;color:#f1f5f9}
.sub{font-size:11px;color:#64748b;margin-top:3px}
.date{font-size:11px;color:#64748b;text-align:right}
.scenarios{display:grid;gap:10px;margin-bottom:18px}
.sc-card{border-radius:8px;padding:11px 16px;text-align:center}
.sc-label{font-size:10px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px}
.sc-val{font-size:18px;font-weight:700}
.sc-sub{font-size:10px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:right;border-bottom:1px solid #b8933a40}
th:first-child{text-align:left;padding-left:16px}
.analysis{margin-top:14px}
.a-section{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:11px 13px;margin-bottom:9px}
.a-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b8933a;margin-bottom:5px}
.a-body{font-size:11px;color:#94a3b8;line-height:1.55;white-space:pre-wrap}
.footer{margin-top:16px;padding-top:10px;border-top:1px solid #21262d;font-size:10px;color:#475569;display:flex;justify-content:space-between}
`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${page1}${page2}${page3}</body></html>`;

    const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
    const pg = await browser.newPage();
    await pg.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await pg.pdf({ format: "A4", margin: {top:"0",bottom:"0",left:"0",right:"0"}, printBackground: true });
    await browser.close();

    const safeName = (m.vesselName || "ownership-budget").replace(/[^a-zA-Z0-9\s-]/g,"").replace(/\s+/g,"-").toLowerCase();
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-cost-model.pdf"`,
      },
    });
  } catch (err) {
    console.error("Ownership PDF error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "PDF generation failed" }, { status: 500 });
  }
}
