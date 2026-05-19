import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
export const maxDuration = 60;

type Scenario = { low: number; mid: number; high: number };

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
function pct(n: number, total: number) { return total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "0%"; }

function sectionTotal(items: Scenario[]): Scenario {
  return { low: items.reduce((a,b)=>a+b.low,0), mid: items.reduce((a,b)=>a+b.mid,0), high: items.reduce((a,b)=>a+b.high,0) };
}

function row(label: string, s: Scenario, bold = false, show = {low:true,mid:true,high:true}): string {
  const style = bold ? `style="font-weight:700;background:#1a1a2e;border-top:1px solid #b8933a40;"` : `style="border-bottom:1px solid #ffffff08;"`;
  const lbl = bold ? `<span style="color:#b8933a">${label}</span>` : `<span style="color:#94a3b8">${label}</span>`;
  return `<tr ${style}>
    <td style="padding:5px 10px 5px 16px;font-size:12px;">${lbl}</td>
    ${show.low  ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#4ade80":"#e2e8f0"};">${fmt(s.low)}</td>` : ""}
    ${show.mid  ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#facc15":"#e2e8f0"};">${fmt(s.mid)}</td>` : ""}
    ${show.high ? `<td style="padding:5px 8px;text-align:right;font-size:12px;color:${bold?"#f87171":"#e2e8f0"};">${fmt(s.high)}</td>` : ""}
  </tr>`;
}

function sectionHeader(label: string, show = {low:true,mid:true,high:true}): string {
  const span = 1+(show.low?1:0)+(show.mid?1:0)+(show.high?1:0);
  return `<tr><td colspan="${span}" style="padding:14px 10px 4px 16px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#b8933a;border-top:1px solid #b8933a30;">${label}</td></tr>`;
}

/* ─── Pie chart SVG builder (server-side, no React) ─────────────────────── */
const PIE_COLORS = ["#b8933a","#38bdf8","#34d399","#a78bfa","#fb923c","#f472b6"];
const PIE_LABELS = ["Crew","Communications","Operations","Insurance","Administrative","Capital Improvements"];
const PIE_DESCS  = [
  "Salaries, crew food, recruitment, travel, uniforms, training, medical, day workers, and entertainment.",
  "Satellite broadband (Starlink/KVH/Inmarsat), satellite TV, and mobile phone plans for captain and crew.",
  "Routine engineering, fuel, dockage, galley provisioning, deck consumables, port agents, and all operational departments.",
  "Hull & Machinery (physical damage), Protection & Indemnity (liability), and crew health insurance.",
  "Professional/legal fees, flag-state costs, management company charges, banking, and owner/manager travel.",
  "Annualised reserves for paint cycle, engine overhauls, electronics upgrades, interior refresh, and tender replacement.",
];

function buildDonutSvg(values: number[], total: number): string {
  const cx = 250, cy = 250, outerR = 200, innerR = 115;
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

  let paths = "";
  let labelLines = "";
  let cur = 0;

  values.forEach((v, i) => {
    if (v === 0) { cur += 0; return; }
    const startDeg = cur;
    const sweep = (v / total) * 360;
    const endDeg = cur + sweep;
    cur = endDeg;

    const s = toRad(startDeg), e = toRad(endDeg);
    const large = sweep > 180 ? 1 : 0;
    const x1 = (cx + outerR * Math.cos(s)).toFixed(2);
    const y1 = (cy + outerR * Math.sin(s)).toFixed(2);
    const x2 = (cx + outerR * Math.cos(e)).toFixed(2);
    const y2 = (cy + outerR * Math.sin(e)).toFixed(2);
    const x3 = (cx + innerR * Math.cos(e)).toFixed(2);
    const y3 = (cy + innerR * Math.sin(e)).toFixed(2);
    const x4 = (cx + innerR * Math.cos(s)).toFixed(2);
    const y4 = (cy + innerR * Math.sin(s)).toFixed(2);

    const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4} Z`;
    paths += `<path d="${d}" fill="${PIE_COLORS[i]}" stroke="#0d1117" stroke-width="2" opacity="0.92"/>`;

    // percentage label on slice (only if slice >= 5%)
    if (sweep >= 18) {
      const midDeg = startDeg + sweep / 2;
      const midRad = toRad(midDeg);
      const lr = (outerR + innerR) / 2;
      const lx = (cx + lr * Math.cos(midRad)).toFixed(2);
      const ly = (cy + lr * Math.sin(midRad)).toFixed(2);
      labelLines += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#0d1117" font-family="Arial,sans-serif">${((v/total)*100).toFixed(0)}%</text>`;
    }
  });

  return `<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" width="340" height="340">
    ${paths}
    ${labelLines}
    <text x="${cx}" y="${cy-20}" text-anchor="middle" font-size="13" fill="#64748b" font-family="Arial,sans-serif">ANNUAL TOTAL</text>
    <text x="${cx}" y="${cy+10}" text-anchor="middle" font-size="22" font-weight="700" fill="#facc15" font-family="Arial,sans-serif">${fmt(total)}</text>
    <text x="${cx}" y="${cy+34}" text-anchor="middle" font-size="12" fill="#64748b" font-family="Arial,sans-serif">per year</text>
  </svg>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: NextRequest) {
  try {
    const { model, scenarios } = await req.json();
    if (!model) return NextResponse.json({ ok: false, error: "model required" }, { status: 400 });
    const show = { low: true, mid: true, high: true, ...scenarios };
    const m = model;

    const crewItems: Scenario[] = [m.crew.salaries,m.crew.recruitment,m.crew.travel,m.crew.accommodation,m.crew.uniforms,m.crew.training,m.crew.foodBeverage,m.crew.medical,m.crew.dayWorkers,m.crew.entertainment];
    const commItems: Scenario[] = [m.communications.phone,m.communications.satTV,m.communications.satcom];
    const opItems: Scenario[]   = [m.operations.agency,m.operations.audioVisual,m.operations.auto,m.operations.bridge,m.operations.computer,m.operations.deck,m.operations.dockExpress,m.operations.engineering,m.operations.fuels,m.operations.galley,m.operations.interior,m.operations.launches,m.operations.mailFreight,m.operations.office,m.operations.dockage,m.operations.safetyMedical,m.operations.security,m.operations.survey,m.operations.warehousing];
    const insItems: Scenario[]  = [m.insurance.hull,m.insurance.pi,m.insurance.crewHealth];
    const adminItems: Scenario[]= [m.administrative.professionalFees,m.administrative.bankCharges,m.administrative.managementFee,m.administrative.managementTravel];
    const capItems: Scenario[]  = [m.capital.av,m.capital.engineeringDeck,m.capital.interior,m.capital.paint,m.capital.tendersToys,m.capital.other];

    const crewT  = sectionTotal(crewItems);
    const commT  = sectionTotal(commItems);
    const opT    = sectionTotal(opItems);
    const insT   = sectionTotal(insItems);
    const adminT = sectionTotal(adminItems);
    const capT   = sectionTotal(capItems);
    const gt     = sectionTotal([crewT,commT,opT,insT,adminT,capT]);

    // Pie values (mid scenario)
    const pieVals = [crewT.mid,commT.mid,opT.mid,insT.mid,adminT.mid,capT.mid];
    const pieSvg  = buildDonutSvg(pieVals, gt.mid);

    const today = new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" });
    const scols = (show.low?1:0)+(show.mid?1:0)+(show.high?1:0);

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
      ${m.crew.salaries.breakdown?.map((r:{role:string;low:number;mid:number;high:number})=>row(`  ${r.role}`,r,false,show)).join("")??""}
      ${row("Recruitment Fees",m.crew.recruitment,false,show)}${row("Travel",m.crew.travel,false,show)}${row("Accommodation",m.crew.accommodation,false,show)}${row("Uniforms",m.crew.uniforms,false,show)}${row("Training & Certification",m.crew.training,false,show)}${row("Food & Beverages",m.crew.foodBeverage,false,show)}${row("Medical Expenses",m.crew.medical,false,show)}${row("Day Workers & Delivery Crew",m.crew.dayWorkers,false,show)}${row("Entertainment",m.crew.entertainment,false,show)}
      ${row("TOTAL CREW",crewT,true,show)}
      ${sectionHeader("COMMUNICATIONS",show)}${row("Phone & Cellular",m.communications.phone,false,show)}${row("Sat TV",m.communications.satTV,false,show)}${row("Satcom / Data",m.communications.satcom,false,show)}${row("TOTAL COMMUNICATIONS",commT,true,show)}
      ${sectionHeader("OPERATIONS",show)}${row("Agency",m.operations.agency,false,show)}${row("Audio Visual",m.operations.audioVisual,false,show)}${row("Auto",m.operations.auto,false,show)}${row("Bridge",m.operations.bridge,false,show)}${row("Computer",m.operations.computer,false,show)}${row("Deck",m.operations.deck,false,show)}${row("Dock Express / Shipping",m.operations.dockExpress,false,show)}${row("Engineering",m.operations.engineering,false,show)}${row("Fuels & Lubricants",m.operations.fuels,false,show)}${row("Galley",m.operations.galley,false,show)}${row("Interior",m.operations.interior,false,show)}${row("Launches & Tenders",m.operations.launches,false,show)}${row("Mail & Freight",m.operations.mailFreight,false,show)}${row("Office",m.operations.office,false,show)}${row("Ports, Dockage & Customs",m.operations.dockage,false,show)}${row("Safety & Medical",m.operations.safetyMedical,false,show)}${row("Security",m.operations.security,false,show)}${row("Survey & Certification",m.operations.survey,false,show)}${row("Warehousing & Storage",m.operations.warehousing,false,show)}
      ${row("TOTAL OPERATIONS",opT,true,show)}
      ${sectionHeader("INSURANCE",show)}${row("Hull & Machinery",m.insurance.hull,false,show)}${row("Protection & Indemnity",m.insurance.pi,false,show)}${row("Crew Health Insurance",m.insurance.crewHealth,false,show)}${row("TOTAL INSURANCE",insT,true,show)}
      ${sectionHeader("ADMINISTRATIVE",show)}${row("Professional Fees",m.administrative.professionalFees,false,show)}${row("Bank Charges",m.administrative.bankCharges,false,show)}${row("Management Fee",m.administrative.managementFee,false,show)}${row("Management Travel",m.administrative.managementTravel,false,show)}${row("TOTAL ADMINISTRATIVE",adminT,true,show)}
      ${sectionHeader("CAPITAL IMPROVEMENTS",show)}${row("AV",m.capital.av,false,show)}${row("Engineering / Deck",m.capital.engineeringDeck,false,show)}${row("Interior",m.capital.interior,false,show)}${row("Paint",m.capital.paint,false,show)}${row("Tenders / Toys",m.capital.tendersToys,false,show)}${row("Other",m.capital.other,false,show)}${row("TOTAL CAPITAL",capT,true,show)}
      <tr style="border-top:2px solid #b8933a60">
        <td style="padding:10px 10px 10px 16px;font-size:14px;font-weight:700;color:#b8933a">GRAND TOTAL</td>
        ${show.low?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#4ade80">${fmt(gt.low)}</td>`:""}
        ${show.mid?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#facc15">${fmt(gt.mid)}</td>`:""}
        ${show.high?`<td style="padding:10px 8px;text-align:right;font-size:14px;font-weight:700;color:#f87171">${fmt(gt.high)}</td>`:""}
      </tr>
    </tbody>
  </table>
  <div class="analysis">
    ${[["Use Assumptions",m.assumptions],["Cost Range Explanation",m.rangeExplanation],["Category Breakdown",m.categoryBreakdown],["Crew Structure Note",m.crewStructureNote],["Key Cost Drivers",m.keyDrivers]].map(([t,c])=>`<div class="a-section"><div class="a-title">${t}</div><div class="a-body">${String(c).replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div></div>`).join("")}
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>`;

    /* ── PAGE 2 — Pie chart ─────────────────────────────────────────────── */
    const legendRows = PIE_LABELS.map((cat, i) => `
      <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:8px;background:#161b22;border:1px solid ${PIE_COLORS[i]}30;margin-bottom:10px">
        <div style="width:13px;height:13px;border-radius:3px;background:${PIE_COLORS[i]};flex-shrink:0;margin-top:2px"></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
            <span style="font-size:12px;font-weight:700;color:${PIE_COLORS[i]}">${cat}</span>
            <span style="font-size:13px;font-weight:700;color:#e2e8f0">${fmt(pieVals[i])} <span style="font-size:10px;color:#64748b">(${pct(pieVals[i],gt.mid)})</span></span>
          </div>
          <p style="font-size:11px;color:#64748b;line-height:1.6">${PIE_DESCS[i]}</p>
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
  <div style="display:flex;gap:32px;align-items:flex-start;margin-bottom:28px">
    <div style="flex-shrink:0">${pieSvg}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start">
      ${PIE_LABELS.map((cat, i) => `
        <div style="background:#161b22;border:1px solid ${PIE_COLORS[i]}40;border-radius:8px;padding:11px 13px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="width:10px;height:10px;border-radius:2px;background:${PIE_COLORS[i]}"></div>
            <span style="font-size:11px;font-weight:700;color:${PIE_COLORS[i]}">${cat}</span>
          </div>
          <div style="font-size:15px;font-weight:700;color:#f1f5f9">${fmt(pieVals[i])}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">${pct(pieVals[i],gt.mid)} of total</div>
        </div>`).join("")}
    </div>
  </div>
  <div style="border-top:1px solid #21262d;padding-top:20px">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b8933a;margin-bottom:14px">Category Descriptions</div>
    ${legendRows}
  </div>
  <div class="footer"><span>YotCRM · Denison Yachting · Confidential</span><span>${m.vesselUrl}</span></div>
</div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e2e8f0;font-family:'Helvetica Neue',Arial,sans-serif}
.page{padding:28px 34px;max-width:900px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;padding-bottom:14px;border-bottom:1px solid #b8933a50}
.brand{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#b8933a;margin-bottom:5px}
.vessel{font-size:20px;font-weight:700;color:#f1f5f9}
.sub{font-size:11px;color:#64748b;margin-top:3px}
.date{font-size:11px;color:#64748b;text-align:right}
.scenarios{display:grid;gap:10px;margin-bottom:22px}
.sc-card{border-radius:8px;padding:12px 16px;text-align:center}
.sc-label{font-size:10px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:3px}
.sc-val{font-size:18px;font-weight:700}
.sc-sub{font-size:10px;color:#64748b;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;text-align:right;border-bottom:1px solid #b8933a40}
th:first-child{text-align:left;padding-left:16px}
.analysis{margin-top:16px}
.a-section{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:12px 14px;margin-bottom:10px}
.a-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#b8933a;margin-bottom:6px}
.a-body{font-size:11px;color:#94a3b8;line-height:1.6;white-space:pre-wrap}
.footer{margin-top:20px;padding-top:12px;border-top:1px solid #21262d;font-size:10px;color:#475569;display:flex;justify-content:space-between}
</style></head><body>
${page1}
${page2}
</body></html>`;

    const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
    const pg = await browser.newPage();
    await pg.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await pg.pdf({ format: "A4", margin: {top:"0",bottom:"0",left:"0",right:"0"}, printBackground: true });
    await browser.close();

    const safeName = (m.vesselName || "ownership-budget").replace(/[^a-zA-Z0-9\s-]/g,"").replace(/\s+/g,"-").toLowerCase();
    return new NextResponse(pdf, {
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
