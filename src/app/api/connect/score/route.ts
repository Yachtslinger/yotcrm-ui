// src/app/api/connect/score/route.ts
// POST /api/connect/score
// Body: { type: "lead"|"brochure", id: number }
// Rescores all pairs for the given lead or brochure.

import { NextRequest, NextResponse } from 'next/server';
import { rescoreForLead, rescoreForBrochure } from '@/lib/connect/storage';
import { initConnectTables } from '@/lib/connect/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    initConnectTables();
    const body = await req.json().catch(() => ({}));
    const { type, id } = body;

    if (!type || !id || isNaN(parseInt(id))) {
      return NextResponse.json({ ok: false, error: 'type and id are required' }, { status: 400 });
    }

    if (type === 'lead') {
      const result = rescoreForLead(parseInt(id));
      return NextResponse.json({ ok: true, type: 'lead', id, ...result });
    }

    if (type === 'brochure') {
      const result = rescoreForBrochure(parseInt(id));
      return NextResponse.json({ ok: true, type: 'brochure', id, ...result });
    }

    return NextResponse.json({ ok: false, error: `Unknown type: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error('[connect/score POST]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
