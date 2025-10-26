// src/app/campaigns/page.tsx
"use client";

import * as React from "react";

/**
 * Denison-styled Campaign Builder (clean rebuild)
 * - Container width: 675px (matches your design)
 * - Full-width navy header bar inside the container
 * - Centered Denison header image from /public/email/denison-header-675.png
 * - Square broker photos (100x100)
 * - Simple form to edit fields; Copy/Download HTML
 */

type Spec = { label: string; value: string };
type Agent = { name: string; title: string; email: string; cell: string; office: string; photo: string };

const NAVY = "#0b2a55";
const ORANGE = "#e57b2e";
const TEXT = "#0f172a";
const GRAY = "#4b5563";
const LABEL = "#cbd5e1";
const CONTAINER = 675;

// LOCAL banner (place your PNG at /public/email/denison-header-675.png)
const BANNER_LOCAL = "/email/denison-header-675.png";

/* --------------------------- Utilities --------------------------- */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
function nowStamp(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/* --------------------- Default agents (square photos) ------------------ */
const DEFAULT_ME: Agent = {
  name: "Will Noftsinger",
  title: "Yacht Broker, Denison Yachting",
  email: "WN@DenisonYachting.com",
  cell: "850.461.3342",
  office: "954.763.3971",
  photo: "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp",
};
const PETER: Agent = {
  name: "Peter Quintal",
  title: "Listing Agent, Denison Yachting",
  email: "peter@denisonyachting.com",
  cell: "+1 (954) 817-5662",
  office: "954.763.3971",
  photo: "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp".replace(
    "Will-Noftsinger",
    "Peter-Quintal"
  ),
};
const PAOLO: Agent = {
  name: "Paolo Ameglio",
  title: "Listing Agent, Denison Yachting",
  email: "pga@denisonyachting.com",
  cell: "(786) 251-2588",
  office: "954.763.3971",
  photo: "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp".replace(
    "Will-Noftsinger",
    "Paolo-Ameglio"
  ),
};

export default function CampaignsPage(): React.ReactElement {
  /* Core fields */
  const [bannerUrl] = React.useState<string>(BANNER_LOCAL); // hard-locked to local asset
  const [subject, setSubject] = React.useState("35m (115') AvA Yachts 2022 — Back in Monaco");
  const [preheader, setPreheader] = React.useState("Full photo set, specs, and private showings.");
  const [headline, setHeadline] = React.useState("35m (115') AvA Yachts 2022");
  const [location, setLocation] = React.useState("MONACO");
  const [subBanner, setSubBanner] = React.useState("Back in Monaco After a Successful Charter Season");
  const [ctaText, setCtaText] = React.useState("HIGHLIGHT VIDEO");
  const [ctaHref, setCtaHref] = React.useState("https://www.denisonyachtsales.com/yachts-for-sale/ducale-120-120-ocean-king-I");
  const [price, setPrice] = React.useState("€10,450,000");
  const [heroUrl, setHeroUrl] = React.useState(
    "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074103462-1_XLARGE.jpg?w=1500&h=900&format=webp"
  );
  const [intro, setIntro] = React.useState(
    "M/Y INFINITY NINE is the hull #2 of the Kando 110 model, extended to 35m. Delivered in 2022 by AvA Yachts with a steel hull and aluminium superstructure, her incredible range is 6000 miles. Interior features great volumes and 12 guests in 6 luxury cabins."
  );

  /* Optional gallery & specs & features */
  const [galleryText, setGalleryText] = React.useState(
    [
      "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074109803-1_XLARGE.jpg?w=900&h=600&format=webp",
      "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074114935-1_XLARGE.jpg?w=900&h=600&format=webp",
    ].join("\n")
  );
  const gallery = React.useMemo(
    () => galleryText.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 2),
    [galleryText]
  );

  const [specs, setSpecs] = React.useState<Spec[]>([
    { label: "LENGTH", value: "35m (115')" },
    { label: "BEAM", value: "25' 7''" },
    { label: "DRAFT", value: "7' 10''" },
    { label: "STATEROOMS", value: "6 Staterooms" },
    { label: "ENGINES", value: "Volvo Penta" },
    { label: "POWER", value: "650 hp" },
  ]);

  const [featuresText, setFeaturesText] = React.useState(
    [
      "Amazing explorer with 333 GT and unmatched 6000-mile range",
      "6 guest cabins, including 2 full-beam masters",
      "Bureau Veritas classification “Unrestricted”",
      "Powered by 2x Volvo Penta D16C-DMH 650HP",
      "Loaded with many options and toys",
    ].join("\n")
  );

  /* Agents */
  const [me, setMe] = React.useState<Agent>(DEFAULT_ME);
  const [usePeter, setUsePeter] = React.useState(false);
  const [usePaolo, setUsePaolo] = React.useState(false);
  const coBrokers = React.useMemo<Agent[]>(
    () => [usePeter ? PETER : null, usePaolo ? PAOLO : null].filter(Boolean) as Agent[],
    [usePeter, usePaolo]
  );

  /* Build HTML */
  const html = React.useMemo(
    () =>
      buildListingHtml({
        subject,
        preheader,
        bannerUrl,
        heroUrl,
        subBanner,
        headline,
        location,
        ctaText,
        ctaHref,
        price,
        intro,
        gallery,
        specs,
        featuresText,
        primary: me,
        coBrokers,
      }),
    [
      subject, preheader, bannerUrl, heroUrl, subBanner, headline, location, ctaText, ctaHref,
      price, intro, galleryText, specs, featuresText, me, coBrokers
    ]
  );

  /* Actions */
  function copyHtml() {
    navigator.clipboard.writeText(html).then(
      () => alert("HTML copied"),
      () => alert("Copy failed (permissions)")
    );
  }
  function downloadHtml() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* UI */
  return (
    <main style={{ minHeight: "100dvh", background: "#f8fafc", padding: 24, display: "grid", gap: 16 }}>
      {/* Config panel */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 12,
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Campaign Builder (Clean)</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Subject" value={subject} onChange={setSubject} />
          <Field label="Preheader" value={preheader} onChange={setPreheader} />
          <Field label="Headline" value={headline} onChange={setHeadline} />
          <Field label="Location" value={location} onChange={setLocation} />
          <Field label="Orange Sub-Banner" value={subBanner} onChange={setSubBanner} />
          <Field label="CTA Text" value={ctaText} onChange={setCtaText} />
          <Field label="CTA Link" value={ctaHref} onChange={setCtaHref} />
          <Field label="Price (optional)" value={price} onChange={setPrice} />
        </div>

        <Field label="Hero URL" value={heroUrl} onChange={setHeroUrl} />
        <TextArea label="Intro paragraph" rows={5} value={intro} onChange={setIntro} />
        <TextArea label="Gallery (up to 2, one per line)" rows={3} value={galleryText} onChange={setGalleryText} />

        <h3 style={h3()}>Specs (2 rows × 3 cols)</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {specs.map((s, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
              <input
                value={s.label}
                onChange={(e) => setSpecs(prev => prev.map((x, k) => k === i ? { ...x, label: e.target.value } : x))}
                placeholder="LABEL (UPPERCASE)"
                style={input()}
              />
              <input
                value={s.value}
                onChange={(e) => setSpecs(prev => prev.map((x, k) => k === i ? { ...x, value: e.target.value } : x))}
                placeholder="Value"
                style={input()}
              />
              <button onClick={() => setSpecs(prev => prev.filter((_, k) => k !== i))} style={btn("outline")}>Del</button>
            </div>
          ))}
          <button onClick={() => setSpecs(prev => [...prev, { label: "", value: "" }])} style={btn("outline")}>Add spec</button>
        </div>

        <TextArea label="Key features (one per line)" rows={6} value={featuresText} onChange={setFeaturesText} />

        <h3 style={h3()}>Agents</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          <Field label="Your Name" value={me.name} onChange={(v) => setMe({ ...me, name: v })} />
          <Field label="Your Title" value={me.title} onChange={(v) => setMe({ ...me, title: v })} />
          <Field label="Your Email" value={me.email} onChange={(v) => setMe({ ...me, email: v })} />
          <Field label="Your Cell" value={me.cell} onChange={(v) => setMe({ ...me, cell: v })} />
          <Field label="Your Office" value={me.office} onChange={(v) => setMe({ ...me, office: v })} />
          <Field label="Your Photo URL" value={me.photo} onChange={(v) => setMe({ ...me, photo: v })} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 14, color: TEXT }}>
            <input type="checkbox" checked={usePeter} onChange={(e) => setUsePeter(e.target.checked)} style={{ marginRight: 8 }} />
            Include: Peter Quintal
          </label>
          <label style={{ fontSize: 14, color: TEXT }}>
            <input type="checkbox" checked={usePaolo} onChange={(e) => setUsePaolo(e.target.checked)} style={{ marginRight: 8 }} />
            Include: Paolo Ameglio
          </label>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyHtml} style={btn("solid")}>Copy HTML</button>
          <button onClick={downloadHtml} style={btn("outline")}>Download HTML</button>
        </div>
      </section>

      {/* Preview */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 12,
          maxWidth: 980,
          margin: "0 auto",
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Preview</h3>
        <iframe
          title="email-preview"
          srcDoc={html}
          style={{ width: "100%", height: "90vh", border: "1px solid #e2e8f0", borderRadius: 8 }}
        />
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Generated {nowStamp()}</div>
      </section>
    </main>
  );
}

