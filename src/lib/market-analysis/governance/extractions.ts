import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';

/**
 * Immutable extraction logs (governed Market Analysis).
 * Pass 2 records the log only — it does NOT run the AI parser or stage
 * proposals/comps (that is Pass 3). Create + read only; no mutators exist,
 * and the DB triggers also block UPDATE/DELETE.
 */

export const EXTRACTION_TARGETS = ['vessel', 'comp', 'report'] as const;
export type ExtractionTarget = (typeof EXTRACTION_TARGETS)[number];

const MAX_PAYLOAD = 2_000_000; // ~2MB guard on extracted JSON
const MAX_STR = 200;

export interface ExtractionInput {
  sourceId: number;
  targetType: string;
  targetId?: number | null;
  model?: string | null;
  triggeredBy?: string | null;
  extracted: unknown;
  originalStatus?: string | null;
}

export interface ExtractionRow {
  id: number;
  source_id: number;
  target_type: string;
  target_id: number | null;
  model: string | null;
  triggered_by: string | null;
  triggered_at: string;
  extracted_json: string;
  original_status: string | null;
  schema_version: number;
}

export type ExtractionListItem = Omit<ExtractionRow, 'extracted_json'>;

export function createExtraction(input: ExtractionInput): ExtractionRow {
  initGovernanceTables();
  if (!(EXTRACTION_TARGETS as readonly string[]).includes(String(input.targetType))) {
    throw new Error('invalid targetType (expected vessel | comp | report)');
  }
  if (input.sourceId == null || Number.isNaN(Number(input.sourceId))) {
    throw new Error('sourceId is required');
  }
  const json = JSON.stringify(input.extracted ?? {});
  if (json.length > MAX_PAYLOAD) throw new Error('extracted payload exceeds size limit');

  const db = getGovernanceDb();
  try {
    const src = db.prepare(`SELECT id FROM ma_sources WHERE id = ?`).get(input.sourceId);
    if (!src) throw new Error('source not found');
    const info = db
      .prepare(
        `INSERT INTO ma_extractions
           (source_id, target_type, target_id, model, triggered_by, extracted_json, original_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(input.sourceId),
        String(input.targetType),
        input.targetId ?? null,
        input.model ? String(input.model).slice(0, MAX_STR) : null,
        input.triggeredBy ? String(input.triggeredBy).slice(0, MAX_STR) : null,
        json,
        input.originalStatus ? String(input.originalStatus).slice(0, MAX_STR) : null
      );
    return getExtractionInternal(db, Number(info.lastInsertRowid)) as ExtractionRow;
  } finally {
    db.close();
  }
}

export function listExtractions(
  opts: { sourceId?: number; targetType?: string; limit?: number } = {}
): ExtractionListItem[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const where: string[] = [];
    const args: Array<number | string> = [];
    if (opts.sourceId != null) { where.push('source_id = ?'); args.push(Number(opts.sourceId)); }
    if (opts.targetType) { where.push('target_type = ?'); args.push(String(opts.targetType)); }
    const sql =
      `SELECT id, source_id, target_type, target_id, model, triggered_by, triggered_at,
              original_status, schema_version
       FROM ma_extractions
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY id DESC LIMIT ?`;
    args.push(limit);
    return db.prepare(sql).all(...args) as ExtractionListItem[];
  } finally {
    db.close();
  }
}

export function getExtraction(id: number): ExtractionRow | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return getExtractionInternal(db, id);
  } finally {
    db.close();
  }
}

function getExtractionInternal(db: Database.Database, id: number): ExtractionRow | null {
  return (db.prepare(`SELECT * FROM ma_extractions WHERE id = ?`).get(id) as ExtractionRow | undefined) ?? null;
}
