"use client";
import { useState, useMemo, useEffect } from "react";
import { vesselToDraft, buildEmailFromDraft, DEFAULT_BROKERS, BANNERS, SUBJECTS, type Draft } from "@/lib/campaign/quickEmail";

const NAVY = "#0b1f3a", ORANGE = "#e57b2e", MUTE = "#64748b", LINE = "#e2e8f0";
const TYPES = [
  { id: "newlisting", label: "Just Listed" }, { id: "pricedrop", label: "Price Reduced" },
  { id: "sold", label: "Sold" }, { id: "newsletter", label: "Featured" }, { id: "openday", label: "Open House" },
];

async function post(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 11, letterSpacing: 1, color: MUTE, textTransform: "uppercase", marginBottom: 6, display: "block" };
const inp: React.CSSProperties = { width: "100%", padding: "9px 10px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13, boxSizing: "border-box", marginBottom: 8 };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" });

export default function NewCampaign() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [allImages, setAllImages] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [testEmail, setTestEmail] = useState("wn@denisonyachting.com");
  const [audience, setAudience] = useState<number | null>(null);
  const [sentInfo, setSentInfo] = useState<{ sentCount: number; sent: { email: string; sent_at: string }[] } | null>(null);
  const [showRecips, setShowRecips] = useState(false);
  const [wave, setWave] = useState(50);
  const [log, setLog] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const say = (m: string) => setLog(l => [new Date().toLocaleTimeString() + " — " + m, ...l].slice(0, 10));
  const up = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));
  useEffect(() => { fetch("/api/campaign/draft").then(r => r.json()).then(d => { if (d.ok) setDrafts(d.drafts); }).catch(() => {}); }, []);
  async function loadDrafts() { const d = await fetch("/api/campaign/draft").then(r => r.json()); if (d.ok) setDrafts(d.drafts); }
  async function saveDraft() {
    if (!draft) return;
    const name = prompt("Name this draft:", draft.headline) || draft.headline || "Untitled";
    setBusy("Saving draft…");
    const d = await post("/api/campaign/draft", { id: draftId, name, draft, allImages });
    if (d.ok) { setDraftId(d.id); say("Draft saved"); loadDrafts(); } else say("Save failed: " + (d.error || "?"));
    setBusy("");
  }
  async function loadDraft(id: number) {
    if (!id) return; setBusy("Loading draft…");
    const d = await fetch("/api/campaign/draft?id=" + id).then(r => r.json());
    if (d.ok) { setDraft(d.draft); setAllImages(d.allImages || []); setDraftId(d.id); say("Loaded: " + d.name); refreshAudience(d.draft.slug, d.draft.type); }
    setBusy("");
  }
  function addFeature() { if (draft) up({ features: [...draft.features, ""] }); }
  function setFeature(i: number, v: string) { if (!draft) return; const features = [...draft.features]; features[i] = v; up({ features }); }
  function delFeature(i: number) { if (draft) up({ features: draft.features.filter((_, j) => j !== i) }); }
  function toggle(k: "showDescription" | "showFeatures" | "showGallery" | "showSpecs") { if (draft) up({ [k]: draft[k] === false } as any); }

  async function loadListing() {
    if (!url.trim()) return;
    setBusy("Reading listing…"); setDraft(null); setAudience(null); setAllImages([]);
    try {
      const d = await post("/api/brochures/generate", { url: url.trim() });
      if (!d.ok) { say("Couldn't read that listing: " + (d.error || "?")); setBusy(""); return; }
      const dr = vesselToDraft({ ...d.vessel, images: d.vessel.images || [] }, "newlisting", d.slug);
      setDraft(dr); setAllImages(d.vessel.images || []); say("Loaded " + dr.headline + " (" + (d.vessel.images || []).length + " photos)");
      refreshAudience(d.slug, "newlisting");
    } catch (e: any) { say("Error: " + e.message); }
    setBusy("");
  }

  async function refreshAudience(slug: string, _type?: string) {
    const d = await fetch("/api/campaign/status?slug=" + encodeURIComponent(slug)).then(r => r.json()).catch(() => null);
    if (d && d.ok) { setAudience(d.remaining); setSentInfo({ sentCount: d.sentCount, sent: d.sent }); }
  }

  function setType(type: string) {
    if (!draft) return;
    up({ type, bannerText: BANNERS[type] || "FEATURED LISTING", subject: (SUBJECTS[type] || SUBJECTS.newsletter)(draft.headline, draft.price) });
    refreshAudience(draft.slug, type);
  }

  function setHero(src: string) { up({ heroUrl: src }); }
  function toggleGallery(src: string) {
    if (!draft) return;
    const has = draft.gallery.some(g => g.src === src);
    if (has) up({ gallery: draft.gallery.filter(g => g.src !== src) });
    else if (draft.gallery.length < 2) up({ gallery: [...draft.gallery, { src }] });
  }
  function toggleBroker(b: typeof DEFAULT_BROKERS[0]) {
    if (!draft) return;
    const has = draft.brokers.some(x => x.email === b.email);
    up({ brokers: has ? draft.brokers.filter(x => x.email !== b.email) : [...draft.brokers, b] });
  }
  function setSpec(i: number, which: 0 | 1, val: string) {
    if (!draft) return; const specs = draft.specs.map(s => [...s] as [string, string]); specs[i][which] = val; up({ specs });
  }
  function addButton() { if (draft) up({ buttons: [...draft.buttons, { label: "", url: "" }] }); }
  function setButton(i: number, k: "label" | "url", v: string) { if (!draft) return; const buttons = draft.buttons.map(b => ({ ...b })); buttons[i][k] = v; up({ buttons }); }
  function delButton(i: number) { if (draft) up({ buttons: draft.buttons.filter((_, j) => j !== i) }); }

  async function sendTest() { if (!draft) return; setBusy("Sending test…"); const d = await post("/api/campaign/quick", { draft, testTo: testEmail }); say(d.ok ? "Test sent to " + testEmail : "Test failed: " + (d.error || "?")); setBusy(""); }
  async function sendWave() {
    if (!draft || !audience) return;
    const n = Math.min(wave, audience);
    if (!confirm(`Send this to ${n} verified buyers now? This sends real email.`)) return;
    setBusy(`Sending to ${n}…`);
    const d = await post("/api/campaign/send-group", { slug: draft.slug, type: draft.type, group: "verified", limit: n, draft });
    if (d.ok) { say(`Sent ${d.sent}${d.failed ? ", " + d.failed + " failed" : ""}. ${d.remainingInGroup} remain.`); refreshAudience(draft.slug); }
    else say("Send failed: " + (d.error || "?"));
    setBusy("");
  }

  const previewHtml = useMemo(() => (draft ? buildEmailFromDraft(draft, "preview@denison.com").html : ""), [draft]);

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0, color: NAVY }}>Send a Listing Campaign</h1>
      <p style={{ color: MUTE, marginTop: 3, marginBottom: 12, fontSize: 13 }}>Paste a URL, edit everything, preview live, then send to verified buyers. No Vertical Response.</p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button style={btn("#f1f5f9", NAVY)} onClick={saveDraft} disabled={!draft || !!busy}>Save draft</button>
        <select style={{ ...inp, marginBottom: 0, width: 260 }} value={draftId || ""} onChange={e => loadDraft(parseInt(e.target.value))}>
          <option value="">Open a saved draft…</option>
          {drafts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {draftId && <span style={{ fontSize: 12, color: MUTE }}>editing saved draft</span>}
      </div>

      <div style={card}>
        <label style={lbl}>Paste a listing URL (any brokerage)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inp, marginBottom: 0 }} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
          <button style={btn(NAVY)} onClick={loadListing} disabled={!!busy}>Load</button>
        </div>
      </div>

      {draft && (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 380px", minWidth: 340 }}>
            <div style={card}>
              <label style={lbl}>Campaign type</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TYPES.map(t => <button key={t.id} onClick={() => setType(t.id)} style={btn(draft.type === t.id ? ORANGE : "#f1f5f9", draft.type === t.id ? "#fff" : "#334155")}>{t.label}</button>)}
              </div>
            </div>

            <div style={card}>
              <label style={lbl}>Subject line</label>
              <input style={inp} value={draft.subject} onChange={e => up({ subject: e.target.value })} />
              <label style={lbl}>Headline</label>
              <input style={inp} value={draft.headline} onChange={e => up({ headline: e.target.value })} />
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Price</label><input style={inp} value={draft.price} onChange={e => up({ price: e.target.value })} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>Location</label><input style={inp} value={draft.location} onChange={e => up({ location: e.target.value })} /></div>
              </div>
              <label style={lbl}>Spec line (under headline)</label>
              <input style={inp} value={draft.specLine} onChange={e => up({ specLine: e.target.value })} />
              <label style={lbl}>Selling points / description</label>
              <textarea style={{ ...inp, height: 110, resize: "vertical" }} value={draft.description} onChange={e => up({ description: e.target.value })} />
              <label style={lbl}>Banner text</label>
              <input style={inp} value={draft.bannerText} onChange={e => up({ bannerText: e.target.value })} />
            </div>

            <div style={card}>
              <label style={lbl}>Photos — click to set hero, ＋ to add to gallery (max 2)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {allImages.map(src => {
                  const isHero = draft.heroUrl === src; const inGal = draft.gallery.some(g => g.src === src);
                  return (
                    <div key={src} style={{ position: "relative", width: 78, height: 56 }}>
                      <img src={src} onClick={() => setHero(src)} style={{ width: 78, height: 56, objectFit: "cover", borderRadius: 5, cursor: "pointer", border: isHero ? `3px solid ${ORANGE}` : inGal ? `3px solid ${NAVY}` : `1px solid ${LINE}` }} alt="" />
                      <button onClick={() => toggleGallery(src)} style={{ position: "absolute", bottom: 2, right: 2, background: inGal ? NAVY : "rgba(0,0,0,.55)", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, width: 18, height: 18, cursor: "pointer", lineHeight: "16px" }}>{inGal ? "✓" : "+"}</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>Orange = hero · Navy = gallery</div>
              <label style={{ ...lbl, marginTop: 10 }}>Make the hero photo a link (optional)</label>
              <input style={inp} placeholder="https://… (defaults to the brochure page)" value={draft.heroLink || ""} onChange={e => up({ heroLink: e.target.value })} />
            </div>

            <div style={card}>
              <label style={lbl}>Key features (bulleted highlights)</label>
              {draft.features.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input style={{ ...inp, marginBottom: 0, flex: 1 }} placeholder="e.g. Beach club & swim platform" value={f} onChange={e => setFeature(i, e.target.value)} />
                  <button style={btn("#f1f5f9", "#991b1b")} onClick={() => delFeature(i)}>✕</button>
                </div>
              ))}
              <button style={btn("#f1f5f9", NAVY)} onClick={addFeature}>+ Add feature</button>
            </div>

            <div style={card}>
              <label style={lbl}>Show / hide sections</label>
              {(["showDescription", "showFeatures", "showGallery", "showSpecs"] as const).map(k => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 5 }}>
                  <input type="checkbox" checked={draft[k] !== false} onChange={() => toggle(k)} />
                  {k === "showDescription" ? "Description" : k === "showFeatures" ? "Key features" : k === "showGallery" ? "Gallery photos" : "Specifications"}
                </label>
              ))}
            </div>

            <div style={card}>
              <label style={lbl}>Extra buttons</label>
              {draft.buttons.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input style={{ ...inp, marginBottom: 0, flex: 1 }} placeholder="Button text" value={b.label} onChange={e => setButton(i, "label", e.target.value)} />
                  <input style={{ ...inp, marginBottom: 0, flex: 2 }} placeholder="https://…" value={b.url} onChange={e => setButton(i, "url", e.target.value)} />
                  <button style={btn("#f1f5f9", "#991b1b")} onClick={() => delButton(i)}>✕</button>
                </div>
              ))}
              <button style={btn("#f1f5f9", NAVY)} onClick={addButton}>+ Add button</button>
            </div>

            <div style={card}>
              <label style={lbl}>Brokers shown</label>
              {DEFAULT_BROKERS.map(b => (
                <label key={b.email} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <input type="checkbox" checked={draft.brokers.some(x => x.email === b.email)} onChange={() => toggleBroker(b)} />
                  {b.name} — {b.email}
                </label>
              ))}
            </div>

            <div style={card}>
              <label style={lbl}>1 · Send yourself a test</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input style={{ ...inp, marginBottom: 0 }} value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                <button style={btn(NAVY)} onClick={sendTest} disabled={!!busy}>Send test</button>
              </div>
              <label style={lbl}>2 · Send to verified buyers</label>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                Sent so far: <strong style={{ color: NAVY }}>{sentInfo ? sentInfo.sentCount : "…"}</strong>
                &nbsp;·&nbsp; Remaining: <strong style={{ color: NAVY }}>{audience == null ? "…" : audience}</strong>
              </div>
              {sentInfo && sentInfo.sentCount > 0 && (
                <div style={{ marginBottom: 8, fontSize: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <a href={"/api/campaign/status?format=csv&slug=" + encodeURIComponent(draft.slug)} style={{ color: ORANGE }}>Download who was sent (CSV)</a>
                  <button onClick={() => setShowRecips(v => !v)} style={{ ...btn("#f1f5f9", NAVY), padding: "5px 10px", fontSize: 12 }}>{showRecips ? "Hide" : "Show"} recipients</button>
                </div>
              )}
              {showRecips && sentInfo && (
                <div style={{ maxHeight: 150, overflowY: "auto", background: "#f8fafc", borderRadius: 6, padding: 8, fontSize: 12, color: "#475569", marginBottom: 8 }}>
                  {sentInfo.sent.length === 0 ? <div style={{ color: MUTE }}>No one yet.</div> : sentInfo.sent.map((s, i) => <div key={i}>{i + 1}. {s.email} <span style={{ color: MUTE }}>· {s.sent_at}</span></div>)}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: MUTE }}>Wave</span>
                <input type="number" min={1} style={{ ...inp, marginBottom: 0, width: 90 }} value={wave} onChange={e => setWave(parseInt(e.target.value) || 0)} />
                <button style={btn(ORANGE)} onClick={sendWave} disabled={!!busy || !audience}>Send wave</button>
              </div>
              <p style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Start at 50, check bounces in Resend, then raise. Suppressed / unsubscribed / already-sent are skipped automatically.</p>
            </div>
          </div>

          <div style={{ flex: "1 1 420px", minWidth: 360, position: "sticky", top: 12 }}>
            <label style={lbl}>Live preview</label>
            <iframe title="preview" srcDoc={previewHtml} style={{ width: "100%", height: 760, border: `1px solid ${LINE}`, borderRadius: 8, background: "#eef2f6" }} />
          </div>
        </div>
      )}

      {busy && <div style={{ color: ORANGE, fontSize: 13, marginTop: 10 }}>{busy}</div>}
      {log.length > 0 && <div style={{ ...card, background: "#f8fafc", marginTop: 12 }}>{log.map((l, i) => <div key={i} style={{ fontSize: 12, color: "#475569" }}>{l}</div>)}</div>}
    </div>
  );
}