/* -------------------- Small UI bits (builder panel) -------------------- */
function input(extra?: Partial<React.CSSProperties>): React.CSSProperties {
  return { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, ...extra };
}
function btn(kind: "solid" | "outline"): React.CSSProperties {
  if (kind === "solid") return { padding: "8px 12px", borderRadius: 8, border: `1px solid ${ORANGE}`, background: ORANGE, color: "#fff", cursor: "pointer", fontSize: 13 };
  return { padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", cursor: "pointer", fontSize: 13 };
}
function h3(): React.CSSProperties { return { margin: "12px 0 8px", fontSize: 14, fontWeight: 700 }; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <label style={{ fontSize: 12, color: "#64748b" }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={input()} />
    </label>
  );
}
function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }): React.ReactElement {
  return (
    <label style={{ fontSize: 12, color: "#64748b" }}>
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} style={{ ...input(), resize: "vertical" as const }} />
    </label>
  );
}

/* -------------------------- EMAIL GENERATOR --------------------------- */
function buildListingHtml(opts: {
  subject: string; preheader: string; bannerUrl: string; heroUrl: string; subBanner: string;
  headline: string; location: string; ctaText: string; ctaHref: string; price?: string;
  intro: string; gallery: string[]; specs: Spec[]; featuresText: string; primary: Agent; coBrokers: Agent[];
}): string {
  const {
    subject, preheader, bannerUrl, heroUrl, subBanner, headline, location,
    ctaText, ctaHref, price, intro, gallery, specs, featuresText, primary, coBrokers
  } = opts;

  const r1 = specs.slice(0, 3);
  const r2 = specs.slice(3, 6);

  const specRow = (row: Spec[]) => `
    <tr>
      ${row
        .map(
          (s) => `
        <td width="33.33%" style="padding:10px 0; text-align:left;">
          <div style="color:${LABEL}; font-size:12px; letter-spacing:0.6px; text-transform:uppercase;">${escapeHtml(s.label)}</div>
          <div style="color:#ffffff; font-size:14px; font-weight:700;">${escapeHtml(s.value)}</div>
        </td>`
        )
        .join("")}
    </tr>`;

  const featuresLis = featuresText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");

  const galleryTwoUp =
    gallery.length > 0
      ? `
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%">
          <tr>
            ${gallery
              .slice(0, 2)
              .map(
                (src) => `
              <td width="50%" style="padding:4px;">
                <img src="${escapeAttr(src)}" width="100%" style="display:block; width:100%; height:auto; border-radius:6px;" />
              </td>`
              )
              .join("")}
          </tr>
        </table>
      </td>
    </tr>`
      : "";

  const coBrokerCards =
    coBrokers.length > 0
      ? coBrokers
          .map((a) => contactCard(a))
          .join(`<tr><td style="height:12px; line-height:12px; font-size:0">&nbsp;</td></tr>`)
      : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(subject)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  img { border:0; line-height:0; outline:none; text-decoration:none; }
  table { border-collapse:collapse; }
  .preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
</style>
</head>
<body style="margin:0; background:${NAVY};">
  <div class="preheader">${escapeHtml(preheader)}</div>

  <!-- Full-width navy background -->
  <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY}; margin:0; padding:0;">
    <tr>
      <td align="center" style="padding:0; margin:0;">
        <!-- Fixed container at 675px -->
        <table role="presentation" width="${CONTAINER}" style="width:${CONTAINER}px; margin:0; padding:0;">
          <!-- HEADER BAR (navy) with orange rule and centered logo -->
          <tr>
            <td align="center" style="background:${NAVY}; border-top:3px solid ${ORANGE}; padding:14px 0;">
              <img src="${escapeAttr(bannerUrl)}"
                   width="260"
                   style="display:block; width:260px; max-width:${CONTAINER}px; height:auto;" />
            </td>
          </tr>

          <!-- HERO IMAGE (stretches to container width) -->
          <tr>
            <td>
              <img src="${escapeAttr(heroUrl)}" width="${CONTAINER}" style="display:block; width:${CONTAINER}px; max-width:100%; height:auto;" />
            </td>
          </tr>

          <!-- ORANGE STRIP -->
          <tr>
            <td align="center" style="background:${ORANGE}; color:#ffffff; font-weight:700; font-size:14px; padding:10px 12px; letter-spacing:0.3px;">
              ${escapeHtml(subBanner)}
            </td>
          </tr>

          <!-- HEADLINE / LOCATION / CTA -->
          <tr>
            <td align="center" style="padding:18px 24px 0;">
              <div style="font-size:24px; color:#002f6c; font-weight:800;">${escapeHtml(headline)}</div>
              <div style="font-size:12px; color:#002f6c; margin-top:6px;">📍 ${escapeHtml(location)}</div>
              <div style="margin-top:12px;">
                <a href="${escapeAttr(ctaHref)}"
                   style="font-size:13px; color:${ORANGE}; border:2px solid ${ORANGE}; padding:10px 16px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:700; letter-spacing:0.5px;">
                  ${escapeHtml(ctaText)}
                </a>
              </div>
            </td>
          </tr>

          <!-- INTRO -->
          <tr>
            <td style="padding:16px 24px 6px;">
              <p style="margin:0; font-size:14px; color:${GRAY}; line-height:1.6;">
                ${escapeHtml(intro)}
              </p>
            </td>
          </tr>

          ${price ? `<tr><td align="center" style="padding:8px 24px 14px; font-size:18px; color:${ORANGE}; font-weight:800;">${escapeHtml(price)}</td></tr>` : ""}

          <!-- GALLERY -->
          ${galleryTwoUp}

          <!-- SPECS -->
          <tr>
            <td>
              <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};">
                <tr><td style="height:12px; line-height:12px; font-size:0">&nbsp;</td></tr>
                <tr>
                  <td style="padding:0 24px;">
                    <div style="color:#ffffff; font-weight:800; letter-spacing:0.3px; font-size:16px; border-bottom:1px solid ${ORANGE}; padding-bottom:8px;">
                      SPECIFICATIONS
                    </div>
                  </td>
                </tr>
                <tr><td style="height:6px; line-height:6px; font-size:0">&nbsp;</td></tr>
                <tr>
                  <td style="padding:0 24px 8px;">
                    <table role="presentation" width="100%">
                      ${specRow(r1)}
                      ${specRow(r2)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FEATURES -->
          <tr>
            <td style="padding:0 24px;">
              <div style="color:${NAVY}; font-weight:800; letter-spacing:0.3px; font-size:16px; border-bottom:1px solid #e2e8f0; padding:10px 0;">
                KEY FEATURES
              </div>
              <ul style="padding-left:18px; margin:10px 0 16px; color:${TEXT}; font-size:14px; line-height:1.6;">
                ${featuresLis}
              </ul>
            </td>
          </tr>

          <!-- CONTACTS -->
          ${contactCard(primary)}
          ${coBrokerCards}

          <tr><td style="height:16px; line-height:16px; font-size:0">&nbsp;</td></tr>
        </table>

        <!-- FOOTER -->
        <div style="font-size:11px; color:#cbd5e1; margin:12px auto; width:${CONTAINER}px; text-align:center;">
          © ${new Date().getFullYear()} Denison Yachting — ${escapeHtml(primary.email)} — Sent via YotCRM
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ------------------- Broker contact (square photo) ------------------- */
function contactCard(a: Agent): string {
  return `
  <tr>
    <td style="padding:0 24px;">
      <table role="presentation" width="100%" style="border-top:1px solid #e2e8f0; padding-top:16px;">
        <tr>
          <td width="110" valign="top" style="padding-right:16px;">
            <div style="width:100px; height:100px; overflow:hidden; background:#e2e8f0;">
              <img src="${escapeAttr(a.photo)}" width="100" height="100" style="display:block; width:100px; height:100px; object-fit:cover;" />
            </div>
          </td>
          <td valign="top" style="font-size:14px; color:${TEXT};">
            <div style="font-weight:800;">${escapeHtml(a.name)}</div>
            <div style="font-size:12px; color:#64748b;">${escapeHtml(a.title)}</div>

            <div style="margin-top:10px; font-size:12px; color:${ORANGE}; font-weight:800;">EMAIL</div>
            <div><a href="mailto:${escapeAttr(a.email)}" style="color:${NAVY}; text-decoration:none;">${escapeHtml(a.email)}</a></div>

            <div style="margin-top:10px; font-size:12px; color:${ORANGE}; font-weight:800;">CELL</div>
            <div>${escapeHtml(a.cell)}</div>

            <div style="margin-top:10px; font-size:12px; color:${ORANGE}; font-weight:800;">OFFICE</div>
            <div>${escapeHtml(a.office)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}