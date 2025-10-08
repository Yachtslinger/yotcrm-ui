// src/app/campaigns/page.tsx
"use client";

import * as React from "react";

/**
 * Denison-styled Campaign Builder
 * - Import from Denison URL (via /api/scrape, mode:"vessel")
 * - Left form / right live preview (email HTML)
 * - Outline CTA, two-up gallery, navy SPECIFICATIONS block (2 rows × 3 cols)
 * - Co-broker toggles: Paolo Ameglio / Peter Quintal
 */

type Spec = { label: string; value: string };
type Agent = { name: string; title: string; email: string; cell: string; office: string; photo: string };

const NAVY = "#0b2a55";
const ORANGE = "#e57b2e";
const TEXT = "#0f172a";
const GRAY = "#4b5563";
const LABEL = "#cbd5e1";

/* --------------------------- Utilities --------------------------- */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
function nowStamp(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* --------------------- Co-brokers (static info) ------------------ */
const PETER: Agent = {
  name: "Peter Quintal",
  title: "Listing Agent, Denison Yachting",
  email: "peter@denisonyachting.com",
  cell: "+1 (954) 817-5662",
  office: "954.763.3971",
  photo:
    "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp".replace(
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
  photo:
    "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp".replace(
      "Will-Noftsinger",
      "Paolo-Ameglio"
    ),
};

/* --------------------------- Component --------------------------- */
export default function CampaignsPage(): React.ReactElement {
  /* Import URL */
  const [importUrl, setImportUrl] = React.useState("");

  /* Brand banner (PNG/JPG). If you have an official hosted image, paste it here. */
  const [bannerUrl, setBannerUrl] = React.useState(
    "https://www.denisonyachtsales.com/wp-content/uploads/2023/08/Rectangle-557.png"
  );

  /* Basics */
  const [subject, setSubject] = React.useState("35m (115') AvA Yachts 2022 — Back in Monaco");
  const [preheader, setPreheader] = React.useState("Full photo set, specs, and private showings.");
  const [headline, setHeadline] = React.useState("35m (115') AvA Yachts 2022");
  const [location, setLocation] = React.useState("MONACO");
  const [subBanner, setSubBanner] = React.useState("Back in Monaco After a Successful Charter Season");
  const [ctaText, setCtaText] = React.useState("HIGHLIGHT VIDEO");
  const [ctaHref, setCtaHref] = React.useState("https://www.denisonyachtsales.com/yachts-for-sale/ducale-120-120-ocean-king-I");
  const [price, setPrice] = React.useState("€10,450,000");

  /* Images */
  const [heroUrl, setHeroUrl] = React.useState(
    "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074103462-1_XLARGE.jpg?w=1200&h=720&format=webp"
  );
  const [galleryText, setGalleryText] = React.useState(
    [
      "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074109803-1_XLARGE.jpg?w=800&h=533&format=webp",
      "https://images.boatsgroup.com/resize/1/54/57/2027-ocean-king-ducale-120-power-9685457-20250217074114935-1_XLARGE.jpg?w=800&h=533&format=webp",
    ].join("\n")
  );

  /* Intro */
  const [intro, setIntro] = React.useState(
    "M/Y INFINITY NINE is the hull #2 of the Kando 110 model, extended to 35m. Delivered in 2022 by AvA Yachts with a steel hull and aluminium superstructure, her incredible range is 6000 miles. Interior features great volumes and 12 guests in 6 luxury cabins."
  );

  /* Specs (render as 2 rows × 3 cols) */
  const [specs, setSpecs] = React.useState<Spec[]>([
    { label: "LENGTH", value: "35m (115')" },
    { label: "BEAM", value: "25' 7''" },
    { label: "DRAFT", value: "7' 10''" },
    { label: "STATEROOMS", value: "6 Staterooms" },
    { label: "ENGINES", value: "Volvo Penta" },
    { label: "POWER", value: "650 hp" },
  ]);

  /* Features (one per line) */
  const [featuresText, setFeaturesText] = React.useState(
    [
      "Amazing explorer with 333 GT and unmatched 6000-mile range",
      "6 guest cabins, including 2 full-beam masters",
      "Bureau Veritas classification “Unrestricted”",
      "Powered by 2x Volvo Penta D16C-DMH 650HP",
      "Loaded with many options and toys",
    ].join("\n")
  );

  /* Primary agent (you) */
  const [me, setMe] = React.useState<Agent>({
    name: "Will Noftsinger",
    title: "Yacht Broker, Denison Yachting",
    email: "WN@DenisonYachting.com",
    cell: "850.461.3342",
    office: "954.763.3971",
    photo: "https://cdn.denisonyachtsales.com/wp-content/uploads/2019/11/Denison-Member-Website-Profile-Headshot-46-Will-Noftsinger.webp",
  });

  /* Co-broker toggles */
  const [showPeter, setShowPeter] = React.useState(false);
  const [showPaolo, setShowPaolo] = React.useState(false);
  const coBrokers = React.useMemo<Agent[]>(() => {
    const arr: Agent[] = [];
    if (showPeter) arr.push(PETER);
    if (showPaolo) arr.push(PAOLO);
    return arr;
  }, [showPeter, showPaolo]);

  /* Gallery list */
  const gallery = React.useMemo(
    () => galleryText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 2),
    [galleryText]
  );

  /* Import from Denison URL */
  async function handleImport() {
    const url = importUrl.trim();
    if (!url) return;
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, mode: "vessel" }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Import failed");

      if (data.name) { setSubject(`${data.name} — Highlights`); setHeadline(data.name); }
      if (data.location) setLocation(String(data.location).toUpperCase());
      if (data.listingUrl) setCtaHref(data.listingUrl);
      if (Array.isArray(data.photos) && data.photos.length) {
        setHeroUrl(data.photos[0]);
        setGalleryText(data.photos.slice(1, 3).join("\n"));
      }
    } catch (e: any) { alert(e?.message || "Import failed."); }
  }

  /* Build HTML */
  const html = React.useMemo(
    () =>
      buildHtml({
        subject, preheader, bannerUrl, heroUrl, subBanner, headline, location, ctaText, ctaHref, price,
        intro, gallery, specs, featuresText, primary: me, coBrokers
      }),
    [
      subject, preheader, bannerUrl, heroUrl, subBanner, headline, location,
      ctaText, ctaHref, price, intro, galleryText, specs, featuresText, me, coBrokers
    ]
  );

  /* Spec handlers */
  function updateSpec(i: number, key: "label" | "value", value: string) {
    setSpecs(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: value } : s));
  }
  function addSpec() { setSpecs(prev => [...prev, { label: "", value: "" }]); }
  function delSpec(i: number) { setSpecs(prev => prev.filter((_, idx) => idx !== i)); }

  /* Copy HTML */
  function copyHtml() {
    navigator.clipboard.writeText(html).then(
      () => alert("HTML copied"),
      () => alert("Copy failed (permissions)")
    );
  }

  return (
    <main style={{ minHeight: "100dvh", background: "#f8fafc", padding: 24 }}>
      {/* Top bar */}
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,borderRadius:12,background:NAVY,color:"#fff",display:"grid",placeItems:"center",fontWeight:700}}>C</div>
          <div>
            <div style={{fontWeight:700}}>Campaign Builder</div>
            <div style={{fontSize:12,color:"#64748b"}}>Denison style email</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={importUrl} onChange={(e)=>setImportUrl(e.target.value)} placeholder="Paste Denison listing URL…" style={input({width:360})}/>
          <button onClick={handleImport} style={btn("outline")}>Import</button>
          <button onClick={copyHtml} style={btn("solid")}>Copy HTML</button>
        </div>
      </header>

      {/* Body */}
      <section style={{display:"grid",gridTemplateColumns:"500px 1fr",gap:16,marginTop:16}}>
        {/* Left form */}
        <div style={panel()}>
          <h3 style={h3()}>Brand</h3>
          <Field label="Banner (logo) URL" value={bannerUrl} onChange={setBannerUrl}/>

          <h3 style={h3()}>Basics</h3>
          <Field label="Subject" value={subject} onChange={setSubject}/>
          <Field label="Preheader" value={preheader} onChange={setPreheader}/>
          <Field label="Headline" value={headline} onChange={setHeadline}/>
          <Field label="Location (UPPERCASE)" value={location} onChange={setLocation}/>
          <Field label="Orange Sub-Banner" value={subBanner} onChange={setSubBanner}/>
          <Field label="CTA Text" value={ctaText} onChange={setCtaText}/>
          <Field label="CTA Link" value={ctaHref} onChange={setCtaHref}/>
          <Field label="Price (optional)" value={price} onChange={setPrice}/>

          <h3 style={h3()}>Images</h3>
          <Field label="Hero URL" value={heroUrl} onChange={setHeroUrl}/>
          <TextArea label="Gallery (one per line, 2 shown)" rows={3} value={galleryText} onChange={setGalleryText}/>

          <h3 style={h3()}>Intro</h3>
          <TextArea label="Intro paragraph" rows={6} value={intro} onChange={setIntro}/>

          <h3 style={h3()}>Specs (2 rows × 3 cols)</h3>
          {specs.map((s,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,marginBottom:8}}>
              <input value={s.label} onChange={e=>updateSpec(i,"label",e.target.value)} placeholder="LABEL (UPPERCASE)" style={input()}/>
              <input value={s.value} onChange={e=>updateSpec(i,"value",e.target.value)} placeholder="Value" style={input()}/>
              <button onClick={()=>delSpec(i)} style={btn("ghost")}>Del</button>
            </div>
          ))}
          <button onClick={addSpec} style={btn("outline")}>Add spec</button>

          <h3 style={h3()}>Key Features</h3>
          <TextArea label="One per line" rows={6} value={featuresText} onChange={setFeaturesText}/>

          <h3 style={h3()}>Primary Agent</h3>
          <Field label="Name" value={me.name} onChange={v=>setMe({...me,name:v})}/>
          <Field label="Title" value={me.title} onChange={v=>setMe({...me,title:v})}/>
          <Field label="Email" value={me.email} onChange={v=>setMe({...me,email:v})}/>
          <Field label="Cell" value={me.cell} onChange={v=>setMe({...me,cell:v})}/>
          <Field label="Office" value={me.office} onChange={v=>setMe({...me,office:v})}/>
          <Field label="Photo URL" value={me.photo} onChange={v=>setMe({...me,photo:v})}/>

          <h3 style={h3()}>Add Co-Brokers</h3>
          <label style={checkLabel()}><input type="checkbox" checked={showPeter} onChange={e=>setShowPeter(e.target.checked)} style={{marginRight:6}}/> Peter Quintal</label>
          <label style={checkLabel()}><input type="checkbox" checked={showPaolo} onChange={e=>setShowPaolo(e.target.checked)} style={{marginRight:6}}/> Paolo Ameglio</label>
        </div>

        {/* Right preview */}
        <div style={panel()}>
          <h3 style={h3()}>Preview</h3>
          <iframe title="email-preview" srcDoc={html} style={{width:"100%",height:"78vh",border:"1px solid #e2e8f0",borderRadius:8,background:"#fff"}}/>
          <div style={{fontSize:12,color:"#64748b",marginTop:8}}>Generated {nowStamp()}</div>
        </div>
      </section>
    </main>
  );
}

