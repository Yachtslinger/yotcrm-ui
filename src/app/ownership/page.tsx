"use client";
import React from "react";
import PageShell from "../components/PageShell";

type Scenario = { low: number; mid: number; high: number };

type CostModel = {
  crew: {
    salaries: Scenario & { breakdown: { role: string; low: number; mid: number; high: number }[] };
    recruitment: Scenario;
    travel: Scenario;
    accommodation: Scenario;
    uniforms: Scenario;
    training: Scenario;
    foodBeverage: Scenario;
    medical: Scenario;
    dayWorkers: Scenario;
    entertainment: Scenario;
  };
  communications: {
    phone: Scenario;
    satTV: Scenario;
    satcom: Scenario;
  };
  operations: {
    agency: Scenario;
    audioVisual: Scenario;
    auto: Scenario;
    bridge: Scenario;
    computer: Scenario;
    deck: Scenario;
    dockExpress: Scenario;
    engineering: Scenario;
    fuels: Scenario;
    galley: Scenario;
    interior: Scenario;
    launches: Scenario;
    mailFreight: Scenario;
    office: Scenario;
    dockage: Scenario;
    safetyMedical: Scenario;
    security: Scenario;
    survey: Scenario;
    warehousing: Scenario;
  };
  insurance: {
    hull: Scenario;
    pi: Scenario;
    crewHealth: Scenario;
  };
  administrative: {
    professionalFees: Scenario;
    bankCharges: Scenario;
    managementFee: Scenario;
    managementTravel: Scenario;
  };
  capital: {
    av: Scenario;
    engineeringDeck: Scenario;
    interior: Scenario;
    paint: Scenario;
    tendersToys: Scenario;
    other: Scenario;
  };
  assumptions: string;
  rangeExplanation: string;
  categoryBreakdown: string;
  crewStructureNote: string;
  keyDrivers: string;
  vesselName: string;
  vesselUrl: string;
};

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function scenarioTotal(s: Scenario): Scenario {
  return s;
}

function sectionTotal(items: Scenario[]): Scenario {
  return {
    low: items.reduce((a, b) => a + b.low, 0),
    mid: items.reduce((a, b) => a + b.mid, 0),
    high: items.reduce((a, b) => a + b.high, 0),
  };
}

type ShowScenarios = { low: boolean; mid: boolean; high: boolean };
function colCount(show: ShowScenarios) { return 1 + (show.low ? 1 : 0) + (show.mid ? 1 : 0) + (show.high ? 1 : 0); }

