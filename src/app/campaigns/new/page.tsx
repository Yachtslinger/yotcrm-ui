"use client";
import { useState } from "react";

const NAVY = "#0b1f3a", ORANGE = "#e57b2e", MUTE = "#64748b", LINE = "#e2e8f0";
const TYPES = [
  { id: "newlisting", label: "Just Listed" },
  { id: "pricedrop", label: "Price Reduced" },
  { id: "sold", label: "Sold" },
  { id: "newsletter", label: "Featured" },
  { id: "openday", label: "Open House" },
];

async function post(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

const box: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 20, marginBottom: 18 };
const label: React.CSSProperties = { fontSize: 12, letterSpacing: 1, color: MUTE, textTransform: "uppercase", marginBottom: 8, display: "block" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const btn = (bg: string): React.CSSProperties => ({ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" });

export default function NewCampaign() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [slug, setSlug] = useState("");
  const [vessel, setVessel] = useState<any>(null);
  const [type, setType] = useState("newlisting");
  const [testEmail, setTestEmail] = useState("wn@denisonyachting.com");
  const [audience, setAudience] = useState<number | null>(null);
  const [wave, setWave] = useState(50);
  const [log, setLog] = useState<string[]>([]);
  const say = (m: string) => setLog(l => [new Date().toLocaleTimeString() + " — " + m, ...l].slice(0, 12));

  async function loadListing() {
    if (!url.trim()) return;
    setBusy("Scraping listing…"); setVessel(null); setSlug(""); setAudience(null);
    try {
      const d = await post("/api/brochures/generate", { url: url.trim() });
      if (!d.ok) { say("Could not read that listing: " + (d.error || "unknown")); setBusy(""); return; }
      setSlug(d.slug); setVessel(d.vessel); say("Loaded " + d.vessel.name);
      refreshAudience(d.slug);
    } catch (e: any) { say("Error: " + e.message); }
    setBusy("");
  }

  async function refreshAudience(s = slug) {
    if (!s) return;
    const d = await post("/api/campaign/send-group", { slug: s, type, group: "verified", dryRun: true });
    if (d.ok) setAudience(d.remainingInGroup);
  }

  async function sendTest() {
    if (!slug) return;
    setBusy("Sending test…");
    const d = await post("/api/campaign/quick", { slug, type, testTo: testEmail });
    say(d.ok ? "Test sent to " + testEmail : "Test failed: " + (d.error || "?"));
    setBusy("");
  }

  async function sendWave() {
    if (!slug || !audience) return;
    const n = Math.min(wave, audience);
    if (!confirm(`Send this ${TYPES.find(t => t.id === type)?.label} email to ${n} verified buyers now? This sends real email.`)) return;
    setBusy(`Sending to ${n} buyers…`);
    const d = await post("/api/campaign/send-group", { slug, type, group: "verified", limit: n });
    if (d.ok) { say(`Sent ${d.sent}${d.failed ? ", " + d.failed + " failed" : ""}. ${d.remainingInGroup} verified buyers remain.`); setAudience(d.remainingInGroup); }
    else say("Send failed: " + (d.error || "?"));
    setBusy("");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <h1 style={{ fontSize: 24, margin: 0, color: NAVY }}>Send a Listing Campaign</h1>
      <p style={{ color: MUTE, marginTop: 4, marginBottom: 22, fontSize: 14 }}>Your own system — sends via Resend to verified buyers. No Vertical Response.</p>

      <div style={box}>
        <label style={label}>1 · Paste a listing URL (any brokerage)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={input} placeholder="https://www.denisonyachtsales.com/yachts-for-sale/…" value={url} onChange={e => setUrl(e.target.value)} />
          <button style={btn(NAVY)} onClick={loadListing} disabled={!!busy}>Load</button>
        </div>
      </div>

      {vessel && (
        <div style={{ ...box, display: "flex", gap: 14, alignItems: "center" }}>
          {vessel.images?.[0]?.src || (vessel.imageCount ? true : false) ? (
            <img src={(vessel.images && vessel.images[0]?.src) || `/brochures/${slug}`} alt="" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, background: "#eef2f6" }} onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
          ) : null}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: NAVY }}>{vessel.name}</div>
            <div style={{ color: MUTE, fontSize: 13 }}>{[vessel.loa, vessel.builder, vessel.year].filter(Boolean).join(" · ")}</div>
            <a href={`/brochures/${slug}`} target="_blank" rel="noreferrer" style={{ color: ORANGE, fontSize: 13 }}>View brochure page →</a>
          </div>
        </div>
      )}

      {slug && (
        <>
          <div style={box}>
            <label style={label}>2 · Campaign type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TYPES.map(t => (
                <button key={t.id} onClick={() => { setType(t.id); }} style={{ ...btn(type === t.id ? ORANGE : "#f1f5f9"), color: type === t.id ? "#fff" : "#334155" }}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={box}>
            <label style={label}>3 · Send yourself a test first</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={input} value={testEmail} onChange={e => setTestEmail(e.target.value)} />
              <button style={btn(NAVY)} onClick={sendTest} disabled={!!busy}>Send test</button>
            </div>
          </div>

          <div style={{ ...box, borderColor: ORANGE }}>
            <label style={label}>4 · Send to verified buyers</label>
            <div style={{ fontSize: 15, marginBottom: 12 }}>
              Verified buyers eligible for this listing: <strong style={{ color: NAVY }}>{audience == null ? "…" : audience}</strong>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: MUTE }}>Wave size</span>
              <input type="number" min={1} style={{ ...input, width: 100 }} value={wave} onChange={e => setWave(parseInt(e.target.value) || 0)} />
              <button style={btn(ORANGE)} onClick={sendWave} disabled={!!busy || !audience}>Send wave</button>
            </div>
            <p style={{ fontSize: 12, color: MUTE, marginTop: 10 }}>Warm-up tip: start at 50, wait a day, check bounces in Resend, then raise the wave size. Already-sent, unsubscribed, and bounced addresses are skipped automatically.</p>
          </div>
        </>
      )}

      {busy && <div style={{ color: ORANGE, fontSize: 14, marginBottom: 12 }}>{busy}</div>}
      {log.length > 0 && (
        <div style={{ ...box, background: "#f8fafc" }}>
          <label style={label}>Activity</label>
          {log.map((l, i) => <div key={i} style={{ fontSize: 12, color: "#475569", padding: "2px 0" }}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
