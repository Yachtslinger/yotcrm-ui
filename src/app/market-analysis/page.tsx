"use client";
import React from "react";
import { Upload, BarChart2, FileText, Trash2, ExternalLink, Plus, RefreshCw } from "lucide-react";
import PageShell from "../components/PageShell";

type CompRecord = {
  name: string; make: string; model: string; year: string; length: string;
  listedPrice: number | null; soldPrice: number | null; askPrice: number | null;
  listedDate: string; soldDate: string; daysOnMarket: number | null;
  location: string; source: string;
};

type SavedAnalysis = {
  id: number; title: string; subject_vessel: string; subject_year: string;
  subject_make: string; subject_model: string; subject_asking_price: string;
  created_at: string; updated_at: string;
};

type Step = "list" | "setup" | "upload" | "review" | "generating" | "done";

const SOURCES = [
  { key: "sold_comps", label: "Direct Sold Comps", desc: "Same make/model, recently sold — e.g. Westport 112 solds", color: "#22c55e" },
  { key: "active_comps", label: "Direct Active Listings", desc: "Same make/model, currently for sale — e.g. Westport 112 for sale", color: "#3b82f6" },
  { key: "broad_sold", label: "Broader Sold Market", desc: "Similar size/era, different makes — competing segment solds", color: "#f59e0b" },
  { key: "broad_active", label: "Broader Active Market", desc: "Similar size/era, different makes — competing segment active", color: "#8b5cf6" },
];

