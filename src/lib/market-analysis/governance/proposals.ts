import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { getVesselFieldRow } from './vessels';

/**
 * Staged vessel-field proposals (Pass 3). AI-extracted fields land here as
 * PENDING only. No acceptance/override/verify and no live-field writes in Pass 3.
 */

const USABLE = new Set(['verified', 'overridden', 'ai_accepted']);
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

export interface ProposalRow {
  id: number;
  vessel_id: number;
  source_id: number | null;
  extraction_id: number | null;
  field_name: string;
  proposed_value: string | null;
  current_value_at_proposal: string | null;
  status: string;
  conflict: number;
  created_by: string | null;
  created_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  history_json: string;
  schema_version: number;
}

/**
 * Pure conflict rule: a conflict exists ONLY when the existing live field is
 * usable/accepted/verified AND its value differs from the proposed value.
 * Unverified or absent live values are never a conflict.
 */
export function detectConflict(
  current: { value: string | null; status: string } | null,
  proposedValue: string
): boolean {
  if (!current) return false;
  if (!USABLE.has(current.status)) return false;
  return norm(current.value) !== norm(proposedValue);
}

export interface StageVesselArgs {
  vesselId: number;
  sourceId: number | null;
  extractionId: number | null;
  fields: Record<string, unknown>;
  createdBy?: string | null;
}

/**
 * Deterministic staging (no AI/network). For each non-null field:
 *  - skip if an identical pending proposal already exists (vessel+field+value),
 *  - record current live value + conflict flag,
 *  - insert a pending proposal.
 */
export function stageVesselProposals(args: StageVesselArgs): ProposalRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const created: ProposalRow[] = [];
    const run = db.transaction(() => {
      for (const [key, rawVal] of Object.entries(args.fields)) {
        if (rawVal === null || rawVal === undefined) continue;
        const value = String(rawVal).trim();
        if (value === '') continue;

        const dup = db
          .prepare(
            `SELECT id FROM ma_vessel_field_proposals
             WHERE vessel_id = ? AND field_name = ? AND status = 'pending' AND IFNULL(proposed_value,'') = ?`
          )
          .get(args.vesselId, key, value);
        if (dup) continue;

        const live = getVesselFieldRow(db, args.vesselId, key);
        const conflict = detectConflict(live ? { value: live.value, status: live.status } : null, value) ? 1 : 0;

        const info = db
          .prepare(
            `INSERT INTO ma_vessel_field_proposals
               (vessel_id, source_id, extraction_id, field_name, proposed_value,
                current_value_at_proposal, status, conflict, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
          )
          .run(args.vesselId, args.sourceId, args.extractionId, key, value, live ? live.value : null, conflict, args.createdBy ?? null);
        created.push(getProposalInternal(db, Number(info.lastInsertRowid)) as ProposalRow);
      }
    });
    run();
    return created;
  } finally {
    db.close();
  }
}

export function listProposals(opts: { vesselId?: number; status?: string; limit?: number } = {}): ProposalRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
    const where: string[] = [];
    const argv: Array<number | string> = [];
    if (opts.vesselId != null) { where.push('vessel_id = ?'); argv.push(Number(opts.vesselId)); }
    if (opts.status) { where.push('status = ?'); argv.push(String(opts.status)); }
    const sql = `SELECT * FROM ma_vessel_field_proposals ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    argv.push(limit);
    return db.prepare(sql).all(...argv) as ProposalRow[];
  } finally {
    db.close();
  }
}

export function getProposal(id: number): ProposalRow | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return getProposalInternal(db, id);
  } finally {
    db.close();
  }
}

function getProposalInternal(db: Database.Database, id: number): ProposalRow | null {
  return (db.prepare(`SELECT * FROM ma_vessel_field_proposals WHERE id = ?`).get(id) as ProposalRow | undefined) ?? null;
}
