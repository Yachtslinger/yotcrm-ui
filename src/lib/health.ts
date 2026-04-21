import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  return db;
}

let _healthReady = false;
function ensureHealthTable() {
  if (_healthReady) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS morning_send_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        assignee    TEXT    NOT NULL DEFAULT 'will',
        item_count  INTEGER NOT NULL DEFAULT 0,
        sent_to     TEXT    NOT NULL DEFAULT '',
        status      TEXT    NOT NULL DEFAULT 'ok',
        error       TEXT,
        sent_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_morning_log_at ON morning_send_log(sent_at DESC);
    `);
    _healthReady = true;
  } finally { db.close(); }
}

export type MorningSendRecord = {
  id: number;
  assignee: string;
  item_count: number;
  sent_to: string;
  status: string;
  error: string | null;
  sent_at: string;
};

export function logMorningSend(
  assignee: string,
  itemCount: number,
  sentTo: string,
  status: "ok" | "error",
  error?: string
): void {
  ensureHealthTable();
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO morning_send_log (assignee, item_count, sent_to, status, error, sent_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(assignee, itemCount, sentTo, status, error ?? null);
  } finally { db.close(); }
}

export function getLastMorningSend(assignee = "will"): MorningSendRecord | null {
  ensureHealthTable();
  const db = getDb();
  try {
    return db.prepare(
      `SELECT * FROM morning_send_log WHERE assignee = ? ORDER BY sent_at DESC LIMIT 1`
    ).get(assignee) as MorningSendRecord | null;
  } finally { db.close(); }
}

export function getRecentSends(limit = 5): MorningSendRecord[] {
  ensureHealthTable();
  const db = getDb();
  try {
    return db.prepare(
      `SELECT * FROM morning_send_log ORDER BY sent_at DESC LIMIT ?`
    ).all(limit) as MorningSendRecord[];
  } finally { db.close(); }
}
