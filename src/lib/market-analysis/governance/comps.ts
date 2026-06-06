import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';
import type { CompRecord } from '../storage';
import { GovError } from './errors';

/**
 * Pending comps (Pass 3). Parser/AI-extracted comps land here as PENDING only.
 * No approval/rejection in Pass 3, and nothing feeds valuation yet.
 * Nothing is invented — values come straight from the parsed/extracted record.
 */

export interface CompRow {
  id: number;
  vessel_id: number | null;
  type: string;
  status: string;
  source_id: number | null;
  extraction_id: number | null;
  asking_price: number | null;
  sold_price: number | null;
  last_ask: number | null;
  discount: number | null;
  builder: string | null;
  year: string | null;
  loa: string | null;
  relevance_notes: string | null;
  fields_json: string;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

export interface MappedComp {
  type: 'active' | 'closed';
  asking_price: number | null;
  sold_price: number | null;
  last_ask: number | null;
  discount: number | null;
  builder: string | null;
  year: string | null;
  loa: string | null;
  fields_json: string;
}

/**
 * Deterministic mapping CompRecord -> ma_comps columns. No invention:
 * discount is computed only when BOTH a real listed price and sold price exist.
 */
export function mapCompRecord(rec: CompRecord): MappedComp {
  const sold = rec.soldPrice ?? null;
  const isClosed = sold != null || (typeof rec.soldDate === 'string' && rec.soldDate.trim() !== '');
  const lastAsk = rec.listedPrice ?? null;
  let discount: number | null = null;
  if (lastAsk != null && sold != null && lastAsk > 0) {
    discount = Math.round(((lastAsk - sold) / lastAsk) * 1000) / 1000;
  }
  return {
    type: isClosed ? 'closed' : 'active',
    asking_price: rec.askPrice ?? null,
    sold_price: sold,
    last_ask: lastAsk,
    discount,
    builder: rec.make || null,
    year: rec.year || null,
    loa: rec.length || null,
    fields_json: JSON.stringify(rec),
  };
}

export interface StageCompsArgs {
  vesselId?: number | null;
  sourceId: number | null;
  extractionId: number | null;
  comps: CompRecord[];
  createdBy?: string | null;
}

export function stageComps(args: StageCompsArgs): CompRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const created: CompRow[] = [];
    const run = db.transaction(() => {
      for (const rec of args.comps) {
        const m = mapCompRecord(rec);
        // Conservative dup guard: only collapse a clearly-identical pending comp
        // (same vessel + source + builder + year + loa + asking + sold). Different
        // data => kept as distinct records.
        const dup = db
          .prepare(
            `SELECT id FROM ma_comps
             WHERE status = 'pending'
               AND IFNULL(vessel_id,-1)   = IFNULL(?,-1)
               AND IFNULL(source_id,-1)   = IFNULL(?,-1)
               AND IFNULL(builder,'')     = IFNULL(?,'')
               AND IFNULL(year,'')        = IFNULL(?,'')
               AND IFNULL(loa,'')         = IFNULL(?,'')
               AND IFNULL(asking_price,-1)= IFNULL(?,-1)
               AND IFNULL(sold_price,-1)  = IFNULL(?,-1)`
          )
          .get(args.vesselId ?? null, args.sourceId, m.builder, m.year, m.loa, m.asking_price, m.sold_price);
        if (dup) continue;

        const info = db
          .prepare(
            `INSERT INTO ma_comps
               (vessel_id, type, status, source_id, extraction_id, asking_price, sold_price,
                last_ask, discount, builder, year, loa, relevance_notes, fields_json, created_by)
             VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            args.vesselId ?? null, m.type, args.sourceId, args.extractionId, m.asking_price, m.sold_price,
            m.last_ask, m.discount, m.builder, m.year, m.loa, null, m.fields_json, args.createdBy ?? null
          );
        created.push(getCompInternal(db, Number(info.lastInsertRowid)) as CompRow);
      }
    });
    run();
    return created;
  } finally {
    db.close();
  }
}

export function listComps(opts: { vesselId?: number; status?: string; type?: string; limit?: number } = {}): CompRow[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
    const where: string[] = [];
    const argv: Array<number | string> = [];
    if (opts.vesselId != null) { where.push('vessel_id = ?'); argv.push(Number(opts.vesselId)); }
    if (opts.status) { where.push('status = ?'); argv.push(String(opts.status)); }
    if (opts.type) { where.push('type = ?'); argv.push(String(opts.type)); }
    const sql = `SELECT * FROM ma_comps ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    argv.push(limit);
    return db.prepare(sql).all(...argv) as CompRow[];
  } finally {
    db.close();
  }
}

export function getComp(id: number): CompRow | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return getCompInternal(db, id);
  } finally {
    db.close();
  }
}

function getCompInternal(db: Database.Database, id: number): CompRow | null {
  return (db.prepare(`SELECT * FROM ma_comps WHERE id = ?`).get(id) as CompRow | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Pass 4: broker comp review (approve/reject). Comps have no terminal-lock, so
// re-review is allowed; each review appends to ma_comp_field_history.
// ---------------------------------------------------------------------------

export function reviewComp(id: number, opts: { action: 'approve' | 'reject'; by?: string | null }): CompRow {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const run = db.transaction(() => {
      const c = getCompInternal(db, id);
      if (!c) throw new GovError(404, 'comp not found');
      const status = opts.action === 'approve' ? 'approved' : 'rejected';
      db.prepare(
        `UPDATE ma_comps SET status=?, reviewed_by=?, reviewed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
      ).run(status, opts.by ?? null, id);
      db.prepare(
        `INSERT INTO ma_comp_field_history (comp_id, field_key, action, value, status, source, by_user)
         VALUES (?, 'status', ?, ?, ?, 'broker', ?)`
      ).run(id, opts.action, status, status, opts.by ?? null);
      return getCompInternal(db, id) as CompRow;
    });
    return run();
  } finally {
    db.close();
  }
}
