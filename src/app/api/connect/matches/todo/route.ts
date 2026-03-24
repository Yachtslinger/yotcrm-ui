// src/app/api/connect/matches/todo/route.ts
// GET /api/connect/matches/todo
// Returns the top 30 manual-queue matches for a broker, sorted by priority.
// Designed to be the daily action queue — max 30 items, no pagination needed.

import { NextRequest, NextResponse } from 'next/server';
import { getConnectDb, initConnectTables } from '@/lib/connect/db';

export const runtime = 'nodejs';

function parseJSON<T>(s: string | null, fallback: T): T {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  try {
    initConnectTables();
    const db = getConnectDb();

    try {
      const rows = db.prepare(`
        SELECT
          cms.id, cms.lead_id, cms.brochure_id, cms.score, cms.confidence,
          cms.routing, cms.manual_priority_score, cms.scored_at,
          l.name  AS lead_name, l.email AS lead_email, l.status AS lead_status,
          l.last_contacted_at,
          b.vessel_name, b.builder, b.year, b.slug,
          COALESCE(ces.sent_count, 0) AS sent_count,
          ces.last_sent_at,
          cme.summary_sentence, cme.top_reasons, cme.next_best_action,
          cme.caution_flags
        FROM connect_match_scores cms
        JOIN leads     l ON l.id = cms.lead_id
        JOIN brochures b ON b.id = cms.brochure_id
        LEFT JOIN connect_match_explanations cme ON cme.match_id = cms.id
        LEFT JOIN connect_exposure_summary   ces ON ces.lead_id = cms.lead_id
                                                 AND ces.brochure_id = cms.brochure_id
        WHERE cms.routing = 'manual_queue'
          AND (ces.sent_count IS NULL OR ces.sent_count < 3)
        ORDER BY cms.manual_priority_score DESC, cms.scored_at DESC
        LIMIT 30
      `).all() as any[];

      const data = rows.map(r => ({
        ...r,
        top_reasons:      parseJSON(r.top_reasons, []),
        next_best_action: parseJSON(r.next_best_action, {}),
        caution_flags:    parseJSON(r.caution_flags, []),
      }));

      return NextResponse.json({ ok: true, data, count: data.length });
    } finally {
      db.close();
    }
  } catch (err: any) {
    console.error('[connect/matches/todo GET]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
