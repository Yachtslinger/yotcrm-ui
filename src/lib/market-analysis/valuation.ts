/**
 * market-analysis/valuation.ts
 *
 * Structured comparable adjustment valuation engine.
 * Calculates a defensible price estimate by adjusting each sold comp
 * for differences in year, length, brand tier, gross tonnage, engines,
 * and refit recency — then takes a weighted average.
 *
 * Claude receives the calculated number and writes narrative around it.
 * Claude does NOT invent the price.
 */

export type BrandTier = 1 | 2 | 3 | 4 | 5;

// ── Brand tier registry ──────────────────────────────────────────────────────
// 5 = Ultra-premium  4 = Premium  3 = Upper-mid  2 = Mainstream  1 = Value
const BRAND_TIERS: Record<string, BrandTier> = {
  // Tier 5
  feadship: 5, lurssen: 5, heesen: 5, amels: 5, "palmer johnson": 5,
  "trinity yachts": 5, trinity: 5, "oceanco": 5, "codecasa": 5,
  // Tier 4
  westport: 4, burger: 4, delta: 4, christensen: 4, hargrave: 4,
  "custom line": 4, "ferretti custom line": 4, "benetti": 4,
  "crescent": 4, "pacific mariner": 4, "horizon": 4,
  // Tier 3
  viking: 3, princess: 3, sunseeker: 3, azimut: 3, ferretti: 3,
  lazzara: 3, pershing: 3, "sea ray": 3, "ocean alexander": 3,
  "president": 3, "offshore": 3,
  // Tier 2
  hatteras: 2, broward: 2, "west bay": 2, "post": 2, "blount": 2,
  "meridian": 2, "carver": 2, "navigator": 2, "silverton": 2,
  // Tier 1 — catch-all for unlisted
};

export function getBrandTier(make: string): BrandTier {
  if (!make) return 2;
  const key = make.toLowerCase().trim();
  for (const [brand, tier] of Object.entries(BRAND_TIERS)) {
    if (key.includes(brand)) return tier;
  }
  return 2; // default mainstream
}

// ── Broker-configurable adjustment weights ────────────────────────────────────
// All values are percentages (0–50). The broker sets these in the UI.
// Defaults reflect standard appraisal methodology.
export type ValuationWeights = {
  yearRatePerYear:   number;  // % adjustment per year of age difference (default 1.5)
  yearCap:           number;  // max total year adjustment ± % (default 20)
  lengthCap:         number;  // max total length adjustment ± % (default 25)
  brandPerTier:      number;  // % per brand tier step (default 5)
  brandCap:          number;  // max total brand adjustment ± % (default 20)
  gtCap:             number;  // max GT adjustment ± % (default 3)
  engineCap:         number;  // max engine adjustment ± % (default 5)
  refitFull:         number;  // full refit premium % (default 8)
  refitMechanical:   number;  // mechanical refit premium % (default 5)
  refitCosmetic:     number;  // cosmetic refit premium % (default 3)
  refitFadeYears:    number;  // years until refit premium fully fades (default 8)
  manualOverride:    number;  // broker-entered overall ± % adjustment on top of model (default 0)
};

export const DEFAULT_WEIGHTS: ValuationWeights = {
  yearRatePerYear: 1.5,
  yearCap: 20,
  lengthCap: 25,
  brandPerTier: 5,
  brandCap: 20,
  gtCap: 3,
  engineCap: 5,
  refitFull: 8,
  refitMechanical: 5,
  refitCosmetic: 3,
  refitFadeYears: 8,
  manualOverride: 0,
};

// ── Subject vessel attributes (broker-entered) ───────────────────────────────
export type SubjectVesselAttrs = {
  year: number;
  lengthFt: number;
  make: string;
  grossTonnage: number | null;   // GT — volume/interior proxy
  engineCount: number | null;    // 1, 2, 3, 4
  engineBrand: string;           // "MTU" | "CAT" | "Cummins" | "MAN" | "Detroit" | "Volvo" | ""
  engineHp: number | null;       // total horsepower
  lastRefitYear: number | null;  // most recent significant refit
  refitScope: "cosmetic" | "mechanical" | "full" | "none" | "";
  askingPrice: number;
};

