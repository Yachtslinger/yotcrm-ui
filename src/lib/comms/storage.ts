/**
 * src/lib/comms/storage.ts
 * Database layer for the YotBot Communication Capture Platform.
 */
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

let _tablesReady = false;
export function initCommsTables() {
  if (_tablesReady) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS comms_threads (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_key    TEXT    NOT NULL UNIQUE,
        subject       TEXT    NOT NULL DEFAULT '',
        lead_id       INTEGER REFERENCES leads(id),
        first_seen    TEXT    NOT NULL DEFAULT (datetime('now')),
        last_activity TEXT    NOT NULL DEFAULT (datetime('now')),
        status        TEXT    NOT NULL DEFAULT 'pending',
        message_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS comms_messages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id     INTEGER NOT NULL REFERENCES comms_threads(id),
        message_id    TEXT    NOT NULL UNIQUE,
        in_reply_to   TEXT    DEFAULT '',
        from_address  TEXT    NOT NULL,
        from_name     TEXT    DEFAULT '',
        to_addresses  TEXT    NOT NULL DEFAULT '[]',
        cc_addresses  TEXT    NOT NULL DEFAULT '[]',
        subject       TEXT    DEFAULT '',
        body_plain    TEXT    DEFAULT '',
        body_html     TEXT    DEFAULT '',
        sent_at       TEXT    NOT NULL,
        direction     TEXT    NOT NULL DEFAULT 'inbound',
        raw_eml       TEXT    DEFAULT '',
        received_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS comms_extractions (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id           INTEGER NOT NULL REFERENCES comms_messages(id),
        extracted_at         TEXT    NOT NULL DEFAULT (datetime('now')),
        status               TEXT    NOT NULL DEFAULT 'pending',
        reviewed_at          TEXT    DEFAULT NULL,
        reviewed_by          TEXT    DEFAULT NULL,
        contact_name         TEXT    DEFAULT NULL,
        contact_name_conf    REAL    DEFAULT NULL,
        contact_email        TEXT    DEFAULT NULL,
        contact_email_conf   REAL    DEFAULT NULL,
        contact_phone        TEXT    DEFAULT NULL,
        contact_phone_conf   REAL    DEFAULT NULL,
        contact_company      TEXT    DEFAULT NULL,
        contact_company_conf REAL    DEFAULT NULL,
        yacht_makes          TEXT    NOT NULL DEFAULT '[]',
        yacht_models         TEXT    NOT NULL DEFAULT '[]',
        budget_range         TEXT    DEFAULT NULL,
        budget_conf          REAL    DEFAULT NULL,
        timeline             TEXT    DEFAULT NULL,
        timeline_conf        REAL    DEFAULT NULL,
        intent               TEXT    DEFAULT NULL,
        intent_conf          REAL    DEFAULT NULL,
        location_pref        TEXT    DEFAULT NULL,
        yacht_length_range   TEXT    DEFAULT NULL,
        year_range           TEXT    DEFAULT NULL,
        features_mentioned   TEXT    NOT NULL DEFAULT '[]',
        lead_category        TEXT    DEFAULT NULL,
        tags                 TEXT    NOT NULL DEFAULT '[]',
        suggested_tasks      TEXT    NOT NULL DEFAULT '[]',
        draft_reply          TEXT    DEFAULT NULL,
        draft_subject        TEXT    DEFAULT NULL,
        summary              TEXT    DEFAULT NULL,
        raw_extraction       TEXT    DEFAULT NULL,
        corrections          TEXT    NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS comms_contact_matches (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id    INTEGER NOT NULL REFERENCES comms_messages(id),
        lead_id       INTEGER REFERENCES leads(id),
        match_method  TEXT    NOT NULL DEFAULT '',
        confidence    REAL    NOT NULL DEFAULT 0,
        matched_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_comms_threads_status   ON comms_threads(status);
      CREATE INDEX IF NOT EXISTS idx_comms_threads_lead     ON comms_threads(lead_id);
      CREATE INDEX IF NOT EXISTS idx_comms_messages_thread  ON comms_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_comms_extractions_msg  ON comms_extractions(message_id);
      CREATE INDEX IF NOT EXISTS idx_comms_extractions_stat ON comms_extractions(status);

      CREATE TABLE IF NOT EXISTS comms_untracked (
        email       TEXT    PRIMARY KEY COLLATE NOCASE,
        reason      TEXT    DEFAULT '',
        marked_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        marked_by   TEXT    DEFAULT ''
      );
    `);
    _tablesReady = true;
  } finally { db.close(); }
}

// ── Types ────────────────────────────────────────────────────────────────────
export type CommsThread = {
  id: number; thread_key: string; subject: string; lead_id: number | null;
  first_seen: string; last_activity: string;
  status: "pending" | "reviewed" | "dismissed"; message_count: number;
};
export type CommsMessage = {
  id: number; thread_id: number; message_id: string; in_reply_to: string;
  from_address: string; from_name: string; to_addresses: string[]; cc_addresses: string[];
  subject: string; body_plain: string; body_html: string; sent_at: string;
  direction: "inbound" | "outbound" | "bcc"; raw_eml: string; received_at: string;
};
export type CommsExtraction = {
  id: number; message_id: number; extracted_at: string;
  status: "pending" | "approved" | "rejected" | "corrected";
  reviewed_at: string | null; reviewed_by: string | null;
  contact_name: string | null; contact_name_conf: number | null;
  contact_email: string | null; contact_email_conf: number | null;
  contact_phone: string | null; contact_phone_conf: number | null;
  contact_company: string | null; contact_company_conf: number | null;
  yacht_makes: string[]; yacht_models: string[];
  budget_range: string | null; budget_conf: number | null;
  timeline: string | null; timeline_conf: number | null;
  intent: string | null; intent_conf: number | null;
  location_pref: string | null; yacht_length_range: string | null; year_range: string | null;
  features_mentioned: string[]; lead_category: string | null; tags: string[];
  suggested_tasks: Array<{ text: string; due_days: number; priority: string }>;
  draft_reply: string | null; draft_subject: string | null; summary: string | null;
  raw_extraction: string | null;
  corrections: Array<{ field: string; old_value: unknown; new_value: unknown; corrected_by: string; corrected_at: string }>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pj<T>(val: unknown, fb: T): T {
  if (typeof val === "string") { try { return JSON.parse(val) as T; } catch { return fb; } }
  return fb;
}
function toMsg(row: Record<string, unknown>): CommsMessage {
  return { ...row as unknown as CommsMessage, to_addresses: pj(row.to_addresses, []), cc_addresses: pj(row.cc_addresses, []) };
}
function toExt(row: Record<string, unknown>): CommsExtraction {
  return { ...row as unknown as CommsExtraction,
    yacht_makes: pj(row.yacht_makes, []), yacht_models: pj(row.yacht_models, []),
    features_mentioned: pj(row.features_mentioned, []), tags: pj(row.tags, []),
    suggested_tasks: pj(row.suggested_tasks, []), corrections: pj(row.corrections, []) };
}

// ── Thread operations ────────────────────────────────────────────────────────
export function findThreadByKey(key: string): CommsThread | null {
  initCommsTables(); const db = getDb();
  try { return (db.prepare("SELECT * FROM comms_threads WHERE thread_key = ?").get(key) as CommsThread) || null; }
  finally { db.close(); }
}
export function createThread(data: { thread_key: string; subject: string; lead_id?: number | null }): CommsThread {
  initCommsTables(); const db = getDb();
  try {
    const r = db.prepare("INSERT INTO comms_threads (thread_key, subject, lead_id) VALUES (?,?,?)").run(data.thread_key, data.subject, data.lead_id ?? null);
    return db.prepare("SELECT * FROM comms_threads WHERE id = ?").get(r.lastInsertRowid) as CommsThread;
  } finally { db.close(); }
}
export function updateThreadActivity(threadId: number, leadId?: number | null) {
  initCommsTables(); const db = getDb();
  try {
    if (leadId !== undefined) {
      db.prepare("UPDATE comms_threads SET last_activity=datetime('now'), message_count=message_count+1, lead_id=COALESCE(lead_id,?) WHERE id=?").run(leadId, threadId);
    } else {
      db.prepare("UPDATE comms_threads SET last_activity=datetime('now'), message_count=message_count+1 WHERE id=?").run(threadId);
    }
  } finally { db.close(); }
}
export function updateThreadStatus(threadId: number, status: "pending" | "reviewed" | "dismissed") {
  initCommsTables(); const db = getDb();
  try { db.prepare("UPDATE comms_threads SET status=? WHERE id=?").run(status, threadId); }
  finally { db.close(); }
}
export function listThreads(opts: { status?: string; limit?: number; offset?: number } = {}): { threads: (CommsThread & { extraction_status?: string; from_address?: string })[]; total: number } {
  initCommsTables(); const db = getDb();
  try {
    const where = opts.status ? "WHERE t.status = ?" : "";
    const params: unknown[] = opts.status ? [opts.status] : [];
    const total = (db.prepare(`SELECT COUNT(*) as n FROM comms_threads t ${where}`).get(...params) as { n: number }).n;
    const rows = db.prepare(`
      SELECT t.*,
        (SELECT e.status FROM comms_extractions e JOIN comms_messages m ON e.message_id=m.id WHERE m.thread_id=t.id ORDER BY e.id DESC LIMIT 1) as extraction_status,
        (SELECT m.from_address FROM comms_messages m WHERE m.thread_id=t.id ORDER BY m.id ASC LIMIT 1) as from_address,
        (SELECT m.from_name FROM comms_messages m WHERE m.thread_id=t.id ORDER BY m.id ASC LIMIT 1) as from_name
      FROM comms_threads t ${where} ORDER BY t.last_activity DESC LIMIT ? OFFSET ?
    `).all(...params, opts.limit ?? 50, opts.offset ?? 0);
    return { threads: rows as (CommsThread & { extraction_status?: string; from_address?: string })[], total };
  } finally { db.close(); }
}
export function getThread(id: number): CommsThread | null {
  initCommsTables(); const db = getDb();
  try { return (db.prepare("SELECT * FROM comms_threads WHERE id = ?").get(id) as CommsThread) || null; }
  finally { db.close(); }
}

// ── Message operations ───────────────────────────────────────────────────────
export function findMessageByMessageId(messageId: string): CommsMessage | null {
  initCommsTables(); const db = getDb();
  try { const r = db.prepare("SELECT * FROM comms_messages WHERE message_id = ?").get(messageId); return r ? toMsg(r as Record<string, unknown>) : null; }
  finally { db.close(); }
}
export function createMessage(data: {
  thread_id: number; message_id: string; in_reply_to?: string;
  from_address: string; from_name?: string; to_addresses: string[]; cc_addresses?: string[];
  subject?: string; body_plain?: string; body_html?: string;
  sent_at: string; direction?: string; raw_eml?: string;
}): CommsMessage {
  initCommsTables(); const db = getDb();
  try {
    const r = db.prepare(`INSERT INTO comms_messages (thread_id,message_id,in_reply_to,from_address,from_name,to_addresses,cc_addresses,subject,body_plain,body_html,sent_at,direction,raw_eml) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      data.thread_id, data.message_id, data.in_reply_to ?? "", data.from_address, data.from_name ?? "",
      JSON.stringify(data.to_addresses), JSON.stringify(data.cc_addresses ?? []),
      data.subject ?? "", data.body_plain ?? "", data.body_html ?? "",
      data.sent_at, data.direction ?? "inbound", data.raw_eml ?? "");
    return toMsg(db.prepare("SELECT * FROM comms_messages WHERE id = ?").get(r.lastInsertRowid) as Record<string, unknown>);
  } finally { db.close(); }
}
export function getMessage(id: number): CommsMessage | null {
  initCommsTables(); const db = getDb();
  try { const r = db.prepare("SELECT * FROM comms_messages WHERE id = ?").get(id); return r ? toMsg(r as Record<string, unknown>) : null; }
  finally { db.close(); }
}
export function getThreadMessages(threadId: number): CommsMessage[] {
  initCommsTables(); const db = getDb();
  try { return db.prepare("SELECT * FROM comms_messages WHERE thread_id = ? ORDER BY sent_at ASC").all(threadId).map((r: unknown) => toMsg(r as Record<string, unknown>)); }
  finally { db.close(); }
}

// ── Extraction operations ────────────────────────────────────────────────────
export function createExtraction(msgId: number): CommsExtraction {
  initCommsTables(); const db = getDb();
  try {
    const r = db.prepare("INSERT INTO comms_extractions (message_id) VALUES (?)").run(msgId);
    return toExt(db.prepare("SELECT * FROM comms_extractions WHERE id = ?").get(r.lastInsertRowid) as Record<string, unknown>);
  } finally { db.close(); }
}
export function getLatestExtraction(msgId: number): CommsExtraction | null {
  initCommsTables(); const db = getDb();
  try { const r = db.prepare("SELECT * FROM comms_extractions WHERE message_id = ? ORDER BY id DESC LIMIT 1").get(msgId); return r ? toExt(r as Record<string, unknown>) : null; }
  finally { db.close(); }
}
export function getExtraction(id: number): CommsExtraction | null {
  initCommsTables(); const db = getDb();
  try { const r = db.prepare("SELECT * FROM comms_extractions WHERE id = ?").get(id); return r ? toExt(r as Record<string, unknown>) : null; }
  finally { db.close(); }
}
export function updateExtraction(id: number, fields: Partial<Record<string, unknown>>) {
  initCommsTables(); const db = getDb();
  try {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const set = keys.map(k => `${k} = ?`).join(", ");
    db.prepare(`UPDATE comms_extractions SET ${set} WHERE id = ?`).run(...Object.values(fields), id);
  } finally { db.close(); }
}
export function listPendingExtractions(limit = 50): (CommsExtraction & { from_address: string; from_name: string; sent_at: string; thread_subject: string; thread_id: number })[] {
  initCommsTables(); const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT e.*, m.from_address, m.from_name, m.sent_at, t.subject as thread_subject, t.id as thread_id
      FROM comms_extractions e
      JOIN comms_messages m ON e.message_id = m.id
      JOIN comms_threads t ON m.thread_id = t.id
      WHERE e.status = 'pending'
      ORDER BY m.sent_at DESC LIMIT ?
    `).all(limit);
    return rows.map(r => ({ ...toExt(r as Record<string, unknown>), ...(r as Record<string, unknown>) })) as (CommsExtraction & { from_address: string; from_name: string; sent_at: string; thread_subject: string; thread_id: number })[];
  } finally { db.close(); }
}
export function appendCorrection(extractionId: number, correction: { field: string; old_value: unknown; new_value: unknown; corrected_by: string }) {
  initCommsTables(); const db = getDb();
  try {
    const row = db.prepare("SELECT corrections FROM comms_extractions WHERE id = ?").get(extractionId) as { corrections: string } | undefined;
    if (!row) return;
    const existing = pj<unknown[]>(row.corrections, []);
    existing.push({ ...correction, corrected_at: new Date().toISOString() });
    db.prepare("UPDATE comms_extractions SET corrections = ?, status = 'corrected' WHERE id = ?").run(JSON.stringify(existing), extractionId);
  } finally { db.close(); }
}

// ── Contact match log ────────────────────────────────────────────────────────
export function logContactMatch(data: { message_id: number; lead_id: number | null; match_method: string; confidence: number }) {
  initCommsTables(); const db = getDb();
  try { db.prepare("INSERT INTO comms_contact_matches (message_id, lead_id, match_method, confidence) VALUES (?,?,?,?)").run(data.message_id, data.lead_id, data.match_method, data.confidence); }
  finally { db.close(); }
}
export function getContactMatches(messageId: number): { lead_id: number | null; match_method: string; confidence: number }[] {
  initCommsTables(); const db = getDb();
  try { return db.prepare("SELECT lead_id, match_method, confidence FROM comms_contact_matches WHERE message_id = ? ORDER BY confidence DESC").all(messageId) as { lead_id: number | null; match_method: string; confidence: number }[]; }
  finally { db.close(); }
}

// ── Untracked contacts (do-not-track list) ──────────────────────────────────
export function isUntracked(email: string): boolean {
  if (!email) return false;
  initCommsTables(); const db = getDb();
  try {
    const row = db.prepare("SELECT email FROM comms_untracked WHERE email = ? COLLATE NOCASE").get(email.trim().toLowerCase());
    return !!row;
  } finally { db.close(); }
}
export function markUntracked(email: string, reason = "", markedBy = "user"): void {
  if (!email) return;
  initCommsTables(); const db = getDb();
  try {
    db.prepare("INSERT OR REPLACE INTO comms_untracked (email, reason, marked_at, marked_by) VALUES (?, ?, datetime('now'), ?)")
      .run(email.trim().toLowerCase(), reason, markedBy);
  } finally { db.close(); }
}
export function unmarkUntracked(email: string): void {
  if (!email) return;
  initCommsTables(); const db = getDb();
  try { db.prepare("DELETE FROM comms_untracked WHERE email = ? COLLATE NOCASE").run(email.trim().toLowerCase()); }
  finally { db.close(); }
}
export function listUntracked(): { email: string; reason: string; marked_at: string; marked_by: string }[] {
  initCommsTables(); const db = getDb();
  try { return db.prepare("SELECT email, reason, marked_at, marked_by FROM comms_untracked ORDER BY marked_at DESC").all() as { email: string; reason: string; marked_at: string; marked_by: string }[]; }
  finally { db.close(); }
}
