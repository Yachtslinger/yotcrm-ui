import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SentEmail = {
  id: number;
  message_id: string;
  lead_id: number | null;
  subject: string;
  body_plain: string;
  to_addresses: string;   // JSON array
  cc_addresses: string;   // JSON array
  from_address: string;
  sent_at: string;
  match_confidence: string; // "high" | "review"
  ingested_at: string;
};

export type EmailIngestFailure = {
  id: number;
  message_id: string | null;
  subject: string;
  to_address: string;
  reason: string;
  raw_payload: string;   // JSON of full payload for reprocess
  created_at: string;
  resolved: number;      // 0 | 1
  resolved_lead_id: number | null;
  resolved_at: string | null;
};

// ─── Table init ───────────────────────────────────────────────────────────────

let _emailsReady = false;
export function ensureEmailTables() {
  if (_emailsReady) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sent_emails (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id      TEXT    UNIQUE NOT NULL,
        lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        subject         TEXT    NOT NULL DEFAULT '',
        body_plain      TEXT    NOT NULL DEFAULT '',
        to_addresses    TEXT    NOT NULL DEFAULT '[]',
        cc_addresses    TEXT    NOT NULL DEFAULT '[]',
        from_address    TEXT    NOT NULL DEFAULT '',
        sent_at         TEXT    NOT NULL,
        match_confidence TEXT   NOT NULL DEFAULT 'high',
        ingested_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sent_emails_lead   ON sent_emails(lead_id, sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sent_emails_msg_id ON sent_emails(message_id);

      CREATE TABLE IF NOT EXISTS email_ingest_failures (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id       TEXT,
        subject          TEXT    NOT NULL DEFAULT '',
        to_address       TEXT    NOT NULL DEFAULT '',
        reason           TEXT    NOT NULL DEFAULT '',
        raw_payload      TEXT    NOT NULL DEFAULT '{}',
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        resolved         INTEGER NOT NULL DEFAULT 0,
        resolved_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        resolved_at      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_email_failures_resolved ON email_ingest_failures(resolved, created_at DESC);
    `);
    _emailsReady = true;
  } finally { db.close(); }
}

// ─── Sent email CRUD ──────────────────────────────────────────────────────────

export function getSentEmailsByLead(leadId: number): SentEmail[] {
  const db = getDb();
  try {
    ensureEmailTables();
    return db.prepare(
      `SELECT * FROM sent_emails WHERE lead_id = ? ORDER BY sent_at DESC`
    ).all(leadId) as SentEmail[];
  } finally { db.close(); }
}

export function getSentEmailByMessageId(messageId: string): SentEmail | null {
  const db = getDb();
  try {
    ensureEmailTables();
    return db.prepare(
      `SELECT * FROM sent_emails WHERE message_id = ?`
    ).get(messageId) as SentEmail | null;
  } finally { db.close(); }
}

export function createSentEmail(data: {
  messageId: string;
  leadId: number | null;
  subject: string;
  bodyPlain: string;
  toAddresses: string[];
  ccAddresses: string[];
  fromAddress: string;
  sentAt: string;
  matchConfidence: "high" | "review";
}): SentEmail {
  ensureEmailTables();
  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO sent_emails
        (message_id, lead_id, subject, body_plain, to_addresses, cc_addresses,
         from_address, sent_at, match_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.messageId,
      data.leadId,
      data.subject,
      data.bodyPlain,
      JSON.stringify(data.toAddresses),
      JSON.stringify(data.ccAddresses),
      data.fromAddress,
      data.sentAt,
      data.matchConfidence
    );
    return db.prepare("SELECT * FROM sent_emails WHERE id = ?")
      .get(result.lastInsertRowid) as SentEmail;
  } finally { db.close(); }
}

export function assignEmailToLead(emailId: number, leadId: number): void {
  const db = getDb();
  try {
    ensureEmailTables();
    db.prepare("UPDATE sent_emails SET lead_id = ?, match_confidence = 'high' WHERE id = ?")
      .run(leadId, emailId);
  } finally { db.close(); }
}

// ─── Match lead by email address ──────────────────────────────────────────────

export function findLeadByEmail(email: string): { id: number; first_name: string; last_name: string } | null {
  const db = getDb();
  try {
    return db.prepare(
      `SELECT id, first_name, last_name FROM leads WHERE LOWER(email) = LOWER(?) LIMIT 1`
    ).get(email.trim()) as { id: number; first_name: string; last_name: string } | null;
  } finally { db.close(); }
}

// ─── Failure queue CRUD ───────────────────────────────────────────────────────

export function getUnresolvedFailures(): EmailIngestFailure[] {
  const db = getDb();
  try {
    ensureEmailTables();
    return db.prepare(
      `SELECT * FROM email_ingest_failures WHERE resolved = 0 ORDER BY created_at DESC`
    ).all() as EmailIngestFailure[];
  } finally { db.close(); }
}

export function createIngestFailure(data: {
  messageId?: string;
  subject: string;
  toAddress: string;
  reason: string;
  rawPayload: object;
}): void {
  ensureEmailTables();
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO email_ingest_failures (message_id, subject, to_address, reason, raw_payload)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.messageId ?? null,
      data.subject,
      data.toAddress,
      data.reason,
      JSON.stringify(data.rawPayload)
    );
  } finally { db.close(); }
}

export function resolveIngestFailure(failureId: number, leadId: number): void {
  const db = getDb();
  try {
    ensureEmailTables();
    db.prepare(`
      UPDATE email_ingest_failures
      SET resolved = 1, resolved_lead_id = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(leadId, failureId);
  } finally { db.close(); }
}