type RowOverride = { label?: string; low?: number; mid?: number; high?: number };

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

  const update = (field: keyof RowOverride, val: string | number) =>
    setOverrides(p => ({ ...p, [rowKey]: { ...p[rowKey], [field]: val } }));

  const iStyle: React.CSSProperties = {
    background: "var(--input,#1a2840)", border: "1px solid var(--brass-400)",
    color: "var(--foreground)", borderRadius: 6, padding: "2px 8px",
    fontSize: 12, width: "100%", outline: "none",
  };
  const numStyle: React.CSSProperties = { ...iStyle, textAlign: "right", width: 100 };

  if (editing) {
    return (
      <tr style={{ background: "rgba(184,147,58,.06)", borderBottom: "1px solid rgba(184,147,58,.2)" }}>
        <td className="py-2 pr-2">
          <input style={iStyle} value={displayLabel}
            onChange={e => update("label", e.target.value)}
            onBlur={() => setEditing(false)} autoFocus />
        </td>
        {show.low  && <td className="py-2 px-2"><input style={numStyle} type="number" value={low}
          onChange={e => update("low", parseFloat(e.target.value) || 0)} /></td>}
        {show.mid  && <td className="py-2 px-2"><input style={numStyle} type="number" value={mid}
          onChange={e => update("mid", parseFloat(e.target.value) || 0)} /></td>}
        {show.high && <td className="py-2 px-2"><input style={numStyle} type="number" value={high}
          onChange={e => update("high", parseFloat(e.target.value) || 0)} /></td>}
        <td className="py-2 pl-1">
          <button onClick={() => setEditing(false)}
            style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>
            ✓
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr
      onClick={() => !bold && setEditing(true)}
      style={{
        borderBottom: "1px solid rgba(255,255,255,.04)",
        cursor: bold ? "default" : "pointer",
      }}
      title={bold ? undefined : "Click to edit"}
      onMouseEnter={e => { if (!bold) (e.currentTarget as HTMLElement).style.background = "rgba(184,147,58,.04)"; }}
      onMouseLeave={e => { if (!bold) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <td className="py-2 pr-4 text-sm" style={{ color: bold ? "var(--brass-400)" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>
        {bold ? displayLabel : <span>{displayLabel} <span style={{ fontSize:10, opacity:0.3, marginLeft:4 }}>✎</span></span>}
      </td>
      {show.low  && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#4ade80" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(low)}</td>}
      {show.mid  && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#facc15" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(mid)}</td>}
      {show.high && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#f87171" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(high)}</td>}
      {!bold && <td style={{ width: 8 }} />}
    </tr>
  );
}

function Row({ label, s, bold, show }: { label: string; s: Scenario; bold?: boolean; show: ShowScenarios }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <td className="py-2 pr-4 text-sm" style={{ color: bold ? "var(--brass-400)" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{label}</td>
      {show.low  && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#4ade80" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.low)}</td>}
      {show.mid  && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#facc15" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.mid)}</td>}
      {show.high && <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#f87171" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.high)}</td>}
    </tr>
  );
}

function SectionHeader({ label, show }: { label: string; show: ShowScenarios }) {
  return (
    <tr>
      <td colSpan={colCount(show)} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>{label}</td>
    </tr>
  );
}

export default function OwnershipPage() {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<CostModel | null>(null);
  const [error, setError] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, RowOverride>>({});

  // Get effective scenario for a row (overrides take priority)
  function eff(rowKey: string, s: Scenario): Scenario {
    const ov = overrides[rowKey] || {};
    return { low: ov.low ?? s.low, mid: ov.mid ?? s.mid, high: ov.high ?? s.high };
  }

  async function downloadPDF() {
    if (!model) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/ownership/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, scenarios: showScenarios }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeName = (model.vesselName || "ownership-budget").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
      a.download = `${safeName}-cost-model.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert("PDF download failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setPdfLoading(false);
    }
  }
  const [activeTab, setActiveTab] = React.useState<"table" | "analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({ low: false, mid: true, high: false });

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // keep at least one active
      if (!next.low && !next.mid && !next.high) return prev;
      return next;
    });
  }

  async function generate() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setModel(null);

    try {
      // Step 1: Scrape vessel data (fast, ~10-20s)
      const scrapeRes = await fetch("/api/brochures/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.ok && !scrapeData.vessel) throw new Error(scrapeData.error || "Scrape failed");
      const vessel = scrapeData.vessel || {};

      // Step 2: Generate cost model from vessel data (Claude, ~30-40s)
      const res = await fetch("/api/ownership/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vessel, url: url.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generation failed");
      setModel(data.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const grandTotal = model ? {
    low: [
      sectionTotal(Object.values(model.crew).filter(v => typeof (v as any).low === "number") as Scenario[]),
      sectionTotal(Object.values(model.communications) as Scenario[]),
      sectionTotal(Object.values(model.operations) as Scenario[]),
      sectionTotal(Object.values(model.insurance) as Scenario[]),
      sectionTotal(Object.values(model.administrative) as Scenario[]),
      sectionTotal(Object.values(model.capital) as Scenario[]),
    ].reduce((a, b) => a + b.low, 0),
    mid: 0,
    high: 0,
  } : null;

  // compute proper grand totals from model
  function grandTotals(m: CostModel): Scenario {
    const crewItems = [
      eff("crew.salaries",m.crew.salaries), eff("crew.recruitment",m.crew.recruitment),
      eff("crew.travel",m.crew.travel), eff("crew.accommodation",m.crew.accommodation),
      eff("crew.uniforms",m.crew.uniforms), eff("crew.training",m.crew.training),
      eff("crew.foodBeverage",m.crew.foodBeverage), eff("crew.medical",m.crew.medical),
      eff("crew.dayWorkers",m.crew.dayWorkers), eff("crew.entertainment",m.crew.entertainment),
    ];
    const commItems = [
      eff("comm.phone",m.communications.phone), eff("comm.satTV",m.communications.satTV),
      eff("comm.satcom",m.communications.satcom),
    ];
    const opItems = [
      eff("op.agency",m.operations.agency), eff("op.audioVisual",m.operations.audioVisual),
      eff("op.auto",m.operations.auto), eff("op.bridge",m.operations.bridge),
      eff("op.computer",m.operations.computer), eff("op.deck",m.operations.deck),
      eff("op.dockExpress",m.operations.dockExpress), eff("op.engineering",m.operations.engineering),
      eff("op.fuels",m.operations.fuels), eff("op.galley",m.operations.galley),
      eff("op.interior",m.operations.interior), eff("op.launches",m.operations.launches),
      eff("op.mailFreight",m.operations.mailFreight), eff("op.office",m.operations.office),
      eff("op.dockage",m.operations.dockage), eff("op.safetyMedical",m.operations.safetyMedical),
      eff("op.security",m.operations.security), eff("op.survey",m.operations.survey),
      eff("op.warehousing",m.operations.warehousing),
    ];
    const insItems = [
      eff("ins.hull",m.insurance.hull), eff("ins.pi",m.insurance.pi),
      eff("ins.crewHealth",m.insurance.crewHealth),
    ];
    const adminItems = [
      eff("admin.professionalFees",m.administrative.professionalFees),
      eff("admin.bankCharges",m.administrative.bankCharges),
      eff("admin.managementFee",m.administrative.managementFee),
      eff("admin.managementTravel",m.administrative.managementTravel),
    ];
    const capItems = [
      eff("cap.av",m.capital.av), eff("cap.engineeringDeck",m.capital.engineeringDeck),
      eff("cap.interior",m.capital.interior), eff("cap.paint",m.capital.paint),
      eff("cap.tendersToys",m.capital.tendersToys), eff("cap.other",m.capital.other),
    ];
    return sectionTotal([...crewItems,...commItems,...opItems,...insItems,...adminItems,...capItems]);
  }

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--brass-400)" }}>Annual Ownership Cost Model</h1>
          <p className="text-sm" style={{ color: "var(--navy-400)" }}>
            Paste any YachtWorld listing URL to generate a full structured ownership cost analysis — Low / Mid / High scenarios.
          </p>
        </div>

        {/* Input */}
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <label className="block text-xs uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Listing URL</label>
          <div className="flex gap-3">
            <input
              className="flex-1 rounded-lg text-sm px-3 py-2.5"
              style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.yachtworld.com/yacht/..."
              onKeyDown={e => e.key === "Enter" && generate()}
            />
            <button
              onClick={generate}
              disabled={loading || !url.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{
                background: loading || !url.trim() ? "var(--border)" : "var(--brass-400)",
                color: loading || !url.trim() ? "var(--navy-400)" : "#fff",
                cursor: loading || !url.trim() ? "not-allowed" : "pointer",
              }}>
              {loading ? "Analyzing…" : "Generate Model"}
            </button>
          </div>
          {loading && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
              <span className="text-xs" style={{ color: "var(--navy-400)" }}>Step 1: Fetching vessel data… Step 2: Running cost analysis (~30s)…</span>
            </div>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>Error: {error}</p>}
        </div>

        {model && (() => {
          const gt = grandTotals(model);
          const crewTotal = sectionTotal([
            eff("crew.salaries",model.crew.salaries), eff("crew.recruitment",model.crew.recruitment),
            eff("crew.travel",model.crew.travel), eff("crew.accommodation",model.crew.accommodation),
            eff("crew.uniforms",model.crew.uniforms), eff("crew.training",model.crew.training),
            eff("crew.foodBeverage",model.crew.foodBeverage), eff("crew.medical",model.crew.medical),
            eff("crew.dayWorkers",model.crew.dayWorkers), eff("crew.entertainment",model.crew.entertainment),
          ]);
          const commTotal = sectionTotal([
            eff("comm.phone",model.communications.phone), eff("comm.satTV",model.communications.satTV),
            eff("comm.satcom",model.communications.satcom),
          ]);
          const opTotal = sectionTotal([
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
          const insTotal = sectionTotal([
            eff("ins.hull",model.insurance.hull), eff("ins.pi",model.insurance.pi),
            eff("ins.crewHealth",model.insurance.crewHealth),
          ]);
          const adminTotal = sectionTotal([
            eff("admin.professionalFees",model.administrative.professionalFees),
            eff("admin.bankCharges",model.administrative.bankCharges),
            eff("admin.managementFee",model.administrative.managementFee),
            eff("admin.managementTravel",model.administrative.managementTravel),
          ]);
          const capTotal = sectionTotal([
            eff("cap.av",model.capital.av), eff("cap.engineeringDeck",model.capital.engineeringDeck),
            eff("cap.interior",model.capital.interior), eff("cap.paint",model.capital.paint),
            eff("cap.tendersToys",model.capital.tendersToys), eff("cap.other",model.capital.other),
          ]);

          return (
            <div>
              {/* Vessel name + tabs */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>Annual Ownership Cost Model</p>
                </div>
                <div className="flex gap-2">
                  {(["table", "analysis"] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize"
                      style={{
                        background: activeTab === t ? "var(--brass-400)" : "var(--card)",
                        color: activeTab === t ? "#fff" : "var(--navy-400)",
                        border: "1px solid var(--border)",
                      }}>{t}</button>
                  ))}
                  <button
                    onClick={downloadPDF}
                    disabled={pdfLoading}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    style={{
                      background: pdfLoading ? "var(--border)" : "#1e3a5f",
                      color: pdfLoading ? "var(--navy-400)" : "#93c5fd",
                      border: "1px solid #3b82f640",
                      cursor: pdfLoading ? "not-allowed" : "pointer",
                    }}>
                    {pdfLoading ? "Generating…" : "⬇ Save PDF"}
                  </button>
                </div>
              </div>

              {/* Grand total banner */}
              {/* Scenario toggles */}
              <div className="flex items-center gap-1 mb-4">
                <span className="text-xs mr-2" style={{ color: "var(--navy-400)" }}>Show:</span>
                {([["low", "#4ade80", "Low"], ["mid", "#facc15", "Mid"], ["high", "#f87171", "High"]] as [keyof ShowScenarios, string, string][]).map(([key, color, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleScenario(key)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: showScenarios[key] ? `${color}20` : "var(--card)",
                      color: showScenarios[key] ? color : "var(--navy-400)",
                      border: `1px solid ${showScenarios[key] ? color + "60" : "var(--border)"}`,
                    }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${showScenarios[key] ? color : "var(--navy-400)"}`,
                      background: showScenarios[key] ? color : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {showScenarios[key] && <span style={{ color: "#000", fontSize: 8, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${colCount(showScenarios) - 1 || 1}, 1fr)` }}>
                {([["low", "LOW", gt.low, "#4ade80"], ["mid", "MID", gt.mid, "#facc15"], ["high", "HIGH", gt.high, "#f87171"]] as [keyof ShowScenarios, string, number, string][]).filter(([key]) => showScenarios[key]).map(([, label, val, color]) => (
                  <div key={label} className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: `1px solid ${color}40` }}>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label} SCENARIO</p>
                    <p className="text-2xl font-bold" style={{ color }}>{fmt(val)}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>per year</p>
                  </div>
                ))}
              </div>

              {activeTab === "table" && (
                <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)", overflowX: "auto" }}>
                  <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>
                    ✎ Click any line item to edit its description or values. Totals update automatically.
                  </p>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(184,147,58,.3)" }}>
                        <th className="text-left pb-2 text-xs uppercase tracking-wider" style={{ color: "var(--navy-400)" }}>Category</th>
                        {showScenarios.low  && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#4ade80" }}>Low</th>}
                        {showScenarios.mid  && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#facc15" }}>Mid</th>}
                        {showScenarios.high && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#f87171" }}>High</th>}
                      </tr>
                    </thead>
                    <tbody>
                      <SectionHeader show={showScenarios} label="CREW" />
                      {model.crew.salaries.breakdown?.map(r => (
                        <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} key={r.role} rowKey={`crew.salary.${r.role}`} label={`  ${r.role}`} s={r} />
                      ))}
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.recruitment" label="Recruitment Fees" s={model.crew.recruitment} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.travel" label="Travel" s={model.crew.travel} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.accommodation" label="Accommodation" s={model.crew.accommodation} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.uniforms" label="Uniforms" s={model.crew.uniforms} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.training" label="Training & Certification" s={model.crew.training} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.foodBeverage" label="Food & Beverages" s={model.crew.foodBeverage} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.medical" label="Medical Expenses" s={model.crew.medical} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.dayWorkers" label="Day Workers & Delivery Crew" s={model.crew.dayWorkers} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="crew.entertainment" label="Entertainment" s={model.crew.entertainment} />
                      <Row show={showScenarios} label="TOTAL CREW" s={crewTotal} bold />

                      <SectionHeader show={showScenarios} label="COMMUNICATIONS" />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="comm.phone" label="Phone & Cellular" s={model.communications.phone} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="comm.satTV" label="Sat TV" s={model.communications.satTV} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="comm.satcom" label="Satcom / Data (Starlink or equivalent)" s={model.communications.satcom} />
                      <Row show={showScenarios} label="TOTAL COMMUNICATIONS" s={commTotal} bold />

                      <SectionHeader show={showScenarios} label="OPERATIONS" />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.agency" label="Agency" s={model.operations.agency} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.audioVisual" label="Audio Visual" s={model.operations.audioVisual} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.auto" label="Auto" s={model.operations.auto} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.bridge" label="Bridge" s={model.operations.bridge} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.computer" label="Computer" s={model.operations.computer} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.deck" label="Deck" s={model.operations.deck} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.dockExpress" label="Dock Express / Shipping" s={model.operations.dockExpress} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.engineering" label="Engineering" s={model.operations.engineering} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.fuels" label="Fuels & Lubricants" s={model.operations.fuels} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.galley" label="Galley" s={model.operations.galley} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.interior" label="Interior" s={model.operations.interior} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.launches" label="Launches & Tenders" s={model.operations.launches} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.mailFreight" label="Mail & Freight" s={model.operations.mailFreight} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.office" label="Office" s={model.operations.office} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.dockage" label="Ports, Dockage & Customs" s={model.operations.dockage} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.safetyMedical" label="Safety & Medical" s={model.operations.safetyMedical} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.security" label="Security" s={model.operations.security} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.survey" label="Survey & Certification" s={model.operations.survey} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="op.warehousing" label="Warehousing & Storage" s={model.operations.warehousing} />
                      <Row show={showScenarios} label="TOTAL OPERATIONS" s={opTotal} bold />

                      <SectionHeader show={showScenarios} label="INSURANCE" />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="ins.hull" label="Hull & Machinery" s={model.insurance.hull} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="ins.pi" label="Protection & Indemnity" s={model.insurance.pi} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="ins.crewHealth" label="Crew Health Insurance" s={model.insurance.crewHealth} />
                      <Row show={showScenarios} label="TOTAL INSURANCE" s={insTotal} bold />

                      <SectionHeader show={showScenarios} label="ADMINISTRATIVE" />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="admin.professionalFees" label="Professional Fees" s={model.administrative.professionalFees} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="admin.bankCharges" label="Bank Charges" s={model.administrative.bankCharges} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="admin.managementFee" label="Management Fee" s={model.administrative.managementFee} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="admin.managementTravel" label="Management Travel" s={model.administrative.managementTravel} />
                      <Row show={showScenarios} label="TOTAL ADMINISTRATIVE" s={adminTotal} bold />

                      <SectionHeader show={showScenarios} label="CAPITAL IMPROVEMENTS" />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.av" label="AV" s={model.capital.av} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.engineeringDeck" label="Engineering / Deck" s={model.capital.engineeringDeck} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.interior" label="Interior" s={model.capital.interior} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.paint" label="Paint" s={model.capital.paint} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.tendersToys" label="Tenders / Toys" s={model.capital.tendersToys} />
                      <EditableRow overrides={overrides} setOverrides={setOverrides} show={showScenarios} rowKey="cap.other" label="Other" s={model.capital.other} />
                      <Row show={showScenarios} label="TOTAL CAPITAL" s={capTotal} bold />

                      <tr><td colSpan={colCount(showScenarios)} className="pt-6" /></tr>
                      <Row show={showScenarios} label="GRAND TOTAL" s={gt} bold />
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "analysis" && (
                <div className="space-y-4">
                  {[
                    ["Use Assumptions", model.assumptions],
                    ["Cost Range Explanation", model.rangeExplanation],
                    ["Category Breakdown", model.categoryBreakdown],
                    ["Crew Structure Note", model.crewStructureNote],
                    ["Key Cost Drivers", model.keyDrivers],
                  ].map(([title, content]) => (
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
