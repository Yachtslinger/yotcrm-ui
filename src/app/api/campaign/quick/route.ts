// src/app/api/campaign/quick/route.ts
// Phase-1 "easy campaign" — turn a brochure into a branded email + share link.
// POST { slug, type, testTo }  ->  builds the email and sends a TEST to testTo.
// type: "newlisting" | "pricedrop" | "newsletter"
// Reuses the brochure engine; the email is a branded wrapper + CTA to /brochures/<slug>.
import { NextRequest, NextResponse } from "next/server";
import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";

export const runtime = "nodejs";

const NAVY = "#0b2a55", ORANGE = "#e57b2e", LABEL = "#94a3b8";
const BANNER = "https://www.denisonyachtsales.com/wp-content/uploads/2023/08/Rectangle-557.png";
const BASE = "https://yotcrm-production.up.railway.app";

const HEADLINES: Record<string, string> = {
  newlisting: "Just Listed",
  pricedrop:  "Price Improved",
  newsletter: "Featured Listing",
};

function esc(s: string) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function specRow(label: string, value?: string) {
  if (!value) return "";
  return `<tr><td style="padding:6px 0;color:${LABEL};font-size:12px;text-transform:uppercase;letter-spacing:.4px">${esc(label)}</td>
    <td style="padding:6px 0;color:#fff;font-size:15px;font-weight:700;text-align:right">${esc(value)}</td></tr>`;
}

function buildEmail(slug: string, type: string, vessel: any, brokers: any[], toEmail: string) {
  const kicker = HEADLINES[type] || "Featured Listing";
  const hero = vessel.images?.[0]?.src || "https://via.placeholder.com/1200x675/0b2a55/ffffff?text=Denison";
  const name = vessel.name || slug.replace(/-/g, " ");
  const price = vessel.price || vessel.askingPrice || "";
  const link = `${BASE}/brochures/${encodeURIComponent(slug)}`;
  const b = brokers?.[0] || DEFAULT_BROKERS[0];
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;

  const specs = [
    specRow("Length", vessel.loa),
    specRow("Year", vessel.year ? String(vessel.year) : ""),
    specRow("Builder", vessel.builder),
    specRow("Guests", vessel.guests ? String(vessel.guests) : ""),
  ].join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Georgia,serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:16px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td style="background:${NAVY};padding:14px 24px"><img src="${BANNER}" alt="Denison Yachting" height="26" style="display:block"></td></tr>
  <tr><td style="padding:22px 24px 6px"><span style="color:${ORANGE};font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">${esc(kicker)}</span></td></tr>
  <tr><td style="padding:0 24px 14px"><h1 style="margin:0;color:${NAVY};font-size:26px;line-height:1.2">${esc(name)}</h1>
    ${price ? `<div style="color:${ORANGE};font-size:20px;font-weight:800;margin-top:6px">${esc(price)}</div>` : ""}</td></tr>
  <tr><td style="padding:0 24px"><img src="${esc(hero)}" alt="${esc(name)}" width="552" style="width:100%;border-radius:8px;display:block"></td></tr>
  ${specs ? `<tr><td style="padding:16px 24px"><table role="presentation" width="100%" style="background:${NAVY};border-radius:8px;padding:6px 18px">${specs}</table></td></tr>` : ""}
  <tr><td align="center" style="padding:8px 24px 24px"><a href="${link}" style="background:${ORANGE};color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 34px;border-radius:8px;display:inline-block">View Full Details &amp; Photos →</a></td></tr>
  <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:13px;color:#334155;line-height:1.6">
    <strong>${esc(b.name)}</strong><br>${esc(b.title || "")}<br>${esc(b.email || "")} · ${esc(b.mobile || b.office || "")}</td></tr>
  <tr><td style="padding:14px 24px;background:#f8fafc;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">
    Denison Yachting · Fort Lauderdale, FL<br>
    You're receiving this because you inquired about a yacht. <a href="${unsub}" style="color:#64748b">Unsubscribe</a>.</td></tr>
</table></td></tr></table></body></html>`;

  const subjectMap: Record<string, string> = {
    newlisting: `Just Listed: ${name}${price ? ` — ${price}` : ""}`,
    pricedrop:  `Price Improved: ${name}${price ? ` — now ${price}` : ""}`,
    newsletter: `Featured: ${name}`,
  };
  return { html, subject: subjectMap[type] || `Featured: ${name}`, link };
}

export async function POST(req: NextRequest) {
  try {
    const { slug, type = "newlisting", testTo } = await req.json();
    if (!slug || !testTo) return NextResponse.json({ ok: false, error: "slug and testTo required" }, { status: 400 });

    const row = getBrochure(String(slug).replace(/[^a-zA-Z0-9._-]/g, ""));
    if (!row) return NextResponse.json({ ok: false, error: "brochure not found" }, { status: 404 });

    const { html, subject, link } = buildEmail(slug, type, row.vessel, row.brokers || DEFAULT_BROKERS, testTo);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Will Noftsinger · Denison Yachting <${process.env.RESEND_FROM_EMAIL || "will@mail.theyachtcache.com"}>`,
        reply_to: "WN@DenisonYachting.com",
        to: [testTo],
        subject: `[TEST] ${subject}`,
        html,
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data.message || "Resend error" }, { status: 500 });
    return NextResponse.json({ ok: true, sentTo: testTo, subject, link, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
