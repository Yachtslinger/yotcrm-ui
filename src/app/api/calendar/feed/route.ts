import { NextRequest, NextResponse } from "next/server";
import { listEvents, generateICSFeed } from "@/lib/calendar/storage";

export const runtime = "nodejs";

/**
 * ICS Feed Subscription Endpoint
 * 
 * Subscribe in Apple Calendar:
 *   webcal://<host>/api/calendar/feed
 * 
 * Or HTTP:
 *   https://<host>/api/calendar/feed
 * 
 * Query params:
 *   user=will|paolo     — filter by assigned user
 *   type=showing        — filter by event type
 *   days=30             — how many days ahead (default 90)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const user = sp.get("user") || undefined;
    const eventType = sp.get("type") || undefined;
    const days = Number(sp.get("days")) || 90;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Include 30 days in the past for context
    const past = new Date(now);
    past.setDate(past.getDate() - 30);
    const future = new Date(now);
    future.setDate(future.getDate() + days);

    const events = listEvents({
      startDate: past.toISOString(),
      endDate: future.toISOString(),
      user,
      eventType,
    });

    const ics = generateICSFeed(events);

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="yotcrm-calendar.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err: any) {
    console.error("[calendar/feed] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
