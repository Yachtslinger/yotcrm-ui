"use client";
import React from "react";

const BASE = "https://yotcrm-production.up.railway.app";

const code = `javascript:(function(){const B="${BASE}";const o=document.createElement("div");o.style.cssText="position:fixed;top:20px;right:20px;z-index:999999;background:#0f1b2d;color:#d4af60;font:600 14px/1 system-ui;padding:14px 20px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.5);border:1px solid rgba(212,175,96,.4);min-width:220px;text-align:center";o.textContent="\\u2693 YotCRM \\u2014 Reading page\\u2026";document.body.appendChild(o);let rs=null;try{rs=window.__REDUX_STATE__||null}catch(_){}const jl=[];document.querySelectorAll('script[type="application/ld+json"]').forEach(e=>{try{const p=JSON.parse(e.textContent||"");(Array.isArray(p)?p:p["@graph"]?p["@graph"]:[p]).forEach(n=>n&&jl.push(n))}catch(_){}});const mt={};document.querySelectorAll("meta[property],meta[name]").forEach(e=>{const k=e.getAttribute("property")||e.getAttribute("name")||"";const v=e.getAttribute("content")||"";if(k&&v)mt[k]=v});const imgs=[];document.querySelectorAll("img[src]").forEach(i=>{const s=i.src||"";if(s.startsWith("http")&&i.naturalWidth>200&&!/logo|icon|sprite|avatar|favicon/i.test(s))imgs.push(s)});o.textContent="\\u2693 YotCRM \\u2014 Sending\\u2026";fetch(B+"/api/brochures/ingest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pageUrl:location.href,reduxState:rs,metaTags:mt,jsonLd:jl,images:imgs.slice(0,50),title:document.title})}).then(r=>r.json()).then(d=>{if(!d.ok||!d.vessel)throw new Error(d.error||"Failed");sessionStorage.setItem("__yotcrm_ingest",JSON.stringify(d.vessel));o.textContent="\\u2705 Opening editor\\u2026";setTimeout(()=>{o.remove();window.open(B+"/brochures?ingest=1","_blank")},600)}).catch(e=>{o.textContent="\\u274c "+(e.message||"Error");setTimeout(()=>o.remove(),4000)})})();`;

export default function BookmarkletPage() {
  const [copied, setCopied] = React.useState(false);

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a1628",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#0f1b2d", border: "1px solid rgba(212,175,96,.3)",
        borderRadius: 20, padding: 40, maxWidth: 560, width: "100%", textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚓</div>
        <h1 style={{ color: "#d4af60", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          YotCRM Bookmarklet
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 36 }}>
          One click → branded brochure from any listing page
        </p>

        {/* Draggable bookmark link */}
        <a
          href={code}
          onClick={e => e.preventDefault()}
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #d4af60, #b8943a)",
            color: "#0a1628", fontSize: 17, fontWeight: 800,
            padding: "18px 28px", borderRadius: 14, textDecoration: "none",
            cursor: "grab", boxShadow: "0 4px 20px rgba(212,175,96,.4)",
            userSelect: "none", marginBottom: 12,
          }}
        >
          ⚓ YotCRM — drag me to your bookmarks bar
        </a>

        <p style={{ color: "#475569", fontSize: 12, marginBottom: 28 }}>
          Can't drag it? &nbsp;
          <button onClick={copyCode} style={{
            background: "none", border: "none", color: "#d4af60",
            cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0,
          }}>
            {copied ? "✅ Copied!" : "Copy the code instead"}
          </button>
        </p>

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.06)", margin: "0 0 24px" }} />

        {/* Steps */}
        {[
          ["1", "Show your bookmarks bar", "Safari → View → Show Favorites Bar (if hidden)"],
          ["2", "Drag the gold button above", "Drag it up to your bookmarks bar and drop it there"],
          ["3", "Go to any listing", "YachtWorld, Boat International, Superyacht Times, Denison…"],
          ["4", "Click ⚓ YotCRM", "Brochure editor opens pre-filled — publish and send the link"],
        ].map(([num, title, detail]) => (
          <div key={num} style={{ display: "flex", gap: 12, textAlign: "left", marginBottom: 14 }}>
            <div style={{
              background: "rgba(212,175,96,.15)", color: "#d4af60", fontWeight: 700,
              width: 28, height: 28, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13,
            }}>{num}</div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ color: "#cbd5e1", fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{detail}</div>
            </div>
          </div>
        ))}

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.06)", margin: "20px 0 16px" }} />
        <p style={{ color: "#475569", fontSize: 12 }}>
          If you copied the code: create a new bookmark manually, paste it as the URL, name it{" "}
          <span style={{ color: "#d4af60" }}>⚓ YotCRM</span>
        </p>
      </div>
    </div>
  );
}
