/**
 * POST /api/market-analysis/generate
 * Takes comp data + subject vessel info, runs through Claude,
 * returns structured analysis JSON + full HTML report.
 */
import { NextRequest, NextResponse } from "next/server";
import type { CompRecord } from "@/lib/market-analysis/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text || "{}";
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function med(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function fmt(n: number | null): string {
  if (!n) return "N/A";
  return "$" + n.toLocaleString("en-US");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subjectVessel, subjectYear, subjectMake, subjectModel,
      subjectLength, subjectAskingPrice, notes,
      soldComps, activeComps, broadSold, broadActive,
      supplementalText,
    } = body as {
      subjectVessel: string; subjectYear: string; subjectMake: string;
      subjectModel: string; subjectLength: string; subjectAskingPrice: string;
      notes: string;
      soldComps: CompRecord[]; activeComps: CompRecord[];
      broadSold: CompRecord[]; broadActive: CompRecord[];
      supplementalText?: string;
    };

    // Pre-compute key metrics to feed Claude
    const soldPrices = soldComps.map(c => c.soldPrice).filter(Boolean) as number[];
    const listedPrices = soldComps.map(c => c.listedPrice).filter(Boolean) as number[];
    const domVals = soldComps.map(c => c.daysOnMarket).filter(v => v != null && v > 0) as number[];
    const activePrices = activeComps.map(c => c.askPrice ?? c.listedPrice).filter(Boolean) as number[];
    const broadSoldPrices = broadSold.map(c => c.soldPrice).filter(Boolean) as number[];
    const broadDom = broadSold.map(c => c.daysOnMarket).filter(v => v != null && v > 0) as number[];

    const metrics = {
      directSoldCount: soldComps.length,
      avgSoldPrice: avg(soldPrices),
      medSoldPrice: med(soldPrices),
      avgListedPrice: avg(listedPrices),
      avgDom: avg(domVals),
      medDom: med(domVals),
      minSoldPrice: soldPrices.length ? Math.min(...soldPrices) : 0,
      maxSoldPrice: soldPrices.length ? Math.max(...soldPrices) : 0,
      avgListToSoldRatio: listedPrices.length && soldPrices.length
        ? Math.round((avg(soldPrices) / avg(listedPrices)) * 100) : 0,
      activeCount: activeComps.length,
      avgAskPrice: avg(activePrices),
      minAskPrice: activePrices.length ? Math.min(...activePrices) : 0,
      maxAskPrice: activePrices.length ? Math.max(...activePrices) : 0,
      broadSoldCount: broadSold.length,
      broadAvgSoldPrice: avg(broadSoldPrices),
      broadAvgDom: avg(broadDom),
    };

    const subjectPrice = parseFloat(subjectAskingPrice.replace(/[$,]/g, "")) || 0;
    const pricePctVsAvg = metrics.avgSoldPrice
      ? Math.round(((subjectPrice - metrics.avgSoldPrice) / metrics.avgSoldPrice) * 100) : 0;

    const soldCompsTable = soldComps.map(c =>
      `${c.year} ${c.make} ${c.model} "${c.name}" | Ask: ${fmt(c.listedPrice)} | Sold: ${fmt(c.soldPrice)} | DOM: ${c.daysOnMarket ?? "?"} days | ${c.location}`
    ).join("\n");

    const activeCompsTable = activeComps.map(c =>
      `${c.year} ${c.make} ${c.model} "${c.name}" | Ask: ${fmt(c.askPrice ?? c.listedPrice)} | ${c.location}`
    ).join("\n");

    const broadSoldTable = broadSold.slice(0, 8).map(c =>
      `${c.year} ${c.make} ${c.model} "${c.name}" | Ask: ${fmt(c.listedPrice)} | Sold: ${fmt(c.soldPrice)} | DOM: ${c.daysOnMarket ?? "?"} days`
    ).join("\n");

    const broadActiveTable = broadActive.slice(0, 8).map(c =>
      `${c.year} ${c.make} ${c.model} "${c.name}" | Ask: ${fmt(c.askPrice ?? c.listedPrice)} | ${c.location}`
    ).join("\n");

    const prompt = `You are a senior yacht market analyst and listing strategist for Denison Yachting. 
Produce a comprehensive, client-facing Market Intelligence & Listing Strategy Report.

SUBJECT VESSEL:
${subjectYear} ${subjectMake} ${subjectModel} "${subjectVessel}"
Length: ${subjectLength} | Proposed Asking Price: ${subjectAskingPrice}
Broker Notes: ${notes || "None"}
${supplementalText ? `\nSUPPLEMENTAL MARKET ANALYSIS (from uploaded report — use this data to enrich your analysis):\n${supplementalText.slice(0, 4000)}\n` : ""}

DIRECT SOLD COMPARABLES (${soldComps.length} vessels):
${soldCompsTable || "None provided"}

KEY METRICS FROM SOLD COMPS:
- Avg Sold Price: ${fmt(metrics.avgSoldPrice)} | Median: ${fmt(metrics.medSoldPrice)}
- Avg List Price: ${fmt(metrics.avgListedPrice)}
- Avg List-to-Sold Ratio: ${metrics.avgListToSoldRatio}%
- Avg Days on Market: ${metrics.avgDom} | Median DOM: ${metrics.medDom}
- Price Range Sold: ${fmt(metrics.minSoldPrice)} – ${fmt(metrics.maxSoldPrice)}
- Subject Price vs Avg Sold: ${pricePctVsAvg > 0 ? "+" : ""}${pricePctVsAvg}%

DIRECT ACTIVE COMPETITION (${activeComps.length} vessels currently for sale):
${activeCompsTable || "None provided"}
Avg Active Ask Price: ${fmt(metrics.avgAskPrice)}

BROADER MARKET SOLD (${broadSold.length} additional comps, mixed makes/models same size range):
${broadSoldTable || "None provided"}
Broad Market Avg Sold: ${fmt(metrics.broadAvgSoldPrice)} | Broad Avg DOM: ${metrics.broadAvgDom} days

BROADER ACTIVE COMPETITION (other 108-116ft vessels for sale):
${broadActiveTable || "None provided"}

Produce a JSON response ONLY (no markdown, no backticks) with this exact structure:
{
  "executiveSummary": "3-4 sentence overview of market conditions and subject vessel positioning",
  "marketConditions": "Paragraph analyzing current supply/demand, pricing trends, what the data shows",
  "pricingAnalysis": {
    "recommendedListPrice": <number, your recommended list price in USD>,
    "recommendedListPriceFormatted": "$X,XXX,XXX",
    "rationale": "Why this price, referencing specific comps",
    "priceStrategy": "aggressive|at-market|aspirational",
    "priceStrategyExplanation": "What the strategy means and why"
  },
  "competitivePositioning": "How subject vessel compares to active competition — strengths, weaknesses, differentiators to highlight",
  "daysOnMarketForecast": {
    "lowEstimate": <number days>,
    "highEstimate": <number days>,
    "rationale": "Based on comp DOM data and current market conditions"
  },
  "marketingStrategy": {
    "headline": "One bold strategic headline for the listing",
    "keyDifferentiators": ["3-5 bullet points of what to lead with in marketing"],
    "targetBuyerProfile": "Who the ideal buyer is and where they come from",
    "channels": ["List of recommended marketing channels/tactics"],
    "timeline": [
      {"week": "1-2", "action": "..."},
      {"week": "3-6", "action": "..."},
      {"week": "7-12", "action": "..."},
      {"week": "13+", "action": "..."}
    ]
  },
  "priceReductionStrategy": "If no offer by X days, reduce by Y% — specific recommendation with trigger points",
  "brokerNotes": "Any flags, concerns, or opportunities the data reveals that the broker should know"
}`;

    const raw = await callClaude(prompt);
    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      analysis = { error: "Could not parse analysis", raw };
    }

    return NextResponse.json({ ok: true, analysis, metrics });
  } catch (err) {
    console.error("market-analysis/generate error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
