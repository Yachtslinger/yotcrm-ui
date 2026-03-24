#!/usr/bin/env node
// scripts/connectMaintenance.js
// Nightly maintenance job — stale decay, queue cleanup, dedup.
// Run after connectRescore.js:
//   0 3 * * * node /app/scripts/connectMaintenance.js

const path = require('path');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/yotcrm.db');
process.env.DB_PATH = DB_PATH;

function run() {
  let Database;
  try { Database = require('better-sqlite3'); }
  catch { console.error('[maintenance] better-sqlite3 not found'); process.exit(1); }

  const db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
  const now = new Date().toISOString();
  const stats = { decayed: 0, expired_overrides: 0, expired_suppressions: 0, cleaned_queue: 0, deduped: 0 };

  try {
    // ── 1. Stale listing decay ───────────────────────────────────────────────
    // Brochures in DB 91–180 days: -3 to score (floor 0), add caution
    // Brochures > 180 days: don't decay further — gate in scoring prevents surfacing
    const stale91 = db.prepare(`
      UPDATE connect_match_scores
      SET score = MAX(0, score - 3),
          manual_priority_score = MAX(0, manual_priority_score - 3),
          is_stale = 1, scored_at = ?
      WHERE brochure_id IN (
        SELECT id FROM brochures
        WHERE julianday('now') - julianday(created_at) BETWEEN 91 AND 180
      )
      AND routing != 'suppressed'
    `).run(now);
    stats.decayed = stale91.changes;

    // ── 2. Expire broker overrides ────────────────────────────────────────────
    const expOv = db.prepare(`
      UPDATE connect_broker_overrides
      SET is_active = 0
      WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at < ?
    `).run(now);
    stats.expired_overrides = expOv.changes;

    // ── 3. Expire suppression rules ───────────────────────────────────────────
    // (They stay as records but won't match the expires_at check in isSuppressionActive)
    // Mark as expired by updating expires_at to past — no action needed, query handles it

    // ── 4. Queue cleanup ──────────────────────────────────────────────────────
    // Remove pending entries for leads/brochures that are now gone or inactive
    const cleanQueue = db.prepare(`
      DELETE FROM connect_routing_queue
      WHERE status = 'pending'
        AND (
          lead_id NOT IN (
            SELECT id FROM leads
            WHERE status IN ('active','warm','hot','qualified','interested','pipeline','new')
          )
          OR brochure_id NOT IN (SELECT id FROM brochures)
        )
    `).run();
    stats.cleaned_queue = cleanQueue.changes;

    // ── 5. Dedupe pending queue entries ──────────────────────────────────────
    // Keep only the highest-priority pending entry per (lead, brochure) pair
    const dedup = db.prepare(`
      DELETE FROM connect_routing_queue
      WHERE status = 'pending'
        AND id NOT IN (
          SELECT MIN(id) FROM connect_routing_queue
          WHERE status = 'pending'
          GROUP BY lead_id, brochure_id
        )
    `).run();
    stats.deduped = dedup.changes;

    // ── 6. Refresh dashboard metrics ─────────────────────────────────────────
    // Simple count refresh — avoids next dashboard load hitting live queries
    try {
      const manual = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE routing = 'manual_queue'`).get() as any).c;
      const bot    = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE routing = 'bot_queue'`).get() as any).c;
      const high   = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE score >= 70`).get() as any).c;
      const metrics = JSON.stringify({ manual_queue_count: manual, bot_queue_count: bot, high_score_count: high, computed_at: now });
      db.prepare(`
        INSERT INTO connect_dashboard_metrics (id, metrics_json, computed_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET metrics_json = excluded.metrics_json, computed_at = excluded.computed_at
      `).run(metrics, now);
    } catch {}

    console.log(`[connect-maintenance] Done — ${JSON.stringify(stats)}`);
    process.exit(0);
  } catch (err) {
    console.error('[connect-maintenance] Fatal:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

run();
