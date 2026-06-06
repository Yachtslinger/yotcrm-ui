// Market Analysis — Governed Valuation shared types & constants.
// Pure types/constants only (no side effects) — safe to import from server or client.

export const GOVERNANCE_SCHEMA_VERSION = 1;

export type FieldStatus =
  | 'verified'
  | 'unverified'
  | 'ai_unconfirmed'
  | 'ai_accepted'
  | 'overridden';

export type ProposalStatus =
  | 'pending'
  | 'accepted'
  | 'edited_accepted'
  | 'rejected'
  | 'overridden';

export const TERMINAL_PROPOSAL_STATUSES = [
  'accepted',
  'edited_accepted',
  'rejected',
  'overridden',
] as const;

export type CompType = 'active' | 'closed';
export type CompStatus = 'pending' | 'approved' | 'rejected';
export type ReportMode = 'sell' | 'buy';
export type SectionStatus = 'empty' | 'generated' | 'edited' | 'approved';
export type SectionSource = 'ai' | 'broker';

export type IntegrityIssue = {
  code: string;
  label: string;
  count: number;
  sample: string[];
};
