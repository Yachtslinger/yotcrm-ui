import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
export const maxDuration = 60;

type Scenario = { low: number; mid: number; high: number };

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function sectionTotal(items: Scenario[]): Scenario {
  return {
    low: items.reduce((a, b) => a + b.low, 0),
    mid: items.reduce((a, b) => a + b.mid, 0),
    high: items.reduce((a, b) => a + b.high, 0),
  };
}

function row(label: string, s: Scenario, bold = false, show = { low: true, mid: true, high: true }): string {
  const style = bold
    ? `style="font-weight:700; background:#1a1a2e; border-top:1px solid #b8933a40;"`
    : `style="border-bottom:1px solid #ffffff08;"`;
  const lc = bold ? "#4ade80" : "#e2e8f0";
  const mc = bold ? "#facc15" : "#e2e8f0";
  const hc = bold ? "#f87171" : "#e2e8f0";
  const lbl = bold ? `<span style="color:#b8933a">${label}</span>` : `<span style="color:#94a3b8">${label}</span>`;
  return `<tr ${style}>
    <td style="padding:5px 10px 5px 16px; font-size:12px;">${lbl}</td>
    ${show.low  ? `<td style="padding:5px 8px; text-align:right; font-size:12px; color:${lc};">${fmt(s.low)}</td>` : ""}
    ${show.mid  ? `<td style="padding:5px 8px; text-align:right; font-size:12px; color:${mc};">${fmt(s.mid)}</td>` : ""}
    ${show.high ? `<td style="padding:5px 8px; text-align:right; font-size:12px; color:${hc};">${fmt(s.high)}</td>` : ""}
  </tr>`;
}

