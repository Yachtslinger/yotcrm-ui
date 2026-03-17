import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { checkForReply } from "@/lib/email/gmail-sender";
import { updateEngagement } from "@/lib/matching/match-send-log";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "yotcrm.db");

// GET /api/matching/check-replies
// Polls Gmail for replies on any sent match emails that haven't been replied to yet.
// Called on page load from the matches UI (max once per 5 min via client throttle).
// Returns { checked: number, newReplies: number }
export async function GET() {
  const db = new Database(DB_PATH);

  // Ensure table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS match_send_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        vessel_year INTEGER, vessel_make TEXT, vessel_model TEXT,
        vessel_loa TEXT, vessel_price TEXT, listing_url TEXT NOT NULL,
        tone TEXT NOT NULL, from_email TEXT NOT NULL,
        gmail_message_id TEXT, subject TEXT,
        replied_at TEXT, liked_at TEXT, disliked_at TEXT,
        unsubscribed_at TEXT, opened_at TEXT, clicked_at TEXT,
        broker_note TEXT
      )
    `);
  } catch { /* already exists */ }

  // Get all sent emails that have a gmail thread ID but no reply yet
  const pending = db.prepare(`
    SELECT id, from_email, gmail_message_id
    FROM match_send_log
    WHERE gmail_message_id IS NOT NULL
      AND replied_at IS NULL
    ORDER BY sent_at DESC
    LIMIT 50
  `).all() as { id: number; from_email: string; gmail_message_id: string }[];

  db.close();

  let checked = 0;
  let newReplies = 0;

  for (const row of pending) {
    try {
      const result = await checkForReply(row.from_email, row.gmail_message_id);
      checked++;
      if (result.replied) {
        updateEngagement(row.id, { repliedAt: new Date().toISOString() });
        newReplies++;
      }
    } catch {
      // Skip — token may not be set up yet
    }
  }

  return NextResponse.json({ checked, newReplies });
}