// ── Per-comp adjusted valuation ──────────────────────────────────────────────
export type CompAdjustment = {
  name: string;
  soldPrice: number;
  // Raw adjustments (as % multipliers, e.g. 0.05 = +5%)
  yearAdj: number;
  lengthAdj: number;
  brandAdj: number;
  gtAdj: number;
  engineAdj: number;
  refitAdj: number;
  // Combined
  totalAdjPct: number;
  adjustedPrice: number;
  // Similarity weight (0–1)
  weight: number;
  weightReason: string;
};

export type ValuationResult = {
  calculatedValue: number;
  calculatedValueFormatted: string;
  confidenceScore: number;       // 0–100
  compCount: number;
  adjustments: CompAdjustment[];
  methodology: string;
  // Breakdown
  avgUnadjustedSold: number;
  avgAdjustedSold: number;
  brandTierSubject: BrandTier;
  priceRange: { low: number; high: number };
};

// ── Engine brand tier ─────────────────────────────────────────────────────────
// Higher = more desirable / better resale
function engineBrandScore(brand: string): number {
  const b = brand.toLowerCase();
  if (b.includes("mtu"))     return 5;
  if (b.includes("man"))     return 4;
  if (b.includes("cat") || b.includes("caterpillar")) return 4;
  if (b.includes("cummins")) return 3;
  if (b.includes("volvo"))   return 3;
  if (b.includes("detroit")) return 2;
  if (b.includes("yanmar"))  return 2;
  return 3; // unknown — neutral
}

// ── Core valuation calculation ────────────────────────────────────────────────
import type { CompRecord } from "./storage";