export default function MarketAnalysisPage() {
  const [step, setStep] = React.useState<Step>("list");
  const [analyses, setAnalyses] = React.useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState<{msg:string;type:"success"|"error"}|null>(null);

  // Subject vessel fields
  const [subjectVessel, setSubjectVessel] = React.useState("");
  const [subjectYear, setSubjectYear] = React.useState("");
  const [subjectMake, setSubjectMake] = React.useState("");
  const [subjectModel, setSubjectModel] = React.useState("");
  const [subjectLength, setSubjectLength] = React.useState("");
  const [subjectAskingPrice, setSubjectAskingPrice] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Comp data per category
  const [comps, setComps] = React.useState<Record<string, CompRecord[]>>({
    sold_comps: [], active_comps: [], broad_sold: [], broad_active: []
  });
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [genStatus, setGenStatus] = React.useState("");
  const [savedId, setSavedId] = React.useState<number | null>(null);

  const fileRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  function showToast(msg: string, type: "success"|"error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadAnalyses() {
    setLoading(true);
    try {
      const r = await fetch("/api/market-analysis");
      const d = await r.json();
      if (d.ok) setAnalyses(d.analyses);
    } finally { setLoading(false); }
  }

  React.useEffect(() => { loadAnalyses(); }, []);

  async function uploadPdf(source: string, files: FileList) {
    setUploading(source);
    try {
      const form = new FormData();
      form.append("source", source);
      Array.from(files).forEach(f => form.append("files", f));
      const r = await fetch("/api/market-analysis/parse", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) { showToast(`Parse failed: ${d.error}`, "error"); return; }
      setComps(prev => ({ ...prev, [source]: [...prev[source], ...d.comps] }));
      showToast(`✓ Extracted ${d.count} records from PDF`, "success");
    } catch (err) {
      showToast(`Upload error: ${err}`, "error");
    } finally { setUploading(null); }
  }

  function removeComp(source: string, idx: number) {
    setComps(prev => ({ ...prev, [source]: prev[source].filter((_, i) => i !== idx) }));
  }

  const totalComps = Object.values(comps).reduce((s, arr) => s + arr.length, 0);

  async function generateAnalysis() {
    setStep("generating");
    setGenStatus("Analyzing comp data…");
    try {
      const genRes = await fetch("/api/market-analysis/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectVessel, subjectYear, subjectMake, subjectModel,
          subjectLength, subjectAskingPrice, notes,
          soldComps: comps.sold_comps, activeComps: comps.active_comps,
          broadSold: comps.broad_sold, broadActive: comps.broad_active,
        }),
      });
      const genData = await genRes.json();
      if (!genData.ok) { showToast(`Analysis failed: ${genData.error}`, "error"); setStep("review"); return; }

      setGenStatus("Saving report…");
      const saveRes = await fetch("/api/market-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${subjectYear} ${subjectMake} ${subjectModel}${subjectVessel ? ` — ${subjectVessel}` : ""}`,
          subject_vessel: subjectVessel, subject_year: subjectYear, subject_make: subjectMake,
          subject_model: subjectModel, subject_length: subjectLength,
          subject_asking_price: subjectAskingPrice, notes,
          sold_comps: comps.sold_comps, active_comps: comps.active_comps,
          broad_sold: comps.broad_sold, broad_active: comps.broad_active,
          analysis_json: genData.analysis, report_html: "",
        }),
      });
      const saveData = await saveRes.json();
      setSavedId(saveData.id);
      setStep("done");
      loadAnalyses();
    } catch (err) {
      showToast(`Error: ${err}`, "error");
      setStep("review");
    }
  }

  async function deleteAnalysis(id: number) {
    if (!confirm("Delete this analysis?")) return;
    await fetch(`/api/market-analysis?id=${id}`, { method: "DELETE" });
    loadAnalyses();
  }

  function resetForm() {
    setStep("list"); setSubjectVessel(""); setSubjectYear(""); setSubjectMake("");
    setSubjectModel(""); setSubjectLength(""); setSubjectAskingPrice(""); setNotes("");
    setComps({ sold_comps: [], active_comps: [], broad_sold: [], broad_active: [] });
    setSavedId(null);
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--input,#1e293b)", border: "1px solid var(--border)",
    color: "var(--foreground)", borderRadius: 8, padding: "10px 12px",
    fontSize: 13, width: "100%",
  };

  return (
    <PageShell title="Market Analysis">
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === "success" ? "#14532d" : "#7f1d1d",
          color: "#fff", padding: "12px 20px", borderRadius: 10, maxWidth: 360, fontSize: 13,
        }}>{toast.msg}</div>
      )}

      {step === "list" && (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: "serif", fontSize: 26, color: "var(--foreground)", marginBottom: 4 }}>Market Analysis</h1>
              <p style={{ fontSize: 12, color: "var(--navy-400)" }}>Upload comp PDFs · Generate pricing strategy · Produce client-facing reports</p>
            </div>
            <button onClick={() => setStep("setup")} style={{
              background: "var(--brass-400)", color: "#fff", border: "none",
              borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Plus className="w-4 h-4" /> New Analysis
            </button>
          </div>

          {loading ? (
            <p style={{ color: "var(--navy-400)", fontSize: 13 }}>Loading…</p>
          ) : analyses.length === 0 ? (
            <div style={{ textAlign: "center", padding: "64px 32px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <BarChart2 style={{ width: 40, height: 40, color: "var(--brass-400)", margin: "0 auto 16px" }} />
              <p style={{ fontFamily: "serif", fontSize: 20, marginBottom: 8 }}>No analyses yet</p>
              <p style={{ fontSize: 13, color: "var(--navy-400)", marginBottom: 24 }}>Upload comp PDFs to generate your first market intelligence report</p>
              <button onClick={() => setStep("setup")} style={{ background: "var(--brass-400)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>
                Get Started
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {analyses.map(a => (
                <div key={a.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 24px", display: "flex", alignItems: "center", gap: 16 }}>
                  <BarChart2 style={{ width: 28, height: 28, color: "var(--brass-400)", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: "var(--navy-400)" }}>
                      {a.subject_asking_price && `Ask: ${a.subject_asking_price} · `}
                      {new Date(a.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href={`/api/market-analysis/report?id=${a.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ background: "var(--brass-400)", color: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      <ExternalLink className="w-3 h-3" /> View Report
                    </a>
                    <button onClick={() => deleteAnalysis(a.id)} style={{ background: "rgba(180,0,0,.12)", border: "none", color: "#f87171", padding: "7px 10px", borderRadius: 8, cursor: "pointer" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SETUP STEP */}
      {step === "setup" && (
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <button onClick={resetForm} style={{ background: "none", border: "none", color: "var(--navy-400)", cursor: "pointer", fontSize: 13, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
            ← Back
          </button>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 28 }}>
            <p style={{ fontFamily: "serif", fontSize: 22, marginBottom: 6 }}>Subject Vessel</p>
            <p style={{ fontSize: 12, color: "var(--navy-400)", marginBottom: 24 }}>Enter details about the vessel you are listing</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                ["Vessel Name (e.g. KEMOSABE)", subjectVessel, setSubjectVessel],
                ["Year", subjectYear, setSubjectYear],
                ["Make (e.g. Westport)", subjectMake, setSubjectMake],
                ["Model (e.g. 112)", subjectModel, setSubjectModel],
                ["Length (e.g. 112 ft)", subjectLength, setSubjectLength],
                ["Proposed Asking Price (e.g. $6,500,000)", subjectAskingPrice, setSubjectAskingPrice],
              ].map(([ph, val, setter]) => (
                <div key={ph as string}>
                  <label style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brass-400)", marginBottom: 6, display: "block" }}>{(ph as string).split("(")[0].trim()}</label>
                  <input style={inputStyle} placeholder={ph as string} value={val as string} onChange={e => (setter as (v:string)=>void)(e.target.value)} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--brass-400)", marginBottom: 6, display: "block" }}>Broker Notes (condition, refit, differentiators)</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="E.g. Full refit 2024, new engines, custom interior, motivated seller…" />
            </div>
            <button onClick={() => setStep("upload")} disabled={!subjectMake || !subjectYear}
              style={{ marginTop: 20, background: subjectMake&&subjectYear ? "var(--brass-400)" : "var(--border)", color: subjectMake&&subjectYear ? "#fff" : "var(--navy-400)", border: "none", borderRadius: 10, padding: "11px 28px", fontWeight: 700, fontSize: 13, cursor: subjectMake&&subjectYear ? "pointer" : "not-allowed", width: "100%" }}>
              Continue → Upload Comp PDFs
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD STEP */}
      {step === "upload" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <button onClick={() => setStep("setup")} style={{ background: "none", border: "none", color: "var(--navy-400)", cursor: "pointer", fontSize: 13, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
          <p style={{ fontFamily: "serif", fontSize: 22, marginBottom: 6 }}>Upload Comp PDFs</p>
          <p style={{ fontSize: 12, color: "var(--navy-400)", marginBottom: 24 }}>Upload PDFs from each category. You can upload multiple files per category.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SOURCES.map(src => (
              <div key={src.key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: src.color }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{src.label}</span>
                      {comps[src.key].length > 0 && <span style={{ background: src.color, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{comps[src.key].length} records</span>}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--navy-400)", marginLeft: 20 }}>{src.desc}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {uploading === src.key && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "var(--brass-400)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />}
                    <button onClick={() => fileRefs.current[src.key]?.click()} disabled={uploading !== null}
                      style={{ background: "rgba(184,147,58,.1)", border: "1px solid rgba(184,147,58,.3)", color: "var(--brass-400)", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <Upload className="w-3 h-3" /> {comps[src.key].length > 0 ? "Add More" : "Upload PDF"}
                    </button>
                    <input ref={el => { fileRefs.current[src.key] = el; }} type="file" accept=".pdf" multiple className="hidden"
                      onChange={e => { if (e.target.files?.length) { uploadPdf(src.key, e.target.files); e.target.value = ""; } }} />
                  </div>
                </div>
                {comps[src.key].length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, maxHeight: 160, overflowY: "auto" }}>
                    {comps[src.key].map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 12 }}>
                        <span style={{ color: "var(--foreground)" }}>
                          {c.year} {c.make} {c.model} {c.name ? `"${c.name}"` : ""}
                          {c.soldPrice ? ` · Sold: $${c.soldPrice.toLocaleString()}` : c.askPrice ? ` · Ask: $${c.askPrice.toLocaleString()}` : ""}
                          {c.daysOnMarket ? ` · ${c.daysOnMarket} DOM` : ""}
                        </span>
                        <button onClick={() => removeComp(src.key, i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
            <button onClick={() => setStep("review")} disabled={totalComps === 0}
              style={{ flex: 1, background: totalComps > 0 ? "var(--brass-400)" : "var(--border)", color: totalComps > 0 ? "#fff" : "var(--navy-400)", border: "none", borderRadius: 10, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: totalComps > 0 ? "pointer" : "not-allowed" }}>
              Review {totalComps > 0 ? `${totalComps} Records` : ""} →
            </button>
          </div>
        </div>
      )}

      {/* REVIEW STEP */}
      {step === "review" && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <button onClick={() => setStep("upload")} style={{ background: "none", border: "none", color: "var(--navy-400)", cursor: "pointer", fontSize: 13, marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
          <p style={{ fontFamily: "serif", fontSize: 22, marginBottom: 4 }}>Review & Generate</p>
          <p style={{ fontSize: 12, color: "var(--navy-400)", marginBottom: 20 }}>{subjectYear} {subjectMake} {subjectModel} {subjectVessel && `"${subjectVessel}"`} · {subjectAskingPrice}</p>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
              {SOURCES.map(src => (
                <div key={src.key} style={{ textAlign: "center", padding: "14px", background: comps[src.key].length ? "rgba(184,147,58,.06)" : "var(--card)", border: `1px solid ${comps[src.key].length ? "rgba(184,147,58,.25)" : "var(--border)"}`, borderRadius: 8 }}>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 22, color: src.color, fontWeight: 400 }}>{comps[src.key].length}</div>
                  <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--navy-400)", marginTop: 4 }}>{src.label.split(" ").slice(-2).join(" ")}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={generateAnalysis}
            style={{ width: "100%", background: "var(--brass-400)", color: "#fff", border: "none", borderRadius: 12, padding: "16px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <BarChart2 className="w-5 h-5" /> Generate Market Intelligence Report
          </button>
        </div>
      )}

      {/* GENERATING */}
      {step === "generating" && (
        <div style={{ maxWidth: 500, margin: "80px auto", textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: "3px solid rgba(184,147,58,.3)", borderTopColor: "var(--brass-400)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 24px" }} />
          <p style={{ fontFamily: "serif", fontSize: 22, marginBottom: 8 }}>Analyzing Market Data</p>
          <p style={{ fontSize: 13, color: "var(--navy-400)" }}>{genStatus || "Processing…"}</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* DONE */}
      {step === "done" && savedId && (
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "64px 32px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontFamily: "serif", fontSize: 26, marginBottom: 8 }}>Report Ready</p>
          <p style={{ fontSize: 14, color: "var(--navy-400)", marginBottom: 32 }}>
            Your market intelligence report for {subjectYear} {subjectMake} {subjectModel} {subjectVessel && `"${subjectVessel}"`} has been generated.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`/api/market-analysis/report?id=${savedId}`} target="_blank" rel="noopener noreferrer"
              style={{ background: "var(--brass-400)", color: "#fff", padding: "12px 28px", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
              <ExternalLink className="w-4 h-4" /> Open Report
            </a>
            <button onClick={resetForm} style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Back to List
            </button>
            <button onClick={() => { resetForm(); setStep("setup"); }}
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", padding: "12px 24px", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus className="w-4 h-4" /> New Analysis
            </button>
          </div>
        </div>
      )}

    </PageShell>
  );
}
