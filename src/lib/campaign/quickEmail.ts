// src/lib/campaign/quickEmail.ts
// Draft-based branded campaign email. Pure functions — imported by BOTH the
// client editor (live preview) and the server (test/group send) so the preview
// is byte-identical to what gets sent.
const NAVY = "#0b1f3a", ORANGE = "#e57b2e", INK = "#3a4656", MUTE = "#94a3b8", LINE = "#e2e8f0";
const BASE = "https://yotcrm-production.up.railway.app";

export const BANNERS: Record<string, string> = {
  newlisting: "JUST LISTED", pricedrop: "PRICE REDUCED",
  newsletter: "FEATURED LISTING", sold: "SOLD", openday: "OPEN FOR INSPECTION",
};
export const SUBJECTS: Record<string, (n: string, p: string) => string> = {
  newlisting: (n, p) => `Just Listed: ${n}${p ? ` — ${p}` : ""}`,
  pricedrop:  (n, p) => `Price Reduced: ${n}${p ? ` — now ${p}` : ""}`,
  newsletter: (n) => `Featured: ${n}`,
  sold:       (n) => `Sold: ${n}`,
  openday:    (n) => `Inspect ${n}`,
};

export type Broker = { name: string; title?: string; email?: string; phone?: string };
export type GalleryItem = { src: string; link?: string };
export type Button = { label: string; url: string };
export type Draft = {
  slug: string; type: string; bannerText: string;
  subject: string; headline: string; specLine: string; location: string; price: string;
  description: string; heroUrl: string; heroLink?: string;
  gallery: GalleryItem[]; specs: [string, string][]; features: string[];
  buttons: Button[]; brokers: Broker[]; brochureUrl: string; photoCount: number;
  showFeatures?: boolean; showSpecs?: boolean; showGallery?: boolean; showDescription?: boolean;
};

export const DEFAULT_BROKERS: Broker[] = [
  { name: "Will Noftsinger", title: "Build Consultant, The Americas", email: "WN@DenisonYachting.com", phone: "850.461.3342" },
  { name: "Paolo Ameglio", title: "Yacht Broker", email: "PGA@DenisonYachting.com", phone: "786.251.2588" },
];

function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function vesselToDraft(vessel: any, type: string, slug: string): Draft {
  const imgs = (vessel.images || []).map((im: any) => (im?.src || im)).filter(Boolean);
  const name = vessel.name || slug.replace(/-/g, " ");
  const price = vessel.price || vessel.askingPrice || "";
  const specs: [string, string][] = [
    ["Length", vessel.loa], ["Builder", vessel.builder], ["Year", vessel.year],
    ["Guests", vessel.guests], ["Range", vessel.range], ["Gross Tonnage", vessel.grossTonnage],
    ["Beam", vessel.beam], ["Staterooms", vessel.staterooms || vessel.cabins], ["Max Speed", vessel.maxSpeed],
  ].filter(([, v]) => v != null && String(v).trim() !== "").map(([a, b]) => [String(a), String(b)]);
  return {
    slug, type, bannerText: BANNERS[type] || "FEATURED LISTING",
    subject: (SUBJECTS[type] || SUBJECTS.newsletter)(name, price),
    headline: name,
    specLine: [vessel.loa, vessel.builder, vessel.year].filter(Boolean).join("  •  "),
    location: vessel.location || "",
    price,
    description: (vessel.description || "").trim().slice(0, 600),
    heroUrl: imgs[0] || "",
    gallery: imgs.slice(1, 3).map((s: string) => ({ src: s })),
    specs,
    features: (vessel.features || []).map((f: any) => String(f).trim()).filter(Boolean).slice(0, 8),
    buttons: [],
    brokers: [DEFAULT_BROKERS[0]],
    brochureUrl: `${BASE}/brochures/${encodeURIComponent(slug)}`,
    photoCount: imgs.length,
    showFeatures: true, showSpecs: true, showGallery: true, showDescription: true,
  };
}

function specCells(specs: [string, string][]) {
  const items = specs.filter(([, v]) => v && String(v).trim() !== "");
  if (!items.length) return "";
  let rows = "", i = 0;
  while (i < items.length) {
    const slice = items.slice(i, i + 3);
    const cells = slice.map(([lab, val]) => `<td width="33%" valign="top" style="padding:9px 4px;">
        <div style="color:#8fa8c9;font-size:10px;letter-spacing:1px;text-transform:uppercase;">${esc(lab)}</div>
        <div style="color:#ffffff;font-size:15px;margin-top:3px;">${esc(val)}</div></td>`).join("");
    rows += `<tr>${cells}${slice.length < 3 ? `<td width="${33 * (3 - slice.length)}%"></td>` : ""}</tr>`;
    i += 3;
  }
  return rows;
}

