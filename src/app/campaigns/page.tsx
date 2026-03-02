// src/app/campaigns/page.tsx
"use client";

import * as React from "react";
import { useToast } from "../components/ToastProvider";
import PageShell from "../components/PageShell";

/**
 * Denison-styled Campaign Builder v2
 * - Single Listing mode (Lady Lorraine / Benetti style)
 * - Multi-Boat Showcase mode (Ocean King style)
 * - Toggleable broker cards: Will, Paolo, Peter
 * - Pixel-matched to Denison Vertical Response templates
 * - Copy HTML for paste into VR
 */

type Spec = { label: string; value: string };
type Agent = {
  name: string; title: string; email: string; cell: string; office: string;
  photo: string; enabled: boolean;
};
type BoatCard = {
  id: string; name: string; description: string; price: string;
  imageUrl: string; ctaUrl: string; buildTime?: string;
};
type Mode = "Single Listing" | "Multi-Boat Showcase";

const NAVY = "#1a2b4a";
const ORANGE = "#e57b2e";
const DARK_BLUE = "#002f6c";
const TEXT = "#0f172a";
const GRAY = "#4b5563";
const LABEL = "#cbd5e1";

/* ---------- Utilities ---------- */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escA(s: string): string { return s.replace(/"/g, "&quot;"); }
function ts(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- Default Agents ---------- */
function defaultAgents(): Agent[] {
  return [
    {
      name: "Will Noftsinger", title: "Yacht Broker, Denison Yachting",
      email: "WN@DenisonYachting.com", cell: "850.461.3342", office: "786.482.5000",
      photo: "/email/will-noftsinger.jpg", enabled: true,
    },
    {
      name: "Paolo Ameglio", title: "Yacht Broker, Denison Yachting",
      email: "PGA@DenisonYachting.com", cell: "786.251.2588", office: "954.763.3971",
      photo: "/email/paolo-ameglio.png", enabled: false,
    },
    {
      name: "Peter Quintal", title: "Yacht Broker, Denison Yachting",
      email: "Peter@DenisonYachting.com", cell: "(954) 817-5662", office: "954.763.3971",
      photo: "/email/peter-quintal.jpg", enabled: false,
    },
  ];
}

function defaultBoat(): BoatCard {
  return {
    id: crypto.randomUUID(), name: "DOGE 500", price: "€36,800,000",
    description: "This 50M is the new flagship of the Doge series.",
    imageUrl: "", ctaUrl: "", buildTime: "36 Months",
  };
}

/* ============================== COMPONENT ============================== */
export default function CampaignsPage(): React.ReactElement {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<Mode>("Single Listing");

  /* Import */
  const [importUrl, setImportUrl] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  /* Banner */
  const [bannerTag, setBannerTag] = React.useState("Price Reduced");

  /* Basics */
  const [subject, setSubject] = React.useState("52' Astondoa 2021 [Reduced]");
  const [headline, setHeadline] = React.useState("52' Astondoa 2021");
  const [location, setLocation] = React.useState("AVENTURA, FL");
  const [ctaText, setCtaText] = React.useState("VIEW ONLINE");
  const [ctaHref, setCtaHref] = React.useState("https://www.denisonyachtsales.com/");

  /* Listing-specific */
  const [price, setPrice] = React.useState("$875,000");
  const [heroUrl, setHeroUrl] = React.useState("");
  const [galleryText, setGalleryText] = React.useState("");
  const gallery = React.useMemo(
    () => galleryText.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 2), [galleryText]
  );
  const [intro, setIntro] = React.useState(
    "Astondoa is a Spanish ship building company which is proud to be operated by the same family for four generations and over 100 years boat building experience."
  );
  const [specs, setSpecs] = React.useState<Spec[]>([
    { label: "LENGTH", value: "52'" },
    { label: "BEAM", value: "15' 3''" },
    { label: "DRAFT", value: "4' 6''" },
    { label: "STATEROOMS", value: "3 Staterooms" },
    { label: "ENGINES", value: "Volvo Penta" },
    { label: "POWER", value: "725 hp" },
  ]);
  const [featuresText, setFeaturesText] = React.useState(
    "SeaKeeper 6\nCustom Access Ramp\nStarlink\n11' Zar Tender\nCurrent services"
  );

  /* Multi-Boat specific */
  const [showcaseTitle, setShowcaseTitle] = React.useState("OCEAN KING");
  const [showcaseSubtitle, setShowcaseSubtitle] = React.useState("EXPLORER YACHTS");
  const [showcaseIntro, setShowcaseIntro] = React.useState(
    "Ocean King is an Italian shipyard known for luxury explorer yachts built with craftsmanship and durability rivaling Northern Europe's best builders."
  );
  const [showcaseHeroUrl, setShowcaseHeroUrl] = React.useState("");
  const [boats, setBoats] = React.useState<BoatCard[]>([defaultBoat()]);

  /* Agents */
  const [agents, setAgents] = React.useState<Agent[]>(defaultAgents);

  const enabledAgents = React.useMemo(() => agents.filter(a => a.enabled), [agents]);

  function toggleAgent(idx: number) {
    setAgents(prev => prev.map((a, i) => i === idx ? { ...a, enabled: !a.enabled } : a));
  }

  /* Import handler */
  async function handleImport() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await res.json();
      if (!payload.ok || !payload.data) throw new Error(payload.error || "Import failed");
      const d = payload.data;
      if (d.headline || d.subject) {
        let h = d.headline || d.subject;
        // Strip site name suffixes
        h = h.replace(/\s*[-–—|]\s*(Denison\s*(Yacht(ing|s?\s*Sales?)?)?|YachtWorld|BoatTrader|boats\.com).*$/i, "").trim();
        setSubject(h);
        setHeadline(h);
      }
      if (d.location) setLocation(String(d.location).toUpperCase());
      if (d.listingUrl) setCtaHref(d.listingUrl);
      if (d.price) setPrice(d.price);
      if (d.heroUrl) setHeroUrl(d.heroUrl);
      if (d.gallery?.length) setGalleryText(d.gallery.slice(0, 3).join("\n"));
      if (d.description) setIntro(d.description);
      if (d.features?.length) setFeaturesText(d.features.join("\n"));
      if (d.specs) {
        const map: [string, string][] = [
          ["loa","LENGTH"],["beam","BEAM"],["draft","DRAFT"],
          ["staterooms","STATEROOMS"],["engines","ENGINES"],["power","POWER"],
        ];
        const next = map
          .map(([k, l]) => d.specs[k] ? { label: l, value: String(d.specs[k]) } : null)
          .filter((x): x is Spec => !!x);
        if (next.length) setSpecs(next);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  /* Spec helpers */
  function updateSpec(i: number, key: "label" | "value", v: string) {
    setSpecs(p => p.map((s, idx) => idx === i ? { ...s, [key]: v } : s));
  }
  function addSpec() { setSpecs(p => [...p, { label: "", value: "" }]); }
  function delSpec(i: number) { setSpecs(p => p.filter((_, idx) => idx !== i)); }

  /* Boat helpers */
  function addBoat() { setBoats(p => [...p, defaultBoat()]); }
  function delBoat(id: string) { setBoats(p => p.filter(b => b.id !== id)); }
  function updateBoat(id: string, key: keyof BoatCard, v: string) {
    setBoats(p => p.map(b => b.id === id ? { ...b, [key]: v } : b));
  }

  /* Build HTML */
  const html = React.useMemo(() => {
    if (mode === "Single Listing") {
      return buildSingleListingHtml({
        subject, bannerTag, headline, location,
        ctaText, ctaHref, price, heroUrl, intro,
        gallery, specs, featuresText, agents: enabledAgents,
      });
    } else {
      return buildMultiBoatHtml({
        subject, showcaseTitle, showcaseSubtitle,
        showcaseIntro, showcaseHeroUrl, boats, agents: enabledAgents,
      });
    }
  }, [mode, subject, bannerTag, headline, location, ctaText, ctaHref, price,
      heroUrl, intro, gallery, specs, featuresText, enabledAgents,
      showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats]);

  const [copied, setCopied] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  function copyHtml() {
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("HTML copied to clipboard");
    }, () => toast("Copy failed", "error"));
  }

  /* ============ UI ============ */
  return (
    <PageShell
      title="Campaign Builder"
      subtitle="Denison branded emails"
      maxWidth="full"
      flush
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewOpen(true)}
            className="btn-primary !bg-[var(--navy-700)] hover:!bg-[var(--navy-600)] flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview
          </button>
          <button onClick={copyHtml}
            className={`btn-primary ${copied ? "!bg-[var(--sea-500)]" : "!bg-[#e57b2e] hover:!bg-[#d06a20]"}`}>
            {copied ? "✓ Copied!" : "Copy HTML"}
          </button>
        </div>
      }
    >

      <section className="max-w-xl mx-auto">
        {/* Form — full width */}
        <div className="flex flex-col gap-4 pb-24">

          {/* Mode + Import */}
          <Card title="Campaign Type">
            <div className="flex gap-2 mb-3">
              {(["Single Listing", "Multi-Boat Showcase"] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    mode === m ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {m}
                </button>
              ))}
            </div>
            {mode === "Single Listing" && (
              <div className="flex gap-2">
                <input value={importUrl} onChange={e => setImportUrl(e.target.value)}
                  placeholder="Paste Denison listing URL…"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <button onClick={handleImport} disabled={importing}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                  {importing ? "…" : "Import"}
                </button>
              </div>
            )}
          </Card>

          {mode === "Single Listing" ? (
            <>
              <Card title="Basics">
                <Field label="Email Subject" value={subject} set={setSubject} />
                <Field label="Headline (e.g. 52' Astondoa 2021)" value={headline} set={setHeadline} />
                <Field label="Location" value={location} set={setLocation} />
                <Field label="Orange Banner Tag" value={bannerTag} set={setBannerTag} />
                <Field label="CTA Button Text" value={ctaText} set={setCtaText} />
                <Field label="CTA Link" value={ctaHref} set={setCtaHref} />
              </Card>

              <Card title="Media & Copy">
                <Field label="Price" value={price} set={setPrice} />
                <Field label="Hero Image URL" value={heroUrl} set={setHeroUrl} />
                {/* Clickable gallery thumbnails — click to set as hero */}
                {(heroUrl || gallery.length > 0) && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-400 mb-1">Click an image to set as hero</div>
                    <div className="flex gap-2 flex-wrap">
                      {[heroUrl, ...gallery].filter(Boolean).map((src, i) => (
                        <button key={`${src}-${i}`} onClick={() => {
                          if (src && src !== heroUrl) {
                            // Swap: move current hero into gallery, set clicked as hero
                            const allUrls = [heroUrl, ...gallery].filter(Boolean);
                            const newHero = src;
                            const newGallery = allUrls.filter(u => u !== src).slice(0, 2);
                            setHeroUrl(newHero);
                            setGalleryText(newGallery.join("\n"));
                          }
                        }}
                          className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                            src === heroUrl ? "border-orange-500 ring-2 ring-orange-300" : "border-gray-200 hover:border-gray-400"
                          }`}>
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          {src === heroUrl && (
                            <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-white bg-orange-500 px-1 rounded">HERO</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <TArea label="Gallery URLs (one per line, max 2)" rows={3} value={galleryText} set={setGalleryText} />
                <TArea label="Description" rows={5} value={intro} set={setIntro} />
              </Card>

              <Card title="Specifications">
                {specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <input value={s.label} onChange={e => updateSpec(i, "label", e.target.value)}
                      placeholder="LABEL" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <input value={s.value} onChange={e => updateSpec(i, "value", e.target.value)}
                      placeholder="Value" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <button onClick={() => delSpec(i)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">✕</button>
                  </div>
                ))}
                <button onClick={addSpec} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">+ Add spec</button>
              </Card>

              <Card title="Key Features">
                <TArea label="One per line" rows={5} value={featuresText} set={setFeaturesText} />
              </Card>
            </>
          ) : (
            <>
              <Card title="Showcase Header">
                <Field label="Email Subject" value={subject} set={setSubject} />
                <Field label="Brand Title (large)" value={showcaseTitle} set={setShowcaseTitle} />
                <Field label="Subtitle" value={showcaseSubtitle} set={setShowcaseSubtitle} />
                <Field label="Hero Image URL" value={showcaseHeroUrl} set={setShowcaseHeroUrl} />
                <TArea label="Intro paragraph" rows={4} value={showcaseIntro} set={setShowcaseIntro} />
              </Card>

              {boats.map((boat, i) => (
                <Card key={boat.id} title={`Boat ${i + 1}: ${boat.name || "Untitled"}`}>
                  <Field label="Name" value={boat.name} set={v => updateBoat(boat.id, "name", v)} />
                  <TArea label="Description" rows={3} value={boat.description} set={v => updateBoat(boat.id, "description", v)} />
                  <Field label="Price" value={boat.price} set={v => updateBoat(boat.id, "price", v)} />
                  <Field label="Build Time" value={boat.buildTime || ""} set={v => updateBoat(boat.id, "buildTime", v)} />
                  <Field label="Image URL" value={boat.imageUrl} set={v => updateBoat(boat.id, "imageUrl", v)} />
                  <Field label="Details Link" value={boat.ctaUrl} set={v => updateBoat(boat.id, "ctaUrl", v)} />
                  <button onClick={() => delBoat(boat.id)}
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded mt-1">Remove boat</button>
                </Card>
              ))}
              <button onClick={addBoat}
                className="text-sm px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 w-full">
                + Add Boat
              </button>
            </>
          )}

          {/* Broker Toggles */}
          <Card title="Broker Signatures">
            <p className="text-xs text-gray-400 mb-3">Toggle which brokers appear in the email.</p>
            {agents.map((a, i) => (
              <label key={a.name} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={a.enabled} onChange={() => toggleAgent(i)}
                  className="w-4 h-4 rounded" />
                <img src={a.photo} alt={a.name}
                  className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" />
                <div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-gray-400">{a.cell}</div>
                </div>
              </label>
            ))}
          </Card>
        </div>

        {/* ── Slide-Over Preview Panel ── */}
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300 ${
            previewOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setPreviewOpen(false)}
        />

        {/* Panel */}
        <div
          className={`fixed top-0 right-0 h-full z-[70] flex flex-col transition-transform duration-300 ease-out ${
            previewOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: "min(680px, 92vw)" }}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--navy-950)] text-white shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold tracking-wide">Email Preview</h3>
              <span className="text-[10px] text-[var(--navy-400)] font-mono">{ts()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyHtml}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  copied ? "bg-[var(--sea-500)] text-white" : "bg-[#e57b2e] hover:bg-[#d06a20] text-white"
                }`}>
                {copied ? "✓ Copied" : "Copy HTML"}
              </button>
              <button onClick={() => setPreviewOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                aria-label="Close preview">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 overflow-auto bg-[#1a2b4a]">
            <div className="mx-auto" style={{ maxWidth: 620, padding: "16px 10px" }}>
              <iframe
                title="email-preview"
                srcDoc={html}
                className="w-full bg-white rounded-lg shadow-2xl"
                style={{ height: "calc(100vh - 72px)", border: "none" }}
              />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/* ======================= UI Helpers ======================= */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="text-sm font-bold text-gray-900 mb-3">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  return (
    <div className="mb-2">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <input value={value} onChange={e => set(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
    </div>
  );
}
function TArea({ label, value, set, rows = 4 }: { label: string; value: string; set: (v: string) => void; rows?: number }) {
  return (
    <div className="mb-2">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <textarea value={value} onChange={e => set(e.target.value)} rows={rows}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-y" />
    </div>
  );
}

/* ===================== Shared HTML Blocks ===================== */
const DENISON_HEADER_IMG = "/email/denison-header.png";
const OFFICES = "ANNAPOLIS • BRADENTON • CHARLESTON • DANIA BEACH • DAYTONA BEACH • DESTIN • FORT LAUDERDALE • LONG BEACH • LOS ANGELES • MIAMI • MONACO • NAPLES • NEW JERSEY • NEWPORT • NEWPORT BEACH • PALM BEACH • SAN DIEGO • SAN FRANCISCO • SEATTLE • STUART";

function agentCardHtml(a: Agent, baseUrl: string): string {
  const photo = a.photo.startsWith("/") ? `${baseUrl}${a.photo}` : a.photo;
  return `
  <tr>
    <td style="padding:20px 24px 10px;">
      <table role="presentation" width="100%" style="border-top:1px solid #e2e8f0; padding-top:20px;">
        <tr>
          <td width="100" valign="top" style="padding-right:16px;">
            <img src="${escA(photo)}" width="100" height="100"
              style="display:block; width:100px; height:100px; border-radius:50%; object-fit:cover;" />
          </td>
          <td valign="top" style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${TEXT};">
            <div style="font-size:18px; font-weight:800; color:${DARK_BLUE};">${esc(a.name)}</div>
            <table role="presentation" style="margin-top:8px;">
              <tr>
                <td style="font-size:11px; color:${ORANGE}; font-weight:800; padding-right:8px; padding-bottom:4px;">EMAIL</td>
                <td style="font-size:13px; padding-bottom:4px;"><a href="mailto:${escA(a.email)}" style="color:${DARK_BLUE}; text-decoration:none;">${esc(a.email)}</a></td>
              </tr>
              <tr>
                <td style="font-size:11px; color:${ORANGE}; font-weight:800; padding-right:8px; padding-bottom:4px;">CELL</td>
                <td style="font-size:13px; padding-bottom:4px;">${esc(a.cell)}</td>
              </tr>
              <tr>
                <td style="font-size:11px; color:${ORANGE}; font-weight:800; padding-right:8px;">OFFICE</td>
                <td style="font-size:13px;">${esc(a.office)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function denisonFooterHtml(baseUrl: string): string {
  const logo = `${baseUrl}${DENISON_HEADER_IMG}`;
  return `
  <tr><td style="height:8px; line-height:8px; font-size:0;">&nbsp;</td></tr>
  <tr>
    <td style="background:${NAVY}; padding:24px; text-align:center; font-family:Arial,Helvetica,sans-serif;">
      <img src="${escA(logo)}" width="200" style="display:inline-block; width:200px; height:auto; margin-bottom:16px;" />
      <div style="font-size:9px; color:#94a3b8; line-height:1.8; letter-spacing:0.5px; max-width:480px; margin:0 auto 16px;">
        ${esc(OFFICES)}
      </div>
      <div style="margin-bottom:12px;">
        <a href="mailto:sales@denisonyachting.com" style="color:#ffffff; text-decoration:none; font-size:12px;">sales@denisonyachting.com</a>
        <span style="color:#64748b; font-size:12px;"> | +1 954.763.3971</span>
      </div>
      <div style="font-size:10px; color:#64748b; line-height:1.6;">
        Proud member of: IYBA, MYBA, CYBA, YBAA, MIASF, NWYBA, NMMA<br/>
        Denison Yachting &nbsp; 1550 SE 17th Street &nbsp; Fort Lauderdale FL &nbsp; 33316<br/><br/>
        You received this email because you are subscribed to Market Updates from Denison Yachting.<br/>
        <a href="#" style="color:#94a3b8; text-decoration:underline;">Unsubscribe</a> /
        <a href="#" style="color:#94a3b8; text-decoration:underline;">Update your email preferences</a>
      </div>
    </td>
  </tr>`;
}

/* ==================== Single Listing Builder ==================== */
function buildSingleListingHtml(opts: {
  subject: string; bannerTag: string; headline: string; location: string;
  ctaText: string; ctaHref: string; price: string; heroUrl: string; intro: string;
  gallery: string[]; specs: Spec[]; featuresText: string; agents: Agent[];
}): string {
  const { subject, bannerTag, headline, location, ctaText, ctaHref,
          price, heroUrl, intro, gallery, specs, featuresText, agents } = opts;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const headerImg = `${baseUrl}${DENISON_HEADER_IMG}`;

  const r1 = specs.slice(0, 3);
  const r2 = specs.slice(3, 6);
  const specRow = (row: Spec[]) => row.length ? `
    <tr>${row.map(s => `
      <td width="33%" style="padding:8px 0; text-align:left;">
        <div style="color:${LABEL}; font-size:11px; letter-spacing:0.5px; font-weight:700;">${esc(s.label)}</div>
        <div style="color:#fff; font-size:14px; font-weight:700; margin-top:2px;">${esc(s.value)}</div>
      </td>`).join("")}
    </tr>` : "";

  const features = featuresText.split("\n").map(t => t.trim()).filter(Boolean);
  const featHtml = features.map(f =>
    `<li style="margin-bottom:6px; font-size:14px; color:${TEXT}; line-height:1.5;">
      ${esc(f)}
    </li>`
  ).join("");

  const galleryHtml = gallery.length ? `
    <tr><td style="padding:4px 24px 16px;">
      <table role="presentation" width="100%"><tr>
        ${gallery.slice(0,2).map(src => `
          <td width="50%" style="padding:3px;">
            <img src="${escA(src)}" width="100%" style="display:block; width:100%; height:auto; border-radius:4px;" />
          </td>`).join("")}
      </tr></table>
    </td></tr>` : "";

  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title>
<style>
  body,table,td{font-family:Arial,Helvetica,sans-serif;}
  img{border:0;line-height:0;outline:none;text-decoration:none;}
  table{border-collapse:collapse;}
  @media(max-width:620px){.c{width:100%!important;}.p{padding-left:12px!important;padding-right:12px!important;}}
</style>
</head><body style="margin:0;padding:0;background:${NAVY};">
<table role="presentation" width="100%" bgcolor="${NAVY}"><tr><td align="center" class="p">

  <!-- Header -->
  <table role="presentation" width="600" class="c" style="width:600px;">
    <tr><td align="center" style="padding:16px 0;">
      <img src="${escA(headerImg)}" width="600" style="display:block;width:600px;max-width:100%;height:auto;" />
    </td></tr>
  </table>

  <!-- Body -->
  <table role="presentation" width="600" class="c" style="width:600px;background:#ffffff;">
    ${heroUrl ? `<tr><td><img src="${escA(heroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>` : ""}

    <!-- Orange Banner -->
    <tr><td align="center" style="background:${ORANGE};color:#fff;font-weight:700;font-size:14px;padding:10px 16px;letter-spacing:0.3px;">
      ${esc(bannerTag)}
    </td></tr>

    <!-- Headline + Location -->
    <tr><td align="center" style="padding:20px 24px 0;">
      <div style="font-size:22px;color:${DARK_BLUE};font-weight:800;">${esc(headline)}</div>
      <div style="font-size:12px;color:${DARK_BLUE};margin-top:6px;">📍 ${esc(location)}</div>
    </td></tr>

    <!-- CTA Button -->
    <tr><td align="center" style="padding:14px 24px;">
      <a href="${escA(ctaHref)}" style="display:inline-block;font-size:12px;color:${ORANGE};border:2px solid ${ORANGE};padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
        ${esc(ctaText)}
      </a>
    </td></tr>

    <!-- Description -->
    ${intro ? `<tr><td style="padding:4px 24px 12px;">
      <p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(intro)}</p>
    </td></tr>` : ""}

    <!-- Price -->
    ${price ? `<tr><td align="center" style="padding:8px 24px 16px;font-size:20px;color:${ORANGE};font-weight:800;">${esc(price)}</td></tr>` : ""}

    <!-- Gallery -->
    ${galleryHtml}

    <!-- Specs -->
    <tr><td style="padding:0 24px;">
      <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};border-radius:0;margin:8px 0;">
        <tr><td style="padding:14px 20px 4px;">
          <div style="color:#fff;font-weight:800;font-size:14px;letter-spacing:0.5px;border-bottom:1px solid ${ORANGE};padding-bottom:8px;">SPECIFICATIONS</div>
        </td></tr>
        <tr><td style="padding:4px 20px 14px;">
          <table role="presentation" width="100%">
            ${specRow(r1)}${specRow(r2)}
          </table>
        </td></tr>
      </table>
    </td></tr>

    <!-- Key Features -->
    ${featHtml ? `<tr><td style="padding:12px 24px 8px;">
      <div style="color:${DARK_BLUE};font-weight:800;font-size:14px;letter-spacing:0.3px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">KEY FEATURES</div>
      <ul style="padding-left:20px;margin:10px 0 0;color:${TEXT};">${featHtml}</ul>
    </td></tr>` : ""}

    <!-- Agent Cards -->
    ${agents.map(a => agentCardHtml(a, baseUrl)).join("")}

    <tr><td style="height:12px;">&nbsp;</td></tr>

    <!-- Footer -->
    ${denisonFooterHtml(baseUrl)}
  </table>

</td></tr></table>
</body></html>`;
}

/* ==================== Multi-Boat Showcase Builder ==================== */
function buildMultiBoatHtml(opts: {
  subject: string; showcaseTitle: string; showcaseSubtitle: string;
  showcaseIntro: string; showcaseHeroUrl: string; boats: BoatCard[];
  agents: Agent[];
}): string {
  const { subject, showcaseTitle, showcaseSubtitle, showcaseIntro,
          showcaseHeroUrl, boats, agents } = opts;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const headerImg = `${baseUrl}${DENISON_HEADER_IMG}`;

  const boatRows = boats.map(b => `
    <!-- Boat: ${esc(b.name)} -->
    <tr><td style="padding:8px 24px 0;">
      <div style="text-align:center;font-size:20px;font-weight:800;color:${DARK_BLUE};padding:16px 0 8px;border-top:2px solid ${ORANGE};">
        ${esc(b.name)}
      </div>
    </td></tr>
    ${b.imageUrl ? `<tr><td style="padding:0 24px;">
      <table role="presentation" width="100%"><tr>
        <td width="50%" valign="top" style="padding-right:8px;">
          <img src="${escA(b.imageUrl)}" width="100%" style="display:block;width:100%;height:auto;border-radius:4px;" />
        </td>
        <td width="50%" valign="top" style="padding-left:8px;font-size:13px;color:${GRAY};line-height:1.55;">
          ${esc(b.description)}
          ${b.buildTime ? `<div style="margin-top:10px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>` : ""}
          <div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div>
        </td>
      </tr></table>
    </td></tr>` : `<tr><td style="padding:4px 24px;font-size:13px;color:${GRAY};line-height:1.55;">
      ${esc(b.description)}
      ${b.buildTime ? `<div style="margin-top:6px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>` : ""}
      <div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div>
    </td></tr>`}
    ${b.ctaUrl ? `<tr><td align="center" style="padding:12px 24px 16px;">
      <a href="${escA(b.ctaUrl)}" style="display:inline-block;font-size:11px;color:#fff;background:${ORANGE};padding:8px 18px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:0.5px;">SEE FULL DETAILS</a>
    </td></tr>` : ""}
  `).join("");

  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title>
<style>
  body,table,td{font-family:Arial,Helvetica,sans-serif;}
  img{border:0;line-height:0;outline:none;text-decoration:none;}
  table{border-collapse:collapse;}
  @media(max-width:620px){.c{width:100%!important;}.p{padding-left:12px!important;padding-right:12px!important;}}
</style>
</head><body style="margin:0;padding:0;background:${NAVY};">
<table role="presentation" width="100%" bgcolor="${NAVY}"><tr><td align="center" class="p">

  <!-- Header -->
  <table role="presentation" width="600" class="c" style="width:600px;">
    <tr><td align="center" style="padding:16px 0;">
      <img src="${escA(headerImg)}" width="600" style="display:block;width:600px;max-width:100%;height:auto;" />
    </td></tr>
  </table>

  <!-- Body -->
  <table role="presentation" width="600" class="c" style="width:600px;background:#ffffff;">

    <!-- Hero Image -->
    ${showcaseHeroUrl ? `<tr><td><img src="${escA(showcaseHeroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>` : ""}

    <!-- Title Block -->
    <tr><td align="center" style="padding:24px 24px 8px;">
      <div style="font-size:36px;font-weight:900;color:${DARK_BLUE};letter-spacing:2px;">${esc(showcaseTitle)}</div>
      ${showcaseSubtitle ? `<div style="font-size:13px;color:${GRAY};letter-spacing:3px;margin-top:4px;">${esc(showcaseSubtitle)}</div>` : ""}
    </td></tr>

    <!-- Intro -->
    ${showcaseIntro ? `<tr><td style="padding:8px 32px 16px;">
      <p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(showcaseIntro)}</p>
    </td></tr>` : ""}

    <!-- Boat Cards -->
    ${boatRows}

    <!-- Agent Cards -->
    ${agents.map(a => agentCardHtml(a, baseUrl)).join("")}

    <tr><td style="height:12px;">&nbsp;</td></tr>

    <!-- Footer -->
    ${denisonFooterHtml(baseUrl)}
  </table>

</td></tr></table>
</body></html>`;
}
