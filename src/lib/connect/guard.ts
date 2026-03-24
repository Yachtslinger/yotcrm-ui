// src/lib/connect/guard.ts
// Performance guard for Connect API routes.
import 'server-only';
// Wraps route handlers with:
//   - Query timing (warn if > 500ms)
//   - Response payload size check (warn if > 100KB, error if > 500KB)
//   - Row count guard (error if > 50 rows slipped through pagination)

import { NextRequest, NextResponse } from 'next/server';

const SLOW_QUERY_MS    = 500;
const WARN_PAYLOAD_KB  = 100;
const MAX_PAYLOAD_KB   = 500;
const MAX_ROWS         = 50;

type Handler = (req: NextRequest, ctx?: any) => Promise<NextResponse>;

export function withGuard(routeName: string, handler: Handler): Handler {
  return async (req: NextRequest, ctx?: any): Promise<NextResponse> => {
    const start = Date.now();

    let response: NextResponse;
    try {
      response = await handler(req, ctx);
    } catch (err: any) {
      console.error(`[guard:${routeName}] unhandled error:`, err.message);
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }

    const elapsed = Date.now() - start;

    // Timing warning
    if (elapsed > SLOW_QUERY_MS) {
      console.warn(`[guard:${routeName}] SLOW ${req.method} ${req.nextUrl.pathname} — ${elapsed}ms`);
    }

    // Payload inspection (clone so we don't consume the body)
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const kb = Buffer.byteLength(text, 'utf8') / 1024;

      if (kb > MAX_PAYLOAD_KB) {
        console.error(`[guard:${routeName}] PAYLOAD_VIOLATION — ${kb.toFixed(1)}KB exceeds ${MAX_PAYLOAD_KB}KB limit`);
        // Still return the response — log only, don't break the request
      } else if (kb > WARN_PAYLOAD_KB) {
        console.warn(`[guard:${routeName}] payload ${kb.toFixed(1)}KB — approaching limit`);
      }

      // Row count check (only for JSON arrays in .data field)
      try {
        const parsed = JSON.parse(text);
        if (parsed?.data && Array.isArray(parsed.data) && parsed.data.length > MAX_ROWS) {
          console.error(`[guard:${routeName}] ROW_VIOLATION — ${parsed.data.length} rows returned (max ${MAX_ROWS})`);
        }
      } catch { /* not JSON or no .data — skip */ }
    } catch { /* body already consumed — skip size check */ }

    return response;
  };
}