export function buildEmailFromDraft(dr: Draft, toEmail: string) {
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;
  const link = dr.brochureUrl;
  const hero = dr.heroUrl || "https://via.placeholder.com/1200x700/0b1f3a/ffffff?text=Denison";
  const heroImg = `<img src="${esc(hero)}" width="600" style="width:100%;display:block" alt="${esc(dr.headline)}">`;

  const descHtml = (dr.description || "").split(/\n{2,}/).filter(Boolean)
    .map(p => `<div style="margin-bottom:10px">${esc(p)}</div>`).join("");

  const specs = specCells(dr.specs || []);
  const gal = (dr.gallery || []).filter(g => g && g.src);
  const gallery = gal.length ? `<tr><td style="padding:8px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${
    gal.slice(0, 2).map(g => { const im = `<img src="${esc(g.src)}" width="262" style="width:100%;height:auto;display:block" alt="">`;
      return `<td width="50%" style="padding:3px;">${g.link ? `<a href="${esc(g.link)}">${im}</a>` : im}</td>`; }).join("")
    }</tr></table></td></tr>` : "";

  const customBtns = (dr.buttons || []).filter(b => b.label && b.url);
  const buttonsRow = customBtns.length ? `<tr><td align="center" style="padding:4px 30px 8px">${
    customBtns.map(b => `<a href="${esc(b.url)}" style="background:${NAVY};color:#fff;text-decoration:none;font-size:13px;padding:11px 26px;border-radius:5px;display:inline-block;margin:4px;font-family:Arial,Helvetica,sans-serif">${esc(b.label)}</a>`).join("")
    }</td></tr>` : "";

  const featList = (dr.features || []).filter(Boolean);
  const featuresBlock = (dr.showFeatures !== false && featList.length) ? `<tr><td style="padding:8px 34px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="color:${NAVY};font-size:12px;letter-spacing:2px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;padding-bottom:6px">KEY FEATURES</td></tr>
    ${featList.map(f => `<tr><td style="color:${INK};font-size:13px;line-height:1.6;padding:2px 0;font-family:Arial,Helvetica,sans-serif"><span style="color:${ORANGE}">&bull;</span> ${esc(f)}</td></tr>`).join("")}
  </table></td></tr>` : "";

  const brokersRows = (dr.brokers && dr.brokers.length ? dr.brokers : DEFAULT_BROKERS.slice(0, 1))
    .map(b => `<tr><td style="padding:14px 30px;border-top:1px solid ${LINE};color:#334155;font-size:12px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
      <strong>${esc(b.name)}</strong>${b.title ? ` &mdash; ${esc(b.title)}` : ""}<br>${esc(b.email || "")}${b.phone ? ` &nbsp;&middot;&nbsp; ${esc(b.phone)}` : ""}</td></tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:18px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="font-size:0;line-height:0"><img src="${BASE}/denison-header.png" alt="Denison Yachting" width="600" style="width:100%;height:auto;display:block;border:0"></td></tr>
  <tr><td>${dr.heroLink ? `<a href="${esc(dr.heroLink)}">${heroImg}</a>` : heroImg}</td></tr>
  ${dr.bannerText ? `<tr><td align="center" style="background:${ORANGE};padding:10px;color:#fff;font-size:13px;letter-spacing:3px;font-family:Arial,Helvetica,sans-serif">${esc(dr.bannerText)}</td></tr>` : ""}
  <tr><td align="center" style="padding:26px 30px 4px">
    <div style="color:${NAVY};font-size:32px;letter-spacing:1px">${esc(dr.headline)}</div>
    ${dr.specLine ? `<div style="color:#64748b;font-size:12px;letter-spacing:2px;margin-top:9px;font-family:Arial,Helvetica,sans-serif">${esc(dr.specLine)}</div>` : ""}
    ${dr.location ? `<div style="color:${MUTE};font-size:11px;letter-spacing:2px;margin-top:6px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">${esc(dr.location)}</div>` : ""}
    ${dr.price ? `<div style="color:${ORANGE};font-size:23px;margin-top:14px">${esc(dr.price)}</div>` : ""}
  </td></tr>
  ${(dr.showDescription !== false && descHtml) ? `<tr><td align="center" style="padding:14px 34px 6px;color:${INK};font-size:13px;line-height:1.85">${descHtml}</td></tr>` : ""}
  ${featuresBlock}
  <tr><td align="center" style="padding:14px"><a href="${esc(link)}" style="border:1px solid ${NAVY};color:${NAVY};text-decoration:none;font-size:12px;letter-spacing:2px;padding:12px 44px;display:inline-block;font-family:Arial,Helvetica,sans-serif">VIEW FULL DETAILS</a></td></tr>
  ${buttonsRow}
  ${dr.showGallery === false ? "" : gallery}
  ${(dr.showSpecs !== false && specs) ? `<tr><td style="padding:14px 30px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px">
    <tr><td style="padding:16px 20px 8px;color:#fff;font-size:12px;letter-spacing:3px;border-bottom:2px solid ${ORANGE};font-family:Arial,Helvetica,sans-serif">SPECIFICATIONS</td></tr>
    <tr><td style="padding:8px 16px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${specs}</table></td></tr></table></td></tr>` : ""}
  <tr><td align="center" style="padding:18px 30px 6px"><a href="${esc(link)}" style="background:${ORANGE};color:#fff;text-decoration:none;font-size:14px;padding:13px 40px;border-radius:5px;display:inline-block;font-family:Arial,Helvetica,sans-serif">View Full Details &amp; ${dr.photoCount || ""} Photos &rarr;</a></td></tr>
  ${brokersRows}
  <tr><td align="center" style="padding:14px 24px 22px;background:#f8fafc;color:${MUTE};font-size:11px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
    Denison Yachting &middot; Yachtslinger &middot; 1550 SE 17th Street, Fort Lauderdale, FL<br>
    You received this because you inquired about a yacht. <a href="${unsub}" style="color:#64748b">Unsubscribe</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { html, subject: dr.subject };
}

// Backward-compatible helper used by automation (build from a slug+vessel).
export function buildEmail(slug: string, type: string, vessel: any, toEmail: string) {
  const dr = vesselToDraft(vessel, type, slug);
  const { html, subject } = buildEmailFromDraft(dr, toEmail);
  return { html, subject, link: dr.brochureUrl };
}
