import 'server-only';

/**
 * Governed Market Analysis ("Governed Valuation" / "Deal Workspace") feature flag.
 *
 * Pass 0 placeholder — OFF by default. Nothing in the app reads this yet; it exists
 * so the governed valuation/audit workflow (sources, immutable extraction logs,
 * staged proposals, frozen report versions, deal-file export, integrity check) can
 * be gated when it is built in later passes. Toggling it has no effect until then.
 *
 * Enable with MA_GOVERNANCE_ENABLED=1 (or "true"/"on") in the environment.
 */
export function isGovernanceEnabled(): boolean {
  const v = (process.env.MA_GOVERNANCE_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}
