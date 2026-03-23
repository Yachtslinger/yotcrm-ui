// src/app/api/connect/matches/[matchId]/route.ts
// GET  /api/connect/matches/:matchId         — full match detail (lazy)
// POST /api/connect/matches/:matchId         — action dispatcher
//   body: { action: "suppress"|"boost"|"mark_sent"|"move_to_bot"|"escalate", ...params }

import { NextRequest, NextResponse } from 'next/server';
import {
  getMatchDetail, suppressMatch, boostMatch,
  markSent, moveToBot, escalateToManual,
  scoreAndPersistPair,
} from '@/lib/connect/storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ matchId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);
    if (isNaN(matchId)) return NextResponse.json({ ok: false, error: 'Invalid matchId' }, { status: 400 });

    const detail = getMatchDetail(matchId);
    if (!detail) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true, data: detail });
  } catch (err: any) {
    console.error('[connect/matches/:id GET]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { matchId: matchIdStr } = await params;
    const matchId = parseInt(matchIdStr);
    if (isNaN(matchId)) return NextResponse.json({ ok: false, error: 'Invalid matchId' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { action, reason, boost_value, channel, broker_id, expires_at } = body;
    const brokerId = broker_id || 'broker';

    switch (action) {
      case 'suppress':
        suppressMatch(matchId, reason || '', brokerId, expires_at);
        return NextResponse.json({ ok: true, suppressed: true });

      case 'boost': {
        const newPriority = boostMatch(matchId, parseInt(boost_value) || 15, reason || '', brokerId);
        return NextResponse.json({ ok: true, boosted: true, new_priority_score: newPriority });
      }

      case 'mark_sent':
        markSent(matchId, channel || 'email', brokerId);
        return NextResponse.json({ ok: true, logged: true });

      case 'move_to_bot':
        moveToBot(matchId, brokerId);
        return NextResponse.json({ ok: true, moved: true });

      case 'escalate':
        escalateToManual(matchId, brokerId);
        return NextResponse.json({ ok: true, escalated: true });

      case 'rescore': {
        const detail = getMatchDetail(matchId);
        if (!detail) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
        const row = scoreAndPersistPair(detail.lead_id, detail.brochure_id);
        return NextResponse.json({ ok: true, rescored: true, new_score: row?.score });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[connect/matches/:id POST]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
