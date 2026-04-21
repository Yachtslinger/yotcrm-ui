/**
 * match-send-log.ts
 * Drop into: src/lib/matching/match-send-log.ts
 *
 * Records every email sent from the matching section and tracks
 * client engagement (replied, liked, unsubscribed).
 * Feeds back into the lead profile so future matches get smarter.
 *
 * Schema additions — run migrateMatchSendLog() once on deploy.
 */

import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  return new Database(DB_PATH);
}

// ── Migration ─────────────────────────────────────────────────────────────────

export function migrateMatchSendLog() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_send_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,

      -- Who and when
      lead_id       INTEGER NOT NULL,           -- FK → leads.id
      sent_at       TEXT    NOT NULL DEFAULT (datetime('now')),

      -- What was sent
      vessel_year   INTEGER,
      vessel_make   TEXT,
      vessel_model  TEXT,
      vessel_loa    TEXT,
      vessel_price  TEXT,
      listing_url   TEXT    NOT NULL,
      tone          TEXT    NOT NULL,           -- 'search' | 'mls' | 'new-listing' | 'price-drop'

      -- Sending
      from_email    TEXT    NOT NULL,           -- e.g. WN@DenisonYachting.com
      gmail_message_id TEXT,                   -- Gmail thread ID for reply detection
      subject       TEXT,

      -- Engagement — updated as replies / interactions come in
      replied_at        TEXT,                  -- ISO timestamp when client replied
      liked_at          TEXT,                  -- ISO timestamp if client clicked "I like this"
      disliked_at       TEXT,                  -- clicked "Not for me"
      unsubscribed_at   TEXT,
      opened_at         TEXT,                  -- first open (if tracking pixel used)
      clicked_at        TEXT,                  -- first listing link click

      -- Notes
      broker_note   TEXT                       -- optional internal note added after send
    );

    CREATE INDEX IF NOT EXISTS idx_msl_lead    ON match_send_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_msl_sent_at ON match_send_log(sent_at);
    CREATE INDEX IF NOT EXISTS idx_msl_replied ON match_send_log(replied_at);

    -- Engagement summary view — used for lead profile display
    CREATE VIEW IF NOT EXISTS lead_engagement_summary AS
    SELECT
      lead_id,
      COUNT(*)                                      AS emails_sent,
      COUNT(replied_at)                             AS replies,
      COUNT(liked_at)                               AS likes,
      COUNT(disliked_at)                            AS dislikes,
      MAX(sent_at)                                  AS last_sent_at,
      MAX(replied_at)                               AS last_replied_at,
      -- Most recently liked vessel attributes (for profile refinement)
      (SELECT vessel_make  FROM match_send_log m2 WHERE m2.lead_id = m.lead_id AND m2.liked_at IS NOT NULL ORDER BY liked_at DESC LIMIT 1) AS last_liked_make,
      (SELECT vessel_model FROM match_send_log m2 WHERE m2.lead_id = m.lead_id AND m2.liked_at IS NOT NULL ORDER BY liked_at DESC LIMIT 1) AS last_liked_model,
      (SELECT vessel_year  FROM match_send_log m2 WHERE m2.lead_id = m.lead_id AND m2.liked_at IS NOT NULL ORDER BY liked_at DESC LIMIT 1) AS last_liked_year
    FROM match_send_log m
    GROUP BY lead_id;
  `);
  db.close();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchSendRecord {
  id?:           number;
  leadId:        number;
  vesselYear?:   number;
  vesselMake?:   string;
  vesselModel?:  string;
  vesselLoa?:    string;
  vesselPrice?:  string;
  listingUrl:    string;
  tone:          string;
  fromEmail:     string;
  gmailMessageId?: string;
  subject?:      string;
  brokerNote?:   string;
}

export interface EngagementUpdate {
  repliedAt?:      string;
  likedAt?:        string;
  dislikedAt?:     string;
  unsubscribedAt?: string;
  openedAt?:       string;
  clickedAt?:      string;
  brokerNote?:     string;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function logMatchSend(record: MatchSendRecord): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO match_send_log
      (lead_id, vessel_year, vessel_make, vessel_model, vessel_loa, vessel_price,
       listing_url, tone, from_email, gmail_message_id, subject, broker_note)
    VALUES
      (@leadId, @vesselYear, @vesselMake, @vesselModel, @vesselLoa, @vesselPrice,
       @listingUrl, @tone, @fromEmail, @gmailMessageId, @subject, @brokerNote)
  `);
  const result = stmt.run(record);
  db.close();
  return result.lastInsertRowid as number;
}

export function updateEngagement(logId: number, update: EngagementUpdate) {
  const db = getDb();
  const fields: string[] = [];
  const params: Record<string, string | undefined> = { id: String(logId) };

  if (update.repliedAt)      { fields.push("replied_at = @repliedAt");           params.repliedAt      = update.repliedAt; }
  if (update.likedAt)        { fields.push("liked_at = @likedAt");               params.likedAt        = update.likedAt; }
  if (update.dislikedAt)     { fields.push("disliked_at = @dislikedAt");         params.dislikedAt     = update.dislikedAt; }
  if (update.unsubscribedAt) { fields.push("unsubscribed_at = @unsubscribedAt"); params.unsubscribedAt = update.unsubscribedAt; }
  if (update.openedAt)       { fields.push("opened_at = @openedAt");             params.openedAt       = update.openedAt; }
  if (update.clickedAt)      { fields.push("clicked_at = @clickedAt");           params.clickedAt      = update.clickedAt; }
  if (update.brokerNote)     { fields.push("broker_note = @brokerNote");         params.brokerNote     = update.brokerNote; }

  if (!fields.length) return;
  db.prepare(`UPDATE match_send_log SET ${fields.join(", ")} WHERE id = @id`).run(params);
  db.close();
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface SendLogRow {
  id:             number;
  leadId:         number;
  sentAt:         string;
  vesselYear:     number | null;
  vesselMake:     string | null;
  vesselModel:    string | null;
  vesselPrice:    string | null;
  listingUrl:     string;
  tone:           string;
  subject:        string | null;
  repliedAt:      string | null;
  likedAt:        string | null;
  dislikedAt:     string | null;
  openedAt:       string | null;
  clickedAt:      string | null;
  brokerNote:     string | null;
}

/** All sends for a given lead, newest first */
export function getLeadSendHistory(leadId: number): SendLogRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      id, lead_id AS leadId, sent_at AS sentAt,
      vessel_year AS vesselYear, vessel_make AS vesselMake,
      vessel_model AS vesselModel, vessel_price AS vesselPrice,
      listing_url AS listingUrl, tone, subject,
      replied_at AS repliedAt, liked_at AS likedAt,
      disliked_at AS dislikedAt, opened_at AS openedAt,
      clicked_at AS clickedAt, broker_note AS brokerNote
    FROM match_send_log
    WHERE lead_id = ?
    ORDER BY sent_at DESC
  `).all(leadId) as SendLogRow[];
  db.close();
  return rows;
}

/** Engagement summary for a lead — useful for profile sidebar */
export function getLeadEngagementSummary(leadId: number) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM lead_engagement_summary WHERE lead_id = ?
  `).get(leadId) as Record<string, unknown> | undefined;
  db.close();
  return row ?? null;
}
