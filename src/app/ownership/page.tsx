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

function Row({ label, s, bold }: { label: string; s: Scenario; bold?: boolean }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <td className="py-2 pr-4 text-sm" style={{ color: bold ? "var(--brass-400)" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#4ade80" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.low)}</td>
      <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#facc15" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.mid)}</td>
      <td className="py-2 px-3 text-sm text-right" style={{ color: bold ? "#f87171" : "var(--foreground)", fontWeight: bold ? 700 : 400 }}>{fmt(s.high)}</td>
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={4} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>{label}</td>
    </tr>
  );
}

export default function OwnershipPage() {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<CostModel | null>(null);
  const [error, setError] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);

  async function downloadPDF() {
    if (!model) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/ownership/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
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

  async function generate() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setModel(null);

    try {
      const res = await fetch("/api/ownership/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
      m.crew.salaries, m.crew.recruitment, m.crew.travel, m.crew.accommodation,
      m.crew.uniforms, m.crew.training, m.crew.foodBeverage, m.crew.medical,
      m.crew.dayWorkers, m.crew.entertainment,
    ];
    const commItems = [m.communications.phone, m.communications.satTV, m.communications.satcom];
    const opItems = [
      m.operations.agency, m.operations.audioVisual, m.operations.auto, m.operations.bridge,
      m.operations.computer, m.operations.deck, m.operations.dockExpress, m.operations.engineering,
      m.operations.fuels, m.operations.galley, m.operations.interior, m.operations.launches,
      m.operations.mailFreight, m.operations.office, m.operations.dockage, m.operations.safetyMedical,
      m.operations.security, m.operations.survey, m.operations.warehousing,
    ];
    const insItems = [m.insurance.hull, m.insurance.pi, m.insurance.crewHealth];
    const adminItems = [m.administrative.professionalFees, m.administrative.bankCharges,
      m.administrative.managementFee, m.administrative.managementTravel];
    const capItems = [m.capital.av, m.capital.engineeringDeck, m.capital.interior,
      m.capital.paint, m.capital.tendersToys, m.capital.other];
    const all = [...crewItems, ...commItems, ...opItems, ...insItems, ...adminItems, ...capItems];
    return sectionTotal(all);
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
              <span className="text-xs" style={{ color: "var(--navy-400)" }}>Running ownership analysis — this takes ~30 seconds…</span>
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
          const opTotal = sectionTotal([
            model.operations.agency, model.operations.audioVisual, model.operations.auto, model.operations.bridge,
            model.operations.computer, model.operations.deck, model.operations.dockExpress, model.operations.engineering,
            model.operations.fuels, model.operations.galley, model.operations.interior, model.operations.launches,
            model.operations.mailFreight, model.operations.office, model.operations.dockage, model.operations.safetyMedical,
            model.operations.security, model.operations.survey, model.operations.warehousing,
          ]);
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
              <div className="grid grid-cols-3 gap-3 mb-6">
                {([["LOW", gt.low, "#4ade80"], ["MID", gt.mid, "#facc15"], ["HIGH", gt.high, "#f87171"]] as [string, number, string][]).map(([label, val, color]) => (
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
                        <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#4ade80" }}>Low</th>
                        <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#facc15" }}>Mid</th>
                        <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color: "#f87171" }}>High</th>
                      </tr>
                    </thead>
                    <tbody>
                      <SectionHeader label="CREW" />
                      {model.crew.salaries.breakdown?.map(r => (
                        <Row key={r.role} label={`  ${r.role}`} s={r} />
                      ))}
                      <Row label="Recruitment Fees" s={model.crew.recruitment} />
                      <Row label="Travel" s={model.crew.travel} />
                      <Row label="Accommodation" s={model.crew.accommodation} />
                      <Row label="Uniforms" s={model.crew.uniforms} />
                      <Row label="Training & Certification" s={model.crew.training} />
                      <Row label="Food & Beverages" s={model.crew.foodBeverage} />
                      <Row label="Medical Expenses" s={model.crew.medical} />
                      <Row label="Day Workers & Delivery Crew" s={model.crew.dayWorkers} />
                      <Row label="Entertainment" s={model.crew.entertainment} />
                      <Row label="TOTAL CREW" s={crewTotal} bold />

                      <SectionHeader label="COMMUNICATIONS" />
                      <Row label="Phone & Cellular" s={model.communications.phone} />
                      <Row label="Sat TV" s={model.communications.satTV} />
                      <Row label="Satcom / Data (Starlink or equivalent)" s={model.communications.satcom} />
                      <Row label="TOTAL COMMUNICATIONS" s={commTotal} bold />

                      <SectionHeader label="OPERATIONS" />
                      <Row label="Agency" s={model.operations.agency} />
                      <Row label="Audio Visual" s={model.operations.audioVisual} />
                      <Row label="Auto" s={model.operations.auto} />
                      <Row label="Bridge" s={model.operations.bridge} />
                      <Row label="Computer" s={model.operations.computer} />
                      <Row label="Deck" s={model.operations.deck} />
                      <Row label="Dock Express / Shipping" s={model.operations.dockExpress} />
                      <Row label="Engineering" s={model.operations.engineering} />
                      <Row label="Fuels & Lubricants" s={model.operations.fuels} />
                      <Row label="Galley" s={model.operations.galley} />
                      <Row label="Interior" s={model.operations.interior} />
                      <Row label="Launches & Tenders" s={model.operations.launches} />
                      <Row label="Mail & Freight" s={model.operations.mailFreight} />
                      <Row label="Office" s={model.operations.office} />
                      <Row label="Ports, Dockage & Customs" s={model.operations.dockage} />
                      <Row label="Safety & Medical" s={model.operations.safetyMedical} />
                      <Row label="Security" s={model.operations.security} />
                      <Row label="Survey & Certification" s={model.operations.survey} />
                      <Row label="Warehousing & Storage" s={model.operations.warehousing} />
                      <Row label="TOTAL OPERATIONS" s={opTotal} bold />

                      <SectionHeader label="INSURANCE" />
                      <Row label="Hull & Machinery" s={model.insurance.hull} />
                      <Row label="Protection & Indemnity" s={model.insurance.pi} />
                      <Row label="Crew Health Insurance" s={model.insurance.crewHealth} />
                      <Row label="TOTAL INSURANCE" s={insTotal} bold />

                      <SectionHeader label="ADMINISTRATIVE" />
                      <Row label="Professional Fees" s={model.administrative.professionalFees} />
                      <Row label="Bank Charges" s={model.administrative.bankCharges} />
                      <Row label="Management Fee" s={model.administrative.managementFee} />
                      <Row label="Management Travel" s={model.administrative.managementTravel} />
                      <Row label="TOTAL ADMINISTRATIVE" s={adminTotal} bold />

                      <SectionHeader label="CAPITAL IMPROVEMENTS" />
                      <Row label="AV" s={model.capital.av} />
                      <Row label="Engineering / Deck" s={model.capital.engineeringDeck} />
                      <Row label="Interior" s={model.capital.interior} />
                      <Row label="Paint" s={model.capital.paint} />
                      <Row label="Tenders / Toys" s={model.capital.tendersToys} />
                      <Row label="Other" s={model.capital.other} />
                      <Row label="TOTAL CAPITAL" s={capTotal} bold />

                      <tr><td colSpan={4} className="pt-6" /></tr>
                      <Row label="GRAND TOTAL" s={gt} bold />
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
