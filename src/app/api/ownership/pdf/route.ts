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

// Apply overrides and exclusions — mirrors getEff() from page.tsx
function eff(path: string, s: Scenario, overrides: Record<string,number>, excluded: string[]): Scenario {
  if (excluded.includes(path)) return {low:0,mid:0,high:0};
  return {
    low:  overrides[`${path}.low`]  ?? s.low,
    mid:  overrides[`${path}.mid`]  ?? s.mid,
    high: overrides[`${path}.high`] ?? s.high,
  };
}

// Row renderer — optional subtitle description
function row(label: string, s: Scenario, bold = false, show = {low:true,mid:true,high:true}, desc = ""): string {
  if (s.low === 0 && s.mid === 0 && s.high === 0 && !bold) return ""; // skip zero non-bold rows
  const style = bold
    ? `style="font-weight:700;background:#1a1a2e;border-top:1px solid #b8933a40;"`
    : `style="border-bottom:1px solid #ffffff08;"`;
  const labelEl = bold
    ? `<span style="color:#b8933a">${label}</span>`
    : `<div style="color:#cbd5e1">${label}</div>${desc ? `<div style="font-size:10px;color:#475569;margin-top:1px;line-height:1.4">${desc}</div>` : ""}`;
  return `<tr ${style}>
    <td style="padding:${bold?"7px":"5px"} 10px ${bold?"7px":"5px"} 16px;font-size:12px;">${labelEl}</td>
    ${show.low  ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#4ade80":"#e2e8f0"};vertical-align:top;">${bold?fmt(s.low):`<span style="color:#4ade80">${fmt(s.low)}</span>`}</td>` : ""}
    ${show.mid  ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#facc15":"#e2e8f0"};vertical-align:top;">${fmt(s.mid)}</td>` : ""}
    ${show.high ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#f87171":"#e2e8f0"};vertical-align:top;">${bold?fmt(s.high):`<span style="color:#f87171">${fmt(s.high)}</span>`}</td>` : ""}
  </tr>`;
}

function subrow(label: string, s: Scenario, show = {low:true,mid:true,high:true}): string {
  if (s.low === 0 && s.mid === 0 && s.high === 0) return "";
  return `<tr style="border-bottom:1px solid #ffffff05;">
    <td style="padding:3px 10px 3px 28px;font-size:11px;color:#64748b">↳ ${label}</td>
    ${show.low  ? `<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.low)}</td>` : ""}
    ${show.mid  ? `<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.mid)}</td>` : ""}
    ${show.high ? `<td style="padding:3px 8px;text-align:right;font-size:11px;color:#64748b">${fmt(s.high)}</td>` : ""}
  </tr>`;
}

function sectionHeader(label: string, show = {low:true,mid:true,high:true}): string {
  const span = 1+(show.low?1:0)+(show.mid?1:0)+(show.high?1:0);
  return `<tr><td colspan="${span}" style="padding:14px 10px 4px 16px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b8933a;border-top:1px solid #b8933a30;">${label}</td></tr>`;
}

function scale(s: Scenario, f: number): Scenario {
  return { low: Math.round(s.low*f), mid: Math.round(s.mid*f), high: Math.round(s.high*f) };
}

/* ─── Pie chart SVG ──────────────────────────────────────────────────────── */
const PIE_COLORS = ["#b8933a","#38bdf8","#34d399","#a78bfa","#fb923c","#06b6d4"];
const PIE_LABELS = ["Crew","Communications","Operations","Insurance","Administrative","Annual Haul-Out"];
const PIE_DESCS  = [
  "Salaries, food, recruitment, travel, uniforms, training, medical, day workers, and entertainment.",
  "Satellite broadband (Starlink/KVH/Inmarsat), satellite TV, and crew mobile phone plans.",
  "Routine engineering, fuel, dockage, galley provisioning, deck consumables, port agents, and all operational departments.",
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

    // ── Effective values (respects overrides + exclusions) ───────────────
    // Crew salaries — filter out excluded positions
    const crewBreakdown: {role:string;low:number;mid:number;high:number}[] = (m.crew.salaries.breakdown ?? [])
      .filter((r:{role:string}) => !excludedPaths.includes(`crew.salaries.${r.role}`))
      .map((r:{role:string;low:number;mid:number;high:number}) => ({
        role: r.role,
        ...e(`crew.salaries.${r.role}`, r),
      }));
    const crewSalTot = sectionTotal(crewBreakdown);

    const crewSupportRows: [string, Scenario, string][] = [
      ["Recruitment Fees",  e("crew.recruitment",   m.crew.recruitment),   "Placement agency fee — industry standard is 10–15% of first-year salary per hire. Crew turnover in professional yachting averages 18–24 months, making this a recurring cost, not a one-time event."],
      ["Travel",            e("crew.travel",        m.crew.travel),        "Crew rotation flights between vessel and home airports as the boat moves seasonally. Covers round-trips for vacation relief, delivery positioning, and captain travel for management meetings and training. An active vessel with seasonal movement (e.g., Florida → New England → Bahamas) can easily generate $3,000–$6,000 in airfare per crew member annually."],
      ["Accommodation",     e("crew.accommodation", m.crew.accommodation), "Shoreside hotel costs during shipyard haul-outs, extended port stays, or periods when crew cannot live aboard. At $180–$280/night per person, even a two-week yard period for a full crew is a significant expense."],
      ["Uniforms",          e("crew.uniforms",      m.crew.uniforms),      "Annual full kit per crew member: embroidered polo shirts, fleece, shorts, foul-weather jacket and trousers, deck shoes, and safety vest. High-use items require annual replacement to maintain a professional appearance."],
      ["Training & Cert.",  e("crew.training",      m.crew.training),      "STCW and flag-state certifications require renewal every 5 years, but annual refreshers are standard practice. Includes first aid, firefighting, sea survival, and role-specific qualifications (sommelier, food safety, dive certification). Budget $1,500–$4,000 per crew member per year."],
      ["Food & Beverages",  e("crew.foodBeverage",  m.crew.foodBeverage),  "All food and beverages consumed by the professional crew — separate from and in addition to owner/guest provisioning. Budgeted at $35–$65 per crew member per day, 365 days a year including port days. A 5-person crew eating well costs $65,000–$120,000 annually."],
      ["Medical Expenses",  e("crew.medical",       m.crew.medical),       "Annual medical and dental physicals (required by flag state for licensed officers), prescription costs, and vessel medical kit replenishment. Does not include emergency treatment — that is covered by crew health insurance."],
      ["Day Workers",       e("crew.dayWorkers",    m.crew.dayWorkers),    "Certified tradespeople hired for specific tasks the core crew cannot perform: electricians, refrigeration engineers, riggers, divers, canvas and upholstery specialists. Also covers certified delivery crew when the vessel is repositioned short-handed."],
      ["Entertainment",     e("crew.entertainment", m.crew.entertainment), "Crew morale and welfare — port excursions, crew dinners ashore, onboard events. Industry standard is $75–$150 per crew per month. Well-invested crew welfare is the most cost-effective way to reduce expensive turnover."],
    ];
    const crewSupportTot = sectionTotal(crewSupportRows.map(r=>r[1]));
    const crewT = sectionTotal([crewSalTot, crewSupportTot]);

    // Communications
    const commRows: [string, Scenario, string][] = [
      ["Phone & Cellular", e("communications.phone",  m.communications.phone),  "Captain and key crew mobile plans — local SIMs in home port plus international roaming allowances. Typically $80–$150/month per line. This is an essential operational cost; the captain must be reachable at all times."],
      ["Satellite TV",     e("communications.satTV",  m.communications.satTV),  "DirecTV, SKY, or equivalent regional satellite TV subscription plus marine dish service agreement. Crew welfare and owner/guest entertainment during passages and at anchor."],
      ["Satcom / Data",    e("communications.satcom", m.communications.satcom), "Primary vessel broadband — Starlink Maritime ($250–$500/month), KVH V7-HTS ($1,000–$3,000/month), or Inmarsat Fleet One. Includes weather routing data (PredictWind, Ocens), satellite phone airtime backup, and fleet tracking. Non-negotiable on any vessel operating offshore."],
    ];
    const commT = sectionTotal(commRows.map(r=>r[1]));

    // Operations — split Engineering into sub-lines
    const engFull = e("operations.engineering", m.operations.engineering);
    const engMech  = scale(engFull, 0.40); // engine servicing
    const engSys   = scale(engFull, 0.35); // systems (AC, watermaker, gen)
    const engDeck  = scale(engFull, 0.25); // deck machinery, hull

    const opRows: [string, Scenario, string, boolean][] = [
      ["Agency",                    e("operations.agency",       m.operations.agency),       "Port agent fees at each call — they handle customs clearance, fuel arrangements, dock reservations, local logistics, and clearance paperwork. A good agent saves more than they cost. Expect $500–$2,500 per port call depending on country and complexity.", false],
      ["Audio Visual",              e("operations.audioVisual",  m.operations.audioVisual),  "Annual maintenance of onboard entertainment — TV screens, outdoor speakers, streaming hardware, gaming consoles. Includes component replacement; marine environments are hard on consumer AV electronics.", false],
      ["Auto",                      e("operations.auto",         m.operations.auto),         "Vehicle running costs in home port. Many captains maintain or lease a car for provisioning runs, parts pickup, crew transport to airports, and owner/guest transfers. Saves significant time compared to rideshare logistics.", false],
      ["Bridge",                    e("operations.bridge",       m.operations.bridge),       "Navigation chart subscriptions (NOAA, C-MAP, Navionics), pilot books, tide tables, and safety publications. Also covers mandated safety item replacement: flares (3-year expiry), EPIRB hydrostatic release, and distress signal kits.", false],
      ["Computer / IT",             e("operations.computer",     m.operations.computer),     "Vessel computers, navigation software licenses, onboard network equipment (routers, switches), antivirus, and IT maintenance. Growing category as vessels integrate more connected systems.", false],
      ["Deck",                      e("operations.deck",         m.operations.deck),         "Running rigging, mooring lines, fenders, dock lines, shackles, blocks, teak maintenance products, polishing compounds, and deck hardware replacements. A high-consumption category on any actively used vessel — lines and fenders wear out quickly.", false],
      ["Dock Express / Shipping",   e("operations.dockExpress",  m.operations.dockExpress),  "Overnight courier and expedited freight forwarding. When a critical part fails in the Bahamas or a generator component is needed in Maine, overnight shipping at $200–$500 is far cheaper than the alternative. Not discretionary.", false],
      ["Engineering — Mech. Service",engMech,                                                "Annual main engine services (oil, filters, impellers, zincs, belts, hoses), transmission and gearbox service, running gear inspection, and propeller shaft seal checks. Frequency scales with engine hours — a vessel running 800 hrs/yr reaches service intervals much faster than one running 400.", false],
      ["Engineering — Systems",      engSys,                                                 "Air conditioning service and refrigerant recharges, watermaker membrane and UV lamp replacement, generator annual service, bow thruster seal and fluid service, and hydraulic steering checks. These systems require professional annual attention — deferred maintenance on any one of them typically means an emergency repair at sea.", false],
      ["Engineering — Deck & Hull",  engDeck,                                                "Structural inspections (critical on steel hulls), zinc sacrificial anode replacement every 6–12 months, cutlass bearing and shaft seal inspection, deck hardware lubrication, and minor cosmetic hull repairs. The hull is your primary asset — routine inspection preserves its value.", false],
      ["Fuels & Lubricants",        e("operations.fuels",        m.operations.fuels),        "Diesel for main engines and generator, petrol for tenders, and all lubricating oils and hydraulic fluid. Calculated using a physics-based formula: HP × load factor × hours. The single largest variable operating cost — fuel spend scales directly with engine hours underway and hull type.", false],
      ["Galley (Guest Provisions)", e("operations.galley",       m.operations.galley),       "All food, wines, spirits, and consumables served to the owner and guests — entirely separate from crew provisions (shown above). Provisioning spend is highly variable by lifestyle: a conservative owner and an active entertaining program can differ by 300% for the same vessel.", false],
      ["Interior",                  e("operations.interior",     m.operations.interior),     "Interior consumables and soft goods maintenance: cleaning products, throw pillow replacement, linen refresh, flower arrangements, cabin amenities, and small appliance replacement. On a luxury vessel this is a meaningful monthly line item.", false],
      ["Launches & Tenders",        e("operations.launches",     m.operations.launches),     "Tender running costs: petrol, engine oil, annual outboard or diesel service, tender insurance, and life jacket replacement. The tender on a superyacht is a working vehicle used multiple times daily — maintenance is often underbudgeted.", false],
      ["Mail & Freight",            e("operations.mailFreight",  m.operations.mailFreight),  "Vessel mail forwarding, registered courier for official documents (flag-state correspondence, insurance certificates), and standard freight for non-urgent parts and supplies.", false],
      ["Office",                    e("operations.office",       m.operations.office),       "Vessel stationery, official document printing (safety management manuals, crew contracts), stamps, USCG documentation annual renewal, state registration, and vessel log supplies.", false],
      ["Ports, Dockage & Customs",  e("operations.dockage",      m.operations.dockage),      "Home berth annual contract plus transient marina fees at every port call during the season. Includes port dues, pilotage where required, and customs overtime fees. Fort Lauderdale full-service berths run $40–$70/ft/month; northeast summer rates can reach $90–$120/ft. Transient stops add 25–40% above home-berth rates.", false],
      ["Safety & Medical",          e("operations.safetyMedical",m.operations.safetyMedical),"Annual EPIRB registration and battery/hydrostatic release service, flare kit replacement (expiry-based, every 3 years), fire extinguisher recharges, life raft inspection and repacking (every 3 years, ~$800–$1,500 per raft), first aid kit restocking, and safety drill materials. Flag-state compliance is non-negotiable.", false],
      ["Security",                  e("operations.security",     m.operations.security),     "Port security charges where applicable (some Caribbean and Mediterranean jurisdictions bill nightly), dockside watchman services during extended owner absence, and marina security monitoring. Varies significantly by operating region.", false],
      ["Survey & Certification",    e("operations.survey",       m.operations.survey),       "Annual USCG or flag-state vessel inspection, insurance-required hull and machinery survey, and biennial out-of-water survey. Each professional survey costs $2,000–$6,000 depending on scope. Required by the insurer and typically by the flag state — this is not discretionary.", false],
      ["Warehousing & Storage",     e("operations.warehousing",  m.operations.warehousing),  "Off-vessel storage of seasonal equipment, spare parts inventory, water toys, extra linens, and personal owner effects. Most professionally managed vessels maintain a shoreside storage unit near homeport — typically $300–$600/month.", false],
    ];
    const opT = sectionTotal(opRows.map(r=>r[1]));

    // Insurance
    const insRows: [string, Scenario, string][] = [
      ["Hull & Machinery",      e("insurance.hull",        m.insurance.hull),       "Physical damage coverage protecting the vessel itself — grounding, collision, fire, theft, and sinking. Premium is a percentage of the agreed hull value (the amount agreed with the insurer, typically at or near surveyed fair market value). Rates typically range 0.75–1.75% depending on age, use, and territory."],
      ["Protection & Indemnity",e("insurance.pi",          m.insurance.pi),         "Third-party liability coverage. Protects the owner against claims for bodily injury to guests or third parties, property damage, wreck removal obligations, and oil pollution liability. P&I is required by most marinas and is mandatory in international waters — it is not optional."],
      ["Crew Health Insurance", e("insurance.crewHealth",  m.insurance.crewHealth), "Annual medical, dental, and emergency repatriation coverage for all full-time professional crew. STCW regulations and most flag states require employers to provide adequate medical coverage — this is a compliance item, not a discretionary benefit."],
    ];
    const insT = sectionTotal(insRows.map(r=>r[1]));

    // Administrative
    const adminRows: [string, Scenario, string][] = [
      ["Professional Fees",  e("administrative.professionalFees", m.administrative.professionalFees), "Maritime attorneys for contract review and compliance, flag-state lawyers for vessel registration and ownership transfers, corporate structure maintenance (LLC or offshore entity), and yacht-specialist accountants for tax and depreciation strategy. These fees are higher than standard legal/accounting rates — maritime law is a specialist discipline."],
      ["Bank Charges",       e("administrative.bankCharges",      m.administrative.bankCharges),      "Operating account monthly fees, international wire transfer charges (significant for vessels buying fuel and paying crew overseas), and currency conversion fees. An active offshore vessel can generate dozens of international transfers annually."],
      ["Management Fee",     e("administrative.managementFee",    m.administrative.managementFee),    "Professional yacht management company fee — covers procurement, vendor management, crew HR, financial reporting, and regulatory compliance. Typically 5–8% of the operating budget. Not applied to this model unless specifically selected — shows $0 for owner-managed vessels."],
      ["Management Travel",  e("administrative.managementTravel", m.administrative.managementTravel), "Visits by the owner's representative or management company to the vessel — pre-purchase condition inspection, annual operational review, yard supervision during haul-out, and captain performance meetings. An investment that protects the owner's interests and accountability."],
    ];
    const adminT = sectionTotal(adminRows.map(r=>r[1]));

    // Haul-out & Antifoul (separate annual section)
    const haulAntifoul = e("capital.haulAntifoul", m.capital.haulAntifoul ?? {low:0,mid:0,high:0});

    // Grand total
    const gt = sectionTotal([crewT, commT, opT, insT, adminT, haulAntifoul]);
    const pieVals = [crewT.mid, commT.mid, opT.mid, insT.mid, adminT.mid, haulAntifoul.mid];
    const pieSvg  = buildDonutSvg(pieVals, gt.mid);

    const today = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
    const scols = (show.low?1:0)+(show.mid?1:0)+(show.high?1:0);

    // ── HTML page 1 — table ──────────────────────────────────────────────
    const page1 = `
<div class="page">
  <div class="header">
    <div>
      <div class="brand">Denison Yachting · Annual Ownership Cost Analysis</div>
      <div class="vessel">${m.vesselName}</div>
      <div class="sub">Prepared by YotCRM · All figures in USD</div>
    </div>
    <div class="date">Generated ${today}</div>
  </div>
  <div class="scenarios" style="grid-template-columns:repeat(${scols},1fr)">
    ${show.low  ? `<div class="sc-card" style="background:#0d2818;border:1px solid #4ade8040"><div class="sc-label" style="color:#4ade80">LOW SCENARIO</div><div class="sc-val" style="color:#4ade80">${fmt(gt.low)}</div><div class="sc-sub">per year</div></div>` : ""}
    ${show.mid  ? `<div class="sc-card" style="background:#2a2000;border:1px solid #facc1540"><div class="sc-label" style="color:#facc15">MID SCENARIO</div><div class="sc-val" style="color:#facc15">${fmt(gt.mid)}</div><div class="sc-sub">per year</div></div>` : ""}
    ${show.high ? `<div class="sc-card" style="background:#2a0a0a;border:1px solid #f8717140"><div class="sc-label" style="color:#f87171">HIGH SCENARIO</div><div class="sc-val" style="color:#f87171">${fmt(gt.high)}</div><div class="sc-sub">per year</div></div>` : ""}
  </div>
  <table>
    <thead><tr>
      <th style="color:#64748b;text-align:left">Category</th>
      ${show.low?`<th style="color:#4ade80">Low</th>`:""}
      ${show.mid?`<th style="color:#facc15">Mid</th>`:""}
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
      ${opRows.map(([l,s,d,b])=>row(l,s,b,show,d)).join("")}
      ${row("TOTAL OPERATIONS",opT,true,show)}

      ${sectionHeader("INSURANCE",show)}
      ${insRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL INSURANCE",insT,true,show)}

      ${sectionHeader("ADMINISTRATIVE",show)}
      ${adminRows.map(([l,s,d])=>row(l,s,false,show,d)).join("")}
      ${row("TOTAL ADMINISTRATIVE",adminT,true,show)}

      ${haulAntifoul.mid > 0 ? `
      ${sectionHeader("ANNUAL HAUL-OUT & ANTIFOUL",show)}
      ${row("Haul-out, Antifoul & Bottom Work",haulAntifoul,false,show,"Annual (or biennial in cold water) lift-out, pressure wash, and haulage fee; complete bottom paint removal and antifouling reapplication; full zinc anode replacement throughout hull, shaft, and rudder; propeller polish and inspection; and seacock service. In warm Gulf Stream waters, annual haul-out is standard — saltwater, UV, and marine growth make this a true annual cost, not optional maintenance.")}
      ${row("TOTAL HAUL-OUT",haulAntifoul,true,show)}
      ` : ""}

      <tr style="border-top:2px solid #b8933a60">
        <td style="padding:10px 10px 10px 16px;font-size:14px;font-weight:700;color:#b8933a">GRAND TOTAL</td>
        ${show.low?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#4ade80">${fmt(gt.low)}</td>`:""}
        ${show.mid?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#facc15">${fmt(gt.mid)}</td>`:""}
        ${show.high?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#f87171">${fmt(gt.high)}</td>`:""}
      </tr>
    </tbody>
  </table>

  ${m.capitalEvents?.disclaimer ? `
  <div style="margin:12px 0;padding:12px 14px;background:rgba(251,146,60,.07);border:1px solid rgba(251,146,60,.25);border-radius:8px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#fb923c;margin-bottom:5px">Capital Events — Excluded from Annual Figure</div>
    <div style="font-size:11px;color:#94a3b8;line-height:1.55">${m.capitalEvents.disclaimer}</div>
  </div>
  ` : ""}

  <div class="analysis">
    ${[["Use Assumptions",m.assumptions],["Cost Range Explanation",m.rangeExplanation],["Category Breakdown",m.categoryBreakdown],["Crew Structure Note",m.crewStructureNote],["Key Cost Drivers",m.keyDrivers]].map(([t,c])=>`<div class="a-section"><div class="a-title">${t}</div><div class="a-body">${String(c).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div></div>`).join("")}
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>`;

    // ── HTML page 2 — pie chart ──────────────────────────────────────────
    const legendRows = PIE_LABELS.map((cat, i) => `
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
      <div class="brand">Denison Yachting · Annual Ownership Cost Analysis</div>
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

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
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
</style></head><body>${page1}${page2}</body></html>`;

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