function sectionHeader(label: string, show = { low: true, mid: true, high: true }): string {
  const span = 1 + (show.low ? 1 : 0) + (show.mid ? 1 : 0) + (show.high ? 1 : 0);
  return `<tr>
    <td colspan="${span}" style="padding:14px 10px 4px 16px; font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#b8933a; border-top:1px solid #b8933a30;">${label}</td>
  </tr>`;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function POST(req: NextRequest) {
  try {
    const { model, scenarios } = await req.json();
    if (!model) return NextResponse.json({ ok: false, error: "model required" }, { status: 400 });
    const show = { low: true, mid: true, high: true, ...scenarios };

    const m = model;
    const crewItems: Scenario[] = [m.crew.salaries, m.crew.recruitment, m.crew.travel, m.crew.accommodation, m.crew.uniforms, m.crew.training, m.crew.foodBeverage, m.crew.medical, m.crew.dayWorkers, m.crew.entertainment];
    const commItems: Scenario[] = [m.communications.phone, m.communications.satTV, m.communications.satcom];
    const opItems: Scenario[] = [m.operations.agency, m.operations.audioVisual, m.operations.auto, m.operations.bridge, m.operations.computer, m.operations.deck, m.operations.dockExpress, m.operations.engineering, m.operations.fuels, m.operations.galley, m.operations.interior, m.operations.launches, m.operations.mailFreight, m.operations.office, m.operations.dockage, m.operations.safetyMedical, m.operations.security, m.operations.survey, m.operations.warehousing];
    const insItems: Scenario[] = [m.insurance.hull, m.insurance.pi, m.insurance.crewHealth];
    const adminItems: Scenario[] = [m.administrative.professionalFees, m.administrative.bankCharges, m.administrative.managementFee, m.administrative.managementTravel];
    const capItems: Scenario[] = [m.capital.av, m.capital.engineeringDeck, m.capital.interior, m.capital.paint, m.capital.tendersToys, m.capital.other];

    const crewT = sectionTotal(crewItems);
    const commT = sectionTotal(commItems);
    const opT = sectionTotal(opItems);
    const insT = sectionTotal(insItems);
    const adminT = sectionTotal(adminItems);
    const capT = sectionTotal(capItems);
    const gt = sectionTotal([crewT, commT, opT, insT, adminT, capT]);

    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e2e8f0; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .page { padding: 32px 36px; max-width: 900px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 1px solid #b8933a50; }
  .brand { font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #b8933a; margin-bottom: 6px; }
  .vessel { font-size: 22px; font-weight: 700; color: #f1f5f9; }
  .sub { font-size: 12px; color: #64748b; margin-top: 3px; }
  .date { font-size: 11px; color: #64748b; text-align: right; }
  .scenarios { display: grid; grid-template-columns: repeat(${(show.low?1:0)+(show.mid?1:0)+(show.high?1:0)}, 1fr); gap: 12px; margin-bottom: 28px; }
  .sc-card { border-radius: 8px; padding: 14px 16px; text-align: center; }
  .sc-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; }
  .sc-val { font-size: 20px; font-weight: 700; }
  .sc-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { padding: 7px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: right; border-bottom: 1px solid #b8933a40; }
  th:first-child { text-align: left; padding-left: 16px; }
  .analysis { margin-top: 20px; }
  .a-section { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; }
  .a-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #b8933a; margin-bottom: 8px; }
  .a-body { font-size: 11.5px; color: #94a3b8; line-height: 1.65; white-space: pre-wrap; }
  .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #21262d; font-size: 10px; color: #475569; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand">Denison Yachting · Annual Ownership Cost Analysis</div>
      <div class="vessel">${m.vesselName}</div>
      <div class="sub">Prepared by YotCRM · All figures in USD</div>
    </div>
    <div class="date">Generated ${today}</div>
  </div>

  <div class="scenarios">
    ${show.low  ? `<div class="sc-card" style="background:#0d2818; border:1px solid #4ade8040;"><div class="sc-label" style="color:#4ade80;">LOW SCENARIO</div><div class="sc-val" style="color:#4ade80;">${fmt(gt.low)}</div><div class="sc-sub">per year</div></div>` : ""}
    ${show.mid  ? `<div class="sc-card" style="background:#2a2000; border:1px solid #facc1540;"><div class="sc-label" style="color:#facc15;">MID SCENARIO</div><div class="sc-val" style="color:#facc15;">${fmt(gt.mid)}</div><div class="sc-sub">per year</div></div>` : ""}
    ${show.high ? `<div class="sc-card" style="background:#2a0a0a; border:1px solid #f8717140;"><div class="sc-label" style="color:#f87171;">HIGH SCENARIO</div><div class="sc-val" style="color:#f87171;">${fmt(gt.high)}</div><div class="sc-sub">per year</div></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th style="color:#64748b; text-align:left;">Category</th>
        ${show.low  ? `<th style="color:#4ade80;">Low</th>` : ""}
        ${show.mid  ? `<th style="color:#facc15;">Mid</th>` : ""}
        ${show.high ? `<th style="color:#f87171;">High</th>` : ""}
      </tr>
    </thead>
    <tbody>
      ${sectionHeader("CREW", show)}
      ${m.crew.salaries.breakdown?.map((r: {role:string;low:number;mid:number;high:number}) => row(`  ${r.role}`, r, false, show)).join("") ?? ""}
      ${row("Recruitment Fees", m.crew.recruitment, false, show)}
      ${row("Travel", m.crew.travel, false, show)}
      ${row("Accommodation", m.crew.accommodation, false, show)}
      ${row("Uniforms", m.crew.uniforms, false, show)}
      ${row("Training & Certification", m.crew.training, false, show)}
      ${row("Food & Beverages", m.crew.foodBeverage, false, show)}
      ${row("Medical Expenses", m.crew.medical, false, show)}
      ${row("Day Workers & Delivery Crew", m.crew.dayWorkers, false, show)}
      ${row("Entertainment", m.crew.entertainment, false, show)}
      ${row("TOTAL CREW", crewT, true, show)}

      ${sectionHeader("COMMUNICATIONS", show)}
      ${row("Phone & Cellular", m.communications.phone, false, show)}
      ${row("Sat TV", m.communications.satTV, false, show)}
      ${row("Satcom / Data", m.communications.satcom, false, show)}
      ${row("TOTAL COMMUNICATIONS", commT, true, show)}

      ${sectionHeader("OPERATIONS", show)}
      ${row("Agency", m.operations.agency, false, show)}
      ${row("Audio Visual", m.operations.audioVisual, false, show)}
      ${row("Auto", m.operations.auto, false, show)}
      ${row("Bridge", m.operations.bridge, false, show)}
      ${row("Computer", m.operations.computer, false, show)}
      ${row("Deck", m.operations.deck, false, show)}
      ${row("Dock Express / Shipping", m.operations.dockExpress, false, show)}
      ${row("Engineering", m.operations.engineering, false, show)}
      ${row("Fuels & Lubricants", m.operations.fuels, false, show)}
      ${row("Galley", m.operations.galley, false, show)}
      ${row("Interior", m.operations.interior, false, show)}
      ${row("Launches & Tenders", m.operations.launches, false, show)}
      ${row("Mail & Freight", m.operations.mailFreight, false, show)}
      ${row("Office", m.operations.office, false, show)}
      ${row("Ports, Dockage & Customs", m.operations.dockage, false, show)}
      ${row("Safety & Medical", m.operations.safetyMedical, false, show)}
      ${row("Security", m.operations.security, false, show)}
      ${row("Survey & Certification", m.operations.survey, false, show)}
      ${row("Warehousing & Storage", m.operations.warehousing, false, show)}
      ${row("TOTAL OPERATIONS", opT, true, show)}

      ${sectionHeader("INSURANCE", show)}
      ${row("Hull & Machinery", m.insurance.hull, false, show)}
      ${row("Protection & Indemnity", m.insurance.pi, false, show)}
      ${row("Crew Health Insurance", m.insurance.crewHealth, false, show)}
      ${row("TOTAL INSURANCE", insT, true, show)}

      ${sectionHeader("ADMINISTRATIVE", show)}
      ${row("Professional Fees", m.administrative.professionalFees, false, show)}
      ${row("Bank Charges", m.administrative.bankCharges, false, show)}
      ${row("Management Fee", m.administrative.managementFee, false, show)}
      ${row("Management Travel", m.administrative.managementTravel, false, show)}
      ${row("TOTAL ADMINISTRATIVE", adminT, true, show)}

      ${sectionHeader("CAPITAL IMPROVEMENTS", show)}
      ${row("AV", m.capital.av, false, show)}
      ${row("Engineering / Deck", m.capital.engineeringDeck, false, show)}
      ${row("Interior", m.capital.interior, false, show)}
      ${row("Paint", m.capital.paint, false, show)}
      ${row("Tenders / Toys", m.capital.tendersToys, false, show)}
      ${row("Other", m.capital.other, false, show)}
      ${row("TOTAL CAPITAL", capT, true, show)}

      <tr style="border-top:2px solid #b8933a60;">
        <td style="padding:10px 10px 10px 16px; font-size:14px; font-weight:700; color:#b8933a;">GRAND TOTAL</td>
        ${show.low  ? `<td style="padding:10px 8px; text-align:right; font-size:14px; font-weight:700; color:#4ade80;">${fmt(gt.low)}</td>` : ""}
        ${show.mid  ? `<td style="padding:10px 8px; text-align:right; font-size:14px; font-weight:700; color:#facc15;">${fmt(gt.mid)}</td>` : ""}
        ${show.high ? `<td style="padding:10px 8px; text-align:right; font-size:14px; font-weight:700; color:#f87171;">${fmt(gt.high)}</td>` : ""}
      </tr>
    </tbody>
  </table>

  <div class="analysis">
    ${[["Use Assumptions", m.assumptions], ["Cost Range Explanation", m.rangeExplanation], ["Category Breakdown", m.categoryBreakdown], ["Crew Structure Note", m.crewStructureNote], ["Key Cost Drivers", m.keyDrivers]].map(([t, c]) => `
    <div class="a-section">
      <div class="a-title">${t}</div>
      <div class="a-body">${String(c).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    </div>`).join("")}
  </div>

  <div class="footer">
    <span>YotCRM · Denison Yachting · Confidential</span>
    <span>${m.vesselUrl}</span>
  </div>
</div>
</body></html>`;

    const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", margin: { top: "0", bottom: "0", left: "0", right: "0" }, printBackground: true });
    await browser.close();

    const safeName = (m.vesselName || "ownership-budget").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
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
