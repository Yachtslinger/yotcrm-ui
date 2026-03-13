"use client";
import React, { useState, useEffect, useRef } from "react";

type Listing = {
  id: number; name: string; make: string; model: string; year: string;
  length: string; price: string; location: string; heroImage: string;
  description: string; highlights: string; broker: string;
  listingUrls: { label: string; url: string }[];
};
type Brochure = { slug: string; title: string; subtitle: string; builder: string; year: string; tag: string };

const GOLD = "#c5a064";
const DARK = "#080c12";
const MUTED = "#8a7d6a";

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
  .wm{position:absolute;font-family:'Teko',sans-serif;font-size:160px;font-weight:300;color:rgba(197,160,100,0.04);pointer-events:none;user-select:none;line-height:1;}
  .nav-link{cursor:pointer;letter-spacing:2px;font-size:11px;font-family:'Teko',sans-serif;font-weight:300;color:#8a7d6a;transition:color 0.3s;text-transform:uppercase;}
  .nav-link:hover{color:#c5a064;}
  .btn-gold{background:transparent;border:1px solid #c5a064;color:#c5a064;padding:12px 32px;font-family:'Teko',sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all 0.3s;display:inline-block;text-decoration:none;white-space:nowrap;text-align:center;}
  .btn-gold:hover{background:#c5a064;color:#080c12;}
  .btn-gold:disabled{opacity:0.4;cursor:not-allowed;}
  .btn-ghost{background:transparent;border:1px solid rgba(197,160,100,0.3);color:#8a7d6a;padding:12px 32px;font-family:'Teko',sans-serif;font-size:13px;letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all 0.3s;text-decoration:none;white-space:nowrap;text-align:center;display:inline-block;}
  .btn-ghost:hover{border-color:#c5a064;color:#c5a064;}
  .input-field{width:100%;background:rgba(255,255,255,0.03);border:none;border-bottom:1px solid rgba(197,160,100,0.25);color:#e8dcc8;padding:14px 0;font-family:'Cormorant Garamond',serif;font-size:17px;outline:none;transition:border-color 0.3s;-webkit-appearance:none;}
  .input-field:focus{border-bottom-color:#c5a064;}
  .input-field::placeholder{color:#4a4035;}
  select.input-field option{background:#0d1520;}
  .lcard{background:#0d1520;border:1px solid rgba(197,160,100,0.12);transition:all 0.4s;cursor:pointer;overflow:hidden;}
  .lcard:hover{border-color:rgba(197,160,100,0.4);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
  .lcard:hover .cimg{transform:scale(1.04);}
  .cimg{transition:transform 0.6s;width:100%;height:220px;object-fit:cover;display:block;}
  .bcard{background:#0d1520;border:1px solid rgba(197,160,100,0.12);transition:all 0.4s;overflow:hidden;text-decoration:none;display:block;cursor:pointer;}
  .bcard:hover{border-color:rgba(197,160,100,0.5);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
  .ecard{background:#0d1520;border:1px solid rgba(197,160,100,0.12);transition:all 0.4s;overflow:hidden;text-decoration:none;display:block;}
  .ecard:hover{border-color:rgba(197,160,100,0.4);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
  .modal-bg{position:fixed;inset:0;background:rgba(4,7,14,0.92);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;}
  @media(min-width:640px){.modal-bg{align-items:center;}}
  .modal-box{background:#0d1520;width:100%;max-width:700px;max-height:93dvh;overflow-y:auto;border-radius:20px 20px 0 0;border:1px solid rgba(197,160,100,0.15);}
  @media(min-width:640px){.modal-box{border-radius:20px;max-height:88vh;}}
  .drawer{position:fixed;inset:0;z-index:300;}
  .drawer-bg{position:absolute;inset:0;background:rgba(4,7,14,0.88);backdrop-filter:blur(8px);}
  .drawer-panel{position:absolute;top:0;right:0;bottom:0;width:76vw;max-width:300px;background:#080c12;border-left:1px solid rgba(197,160,100,0.15);padding:80px 28px 40px;display:flex;flex-direction:column;gap:4px;}
  .ham{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:4px;}
  .ham span{width:22px;height:1px;background:#c5a064;display:block;}
  .fade{animation:fUp 0.7s ease forwards;opacity:0;}
  @keyframes fUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  .sticky-cta{position:fixed;bottom:0;left:0;right:0;z-index:90;display:none;padding:12px 16px 28px;gap:10px;background:linear-gradient(to top,rgba(8,12,18,0.98) 60%,transparent);}
  @media(max-width:768px){
    .ham{display:flex;}
    .dnav{display:none !important;}
    .dphone{display:none !important;}
    .htitle{font-size:52px !important;letter-spacing:-1px !important;}
    .sbar{flex-wrap:wrap;gap:28px !important;padding:24px 20px !important;}
    .sbar>div{min-width:calc(50% - 14px);}
    .g3{grid-template-columns:1fr !important;}
    .g2{grid-template-columns:1fr !important;gap:40px !important;}
    .about-photo{display:none !important;}
    .frow{grid-template-columns:1fr !important;gap:20px !important;}
    .fi{flex-direction:column;align-items:stretch !important;}
    .sp{padding:72px 20px !important;}
    .hbtns{flex-direction:column;align-items:center !important;}
    .bg2{grid-template-columns:1fr 1fr !important;}
    .sticky-cta{display:flex !important;}
    .footer-inner{flex-direction:column !important;gap:20px !important;text-align:center !important;}
  }
`;

// ── Listing Modal ─────────────────────────────────────────────────────────────
function ListingModal({ l, onClose }: { l: Listing; onClose: () => void }) {
  const bullets = l.highlights ? l.highlights.split(/\n|·|•/).map(s => s.trim()).filter(Boolean) : [];
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div style={{ position: "relative", height: 280, flexShrink: 0 }}>
          {l.heroImage
            ? <img src={l.heroImage} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#0d1520,#1a2535)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 64, color: "rgba(197,160,100,0.2)" }}>⚓</span>
              </div>}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,#0d1520 0%,transparent 55%)" }} />
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 36, height: 36, borderRadius: "50%", background: "rgba(8,12,18,0.75)", border: "1px solid rgba(197,160,100,0.35)", color: GOLD, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px 40px" }}>
          <div className="label" style={{ marginBottom: 8 }}>{[l.year, l.length, l.location].filter(Boolean).join(" · ")}</div>
          <h2 style={{ fontSize: 30, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.15, marginBottom: l.price ? 8 : 18 }}>
            {l.name || `${l.year} ${l.make} ${l.model}`}
          </h2>
          {l.price && <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 24, color: GOLD, letterSpacing: 1, marginBottom: 18 }}>{l.price}</div>}
          {l.description && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.85, fontWeight: 300, marginBottom: 22 }}>{l.description}</p>}
          {bullets.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <div className="label" style={{ fontSize: 9, marginBottom: 12 }}>Highlights</div>
              {bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 14, height: 1, background: GOLD, marginTop: 11, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "#e8dcc8", fontWeight: 300, lineHeight: 1.65 }}>{b}</span>
                </div>
              ))}
            </div>
          )}
          {l.listingUrls?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {l.listingUrls.map((u, i) => (
                <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="btn-gold" style={{ fontSize: 11, padding: "13px 24px" }}>
                  {u.label || "View Full Listing"}
                </a>
              ))}
            </div>
          )}
          <div style={{ paddingTop: 18, borderTop: "1px solid rgba(197,160,100,0.1)", display: "flex", gap: 10 }}>
            <a href="mailto:WN@DenisonYachting.com" className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "11px 8px" }}>Email Will</a>
            <a href="tel:8504613342" className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "11px 8px" }}>Call Direct</a>
            <a href="sms:8504613342" className="btn-ghost" style={{ flex: 1, fontSize: 10, padding: "11px 8px" }}>Text Will</a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function YachtCachePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", interest: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/public/listings").then(r => r.json()).then(d => { if (d.ok) setListings(d.listings); }).catch(() => {});
    fetch("/api/brochures").then(r => r.json()).then(d => { if (d.ok) setBrochures(d.brochures); }).catch(() => {});
  }, []);

  useEffect(() => {
    const fn = () => { if (heroRef.current) heroRef.current.style.transform = `translateY(${window.scrollY * 0.35}px)`; };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const go = (id: string) => { setDrawer(false); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 40); };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSending(true);
    try { const r = await fetch("/api/public/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); if ((await r.json()).ok) setSent(true); } catch {}
    setSending(false);
  }

  const NAV = ["Listings", "Brochures", "Cards", "About", "Contact"];

  return (
    <div style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", background: DARK, color: "#e8dcc8", minHeight: "100vh", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(to bottom,rgba(8,12,18,0.97),rgba(8,12,18,0.6))", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(197,160,100,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => go("listings")}>
          <div style={{ width: 26, height: 26, border: "1px solid #c5a064", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, color: GOLD, fontWeight: 400 }}>Y</span>
          </div>
          <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 14, letterSpacing: 4, color: "#e8dcc8", fontWeight: 300, textTransform: "uppercase" }}>The Yacht Cache</span>
        </div>
        <div className="dnav" style={{ display: "flex", gap: 28 }}>
          {NAV.map(n => <span key={n} className="nav-link" onClick={() => go(n.toLowerCase())}>{n}</span>)}
        </div>
        <a href="tel:8504613342" className="dphone" style={{ fontFamily: "'Teko',sans-serif", fontSize: 12, letterSpacing: 2, color: GOLD, textDecoration: "none", fontWeight: 300 }}>850.461.3342</a>
        <button className="ham" onClick={() => setDrawer(true)} aria-label="Menu"><span /><span /><span /></button>
      </nav>

      {/* MOBILE DRAWER */}
      {drawer && (
        <div className="drawer">
          <div className="drawer-bg" onClick={() => setDrawer(false)} />
          <div className="drawer-panel">
            <button onClick={() => setDrawer(false)} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: GOLD, fontSize: 24, cursor: "pointer" }}>✕</button>
            {NAV.map(n => (
              <button key={n} onClick={() => go(n.toLowerCase())} style={{ background: "none", border: "none", fontFamily: "'Teko',sans-serif", fontSize: 26, fontWeight: 300, letterSpacing: 3, color: "#e8dcc8", textTransform: "uppercase", cursor: "pointer", textAlign: "left", padding: "10px 0", borderBottom: "1px solid rgba(197,160,100,0.06)" }}>
                {n}
              </button>
            ))}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="tel:8504613342" className="btn-gold" style={{ fontSize: 11 }}>Call Will · 850.461.3342</a>
              <a href="mailto:WN@DenisonYachting.com" className="btn-ghost" style={{ fontSize: 11 }}>WN@DenisonYachting.com</a>
            </div>
          </div>
        </div>
      )}

      {/* HERO */}
      <div style={{ position: "relative", height: "100dvh", minHeight: 600, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div ref={heroRef} style={{ position: "absolute", inset: "-20%", backgroundImage: "url('https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1600&q=80')", backgroundSize: "cover", backgroundPosition: "center", filter: "brightness(0.22)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 20%, #080c12 100%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(8,12,18,0.3) 0%, transparent 40%, rgba(8,12,18,0.8) 100%)" }} />
        <div style={{ position: "relative", textAlign: "center", padding: "0 24px", maxWidth: 700 }}>
          <div className="label fade" style={{ marginBottom: 22, animationDelay: "0.1s" }}>Will Noftsinger · Denison Yachting · Fort Lauderdale</div>
          <h1 className="htitle fade" style={{ fontSize: 92, fontWeight: 300, lineHeight: 0.88, letterSpacing: -3, color: "#e8dcc8", fontStyle: "italic", animationDelay: "0.25s", marginBottom: 28 }}>
            The Yacht<br /><span style={{ color: GOLD }}>Cache</span>
          </h1>
          <p className="fade" style={{ fontSize: 18, fontWeight: 300, color: MUTED, letterSpacing: 1, maxWidth: 420, margin: "0 auto 36px", lineHeight: 1.65, animationDelay: "0.45s" }}>
            Curated superyacht brokerage.<br />70ft to 200ft. Worldwide.
          </p>
          <div className="hbtns fade" style={{ display: "flex", gap: 14, justifyContent: "center", animationDelay: "0.6s" }}>
            <button className="btn-gold" onClick={() => go("listings")} style={{ padding: "13px 36px" }}>View Listings</button>
            <button className="btn-ghost" onClick={() => go("contact")} style={{ padding: "13px 36px" }}>Get in Touch</button>
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 4, color: "#4a4035" }}>SCROLL</span>
          <div style={{ width: 1, height: 44, background: "linear-gradient(to bottom,#c5a064,transparent)" }} />
        </div>
      </div>

      {/* STATS */}
      <div className="sbar" style={{ borderTop: "1px solid rgba(197,160,100,0.1)", borderBottom: "1px solid rgba(197,160,100,0.1)", padding: "26px 48px", display: "flex", justifyContent: "center", gap: 72 }}>
        {[["15+","Active Listings"],["$2B+","Transactions"],["20+","Years Experience"],["70–200ft","Specialty Range"]].map(([v,l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 30, fontWeight: 400, color: GOLD, lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 3, color: "#4a4035", marginTop: 4, textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* LISTINGS */}
      <section id="listings" className="sp" style={{ padding: "96px 40px", maxWidth: 1200, margin: "0 auto", position: "relative" }}>
        <div className="wm" style={{ top: 40, right: -30, zIndex: 0 }}>YACHTS</div>
        <div style={{ marginBottom: 48, position: "relative", zIndex: 1 }}>
          <div className="label" style={{ marginBottom: 14 }}>Current Portfolio</div>
          <h2 style={{ fontSize: 50, fontWeight: 300, fontStyle: "italic", lineHeight: 1.1 }}>
            The <span style={{ color: GOLD }}>Yachtfolio</span>
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <div className="gold-line" />
            <span style={{ fontSize: 13, color: "#4a4035", fontWeight: 300, letterSpacing: 1 }}>{listings.length} vessels available</span>
          </div>
        </div>
        {listings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#4a4035" }}>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 42, fontWeight: 300, letterSpacing: 4 }}>ENQUIRE WITHIN</div>
            <p style={{ marginTop: 14, fontSize: 15, fontWeight: 300 }}>Contact Will directly for current inventory</p>
          </div>
        ) : (
          <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22, position: "relative", zIndex: 1 }}>
            {listings.map((l, i) => (
              <div key={l.id} className="lcard fade" style={{ animationDelay: `${i * 0.08}s` }} onClick={() => setSelected(l)}>
                {l.heroImage
                  ? <img src={l.heroImage} alt={l.name} className="cimg" />
                  : <div className="cimg" style={{ background: "linear-gradient(135deg,#0d1520,#1a2535)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 44, color: "rgba(197,160,100,0.18)" }}>⚓</span>
                    </div>}
                <div style={{ padding: "16px 18px 22px" }}>
                  <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>{[l.year, l.length, l.location].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 20, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.2, marginBottom: 6 }}>
                    {l.name || `${l.year} ${l.make} ${l.model}`}
                  </div>
                  {l.price && <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 17, color: GOLD, letterSpacing: 1 }}>{l.price}</div>}
                  {l.description && <p style={{ marginTop: 8, fontSize: 12, color: "#4a4035", lineHeight: 1.65, fontWeight: 300, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.description}</p>}
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="gold-line" style={{ width: 18 }} />
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>View Details</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BROCHURES */}
      <section id="brochures" className="sp" style={{ padding: "96px 40px", background: "#0a0f18", position: "relative", overflow: "hidden" }}>
        <div className="wm" style={{ bottom: 0, left: -20 }}>DOCS</div>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <div className="label" style={{ marginBottom: 14 }}>Digital Brochures</div>
            <h2 style={{ fontSize: 50, fontWeight: 300, fontStyle: "italic", lineHeight: 1.1 }}>
              E-<span style={{ color: GOLD }}>Brochures</span>
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <div className="gold-line" />
              <span style={{ fontSize: 13, color: "#4a4035", fontWeight: 300, letterSpacing: 1 }}>Interactive vessel presentations</span>
            </div>
          </div>
          {brochures.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#4a4035" }}>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 36, letterSpacing: 4 }}>COMING SOON</div>
            </div>
          ) : (
            <div className="bg2" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22, position: "relative", zIndex: 1 }}>
              {brochures.map((b) => (
                <a key={b.slug} href={`/brochures/${b.slug}`} target="_blank" rel="noopener noreferrer" className="bcard">
                  <div style={{ background: "linear-gradient(135deg,#0a1520,#162535)", height: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(197,160,100,0.1)" }}>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 52, color: "rgba(197,160,100,0.25)" }}>⚓</span>
                    {b.tag && <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginTop: 8 }}>{b.tag}</span>}
                  </div>
                  <div style={{ padding: "16px 18px 22px" }}>
                    <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>{[b.builder, b.year].filter(Boolean).join(" · ")}</div>
                    <div style={{ fontSize: 20, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.2, marginBottom: 4 }}>{b.title}</div>
                    {b.subtitle && <div style={{ fontSize: 12, color: "#4a4035", fontWeight: 300 }}>{b.subtitle}</div>}
                    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="gold-line" style={{ width: 18 }} />
                      <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>Open Brochure</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DIGITAL CARDS */}
      <section id="cards" className="sp" style={{ padding: "96px 40px", maxWidth: 1200, margin: "0 auto", position: "relative" }}>
        <div className="wm" style={{ top: 40, right: -30 }}>CARDS</div>
        <div style={{ marginBottom: 48 }}>
          <div className="label" style={{ marginBottom: 14 }}>Digital Business Cards</div>
          <h2 style={{ fontSize: 50, fontWeight: 300, fontStyle: "italic", lineHeight: 1.1 }}>
            Meet the <span style={{ color: GOLD }}>Brokers</span>
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
            <div className="gold-line" />
            <span style={{ fontSize: 13, color: "#4a4035", fontWeight: 300, letterSpacing: 1 }}>Save contact · Share · Connect</span>
          </div>
        </div>
        <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, position: "relative", zIndex: 1 }}>
          {[
            { id: "will", name: "Will Noftsinger", title: "Yacht Broker · Build Consultant of The Americas", companies: "Denison Yachting · YachtSlinger · Oceanking", phone: "850.461.3342", email: "WN@DenisonYachting.com", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg" },
            { id: "paolo", name: "Paolo Ameglio", title: "Yacht Broker", companies: "Denison Yachting", phone: "786.251.2588", email: "PGA@DenisonYachting.com", photo: "https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg" },
          ].map(broker => (
            <a key={broker.id} href={`/card/${broker.id}`} className="ecard" style={{ textDecoration: "none" }}>
              <div style={{ background: "linear-gradient(135deg,#0a1e30,#0d1520)", padding: "28px 24px 24px", display: "flex", gap: 20, alignItems: "flex-start" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", border: "2px solid rgba(197,160,100,0.3)", overflow: "hidden", background: "#0a2e5c", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {broker.photo
                    ? <img src={broker.photo} alt={broker.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 600, color: "#fff" }}>{broker.name.split(" ").map(w => w[0]).join("")}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.15, marginBottom: 4 }}>{broker.name}</div>
                  <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>{broker.title}</div>
                  <div style={{ fontSize: 12, color: "#4a4035", fontWeight: 300, marginBottom: 14 }}>{broker.companies}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={`tel:${broker.phone.replace(/\D/g,"")}`} onClick={e => e.stopPropagation()} style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 1, color: MUTED, textDecoration: "none", padding: "4px 10px", border: "1px solid rgba(197,160,100,0.18)", borderRadius: 3 }}>{broker.phone}</a>
                    <a href={`mailto:${broker.email}`} onClick={e => e.stopPropagation()} style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 1, color: MUTED, textDecoration: "none", padding: "4px 10px", border: "1px solid rgba(197,160,100,0.18)", borderRadius: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{broker.email}</a>
                  </div>
                </div>
              </div>
              <div style={{ padding: "12px 24px 16px", borderTop: "1px solid rgba(197,160,100,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>View Digital Card</span>
                <div className="gold-line" style={{ width: 22 }} />
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ABOUT / TEAM */}
      <section id="about" className="sp" style={{ padding: "96px 40px", background: "#0a0f18", position: "relative", overflow: "hidden" }}>
        <div className="wm" style={{ bottom: 0, left: -20 }}>TEAM</div>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: 64 }}>
            <div className="label" style={{ marginBottom: 14 }}>The Brokers</div>
            <h2 style={{ fontSize: 50, fontWeight: 300, fontStyle: "italic", lineHeight: 1.1 }}>
              Meet the <span style={{ color: GOLD }}>Team</span>
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
              <div className="gold-line" />
              <span style={{ fontSize: 13, color: "#4a4035", fontWeight: 300, letterSpacing: 1 }}>Denison Yachting · Fort Lauderdale, FL</span>
            </div>
          </div>

          <div className="g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>

            {/* ── Will Noftsinger ── */}
            <div style={{ background: "#0d1520", border: "1px solid rgba(197,160,100,0.12)", overflow: "hidden" }}>
              <div style={{ position: "relative", height: 280, overflow: "hidden" }}>
                <img src="https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg"
                  alt="Will Noftsinger" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", filter: "grayscale(10%) contrast(1.05)", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d1520 0%, transparent 55%)" }} />
                <div style={{ position: "absolute", bottom: 16, left: 20 }}>
                  <div className="label" style={{ fontSize: 9 }}>Denison Yachting · Fort Lauderdale</div>
                </div>
              </div>
              <div style={{ padding: "24px 28px 32px" }}>
                <div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Yacht Broker · Build Consultant</div>
                <h3 style={{ fontSize: 32, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.1, marginBottom: 4 }}>
                  William (Will) <span style={{ color: GOLD }}>Noftsinger III</span>
                </h3>
                <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a4035", marginBottom: 20 }}>DENISON YACHTING · YACHTSLINGER · OCEANKING</div>

                {/* Experience bar */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 36, color: GOLD, fontWeight: 400, lineHeight: 1 }}>13</span>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase" }}>Years in the Industry</span>
                  </div>
                  <div style={{ height: 2, background: "rgba(197,160,100,0.12)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "43%", background: `linear-gradient(to right, ${GOLD}, rgba(197,160,100,0.5))`, borderRadius: 1 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 2, color: "#4a4035" }}>7 YRS AT DENISON</span>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 2, color: "#4a4035" }}>IYBA MEMBER</span>
                  </div>
                </div>

                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.85, color: MUTED, marginBottom: 20 }}>
                  Will specializes in the superyacht market, bringing thirteen years of industry knowledge — seven of them with Denison — to buyers and sellers of vessels from 70 to 200 feet. He grew up on the Chesapeake Bay, earned his degree in advertising from Auburn University, and built his career around new builds and brokerage, working closely with renowned Dutch shipyard Van der Valk.
                </p>
                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.85, color: MUTED, marginBottom: 24 }}>
                  His approach is direct, transparent, and technology-forward — with many clients returning for their fourth or fifth vessel under his guidance.
                </p>

                {/* Fun facts */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                  {[["🏠","Richmond, VA"],["⛵","13' Boston Whaler"],["🎵","Dave Matthews Band"],["🎓","Auburn University"]].map(([icon,fact]) => (
                    <span key={fact} style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 1, color: MUTED, padding: "4px 10px", border: "1px solid rgba(197,160,100,0.14)", borderRadius: 2 }}>{icon} {fact}</span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <a href="mailto:WN@DenisonYachting.com" className="btn-gold" style={{ fontSize: 10, padding: "10px 20px", flex: 1, textAlign: "center" }}>Email Will</a>
                  <a href="tel:8504613342" className="btn-ghost" style={{ fontSize: 10, padding: "10px 20px", flex: 1, textAlign: "center" }}>850.461.3342</a>
                </div>
              </div>
            </div>

            {/* ── Paolo Ameglio ── */}
            <div style={{ background: "#0d1520", border: "1px solid rgba(197,160,100,0.12)", overflow: "hidden" }}>
              <div style={{ position: "relative", height: 280, overflow: "hidden" }}>
                <img src="https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg"
                  alt="Paolo Ameglio" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", filter: "grayscale(10%) contrast(1.05)", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0d1520 0%, transparent 55%)" }} />
                <div style={{ position: "absolute", bottom: 16, left: 20 }}>
                  <div className="label" style={{ fontSize: 9 }}>Denison Yachting · Fort Lauderdale</div>
                </div>
              </div>
              <div style={{ padding: "24px 28px 32px" }}>
                <div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Yacht Broker</div>
                <h3 style={{ fontSize: 32, fontWeight: 300, fontStyle: "italic", color: "#e8dcc8", lineHeight: 1.1, marginBottom: 4 }}>
                  Paolo <span style={{ color: GOLD }}>Ameglio</span>
                </h3>
                <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 2, color: "#4a4035", marginBottom: 20 }}>DENISON YACHTING · FORT LAUDERDALE</div>

                {/* Experience bar */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 36, color: GOLD, fontWeight: 400, lineHeight: 1 }}>25+</span>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, letterSpacing: 3, color: "#4a4035", textTransform: "uppercase" }}>Years on the Water</span>
                  </div>
                  <div style={{ height: 2, background: "rgba(197,160,100,0.12)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "83%", background: `linear-gradient(to right, ${GOLD}, rgba(197,160,100,0.5))`, borderRadius: 1 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 2, color: "#4a4035" }}>REFIT & BUILD SPECIALIST</span>
                    <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 9, letterSpacing: 2, color: "#4a4035" }}>IYBA MEMBER</span>
                  </div>
                </div>

                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.85, color: MUTED, marginBottom: 20 }}>
                  Born in the Republic of Panama to an American mother and a Panamanian-Italian father, Paolo grew up fishing the isthmus of Panama and the Canal. He attended Portsmouth Abbey School in Rhode Island, then built a yacht management company from the ground up — later transitioning into marina management with a specialty in refit and restomod design for sportfishing vessels.
                </p>
                <p style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.85, color: MUTED, marginBottom: 24 }}>
                  With over 25 years of hands-on experience working on and repairing vessels of all styles, Paolo brings unmatched technical depth to every transaction — a formidable advocate for buyers and sellers alike.
                </p>

                {/* Fun facts */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                  {[["🏠","Panama City, Panama"],["⛵","12' Zodiac"],["🎵","Reggae"],["🏈","3-Sport Varsity Athlete"]].map(([icon,fact]) => (
                    <span key={fact} style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 1, color: MUTED, padding: "4px 10px", border: "1px solid rgba(197,160,100,0.14)", borderRadius: 2 }}>{icon} {fact}</span>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <a href="mailto:PGA@DenisonYachting.com" className="btn-gold" style={{ fontSize: 10, padding: "10px 20px", flex: 1, textAlign: "center" }}>Email Paolo</a>
                  <a href="tel:7862512588" className="btn-ghost" style={{ fontSize: 10, padding: "10px 20px", flex: 1, textAlign: "center" }}>786.251.2588</a>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="sp" style={{ padding: "96px 40px", maxWidth: 780, margin: "0 auto" }}>
        <div style={{ marginBottom: 52, textAlign: "center" }}>
          <div className="label" style={{ marginBottom: 14 }}>Get in Touch</div>
          <h2 style={{ fontSize: 50, fontWeight: 300, fontStyle: "italic", lineHeight: 1.1 }}>
            Start a <span style={{ color: GOLD }}>Conversation</span>
          </h2>
          <p style={{ marginTop: 18, fontSize: 15, color: "#4a4035", fontWeight: 300, lineHeight: 1.8 }}>
            Whether you&apos;re looking to buy, sell, or simply explore what&apos;s available —<br />Will responds personally to every inquiry.
          </p>
        </div>
        {sent ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 44, color: GOLD, fontWeight: 300, letterSpacing: 4 }}>RECEIVED</div>
            <p style={{ marginTop: 14, color: MUTED, fontWeight: 300 }}>Will will be in touch shortly.</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 28 }}>
            <div className="frow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
              <div><div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Full Name *</div><input required className="input-field" placeholder="John Smith" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Email *</div><input required type="email" className="input-field" placeholder="john@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
            <div className="frow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
              <div><div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Phone</div><input className="input-field" placeholder="+1 (000) 000-0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><div className="label" style={{ fontSize: 9, marginBottom: 8 }}>I&apos;m Interested In</div>
                <select className="input-field" value={form.interest} onChange={e => setForm(p => ({ ...p, interest: e.target.value }))}>
                  <option value="">Select...</option>
                  <option>Buying a yacht</option><option>Selling a yacht</option><option>Both buying and selling</option><option>New construction / build</option><option>General inquiry</option>
                </select>
              </div>
            </div>
            <div><div className="label" style={{ fontSize: 9, marginBottom: 8 }}>Message</div><textarea className="input-field" rows={5} placeholder="Tell me about what you're looking for..." value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button type="submit" className="btn-gold" disabled={sending} style={{ padding: "14px 56px", fontSize: 12 }}>{sending ? "Sending…" : "Send Inquiry"}</button>
            </div>
          </form>
        )}
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: "1px solid rgba(197,160,100,0.1)", padding: "36px 40px" }}>
        <div className="footer-inner" style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, letterSpacing: 4, color: "#e8dcc8", fontWeight: 300, textTransform: "uppercase", marginBottom: 3 }}>The Yacht Cache</div>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase" }}>by Yachtslinger · Denison Yachting</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase", marginBottom: 3 }}>Will Noftsinger</div>
            <a href="mailto:WN@DenisonYachting.com" style={{ color: GOLD, textDecoration: "none", fontSize: 13, fontWeight: 300 }}>WN@DenisonYachting.com</a>
          </div>
          <div style={{ textAlign: "right" }}>
            <a href="tel:8504613342" style={{ fontFamily: "'Teko',sans-serif", fontSize: 18, color: GOLD, textDecoration: "none", letterSpacing: 2, display: "block" }}>850.461.3342</a>
            <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 2, color: "#4a4035", textTransform: "uppercase", marginTop: 3 }}>Fort Lauderdale, Florida</div>
          </div>
        </div>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="sticky-cta">
        <a href="tel:8504613342" className="btn-gold" style={{ flex: 1, fontSize: 11, padding: "13px 8px" }}>Call Will</a>
        <button className="btn-ghost" onClick={() => go("contact")} style={{ flex: 1, fontSize: 11, padding: "13px 8px" }}>Inquire</button>
      </div>

      {/* LISTING MODAL */}
      {selected && <ListingModal l={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
