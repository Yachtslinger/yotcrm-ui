/**
 * POST /api/matches/rerun
 * Re-scores an existing batch with the current engine and regenerates todos.
 *
 * Body: { batchId: number }
 *
 * Steps:
 *   1. Delete existing listing_matches for this batch
 *   2. Delete existing match todos for this batch (bot + human)
 *   3. Re-run runMatchesForBatch with Phase-1 engine (hard-fail gates, penalties, staleness)
 *   4. Re-run generateMatchTodos to produce fresh curated todos
 */

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { runMatchesForBatch, generateMatchTodos, initMatchTables } from "@/lib/matches/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export async function POST(req: Request) {
  try {
    const { batchId } = await req.json();
    if (!batchId || typeof batchId !== "number") {
      return NextResponse.json({ ok: false, error: "batchId required" }, { status: 400 });
    }

    initMatchTables();
    const db = new Database(DB_PATH);

    try {
      // Verify batch exists
      const batch = db.prepare("SELECT * FROM email_batches WHERE id = ?").get(batchId) as any;
      if (!batch) return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });

      // Step 1: delete old matches for this batch
      const deletedMatches = db.prepare("DELETE FROM listing_matches WHERE batch_id = ?").run(batchId).changes;

      // Step 2: delete old match todos for this batch's listings
      // (todos linked via listing_id to listings in this batch)
      const listingIds = (db.prepare(
        "SELECT id FROM parsed_listings WHERE batch_id = ?"
      ).all(batchId) as any[]).map(r => r.id);

      let deletedTodos = 0;
      if (listingIds.length > 0) {
        const placeholders = listingIds.map(() => "?").join(",");
        deletedTodos = db.prepare(
          `DELETE FROM todos WHERE todo_type = 'match' AND listing_id IN (${placeholders})`
        ).run(...listingIds).changes;
      }
      db.close();

      // Step 3: re-score with current engine
      const matchCount = runMatchesForBatch(batchId);

      // Step 4: regenerate todos
      const { human: humanTodos, bot: botTodos } = generateMatchTodos(batchId);

      return NextResponse.json({
        ok: true,
        batchId,
        deletedMatches,
        deletedTodos,
        newMatches: matchCount,
        newHumanTodos: humanTodos,
        newBotTodos: botTodos,
        message: `Rerun complete: ${matchCount} matches → ${humanTodos} human todos, ${botTodos} bot todos`,
      });
    } catch (err) {
      db.close();
      throw err;
    }
  } catch (err: any) {
    console.error("[rerun] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
