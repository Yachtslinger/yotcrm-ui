// src/app/api/campaign/quick/route.ts
// Test-send: brochure -> branded email -> send ONE copy to testTo.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure } from "@/lib/brochure-storage";
import { buildEmail } from "@/lib/campaign/quickEmail";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("x-campaign-key") || "";
    if (key !== (process.env.CAMPAIGN_KEY || "yotcrm-campaign-2026")) {
      return NextResponse.json({ ok: false, error: "bad campaign key" }, { status: 401 });
    }
    const { slug, type = "newlisting", testTo } = await req.json();
    if (!slug || !testTo) return NextResponse.json({ ok: false, error: "slug and testTo required" }, { status: 400 });

    const row = getBrochure(String(slug).replace(/[^a-zA-Z0-9._-]/g, ""));
    if (!row) return NextResponse.json({ ok: false, error: "brochure not found" }, { status: 404 });

    const { html, subject, link } = buildEmail(slug, type, row.vessel, testTo);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Denison Yachting <${process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`,
        reply_to: "WN@DenisonYachting.com",
        to: [testTo], subject: `[TEST] ${subject}`, html,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data.message || "Resend error" }, { status: 500 });
    return NextResponse.json({ ok: true, sentTo: testTo, subject, link, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
