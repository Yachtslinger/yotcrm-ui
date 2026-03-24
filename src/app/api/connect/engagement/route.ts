// src/app/api/connect/engagement/route.ts
// POST /api/connect/engagement
// Logs a buyer engagement event and applies an immediate score delta to the
// matching connect_match_scores row. Triggers routing queue update if the
// score crosses a threshold.

import { NextRequest, NextResponse } from 'next/server';
import { getConnectDb, initConnectTables } from '@/lib/connect/db';

export const runtime = 'nodejs';

// Impact points per event type
const EVENT_IMPACTS: Record<string, number> = {
  email_open:       2,
  link_click:       4,
  pdf_view:         4,
  reply:            8,
  showing_request: 15,
  offer_made:      25,
  phone_call:      10,
  manual_note:      3,
};

export async function POST(req: NextRequest) {
  try {
    initConnectTables();
    const body = await req.json().catch(() => ({}));
    const { lead_id, brochure_id, event_type, occurred_at, metadata, event_source } = body;

    if (!lead_id || !event_type) {
      return NextResponse.json({ ok: false, error: 'lead_id and event_type required' }, { status: 400 });
    }

    const impact = EVENT_IMPACTS[event_type] ?? 0;
    const ts = occurred_at || new Date().toISOString();

    const db = getConnectDb();
    try {
      // Insert engagement event
      db.prepare(`
        INSERT INTO connect_engagement_events
          (lead_id, brochure_id, event_type, event_source, occurred_at, metadata, score_impact)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        lead_id, brochure_id ?? null, event_type,
        event_source || 'broker_log', ts,
        JSON.stringify(metadata || {}), impact
      );

      // Apply score delta to match row if pair is known
      if (brochure_id && impact > 0) {
        const row = db.prepare(
          `SELECT id, score, routing FROM connect_match_scores WHERE lead_id = ? AND brochure_id = ?`
        ).get(lead_id, brochure_id) as any;

        if (row) {
          const newScore = Math.min(100, row.score + impact);

          // Determine if routing should change
          let newRouting = row.routing;
          if (newScore >= 45 && row.routing === 'bot_queue') newRouting = 'manual_queue';
          if (newScore >= 45 && row.routing === 'suppressed') newRouting = 'bot_queue'; // re-surface

          db.prepare(`
            UPDATE connect_match_scores
            SET score = ?, routing = ?, manual_priority_score = MIN(110, manual_priority_score + ?), scored_at = ?
            WHERE id = ?
          `).run(newScore, newRouting, impact, ts, row.id);

          // If routing changed upward, reset queue entry
          if (newRouting !== row.routing) {
            const queueType = newRouting === 'manual_queue' ? 'manual' : 'bot';
            db.prepare(`
              INSERT INTO connect_routing_queue
                (lead_id, brochure_id, match_id, queue_type, status, priority, added_at)
              VALUES (?, ?, ?, ?, 'pending', ?, ?)
              ON CONFLICT DO NOTHING
            `).run(lead_id, brochure_id, row.id, queueType, 100 - newScore, ts);
          }

          return NextResponse.json({ ok: true, logged: true, score_impact: impact, new_score: newScore, routing_changed: newRouting !== row.routing });
        }
      }

      return NextResponse.json({ ok: true, logged: true, score_impact: impact });
    } finally {
      db.close();
    }
  } catch (err: any) {
    console.error('[connect/engagement POST]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
