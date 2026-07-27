import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const SYNC_SECRET = process.env.SYNC_SECRET || "yotcrm-sync-2026";

// POST /api/sync/archive-machine-todos — one-shot cleanup.
// Archives (marks completed) all open machine-generated todos:
//   - the 🚢 match-blast batches
//   - todo_type 'match' / 'lead' backlog
// Never touches human-written todos or the bot email queue.
export async function POST(req: Request) {
  if (req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = new Database(DB_PATH);
  try {
    const r = db.prepare(`UPDATE todos SET completed=1, completed_at=datetime('now')
      WHERE completed=0
        AND COALESCE(queue,'') NOT IN ('bot','draft')
        AND (text LIKE '🚢%' OR todo_type IN ('match','lead'))`).run();
    const openLeft = db.prepare(`SELECT COUNT(*) n FROM todos WHERE completed=0`).get() as { n: number };
    return NextResponse.json({ ok: true, archived: r.changes, openRemaining: openLeft.n });
  } finally { db.close(); }
}