/* ----------------------- small UI helpers ------------------------ */
function btn(kind:"solid"|"outline"|"ghost"): React.CSSProperties {
  if(kind==="solid") return {padding:"8px 12px",borderRadius:8,border:`1px solid ${ORANGE}`,background:ORANGE,color:"#fff",cursor:"pointer",fontSize:13};
  if(kind==="outline") return {padding:"8px 12px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",color:"#0f172a",cursor:"pointer",fontSize:13};
  return {padding:"8px 10px",borderRadius:8,border:"1px solid #f1f5f9",background:"#fff",color:"#0f172a",cursor:"pointer",fontSize:12};
}
function panel(): React.CSSProperties { return {background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:12}; }
function h3(): React.CSSProperties { return {margin:"12px 0 8px",fontSize:14,fontWeight:700}; }
function input(extra?: Partial<React.CSSProperties>): React.CSSProperties {
  return {width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:14,...extra};
}
function checkLabel(): React.CSSProperties { return {fontSize:14,color:TEXT,display:"block",marginBottom:6}; }
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}):React.ReactElement{
  return <div style={{marginBottom:8}}>
    <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{label}</div>
    <input value={value} onChange={(e)=>onChange(e.target.value)} style={input()}/>
  </div>;
}
function TextArea({label,value,onChange,rows=4}:{label:string;value:string;onChange:(v:string)=>void;rows?:number}):React.ReactElement{
  return <div style={{marginBottom:8}}>
    <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{label}</div>
    <textarea value={value} onChange={(e)=>onChange(e.target.value)} rows={rows} style={{...input(),resize:"vertical" as const}}/>
  </div>;
}

