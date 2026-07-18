import type { Database } from "better-sqlite3";

/**
 * Idempotent schema guard for the leads-rework features.
 * Lets these routes deploy to any environment (prod Railway included)
 * without a separate migration step — same pattern as /api/sync.
 */
export function ensureLeadsSchema(db: Database) {
  const add = (sql: string) => { try { db.exec(sql); } catch {} };
  add(`ALTER TABLE leads ADD COLUMN category TEXT`);
  add(`ALTER TABLE leads ADD COLUMN pinned_temperature TEXT`);
  add(`ALTER TABLE leads ADD COLUMN profile_status TEXT NOT NULL DEFAULT 'none'`);
  add(`ALTER TABLE leads ADD COLUMN profile_confidence_json TEXT DEFAULT '{}'`);
  add(`ALTER TABLE leads ADD COLUMN profile_source_ref TEXT`);
  add(`ALTER TABLE leads ADD COLUMN suggested_category TEXT`);
  add(`ALTER TABLE leads ADD COLUMN prospect_score REAL`);
  add(`ALTER TABLE leads ADD COLUMN suggest_reason TEXT`);
  add(`CREATE TABLE IF NOT EXISTS match_board_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parsed_listing_id INTEGER NOT NULL, lead_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('dismissed','sent')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(parsed_listing_id, lead_id))`);
  add(`CREATE TABLE IF NOT EXISTS match_weight_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL, dimension TEXT NOT NULL, value TEXT NOT NULL,
    dismiss_count INTEGER NOT NULL DEFAULT 0,
    weight_multiplier REAL NOT NULL DEFAULT 1.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(lead_id, dimension, value))`);
}
