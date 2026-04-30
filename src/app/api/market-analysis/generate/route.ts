/**
 * POST /api/market-analysis/generate
 * Takes comp data + subject vessel info, runs through Claude,
 * returns structured analysis JSON + full HTML report.
 */
import { NextRequest, NextResponse } from "next/server";
import type { CompRecord } from "@/lib/market-analysis/storage";
import { calculateValuation, getBrandTier, DEFAULT_WEIGHTS } from "@/lib/market-analysis/valuation";
import type { SubjectVesselAttrs, ValuationWeights } from "@/lib/market-analysis/valuation";

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
      // Vessel attributes for weighting engine
      grossTonnage, engineCount, engineBrand, engineHp,
      lastRefitYear, refitScope,
      valuationWeights,
      brokerId,
    } = body as {
      subjectVessel: string; subjectYear: string; subjectMake: string;
      subjectModel: string; subjectLength: string; subjectAskingPrice: string;
      notes: string;
      soldComps: CompRecord[]; activeComps: CompRecord[];
      broadSold: CompRecord[]; broadActive: CompRecord[];
      supplementalText?: string;
      grossTonnage?: number | null;
      engineCount?: number | null;
      engineBrand?: string;
      engineHp?: number | null;
      lastRefitYear?: number | null;
      refitScope?: "cosmetic" | "mechanical" | "full" | "none" | "";
      valuationWeights?: Partial<ValuationWeights>;
      brokerId?: string;
    };

    const BROKERS: Record<string, { name: string; title: string; email: string; phone: string; location: string; bio: string }> = {
      will: { name: "Will Noftsinger III", title: "Yacht Broker", email: "WN@DenisonYachting.com", phone: "+1 (850) 461-3342", location: "Fort Lauderdale, FL", bio: "Will Noftsinger, a senior yacht broker at Denison Yachting in Fort Lauderdale with 15+ years of experience in superyacht transactions" },
      erik: { name: "Erik Mayol", title: "Yacht Broker", email: "em@DenisonYachting.com", phone: "(949) 338-7907", location: "Newport Beach, CA", bio: "Erik Mayol, a yacht broker at Denison Yachting specializing in motor yachts" },
    };
    const broker = BROKERS[brokerId || "will"] || BROKERS.will;

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

    // ── Run structured valuation engine ──────────────────────────────────────
    const parseLen = (s: string) => {
      const m = s?.match(/([\d.]+)\s*m/i);
      if (m) return Math.round(parseFloat(m[1]) * 3.28084);
      const ft = s?.match(/([\d.]+)/);
      return ft ? parseFloat(ft[1]) : 100;
    };
    const subjectAttrs: SubjectVesselAttrs = {
      year:         parseInt(subjectYear) || new Date().getFullYear() - 10,
      lengthFt:     parseLen(subjectLength),
      make:         subjectMake,
      grossTonnage: grossTonnage || null,
      engineCount:  engineCount || null,
      engineBrand:  engineBrand || "",
      engineHp:     engineHp || null,
      lastRefitYear: lastRefitYear || null,
      refitScope:   refitScope || "",
      askingPrice:  subjectPrice,
    };
    const valuation = calculateValuation(subjectAttrs, soldComps, broadSold, { ...DEFAULT_WEIGHTS, ...valuationWeights });
    const brandTierLabel = ["Value", "Mainstream", "Upper-Mid", "Premium", "Ultra-Premium"][valuation.brandTierSubject - 1];
    const fmtAdj = (pct: number) => (pct >= 0 ? "+" : "") + (pct * 100).toFixed(1) + "%";

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

    const prompt = `You are ${broker.bio} at Denison Yachting. Write a Market Intelligence & Listing Strategy Report entirely in first-person professional broker voice.

CRITICAL RULES:
- Never reference AI, Claude, artificial intelligence, machine learning, or any automated system.
- Never use phrases like "Based on my analysis as an AI", "As a language model", or any similar language.
- Write exactly as an experienced human yacht broker would write — confident, specific, data-driven, professional.
- Use "I recommend", "my analysis of the comps shows", "in my professional opinion", "the data indicates" — natural broker language.
- Sign your analysis as ${broker.name}, ${broker.title} at Denison Yachting.
- Do NOT include any disclaimers, caveats about data limitations, or suggestions to consult other sources.
- Be specific and decisive. Give a real price recommendation backed by the comp data provided.

Produce a comprehensive, client-facing Market Intelligence & Listing Strategy Report.

SUBJECT VESSEL:
${subjectYear} ${subjectMake} ${subjectModel} "${subjectVessel}"
Length: ${subjectLength} | Proposed Asking Price: ${subjectAskingPrice}
Brand Tier: ${brandTierLabel} (${valuation.brandTierSubject}/5)
${grossTonnage ? `Gross Tonnage: ${grossTonnage} GT` : ""}
${engineCount ? `Engines: ${engineCount}x ${engineBrand || "unknown brand"}${engineHp ? ` (${engineHp} total HP)` : ""}` : ""}
${lastRefitYear ? `Last Refit: ${lastRefitYear} (${refitScope || "scope unknown"})` : ""}
Broker Notes: ${notes || "None"}

STRUCTURED VALUATION — COMPARABLE ADJUSTMENT MODEL:
Calculated Market Value: ${valuation.calculatedValueFormatted}
Confidence Score: ${valuation.confidenceScore}%
Methodology: ${valuation.methodology}
Price Range (±1 std dev): ${fmt(valuation.priceRange.low)} – ${fmt(valuation.priceRange.high)}
Avg Unadjusted Sold: ${fmt(valuation.avgUnadjustedSold)} → Avg After Adjustments: ${fmt(valuation.avgAdjustedSold)}

INDIVIDUAL COMP ADJUSTMENTS (how each comp was adjusted to subject vessel):
${valuation.adjustments.map(adj =>
  `  ${adj.name}
   Sold: ${fmt(adj.soldPrice)} | Year ${fmtAdj(adj.yearAdj)} | Length ${fmtAdj(adj.lengthAdj)} | Brand ${fmtAdj(adj.brandAdj)}${adj.refitAdj ? ` | Refit ${fmtAdj(adj.refitAdj)}` : ""} | Total ${fmtAdj(adj.totalAdjPct)} → Adjusted: ${fmt(adj.adjustedPrice)} (weight: ${adj.weight.toFixed(2)})`
).join("\n")}
${supplementalText ? `\nSUPPLEMENTAL MARKET ANALYSIS (additional context from uploaded report):\n${supplementalText.slice(0, 3000)}\n` : ""}

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
    "recommendedListPrice": <number — must be close to the calculated value of ${valuation.calculatedValue} unless broker notes strongly justify deviation>,
    "recommendedListPriceFormatted": "$X,XXX,XXX",
    "rationale": "Reference the specific comp adjustments that drove this number",
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
      // Store valuation result inside analysis JSON for later retrieval
      analysis._valuation = valuation;
      analysis._broker = broker;
    } catch {
      analysis = { error: "Could not parse analysis", raw };
    }

    return NextResponse.json({ ok: true, analysis, metrics, valuation });
  } catch (err) {
    console.error("market-analysis/generate error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
