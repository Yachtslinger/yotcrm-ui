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
  const avgDom = avg(sc.map(c=>c.daysOnMarket).filter(v=>v!=null&&v>0) as number[]);
  const avgAsk = avg(ac.map(c=>c.askPrice??c.listedPrice).filter(Boolean) as number[]);
  const ratio = avgList&&avgSold ? Math.round((avgSold/avgList)*100) : 0;
  const sColor = pricing.priceStrategy==="aggressive"?"#22c55e":pricing.priceStrategy==="aspirational"?"#f59e0b":"#3b82f6";

  const cr = (c: CompRecord, sold: boolean) => `<tr>
    <td>${c.year}</td><td>${c.make} ${c.model}</td><td>${c.name||"—"}</td>
    ${sold?`<td>${fmt(c.listedPrice)}</td><td class="hl">${fmt(c.soldPrice)}</td><td>${c.daysOnMarket??"—"}</td>`:`<td class="hl">${fmt(c.askPrice??c.listedPrice)}</td>`}
    <td>${c.location||"—"}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Market Report — ${ma.subject_year} ${ma.subject_make} ${ma.subject_model}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Cinzel:wght@400;500&family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Raleway',sans-serif;font-weight:300;background:#f8f7f5;color:#1a1a2e;font-size:14px;line-height:1.7;}
.wrap{max-width:1000px;margin:0 auto;padding:40px 32px;}
.cover{background:linear-gradient(135deg,#050d1a,#0f2040);color:#fff;padding:56px 48px;margin-bottom:32px;}
.ey{font-family:'Cinzel',serif;font-size:9px;letter-spacing:.28em;color:#b8933a;text-transform:uppercase;margin-bottom:16px;}
.ct{font-family:'Cormorant Garamond',serif;font-size:40px;font-weight:300;line-height:1.2;margin-bottom:6px;}
.cs{font-family:'Cinzel',serif;font-size:12px;letter-spacing:.1em;color:rgba(255,255,255,.55);margin-bottom:28px;}
.cm{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;border-top:1px solid rgba(184,147,58,.25);padding-top:28px;margin-top:32px;}
.ml{font-family:'Cinzel',serif;font-size:8px;letter-spacing:.18em;color:#b8933a;text-transform:uppercase;margin-bottom:4px;}
.mv{font-family:'Cormorant Garamond',serif;font-size:22px;color:#fff;}
.sec{background:#fff;border:1px solid #e8e4df;padding:32px;margin-bottom:20px;}
.sl{font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.22em;color:#b8933a;text-transform:uppercase;margin-bottom:6px;}
.st{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:#050d1a;margin-bottom:14px;}
.gr{width:44px;height:2px;background:#b8933a;margin:14px 0 20px;}
.bt{font-size:14px;font-weight:300;color:#444;line-height:1.85;max-width:760px;}
.mg{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;margin:24px 0;}
.mb{background:#f8f7f5;border:1px solid #e8e4df;padding:18px;text-align:center;}
.mn{font-family:'Cormorant Garamond',serif;font-size:30px;color:#050d1a;}
.mk{font-family:'Cinzel',serif;font-size:7.5px;letter-spacing:.16em;color:#b8933a;text-transform:uppercase;margin-top:5px;}
.ms{font-size:11px;color:#aaa;margin-top:2px;}
table{width:100%;border-collapse:collapse;font-size:13px;}
th{font-family:'Cinzel',serif;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#b8933a;padding:9px 11px;text-align:left;border-bottom:2px solid #e8e4df;}
td{padding:10px 11px;border-bottom:1px solid #f0ede8;color:#333;}
tr:nth-child(even) td{background:#faf9f7;}td.hl{font-weight:600;color:#050d1a;}
.sbadge{display:inline-block;padding:4px 14px;border-radius:20px;font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#fff;margin-bottom:14px;}
.rp{font-family:'Cormorant Garamond',serif;font-size:44px;font-weight:300;color:#050d1a;margin:6px 0 4px;}
ul.dl{list-style:none;padding:0;}ul.dl li{padding:7px 0 7px 22px;border-bottom:1px solid #f0ede8;position:relative;font-size:13px;color:#444;}
ul.dl li::before{content:'→';position:absolute;left:0;color:#b8933a;}
.ctags{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
.ctag{background:#0f2040;color:#b8933a;font-family:'Cinzel',serif;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:5px 13px;border-radius:20px;}
.tlg{display:grid;grid-template-columns:110px 1fr;}
.tlw{font-family:'Cinzel',serif;font-size:8.5px;letter-spacing:.1em;color:#b8933a;text-transform:uppercase;padding:12px 14px 12px 0;border-right:2px solid #b8933a;text-align:right;}
.tla{padding:12px 0 12px 18px;font-size:13px;color:#444;border-bottom:1px solid #f0ede8;}
.footer{text-align:center;padding:28px;color:#aaa;font-size:12px;border-top:1px solid #e8e4df;margin-top:24px;}
.pdf-btn{position:fixed;bottom:24px;right:24px;background:#b8933a;color:#fff;border:none;padding:11px 22px;border-radius:8px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);text-decoration:none;display:flex;align-items:center;gap:8px;z-index:999;}
.pdf-btn:hover{background:#9a7a30;}
@media print{body{background:#fff;}.wrap{padding:20px;}.pdf-btn{display:none!important;}}
</style></head><body><div class="wrap">

<div class="cover">
  <div class="ey">Confidential · Market Intelligence Report</div>
  <div class="ct">${ma.subject_year} ${ma.subject_make} ${ma.subject_model}</div>
  <div class="cs">${ma.subject_vessel||"Subject Vessel"} &nbsp;·&nbsp; ${ma.subject_length||""} &nbsp;·&nbsp; Will Noftsinger · Denison Yachting</div>
  <div class="cm">
    <div><div class="ml">Proposed Ask</div><div class="mv">${ma.subject_asking_price||"TBD"}</div></div>
    <div><div class="ml">Recommended Ask</div><div class="mv">${(pricing.recommendedListPriceFormatted as string)||"See Report"}</div></div>
    <div><div class="ml">Avg DOM (comps)</div><div class="mv">${avgDom||"—"} <span style="font-size:16px">days</span></div></div>
  </div>
</div>

<div class="sec"><div class="sl">Overview</div><div class="st">Executive Summary</div><div class="gr"></div>
  <p class="bt">${a.executiveSummary||""}</p></div>

<div class="sec"><div class="sl">Data · ${sc.length} Sold Comps · ${ac.length} Active</div><div class="st">Market Metrics</div>
  <div class="mg">
    <div class="mb"><div class="mn">${fmt(avgSold)}</div><div class="mk">Avg Sold Price</div><div class="ms">direct comps</div></div>
    <div class="mb"><div class="mn">${fmt(avgList)}</div><div class="mk">Avg List Price</div><div class="ms">at listing</div></div>
    <div class="mb"><div class="mn">${ratio?ratio+"%":"—"}</div><div class="mk">List-to-Sold</div><div class="ms">avg achieved</div></div>
    <div class="mb"><div class="mn">${avgDom||"—"}</div><div class="mk">Avg Days on Mkt</div><div class="ms">direct comps</div></div>
  </div>
  <div class="mg" style="margin-top:0">
    <div class="mb"><div class="mn">${fmt(avgAsk)}</div><div class="mk">Avg Active Ask</div><div class="ms">current competition</div></div>
    <div class="mb"><div class="mn">${ac.length}</div><div class="mk">Active Competitors</div><div class="ms">direct market</div></div>
    <div class="mb"><div class="mn">${bs.length}</div><div class="mk">Broader Sold</div><div class="ms">similar size/era</div></div>
    <div class="mb"><div class="mn">${ba.length}</div><div class="mk">Broader Active</div><div class="ms">competing vessels</div></div>
  </div>
</div>

<div class="sec"><div class="sl">Analysis</div><div class="st">Market Conditions</div><div class="gr"></div>
  <p class="bt">${a.marketConditions||""}</p></div>

<div class="sec"><div class="sl">Pricing Strategy</div><div class="st">Recommended Listing Price</div><div class="gr"></div>
  <span class="sbadge" style="background:${sColor}">${((pricing.priceStrategy as string)||"at-market").toUpperCase()} STRATEGY</span>
  <div class="rp">${(pricing.recommendedListPriceFormatted as string)||"—"}</div>
  <p style="font-size:12px;color:#999;margin-bottom:14px;">${pricing.priceStrategyExplanation||""}</p>
  <p class="bt">${pricing.rationale||""}</p></div>

${sc.length?`<div class="sec"><div class="sl">Comparable Sales</div><div class="st">Direct Sold Comparables</div>
  <table><thead><tr><th>Year</th><th>Make/Model</th><th>Vessel</th><th>Listed At</th><th>Sold At</th><th>DOM</th><th>Location</th></tr></thead>
  <tbody>${sc.map(c=>cr(c,true)).join("")}</tbody></table></div>`:""}

${ac.length?`<div class="sec"><div class="sl">Current Competition</div><div class="st">Active Listings — Direct Competitors</div>
  <table><thead><tr><th>Year</th><th>Make/Model</th><th>Vessel</th><th>Asking Price</th><th>Location</th></tr></thead>
  <tbody>${ac.map(c=>cr(c,false)).join("")}</tbody></table></div>`:""}

${bs.length?`<div class="sec"><div class="sl">Broader Market Context</div><div class="st">Broader Sold — Similar Size & Era</div>
  <table><thead><tr><th>Year</th><th>Make/Model</th><th>Vessel</th><th>Listed At</th><th>Sold At</th><th>DOM</th><th>Location</th></tr></thead>
  <tbody>${bs.map(c=>cr(c,true)).join("")}</tbody></table></div>`:""}

${ba.length?`<div class="sec"><div class="sl">Broader Competition</div><div class="st">Broader Active Market</div>
  <table><thead><tr><th>Year</th><th>Make/Model</th><th>Vessel</th><th>Asking Price</th><th>Location</th></tr></thead>
  <tbody>${ba.map(c=>cr(c,false)).join("")}</tbody></table></div>`:""}

<div class="sec"><div class="sl">Positioning</div><div class="st">Competitive Positioning</div><div class="gr"></div>
  <p class="bt">${a.competitivePositioning||""}</p></div>

<div class="sec"><div class="sl">Timeline Forecast</div><div class="st">Days on Market Forecast</div>
  <div class="mg" style="margin:20px 0 16px">
    <div class="mb"><div class="mn">${dom.lowEstimate||"—"}</div><div class="mk">Best Case</div><div class="ms">days</div></div>
    <div class="mb"><div class="mn">${dom.highEstimate||"—"}</div><div class="mk">Expected</div><div class="ms">days</div></div>
    <div class="mb"><div class="mn">${pricing.priceStrategy==="aspirational"?"180+":pricing.priceStrategy==="aggressive"?"60":"120"}</div><div class="mk">Price Review</div><div class="ms">trigger day</div></div>
    <div class="mb"><div class="mn">${ac.length}</div><div class="mk">Active Competitors</div></div>
  </div>
  <p class="bt">${dom.rationale||""}</p></div>

<div class="sec"><div class="sl">Go-to-Market</div><div class="st">${(mktg.headline as string)||"Marketing Strategy"}</div><div class="gr"></div>
  <p class="bt" style="margin-bottom:16px"><strong>Target Buyer:</strong> ${mktg.targetBuyerProfile||""}</p>
  ${diffs.length?`<p class="sl" style="margin-bottom:10px">Key Differentiators</p><ul class="dl">${diffs.map(d=>`<li>${d}</li>`).join("")}</ul>`:""}
  ${channels.length?`<p class="sl" style="margin:18px 0 10px">Recommended Channels</p><div class="ctags">${channels.map(c=>`<span class="ctag">${c}</span>`).join("")}</div>`:""}
</div>

${timeline.length?`<div class="sec"><div class="sl">Action Plan</div><div class="st">Marketing Timeline</div><div class="gr"></div>
  <div class="tlg">${timeline.map(t=>`<div class="tlw">Wk ${t.week}</div><div class="tla">${t.action}</div>`).join("")}</div></div>`:""}

<div class="sec"><div class="sl">Contingency Planning</div><div class="st">Price Reduction Strategy</div><div class="gr"></div>
  <p class="bt">${a.priceReductionStrategy||""}</p></div>

${a.brokerNotes?`<div class="sec" style="border-left:4px solid #b8933a"><div class="sl">Broker Intelligence</div><div class="st">Notes & Flags</div>
  <p class="bt">${a.brokerNotes}</p></div>`:""}

<div class="footer"><strong>Will Noftsinger III · Yacht Broker · Denison Yachting</strong><br>
WN@DenisonYachting.com · +1 (850) 461-3342 · Fort Lauderdale, FL<br>
<span style="color:#ddd">Confidential — Prepared for listing presentation purposes</span></div>

${!pdfMode ? `<a class="pdf-btn" href="/api/market-analysis/pdf?id=${ma.id}" target="_blank">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
  Save as PDF
</a>` : ""}
</div></body></html>`;
}
