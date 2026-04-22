import type { CompRecord, MarketAnalysis } from "./storage";

function fmt(n: number | null | undefined): string {
  if (!n) return "—";
  return "$" + n.toLocaleString("en-US");
}
function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a,b)=>a+b,0)/nums.length) : 0;
}

export function generateMarketReport(ma: MarketAnalysis, pdfMode = false): string {
  const a = ma.analysis_json as Record<string, unknown>;
  const pricing = (a.pricingAnalysis as Record<string,unknown>) || {};
  const dom = (a.daysOnMarketForecast as Record<string,unknown>) || {};
  const mktg = (a.marketingStrategy as Record<string,unknown>) || {};
  const timeline = (mktg.timeline as {week:string;action:string}[]) || [];
  const diffs = (mktg.keyDifferentiators as string[]) || [];
  const channels = (mktg.channels as string[]) || [];
  const sc = ma.sold_comps || [];
  const ac = ma.active_comps || [];
  const bs = ma.broad_sold || [];
  const ba = ma.broad_active || [];
  const avgSold = avg(sc.map(c=>c.soldPrice).filter(Boolean) as number[]);
  const avgList = avg(sc.map(c=>c.listedPrice).filter(Boolean) as number[]);
  const avgDom  = avg(sc.map(c=>c.daysOnMarket).filter(v=>v!=null&&v>0) as number[]);
  const avgAsk  = avg(ac.map(c=>c.askPrice??c.listedPrice).filter(Boolean) as number[]);
  const ratio   = avgList&&avgSold ? Math.round((avgSold/avgList)*100) : 0;
  const sColor  = pricing.priceStrategy==="aggressive"?"#22c55e":pricing.priceStrategy==="aspirational"?"#f59e0b":"#3b82f6";

  const cr = (c: CompRecord, sold: boolean) =>
    `<tr><td>${c.year}</td><td>${c.make} ${c.model}</td><td>${c.name||"—"}</td>` +
    (sold
      ? `<td>${fmt(c.listedPrice)}</td><td class="hl">${fmt(c.soldPrice)}</td><td>${c.daysOnMarket??"—"}</td>`
      : `<td class="hl">${fmt(c.askPrice??c.listedPrice)}</td>`) +
    `<td>${c.location||"—"}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Market Report — ${ma.subject_year} ${ma.subject_make} ${ma.subject_model}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Cinzel:wght@400;500&family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}

@page{size:A4;margin:15mm 18mm;}

body{
  font-family:'Raleway',sans-serif;font-weight:300;
  background:#fff;color:#1a1a2e;font-size:13px;line-height:1.75;
}
.wrap{max-width:100%;padding:0;}

/* ── Cover: exactly one page ──────────────────────────────────── */
.cover{
  background:linear-gradient(150deg,#050d1a 0%,#0f2040 100%);
  color:#fff;
  width:210mm;
  height:297mm;
  margin:-15mm -18mm;          /* bleed past @page margins */
  padding:50mm 22mm 20mm 22mm;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  page-break-after:always;
}
.ey{font-family:'Cinzel',serif;font-size:8px;letter-spacing:.3em;color:#b8933a;text-transform:uppercase;margin-bottom:22px;}
.ct{font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:300;line-height:1.15;margin-bottom:10px;}
.cs{font-family:'Cinzel',serif;font-size:11px;letter-spacing:.1em;color:rgba(255,255,255,.5);}
.cm{display:table;width:100%;border-top:1px solid rgba(184,147,58,.3);padding-top:26px;margin-bottom:10mm;}
.cm-cell{display:table-cell;width:33%;padding-right:12px;}
.ml{font-family:'Cinzel',serif;font-size:7px;letter-spacing:.18em;color:#b8933a;text-transform:uppercase;margin-bottom:6px;}
.mv{font-family:'Cormorant Garamond',serif;font-size:24px;color:#fff;}

/* ── Sections ───────────────────────────────────────────────── */
.sec{
  background:#fff;
  border:1px solid #e8e4df;
  padding:22px 24px;
  margin-bottom:14px;
  /* NO page-break-inside here — causes Chromium element reordering */
}
.pb{page-break-before:always;}   /* explicit page break helper class */

/* Prevent orphaned headings — keep label+title+rule together */
.sec-head{page-break-after:avoid;break-after:avoid;}
.sl{font-family:'Cinzel',serif;font-size:7.5px;letter-spacing:.22em;color:#b8933a;text-transform:uppercase;margin-bottom:4px;}
.st{font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:300;color:#050d1a;margin-bottom:10px;}
.gr{width:36px;height:2px;background:#b8933a;margin-bottom:16px;}
.bt{font-size:13px;font-weight:300;color:#444;line-height:1.85;}

/* ── Metric boxes: table layout (more reliable in Chrome print) ─ */
.mg{display:table;width:100%;border-spacing:2px;margin:16px 0;}
.mg-row{display:table-row;}
.mb{display:table-cell;background:#f8f7f5;border:1px solid #e8e4df;padding:14px 10px;text-align:center;vertical-align:middle;}
.mn{font-family:'Cormorant Garamond',serif;font-size:26px;color:#050d1a;}
.mk{font-family:'Cinzel',serif;font-size:6.5px;letter-spacing:.14em;color:#b8933a;text-transform:uppercase;margin-top:4px;}
.ms{font-size:10px;color:#aaa;margin-top:2px;}

/* ── Tables ──────────────────────────────────────────────────── */
table{width:100%;border-collapse:collapse;font-size:12px;}
thead{display:table-header-group;}
th{font-family:'Cinzel',serif;font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:#b8933a;padding:8px 9px;text-align:left;border-bottom:2px solid #e8e4df;}
td{padding:8px 9px;border-bottom:1px solid #f0ede8;color:#333;vertical-align:top;}
tr:nth-child(even) td{background:#faf9f7;}
td.hl{font-weight:600;color:#050d1a;}

/* ── Pricing ─────────────────────────────────────────────────── */
.sbadge{display:inline-block;padding:3px 12px;border-radius:20px;font-family:'Cinzel',serif;font-size:7.5px;letter-spacing:.14em;text-transform:uppercase;color:#fff;margin-bottom:10px;}
.rp{font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:300;color:#050d1a;margin:4px 0 8px;}

/* ── Differentiators ─────────────────────────────────────────── */
ul.dl{list-style:none;padding:0;margin:0;}
ul.dl li{padding:6px 0 6px 20px;border-bottom:1px solid #f0ede8;position:relative;font-size:12.5px;color:#444;}
ul.dl li::before{content:'→';position:absolute;left:0;color:#b8933a;}

/* ── Channel tags ────────────────────────────────────────────── */
.ctags{display:block;margin-top:10px;}
.ctag{display:inline-block;background:#0f2040;color:#b8933a;font-family:'Cinzel',serif;font-size:7px;letter-spacing:.12em;text-transform:uppercase;padding:4px 11px;border-radius:20px;margin:3px 4px 3px 0;}

/* ── Timeline ────────────────────────────────────────────────── */
.tl-table{width:100%;border-collapse:collapse;}
.tl-week{font-family:'Cinzel',serif;font-size:7.5px;letter-spacing:.1em;color:#b8933a;text-transform:uppercase;padding:10px 14px 10px 0;border-right:2px solid #b8933a;text-align:right;width:80px;vertical-align:top;}
.tl-action{padding:10px 0 10px 16px;font-size:12.5px;color:#444;border-bottom:1px solid #f0ede8;vertical-align:top;}

/* ── Footer ──────────────────────────────────────────────────── */
.footer{text-align:center;padding:20px;color:#aaa;font-size:11px;border-top:1px solid #e8e4df;margin-top:16px;}

/* ── PDF button (web only) ───────────────────────────────────── */
.pdf-btn{position:fixed;bottom:24px;right:24px;background:#b8933a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);text-decoration:none;display:flex;align-items:center;gap:8px;z-index:999;}
@media print{.pdf-btn{display:none!important;}}
</style>
</head>
<body>
<div class="wrap">

<!-- ══ COVER (page 1) ════════════════════════════════════════════ -->
<div class="cover">
  <div>
    <div class="ey">Confidential · Market Intelligence Report</div>
    <div class="ct">${ma.subject_year} ${ma.subject_make} ${ma.subject_model}</div>
    <div class="cs">${ma.subject_vessel||"Subject Vessel"} &nbsp;·&nbsp; ${ma.subject_length||""} &nbsp;·&nbsp; Will Noftsinger · Denison Yachting</div>
  </div>
  <div class="cm">
    <div class="cm-cell"><div class="ml">Proposed Ask</div><div class="mv">${ma.subject_asking_price||"TBD"}</div></div>
    <div class="cm-cell"><div class="ml">Recommended Ask</div><div class="mv">${(pricing.recommendedListPriceFormatted as string)||"See Report"}</div></div>
    <div class="cm-cell"><div class="ml">Avg DOM (Comps)</div><div class="mv">${avgDom||"—"} <span style="font-size:16px">days</span></div></div>
  </div>
</div>

<!-- ══ EXECUTIVE SUMMARY (page 2 start) ═════════════════════════ -->
<div class="sec">
  <div class="sec-head">
    <div class="sl">Overview</div>
    <div class="st">Executive Summary</div>
    <div class="gr"></div>
  </div>
  <p class="bt">${a.executiveSummary||""}</p>
</div>

<!-- ══ MARKET METRICS ════════════════════════════════════════════ -->
<div class="sec">
  <div class="sec-head">
    <div class="sl">Data · ${sc.length} Sold Comps · ${ac.length} Active</div>
    <div class="st">Market Metrics</div>
  </div>
  <div class="mg"><div class="mg-row">
    <div class="mb"><div class="mn">${fmt(avgSold)}</div><div class="mk">Avg Sold Price</div><div class="ms">direct comps</div></div>
    <div class="mb"><div class="mn">${fmt(avgList)}</div><div class="mk">Avg List Price</div><div class="ms">at listing</div></div>
    <div class="mb"><div class="mn">${ratio?ratio+"%":"—"}</div><div class="mk">List-to-Sold</div><div class="ms">avg achieved</div></div>
    <div class="mb"><div class="mn">${avgDom||"—"}</div><div class="mk">Avg Days on Mkt</div><div class="ms">direct comps</div></div>
  </div></div>
  <div class="mg"><div class="mg-row">
    <div class="mb"><div class="mn">${fmt(avgAsk)}</div><div class="mk">Avg Active Ask</div><div class="ms">current competition</div></div>
    <div class="mb"><div class="mn">${ac.length}</div><div class="mk">Active Competitors</div><div class="ms">direct market</div></div>
    <div class="mb"><div class="mn">${bs.length}</div><div class="mk">Broader Sold</div><div class="ms">similar size/era</div></div>
    <div class="mb"><div class="mn">${ba.length}</div><div class="mk">Broader Active</div><div class="ms">competing vessels</div></div>
  </div></div>
</div>

<!-- ══ MARKET CONDITIONS ════════════════════════════════════════ -->
<div class="sec">
  <div class="sec-head">
    <div class="sl">Analysis</div>
    <div class="st">Market Conditions</div>
    <div class="gr"></div>
  </div>
  <p class="bt">${a.marketConditions||""}</p>
</div>

<!-- ══ PRICING STRATEGY ═════════════════════════════════════════ -->
<div class="sec">
  <div class="sec-head">
    <div class="sl">Pricing Strategy</div>
    <div class="st">Recommended Listing Price</div>
    <div class="gr"></div>
  </div>
  <div><span class="sbadge" style="background:${sColor}">${((pricing.priceStrategy as string)||"at-market").toUpperCase()} STRATEGY</span></div>
  <div class="rp">${(pricing.recommendedListPriceFormatted as string)||"—"}</div>
  <p style="font-size:11.5px;color:#888;margin-bottom:12px;font-style:italic;">${pricing.priceStrategyExplanation||""}</p>
  <p class="bt">${pricing.rationale||""}</p>
</div>

<!-- ══ SOLD COMPS (force new page) ══════════════════════════════ -->
${sc.length ? `<div class="sec pb">
  <div class="sec-head">
    <div class="sl">Comparable Sales</div>
    <div class="st">Direct Sold Comparables</div>
  </div>
  <table>
    <thead><tr><th>Year</th><th>Make / Model</th><th>Vessel</th><th>Listed At</th><th>Sold At</th><th>DOM</th><th>Location</th></tr></thead>
    <tbody>${sc.map(c=>cr(c,true)).join("")}</tbody>
  </table>
</div>` : ""}

<!-- ══ ACTIVE COMPS ══════════════════════════════════════════════ -->
${ac.length ? `<div class="sec">
  <div class="sec-head">
    <div class="sl">Current Competition</div>
    <div class="st">Active Listings — Direct Competitors</div>
  </div>
  <table>
    <thead><tr><th>Year</th><th>Make / Model</th><th>Vessel</th><th>Asking Price</th><th>Location</th></tr></thead>
    <tbody>${ac.map(c=>cr(c,false)).join("")}</tbody>
  </table>
</div>` : ""}

<!-- ══ BROADER SOLD ══════════════════════════════════════════════ -->
${bs.length ? `<div class="sec">
  <div class="sec-head">
    <div class="sl">Broader Market Context</div>
    <div class="st">Broader Sold — Similar Size &amp; Era</div>
  </div>
  <table>
    <thead><tr><th>Year</th><th>Make / Model</th><th>Vessel</th><th>Listed At</th><th>Sold At</th><th>DOM</th><th>Location</th></tr></thead>
    <tbody>${bs.map(c=>cr(c,true)).join("")}</tbody>
  </table>
</div>` : ""}

<!-- ══ BROADER ACTIVE ════════════════════════════════════════════ -->
${ba.length ? `<div class="sec">
  <div class="sec-head">
    <div class="sl">Broader Competition</div>
    <div class="st">Broader Active Market</div>
  </div>
  <table>
    <thead><tr><th>Year</th><th>Make / Model</th><th>Vessel</th><th>Asking Price</th><th>Location</th></tr></thead>
    <tbody>${ba.map(c=>cr(c,false)).join("")}</tbody>
  </table>
</div>` : ""}

<!-- ══ COMPETITIVE POSITIONING (new page) ═══════════════════════ -->
<div class="sec pb">
  <div class="sec-head">
    <div class="sl">Positioning</div>
    <div class="st">Competitive Positioning</div>
    <div class="gr"></div>
  </div>
  <p class="bt">${a.competitivePositioning||""}</p>
</div>

<!-- ══ DOM FORECAST ══════════════════════════════════════════════ -->
<div class="sec">
  <div class="sec-head">
    <div class="sl">Timeline Forecast</div>
    <div class="st">Days on Market Forecast</div>
  </div>
  <div class="mg"><div class="mg-row">
    <div class="mb"><div class="mn">${dom.lowEstimate||"—"}</div><div class="mk">Best Case</div><div class="ms">days</div></div>
    <div class="mb"><div class="mn">${dom.highEstimate||"—"}</div><div class="mk">Expected</div><div class="ms">days</div></div>
    <div class="mb"><div class="mn">${pricing.priceStrategy==="aspirational"?"180+":pricing.priceStrategy==="aggressive"?"60":"120"}</div><div class="mk">Price Review</div><div class="ms">trigger day</div></div>
    <div class="mb"><div class="mn">${ac.length}</div><div class="mk">Active Competitors</div></div>
  </div></div>
  <p class="bt">${dom.rationale||""}</p>
</div>

<!-- ══ GO-TO-MARKET (new page) ══════════════════════════════════ -->
<div class="sec pb">
  <div class="sec-head">
    <div class="sl">Go-to-Market</div>
    <div class="st">${(mktg.headline as string)||"Marketing Strategy"}</div>
    <div class="gr"></div>
  </div>
  <p class="bt" style="margin-bottom:16px"><strong>Target Buyer:</strong> ${mktg.targetBuyerProfile||""}</p>

  ${diffs.length ? `
  <p class="sl" style="margin:18px 0 10px">Key Differentiators</p>
  <ul class="dl">
    ${diffs.map(d=>`<li>${d}</li>`).join("\n    ")}
  </ul>` : ""}

  ${channels.length ? `
  <p class="sl" style="margin:20px 0 10px">Recommended Channels</p>
  <div class="ctags">
    ${channels.map(c=>`<span class="ctag">${c}</span>`).join("\n    ")}
  </div>` : ""}
</div>

<!-- ══ MARKETING TIMELINE ════════════════════════════════════════ -->
${timeline.length ? `<div class="sec">
  <div class="sec-head">
    <div class="sl">Action Plan</div>
    <div class="st">Marketing Timeline</div>
    <div class="gr"></div>
  </div>
  <table class="tl-table">
    <tbody>
      ${timeline.map(t=>`<tr><td class="tl-week">Wk ${t.week}</td><td class="tl-action">${t.action}</td></tr>`).join("\n      ")}
    </tbody>
  </table>
</div>` : ""}

<!-- ══ PRICE REDUCTION STRATEGY (new page) ══════════════════════ -->
<div class="sec pb">
  <div class="sec-head">
    <div class="sl">Contingency Planning</div>
    <div class="st">Price Reduction Strategy</div>
    <div class="gr"></div>
  </div>
  <p class="bt">${a.priceReductionStrategy||""}</p>
</div>

<!-- ══ BROKER NOTES ══════════════════════════════════════════════ -->
${a.brokerNotes ? `<div class="sec" style="border-left:4px solid #b8933a">
  <div class="sec-head">
    <div class="sl">Broker Intelligence</div>
    <div class="st">Notes &amp; Flags</div>
    <div class="gr"></div>
  </div>
  <p class="bt">${a.brokerNotes}</p>
</div>` : ""}

<!-- ══ FOOTER ════════════════════════════════════════════════════ -->
<div class="footer">
  <strong>Will Noftsinger III &nbsp;·&nbsp; Yacht Broker &nbsp;·&nbsp; Denison Yachting</strong><br>
  WN@DenisonYachting.com &nbsp;·&nbsp; +1 (850) 461-3342 &nbsp;·&nbsp; Fort Lauderdale, FL<br>
  <span style="color:#ccc;font-size:10px">Confidential — Prepared for listing presentation purposes</span>
</div>

${!pdfMode ? `<a class="pdf-btn" href="/api/market-analysis/pdf?id=${ma.id}" target="_blank">
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Save as PDF
</a>` : ""}

</div>
</body>
</html>`;
}
