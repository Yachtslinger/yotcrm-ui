// src/app/api/connect/dashboard/route.ts
// GET  /api/connect/dashboard  — returns precomputed metrics blob (fast, no live queries)
// POST /api/connect/dashboard  — triggers metric recomputation (called by nightly job or on-demand)

import { NextRequest, NextResponse } from 'next/server';
import { getConnectDb, initConnectTables } from '@/lib/connect/db';

export const runtime = 'nodejs';

function computeMetrics(db: ReturnType<typeof getConnectDb>) {
  const manual_queue_count = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_match_scores WHERE routing = 'manual_queue'`
  ).get() as any).c;

  const bot_queue_count = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_match_scores WHERE routing = 'bot_queue'`
  ).get() as any).c;

  const high_score_count = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_match_scores WHERE score >= 70`
  ).get() as any).c;

  const avg_score_row = db.prepare(
    `SELECT ROUND(AVG(score), 1) as avg FROM connect_match_scores WHERE routing != 'suppressed'`
  ).get() as any;

  const sent_this_week = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_exposure_history
     WHERE sent_at >= datetime('now', '-7 days')`
  ).get() as any).c;

  const top_listings = db.prepare(
    `SELECT brochure_id, COUNT(*) as match_count
     FROM connect_match_scores WHERE routing != 'suppressed'
     GROUP BY brochure_id ORDER BY match_count DESC LIMIT 5`
  ).all();

  const top_buyers = db.prepare(
    `SELECT lead_id, COUNT(*) as high_match_count
     FROM connect_match_scores WHERE score >= 70
     GROUP BY lead_id ORDER BY high_match_count DESC LIMIT 5`
  ).all();

  const engagement_this_week = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_engagement_events
     WHERE occurred_at >= datetime('now', '-7 days')`
  ).get() as any).c;

  const pending_actions = (db.prepare(
    `SELECT COUNT(*) as c FROM connect_routing_queue WHERE status = 'pending'`
  ).get() as any).c;

  return {
    manual_queue_count,
    bot_queue_count,
    high_score_count,
    avg_score: avg_score_row?.avg ?? 0,
    sent_this_week,
    engagement_this_week,
    pending_actions,
    top_listings,
    top_buyers,
    computed_at: new Date().toISOString(),
  };
}

export async function GET(_req: NextRequest) {
  try {
    initConnectTables();
    const db = getConnectDb();
    try {
      // Try precomputed first
      const cached = db.prepare(
        `SELECT metrics_json, computed_at FROM connect_dashboard_metrics WHERE id = 1`
      ).get() as any;

      if (cached) {
        const age = Date.now() - new Date(cached.computed_at).getTime();
        // Return cached if under 5 minutes old
        if (age < 5 * 60 * 1000) {
          return NextResponse.json({ ok: true, data: JSON.parse(cached.metrics_json), cached: true });
        }
      }

      // Stale or missing — recompute live and cache
      const metrics = computeMetrics(db);
      db.prepare(
        `INSERT INTO connect_dashboard_metrics (id, metrics_json, computed_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET metrics_json = excluded.metrics_json, computed_at = excluded.computed_at`
      ).run(JSON.stringify(metrics), metrics.computed_at);

      return NextResponse.json({ ok: true, data: metrics, cached: false });
    } finally { db.close(); }
  } catch (err: any) {
    console.error('[connect/dashboard GET]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    initConnectTables();
    const db = getConnectDb();
    try {
      const metrics = computeMetrics(db);
      db.prepare(
        `INSERT INTO connect_dashboard_metrics (id, metrics_json, computed_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET metrics_json = excluded.metrics_json, computed_at = excluded.computed_at`
      ).run(JSON.stringify(metrics), metrics.computed_at);
      return NextResponse.json({ ok: true, refreshed: true, data: metrics });
    } finally { db.close(); }
  } catch (err: any) {
    console.error('[connect/dashboard POST]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
