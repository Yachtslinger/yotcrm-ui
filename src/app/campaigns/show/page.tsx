"use client";
import { useState, useMemo } from "react";
import { createShowDraft, buildEmailFromDraft, DEFAULT_BROKERS, type Draft } from "@/lib/campaign/quickEmail";

const NAVY = "#0b1f3a", ORANGE = "#e57b2e", MUTE = "#64748b", LINE = "#e2e8f0";

async function post(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
function slugify(s: string) {
  return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
}

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, marginBottom: 14 };
const lbl: React.CSSProperties = { fontSize: 11, letterSpacing: 1, color: MUTE, textTransform: "uppercase", marginBottom: 6, display: "block" };
const inp: React.CSSProperties = { width: "100%", padding: "9px 10px", border: `1px solid ${LINE}`, borderRadius: 7, fontSize: 13, boxSizing: "border-box", marginBottom: 8 };
const btn = (bg: string, fg = "#fff"): React.CSSProperties => ({ background: bg, color: fg, border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" });

// Major international shows (official sites) — the ones worth blasting, not tiny regionals.
const MAJOR_SHOWS: { name: string; url: string }[] = [
  { name: "Cannes Yachting Festival", url: "https://www.cannesyachtingfestival.com/" },
  { name: "Monaco Yacht Show", url: "https://www.monacoyachtshow.com/" },
  { name: "Fort Lauderdale International Boat Show", url: "https://www.flibs.com/" },
  { name: "Palm Beach International Boat Show", url: "https://www.pbboatshow.com/" },
  { name: "Miami International Boat Show", url: "https://www.miamiboatshow.com/" },
  { name: "Genoa International Boat Show", url: "https://www.salonenautico.com/en/" },
  { name: "boot Düsseldorf", url: "https://www.boot.com/" },
  { name: "Newport International Boat Show", url: "https://www.newportboatshow.com/" },
  { name: "Dubai International Boat Show", url: "https://www.boatshowdubai.com/" },
  { name: "Singapore Yacht Show", url: "https://www.singaporeyachtshow.com/" },
];

export default function NewShowCampaign() {
  const [draft, setDraft] = useState<Draft>(() => createShowDraft());
  const [busy, setBusy] = useState("");
  const [testEmail, setTestEmail] = useState("wn@denisonyachting.com");
  const [audience, setAudience] = useState<number | null>(null);
  const [wave, setWave] = useState(50);
  const [showUrl, setShowUrl] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const say = (m: string) => setLog(l => [new Date().toLocaleTimeString() + " — " + m, ...l].slice(0, 10));

  const up = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }));
  const upShow = (patch: Partial<NonNullable<Draft["show"]>>) => setDraft(d => ({ ...d, show: { ...(d.show as any), ...patch } }));
  const s = draft.show!;

  function setName(name: string) {
    setDraft(d => ({
      ...d,
      slug: d.slug && d.slug.length ? d.slug : slugify(name),
      subject: (!d.subject || d.subject === "You're invited — join us at the show") ? `You're invited — join us at the ${name}` : d.subject,
      show: { ...(d.show as any), name },
    }));
  }

  const feats = s.featured || [];
  function addFeat() { upShow({ featured: [...feats, { label: "", url: "" }] }); }
  function setFeat(i: number, k: "label" | "url", v: string) { const f = feats.map(x => ({ ...x })); (f[i] as any)[k] = v; upShow({ featured: f }); }
  function delFeat(i: number) { upShow({ featured: feats.filter((_, j) => j !== i) }); }
  function toggleBroker(b: typeof DEFAULT_BROKERS[0]) {
    const has = draft.brokers.some(x => x.email === b.email);
    up({ brokers: has ? draft.brokers.filter(x => x.email !== b.email) : [...draft.brokers, b] });
  }

  async function refreshAudience() {
    const slug = draft.slug || slugify(s.name);
    if (!slug) { say("Add a show name / slug first"); return; }
    const d = await post("/api/campaign/send-group", { slug, type: "boatshow", group: "verified", draft: { ...draft, slug }, dryRun: true });
    if (d.ok) { setAudience(d.remainingInGroup); say(`${d.remainingInGroup} verified buyers eligible for this invite`); }
    else say("Audience check failed: " + (d.error || "?"));
  }
  async function autofill() {
    const u = showUrl.trim();
    if (!u) { say("Pick a show or paste its website URL first"); return; }
    setBusy("Reading show website…");
    try {
      const d = await post("/api/campaign/scrape-show-info", { url: u });
      if (!d || d.ok === false) { say("Couldn't read that page: " + (d?.error || "?")); setBusy(""); return; }
      const patch: any = {};
      if (d.name) patch.name = d.name;
      if (d.dates) patch.dates = d.dates;
      if (d.hours) patch.hours = d.hours;
      if (d.tagline) patch.tagline = d.tagline;
      if (d.about) patch.about = d.about;
      if (Array.isArray(d.highlights) && d.highlights.length) patch.highlights = d.highlights;
      if (d.officialUrl) patch.showUrl = d.officialUrl;
      const venueBits = [d.venue, d.city, d.country].filter(Boolean).join(", ");
      if (venueBits) patch.venue = venueBits;
      setDraft(dr => {
        const nextName = patch.name || dr.show!.name;
        return {
          ...dr,
          heroUrl: dr.heroUrl || d.image || "",
          slug: dr.slug && dr.slug.length ? dr.slug : slugify(nextName),
          subject: ((!dr.subject || dr.subject === "You're invited — join us at the show") && nextName) ? `You're invited — join us at the ${nextName}` : dr.subject,
          linkUrl: dr.linkUrl || d.officialUrl || u,
          show: { ...(dr.show as any), ...patch },
        };
      });
      const got = ["name", "dates", "hours", "venue", "about", "highlights", "image"].filter(k => { const v = (d as any)[k]; return Array.isArray(v) ? v.length : v; }).join(", ");
      say(got ? `Auto-filled (${d._source}): ${got}. Review before sending.` : "Read the page but couldn't find show details — fill them in manually.");
    } catch (e: any) { say("Error: " + e.message); }
    setBusy("");
  }
  async function sendTest() {
    setBusy("Sending test…");
    const d = await post("/api/campaign/quick", { draft, testTo: testEmail });
    say(d.ok ? "Test sent to " + testEmail : "Test failed: " + (d.error || "?"));
    setBusy("");
  }
  async function sendWave() {
    const slug = draft.slug || slugify(s.name);
    if (!slug) { say("Add a show name / slug first"); return; }
    if (audience == null) { await refreshAudience(); return; }
    const n = Math.min(wave, audience);
    if (n < 1) { say("No eligible recipients"); return; }
    if (!confirm(`Send this invite to ${n} verified buyers now? This sends real email.`)) return;
    setBusy(`Sending to ${n}…`);
    const d = await post("/api/campaign/send-group", { slug, type: "boatshow", group: "verified", limit: n, draft: { ...draft, slug } });
    if (d.ok) { say(`Sent ${d.sent}${d.failed ? ", " + d.failed + " failed" : ""}. ${d.remainingInGroup} remain.`); setAudience(d.remainingInGroup); }
    else say("Send failed: " + (d.error || "?"));
    setBusy("");
  }

  const previewHtml = useMemo(() => buildEmailFromDraft(draft, "preview@denison.com").html, [draft]);

  return (
    <div style={{ padding: "20px", fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <h1 style={{ fontSize: 22, margin: 0, color: NAVY }}>Boat Show Invitation</h1>
      <p style={{ color: MUTE, marginTop: 3, marginBottom: 12, fontSize: 13 }}>
        Fill in the show details, preview live, send yourself a test, then send a warm-up wave to verified buyers.
        Unsubscribes, event opt-outs, and already-sent are skipped automatically. <a href="/campaigns/new" style={{ color: ORANGE }}>Listing campaign →</a>
      </p>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", minWidth: 340 }}>
          <div style={{ ...card, borderColor: ORANGE }}>
            <label style={lbl}>Auto-fill from the show website</label>
            <select style={inp} value="" onChange={e => { if (e.target.value) setShowUrl(e.target.value); }}>
              <option value="">Pick a major show…</option>
              {MAJOR_SHOWS.map(m => <option key={m.url} value={m.url}>{m.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...inp, marginBottom: 0 }} placeholder="https://www.monacoyachtshow.com" value={showUrl} onChange={e => setShowUrl(e.target.value)} />
              <button style={btn(ORANGE)} onClick={autofill} disabled={!!busy}>Auto-fill</button>
            </div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>Pulls the show name, dates, hours, venue &amp; city. Always review before sending — your edits win.</div>
          </div>
          <div style={card}>
            <label style={lbl}>Show name</label>
            <input style={inp} placeholder="Fort Lauderdale International Boat Show 2026" value={s.name} onChange={e => setName(e.target.value)} />
            <label style={lbl}>Tagline (optional)</label>
            <input style={inp} placeholder="The largest in-water boat show in the world" value={s.tagline || ""} onChange={e => upShow({ tagline: e.target.value })} />
            <label style={lbl}>Banner / eyebrow text</label>
            <input style={inp} value={s.eyebrow || ""} onChange={e => upShow({ eyebrow: e.target.value })} />
            <label style={lbl}>Subject line</label>
            <input style={inp} value={draft.subject} onChange={e => up({ subject: e.target.value })} />
            <label style={lbl}>Slug (used to track who was sent — keep unique per show)</label>
            <input style={inp} value={draft.slug} onChange={e => up({ slug: slugify(e.target.value) })} placeholder="flibs-2026" />
          </div>

          <div style={card}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Dates</label><input style={inp} placeholder="October 28 – November 1, 2026" value={s.dates} onChange={e => upShow({ dates: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Hours (optional)</label><input style={inp} placeholder="10 AM – 7 PM daily" value={s.hours || ""} onChange={e => upShow({ hours: e.target.value })} /></div>
            </div>
            <label style={lbl}>Venue</label>
            <input style={inp} placeholder="Bahia Mar Yachting Center, Fort Lauderdale, FL" value={s.venue} onChange={e => upShow({ venue: e.target.value })} />
            <label style={lbl}>Where to find you (booth / slip)</label>
            <input style={inp} placeholder="Superyacht Village — Slip 812" value={s.ourLocation || ""} onChange={e => upShow({ ourLocation: e.target.value })} />
          </div>

          <div style={card}>
            <label style={lbl}>Hero image URL</label>
            <input style={inp} placeholder="https://…/show-photo.jpg" value={draft.heroUrl} onChange={e => up({ heroUrl: e.target.value })} />
            <label style={lbl}>Hero click-through (optional)</label>
            <input style={inp} placeholder="https://www.denisonyachting.com/…" value={draft.linkUrl || ""} onChange={e => up({ linkUrl: e.target.value })} />
            <label style={lbl}>RSVP link (optional — a scheduler URL; leave blank to use built-in RSVP)</label>
            <input style={inp} placeholder="https://calendly.com/…" value={s.rsvpUrl || ""} onChange={e => upShow({ rsvpUrl: e.target.value })} />
          </div>

          <div style={card}>
            <label style={lbl}>Personal note (optional — your own line)</label>
            <textarea style={{ ...inp, height: 90, resize: "vertical" }} placeholder="If you've been circling the 80–110' range, this is the one week you can see them side by side…" value={s.personalNote || ""} onChange={e => upShow({ personalNote: e.target.value })} />
          </div>

          <div style={card}>
            <label style={lbl}>About the show (auto-filled — editable)</label>
            <textarea style={{ ...inp, height: 70, resize: "vertical" }} placeholder="A short description of the show…" value={s.about || ""} onChange={e => upShow({ about: e.target.value })} />
            <label style={lbl}>Show highlights (one per line — auto-filled)</label>
            <textarea style={{ ...inp, height: 82, resize: "vertical" }} placeholder={"560+ boats on display\nDedicated superyacht area"} value={(s.highlights || []).join("\n")} onChange={e => upShow({ highlights: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) })} />
            <label style={lbl}>Show website link (optional)</label>
            <input style={inp} placeholder="https://www.monacoyachtshow.com" value={s.showUrl || ""} onChange={e => upShow({ showUrl: e.target.value })} />
          </div>

          <div style={card}>
            <label style={lbl}>Yachts on display (optional)</label>
            {feats.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input style={{ ...inp, marginBottom: 0, flex: 2 }} placeholder="M/Y Serenity — 112' Westport" value={f.label} onChange={e => setFeat(i, "label", e.target.value)} />
                <input style={{ ...inp, marginBottom: 0, flex: 2 }} placeholder="https://… (optional)" value={f.url || ""} onChange={e => setFeat(i, "url", e.target.value)} />
                <button style={btn("#f1f5f9", "#991b1b")} onClick={() => delFeat(i)}>✕</button>
              </div>
            ))}
            <button style={btn("#f1f5f9", NAVY)} onClick={addFeat}>+ Add yacht</button>
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
              Eligible now: <strong style={{ color: NAVY }}>{audience == null ? "—" : audience}</strong>
              &nbsp; <button onClick={refreshAudience} style={{ ...btn("#f1f5f9", NAVY), padding: "4px 10px", fontSize: 12 }}>Check audience</button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: MUTE }}>Wave</span>
              <input type="number" min={1} style={{ ...inp, marginBottom: 0, width: 90 }} value={wave} onChange={e => setWave(parseInt(e.target.value) || 0)} />
              <button style={btn(ORANGE)} onClick={sendWave} disabled={!!busy}>Send wave</button>
            </div>
            <p style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Start at 50, watch bounces in Resend, then raise. Suppressed / event-opt-out / already-sent are skipped.</p>
          </div>
        </div>

        <div style={{ flex: "1 1 420px", minWidth: 360, position: "sticky", top: 12 }}>
          <label style={lbl}>Live preview</label>
          <iframe title="preview" srcDoc={previewHtml} style={{ width: "100%", height: 760, border: `1px solid ${LINE}`, borderRadius: 8, background: "#eef2f6" }} />
        </div>
      </div>

      {busy && <div style={{ color: ORANGE, fontSize: 13, marginTop: 10 }}>{busy}</div>}
      {log.length > 0 && <div style={{ ...card, background: "#f8fafc", marginTop: 12 }}>{log.map((l, i) => <div key={i} style={{ fontSize: 12, color: "#475569" }}>{l}</div>)}</div>}
    </div>
  );
}
