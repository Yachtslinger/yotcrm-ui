import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import { getVesselFieldRow, writeLiveField, appendFieldHistory, type VesselFieldRow } from './vessels';
import { GovError } from './errors';

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

// ---------------------------------------------------------------------------
// Pass 4: broker resolution of pending proposals -> live vessel fields.
// One transaction; the single proposal UPDATE moves pending -> terminal, which
// the terminal-lock trigger permits (it only blocks UPDATEs where OLD.status is
// already terminal). A second resolution attempt is rejected with 409.
// ---------------------------------------------------------------------------

export type ResolveAction = 'accept' | 'edit_accept' | 'reject' | 'override';

/** Pure: the live field status a resolution action produces. */
export function resolvedFieldStatus(action: 'accept' | 'edit_accept' | 'override'): 'ai_accepted' | 'overridden' {
  return action === 'accept' ? 'ai_accepted' : 'overridden';
}

export interface ResolveOpts {
  action: ResolveAction;
  value?: string | null;
  by?: string | null;
  notes?: string | null;
}

export function resolveProposal(id: number, opts: ResolveOpts): { proposal: ProposalRow; field: VesselFieldRow | null } {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const run = db.transaction(() => {
      const p = getProposalInternal(db, id);
      if (!p) throw new GovError(404, 'proposal not found');
      if (p.status !== 'pending') throw new GovError(409, `proposal already resolved (${p.status})`);
      const by = opts.by ?? null;

      if (opts.action === 'reject') {
        db.prepare(
          `UPDATE ma_vessel_field_proposals SET status='rejected', resolved_by=?, resolved_at=datetime('now'), resolution_notes=? WHERE id=?`
        ).run(by, opts.notes ?? null, id);
        return { proposal: getProposalInternal(db, id) as ProposalRow, field: null };
      }

      let value = p.proposed_value;
      if (opts.action === 'edit_accept') {
        if (opts.value == null || String(opts.value).trim() === '') throw new GovError(400, 'edit_accept requires a value');
        value = String(opts.value).trim();
      }
      const liveStatus = resolvedFieldStatus(opts.action);
      const field = writeLiveField(db, {
        vesselId: p.vessel_id, fieldKey: p.field_name, value, status: liveStatus,
        sourceId: p.source_id, extractionId: p.extraction_id, by,
        verifiedBy: liveStatus === 'overridden' ? by : null,
        acceptedBy: by,
      });
      const histAction =
        opts.action === 'accept' ? 'accepted' : opts.action === 'edit_accept' ? 'edited & accepted' : 'accepted (override)';
      appendFieldHistory(db, {
        vesselId: p.vessel_id, fieldKey: p.field_name, action: histAction, value, status: liveStatus, source: 'ai_extracted', by,
      });

      const proposalStatus =
        opts.action === 'accept' ? 'accepted' : opts.action === 'edit_accept' ? 'edited_accepted' : 'overridden';
      db.prepare(
        `UPDATE ma_vessel_field_proposals SET status=?, resolved_by=?, resolved_at=datetime('now'), resolution_notes=? WHERE id=?`
      ).run(proposalStatus, by, opts.notes ?? null, id);
      return { proposal: getProposalInternal(db, id) as ProposalRow, field };
    });
    return run();
  } finally {
    db.close();
  }
}
