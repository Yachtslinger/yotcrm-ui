import { getVesselFields } from './vessels';
import { listComps } from './comps';
import { buildSubjectAttrs, selectApprovedComps } from './valuation-input';
import { calculateValuation, type ValuationResult, type SubjectVesselAttrs } from '../valuation';
import type { CompRecord } from '../storage';

/**
 * Governed valuation: accepted/live vessel fields + approved comps -> the
 * existing deterministic engine (read-only). Mode is carried for downstream
 * framing only and never influences the calculated market value.
 */

export type GovernedMode = 'buyer' | 'seller';

export function normalizeMode(raw: unknown): GovernedMode {
  const v = String(raw ?? '').toLowerCase();
  return v === 'buyer' || v === 'buy' ? 'buyer' : 'seller';
}

export interface GovernedValuation {
  mode: GovernedMode;
  subject: SubjectVesselAttrs;
  valuation: ValuationResult;
  soldComps: CompRecord[];
  activeComps: CompRecord[];
  soldCompCount: number;
  activeCompCount: number;
  sufficient: boolean; // at least one usable sold comp fed the engine
}

export function runGovernedValuation(vesselId: number, opts: { mode?: unknown } = {}): GovernedValuation {
  const mode = normalizeMode(opts.mode);
  const subject = buildSubjectAttrs(getVesselFields(vesselId));
  const { sold, active } = selectApprovedComps(listComps({ vesselId, status: 'approved' }));

  // Engine receives ONLY subject + sold comps. Mode is intentionally not passed,
  // so the calculated market value is identical regardless of buyer/seller.
  const valuation = calculateValuation(subject, sold);

  return {
    mode,
    subject,
    valuation,
    soldComps: sold,
    activeComps: active,
    soldCompCount: sold.length,
    activeCompCount: active.length,
    sufficient: valuation.compCount > 0,
  };
}
