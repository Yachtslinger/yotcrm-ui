/**
 * POST /api/market-analysis/generate-section
 * Generates or rewrites a single section of the market analysis report.
 * Used by the per-section "Generate" buttons in the review/edit step.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SECTION_PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  executiveSummary: ctx => `Write a concise, compelling Executive Summary paragraph (3-5 sentences) for a yacht market analysis report.
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}, proposed ask ${ctx.askingPrice}.
Market data: ${ctx.soldCount} sold comps averaging ${ctx.avgSold}, ${ctx.activeCount} active competitors averaging ${ctx.avgActive}, average DOM ${ctx.avgDom} days.
${ctx.notes ? `Broker notes: ${ctx.notes}` : ""}
Write in first-person broker voice. Do not mention AI. 2-4 sentences. Return only the paragraph text, no labels or headers.`,

  marketConditions: ctx => `Write a Market Conditions paragraph for a yacht market analysis report (4-6 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}.
Market data: ${ctx.soldCount} sold comps averaging ${ctx.avgSold} (list-to-sold ratio ${ctx.ltsPct}%), ${ctx.activeCount} active competitors, average DOM ${ctx.avgDom} days.
Sold comps: ${ctx.soldTable}
Active comps: ${ctx.activeTable}
Analyze supply/demand, price trends, and market dynamics. First-person broker voice. No AI references. Return only the paragraph text.`,

  competitivePositioning: ctx => `Write a Competitive Positioning paragraph for a yacht market analysis report (4-6 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}, proposed ask ${ctx.askingPrice}.
${ctx.notes ? `Key features/condition: ${ctx.notes}` : ""}
Active competitors: ${ctx.activeTable}
Describe how the subject vessel compares to competition — strengths, weaknesses, and what differentiates it. First-person broker voice. No AI references. Return only the paragraph text.`,

  priceReductionStrategy: ctx => `Write a Price Reduction Strategy paragraph for a yacht market analysis report (3-5 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", recommended ask ${ctx.recommendedPrice}.
Average DOM for sold comps: ${ctx.avgDom} days. Active competitors: ${ctx.activeCount}.
Provide specific price reduction triggers with percentage reductions and timing. First-person broker voice. No AI references. Return only the paragraph text.`,

  brokerNotes: ctx => `Write a Broker Intelligence / Notes & Flags section for a yacht market analysis report (3-5 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}, proposed ask ${ctx.askingPrice}.
${ctx.notes ? `Broker context: ${ctx.notes}` : ""}
Market data: ${ctx.soldCount} sold comps, ${ctx.activeCount} active, avg DOM ${ctx.avgDom} days.
Highlight key risks, opportunities, watch items, and strategic flags the broker should monitor. First-person broker voice. No AI references. Return only the paragraph text.`,

  pricingRationale: ctx => `Write a Pricing Rationale paragraph for a yacht market analysis report (3-5 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}.
Recommended price: ${ctx.recommendedPrice}. Proposed ask: ${ctx.askingPrice}.
Sold comps: ${ctx.soldTable}
Explain why this price is justified by the comp data. First-person broker voice. No AI references. Return only the paragraph text.`,

  domRationale: ctx => `Write a Days on Market Forecast rationale paragraph (2-4 sentences).
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}".
Best case: ${ctx.domLow} days. Expected: ${ctx.domHigh} days. Avg sold comp DOM: ${ctx.avgDom} days. Active competitors: ${ctx.activeCount}.
Explain the DOM forecast based on pricing and market conditions. First-person broker voice. No AI references. Return only the paragraph text.`,

  keyDifferentiators: ctx => `Generate 4-6 key differentiators (selling points) for this vessel as a JSON array of strings.
Subject vessel: ${ctx.year} ${ctx.make} ${ctx.model} "${ctx.vessel}", ${ctx.length}, asking ${ctx.askingPrice}.
${ctx.notes ? `Features/condition: ${ctx.notes}` : ""}
Each item should be a concise bullet point (1 sentence max). No AI references. 
Return ONLY a valid JSON array like: ["Point one", "Point two", "Point three"]`,
};

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}
function fmt(n: number | null) { return n ? "$" + n.toLocaleString("en-US") : "—"; }

export async function POST(req: NextRequest) {
  try {
    const { section, subjectVessel, subjectYear, subjectMake, subjectModel,
      subjectLength, subjectAskingPrice, notes,
      soldComps, activeComps, recommendedPrice, domLow, domHigh,
    } = await req.json();

    if (!SECTION_PROMPTS[section]) {
      return NextResponse.json({ ok: false, error: `Unknown section: ${section}` }, { status: 400 });
    }

    const sc = soldComps || [];
    const ac = activeComps || [];
    const soldPrices = sc.map((c: Record<string,unknown>) => c.soldPrice).filter(Boolean) as number[];
    const listedPrices = sc.map((c: Record<string,unknown>) => c.listedPrice).filter(Boolean) as number[];
    const domVals = sc.map((c: Record<string,unknown>) => c.daysOnMarket).filter((v: unknown) => v && Number(v) > 0) as number[];
    const activePrices = ac.map((c: Record<string,unknown>) => c.askPrice ?? c.listedPrice).filter(Boolean) as number[];
    const avgSold = avg(soldPrices);
    const avgList = avg(listedPrices);
    const avgDom = avg(domVals);
    const avgActive = avg(activePrices);
    const ltsPct = avgList && avgSold ? Math.round((avgSold / avgList) * 100) : 0;

    const soldTable = sc.slice(0, 6).map((c: Record<string,unknown>) =>
      `${c.year} ${c.make} ${c.model} "${c.name}" — Ask: ${fmt(c.listedPrice as number)}, Sold: ${fmt(c.soldPrice as number)}, DOM: ${c.daysOnMarket ?? "?"}`
    ).join("; ");

    const activeTable = ac.slice(0, 8).map((c: Record<string,unknown>) =>
      `${c.year} ${c.make} ${c.model} "${c.name}" — Ask: ${fmt((c.askPrice ?? c.listedPrice) as number)}, ${c.location}`
    ).join("; ");

    const ctx: Record<string, string> = {
      vessel: subjectVessel || "",
      year: subjectYear || "",
      make: subjectMake || "",
      model: subjectModel || "",
      length: subjectLength || "",
      askingPrice: subjectAskingPrice || "",
      notes: notes || "",
      soldCount: String(sc.length),
      activeCount: String(ac.length),
      avgSold: fmt(avgSold),
      avgActive: fmt(avgActive),
      avgDom: String(avgDom || "—"),
      ltsPct: String(ltsPct),
      soldTable: soldTable || "No sold comps provided",
      activeTable: activeTable || "No active comps provided",
      recommendedPrice: recommendedPrice || subjectAskingPrice || "",
      domLow: String(domLow || ""),
      domHigh: String(domHigh || ""),
    };

    const prompt = SECTION_PROMPTS[section](ctx);
    const text = await callClaude(prompt);

    // For keyDifferentiators, parse the JSON array
    if (section === "keyDifferentiators") {
      try {
        const arr = JSON.parse(text.replace(/```json|```/g, "").trim());
        return NextResponse.json({ ok: true, value: arr, type: "array" });
      } catch {
        return NextResponse.json({ ok: true, value: [text], type: "array" });
      }
    }

    return NextResponse.json({ ok: true, value: text, type: "text" });
  } catch (err) {
    console.error("generate-section error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
