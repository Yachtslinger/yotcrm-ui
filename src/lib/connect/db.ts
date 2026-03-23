// src/lib/connect/db.ts
// Connect engine — SQLite table initialization

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/app/data/yotcrm.db';

export function getConnectDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

let _tablesReady = false;

export function initConnectTables() {
  if (_tablesReady) return;
  const db = getConnectDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_match_scores (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id               INTEGER NOT NULL,
        brochure_id           INTEGER NOT NULL,
        score                 INTEGER NOT NULL DEFAULT 0,
        confidence            TEXT    NOT NULL DEFAULT 'low',
        routing               TEXT    NOT NULL DEFAULT 'suppressed',
        manual_priority_score INTEGER NOT NULL DEFAULT 0,
        score_version         INTEGER NOT NULL DEFAULT 1,
        is_stale              INTEGER NOT NULL DEFAULT 0,
        scored_at             TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(lead_id, brochure_id)
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cms_routing  ON connect_match_scores(routing);
      CREATE INDEX IF NOT EXISTS idx_cms_priority ON connect_match_scores(manual_priority_score DESC);
      CREATE INDEX IF NOT EXISTS idx_cms_lead     ON connect_match_scores(lead_id);
      CREATE INDEX IF NOT EXISTS idx_cms_brochure ON connect_match_scores(brochure_id);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_match_explanations (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id         INTEGER NOT NULL UNIQUE,
        summary_sentence TEXT    DEFAULT '',
        top_reasons      TEXT    DEFAULT '[]',
        top_penalties    TEXT    DEFAULT '[]',
        caution_flags    TEXT    DEFAULT '[]',
        next_best_action TEXT    DEFAULT '{}',
        score_breakdown  TEXT    DEFAULT '{}',
        routing_reason   TEXT    DEFAULT '',
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (match_id) REFERENCES connect_match_scores(id) ON DELETE CASCADE
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_exposure_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id       INTEGER NOT NULL,
        brochure_id   INTEGER NOT NULL,
        sent_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        channel       TEXT    DEFAULT 'email',
        sent_by       TEXT    DEFAULT '',
        score_at_send INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_ceh_pair ON connect_exposure_history(lead_id, brochure_id);
      CREATE INDEX IF NOT EXISTS idx_ceh_sent ON connect_exposure_history(sent_at);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_exposure_summary (
        lead_id       INTEGER NOT NULL,
        brochure_id   INTEGER NOT NULL,
        sent_count    INTEGER NOT NULL DEFAULT 0,
        first_sent_at TEXT,
        last_sent_at  TEXT,
        PRIMARY KEY (lead_id, brochure_id)
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_engagement_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id      INTEGER NOT NULL,
        brochure_id  INTEGER,
        event_type   TEXT NOT NULL,
        event_source TEXT DEFAULT '',
        occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
        metadata     TEXT DEFAULT '{}',
        score_impact INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_cee_pair     ON connect_engagement_events(lead_id, brochure_id);
      CREATE INDEX IF NOT EXISTS idx_cee_occurred ON connect_engagement_events(occurred_at);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_routing_queue (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id      INTEGER NOT NULL,
        brochure_id  INTEGER NOT NULL,
        match_id     INTEGER,
        queue_type   TEXT NOT NULL DEFAULT 'manual',
        status       TEXT NOT NULL DEFAULT 'pending',
        priority     INTEGER DEFAULT 50,
        added_at     TEXT NOT NULL DEFAULT (datetime('now')),
        actioned_at  TEXT,
        actioned_by  TEXT,
        expires_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_crq_queue_status ON connect_routing_queue(queue_type, status);
      CREATE INDEX IF NOT EXISTS idx_crq_priority     ON connect_routing_queue(priority ASC);
      CREATE INDEX IF NOT EXISTS idx_crq_lead         ON connect_routing_queue(lead_id);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_broker_overrides (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id       INTEGER,
        brochure_id   INTEGER,
        broker_id     TEXT    NOT NULL DEFAULT '',
        override_type TEXT    NOT NULL,
        boost_value   INTEGER DEFAULT 0,
        reason        TEXT    DEFAULT '',
        expires_at    TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        is_active     INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_cbo_pair ON connect_broker_overrides(lead_id, brochure_id);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_suppression_rules (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_type   TEXT NOT NULL DEFAULT 'pair',
        lead_id     INTEGER,
        brochure_id INTEGER,
        reason      TEXT DEFAULT '',
        created_by  TEXT DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_csr_lead     ON connect_suppression_rules(lead_id);
      CREATE INDEX IF NOT EXISTS idx_csr_brochure ON connect_suppression_rules(brochure_id);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_bot_actions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id       INTEGER NOT NULL,
        brochure_id   INTEGER,
        action_type   TEXT NOT NULL DEFAULT 'send_email',
        status        TEXT NOT NULL DEFAULT 'queued',
        scheduled_at  TEXT,
        executed_at   TEXT,
        payload       TEXT DEFAULT '{}',
        error_message TEXT DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cba_status    ON connect_bot_actions(status);
      CREATE INDEX IF NOT EXISTS idx_cba_scheduled ON connect_bot_actions(scheduled_at);
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS connect_dashboard_metrics (
        id           INTEGER PRIMARY KEY DEFAULT 1,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        computed_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    _tablesReady = true;
  } finally {
    db.close();
  }
}
