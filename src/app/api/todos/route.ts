import { NextResponse } from "next/server";
import { getAllTodos, createTodo, updateTodo, deleteTodo, clearCompleted } from "@/lib/todos/storage";
import { dismissMatch } from "@/lib/matches/storage";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
export const runtime = "nodejs";

/** Run a small write in its own connection — used for one-liner updates that
 *  don't justify a full storage function. Always closes the DB. */
function quickWrite(sql: string, ...params: any[]) {
  const db = new Database(DB_PATH);
  try { db.prepare(sql).run(...params); } finally { db.close(); }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const queue = searchParams.get("queue") || "human";
    const todos = getAllTodos(queue);
    return NextResponse.json({ ok: true, todos });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const todo = createTodo(body.text, body.priority, body.due_date, body.lead_id, body.assignee);
      return NextResponse.json({ ok: true, todo });
    }
    if (action === "update") {
      const todo = updateTodo(body.id, body.fields);
      if (!todo) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      // When marking a match todo complete, stamp last_contacted_at on the lead
      if (body.fields?.completed === true && todo.lead_id) {
        try {
          quickWrite("UPDATE leads SET last_contacted_at = ? WHERE id = ?",
            new Date().toISOString(), todo.lead_id);
        } catch { /* non-fatal */ }
      }
      return NextResponse.json({ ok: true, todo });
    }
    if (action === "delete") {
      const ok = deleteTodo(body.id);
      return NextResponse.json({ ok });
    }
    // Dismiss a match todo — deletes the todo AND records dismissal in the match engine
    // so the listing never resurfaces for this lead in future batches
    if (action === "dismiss_match") {
      const todo = body.todo as {
        id: number; listing_id?: number | null; lead_id?: number | null; assignee?: string;
      };
      if (!todo?.id) return NextResponse.json({ ok: false, error: "Missing todo" }, { status: 400 });
      // Find the listing_match record for this todo
      let matchId: number | null = null;
      try {
        const db = new Database(DB_PATH, { readonly: true });
        try {
          const row = db.prepare(
            "SELECT id FROM listing_matches WHERE listing_id=? AND lead_id=? AND status != 'dismissed' LIMIT 1"
          ).get(todo.listing_id ?? -1, todo.lead_id ?? -1) as any;
          if (row) matchId = row.id;
        } finally { db.close(); }
      } catch { /* non-fatal */ }
      // Record dismissal in match engine (prevents resurfacing)
      if (matchId && todo.listing_id && todo.lead_id) {
        dismissMatch(matchId, todo.lead_id, todo.listing_id, todo.assignee || "will");
      }
      // Delete the todo itself
      deleteTodo(todo.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "delete_bulk") {
      const ids: number[] = body.ids || [];
      let deleted = 0;
      for (const id of ids) { if (deleteTodo(id)) deleted++; }
      return NextResponse.json({ ok: true, deleted });
    }
    if (action === "clear_completed") {
      const count = clearCompleted(body.assignee);
      return NextResponse.json({ ok: true, cleared: count });
    }
    // Promote a bot-queue item to human queue
    if (action === "promote") {
      quickWrite("UPDATE todos SET queue='human' WHERE id=?", body.id);
      return NextResponse.json({ ok: true });
    }
    // Bulk-dismiss bot queue items (mark completed)
    if (action === "dismiss_bot_bulk") {
      const now = new Date().toISOString();
      const ids: number[] = body.ids || [];
      const db = new Database(DB_PATH);
      try {
        const stmt = db.prepare("UPDATE todos SET completed=1, completed_at=? WHERE id=?");
        const batch = db.transaction(() => { for (const id of ids) stmt.run(now, id); });
        batch();
      } finally { db.close(); }
      return NextResponse.json({ ok: true, dismissed: ids.length });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
