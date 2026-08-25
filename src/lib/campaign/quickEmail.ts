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

export type Broker = { name: string; title?: string; email?: string; cell?: string; office?: string; phone?: string; photo?: string; link?: string };
export type GalleryItem = { src: string; link?: string };
export type Button = { label: string; url: string };
export type Draft = {
  slug: string; type: string; bannerText: string;
  subject: string; headline: string; specLine: string; location: string; price: string;
  description: string; heroUrl: string; heroLink?: string; linkUrl?: string;
  gallery: GalleryItem[]; specs: [string, string][]; features: string[];
  buttons: Button[]; brokers: Broker[]; brochureUrl: string; photoCount: number;
  showFeatures?: boolean; showSpecs?: boolean; showGallery?: boolean; showDescription?: boolean;
  kind?: "listing" | "boatshow";
  show?: ShowInfo;
};

export type ShowFeaturedYacht = { label: string; url?: string };
export type ShowInfo = {
  name: string; tagline?: string; dates: string; hours?: string;
  venue: string; ourLocation?: string; rsvpUrl?: string;
  eyebrow?: string; personalNote?: string;
  about?: string; highlights?: string[]; showUrl?: string;
  featured?: ShowFeaturedYacht[];
};

export const DEFAULT_BROKERS: Broker[] = [
  { name: "William (Will) Noftsinger III", title: "Yacht Broker", email: "WN@DenisonYachting.com", cell: "(850) 461-3342", office: "954.763.3971", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg", link: "https://www.denisonyachtsales.com/broker/will-noftsinger" },
  { name: "Paolo Ameglio", title: "Yacht Broker", email: "PGA@DenisonYachting.com", cell: "(786) 251-2588", office: "954.763.3971", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg", link: "https://www.denisonyachtsales.com/broker/paolo-ameglio" },
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
    linkUrl: (vessel as any).sourceUrl || "",
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
  if (dr.kind === "boatshow") return buildShowInviteFromDraft(dr, toEmail);
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;
  const link = dr.linkUrl || dr.brochureUrl;
  const hero = dr.heroUrl || "https://via.placeholder.com/1200x700/0b1f3a/ffffff?text=Denison";
  const heroImg = `<img src="${esc(hero)}" width="600" style="width:100%;display:block" alt="${esc(dr.headline)}">`;

  const descHtml = (dr.description || "").split(/\n{2,}/).filter(Boolean)
    .map(p => `<div style="margin-bottom:10px">${esc(p)}</div>`).join("");

  const specs = specCells(dr.specs || []);
  const gal = (dr.gallery || []).filter(g => g && g.src);
  const gallery = gal.length ? `<tr><td style="padding:8px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${
    gal.slice(0, 2).map(g => { const im = `<img src="${esc(g.src)}" width="262" style="width:100%;height:auto;display:block" alt="">`;
      return `<td width="50%" style="padding:3px;"><a href="${esc(g.link || link)}">${im}</a></td>`; }).join("")
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
    .map(b => {
      const info = ([["EMAIL", b.email], ["CELL", b.cell || b.phone], ["OFFICE", b.office]] as [string, string | undefined][])
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><td valign="top" style="color:${ORANGE};font-size:10px;letter-spacing:1px;padding:3px 14px 3px 0;font-weight:bold;white-space:nowrap;font-family:Arial,Helvetica,sans-serif">${k}</td><td valign="top" style="color:#475569;font-size:13px;padding:3px 0;font-family:Arial,Helvetica,sans-serif">${esc(v)}</td></tr>`).join("");
      const img = b.photo ? `<img src="${esc(b.photo)}" width="94" height="94" style="width:94px;height:94px;object-fit:cover;border-radius:6px;display:block;border:0" alt="${esc(b.name)}">` : "";
      const photoCell = b.photo ? `<td width="106" valign="top" style="padding:0 12px 0 0">${b.link ? `<a href="${esc(b.link)}">${img}</a>` : img}</td>` : "";
      return `<tr><td style="padding:16px 30px;border-top:1px solid ${LINE}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${photoCell}
        <td valign="middle">
          <div style="color:${NAVY};font-size:17px;font-weight:bold;margin-bottom:7px;font-family:Arial,Helvetica,sans-serif">${esc(b.name)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0">${info}</table>
        </td></tr></table></td></tr>`;
    }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:18px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="font-size:0;line-height:0"><img src="${BASE}/denison-header.png" alt="Denison Yachting" width="600" style="width:100%;height:auto;display:block;border:0"></td></tr>
  <tr><td><a href="${esc(dr.heroLink || link)}">${heroImg}</a></td></tr>
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

// ── Boat show invitation ────────────────────────────────────────────────────
// A blank draft pre-set for an event invite. Reuses the Draft shape so it flows
// through the exact same test-send / group-send / suppression / dedupe engine.
export function createShowDraft(): Draft {
  return {
    slug: "", type: "boatshow", kind: "boatshow", bannerText: "YOU'RE INVITED",
    subject: "You're invited — join us at the show",
    headline: "", specLine: "", location: "", price: "",
    description: "", heroUrl: "", linkUrl: "",
    gallery: [], specs: [], features: [], buttons: [],
    brokers: [DEFAULT_BROKERS[0]], brochureUrl: "", photoCount: 0,
    show: {
      name: "", tagline: "", dates: "", hours: "", venue: "", ourLocation: "",
      rsvpUrl: "", eyebrow: "YOU'RE INVITED", personalNote: "", featured: [],
    },
  };
}

export function buildShowInviteFromDraft(dr: Draft, toEmail: string) {
  const s: ShowInfo = dr.show || ({} as ShowInfo);
  const slug = dr.slug || "";
  const unsub = `${BASE}/api/campaign/unsubscribe?e=${encodeURIComponent(toEmail)}`;
  const prefs = `${BASE}/api/campaign/preferences?e=${encodeURIComponent(toEmail)}&topic=events`;
  const rsvp = s.rsvpUrl && s.rsvpUrl.trim()
    ? s.rsvpUrl.trim()
    : `${BASE}/api/campaign/rsvp?e=${encodeURIComponent(toEmail)}&show=${encodeURIComponent(slug)}`;
  const hero = dr.heroUrl || "https://via.placeholder.com/1200x600/0b1f3a/ffffff?text=Denison+Yachting";
  const eyebrow = (s.eyebrow || "YOU'RE INVITED").toUpperCase();

  const detail = (label: string, val?: string) => (val && String(val).trim())
    ? `<tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.12)">
        <div style="color:#8fa8c9;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif">${esc(label)}</div>
        <div style="color:#fff;font-size:15px;margin-top:3px;font-family:Arial,Helvetica,sans-serif">${esc(val)}</div></td></tr>`
    : "";
  const details = [detail("Dates", s.dates), detail("Hours", s.hours), detail("Venue", s.venue), detail("Find us", s.ourLocation)].join("");

  const feats = (s.featured || []).filter(f => f && f.label && f.label.trim());
  const featuredBlock = feats.length ? `<tr><td style="padding:6px 34px 10px">
    <div style="color:${NAVY};font-size:12px;letter-spacing:2px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;padding-bottom:6px">ON DISPLAY</div>
    ${feats.map(f => { const label = esc(f.label); const inner = (f.url && f.url.trim()) ? `<a href="${esc(f.url)}" style="color:${NAVY};text-decoration:none;font-weight:bold">${label} &rsaquo;</a>` : `<span style="color:${INK}">${label}</span>`;
      return `<div style="font-size:13px;line-height:1.7;padding:4px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif">${inner}</div>`; }).join("")}
  </td></tr>` : "";

  const brokersRows = (dr.brokers && dr.brokers.length ? dr.brokers : DEFAULT_BROKERS.slice(0, 1))
    .map(b => {
      const info = ([["EMAIL", b.email], ["CELL", b.cell || b.phone], ["OFFICE", b.office]] as [string, string | undefined][])
        .filter(([, v]) => v)
        .map(([k, v]) => `<tr><td valign="top" style="color:${ORANGE};font-size:10px;letter-spacing:1px;padding:3px 14px 3px 0;font-weight:bold;white-space:nowrap;font-family:Arial,Helvetica,sans-serif">${k}</td><td valign="top" style="color:#475569;font-size:13px;padding:3px 0;font-family:Arial,Helvetica,sans-serif">${esc(v)}</td></tr>`).join("");
      const img = b.photo ? `<img src="${esc(b.photo)}" width="94" height="94" style="width:94px;height:94px;object-fit:cover;border-radius:6px;display:block;border:0" alt="${esc(b.name)}">` : "";
      const photoCell = b.photo ? `<td width="106" valign="top" style="padding:0 12px 0 0">${b.link ? `<a href="${esc(b.link)}">${img}</a>` : img}</td>` : "";
      return `<tr><td style="padding:16px 30px;border-top:1px solid ${LINE}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
        ${photoCell}
        <td valign="middle">
          <div style="color:${NAVY};font-size:17px;font-weight:bold;margin-bottom:7px;font-family:Arial,Helvetica,sans-serif">${esc(b.name)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0">${info}</table>
        </td></tr></table></td></tr>`;
    }).join("");

  const note = (s.personalNote && s.personalNote.trim())
    ? `<tr><td style="padding:0 34px 4px;color:${INK};font-size:14px;line-height:1.75;font-family:Georgia,'Times New Roman',serif">${esc(s.personalNote)}</td></tr>`
    : "";
  const about = (s.about && s.about.trim())
    ? `<tr><td style="padding:0 34px 10px;color:${INK};font-size:13px;line-height:1.7;font-family:Georgia,'Times New Roman',serif">${esc(s.about)}</td></tr>`
    : "";
  const hl = (s.highlights || []).filter(x => x && String(x).trim());
  const highlightsBlock = hl.length ? `<tr><td style="padding:2px 34px 10px">
    <div style="color:${NAVY};font-size:12px;letter-spacing:2px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;padding-bottom:6px">SHOW HIGHLIGHTS</div>
    ${hl.map(x => `<div style="color:${INK};font-size:13px;line-height:1.7;padding:2px 0;font-family:Arial,Helvetica,sans-serif"><span style="color:${ORANGE}">&bull;</span> ${esc(x)}</div>`).join("")}
  </td></tr>` : "";
  const showLink = (s.showUrl && s.showUrl.trim())
    ? `<div style="margin-top:8px"><a href="${esc(s.showUrl)}" style="color:${NAVY};font-size:12px;font-family:Arial,Helvetica,sans-serif">Visit the show website &rsaquo;</a></div>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f6;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:18px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="font-size:0;line-height:0"><img src="${BASE}/denison-header.png" alt="Denison Yachting" width="600" style="width:100%;height:auto;display:block;border:0"></td></tr>
  <tr><td>${dr.linkUrl ? `<a href="${esc(dr.linkUrl)}">` : ""}<img src="${esc(hero)}" width="600" style="width:100%;display:block" alt="${esc(s.name)}">${dr.linkUrl ? "</a>" : ""}</td></tr>
  <tr><td align="center" style="background:${ORANGE};padding:9px;color:#fff;font-size:12px;letter-spacing:3px;font-family:Arial,Helvetica,sans-serif">${esc(eyebrow)}</td></tr>
  <tr><td align="center" style="padding:24px 30px 4px">
    <div style="color:${NAVY};font-size:28px;letter-spacing:.5px;line-height:1.25">${esc(s.name)}</div>
    ${s.tagline ? `<div style="color:#64748b;font-size:13px;margin-top:8px;font-family:Arial,Helvetica,sans-serif">${esc(s.tagline)}</div>` : ""}
  </td></tr>
  <tr><td style="padding:16px 34px 6px;color:${INK};font-size:14px;line-height:1.8">
    The ${esc(s.name || "show")} is almost here — and we'd love to see you there. If you're planning to come, or thinking about it, let's set aside time to walk a few boats together, away from the crowds. Tell us what you're looking for and we'll line it up.
  </td></tr>
  ${about}
  ${note}
  <tr><td style="padding:10px 30px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px">
    <tr><td style="padding:6px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table></td></tr>
  </table></td></tr>
  ${highlightsBlock}
  <tr><td align="center" style="padding:2px 30px 10px">
    <a href="${esc(rsvp)}" style="background:${ORANGE};color:#fff;text-decoration:none;font-size:14px;padding:14px 40px;border-radius:5px;display:inline-block;font-weight:bold;font-family:Arial,Helvetica,sans-serif">RSVP / Reserve a time to meet</a>
    <div style="color:${MUTE};font-size:12px;margin-top:10px;font-family:Arial,Helvetica,sans-serif">Or just reply to this email and we'll hold a time for you.</div>
    ${showLink}
  </td></tr>
  ${featuredBlock}
  ${brokersRows}
  <tr><td align="center" style="padding:14px 24px 22px;background:#f8fafc;color:${MUTE};font-size:11px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">
    Denison Yachting &middot; 1550 SE 17th Street, Fort Lauderdale, FL<br>
    You're receiving this because you asked to hear from us about events and shows.<br>
    <a href="${unsub}" style="color:#64748b">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="${prefs}" style="color:#64748b">Update preferences</a></td></tr>
</table></td></tr></table></body></html>`;

  return { html, subject: dr.subject };
}