/* ----------------------- HTML generator ------------------------- */
function buildHtml(opts:{
  subject:string; preheader:string; bannerUrl:string; heroUrl:string; subBanner:string;
  headline:string; location:string; ctaText:string; ctaHref:string; price?:string;
  intro:string; gallery:string[]; specs:Spec[]; featuresText:string; primary:Agent; coBrokers:Agent[];
}):string{
  const { subject, preheader, bannerUrl, heroUrl, subBanner, headline, location, ctaText, ctaHref, price,
          intro, gallery, specs, featuresText, primary, coBrokers } = opts;

  // Two spec rows of three columns
  const r1 = specs.slice(0,3);
  const r2 = specs.slice(3,6);

  const specRow = (row: Spec[]) => `
    <tr>
      ${row.map(s => `
        <td width="33.33%" style="padding:10px 0; text-align:left;">
          <div style="color:${LABEL}; font-size:12px; letter-spacing:0.6px; text-transform:uppercase;">${escapeHtml(s.label)}</div>
          <div style="color:#ffffff; font-size:14px; font-weight:700;">${escapeHtml(s.value)}</div>
        </td>
      `).join("")}
    </tr>`;

  const featuresLis = featuresText
    .split("\n").map(t=>t.trim()).filter(Boolean)
    .map(t=>`<li>${escapeHtml(t)}</li>`).join("");

  const galleryTwoUp = gallery.length ? `
    <tr>
      <td style="padding:0 24px 20px;">
        <table role="presentation" width="100%">
          <tr>
            ${gallery.slice(0,2).map(src=>`
              <td width="50%" style="padding:4px;">
                <img src="${escapeAttr(src)}" width="100%" style="display:block; width:100%; height:auto; border-radius:6px;" />
              </td>
            `).join("")}
          </tr>
        </table>
      </td>
    </tr>` : "";

  const coBrokerCards = coBrokers.map(a=>contactCard(a)).join(
    `<tr><td style="height:12px; line-height:12px; font-size:0">&nbsp;</td></tr>`
  );

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
  @media (max-width:620px){ .container{ width:100% !important; } .pad{ padding-left:16px !important; padding-right:16px !important; } }
</style>
</head>
<body style="margin:0; background:${NAVY};">
  <div class="preheader">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};">
    <tr>
      <td align="center" class="pad" style="padding:0;">
        <!-- Navy banner with centered Denison logo -->
        <table role="presentation" width="100%" style="background:${NAVY};">
          <tr><td align="center" style="padding:12px 0;">
            <img src="${escapeAttr(bannerUrl)}" width="240" style="display:block; width:240px; height:auto;" />
          </td></tr>
        </table>

        <!-- Container -->
        <table role="presentation" width="600" class="container" style="width:600px; background:#ffffff;">
          <!-- Hero -->
          <tr><td><img src="${escapeAttr(heroUrl)}" width="600" style="display:block; width:100%; height:auto;" /></td></tr>

          <!-- Orange strip -->
          <tr>
            <td align="center" style="background:${ORANGE}; color:#ffffff; font-weight:700; font-size:14px; padding:10px 12px; letter-spacing:0.3px;">
              ${escapeHtml(subBanner)}
            </td>
          </tr>

          <!-- Headline + Location + Outline CTA -->
          <tr>
            <td align="center" style="padding:18px 24px 0;">
              <div style="font-size:24px; color:#002f6c; font-weight:800;">${escapeHtml(headline)}</div>
              <div style="font-size:12px; color:#002f6c; margin-top:6px;">📍 ${escapeHtml(location)}</div>
              <div style="margin-top:12px;">
                <a href="${escapeAttr(ctaHref)}"
                   style="font-size:13px; color:${ORANGE}; border:2px solid ${ORANGE}; padding:10px 16px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:700; letter-spacing:0.5px; text-transform:uppercase;">
                  ${escapeHtml(ctaText)}
                </a>
              </div>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:16px 24px 6px;">
              <p style="margin:0; font-size:14px; color:${GRAY}; line-height:1.6;">${escapeHtml(intro)}</p>
            </td>
          </tr>

          ${price ? `<tr><td align="center" style="padding:8px 24px 14px; font-size:18px; color:${ORANGE}; font-weight:800;">${escapeHtml(price)}</td></tr>` : ""}

          <!-- Two-up gallery -->
          ${galleryTwoUp}

          <!-- Navy SPECIFICATIONS block -->
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
                <tr><td style="padding:0 24px 8px;">
                  <table role="presentation" width="100%">
                    ${specRow(r1)}
                    ${specRow(r2)}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- Key features -->
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

          <!-- Contacts -->
          ${contactCard(primary)}
          ${coBrokerCards}

          <tr><td style="height:16px; line-height:16px; font-size:0">&nbsp;</td></tr>
        </table>

        <!-- Footer -->
        <div style="font-size:11px; color:#cbd5e1; margin-top:12px; text-align:center;">
          © ${new Date().getFullYear()} Denison Yachting — ${escapeHtml(primary.email)} — Sent via YotCRM
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* single contact card */
function contactCard(a: Agent): string {
  return `
  <tr>
    <td style="padding:0 24px;">
      <table role="presentation" width="100%" style="border-top:1px solid #e2e8f0; padding-top:16px;">
        <tr>
          <td width="110" valign="top" style="padding-right:16px;">
            <div style="width:100px; height:100px; border-radius:50%; overflow:hidden; background:#e2e8f0;">
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