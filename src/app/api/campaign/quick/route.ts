// src/app/api/campaign/quick/route.ts
// Test-send: send ONE copy to testTo. Uses an edited draft if provided, else builds from the slug.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure } from "@/lib/brochure-storage";
import { buildEmail, buildEmailFromDraft } from "@/lib/campaign/quickEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("x-campaign-key") || "";
    const cookie = req.cookies.get("yotcrm_session")?.value || "";
    if (key !== (process.env.CAMPAIGN_KEY || "yotcrm-campaign-2026") && cookie.length < 10) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { slug, type = "newlisting", testTo, draft } = body;
    if (!testTo || (!slug && !draft)) return NextResponse.json({ ok: false, error: "testTo and slug/draft required" }, { status: 400 });

    let html = "", subject = "";
    if (draft) {
      ({ html, subject } = buildEmailFromDraft(draft, testTo));
    } else {
      const row = getBrochure(String(slug).replace(/[^a-zA-Z0-9._-]/g, ""));
      if (!row) return NextResponse.json({ ok: false, error: "brochure not found" }, { status: 404 });
      ({ html, subject } = buildEmail(slug, type, row.vessel, testTo));
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Denison Yachting <${process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`,
        reply_to: "WN@DenisonYachting.com", to: [testTo], subject: `[TEST] ${subject}`, html,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data.message || "Resend error" }, { status: 500 });
    return NextResponse.json({ ok: true, sentTo: testTo, subject, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
