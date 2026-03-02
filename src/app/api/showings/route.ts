import { NextResponse } from "next/server";
import {
  getAllShowings, getShowing, createShowing, updateShowing,
  deleteShowing, logSend, getSendLog,
} from "@/lib/showings/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const showing = getShowing(Number(id));
      if (!showing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      const log = getSendLog(Number(id));
      return NextResponse.json({ ok: true, showing, send_log: log });
    }
    const items = getAllShowings();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const item = createShowing(body);
      return NextResponse.json({ ok: true, item });
    }
    if (action === "update") {
      const item = updateShowing(body.id, body);
      if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, item });
    }
    if (action === "delete") {
      const ok = deleteShowing(body.id);
      return NextResponse.json({ ok });
    }
    if (action === "log_send") {
      const entry = logSend(body.showing_id, body.recipient_name || "", body.recipient_contact || "", body.channel || "email");
      return NextResponse.json({ ok: true, entry });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
