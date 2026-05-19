"use client";
import React from "react";
import PageShell from "../components/PageShell";

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Scenario = { low: number; mid: number; high: number };
type ShowScenarios = { low: boolean; mid: boolean; high: boolean };
type RowOverride = { label?: string; low?: number; mid?: number; high?: number };

type CostModel = {
  crew: {
    salaries: Scenario & { breakdown: { role: string; low: number; mid: number; high: number }[] };
    recruitment: Scenario; travel: Scenario; accommodation: Scenario; uniforms: Scenario;
    training: Scenario; foodBeverage: Scenario; medical: Scenario; dayWorkers: Scenario; entertainment: Scenario;
  };
  communications: { phone: Scenario; satTV: Scenario; satcom: Scenario };
  operations: {
    agency: Scenario; audioVisual: Scenario; auto: Scenario; bridge: Scenario; computer: Scenario;
    deck: Scenario; dockExpress: Scenario; engineering: Scenario; fuels: Scenario; galley: Scenario;
    interior: Scenario; launches: Scenario; mailFreight: Scenario; office: Scenario; dockage: Scenario;
    safetyMedical: Scenario; security: Scenario; survey: Scenario; warehousing: Scenario;
  };
  insurance: { hull: Scenario; pi: Scenario; crewHealth: Scenario };
  administrative: { professionalFees: Scenario; bankCharges: Scenario; managementFee: Scenario; managementTravel: Scenario };
  capital: { av: Scenario; engineeringDeck: Scenario; interior: Scenario; paint: Scenario; tendersToys: Scenario; other: Scenario };
  assumptions: string; rangeExplanation: string; categoryBreakdown: string; crewStructureNote: string; keyDrivers: string;
  vesselName: string; vesselUrl: string;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmt(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
function pct(n: number, total: number) { return total > 0 ? ((n / total) * 100).toFixed(1) + "%" : "0%"; }

function sectionTotal(items: Scenario[]): Scenario {
  return {
    low:  items.reduce((a, b) => a + b.low,  0),
    mid:  items.reduce((a, b) => a + b.mid,  0),
    high: items.reduce((a, b) => a + b.high, 0),
  };
}

function colCount(show: ShowScenarios) {
  return 1 + (show.low ? 1 : 0) + (show.mid ? 1 : 0) + (show.high ? 1 : 0);
}

/* ─── EditableRow ─────────────────────────────────────────────────────────── */
// FIX: no onBlur to close — only ✓ button or Escape closes edit mode
function EditableRow({
  rowKey, label, s, bold, show, overrides, setOverrides,
}: {
  rowKey: string; label: string; s: Scenario; bold?: boolean; show: ShowScenarios;
  overrides: Record<string, RowOverride>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, RowOverride>>>;
}) {
  const [editing, setEditing] = React.useState(false);
  const ov = overrides[rowKey] || {};
  const displayLabel = ov.label ?? label;
  const low  = ov.low  ?? s.low;
  const mid  = ov.mid  ?? s.mid;
  const high = ov.high ?? s.high;

  function update(field: keyof RowOverride, val: string | number) {
    setOverrides(p => ({ ...p, [rowKey]: { ...p[rowKey], [field]: val } }));
  }

  const iBase: React.CSSProperties = {
    background: "#0f1f35", border: "1px solid #b8933a",
    color: "#f1f5f9", borderRadius: 6, padding: "3px 8px",
    fontSize: 12, outline: "none",
  };
  const numStyle: React.CSSProperties = { ...iBase, textAlign: "right", width: 100 };

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") setEditing(false);
    if (e.key === "Enter")  setEditing(false);
  }

  if (editing) {
    return (
      <tr style={{ background: "rgba(184,147,58,.07)", borderBottom: "1px solid rgba(184,147,58,.25)" }}>
        <td style={{ padding: "6px 8px 6px 0" }}>
          <input style={{ ...iBase, width: "100%" }} value={displayLabel}
            onChange={e => update("label", e.target.value)}
            onKeyDown={handleKey}
            autoFocus />
        </td>
        {show.low  && <td style={{ padding: "6px 4px" }}>
          <input style={numStyle} type="number" value={low}
            onKeyDown={handleKey}
            onChange={e => update("low", parseFloat(e.target.value) || 0)} />
        </td>}
        {show.mid  && <td style={{ padding: "6px 4px" }}>
          <input style={numStyle} type="number" value={mid}
            onKeyDown={handleKey}
            onChange={e => update("mid", parseFloat(e.target.value) || 0)} />
        </td>}
        {show.high && <td style={{ padding: "6px 4px" }}>
          <input style={numStyle} type="number" value={high}
            onKeyDown={handleKey}
            onChange={e => update("high", parseFloat(e.target.value) || 0)} />
        </td>}
        <td style={{ padding: "6px 0 6px 6px", whiteSpace: "nowrap" }}>
          <button onClick={() => setEditing(false)}
            style={{ background: "#b8933a", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Done
          </button>
          <button onClick={() => { setOverrides(p => { const n = {...p}; delete n[rowKey]; return n; }); setEditing(false); }}
            style={{ background: "none", color: "#64748b", border: "1px solid #334155", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", marginLeft: 4 }}>
            ✕
          </button>
        </td>
      </tr>
    );
  }

  const isOverridden = !!overrides[rowKey];
  return (
    <tr onClick={() => !bold && setEditing(true)}
      style={{ borderBottom: "1px solid rgba(255,255,255,.04)", cursor: bold ? "default" : "pointer" }}
      onMouseEnter={e => { if (!bold) (e.currentTarget as HTMLElement).style.background = "rgba(184,147,58,.04)"; }}
      onMouseLeave={e => { if (!bold) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <td style={{ padding: "7px 16px 7px 0", fontSize: 13, color: bold ? "var(--brass-400)" : isOverridden ? "#fbbf24" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>
        {bold ? displayLabel : <span>{displayLabel} <span style={{ fontSize: 10, opacity: 0.28, marginLeft: 3 }}>✎</span></span>}
      </td>
      {show.low  && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, color: bold ? "#4ade80" : isOverridden ? "#fbbf24" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(low)}</td>}
      {show.mid  && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, color: bold ? "#facc15" : isOverridden ? "#fbbf24" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(mid)}</td>}
      {show.high && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, color: bold ? "#f87171" : isOverridden ? "#fbbf24" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(high)}</td>}
      {!bold && <td style={{ width: 32 }} />}
    </tr>
  );
}

function SectionHeader({ label, show }: { label: string; show: ShowScenarios }) {
  return (
    <tr>
      <td colSpan={colCount(show) + 1} style={{ paddingTop: 22, paddingBottom: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brass-400)" }}>
        {label}
      </td>
    </tr>
  );
}

function BoldRow({ label, s, show }: { label: string; s: Scenario; show: ShowScenarios }) {
  return (
    <tr style={{ borderTop: "1px solid rgba(184,147,58,.2)", borderBottom: "1px solid rgba(184,147,58,.2)" }}>
      <td style={{ padding: "7px 16px 7px 0", fontSize: 13, fontWeight: 700, color: "var(--brass-400)" }}>{label}</td>
      {show.low  && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#4ade80" }}>{fmt(s.low)}</td>}
      {show.mid  && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#facc15" }}>{fmt(s.mid)}</td>}
      {show.high && <td style={{ padding: "7px 12px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#f87171" }}>{fmt(s.high)}</td>}
      <td style={{ width: 32 }} />
    </tr>
  );
}

/* ─── Pie Chart ───────────────────────────────────────────────────────────── */
const PIE_COLORS = ["#b8933a","#38bdf8","#34d399","#a78bfa","#fb923c","#f472b6"];
const PIE_CATS = ["Crew","Communications","Operations","Insurance","Administrative","Capital"];
const PIE_DESCS: Record<string, string> = {
  Crew: "All costs to recruit, compensate, travel, train, and support the professional crew year-round — salaries, food, uniforms, medical, and day workers.",
  Communications: "Vessel connectivity including satellite broadband (Starlink/KVH/Inmarsat), satellite TV, and captain/crew mobile plans.",
  Operations: "Day-to-day running costs across every department: engineering servicing, fuel, dockage, galley provisioning, deck consumables, port agents, safety equipment, and more.",
  Insurance: "Hull & Machinery (physical loss/damage), Protection & Indemnity (third-party liability), and crew health insurance.",
  Administrative: "Professional services, flag-state fees, management company charges, banking costs, and owner/manager travel.",
  "Capital": "Annualised reserves for planned major expenditure: paint cycle, engine overhauls, tender replacement, AV upgrades, and interior refresh.",
};

function donutPath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const s = toRad(startDeg), e = toRad(endDeg);
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  const x1 = cx + outerR * Math.cos(s), y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e), y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e), y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s), y4 = cy + innerR * Math.sin(s);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

function BudgetPieChart({ totals, grand }: { totals: number[]; grand: number }) {
  const cx = 200, cy = 200, outerR = 160, innerR = 95;
  const angles: number[] = [];
  let cur = 0;
  totals.forEach(v => { angles.push(cur); cur += (v / grand) * 360; });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
      {/* SVG donut */}
      <div style={{ position: "relative" }}>
        <svg viewBox="0 0 400 400" width={380} height={380}>
          {totals.map((v, i) => {
            const startDeg = angles[i];
            const endDeg   = i < totals.length - 1 ? angles[i + 1] : cur;
            if (v === 0) return null;
            const midDeg = startDeg + (endDeg - startDeg) / 2;
            const midRad = ((midDeg - 90) * Math.PI) / 180;
            const labelR = outerR + 22;
            const lx = cx + labelR * Math.cos(midRad);
            const ly = cy + labelR * Math.sin(midRad);
            const pctVal = ((v / grand) * 100).toFixed(1);
            return (
              <g key={i}>
                <path d={donutPath(cx, cy, outerR, innerR, startDeg, endDeg)}
                  fill={PIE_COLORS[i]}
                  stroke="#0d1117" strokeWidth={2}
                  opacity={0.92} />
                {parseFloat(pctVal) >= 5 && (
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                    fontSize={10} fontWeight={700} fill={PIE_COLORS[i]} fontFamily="Arial, sans-serif">
                    {pctVal}%
                  </text>
                )}
              </g>
            );
          })}
          {/* Center total */}
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize={11} fill="#64748b" fontFamily="Arial, sans-serif">ANNUAL TOTAL</text>
          <text x={cx} y={cy + 8}  textAnchor="middle" fontSize={18} fontWeight={700} fill="#facc15" fontFamily="Arial, sans-serif">{fmt(grand)}</text>
          <text x={cx} y={cy + 28} textAnchor="middle" fontSize={10} fill="#64748b" fontFamily="Arial, sans-serif">per year</text>
        </svg>
      </div>

      {/* Legend + descriptions */}
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {PIE_CATS.map((cat, i) => (
          <div key={cat} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, background: "var(--card)", border: `1px solid ${PIE_COLORS[i]}30` }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i], flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: PIE_COLORS[i] }}>{cat}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>
                  {fmt(totals[i])} <span style={{ fontSize: 10, color: "#64748b" }}>({pct(totals[i], grand)})</span>
                </span>
              </div>
              <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55 }}>{PIE_DESCS[cat] || PIE_DESCS["Capital"]}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function OwnershipPage() {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<CostModel | null>(null);
  const [error, setError] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, RowOverride>>({});
  const [activeTab, setActiveTab] = React.useState<"table" | "chart" | "analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({ low: false, mid: true, high: false });

  function eff(rowKey: string, s: Scenario): Scenario {
    const ov = overrides[rowKey] || {};
    return { low: ov.low ?? s.low, mid: ov.mid ?? s.mid, high: ov.high ?? s.high };
  }

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.low && !next.mid && !next.high) return prev;
      return next;
    });
  }

  async function generate() {
    if (!url.trim()) return;
    setLoading(true); setError(""); setModel(null); setOverrides({});
    try {
      const scrapeRes = await fetch("/api/brochures/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.ok && !scrapeData.vessel) throw new Error(scrapeData.error || "Scrape failed");
      const vessel = scrapeData.vessel || {};
      const res = await fetch("/api/ownership/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vessel, url: url.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generation failed");
      setModel(data.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally { setLoading(false); }
  }

  async function downloadPDF() {
    if (!model) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/ownership/pdf", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, scenarios: showScenarios }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeName = (model.vesselName || "ownership-budget").replace(/[^a-zA-Z0-9\s-]/g,"").replace(/\s+/g,"-").toLowerCase();
      a.download = `${safeName}-cost-model.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert("PDF download failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally { setPdfLoading(false); }
  }

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--brass-400)" }}>Annual Ownership Cost Model</h1>
          <p className="text-sm" style={{ color: "var(--navy-400)" }}>Paste any listing URL to generate a full structured ownership cost analysis.</p>
        </div>

        {/* URL input */}
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <label className="block text-xs uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Listing URL</label>
          <div className="flex gap-3">
            <input className="flex-1 rounded-lg text-sm px-3 py-2.5"
              style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://www.yachtworld.com/yacht/… or edmiston.com/…"
              onKeyDown={e => e.key === "Enter" && generate()} />
            <button onClick={generate} disabled={loading || !url.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-bold"
              style={{ background: loading || !url.trim() ? "var(--border)" : "var(--brass-400)", color: loading || !url.trim() ? "var(--navy-400)" : "#fff", cursor: loading || !url.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "Analyzing…" : "Generate Model"}
            </button>
          </div>
          {loading && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
              <span className="text-xs" style={{ color: "var(--navy-400)" }}>Fetching vessel data then computing cost model…</span>
            </div>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>Error: {error}</p>}
        </div>

        {model && (() => {
          // Compute effective totals (respects overrides)
          const crewT = sectionTotal([
            eff("crew.salaries",model.crew.salaries), eff("crew.recruitment",model.crew.recruitment),
            eff("crew.travel",model.crew.travel), eff("crew.accommodation",model.crew.accommodation),
            eff("crew.uniforms",model.crew.uniforms), eff("crew.training",model.crew.training),
            eff("crew.foodBeverage",model.crew.foodBeverage), eff("crew.medical",model.crew.medical),
            eff("crew.dayWorkers",model.crew.dayWorkers), eff("crew.entertainment",model.crew.entertainment),
          ]);
          const commT = sectionTotal([eff("comm.phone",model.communications.phone), eff("comm.satTV",model.communications.satTV), eff("comm.satcom",model.communications.satcom)]);
          const opT = sectionTotal([
            eff("op.agency",model.operations.agency), eff("op.audioVisual",model.operations.audioVisual),
            eff("op.auto",model.operations.auto), eff("op.bridge",model.operations.bridge),
            eff("op.computer",model.operations.computer), eff("op.deck",model.operations.deck),
            eff("op.dockExpress",model.operations.dockExpress), eff("op.engineering",model.operations.engineering),
            eff("op.fuels",model.operations.fuels), eff("op.galley",model.operations.galley),
            eff("op.interior",model.operations.interior), eff("op.launches",model.operations.launches),
            eff("op.mailFreight",model.operations.mailFreight), eff("op.office",model.operations.office),
            eff("op.dockage",model.operations.dockage), eff("op.safetyMedical",model.operations.safetyMedical),
            eff("op.security",model.operations.security), eff("op.survey",model.operations.survey),
            eff("op.warehousing",model.operations.warehousing),
          ]);
          const insT  = sectionTotal([eff("ins.hull",model.insurance.hull), eff("ins.pi",model.insurance.pi), eff("ins.crewHealth",model.insurance.crewHealth)]);
          const adminT = sectionTotal([eff("admin.professionalFees",model.administrative.professionalFees), eff("admin.bankCharges",model.administrative.bankCharges), eff("admin.managementFee",model.administrative.managementFee), eff("admin.managementTravel",model.administrative.managementTravel)]);
          const capT  = sectionTotal([eff("cap.av",model.capital.av), eff("cap.engineeringDeck",model.capital.engineeringDeck), eff("cap.interior",model.capital.interior), eff("cap.paint",model.capital.paint), eff("cap.tendersToys",model.capital.tendersToys), eff("cap.other",model.capital.other)]);
          const gt    = sectionTotal([crewT, commT, opT, insT, adminT, capT]);

          const visCount = [showScenarios.low, showScenarios.mid, showScenarios.high].filter(Boolean).length || 1;
          const scData: [keyof ShowScenarios, string, number, string][] = [
            ["low","LOW",gt.low,"#4ade80"], ["mid","MID",gt.mid,"#facc15"], ["high","HIGH",gt.high,"#f87171"],
          ];

          const pieData = [crewT.mid, commT.mid, opT.mid, insT.mid, adminT.mid, capT.mid];

          const tabs: { key: "table"|"chart"|"analysis"; label: string }[] = [
            { key: "table", label: "Table" },
            { key: "chart", label: "Chart" },
            { key: "analysis", label: "Analysis" },
          ];

          return (
            <div>
              {/* Header row */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>Annual Ownership Cost Model</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: activeTab === t.key ? "var(--brass-400)" : "var(--card)", color: activeTab === t.key ? "#fff" : "var(--navy-400)", border: "1px solid var(--border)" }}>
                      {t.label}
                    </button>
                  ))}
                  <button onClick={downloadPDF} disabled={pdfLoading}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: pdfLoading ? "var(--border)" : "#1e3a5f", color: pdfLoading ? "var(--navy-400)" : "#93c5fd", border: "1px solid #3b82f640", cursor: pdfLoading ? "not-allowed" : "pointer" }}>
                    {pdfLoading ? "Generating…" : "⬇ Save PDF"}
                  </button>
                </div>
              </div>

              {/* Scenario toggles */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs" style={{ color: "var(--navy-400)" }}>Show:</span>
                {(["low","mid","high"] as (keyof ShowScenarios)[]).map((key, i) => {
                  const color = ["#4ade80","#facc15","#f87171"][i];
                  const label = ["Low","Mid","High"][i];
                  return (
                    <button key={key} onClick={() => toggleScenario(key)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                      style={{ background: showScenarios[key] ? `${color}20` : "var(--card)", color: showScenarios[key] ? color : "var(--navy-400)", border: `1px solid ${showScenarios[key] ? color+"60" : "var(--border)"}` }}>
                      <span style={{ width:12, height:12, borderRadius:3, border:`1.5px solid ${showScenarios[key] ? color : "var(--navy-400)"}`, background: showScenarios[key] ? color : "transparent", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                        {showScenarios[key] && <span style={{ color:"#000", fontSize:8, fontWeight:900, lineHeight:1 }}>✓</span>}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Grand total cards */}
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: `repeat(${visCount}, 1fr)` }}>
                {scData.filter(([k]) => showScenarios[k]).map(([,label,val,color]) => (
                  <div key={label} className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: `1px solid ${color}40` }}>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label} SCENARIO</p>
                    <p className="text-2xl font-bold" style={{ color }}>{fmt(val)}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>per year</p>
                  </div>
                ))}
              </div>

              {/* ── TABLE TAB ── */}
              {activeTab === "table" && (
                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)", overflowX: "auto" }}>
                  <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>
                    ✎ Click any row to edit values. Use <strong>Done</strong> to save or <strong>✕</strong> to revert. Numbers highlighted in amber indicate manual overrides.
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(184,147,58,.3)" }}>
                        <th style={{ textAlign:"left", paddingBottom:8, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--navy-400)" }}>Category</th>
                        {showScenarios.low  && <th style={{ textAlign:"right", paddingBottom:8, paddingLeft:12, paddingRight:12, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"#4ade80" }}>Low</th>}
                        {showScenarios.mid  && <th style={{ textAlign:"right", paddingBottom:8, paddingLeft:12, paddingRight:12, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"#facc15" }}>Mid</th>}
                        {showScenarios.high && <th style={{ textAlign:"right", paddingBottom:8, paddingLeft:12, paddingRight:12, fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"#f87171" }}>High</th>}
                        <th style={{ width: 32 }} />
                      </tr>
                    </thead>
                    <tbody>
                      <SectionHeader show={showScenarios} label="CREW" />
                      {model.crew.salaries.breakdown?.map(r => (
                        <EditableRow key={r.role} rowKey={`crew.salary.${r.role}`} label={`  ${r.role}`} s={r} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      {([
                        ["crew.recruitment","Recruitment Fees",model.crew.recruitment],
                        ["crew.travel","Travel",model.crew.travel],
                        ["crew.accommodation","Accommodation",model.crew.accommodation],
                        ["crew.uniforms","Uniforms",model.crew.uniforms],
                        ["crew.training","Training & Certification",model.crew.training],
                        ["crew.foodBeverage","Food & Beverages",model.crew.foodBeverage],
                        ["crew.medical","Medical Expenses",model.crew.medical],
                        ["crew.dayWorkers","Day Workers & Delivery Crew",model.crew.dayWorkers],
                        ["crew.entertainment","Entertainment",model.crew.entertainment],
                      ] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL CREW" s={crewT} show={showScenarios} />

                      <SectionHeader show={showScenarios} label="COMMUNICATIONS" />
                      {([["comm.phone","Phone & Cellular",model.communications.phone],["comm.satTV","Sat TV",model.communications.satTV],["comm.satcom","Satcom / Data (Starlink or equiv.)",model.communications.satcom]] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL COMMUNICATIONS" s={commT} show={showScenarios} />

                      <SectionHeader show={showScenarios} label="OPERATIONS" />
                      {([
                        ["op.agency","Agency",model.operations.agency],["op.audioVisual","Audio Visual",model.operations.audioVisual],
                        ["op.auto","Auto",model.operations.auto],["op.bridge","Bridge",model.operations.bridge],
                        ["op.computer","Computer",model.operations.computer],["op.deck","Deck",model.operations.deck],
                        ["op.dockExpress","Dock Express / Shipping",model.operations.dockExpress],["op.engineering","Engineering",model.operations.engineering],
                        ["op.fuels","Fuels & Lubricants",model.operations.fuels],["op.galley","Galley",model.operations.galley],
                        ["op.interior","Interior",model.operations.interior],["op.launches","Launches & Tenders",model.operations.launches],
                        ["op.mailFreight","Mail & Freight",model.operations.mailFreight],["op.office","Office",model.operations.office],
                        ["op.dockage","Ports, Dockage & Customs",model.operations.dockage],["op.safetyMedical","Safety & Medical",model.operations.safetyMedical],
                        ["op.security","Security",model.operations.security],["op.survey","Survey & Certification",model.operations.survey],
                        ["op.warehousing","Warehousing & Storage",model.operations.warehousing],
                      ] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL OPERATIONS" s={opT} show={showScenarios} />

                      <SectionHeader show={showScenarios} label="INSURANCE" />
                      {([["ins.hull","Hull & Machinery",model.insurance.hull],["ins.pi","Protection & Indemnity",model.insurance.pi],["ins.crewHealth","Crew Health Insurance",model.insurance.crewHealth]] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL INSURANCE" s={insT} show={showScenarios} />

                      <SectionHeader show={showScenarios} label="ADMINISTRATIVE" />
                      {([["admin.professionalFees","Professional Fees",model.administrative.professionalFees],["admin.bankCharges","Bank Charges",model.administrative.bankCharges],["admin.managementFee","Management Fee",model.administrative.managementFee],["admin.managementTravel","Management Travel",model.administrative.managementTravel]] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL ADMINISTRATIVE" s={adminT} show={showScenarios} />

                      <SectionHeader show={showScenarios} label="CAPITAL IMPROVEMENTS" />
                      {([["cap.av","AV",model.capital.av],["cap.engineeringDeck","Engineering / Deck",model.capital.engineeringDeck],["cap.interior","Interior",model.capital.interior],["cap.paint","Paint",model.capital.paint],["cap.tendersToys","Tenders / Toys",model.capital.tendersToys],["cap.other","Other",model.capital.other]] as [string,string,Scenario][]).map(([k,l,s]) => (
                        <EditableRow key={k} rowKey={k} label={l} s={s} show={showScenarios} overrides={overrides} setOverrides={setOverrides} />
                      ))}
                      <BoldRow label="TOTAL CAPITAL" s={capT} show={showScenarios} />

                      <tr><td colSpan={colCount(showScenarios) + 1} style={{ paddingTop: 16 }} /></tr>
                      <BoldRow label="GRAND TOTAL" s={gt} show={showScenarios} />
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── CHART TAB ── */}
              {activeTab === "chart" && (
                <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <p className="text-xs mb-6" style={{ color: "var(--navy-400)" }}>Budget breakdown by category · Mid scenario</p>
                  <BudgetPieChart totals={pieData} grand={gt.mid} />
                </div>
              )}

              {/* ── ANALYSIS TAB ── */}
              {activeTab === "analysis" && (
                <div className="space-y-4">
                  {([
                    ["Use Assumptions", model.assumptions],
                    ["Cost Range Explanation", model.rangeExplanation],
                    ["Category Breakdown", model.categoryBreakdown],
                    ["Crew Structure Note", model.crewStructureNote],
                    ["Key Cost Drivers", model.keyDrivers],
                  ] as [string,string][]).map(([title, content]) => (
                    <div key={title} className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--brass-400)" }}>{title}</p>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--foreground)" }}>{content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </PageShell>
  );
}
