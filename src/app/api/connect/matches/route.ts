// src/app/api/connect/matches/route.ts
// GET  /api/connect/matches  — paginated match list
// POST /api/connect/matches  — trigger full rescore (async)

import { NextRequest, NextResponse } from 'next/server';
import { getMatches, runFullRescore } from '@/lib/connect/storage';
import { initConnectTables } from '@/lib/connect/db';
import { withGuard } from '@/lib/connect/guard';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function handleGET(req: NextRequest) {
  try {
    initConnectTables();
    const sp = req.nextUrl.searchParams;

    const queueType = (sp.get('queue_type') || 'all') as 'manual' | 'bot' | 'all';
    const minScore  = parseInt(sp.get('min_score') || '0');
    const confidence = sp.get('confidence') || undefined;
    const leadId    = sp.get('lead_id')    ? parseInt(sp.get('lead_id')!)    : undefined;
    const brochureId = sp.get('brochure_id') ? parseInt(sp.get('brochure_id')!) : undefined;
    const page      = parseInt(sp.get('page')     || '1');
    const perPage   = Math.min(parseInt(sp.get('per_page') || '25'), 50);

    const { data, total } = getMatches({ queueType, minScore, confidence, leadId, brochureId, page, perPage });

    return NextResponse.json({
      ok: true,
      data,
      pagination: {
        page, per_page: perPage,
        total, total_pages: Math.ceil(total / perPage),
      },
    });
  } catch (err: any) {
    console.error('[connect/matches GET]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

async function handlePOST(req: NextRequest) {
  try {
    initConnectTables();
    // Run sync (for datasets <500 pairs, completes in <2s).
    // For larger sets, extract to background job in Sprint 2.
    const result = runFullRescore();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[connect/matches POST]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export const GET  = withGuard('matches', handleGET);
export const POST = withGuard('matches', handlePOST);
