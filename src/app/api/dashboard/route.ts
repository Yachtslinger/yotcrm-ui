/**
 * GET /api/dashboard
 *
 * Lightweight summary endpoint for the dashboard page.
 * Returns exactly what the dashboard needs — no full leads load.
 * Replaces the previous pattern of fetching all 3,271 leads.
 *
 * Response:
 *   { ok, counts, recentLeads, todoCount, matchTodoCount }
 */

import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export async function GET() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    // Status counts for the Pipeline Status chips
    const statusRows = db.prepare(
      "SELECT LOWER(COALESCE(status,'other')) as status, COUNT(*) as count FROM leads GROUP BY status"
    ).all() as { status: string; count: number }[];
    const counts: Record<string, number> = { all: 0 };
    for (const r of statusRows) { counts[r.status] = r.count; counts.all += r.count; }

    // 5 most recent leads for the Recent Leads panel
    const recentRows = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.email, l.status, l.source,
             l.created_at, l.notes,
             (SELECT b.make FROM boats b WHERE b.lead_id = l.id ORDER BY b.added_at DESC LIMIT 1) AS boat_make,
             (SELECT b.model FROM boats b WHERE b.lead_id = l.id ORDER BY b.added_at DESC LIMIT 1) AS boat_model,
             (SELECT b.year FROM boats b WHERE b.lead_id = l.id ORDER BY b.added_at DESC LIMIT 1) AS boat_year,
             (SELECT b.price FROM boats b WHERE b.lead_id = l.id ORDER BY b.added_at DESC LIMIT 1) AS boat_price
      FROM leads l
      ORDER BY l.created_at DESC
      LIMIT 5
    `).all() as any[];

    const recentLeads = recentRows.map(r => ({
      id: String(r.id),
      first_name: r.first_name || "", last_name: r.last_name || "",
      email: r.email || "", status: r.status || "other", source: r.source || "",
      created_at: r.created_at || "", notes: r.notes || "",
      boat_make: r.boat_make || "", boat_model: r.boat_model || "",
      boat_year: r.boat_year || "", boat_price: r.boat_price || "",
    }));

    // Open todo count
    const todoRow = db.prepare(
      "SELECT COUNT(*) as c FROM todos WHERE completed = 0 AND (queue = 'human' OR queue IS NULL)"
    ).get() as { c: number };

    // Open human-queue match todos
    const matchTodoRow = db.prepare(
      "SELECT COUNT(*) as c FROM todos WHERE completed = 0 AND queue = 'human' AND todo_type = 'match'"
    ).get() as { c: number };

    return NextResponse.json({
      ok: true,
      counts,
      recentLeads,
      todoCount:      todoRow.c,
      matchTodoCount: matchTodoRow.c,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[API Error] GET /api/dashboard:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    db.close();
  }
}
