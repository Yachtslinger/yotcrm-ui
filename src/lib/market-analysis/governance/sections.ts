import { callAI } from '../../ai-client';
import type { GovernedValuation, GovernedMode } from './valuation';

/**
 * Working report sections built from a GovernedValuation.
 *  - Deterministic data sections come straight from the engine result (no AI).
 *  - Mode (buyer/seller) only affects framing (recommended band, narrative voice),
 *    never the calculated market value.
 *  - Narrative generation is the only network path and is opt-in.
 */

export interface WorkingSection {
  section_key: string;
  content: unknown;
  source: 'engine' | 'ai';
}

const fmt = (n: number | null | undefined): string => (n ? '$' + Number(n).toLocaleString('en-US') : '—');

/** Recommended price band — framing only, derived from the (unchanged) calculated value. */
export function recommendedBand(mode: GovernedMode, value: number): { low: number; high: number; basis: string } {
  if (value <= 0) return { low: 0, high: 0, basis: 'insufficient comps' };
  return mode === 'buyer'
    ? { low: Math.round(value * 0.92), high: value, basis: 'target offer at/below market value' }
    : { low: value, high: Math.round(value * 1.05), basis: 'ask at/above market value' };
}

/** Deterministic data sections. Pure given the valuation result. */
export function buildWorkingSections(gv: GovernedValuation): WorkingSection[] {
  const v = gv.valuation;
  const band = recommendedBand(gv.mode, v.calculatedValue);

  return [
    {
      section_key: 'valuationSummary',
      source: 'engine',
      content: {
        mode: gv.mode,
        calculatedValue: v.calculatedValue,
        calculatedValueFormatted: v.calculatedValueFormatted,
        confidenceScore: v.confidenceScore,
        priceRange: v.priceRange,
        recommendedBand: band,
        compCount: v.compCount,
        sufficient: gv.sufficient,
      },
    },
    {
      section_key: 'closedComparables',
      source: 'engine',
      content: {
        avgUnadjustedSold: v.avgUnadjustedSold,
        avgAdjustedSold: v.avgAdjustedSold,
        rows: v.adjustments.map((a) => ({
          name: a.name,
          soldPrice: a.soldPrice,
          adjustedPrice: a.adjustedPrice,
          totalAdjPct: a.totalAdjPct,
          weight: a.weight,
          weightReason: a.weightReason,
        })),
      },
    },
    {
      section_key: 'activeListings',
      source: 'engine',
      content: {
        note: 'context only — active listings do not feed the calculated value',
        count: gv.activeCompCount,
        rows: gv.activeComps.map((c) => ({
          year: c.year, make: c.make, model: c.model, length: c.length,
          askPrice: c.askPrice ?? c.listedPrice ?? null, location: c.location,
        })),
      },
    },
    {
      section_key: 'pricingLogic',
      source: 'engine',
      content: {
        methodology: v.methodology,
        brandTierSubject: v.brandTierSubject,
        avgUnadjustedSold: v.avgUnadjustedSold,
        avgAdjustedSold: v.avgAdjustedSold,
        priceRange: v.priceRange,
      },
    },
    {
      section_key: 'scorecard',
      source: 'engine',
      content: {
        confidenceScore: v.confidenceScore,
        soldCompCount: gv.soldCompCount,
        activeCompCount: gv.activeCompCount,
        compCountUsed: v.compCount,
        sufficient: gv.sufficient,
      },
    },
  ];
}

// ── Optional AI narrative (network) ──────────────────────────────────────────

function narrativePrompts(gv: GovernedValuation): Record<string, string> {
  const v = gv.valuation;
  const s = gv.subject;
  const vessel = `${s.year || '?'} ${s.make || 'vessel'} (${s.lengthFt ? s.lengthFt + ' ft' : 'length n/a'})`;
  const compLine = `${v.compCount} adjusted sold comps, avg adjusted ${fmt(v.avgAdjustedSold)}, value ${v.calculatedValueFormatted}, confidence ${v.confidenceScore}/100`;
  const modeLine = gv.mode === 'buyer'
    ? 'Write from the buy-side: negotiation leverage and a defensible offer below market value.'
    : 'Write from the sell-side: listing strategy and defensible asking price at/above market value.';
  return {
    executiveSummary: `You are a yacht broker. Write a 4 sentence executive valuation summary for the ${vessel}. ${compLine}. ${modeLine} First-person broker voice. No AI references. Return only the paragraph.`,
    pricingRationale: `You are a yacht broker. Write a 3 sentence pricing rationale for the ${vessel}. ${compLine}. Justify the figure using the comp adjustments. ${modeLine} First-person broker voice. No AI references. Return only the paragraph.`,
  };
}

/** Opt-in narrative sections. Network via callAI; not used unless requested. */
export async function generateNarrativeSections(gv: GovernedValuation): Promise<WorkingSection[]> {
  const prompts = narrativePrompts(gv);
  const out: WorkingSection[] = [];
  for (const [key, prompt] of Object.entries(prompts)) {
    const text = await callAI(prompt, 500);
    out.push({ section_key: key, source: 'ai', content: { text: String(text).trim() } });
  }
  return out;
}
