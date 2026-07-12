// src/app/api/campaign/quick/route.ts
// Phase-1 "easy campaign" — brochure -> branded email + share link.
// POST { slug, type, testTo }  (X-Campaign-Key header, or logged-in UI)
// type: "newlisting" | "pricedrop" | "newsletter" | "sold" | "openday"
import { NextRequest, NextResponse } from "next/server";
import { getBrochure, DEFAULT_BROKERS } from "@/lib/brochure-storage";

export const runtime = "nodejs";

const NAVY = "#0b2a55", ORANGE = "#e57b2e", INK = "#334155", MUTE = "#64748b", LINE = "#e2e8f0";
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

// A specifications grid cell (label over value), navy panel, 3-up.
function specCells(specs: [string, any][]) {
  const items = specs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  if (!items.length) return "";
  let rows = "", i = 0;
  while (i < items.length) {
    const slice = items.slice(i, i + 3);
    const cells = slice.map(([label, value]) => `
      <td width="33%" valign="top" style="padding:10px 6px;">
        <div style="color:#8fa8c9;font-size:10px;letter-spacing:1px;text-transform:uppercase;">${esc(label)}</div>
        <div style="color:#ffffff;font-size:15px;font-weight:700;margin-top:3px;">${esc(value)}</div>
      </td>`).join("");
    rows += `<tr>${cells}${slice.length < 3 ? `<td width="${33 * (3 - slice.length)}%"></td>` : ""}</tr>`;
    i += 3;
  }
  return rows;
}

function buildEmail(slug: string, type: string, v: any, brokers: any[], toEmail: string) {
  const banner = BANNERS[type] || "FEATURED LISTING";
  const imgs = (v.images || []).map((im: any) => im?.src || im).filter(Boolean);
  const hero = imgs[0] || "https://via.placeholder.com/1200x700/0b2a55/ffffff?text=Denison";
  const g1 = imgs[1], g2 = imgs[2];
  const name = v.name || slug.replace(/-/g, " ");
  const price = v.price || v.askingPrice || "";
  const link = `${BASE}/brochures/${encodeURIComponent(slug)}`;
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;
  const b = brokers?.[0] || DEFAULT_BROKERS[0];
  const specLine = [v.loa, v.builder, v.year].filter(Boolean).join("  ·  ");
  const desc = (v.description || "").trim().slice(0, 480);

  const specs = specCells([
    ["Length", v.loa], ["Beam", v.beam], ["Draft", v.draft],
    ["Year", v.year], ["Builder", v.builder], ["Guests", v.guests],
    ["Staterooms", v.staterooms || v.cabins], ["Crew", v.crew], ["Gross Tonnage", v.grossTonnage],
    ["Max Speed", v.maxSpeed], ["Range", v.range], ["Hull", v.hullMaterial],
  ]);

  const gallery = (g1 || g2) ? `<tr><td style="padding:6px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${g1 ? `<td width="50%" style="padding:4px;"><img src="${esc(g1)}" width="266" style="width:100%;border-radius:6px;display:block" alt=""></td>` : ""}
    ${g2 ? `<td width="50%" style="padding:4px;"><img src="${esc(g2)}" width="266" style="width:100%;border-radius:6px;display:block" alt=""></td>` : ""}
  </tr></table></td></tr>` : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:18px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="height:5px;background:${ORANGE};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="background:${NAVY};padding:18px 24px">
    <div style="color:#fff;font-size:22px;letter-spacing:6px;font-weight:700">DENISON</div>
    <div style="color:#9fb4d4;font-size:10px;letter-spacing:5px;margin-top:2px">Y A C H T I N G</div></td></tr>
  <tr><td><img src="${esc(hero)}" width="600" style="width:100%;display:block" alt="${esc(name)}"></td></tr>
  <tr><td align="center" style="background:${ORANGE};padding:11px 24px;color:#fff;font-size:15px;font-weight:700;letter-spacing:2px">${esc(banner)}</td></tr>
  <tr><td align="center" style="padding:24px 24px 6px">
    <div style="color:${NAVY};font-size:30px;font-weight:800;letter-spacing:1px">${esc(name)}</div>
    ${specLine ? `<div style="color:${MUTE};font-size:14px;margin-top:8px;letter-spacing:.5px">${esc(specLine)}</div>` : ""}
    ${v.location ? `<div style="color:${MUTE};font-size:12px;margin-top:6px;letter-spacing:1px;text-transform:uppercase">&#9679; ${esc(v.location)}</div>` : ""}
  </td></tr>
  <tr><td align="center" style="padding:16px 24px 6px">
    <a href="${link}" style="border:2px solid ${ORANGE};color:${ORANGE};text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1.5px;padding:12px 40px;display:inline-block">VIEW ONLINE</a></td></tr>
  ${desc ? `<tr><td align="center" style="padding:14px 34px;color:${INK};font-size:14px;line-height:1.7">${esc(desc)}${(v.description||"").length > 480 ? "&hellip;" : ""}</td></tr>` : ""}
  ${price ? `<tr><td align="center" style="padding:6px 24px 16px;color:${ORANGE};font-size:22px;font-weight:800">${esc(price)}</td></tr>` : ""}
  ${gallery}
  ${specs ? `<tr><td style="padding:18px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:8px">
    <tr><td style="padding:16px 18px 6px;color:#fff;font-size:14px;font-weight:800;letter-spacing:2px;border-bottom:2px solid ${ORANGE}">SPECIFICATIONS</td></tr>
    <tr><td style="padding:6px 12px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${specs}</table></td></tr>
  </table></td></tr>` : ""}
  <tr><td align="center" style="padding:20px 24px 8px"><a href="${link}" style="background:${ORANGE};color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 44px;border-radius:6px;display:inline-block">View Full Details &amp; ${(v.images||[]).length || ""} Photos &rarr;</a></td></tr>
  <tr><td style="padding:18px 24px;border-top:1px solid ${LINE};color:${INK};font-size:13px;line-height:1.6">
    <strong>${esc(b.name)}</strong><br>${esc(b.title || "")}<br>${esc(b.email || "")} &nbsp;&middot;&nbsp; ${esc(b.mobile || b.office || "")}</td></tr>
  <tr><td align="center" style="padding:14px 24px 22px;background:#f8fafc;color:#94a3b8;font-size:11px;line-height:1.6">
    Denison Yachting &middot; 1550 SE 17th Street, Fort Lauderdale, FL 33316<br>
    You received this because you inquired about a yacht. <a href="${unsub}" style="color:${MUTE}">Unsubscribe</a>.</td></tr>
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

    const { html, subject, link } = buildEmail(slug, type, row.vessel, row.brokers || DEFAULT_BROKERS, testTo);

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
