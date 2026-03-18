"use client";
// src/app/brochures/[slug]/BrochureActionBar.tsx
// Floating bar on the brochure viewer — back, copy link, download PDF, send

import React from "react";
import { useRouter } from "next/navigation";

export function BrochureActionBar({ slug, vesselName }: { slug: string; vesselName: string }) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [sendEmail, setSendEmail] = React.useState("");
  const [sendNote, setSendNote] = React.useState("");
  const [sendResult, setSendResult] = React.useState<"ok" | "err" | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  function copyLink() {
    const link = window.location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => flash()).catch(() => fallback(link));
    } else {
      fallback(link);
    }
  }
  function fallback(link: string) {
    const el = document.createElement("textarea");
    el.value = link;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand("copy"); } catch { window.prompt("Copy link:", link); }
    document.body.removeChild(el);
    flash();
  }
  function flash() { setCopied(true); setTimeout(() => setCopied(false), 2500); }

  async function sendLink() {
    if (!sendEmail.trim()) return;
    setSending(true); setSendResult(null);
    const link = window.location.href;
    const pdfLink = `${window.location.origin}/api/brochures/pdf?slug=${slug}`;
    const subject = `E-Brochure: ${vesselName}`;
    const bodyHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <p style="font-size:16px;">Please find the e-brochure for <strong>${vesselName}</strong> below.</p>
        ${sendNote ? `<p style="font-size:14px;color:#555;">${sendNote}</p>` : ""}
        <p style="margin:24px 0;">
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#1a2b4a;color:#fff;text-decoration:none;font-weight:bold;border-radius:4px;">View E-Brochure →</a>
        </p>
        <p style="font-size:13px;color:#888;">
          <a href="${pdfLink}" style="color:#b8933a;">Download PDF version</a>
        </p>
        <p style="font-size:12px;color:#aaa;margin-top:32px;">Will Noftsinger · Yacht Broker · Denison Yachting<br/>WN@DenisonYachting.com · 850.461.3342</p>
      </div>`;
    try {
      const res = await fetch("/api/campaign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          html: bodyHtml,
          recipients: [{ email: sendEmail.trim() }],
          testMode: false,
        }),
      });
      const d = await res.json();
      setSendResult(d.ok ? "ok" : "err");
      if (d.ok) { setSendEmail(""); setSendNote(""); setTimeout(() => { setSendOpen(false); setSendResult(null); }, 2000); }
    } catch { setSendResult("err"); }
    setSending(false);
  }

  return (
    <>
      {/* Floating bar */}
      <div style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, display: "flex", alignItems: "center", gap: 8,
        background: "rgba(2,12,27,0.92)", backdropFilter: "blur(10px)",
        border: "1px solid rgba(184,147,58,0.35)", borderRadius: 40,
        padding: collapsed ? "8px 14px" : "8px 16px",
        boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
        transition: "all 0.2s",
      }}>
        {collapsed ? (
          <button onClick={() => setCollapsed(false)} style={btnStyle("#b8933a")}>☰</button>
        ) : (
          <>
            <button
              onClick={() => {
                // history.back() is unreliable for direct links — always go to brochures list
                if (document.referrer && new URL(document.referrer).hostname === window.location.hostname) {
                  router.back();
                } else {
                  router.push("/brochures");
                }
              }}
              style={btnStyle("#94a3b8")} title="Back to E-Brochures">
              ← Back
            </button>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,.15)" }} />
            <button onClick={copyLink} style={btnStyle(copied ? "#22c55e" : "#b8933a")} title="Copy link to clipboard">
              {copied ? "✓ Copied" : "🔗 Copy Link"}
            </button>
            <a href={`/api/brochures/pdf?slug=${slug}`} target="_blank" rel="noopener noreferrer"
              style={{ ...btnStyle("#94a3b8"), textDecoration: "none" }} title="Download PDF">
              ⬇ PDF
            </a>
            <button onClick={() => setSendOpen(true)} style={btnStyle("#0ea5e9")} title="Send brochure link">
              ✉ Send
            </button>
            <button onClick={() => setCollapsed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", fontSize: 12, padding: "2px 0 2px 4px", lineHeight: 1 }} title="Collapse">▲</button>
          </>
        )}
      </div>

      {/* Send overlay */}
      {sendOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setSendOpen(false); }}>
          <div style={{ background: "#0a1628", border: "1px solid rgba(184,147,58,0.4)", borderRadius: 16, padding: "28px 32px", width: "min(480px,92vw)", boxShadow: "0 8px 48px rgba(0,0,0,0.7)" }}>
            <div style={{ fontFamily: "serif", fontSize: 20, color: "#fff", marginBottom: 4 }}>Send E-Brochure</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>{vesselName}</div>
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#b8933a", marginBottom: 6 }}>Recipient Email</label>
            <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="client@example.com"
              style={{ width: "100%", boxSizing: "border-box", background: "#0f1f36", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, marginBottom: 14, outline: "none" }}
              onKeyDown={e => e.key === "Enter" && sendLink()} />
            <label style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#b8933a", marginBottom: 6 }}>Personal Note (optional)</label>
            <textarea value={sendNote} onChange={e => setSendNote(e.target.value)} rows={2} placeholder="Looking forward to discussing this opportunity..."
              style={{ width: "100%", boxSizing: "border-box", background: "#0f1f36", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, resize: "none", marginBottom: 20, outline: "none", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setSendOpen(false)} style={{ ...btnStyle("#475569"), padding: "10px 20px" }}>Cancel</button>
              <button onClick={sendLink} disabled={sending || !sendEmail.trim()} style={{ ...btnStyle("#0ea5e9"), padding: "10px 24px", opacity: sending || !sendEmail.trim() ? 0.5 : 1 }}>
                {sending ? "Sending…" : sendResult === "ok" ? "✓ Sent!" : sendResult === "err" ? "Failed — retry" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: "none", border: "none", cursor: "pointer",
    color, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
    padding: "6px 10px", borderRadius: 20, whiteSpace: "nowrap",
    transition: "opacity 0.15s",
  };
}
