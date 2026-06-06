import Database from 'better-sqlite3';
import { getGovernanceDb, initGovernanceTables } from './db';

/**
 * Source records (governed Market Analysis). Persistent evidence items.
 * Create + read only — sources are not edited or deleted in this pass.
 */

export const SOURCE_KINDS = ['listing', 'sold', 'survey', 'note', 'ais', 'spec', 'other'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

const MAX_CONTENT = 2_000_000; // ~2MB guard on stored text
const MAX_LABEL = 500;
const MAX_BY = 200;

export interface SourceInput {
  kind?: string;
  label?: string;
  content_text?: string;
  createdBy?: string | null;
}

export interface SourceRow {
  id: number;
  kind: string;
  label: string;
  content_text: string;
  created_by: string | null;
  created_at: string;
  schema_version: number;
}

export type SourceListItem = Omit<SourceRow, 'content_text'> & { content_preview: string };

export function createSource(input: SourceInput): SourceRow {
  initGovernanceTables();
  const kind: string = (SOURCE_KINDS as readonly string[]).includes(String(input.kind))
    ? String(input.kind)
    : 'other';
  const label = String(input.label ?? '').slice(0, MAX_LABEL);
  const content = String(input.content_text ?? '');
  if (content.length > MAX_CONTENT) throw new Error('content_text exceeds size limit');
  const createdBy = input.createdBy ? String(input.createdBy).slice(0, MAX_BY) : null;

  const db = getGovernanceDb();
  try {
    const info = db
      .prepare(`INSERT INTO ma_sources (kind, label, content_text, created_by) VALUES (?, ?, ?, ?)`)
      .run(kind, label, content, createdBy);
    return getSourceInternal(db, Number(info.lastInsertRowid)) as SourceRow;
  } finally {
    db.close();
  }
}

export function listSources(opts: { kind?: string; limit?: number } = {}): SourceListItem[] {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const base =
      `SELECT id, kind, label, created_by, created_at, schema_version,
              substr(content_text, 1, 200) AS content_preview
       FROM ma_sources`;
    const rows = opts.kind
      ? db.prepare(`${base} WHERE kind = ? ORDER BY id DESC LIMIT ?`).all(opts.kind, limit)
      : db.prepare(`${base} ORDER BY id DESC LIMIT ?`).all(limit);
    return rows as SourceListItem[];
  } finally {
    db.close();
  }
}

export function getSource(id: number): SourceRow | null {
  initGovernanceTables();
  const db = getGovernanceDb();
  try {
    return getSourceInternal(db, id);
  } finally {
    db.close();
  }
}

function getSourceInternal(db: Database.Database, id: number): SourceRow | null {
  return (db.prepare(`SELECT * FROM ma_sources WHERE id = ?`).get(id) as SourceRow | undefined) ?? null;
}
