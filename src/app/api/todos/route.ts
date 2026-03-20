import { NextResponse } from "next/server";
import { getAllTodos, createTodo, updateTodo, deleteTodo, clearCompleted } from "@/lib/todos/storage";
import { dismissMatch } from "@/lib/matches/storage";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
export const runtime = "nodejs";

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
      const db = new Database(DB_PATH);
      let matchId: number | null = null;
      try {
        const row = db.prepare(
          "SELECT id FROM listing_matches WHERE listing_id=? AND lead_id=? AND status != 'dismissed' LIMIT 1"
        ).get(todo.listing_id ?? -1, todo.lead_id ?? -1) as any;
        if (row) matchId = row.id;
      } finally { db.close(); }
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
      const db = new Database(DB_PATH);
      db.prepare("UPDATE todos SET queue='human' WHERE id=?").run(body.id);
      db.close();
      return NextResponse.json({ ok: true });
    }
    // Bulk-dismiss bot queue items (mark completed)
    if (action === "dismiss_bot_bulk") {
      const db = new Database(DB_PATH);
      const now = new Date().toISOString();
      const ids: number[] = body.ids || [];
      for (const id of ids) {
        db.prepare("UPDATE todos SET completed=1, completed_at=? WHERE id=?").run(now, id);
      }
      db.close();
      return NextResponse.json({ ok: true, dismissed: ids.length });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
