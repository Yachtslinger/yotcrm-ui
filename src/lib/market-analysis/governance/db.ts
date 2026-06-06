import Database from 'better-sqlite3';
import { GOVERNANCE_SCHEMA_VERSION } from './types';

/**
 * Market Analysis — Governed Valuation persistence foundation (Pass 1, schema only).
 *
 * Additive and namespaced (`ma_*`). Follows the existing YotCRM convention:
 * a per-module getDb() + idempotent CREATE TABLE IF NOT EXISTS initializer, no ORM.
 * Does NOT touch the existing `market_analyses` table or the quick-analysis flow.
 * Nothing invokes initGovernanceTables() yet; calling it is safe and idempotent.
 */

export function getGovernanceDb(): Database.Database {
  const dbPath = process.env.DB_PATH || '/app/data/yotcrm.db';
  const db = new Database(dbPath, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

let _ready = false;

export function initGovernanceTables(): void {
  if (_ready) return;
  const db = getGovernanceDb();
  try {
    db.exec(TABLES_SQL);
    db.exec(INDEXES_SQL);
    db.exec(TRIGGERS_SQL);
    db.prepare(
      `INSERT INTO ma_schema_meta (key, value) VALUES ('governance_schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(String(GOVERNANCE_SCHEMA_VERSION));
    _ready = true;
  } finally {
    db.close();
  }
}

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS ma_schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ma_sources (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT    NOT NULL DEFAULT 'other',
  label           TEXT    NOT NULL DEFAULT '',
  content_text    TEXT    NOT NULL DEFAULT '',
  created_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ma_extractions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       INTEGER NOT NULL,
  target_type     TEXT    NOT NULL,            -- 'vessel' | 'comp' | 'report'
  target_id       INTEGER,
  model           TEXT,
  triggered_by    TEXT,
  triggered_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  extracted_json  TEXT    NOT NULL DEFAULT '{}',
  original_status TEXT,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (source_id) REFERENCES ma_sources(id)
);

CREATE TABLE IF NOT EXISTS ma_vessels (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name    TEXT    NOT NULL DEFAULT '',
  boat_id         INTEGER,                     -- optional soft link to boats(id); no FK by design
  listing_id      INTEGER,                     -- optional soft link to my_listings(id); no FK by design
  status          TEXT    NOT NULL DEFAULT 'active',
  created_by      TEXT,
  updated_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ma_vessel_fields (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id       INTEGER NOT NULL,
  field_key       TEXT    NOT NULL,
  value           TEXT,
  status          TEXT    NOT NULL DEFAULT 'unverified',
  source_id       INTEGER,
  extraction_id   INTEGER,
  created_by      TEXT,
  updated_by      TEXT,
  verified_by     TEXT,
  accepted_by     TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (vessel_id, field_key),
  FOREIGN KEY (vessel_id)     REFERENCES ma_vessels(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id)     REFERENCES ma_sources(id),
  FOREIGN KEY (extraction_id) REFERENCES ma_extractions(id)
);

CREATE TABLE IF NOT EXISTS ma_field_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id       INTEGER NOT NULL,
  field_key       TEXT    NOT NULL,
  action          TEXT    NOT NULL,
  value           TEXT,
  status          TEXT,
  source          TEXT,
  by_user         TEXT,
  at              TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (vessel_id) REFERENCES ma_vessels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ma_vessel_field_proposals (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id                  INTEGER NOT NULL,
  source_id                  INTEGER,
  extraction_id              INTEGER,
  field_name                 TEXT    NOT NULL,
  proposed_value             TEXT,
  current_value_at_proposal  TEXT,
  status                     TEXT    NOT NULL DEFAULT 'pending',
  conflict                   INTEGER NOT NULL DEFAULT 0,
  created_by                 TEXT,
  created_at                 TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_by                TEXT,
  resolved_at                TEXT,
  resolution_notes           TEXT,
  history_json               TEXT    NOT NULL DEFAULT '[]',
  schema_version             INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (vessel_id)     REFERENCES ma_vessels(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id)     REFERENCES ma_sources(id),
  FOREIGN KEY (extraction_id) REFERENCES ma_extractions(id)
);

CREATE TABLE IF NOT EXISTS ma_comps (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id       INTEGER,
  type            TEXT    NOT NULL DEFAULT 'active',   -- 'active' | 'closed'
  status          TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  source_id       INTEGER,
  extraction_id   INTEGER,
  asking_price    INTEGER,
  sold_price      INTEGER,
  last_ask        INTEGER,
  discount        REAL,
  builder         TEXT,
  year            TEXT,
  loa             TEXT,
  relevance_notes TEXT,
  fields_json     TEXT    NOT NULL DEFAULT '{}',
  created_by      TEXT,
  reviewed_by     TEXT,
  reviewed_at     TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (vessel_id)     REFERENCES ma_vessels(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id)     REFERENCES ma_sources(id),
  FOREIGN KEY (extraction_id) REFERENCES ma_extractions(id)
);

CREATE TABLE IF NOT EXISTS ma_comp_field_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  comp_id         INTEGER NOT NULL,
  field_key       TEXT    NOT NULL,
  action          TEXT    NOT NULL,
  value           TEXT,
  status          TEXT,
  source          TEXT,
  by_user         TEXT,
  at              TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (comp_id) REFERENCES ma_comps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ma_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id       INTEGER NOT NULL,
  mode            TEXT    NOT NULL DEFAULT 'sell',   -- 'sell' | 'buy'
  version         INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'draft',
  created_by      TEXT,
  updated_by      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (vessel_id) REFERENCES ma_vessels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ma_report_sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id       INTEGER NOT NULL,
  section_key     TEXT    NOT NULL,
  content_json    TEXT    NOT NULL DEFAULT '{}',
  status          TEXT    NOT NULL DEFAULT 'empty',  -- 'empty'|'generated'|'edited'|'approved'
  source          TEXT,                              -- 'ai'|'broker'
  generated_by    TEXT,
  approved_by     TEXT,
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  schema_version  INTEGER NOT NULL DEFAULT 1,
  UNIQUE (report_id, section_key),
  FOREIGN KEY (report_id) REFERENCES ma_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ma_report_versions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id             INTEGER NOT NULL,
  version               INTEGER NOT NULL,
  finalized_by          TEXT,
  finalized_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  confidence            TEXT,
  warnings_json         TEXT    NOT NULL DEFAULT '[]',
  vessel_snapshot_json  TEXT    NOT NULL DEFAULT '{}',
  active_comps_json     TEXT    NOT NULL DEFAULT '[]',
  closed_comps_json     TEXT    NOT NULL DEFAULT '[]',
  sections_json         TEXT    NOT NULL DEFAULT '{}',
  schema_version        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (report_id, version),
  FOREIGN KEY (report_id) REFERENCES ma_reports(id)
);
`;

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_ma_vessel_fields_vessel   ON ma_vessel_fields(vessel_id);
CREATE INDEX IF NOT EXISTS idx_ma_field_history_vessel   ON ma_field_history(vessel_id, field_key);
CREATE INDEX IF NOT EXISTS idx_ma_extractions_source     ON ma_extractions(source_id);
CREATE INDEX IF NOT EXISTS idx_ma_extractions_target     ON ma_extractions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_ma_proposals_vessel       ON ma_vessel_field_proposals(vessel_id);
CREATE INDEX IF NOT EXISTS idx_ma_proposals_status       ON ma_vessel_field_proposals(status);
CREATE INDEX IF NOT EXISTS idx_ma_proposals_pending_key  ON ma_vessel_field_proposals(vessel_id, field_name, status);
CREATE INDEX IF NOT EXISTS idx_ma_comps_vessel           ON ma_comps(vessel_id);
CREATE INDEX IF NOT EXISTS idx_ma_comps_status           ON ma_comps(status);
CREATE INDEX IF NOT EXISTS idx_ma_comps_type             ON ma_comps(type);
CREATE INDEX IF NOT EXISTS idx_ma_comp_history_comp      ON ma_comp_field_history(comp_id, field_key);
CREATE INDEX IF NOT EXISTS idx_ma_reports_vessel         ON ma_reports(vessel_id);
CREATE INDEX IF NOT EXISTS idx_ma_report_sections_report ON ma_report_sections(report_id);
CREATE INDEX IF NOT EXISTS idx_ma_report_versions_report ON ma_report_versions(report_id);
`;

const TRIGGERS_SQL = `
-- Immutability: extraction logs may never be updated or deleted.
CREATE TRIGGER IF NOT EXISTS trg_ma_extractions_no_update
BEFORE UPDATE ON ma_extractions
BEGIN
  SELECT RAISE(ABORT, 'ma_extractions is immutable: updates are not allowed');
END;
CREATE TRIGGER IF NOT EXISTS trg_ma_extractions_no_delete
BEFORE DELETE ON ma_extractions
BEGIN
  SELECT RAISE(ABORT, 'ma_extractions is immutable: deletes are not allowed');
END;

-- Immutability: finalized report versions are frozen snapshots.
CREATE TRIGGER IF NOT EXISTS trg_ma_report_versions_no_update
BEFORE UPDATE ON ma_report_versions
BEGIN
  SELECT RAISE(ABORT, 'ma_report_versions is immutable: updates are not allowed');
END;
CREATE TRIGGER IF NOT EXISTS trg_ma_report_versions_no_delete
BEFORE DELETE ON ma_report_versions
BEGIN
  SELECT RAISE(ABORT, 'ma_report_versions is immutable: deletes are not allowed');
END;

-- Terminal-lock: a resolved proposal cannot be modified.
-- Corrections must be made via a new proposal or an appended history event.
CREATE TRIGGER IF NOT EXISTS trg_ma_proposals_terminal_lock
BEFORE UPDATE ON ma_vessel_field_proposals
WHEN OLD.status IN ('accepted', 'edited_accepted', 'rejected', 'overridden')
BEGIN
  SELECT RAISE(ABORT, 'resolved proposal is terminal and cannot be modified');
END;
`;
