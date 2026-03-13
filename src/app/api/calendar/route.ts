import { NextRequest, NextResponse } from "next/server";
import {
  listEvents, createEvent, updateEvent, deleteEvent,
  getEvent, getAuditLog, getProspects, getVessels,
  generateICS, generateICSFeed, markEventPushed, markBulkPushed,
  getSyncLog, listDeals, createDeal, updateDeal, deleteDeal,
  getDealTimeline, createBoat,
} from "@/lib/calendar/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;

    // ICS download for single event
    const icsId = sp.get("ics");
    if (icsId) {
      const event = getEvent(Number(icsId));
      if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const ics = generateICS(event);
      return new NextResponse(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="yotcrm-event-${icsId}.ics"`,
        },
      });
    }

    // Audit log
    const auditFor = sp.get("audit");
    if (auditFor) {
      const log = getAuditLog(Number(auditFor));
      return NextResponse.json({ ok: true, log });
    }

    // Sync log
    if (sp.get("synclog") === "1") {
      const log = getSyncLog();
      return NextResponse.json({ ok: true, log });
    }

    // Bulk ICS download (date range)
    const bulkIcsStart = sp.get("bulk_ics_start");
    const bulkIcsEnd = sp.get("bulk_ics_end");
    if (bulkIcsStart && bulkIcsEnd) {
      const events = listEvents({ startDate: bulkIcsStart, endDate: bulkIcsEnd });
      const ics = generateICSFeed(events);
      return new NextResponse(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="yotcrm-${bulkIcsStart.slice(0,10)}-to-${bulkIcsEnd.slice(0,10)}.ics"`,
        },
      });
    }

    // Single event
    const eventId = sp.get("id");
    if (eventId) {
      const event = getEvent(Number(eventId));
      if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, event });
    }

    // Lookups for dropdowns
    if (sp.get("lookups") === "1") {
      return NextResponse.json({
        ok: true,
        prospects: getProspects(),
        vessels: getVessels(),
        deals: listDeals(),
      });
    }

    // Deals list
    if (sp.get("deals") === "1") {
      const stage = sp.get("stage") || undefined;
      return NextResponse.json({ ok: true, deals: listDeals(stage) });
    }

    // Deal timeline
    const timelineId = sp.get("timeline");
    if (timelineId) {
      const timeline = getDealTimeline(Number(timelineId));
      if (!timeline) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      return NextResponse.json({ ok: true, ...timeline });
    }

    // List with filters
    const filters = {
      startDate: sp.get("startDate") || undefined,
      endDate: sp.get("endDate") || undefined,
      user: sp.get("user") || undefined,
      eventType: sp.get("eventType") || undefined,
      status: sp.get("status") || undefined,
      prospectId: sp.get("prospectId") ? Number(sp.get("prospectId")) : undefined,
      vesselId: sp.get("vesselId") ? Number(sp.get("vesselId")) : undefined,
      dealId: sp.get("dealId") ? Number(sp.get("dealId")) : undefined,
      search: sp.get("search") || undefined,
    };

    const events = listEvents(filters);
    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    console.error("[calendar] GET error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { event, conflicts } = createEvent(body);
      return NextResponse.json({ ok: true, event, conflicts });
    }

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { event, conflicts } = updateEvent(body.id, body);
      if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, event, conflicts });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ok = deleteEvent(body.id, body.actor || "will");
      return NextResponse.json({ ok });
    }

    // Deal actions
    if (action === "create_deal") {
      const deal = createDeal(body);
      return NextResponse.json({ ok: true, deal });
    }

    if (action === "update_deal") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const deal = updateDeal(body.id, body);
      if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, deal });
    }

    if (action === "delete_deal") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const ok = deleteDeal(body.id);
      return NextResponse.json({ ok });
    }

    // Sync actions
    if (action === "mark_pushed") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      markEventPushed(body.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "bulk_push") {
      const ids = body.eventIds as number[];
      if (!ids || !Array.isArray(ids)) return NextResponse.json({ error: "eventIds array required" }, { status: 400 });
      markBulkPushed(ids);
      return NextResponse.json({ ok: true, count: ids.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[calendar] POST error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
