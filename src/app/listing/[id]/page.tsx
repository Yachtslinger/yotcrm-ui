"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ListingLink = { label: string; url: string };
type ListingPdf  = { label: string; url: string };
type Listing = {
  id: number; name: string; make: string; model: string;
  year: string; length: string; price: string; location: string;
  status: string; description: string; highlights: string;
  listing_urls: ListingLink[]; pdf_urls: ListingPdf[];
  hero_image: string; broker: string;
};

const GOLD = "#c5a064";
const DARK = "#080c12";
const MUTED = "#8a7d6a";
const CARD = "#0d1520";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Teko:wght@300;400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  ::selection{background:rgba(197,160,100,0.3);}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#080c12;}
  ::-webkit-scrollbar-thumb{background:#c5a064;border-radius:2px;}
  body{overflow-x:hidden;}
  .label{font-family:'Teko',sans-serif;font-size:11px;letter-spacing:4px;color:#c5a064;text-transform:uppercase;}
  .gold-line{width:40px;height:1px;background:#c5a064;display:inline-block;}
  .nav-link{cursor:pointer;letter-spacing:2px;font-size:11px;font-family:'Teko',sans-serif;font-weight:300;color:#8a7d6a;transition:color 0.3s;text-transform:uppercase;text-decoration:none;}
  .nav-link:hover{color:#c5a064;}
  .btn-gold{background:transparent;border:1px solid #c5a064;color:#c5a064;padding:12px 32px;font-family:'Teko',sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all 0.3s;display:inline-block;text-decoration:none;white-space:nowrap;text-align:center;}
  .btn-gold:hover{background:#c5a064;color:#080c12;}
  .btn-ghost{background:transparent;border:1px solid rgba(197,160,100,0.3);color:#8a7d6a;padding:12px 32px;font-family:'Teko',sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all 0.3s;text-decoration:none;white-space:nowrap;text-align:center;display:inline-block;}
  .btn-ghost:hover{border-color:#c5a064;color:#c5a064;}
  .spec-row{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(197,160,100,0.08);}
  .spec-row:last-child{border-bottom:none;}
  .spec-label{font-family:'Teko',sans-serif;font-size:11px;letter-spacing:3px;color:#4a4035;text-transform:uppercase;padding:14px 20px 14px 0;}
  .spec-val{font-family:'Cormorant Garamond',serif;font-size:16px;color:#e8dcc8;font-weight:300;padding:14px 0;border-left:1px solid rgba(197,160,100,0.08);padding-left:20px;}
  .fade{animation:fUp 0.7s ease forwards;opacity:0;}
  @keyframes fUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  .gallery-img{width:100%;aspect-ratio:16/10;object-fit:cover;cursor:pointer;transition:transform 0.4s,opacity 0.3s;display:block;}
  .gallery-img:hover{transform:scale(1.02);opacity:0.9;}
  @media(max-width:768px){
    .g3{grid-template-columns:1fr !important;}
    .g2{grid-template-columns:1fr !important;}
    .spec-row{grid-template-columns:1fr;}
    .spec-label{padding-bottom:2px;}
    .spec-val{border-left:none;border-top:1px solid rgba(197,160,100,0.08);padding-left:0;padding-top:4px;}
    .hbtns{flex-direction:column;align-items:stretch !important;}
    .sp{padding:60px 20px !important;}
  }
`;

const BROKER_DATA: Record<string, { name: string; title: string; phone: string; email: string; photo: string }> = {
  Will: {
    name: "Will Noftsinger", title: "Yacht Broker · Build Consultant of The Americas",
    phone: "850.461.3342", email: "WN@DenisonYachting.com",
    photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg",
  },
  Paolo: {
    name: "Paolo Ameglio", title: "Yacht Broker",
    phone: "786.251.2588", email: "PGA@DenisonYachting.com",
    photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg",
  },
  Peter: {
    name: "Peter Quintal", title: "Yacht Broker",
    phone: "(954) 817-5662", email: "Peter@DenisonYachting.com",
    photo: "",
  },
};

// Parse highlights into sections: lines starting with emoji = section header
function parseHighlights(raw: string) {
  if (!raw) return [];
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const sections: { header: string; bullets: string[] }[] = [];
  let current: { header: string; bullets: string[] } | null = null;
  for (const line of lines) {
    const isHeader = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(line);
    if (isHeader) {
      if (current) sections.push(current);
      current = { header: line, bullets: [] };
    } else {
      if (!current) current = { header: "", bullets: [] };
      current.bullets.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

// Extract clean LOA from messy length fields like "78' Ferretti 2009" → "78'"
function cleanLoa(raw: string): string {
  if (!raw) return "";
  // Already clean: "145", "34 m", "120'", "34.5m"
  if (/^[\d.]+\s*(m|ft|')?$/.test(raw.trim())) return raw.trim();
  // Extract leading feet/meters: "78' Ferretti 2009" → "78'"
  const ft = raw.match(/^(\d+(?:\.\d+)?)\s*(?:ft|')/i);
  if (ft) return `${ft[1]}'`;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*m\b/i);
  if (m) return `${m[1]} m`;
  const bare = raw.match(/^(\d+)/);
  if (bare) return bare[1] + "'";
  return raw;
}

// Extract year from name like "78 Ferretti Twe11ve 2009 Miami Beach" → "2009"
function extractYear(name: string): string | null {
  const m = name.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  return m ? m[1] : null;
}

// Extract make from name using common brands
const YACHT_BRANDS = ["Ferretti","Azimut","Benetti","Viking","Boston Whaler","Marquis",
  "HCB","Frauscher","Schaefer","Ocean King","Van Der Valk","President","Sunseeker",
  "Azimut","Princess","Pershing","Riva","Lagoon","Fountaine Pajot","Leopard",
  "Hatteras","Bertram","Lazzara","Westport","Trinity","Feadship","Lurssen","Heesen"];

function extractMake(name: string): string | null {
  for (const brand of YACHT_BRANDS) {
    if (new RegExp(`\\b${brand}\\b`, "i").test(name)) return brand;
  }
  return null;
}

export default function PublicListingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/listing/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setListing(d.listing);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{CSS}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "1px solid rgba(197,160,100,0.4)", borderTop: "1px solid #c5a064", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 20px" }} />
          <div className="label">Loading</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (notFound || !listing) {
    return (
      <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <style>{CSS}</style>
        <div style={{ textAlign: "center" }}>
          <div className="label" style={{ marginBottom: 16 }}>Listing Unavailable</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 40, fontWeight: 300, color: "#e8dcc8", fontStyle: "italic", marginBottom: 16 }}>
            This vessel is no longer listed
          </h1>
          <a href="/home" className="btn-gold" style={{ fontSize: 11 }}>View All Listings</a>
        </div>
      </div>
    );
  }

  const l = listing;

  // Smart field resolution — fill gaps from name parsing when structured fields are empty
  const resolvedMake     = l.make     || extractMake(l.name)     || "";
  const resolvedYear     = l.year     || extractYear(l.name)     || "";
  const resolvedLength   = cleanLoa(l.length);
  const resolvedModel    = l.model    || "";

  const vessel = [resolvedYear, resolvedLength, resolvedMake, resolvedModel].filter(Boolean).join(" · ");
  const broker = BROKER_DATA[l.broker] || BROKER_DATA.Will;
  const sections = parseHighlights(l.highlights);

  // Clean listing URLs — strip "Video - " prefixes and dedupe
  const cleanUrls = l.listing_urls.map(u => {
    const urlMatch = u.url.match(/https?:\/\/\S+/);
    const cleanUrl = urlMatch ? urlMatch[0] : u.url;
    const isVideo = /youtube|vimeo|youtu\.be/i.test(cleanUrl);
    return { label: u.label || (isVideo ? "Video Tour" : "View Listing"), url: cleanUrl, isVideo };
  }).filter(u => u.url.startsWith("http"));

  // Key facts grid — always shown, uses resolved values
  const keyFacts = [
    resolvedLength   && { label: "Length Overall",  value: resolvedLength },
    resolvedYear     && { label: "Year",            value: resolvedYear },
    resolvedMake     && { label: "Builder",         value: resolvedMake },
    resolvedModel    && { label: "Model",           value: resolvedModel },
    l.location       && { label: "Location",        value: l.location },
    l.price          && { label: "Asking Price",    value: l.price },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", background: DARK, color: "#e8dcc8", minHeight: "100vh", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to bottom,rgba(8,12,18,0.97),rgba(8,12,18,0.6))", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(197,160,100,0.07)" }}>
        <a href="/home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 26, height: 26, border: "1px solid #c5a064", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, color: GOLD, fontWeight: 400 }}>Y</span>
          </div>
          <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 14, letterSpacing: 4, color: "#e8dcc8", fontWeight: 300, textTransform: "uppercase" }}>The Yacht Cache</span>
        </a>
        <a href="/home#listings" className="nav-link" style={{ fontSize: 11 }}>All Listings</a>
        <a href={`tel:${broker.phone.replace(/\D/g,"")}`} style={{ fontFamily: "'Teko',sans-serif", fontSize: 12, letterSpacing: 2, color: GOLD, textDecoration: "none" }}>{broker.phone}</a>
      </nav>

      {/* HERO */}
      <div style={{ position: "relative", height: "75dvh", minHeight: 520, overflow: "hidden" }}>
        {l.hero_image ? (
          <img src={l.hero_image} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#0a1520,#0d1e30)" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #080c12 0%, rgba(8,12,18,0.3) 50%, rgba(8,12,18,0.5) 100%)" }} />
        {/* Status badge */}
        {l.status !== "active" && (
          <div style={{ position: "absolute", top: 80, right: 28, padding: "6px 18px", fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, background: "rgba(8,12,18,0.8)", border: "1px solid rgba(197,160,100,0.3)", color: GOLD, textTransform: "uppercase" }}>
            {l.status}
          </div>
        )}
        {/* Hero content */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 40px 44px" }}>
          <div className="label fade" style={{ marginBottom: 12, animationDelay: "0.1s" }}>{vessel || "Superyacht"}</div>          <h1 className="fade" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: "clamp(42px,7vw,88px)", fontWeight: 300, fontStyle: "italic", lineHeight: 0.9, letterSpacing: -2, color: "#e8dcc8", animationDelay: "0.2s", marginBottom: 18 }}>
            {l.name}
          </h1>
          {l.price && (
            <div className="fade" style={{ fontFamily: "'Teko',sans-serif", fontSize: 28, color: GOLD, letterSpacing: 2, animationDelay: "0.35s", marginBottom: 24 }}>
              {l.price}
            </div>
          )}
          <div className="hbtns fade" style={{ display: "flex", gap: 12, animationDelay: "0.45s" }}>
            <a href={`mailto:${broker.email}?subject=Enquiry: ${encodeURIComponent(l.name)}`} className="btn-gold" style={{ fontSize: 11, padding: "13px 36px" }}>Enquire Now</a>
            <a href={`tel:${broker.phone.replace(/\D/g,"")}`} className="btn-ghost" style={{ fontSize: 11, padding: "13px 36px" }}>Call {broker.name.split(" ")[0]}</a>
          </div>
        </div>
      </div>

      {/* STATS BAR */}
      {(l.length || l.year || l.location || l.make) && (
        <div style={{ borderTop: "1px solid rgba(197,160,100,0.1)", borderBottom: "1px solid rgba(197,160,100,0.1)", padding: "22px 40px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48 }}>
          {[
            l.length && ["LOA", l.length],
            l.year && ["Year", l.year],
            l.make && ["Builder", l.make],
            l.location && ["Location", l.location],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label as string} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 20, color: GOLD, letterSpacing: 1 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* KEY FACTS — always shown */}
      {keyFacts.length > 0 && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 1100, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 20 }}>Vessel Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 2, border: "1px solid rgba(197,160,100,0.12)" }}>
            {keyFacts.map(f => (
              <div key={f.label} style={{ background: CARD, padding: "20px 24px", borderRight: "1px solid rgba(197,160,100,0.08)" }}>
                <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase", marginBottom: 6 }}>{f.label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, color: "#e8dcc8", fontWeight: 300 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* DESCRIPTION */}
      {l.description && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 900, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 16 }}>Overview</div>
          <p style={{ fontSize: "clamp(17px,2vw,21px)", fontWeight: 300, lineHeight: 1.85, color: MUTED, fontStyle: "italic" }}>
            {l.description}
          </p>
        </section>
      )}

      {/* HIGHLIGHTS — parsed sections, when populated */}
      {sections.length > 0 && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 1100, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 20 }}>Highlights</div>
          <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {sections.map((sec, si) => (
              <div key={si} style={{ background: CARD, border: "1px solid rgba(197,160,100,0.1)", padding: "28px 28px 24px" }}>
                {sec.header && (
                  <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 14, letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginBottom: 16, borderBottom: "1px solid rgba(197,160,100,0.12)", paddingBottom: 12 }}>
                    {sec.header}
                  </div>
                )}
                {sec.bullets.map((b, bi) => {
                  const colonIdx = b.indexOf(":");
                  const isSpec = colonIdx > 0 && colonIdx < 40 && !b.startsWith("http");
                  if (isSpec) {
                    const label = b.slice(0, colonIdx);
                    const val   = b.slice(colonIdx + 1).trim();
                    return (
                      <div key={bi} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid rgba(197,160,100,0.06)" }}>
                        <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase" }}>{label}</span>
                        <span style={{ fontSize: 15, color: "#e8dcc8", fontWeight: 300 }}>{val}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={bi} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 14, height: 1, background: GOLD, marginTop: 11, flexShrink: 0 }} />
                      <span style={{ fontSize: 15, color: "#e8dcc8", fontWeight: 300, lineHeight: 1.65 }}>{b}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* EXTERNAL LISTINGS — prominent link cards */}
      {cleanUrls.length > 0 && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 1100, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 20 }}>View Full Listing</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {cleanUrls.map((u, i) => {
              const isDenison = /denison/i.test(u.url);
              const isYW     = /yachtworld/i.test(u.url);
              const isYatco  = /yatco/i.test(u.url);
              const isVideo  = u.isVideo;
              const icon = isVideo ? "🎬" : isDenison ? "⚓" : isYW ? "🌊" : isYatco ? "🧭" : "🔗";
              const source = isVideo ? "Video Tour" : isDenison ? "Denison Yachting" : isYW ? "YachtWorld" : isYatco ? "YATCO" : "Full Listing";
              return (
                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", background: CARD, border: "1px solid rgba(197,160,100,0.15)", padding: "24px 28px", textDecoration: "none", transition: "border-color 0.3s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(197,160,100,0.5)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(197,160,100,0.15)")}>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
                  <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase", marginBottom: 6 }}>{source}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, color: "#e8dcc8", fontWeight: 300, marginBottom: 12 }}>{u.label}</div>
                  <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 2, color: GOLD, textTransform: "uppercase" }}>View ↗</div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* PDF DOCUMENTS */}
      {l.pdf_urls.length > 0 && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 1100, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 20 }}>Documents</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {l.pdf_urls.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                className="btn-gold" style={{ fontSize: 11, padding: "11px 28px" }}>
                📄 {p.label || "Download PDF"}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ENQUIRE CTA — when minimal data */}
      {sections.length === 0 && !l.description && (
        <section className="sp" style={{ padding: "72px 40px 0", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ border: "1px solid rgba(197,160,100,0.15)", padding: "60px 40px", background: CARD }}>
            <div style={{ width: 1, height: 48, background: `linear-gradient(to bottom, ${GOLD}, transparent)`, margin: "0 auto 28px" }} />
            <div className="label" style={{ marginBottom: 16 }}>Full Details Available</div>
            <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 300, color: MUTED, lineHeight: 1.8, maxWidth: 500, margin: "0 auto 32px", fontStyle: "italic" }}>
              Contact Will directly for full specifications, recent survey results, and pricing details for {l.name}.
            </p>
            <a href={`mailto:${broker.email}?subject=Full Details Request: ${encodeURIComponent(l.name)}`}
              className="btn-gold" style={{ fontSize: 11, padding: "13px 40px" }}>
              Request Full Details
            </a>
          </div>
        </section>
      )}

      <div style={{ height: 72 }} />

      {/* BROKER CONTACT CARD */}
      <section style={{ background: "#060b11", borderTop: "1px solid rgba(197,160,100,0.1)", borderBottom: "1px solid rgba(197,160,100,0.1)", padding: "72px 40px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="label" style={{ marginBottom: 20, textAlign: "center" }}>Your Broker</div>
          <div style={{ background: CARD, border: "1px solid rgba(197,160,100,0.15)", display: "flex", flexWrap: "wrap", gap: 0, overflow: "hidden" }}>
            {/* Photo */}
            <div style={{ width: 200, flexShrink: 0, background: "linear-gradient(135deg,#0a1520,#0d1e30)", minHeight: 200 }}>
              {broker.photo ? (
                <img src={broker.photo} alt={broker.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block", minHeight: 200 }} />
              ) : (
                <div style={{ width: "100%", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 48, color: "rgba(197,160,100,0.3)" }}>
                    {broker.name.split(" ").map((w: string) => w[0]).join("")}
                  </span>
                </div>
              )}
            </div>
            {/* Info */}
            <div style={{ flex: 1, padding: "32px 36px", minWidth: 260 }}>
              <div className="label" style={{ fontSize: 9, marginBottom: 10 }}>Listed By</div>
              <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 32, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", marginBottom: 6 }}>
                {broker.name}
              </h3>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase", marginBottom: 24 }}>
                {broker.title} · Denison Yachting
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <a href={`mailto:${broker.email}?subject=Enquiry: ${encodeURIComponent(l.name)}`}
                  className="btn-gold" style={{ fontSize: 11, padding: "11px 28px" }}>
                  Email {broker.name.split(" ")[0]}
                </a>
                <a href={`tel:${broker.phone.replace(/\D/g,"")}`}
                  className="btn-ghost" style={{ fontSize: 11, padding: "11px 28px" }}>
                  {broker.phone}
                </a>
                <a href={`sms:${broker.phone.replace(/\D/g,"")}`}
                  className="btn-ghost" style={{ fontSize: 11, padding: "11px 28px" }}>
                  Text
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(197,160,100,0.1)", padding: "36px 40px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
          <a href="/home" style={{ textDecoration: "none" }}>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, letterSpacing: 4, color: "#e8dcc8", fontWeight: 300, textTransform: "uppercase", marginBottom: 2 }}>The Yacht Cache</div>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase" }}>by Yachtslinger · Denison Yachting</div>
          </a>
          <a href="/home#listings" className="btn-ghost" style={{ fontSize: 10, padding: "9px 24px" }}>View All Listings</a>
          <div style={{ textAlign: "right" }}>
            <a href={`tel:${broker.phone.replace(/\D/g,"")}`} style={{ fontFamily: "'Teko',sans-serif", fontSize: 18, color: GOLD, textDecoration: "none", letterSpacing: 2, display: "block" }}>{broker.phone}</a>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase", marginTop: 2 }}>Fort Lauderdale, Florida</div>
          </div>
        </div>
      </footer>

      {/* LIGHTBOX */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.95)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={lightbox} alt="Full size"
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", display: "block" }} />
          <button onClick={() => setLightbox(null)}
            style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: "50%", background: "rgba(197,160,100,0.2)", border: "1px solid rgba(197,160,100,0.4)", color: GOLD, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
