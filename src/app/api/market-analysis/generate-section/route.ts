import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const PROMPTS: Record<string, (c: Record<string,string>) => string> = {
  executiveSummary:      c => `You are a yacht broker. Write a 3-4 sentence Executive Summary paragraph for a market analysis of a ${c.year} ${c.make} ${c.model} named "${c.vessel}", ${c.length}, asking ${c.askingPrice}. Market data: ${c.soldCount} sold comps avg ${c.avgSold}, ${c.activeCount} active competitors avg ${c.avgActive}, avg DOM ${c.avgDom} days.${c.notes ? ` Notes: ${c.notes}` : ""} First-person broker voice. Return only the paragraph, no labels.`,
  marketConditions:      c => `You are a yacht broker. Write a 4-5 sentence Market Conditions paragraph for a market analysis. Vessel: ${c.year} ${c.make} ${c.model}. Data: ${c.soldCount} sold comps avg ${c.avgSold} (list-to-sold ${c.ltsPct}%), ${c.activeCount} active competitors, avg DOM ${c.avgDom} days. Sold: ${c.soldTable}. Active: ${c.activeTable}. Analyze supply/demand and price trends. First-person broker voice. Return only the paragraph.`,
  competitivePositioning:c => `You are a yacht broker. Write a 4-5 sentence Competitive Positioning paragraph. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}.${c.notes ? ` Condition: ${c.notes}` : ""} Competitors: ${c.activeTable}. Compare strengths and weaknesses vs competition. First-person broker voice. Return only the paragraph.`,
  priceReductionStrategy:c => `You are a yacht broker. Write a 3-4 sentence Price Reduction Strategy paragraph. Vessel: ${c.year} ${c.make} ${c.model}, recommended ask ${c.recommendedPrice}. Avg DOM: ${c.avgDom} days. ${c.activeCount} active competitors. Give specific reduction triggers with percentages and timing. First-person broker voice. Return only the paragraph.`,
  brokerNotes:           c => `You are a yacht broker. Write a 3-4 sentence Broker Notes & Flags paragraph. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}.${c.notes ? ` Context: ${c.notes}` : ""} ${c.soldCount} sold comps, ${c.activeCount} active, avg DOM ${c.avgDom} days. Flag key risks, opportunities and watch items. First-person broker voice. Return only the paragraph.`,
  pricingRationale:      c => `You are a yacht broker. Write a 3-4 sentence Pricing Rationale paragraph. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}. Recommended: ${c.recommendedPrice}. Ask: ${c.askingPrice}. Comps: ${c.soldTable}. Justify the price using comp data. First-person broker voice. Return only the paragraph.`,
  domRationale:          c => `You are a yacht broker. Write a 2-3 sentence DOM Forecast rationale. Vessel: ${c.year} ${c.make} ${c.model}. Best case: ${c.domLow} days. Expected: ${c.domHigh} days. Avg comp DOM: ${c.avgDom} days. ${c.activeCount} active competitors. Explain the forecast. First-person broker voice. Return only the paragraph.`,
  keyDifferentiators:    c => `You are a yacht broker. List 4-6 key selling points for a ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}.${c.notes ? ` Features: ${c.notes}` : ""} Return ONLY a JSON array of strings, e.g. ["Point one","Point two"]. No other text.`,
};

function avg(arr: number[]) { return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; }
function fmt(n: number|null|undefined) { return n ? "$"+Number(n).toLocaleString("en-US") : "—"; }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { section, subjectVessel="", subjectYear="", subjectMake="", subjectModel="",
      subjectLength="", subjectAskingPrice="", notes="",
      soldComps=[], activeComps=[], recommendedPrice="", domLow="", domHigh="" } = body;

    if (!PROMPTS[section]) return NextResponse.json({ ok:false, error:`Unknown section: ${section}` }, { status:400 });

    const sc = soldComps as Record<string,unknown>[];
    const ac = activeComps as Record<string,unknown>[];
    const soldPrices  = sc.map(c=>c.soldPrice).filter(Boolean) as number[];
    const listedPrices= sc.map(c=>c.listedPrice).filter(Boolean) as number[];
    const domVals     = sc.map(c=>c.daysOnMarket).filter(v=>v&&Number(v)>0) as number[];
    const activePrices= ac.map(c=>c.askPrice??c.listedPrice).filter(Boolean) as number[];
    const avgSold   = avg(soldPrices);
    const avgList   = avg(listedPrices);
    const avgDom    = avg(domVals);
    const avgActive = avg(activePrices);
    const ltsPct    = avgList&&avgSold ? Math.round((avgSold/avgList)*100) : 0;
    const soldTable  = sc.slice(0,6).map(c=>`${c.year} ${c.make} ${c.model} — Ask:${fmt(c.listedPrice as number)} Sold:${fmt(c.soldPrice as number)} DOM:${c.daysOnMarket??'?'}`).join("; ")||"none";
    const activeTable= ac.slice(0,8).map(c=>`${c.year} ${c.make} ${c.model} — Ask:${fmt((c.askPrice??c.listedPrice) as number)} ${c.location}`).join("; ")||"none";

    const ctx: Record<string,string> = {
      vessel:subjectVessel, year:subjectYear, make:subjectMake, model:subjectModel,
      length:subjectLength, askingPrice:subjectAskingPrice, notes,
      soldCount:String(sc.length), activeCount:String(ac.length),
      avgSold:fmt(avgSold), avgActive:fmt(avgActive), avgDom:String(avgDom||"unknown"),
      ltsPct:String(ltsPct), soldTable, activeTable,
      recommendedPrice:recommendedPrice||subjectAskingPrice,
      domLow:String(domLow), domHigh:String(domHigh),
    };

    const prompt = PROMPTS[section](ctx);

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-20250514",
        max_tokens: 800,
        messages: [{ role:"user", content: prompt }],
      }),
    });

    const apiData = await apiRes.json();

    if (!apiRes.ok || apiData.type === "error" || apiData.error) {
      const errMsg = apiData.error?.message || JSON.stringify(apiData);
      console.error("[generate-section] Claude API error:", errMsg);
      return NextResponse.json({ ok:false, error:`Claude API: ${errMsg}` }, { status:500 });
    }

    const text = apiData.content?.[0]?.text?.trim() || "";
    if (!text) {
      console.error("[generate-section] Empty response:", JSON.stringify(apiData).slice(0,300));
      return NextResponse.json({ ok:false, error:"Claude returned empty response" }, { status:500 });
    }

    if (section === "keyDifferentiators") {
      try {
        const arr = JSON.parse(text.replace(/```json|```/g,"").trim());
        return NextResponse.json({ ok:true, value:arr, type:"array" });
      } catch {
        return NextResponse.json({ ok:true, value:[text], type:"array" });
      }
    }

    return NextResponse.json({ ok:true, value:text, type:"text" });

  } catch(err) {
    console.error("[generate-section] Error:", err);
    return NextResponse.json({ ok:false, error:String(err) }, { status:500 });
  }
}