export function calculateValuation(
  subject: SubjectVesselAttrs,
  soldComps: CompRecord[],
  broadSold: CompRecord[] = [],
  weights: ValuationWeights = DEFAULT_WEIGHTS,
  currentYear = new Date().getFullYear(),
): ValuationResult {
  const subjectTier = getBrandTier(subject.make);

  // Helper: parse length from strings like "112 ft", "108ft", "34.5m"
  function parseLength(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const m = raw.match(/([\d.]+)\s*m(?:eter)?/i);
    if (m) return Math.round(parseFloat(m[1]) * 3.28084);
    const ft = raw.match(/([\d.]+)/);
    if (ft) return parseFloat(ft[1]);
    return null;
  }

  // Build combined pool: direct comps weighted 1.0, broad comps 0.5
  const pool: { comp: CompRecord; baseWeight: number }[] = [
    ...soldComps.map(c  => ({ comp: c, baseWeight: 1.0 })),
    ...broadSold.map(c  => ({ comp: c, baseWeight: 0.5 })),
  ];

  const adjustments: CompAdjustment[] = [];

  for (const { comp, baseWeight } of pool) {
    const soldPrice = comp.soldPrice;
    if (!soldPrice || soldPrice < 50000) continue;

    const compYear   = parseInt(comp.year) || 0;
    const compLenFt  = parseLength(comp.length);
    const compTier   = getBrandTier(comp.make);

    // ── 1. Year adjustment ───────────────────────────────────────────────────
    const yearDiff = subject.year - compYear;
    const yearRate = weights.yearRatePerYear / 100;
    const yearCapD = weights.yearCap / 100;
    const yearAdj  = Math.max(-yearCapD, Math.min(yearCapD, yearDiff * yearRate));

    // ── 2. Length adjustment ─────────────────────────────────────────────────
    const lengthCapD = weights.lengthCap / 100;
    let lengthAdj = 0;
    if (compLenFt && compLenFt > 0) {
      const ratio = subject.lengthFt / compLenFt;
      lengthAdj = Math.max(-lengthCapD, Math.min(lengthCapD, Math.pow(ratio, 0.65) - 1));
    }

    // ── 3. Brand tier adjustment ─────────────────────────────────────────────
    const tierDiff   = subjectTier - compTier;
    const brandRate  = weights.brandPerTier / 100;
    const brandCapD  = weights.brandCap / 100;
    const brandAdj   = Math.max(-brandCapD, Math.min(brandCapD, tierDiff * brandRate));

    // ── 4. Gross Tonnage adjustment ──────────────────────────────────────────
    const gtCapD = weights.gtCap / 100;
    let gtAdj = 0;
    if (subject.grossTonnage && compLenFt) {
      const subjectExpGT = subject.lengthFt * 0.5;
      const subjectGTDev = (subject.grossTonnage - subjectExpGT) / subjectExpGT;
      gtAdj = Math.max(-gtCapD, Math.min(gtCapD, subjectGTDev * 0.5));
    }

    // ── 5. Engine adjustment ─────────────────────────────────────────────────
    const engineCapD = weights.engineCap / 100;
    let engineAdj = 0;
    if (subject.engineBrand) {
      const subjectEngScore = engineBrandScore(subject.engineBrand);
      const engDiff = subjectEngScore - 3; // assume neutral (3) for unknown comps
      engineAdj = Math.max(-engineCapD, Math.min(engineCapD, engDiff * 0.025));
    }
    if (subject.engineCount && subject.engineCount >= 2) engineAdj += 0.02;

    // ── 6. Refit recency adjustment ──────────────────────────────────────────
    let refitAdj = 0;
    if (subject.lastRefitYear) {
      const yearsSinceRefit = currentYear - subject.lastRefitYear;
      const recencyFactor   = Math.max(0, 1 - yearsSinceRefit / Math.max(1, weights.refitFadeYears));
      const scopePct =
        subject.refitScope === "full"       ? weights.refitFull :
        subject.refitScope === "mechanical" ? weights.refitMechanical :
        subject.refitScope === "cosmetic"   ? weights.refitCosmetic : 0;
      refitAdj = recencyFactor * (scopePct / 100);
    }

    // ── Total adjustment + broker manual override ────────────────────────────
    const modelAdjPct    = yearAdj + lengthAdj + brandAdj + gtAdj + engineAdj + refitAdj;
    const manualOverride = weights.manualOverride / 100;
    const totalAdjPct    = modelAdjPct + manualOverride;
    const adjustedPrice  = Math.round(soldPrice * (1 + totalAdjPct));

    // ── Similarity weight ─────────────────────────────────────────────────────
    // Base weight from pool (1.0 direct, 0.5 broad)
    // Boost for same make, close length, recent sale
    let weight = baseWeight;
    const reasons: string[] = [];

    if (comp.make.toLowerCase() === subject.make.toLowerCase()) {
      weight *= 1.5; reasons.push("same make");
    }
    if (compLenFt) {
      const lenSimilarity = 1 - Math.min(1, Math.abs(subject.lengthFt - compLenFt) / 30);
      weight *= (0.5 + lenSimilarity * 0.5);
    }
    // Recency of sale (soldDate)
    if (comp.soldDate) {
      const soldYr = parseInt(comp.soldDate.slice(-4)) || parseInt(comp.soldDate.slice(0, 4)) || 0;
      if (soldYr >= currentYear - 1)      { weight *= 1.3; reasons.push("sold <1yr ago"); }
      else if (soldYr >= currentYear - 2) { weight *= 1.1; reasons.push("sold <2yr ago"); }
      else if (soldYr <= currentYear - 4) { weight *= 0.7; reasons.push("older sale"); }
    }

    adjustments.push({
      name: `${comp.year} ${comp.make} ${comp.model} "${comp.name}"`,
      soldPrice,
      yearAdj, lengthAdj, brandAdj, gtAdj, engineAdj, refitAdj,
      totalAdjPct,
      adjustedPrice,
      weight,
      weightReason: reasons.join(", ") || "standard weight",
    });
  }

  if (!adjustments.length) {
    return {
      calculatedValue: subject.askingPrice,
      calculatedValueFormatted: "$" + subject.askingPrice.toLocaleString("en-US"),
      confidenceScore: 0,
      compCount: 0,
      adjustments: [],
      methodology: "No valid sold comps — using proposed asking price as baseline",
      avgUnadjustedSold: 0,
      avgAdjustedSold: 0,
      brandTierSubject: subjectTier,
      priceRange: { low: subject.askingPrice, high: subject.askingPrice },
    };
  }

  // ── Weighted average ──────────────────────────────────────────────────────
  const totalWeight   = adjustments.reduce((s, a) => s + a.weight, 0);
  const weightedSum   = adjustments.reduce((s, a) => s + a.adjustedPrice * a.weight, 0);
  const calculatedValue = Math.round(weightedSum / totalWeight / 5000) * 5000; // round to $5k

  // ── Price range (±1 weighted std dev) ────────────────────────────────────
  const variance = adjustments.reduce((s, a) => {
    return s + a.weight * Math.pow(a.adjustedPrice - calculatedValue, 2);
  }, 0) / totalWeight;
  const stdDev = Math.sqrt(variance);
  const priceRange = {
    low:  Math.round((calculatedValue - stdDev) / 5000) * 5000,
    high: Math.round((calculatedValue + stdDev) / 5000) * 5000,
  };

  // ── Confidence score ──────────────────────────────────────────────────────
  // Based on: number of comps, how close they are, how recent
  const directCount   = soldComps.filter(c => c.soldPrice).length;
  const compScore     = Math.min(40, directCount * 8);          // up to 40 pts
  const spreadScore   = Math.max(0, 40 - (stdDev / calculatedValue) * 200); // up to 40 pts
  const recencyScore  = adjustments.some(a => a.weightReason.includes("1yr")) ? 20 : 10;
  const confidenceScore = Math.round(Math.min(98, compScore + spreadScore + recencyScore));

  // ── Averages for reporting ────────────────────────────────────────────────
  const avgUnadjustedSold = Math.round(
    adjustments.reduce((s, a) => s + a.soldPrice, 0) / adjustments.length
  );
  const avgAdjustedSold = Math.round(
    adjustments.reduce((s, a) => s + a.adjustedPrice, 0) / adjustments.length
  );

  const fmtUSD = (n: number) => "$" + n.toLocaleString("en-US");

  const methodology =
    `Comparable adjustment model using ${adjustments.length} sold comp${adjustments.length !== 1 ? "s" : ""}. ` +
    `Broker weights: year ${weights.yearRatePerYear}%/yr (cap ±${weights.yearCap}%), ` +
    `length cap ±${weights.lengthCap}%, brand ${weights.brandPerTier}%/tier (cap ±${weights.brandCap}%), ` +
    `refit full ${weights.refitFull}% / mech ${weights.refitMechanical}% / cosmetic ${weights.refitCosmetic}%` +
    (weights.manualOverride !== 0 ? `, broker override ${weights.manualOverride > 0 ? "+" : ""}${weights.manualOverride}%` : "") + `. ` +
    `Avg unadjusted sold: ${fmtUSD(avgUnadjustedSold)} → avg adjusted: ${fmtUSD(avgAdjustedSold)}. ` +
    `Confidence: ${confidenceScore}%.`;

  return {
    calculatedValue,
    calculatedValueFormatted: fmtUSD(calculatedValue),
    confidenceScore,
    compCount: adjustments.length,
    adjustments,
    methodology,
    avgUnadjustedSold,
    avgAdjustedSold,
    brandTierSubject: subjectTier,
    priceRange,
  };
}
