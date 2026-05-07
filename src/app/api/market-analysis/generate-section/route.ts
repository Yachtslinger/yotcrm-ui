import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const PROMPTS: Record<string, (c: Record<string,string>) => string> = {
  executiveSummary:      c => `You are a yacht broker. Write a 4 sentence Executive Summary for a market analysis. Subject: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}. Market: ${c.soldCount} sold comps avg ${c.avgSold}, ${c.activeCount} active avg ${c.avgActive}, avg DOM ${c.avgDom} days.${c.notes ? ` Notes: ${c.notes}` : ""} First-person broker voice. No AI references. Return only the paragraph.`,
  marketConditions:      c => `You are a yacht broker. Write a 4 sentence Market Conditions paragraph. Vessel: ${c.year} ${c.make} ${c.model}. ${c.soldCount} sold comps avg ${c.avgSold} (list-to-sold ${c.ltsPct}%), ${c.activeCount} active, avg DOM ${c.avgDom} days. Sold: ${c.soldTable}. Active: ${c.activeTable}. First-person broker voice. No AI references. Return only the paragraph.`,
  competitivePositioning:c => `You are a yacht broker. Write a 4 sentence Competitive Positioning paragraph. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}.${c.notes ? ` Condition: ${c.notes}` : ""} Competitors: ${c.activeTable}. First-person broker voice. No AI references. Return only the paragraph.`,
  priceReductionStrategy:c => `You are a yacht broker. Write a 3 sentence Price Reduction Strategy. Vessel: ${c.year} ${c.make} ${c.model}, recommended ask ${c.recommendedPrice}. Avg DOM: ${c.avgDom} days. ${c.activeCount} active competitors. Give specific reduction triggers. First-person broker voice. No AI references. Return only the paragraph.`,
  brokerNotes:           c => `You are a yacht broker. Write a 3 sentence Broker Notes & Flags paragraph. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", asking ${c.askingPrice}.${c.notes ? ` Context: ${c.notes}` : ""} ${c.soldCount} sold, ${c.activeCount} active, avg DOM ${c.avgDom} days. Flag key risks and opportunities. First-person broker voice. No AI references. Return only the paragraph.`,
  pricingRationale:      c => `You are a yacht broker. Write a 3 sentence Pricing Rationale. Vessel: ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}. Recommended: ${c.recommendedPrice}. Ask: ${c.askingPrice}. Comps: ${c.soldTable}. Justify price using comp data. First-person broker voice. No AI references. Return only the paragraph.`,
  domRationale:          c => `You are a yacht broker. Write a 2 sentence DOM Forecast rationale. Vessel: ${c.year} ${c.make} ${c.model}. Best case: ${c.domLow} days. Expected: ${c.domHigh} days. Avg comp DOM: ${c.avgDom} days. ${c.activeCount} active competitors. First-person broker voice. No AI references. Return only the paragraph.`,
  keyDifferentiators:    c => `You are a yacht broker. List 5 key selling points for a ${c.year} ${c.make} ${c.model} "${c.vessel}", ${c.length}, asking ${c.askingPrice}.${c.notes ? ` Features: ${c.notes}` : ""} Return ONLY a JSON array like ["Point one","Point two"]. No other text.`,
};

function avg(arr: number[]) { return arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0; }
function fmt(n: number|null|undefined) { return n ? "$"+Number(n).toLocaleString("en-US") : "—"; }

const OLLAMA_URL = (() => {
  const raw = process.env.OLLAMA_URL || "";
  return (raw && !raw.includes("trycloudflare") && !raw.includes("loca.lt"))
    ? raw : "http://bore.pub:7777";
})();
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "sk-yotcrm-301613feda903c146c05b8dd97869352af4846fdacfe9b01407deefd97103b31";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:20b";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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
    const soldTable  = sc.slice(0,6).map(c=>`${c.year} ${c.make} ${c.model} Sold:${fmt(c.soldPrice as number)} DOM:${c.daysOnMarket??'?'}`).join("; ")||"none";
    const activeTable= ac.slice(0,8).map(c=>`${c.year} ${c.make} ${c.model} Ask:${fmt((c.askPrice??c.listedPrice) as number)}`).join("; ")||"none";

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
    let text = "";
    let lastError = "";

    // Try YotBot (Ollama/Open WebUI)
    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OLLAMA_API_KEY}`,
          "bypass-tunnel-reminder": "true",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 400,
          stream: false,
        }),
        signal: AbortSignal.timeout(55000),
      });
      if (res.ok) {
        const data = await res.json();
        text = data.choices?.[0]?.message?.content?.trim() || "";
      } else {
        lastError = `YotBot ${res.status}`;
      }
    } catch (e) {
      lastError = `YotBot error: ${String(e).slice(0,80)}`;
      console.warn("[generate-section] YotBot failed:", lastError);
    }

    // Fall back to Anthropic
    if (!text && ANTHROPIC_KEY) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-20250514",
            max_tokens: 400,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await res.json();
        if (!data.error) text = data.content?.[0]?.text?.trim() || "";
        else lastError = `Anthropic: ${data.error?.message}`;
      } catch (e) {
        lastError = `Anthropic error: ${String(e).slice(0,80)}`;
      }
    }

    if (!text) return NextResponse.json({ ok:false, error: lastError || "Both AI backends failed" }, { status:500 });

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
