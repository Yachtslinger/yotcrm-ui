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
  const [opEdits, setOpEdits] = React.useState<Partial<Record<keyof CostModel["operations"], Partial<Scenario>>>>({});

  function getOpValue(key: keyof CostModel["operations"], scenario: keyof Scenario): number {
    return opEdits[key]?.[scenario] ?? (model?.operations[key][scenario] ?? 0);
  }

  function setOpValue(key: keyof CostModel["operations"], scenario: keyof Scenario, raw: string) {
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    const val = isNaN(parsed) ? 0 : parsed;
    setOpEdits(prev => ({
      ...prev,
      [key]: { ...prev[key], [scenario]: val },
    }));
  }

  function effectiveOpTotal(show: ShowScenarios): Scenario {
    const keys: (keyof CostModel["operations"])[] = [
      "agency","audioVisual","auto","bridge","computer","deck","dockExpress","engineering",
      "fuels","galley","interior","launches","mailFreight","office","dockage","safetyMedical",
      "security","survey","warehousing",
    ];
    return {
      low:  show.low  ? keys.reduce((a, k) => a + getOpValue(k, "low"),  0) : 0,
      mid:  show.mid  ? keys.reduce((a, k) => a + getOpValue(k, "mid"),  0) : 0,
      high: show.high ? keys.reduce((a, k) => a + getOpValue(k, "high"), 0) : 0,
    };
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
      setOpEdits({});
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

  // compute proper grand totals from model, using any user edits to operations
  function grandTotals(m: CostModel): Scenario {
    const crewItems = [
      m.crew.salaries, m.crew.recruitment, m.crew.travel, m.crew.accommodation,
      m.crew.uniforms, m.crew.training, m.crew.foodBeverage, m.crew.medical,
      m.crew.dayWorkers, m.crew.entertainment,
    ];
    const commItems = [m.communications.phone, m.communications.satTV, m.communications.satcom];
    const insItems = [m.insurance.hull, m.insurance.pi, m.insurance.crewHealth];
    const adminItems = [m.administrative.professionalFees, m.administrative.bankCharges,
      m.administrative.managementFee, m.administrative.managementTravel];
    const capItems = [m.capital.av, m.capital.engineeringDeck, m.capital.interior,
      m.capital.paint, m.capital.tendersToys, m.capital.other];
    const fixed = [...crewItems, ...commItems, ...insItems, ...adminItems, ...capItems];
    const fixedTotals = sectionTotal(fixed);
    // operations uses live edited values
    const opKeys: (keyof CostModel["operations"])[] = [
      "agency","audioVisual","auto","bridge","computer","deck","dockExpress","engineering",
      "fuels","galley","interior","launches","mailFreight","office","dockage","safetyMedical",
      "security","survey","warehousing",
    ];
    return {
      low:  fixedTotals.low  + opKeys.reduce((a, k) => a + getOpValue(k, "low"),  0),
      mid:  fixedTotals.mid  + opKeys.reduce((a, k) => a + getOpValue(k, "mid"),  0),
      high: fixedTotals.high + opKeys.reduce((a, k) => a + getOpValue(k, "high"), 0),
    };
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
            model.crew.salaries, model.crew.recruitment, model.crew.travel, model.crew.accommodation,
            model.crew.uniforms, model.crew.training, model.crew.foodBeverage, model.crew.medical,
            model.crew.dayWorkers, model.crew.entertainment,
          ]);
          const commTotal = sectionTotal([model.communications.phone, model.communications.satTV, model.communications.satcom]);
          const opTotal = effectiveOpTotal(showScenarios);
          const insTotal = sectionTotal([model.insurance.hull, model.insurance.pi, model.insurance.crewHealth]);
          const adminTotal = sectionTotal([model.administrative.professionalFees, model.administrative.bankCharges,
            model.administrative.managementFee, model.administrative.managementTravel]);
          const capTotal = sectionTotal([model.capital.av, model.capital.engineeringDeck, model.capital.interior,
            model.capital.paint, model.capital.tendersToys, model.capital.other]);

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
                        <Row show={showScenarios} key={r.role} label={`  ${r.role}`} s={r} />
                      ))}
                      <Row show={showScenarios} label="Recruitment Fees" s={model.crew.recruitment} />
                      <Row show={showScenarios} label="Travel" s={model.crew.travel} />
                      <Row show={showScenarios} label="Accommodation" s={model.crew.accommodation} />
                      <Row show={showScenarios} label="Uniforms" s={model.crew.uniforms} />
                      <Row show={showScenarios} label="Training & Certification" s={model.crew.training} />
                      <Row show={showScenarios} label="Food & Beverages" s={model.crew.foodBeverage} />
                      <Row show={showScenarios} label="Medical Expenses" s={model.crew.medical} />
                      <Row show={showScenarios} label="Day Workers & Delivery Crew" s={model.crew.dayWorkers} />
                      <Row show={showScenarios} label="Entertainment" s={model.crew.entertainment} />
                      <Row show={showScenarios} label="TOTAL CREW" s={crewTotal} bold />

                      <SectionHeader show={showScenarios} label="COMMUNICATIONS" />
                      <Row show={showScenarios} label="Phone & Cellular" s={model.communications.phone} />
                      <Row show={showScenarios} label="Sat TV" s={model.communications.satTV} />
                      <Row show={showScenarios} label="Satcom / Data (Starlink or equivalent)" s={model.communications.satcom} />
                      <Row show={showScenarios} label="TOTAL COMMUNICATIONS" s={commTotal} bold />

                      <SectionHeader show={showScenarios} label="OPERATIONS" />
                      {(
                        [
                          ["agency",        "Agency"],
                          ["audioVisual",   "Audio Visual"],
                          ["auto",          "Auto"],
                          ["bridge",        "Bridge"],
                          ["computer",      "Computer"],
                          ["dockExpress",   "Dock Express / Shipping"],
                          ["engineering",   "Engineering"],
                          ["fuels",         "Fuels & Lubricants"],
                          ["galley",        "Galley"],
                          ["interior",      "Interior"],
                          ["launches",      "Launches & Tenders"],
                          ["mailFreight",   "Mail & Freight"],
                          ["office",        "Office"],
                          ["dockage",       "Ports, Dockage & Customs"],
                          ["safetyMedical", "Safety & Medical"],
                          ["security",      "Security"],
                          ["survey",        "Survey & Certification"],
                          ["warehousing",   "Warehousing & Storage"],
                          ["deck",          "Deck"],
                        ] as [keyof CostModel["operations"], string][]
                      ).map(([key, label]) => (
                        <tr key={key} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <td className="py-2 pr-4 text-sm" style={{ color: "var(--foreground)" }}>{label}</td>
                          {(["low","mid","high"] as (keyof Scenario)[]).filter(s => showScenarios[s]).map(s => (
                            <td key={s} className="py-1 px-2">
                              <input
                                type="number"
                                value={getOpValue(key, s)}
                                onChange={e => setOpValue(key, s, e.target.value)}
                                className="w-full text-sm text-right rounded px-2 py-1"
                                style={{
                                  background: opEdits[key]?.[s] !== undefined ? "rgba(197,160,100,.12)" : "var(--input,rgba(255,255,255,.06))",
                                  border: opEdits[key]?.[s] !== undefined ? "1px solid var(--brass-400)" : "1px solid var(--border)",
                                  color: "var(--foreground)",
                                  width: "110px",
                                  outline: "none",
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <Row show={showScenarios} label="TOTAL OPERATIONS" s={effectiveOpTotal(showScenarios)} bold />

                      <SectionHeader show={showScenarios} label="INSURANCE" />
                      <Row show={showScenarios} label="Hull & Machinery" s={model.insurance.hull} />
                      <Row show={showScenarios} label="Protection & Indemnity" s={model.insurance.pi} />
                      <Row show={showScenarios} label="Crew Health Insurance" s={model.insurance.crewHealth} />
                      <Row show={showScenarios} label="TOTAL INSURANCE" s={insTotal} bold />

                      <SectionHeader show={showScenarios} label="ADMINISTRATIVE" />
                      <Row show={showScenarios} label="Professional Fees" s={model.administrative.professionalFees} />
                      <Row show={showScenarios} label="Bank Charges" s={model.administrative.bankCharges} />
                      <Row show={showScenarios} label="Management Fee" s={model.administrative.managementFee} />
                      <Row show={showScenarios} label="Management Travel" s={model.administrative.managementTravel} />
                      <Row show={showScenarios} label="TOTAL ADMINISTRATIVE" s={adminTotal} bold />

                      <SectionHeader show={showScenarios} label="CAPITAL IMPROVEMENTS" />
                      <Row show={showScenarios} label="AV" s={model.capital.av} />
                      <Row show={showScenarios} label="Engineering / Deck" s={model.capital.engineeringDeck} />
                      <Row show={showScenarios} label="Interior" s={model.capital.interior} />
                      <Row show={showScenarios} label="Paint" s={model.capital.paint} />
                      <Row show={showScenarios} label="Tenders / Toys" s={model.capital.tendersToys} />
                      <Row show={showScenarios} label="Other" s={model.capital.other} />
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
