// src/app/api/campaign/quick/route.ts
// Phase-1 "easy campaign" — brochure -> branded email + share link.
// POST { slug, type, testTo }  (X-Campaign-Key header, or logged-in UI)
// type: "newlisting" | "pricedrop" | "newsletter" | "sold" | "openday"
import { NextRequest, NextResponse } from "next/server";
import { getBrochure } from "@/lib/brochure-storage";

export const runtime = "nodejs";

const NAVY = "#0b1f3a", ORANGE = "#e57b2e", INK = "#3a4656", MUTE = "#94a3b8", LINE = "#e2e8f0";
const BASE = "https://yotcrm-production.up.railway.app";

const BANNERS: Record<string, string> = {
  newlisting: "JUST LISTED", pricedrop: "PRICE REDUCED",
  newsletter: "FEATURED LISTING", sold: "SOLD", openday: "OPEN FOR INSPECTION",
};
const SUBJECTS: Record<string, (n: string, p: string) => string> = {
  newlisting: (n, p) => `Just Listed: ${n}${p ? ` — ${p}` : ""}`,
  pricedrop:  (n, p) => `Price Reduced: ${n}${p ? ` — now ${p}` : ""}`,
  newsletter: (n) => `Featured: ${n}`,
  sold:       (n) => `Sold: ${n}`,
  openday:    (n) => `Inspect ${n}`,
};

function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function specCells(specs: [string, any][]) {
  const items = specs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  if (!items.length) return "";
  let rows = "", i = 0;
  while (i < items.length) {
    const slice = items.slice(i, i + 3);
    const cells = slice.map(([label, value]) => `
      <td width="33%" valign="top" style="padding:9px 4px;">
        <div style="color:#8fa8c9;font-size:10px;letter-spacing:1px;text-transform:uppercase;">${esc(label)}</div>
        <div style="color:#ffffff;font-size:15px;margin-top:3px;">${esc(value)}</div>
      </td>`).join("");
    rows += `<tr>${cells}${slice.length < 3 ? `<td width="${33 * (3 - slice.length)}%"></td>` : ""}</tr>`;
    i += 3;
  }
  return rows;
}

function buildEmail(slug: string, type: string, v: any, toEmail: string) {
  const banner = BANNERS[type] || "FEATURED LISTING";
  const imgs = (v.images || []).map((im: any) => im?.src || im).filter(Boolean);
  const hero = imgs[0] || "https://via.placeholder.com/1200x700/0b1f3a/ffffff?text=Denison";
  const g1 = imgs[1], g2 = imgs[2];
  const name = v.name || slug.replace(/-/g, " ");
  const price = v.price || v.askingPrice || "";
  const link = `${BASE}/brochures/${encodeURIComponent(slug)}`;
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;
  const specLine = [v.loa, v.builder, v.year].filter(Boolean).join("  •  ");
  const desc = (v.description || "").trim().slice(0, 460);

  const specs = specCells([
    ["Length", v.loa], ["Builder", v.builder], ["Year", v.year],
    ["Guests", v.guests], ["Range", v.range], ["Gross Tonnage", v.grossTonnage],
    ["Beam", v.beam], ["Staterooms", v.staterooms || v.cabins], ["Max Speed", v.maxSpeed],
  ]);

  const gallery = (g1 || g2) ? `<tr><td style="padding:8px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${g1 ? `<td width="50%" style="padding:3px;"><img src="${esc(g1)}" width="262" style="width:100%;height:auto;display:block" alt=""></td>` : ""}
    ${g2 ? `<td width="50%" style="padding:3px;"><img src="${esc(g2)}" width="262" style="width:100%;height:auto;display:block" alt=""></td>` : ""}
  </tr></table></td></tr>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:18px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="height:4px;background:${ORANGE};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="background:${NAVY};padding:17px 16px;font-family:Arial,Helvetica,sans-serif">
    <span style="color:#fff;font-size:13px;letter-spacing:2px">DENISON YACHTING</span>
    <span style="color:#63799a;font-size:13px;margin:0 8px">|</span>
    <span style="color:#fff;font-size:13px;letter-spacing:2px">YACHTSLINGER YACHTING</span></td></tr>
  <tr><td><img src="${esc(hero)}" width="600" style="width:100%;display:block" alt="${esc(name)}"></td></tr>
  <tr><td align="center" style="background:${ORANGE};padding:10px;color:#fff;font-size:13px;letter-spacing:3px;font-family:Arial,Helvetica,sans-serif">${esc(banner)}</td></tr>
  <tr><td align="center" style="padding:26px 30px 4px">
    <div style="color:${NAVY};font-size:32px;letter-spacing:1px">${esc(name)}</div>
    ${specLine ? `<div style="color:#64748b;font-size:12px;letter-spacing:2px;margin-top:9px;font-family:Arial,Helvetica,sans-serif">${esc(specLine)}</div>` : ""}
    ${v.location ? `<div style="color:${MUTE};font-size:11px;letter-spacing:2px;margin-top:6px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">${esc(v.location)}</div>` : ""}
    ${price ? `<div style="color:${ORANGE};font-size:23px;margin-top:14px">${esc(price)}</div>` : ""}
  </td></tr>
  ${desc ? `<tr><td align="center" style="padding:14px 34px 6px;color:${INK};font-size:13px;line-height:1.85">${esc(desc)}${(v.description||"").length > 460 ? "&hellip;" : ""}</td></tr>` : ""}
  <tr><td align="center" style="padding:16px"><a href="${link}" style="border:1px solid ${NAVY};color:${NAVY};text-decoration:none;font-size:12px;letter-spacing:2px;padding:12px 44px;display:inline-block;font-family:Arial,Helvetica,sans-serif">VIEW FULL DETAILS</a></td></tr>
  ${gallery}
  ${specs ? `<tr><td style="padding:14px 30px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px">
    <tr><td style="padding:16px 20px 8px;color:#fff;font-size:12px;letter-spacing:3px;border-bottom:2px solid ${ORANGE};font-family:Arial,Helvetica,sans-serif">SPECIFICATIONS</td></tr>
    <tr><td style="padding:8px 16px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${specs}</table></td></tr>
  </table></td></tr>` : ""}
  <tr><td align="center" style="padding:18px 30px 6px"><a href="${link}" style="background:${ORANGE};color:#fff;text-decoration:none;font-size:14px;padding:13px 40px;border-radius:5px;display:inline-block;font-family:Arial,Helvetica,sans-serif">View Full Details &amp; ${(v.images||[]).length || ""} Photos &rarr;</a></td></tr>
  <tr><td style="padding:16px 30px;border-top:1px solid ${LINE};color:#334155;font-size:12px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
    <strong>Will Noftsinger</strong> &mdash; Build Consultant, The Americas<br>WN@DenisonYachting.com &nbsp;&middot;&nbsp; 850.461.3342</td></tr>
  <tr><td align="center" style="padding:14px 24px 22px;background:#f8fafc;color:${MUTE};font-size:11px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
    Denison Yachting &middot; Yachtslinger Yachting &middot; 1550 SE 17th Street, Fort Lauderdale, FL<br>
    You received this because you inquired about a yacht. <a href="${unsub}" style="color:#64748b">Unsubscribe</a>.</td></tr>
</table></td></tr></table></body></html>`;

  const subject = (SUBJECTS[type] || SUBJECTS.newsletter)(name, price);
  return { html, subject, link };
}

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
