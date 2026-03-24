// src/app/api/connect/cron/route.ts
// POST /api/connect/cron
// Protected nightly job endpoint — called by Railway Cron service.
//
// Railway setup:
//   1. Dashboard → New Service → Cron
//   2. Schedule: 0 2 * * *  (2am daily)
//   3. Command: curl -s -X POST https://yotcrm-production.up.railway.app/api/connect/cron \
//                -H "Authorization: Bearer $CRON_SECRET"
//   4. Set CRON_SECRET env var in both the app service and cron service
//
// Runs in sequence: rescore → maintenance → dashboard refresh

import { NextRequest, NextResponse } from 'next/server';
import { runFullRescore } from '@/lib/connect/storage';
import { getConnectDb, initConnectTables } from '@/lib/connect/db';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min — rescore can take time on large datasets

export async function POST(req: NextRequest) {
  // Auth check — require Bearer token matching CRON_SECRET env var
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const jobStart = Date.now();
  const log: string[] = [];

  try {
    initConnectTables();

    // ── Step 1: Full rescore ───────────────────────────────────────────────
    const t1 = Date.now();
    const rescoreResult = runFullRescore();
    log.push(`rescore: ${rescoreResult.pairs} pairs, ${rescoreResult.errors} errors, ${Date.now()-t1}ms`);

    // ── Step 2: Maintenance (decay, expire overrides, clean queue) ─────────
    const t2 = Date.now();
    const db = getConnectDb();
    try {
      const now = new Date().toISOString();

      const decayed = db.prepare(`
        UPDATE connect_match_scores
        SET score = MAX(0, score - 3), manual_priority_score = MAX(0, manual_priority_score - 3),
            is_stale = 1, scored_at = ?
        WHERE brochure_id IN (
          SELECT id FROM brochures WHERE julianday('now') - julianday(created_at) BETWEEN 91 AND 180
        ) AND routing != 'suppressed'
      `).run(now).changes;

      const expiredOverrides = db.prepare(`
        UPDATE connect_broker_overrides SET is_active = 0
        WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at < ?
      `).run(now).changes;

      const cleanedQueue = db.prepare(`
        DELETE FROM connect_routing_queue WHERE status = 'pending'
        AND lead_id NOT IN (
          SELECT id FROM leads WHERE status IN ('active','warm','hot','qualified','interested','pipeline','new')
        )
      `).run().changes;

      const deduped = db.prepare(`
        DELETE FROM connect_routing_queue
        WHERE status = 'pending' AND id NOT IN (
          SELECT MIN(id) FROM connect_routing_queue WHERE status = 'pending' GROUP BY lead_id, brochure_id
        )
      `).run().changes;

      log.push(`maintenance: decayed=${decayed} overrides_expired=${expiredOverrides} queue_cleaned=${cleanedQueue} deduped=${deduped}, ${Date.now()-t2}ms`);

      // ── Step 3: Refresh dashboard metrics cache ────────────────────────
      const t3 = Date.now();
      const manual = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE routing='manual_queue'`).get() as any).c;
      const bot    = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE routing='bot_queue'`).get() as any).c;
      const high   = (db.prepare(`SELECT COUNT(*) as c FROM connect_match_scores WHERE score >= 70`).get() as any).c;
      const avgRow = db.prepare(`SELECT ROUND(AVG(score),1) as avg FROM connect_match_scores WHERE routing != 'suppressed'`).get() as any;
      const sentWk = (db.prepare(`SELECT COUNT(*) as c FROM connect_exposure_history WHERE sent_at >= datetime('now','-7 days')`).get() as any).c;

      db.prepare(`
        INSERT INTO connect_dashboard_metrics (id, metrics_json, computed_at) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET metrics_json=excluded.metrics_json, computed_at=excluded.computed_at
      `).run(JSON.stringify({ manual_queue_count: manual, bot_queue_count: bot, high_score_count: high,
        avg_score: avgRow?.avg ?? 0, sent_this_week: sentWk, computed_at: now }), now);

      log.push(`metrics: refreshed, ${Date.now()-t3}ms`);
    } finally {
      db.close();
    }

    const total = Date.now() - jobStart;
    console.log(`[connect-cron] completed in ${total}ms — ${log.join(' | ')}`);
    return NextResponse.json({ ok: true, duration_ms: total, log });

  } catch (err: any) {
    console.error('[connect-cron] failed:', err);
    return NextResponse.json({ ok: false, error: err.message, log }, { status: 500 });
  }
}
