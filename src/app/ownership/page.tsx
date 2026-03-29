"use client";
import React from "react";
import PageShell from "../components/PageShell";

type Scenario = { low: number; mid: number; high: number };
type EditOverrides = { [section: string]: { [key: string]: Partial<Scenario> } };

type CostModel = {
  crew: {
    salaries: Scenario & { breakdown: { role: string; low: number; mid: number; high: number }[] };
    recruitment: Scenario; travel: Scenario; accommodation: Scenario; uniforms: Scenario;
    training: Scenario; foodBeverage: Scenario; medical: Scenario; dayWorkers: Scenario; entertainment: Scenario;
  };
  communications: { phone: Scenario; satTV: Scenario; satcom: Scenario; };
  operations: {
    agency: Scenario; audioVisual: Scenario; auto: Scenario; bridge: Scenario; computer: Scenario;
    deck: Scenario; dockExpress: Scenario; engineering: Scenario; fuels: Scenario; galley: Scenario;
    interior: Scenario; launches: Scenario; mailFreight: Scenario; office: Scenario; dockage: Scenario;
    safetyMedical: Scenario; security: Scenario; survey: Scenario; warehousing: Scenario;
  };
  insurance: { hull: Scenario; pi: Scenario; crewHealth: Scenario; };
  administrative: { professionalFees: Scenario; bankCharges: Scenario; managementFee: Scenario; managementTravel: Scenario; };
  capital: { av: Scenario; engineeringDeck: Scenario; interior: Scenario; paint: Scenario; tendersToys: Scenario; other: Scenario; };
  assumptions: string; rangeExplanation: string; categoryBreakdown: string;
  crewStructureNote: string; keyDrivers: string; vesselName: string; vesselUrl: string;
};

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
function sectionTotal(items: Scenario[]): Scenario {
  return { low: items.reduce((a,b)=>a+b.low,0), mid: items.reduce((a,b)=>a+b.mid,0), high: items.reduce((a,b)=>a+b.high,0) };
}
type ShowScenarios = { low: boolean; mid: boolean; high: boolean };
function colCount(show: ShowScenarios) { return 1+(show.low?1:0)+(show.mid?1:0)+(show.high?1:0); }

function SectionHeader({ label, show }: { label: string; show: ShowScenarios }) {
  return (
    <tr>
      <td colSpan={colCount(show)} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>{label}</td>
    </tr>
  );
}

function TotalRow({ label, s, show }: { label: string; s: Scenario; show: ShowScenarios }) {
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <td className="py-2 pr-4 text-sm font-bold" style={{ color: "var(--brass-400)" }}>{label}</td>
      {show.low  && <td className="py-2 px-3 text-sm text-right font-bold" style={{ color: "#4ade80" }}>{fmt(s.low)}</td>}
      {show.mid  && <td className="py-2 px-3 text-sm text-right font-bold" style={{ color: "#facc15" }}>{fmt(s.mid)}</td>}
      {show.high && <td className="py-2 px-3 text-sm text-right font-bold" style={{ color: "#f87171" }}>{fmt(s.high)}</td>}
    </tr>
  );
}

function EditRow({
  label, fieldKey, section, show, edits, model, setVal,
}: {
  label: string; fieldKey: string; section: string; show: ShowScenarios;
  edits: EditOverrides; model: CostModel; setVal: (sec: string, key: string, sc: keyof Scenario, v: string) => void;
}) {
  const base = (model as any)[section][fieldKey] as Scenario;
  const scenarios: (keyof Scenario)[] = ["low","mid","high"];
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <td className="py-2 pr-4 text-sm" style={{ color: "var(--foreground)" }}>{label}</td>
      {scenarios.filter(s => show[s]).map(s => {
        const edited = edits[section]?.[fieldKey]?.[s] !== undefined;
        const val = edited ? edits[section][fieldKey][s] : base[s];
        return (
          <td key={s} className="py-1 px-2">
            <input
              type="number"
              value={val}
              onFocus={e => e.target.select()}
              onChange={e => setVal(section, fieldKey, s, e.target.value)}
              className="text-sm text-right rounded px-2 py-1"
              style={{
                background: edited ? "rgba(197,160,100,.12)" : "var(--input,rgba(255,255,255,.06))",
                border: edited ? "1px solid var(--brass-400)" : "1px solid var(--border)",
                color: "var(--foreground)", width: "110px", outline: "none",
              }}
            />
          </td>
        );
      })}
    </tr>
  );
}

export default function OwnershipPage() {
  const [url, setUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<CostModel | null>(null);
  const [error, setError] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [edits, setEdits] = React.useState<EditOverrides>({});
  const [activeTab, setActiveTab] = React.useState<"table"|"analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({ low: false, mid: true, high: false });

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.low && !next.mid && !next.high) return prev;
      return next;
    });
  }

  function setVal(section: string, key: string, sc: keyof Scenario, raw: string) {
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    const val = isNaN(parsed) ? 0 : parsed;
    setEdits(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section]?.[key], [sc]: val } },
    }));
  }

  function getVal(section: string, key: string, sc: keyof Scenario): number {
    if (!model) return 0;
    const override = edits[section]?.[key]?.[sc];
    if (override !== undefined) return override;
    return ((model as any)[section][key] as Scenario)[sc];
  }

  // Crew role breakdown uses a flat lookup keyed by role name
  function getCrewRoleVal(role: string, sc: keyof Scenario): number {
    const roleKey = `role__${role}`;
    const override = edits["crew_roles"]?.[roleKey]?.[sc];
    if (override !== undefined) return override;
    // fall back to the breakdown item for this role
    return model?.crew.salaries.breakdown?.find(r => r.role === role)?.[sc] ?? 0;
  }

  function setCrewRoleVal(role: string, sc: keyof Scenario, raw: string) {
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
    const val = isNaN(parsed) ? 0 : parsed;
    const roleKey = `role__${role}`;
    setEdits(prev => ({
      ...prev,
      crew_roles: { ...prev["crew_roles"], [roleKey]: { ...prev["crew_roles"]?.[roleKey], [sc]: val } },
    }));
  }

  function crewSalariesTotal(): Scenario {
    if (!model) return { low: 0, mid: 0, high: 0 };
    const roles = model.crew.salaries.breakdown ?? [];
    if (roles.length === 0) return { low: getVal("crew","salaries","low"), mid: getVal("crew","salaries","mid"), high: getVal("crew","salaries","high") };
    return {
      low:  roles.reduce((a, r) => a + getCrewRoleVal(r.role, "low"),  0),
      mid:  roles.reduce((a, r) => a + getCrewRoleVal(r.role, "mid"),  0),
      high: roles.reduce((a, r) => a + getCrewRoleVal(r.role, "high"), 0),
    };
  }

  function effectiveTotal(section: string, keys: string[]): Scenario {
    return {
      low:  keys.reduce((a,k)=>a+getVal(section,k,"low"),0),
      mid:  keys.reduce((a,k)=>a+getVal(section,k,"mid"),0),
      high: keys.reduce((a,k)=>a+getVal(section,k,"high"),0),
    };
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
    } finally {
      setPdfLoading(false);
    }
  }

  async function generate() {
    if (!url.trim()) return;
    setLoading(true); setError(""); setModel(null);
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
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const crewKeys = ["recruitment","travel","accommodation","uniforms","training","foodBeverage","medical","dayWorkers","entertainment"];
  const commKeys = ["phone","satTV","satcom"];
  const opKeys   = ["agency","audioVisual","auto","bridge","computer","deck","dockExpress","engineering","fuels","galley","interior","launches","mailFreight","office","dockage","safetyMedical","security","survey","warehousing"];
  const insKeys  = ["hull","pi","crewHealth"];
  const adminKeys= ["professionalFees","bankCharges","managementFee","managementTravel"];
  const capKeys  = ["av","engineeringDeck","interior","paint","tendersToys","other"];

  function grandTotal(): Scenario {
    if (!model) return { low:0, mid:0, high:0 };
    const cst = crewSalariesTotal();
    const ct = effectiveTotal("crew", crewKeys);
    const allSections = [
      { low: cst.low+ct.low, mid: cst.mid+ct.mid, high: cst.high+ct.high },
      effectiveTotal("communications", commKeys),
      effectiveTotal("operations", opKeys),
      effectiveTotal("insurance", insKeys),
      effectiveTotal("administrative", adminKeys),
      effectiveTotal("capital", capKeys),
    ];
    return sectionTotal(allSections);
  }

  const eRow = (label: string, fieldKey: string, section: string) => (
    <EditRow key={fieldKey} label={label} fieldKey={fieldKey} section={section}
      show={showScenarios} edits={edits} model={model!} setVal={setVal} />
  );

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--brass-400)" }}>Annual Ownership Cost Model</h1>
          <p className="text-sm" style={{ color: "var(--navy-400)" }}>
            Paste any YachtWorld listing URL to generate a full structured ownership cost analysis — Low / Mid / High scenarios.
          </p>
        </div>

        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <label className="block text-xs uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Listing URL</label>
          <div className="flex gap-3">
            <input
              className="flex-1 rounded-lg text-sm px-3 py-2.5"
              style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://www.yachtworld.com/yacht/..."
              onKeyDown={e => e.key === "Enter" && generate()}
            />
            <button onClick={generate} disabled={loading || !url.trim()} className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={{ background: loading||!url.trim()?"var(--border)":"var(--brass-400)", color: loading||!url.trim()?"var(--navy-400)":"#fff", cursor: loading||!url.trim()?"not-allowed":"pointer" }}>
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
          const gt = grandTotal();
          const cst = crewSalariesTotal();
          const crewRest = effectiveTotal("crew", crewKeys);
          const crewTotal: Scenario = { low: cst.low+crewRest.low, mid: cst.mid+crewRest.mid, high: cst.high+crewRest.high };
          const commTotal  = effectiveTotal("communications", commKeys);
          const opTotal    = effectiveTotal("operations", opKeys);
          const insTotal   = effectiveTotal("insurance", insKeys);
          const adminTotal = effectiveTotal("administrative", adminKeys);
          const capTotal   = effectiveTotal("capital", capKeys);

          return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>Annual Ownership Cost Model · <span style={{color:"var(--brass-400)"}}>Gold border = edited value</span></p>
                </div>
                <div className="flex gap-2">
                  {(["table","analysis"] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize"
                      style={{ background: activeTab===t?"var(--brass-400)":"var(--card)", color: activeTab===t?"#fff":"var(--navy-400)", border: "1px solid var(--border)" }}>{t}</button>
                  ))}
                  <button onClick={downloadPDF} disabled={pdfLoading} className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    style={{ background: pdfLoading?"var(--border)":"#1e3a5f", color: pdfLoading?"var(--navy-400)":"#93c5fd", border: "1px solid #3b82f640", cursor: pdfLoading?"not-allowed":"pointer" }}>
                    {pdfLoading ? "Generating…" : "⬇ Save PDF"}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 mb-4">
                <span className="text-xs mr-2" style={{ color: "var(--navy-400)" }}>Show:</span>
                {([["low","#4ade80","Low"],["mid","#facc15","Mid"],["high","#f87171","High"]] as [keyof ShowScenarios,string,string][]).map(([key,color,label]) => (
                  <button key={key} onClick={() => toggleScenario(key)} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={{ background: showScenarios[key]?`${color}20`:"var(--card)", color: showScenarios[key]?color:"var(--navy-400)", border: `1px solid ${showScenarios[key]?color+"60":"var(--border)"}` }}>
                    <span style={{ width:12,height:12,borderRadius:3,border:`1.5px solid ${showScenarios[key]?color:"var(--navy-400)"}`,background:showScenarios[key]?color:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                      {showScenarios[key] && <span style={{ color:"#000",fontSize:8,fontWeight:900,lineHeight:1 }}>✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${colCount(showScenarios)-1||1},1fr)` }}>
                {([["low","LOW",gt.low,"#4ade80"],["mid","MID",gt.mid,"#facc15"],["high","HIGH",gt.high,"#f87171"]] as [keyof ShowScenarios,string,number,string][])
                  .filter(([key]) => showScenarios[key]).map(([,label,val,color]) => (
                  <div key={label} className="rounded-xl p-4 text-center" style={{ background:"var(--card)", border:`1px solid ${color}40` }}>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label} SCENARIO</p>
                    <p className="text-2xl font-bold" style={{ color }}>{fmt(val)}</p>
                    <p className="text-xs mt-0.5" style={{ color:"var(--navy-400)" }}>per year</p>
                  </div>
                ))}
              </div>

              {activeTab === "table" && (
                <div className="rounded-xl p-5" style={{ background:"var(--card)", border:"1px solid var(--border)", overflowX:"auto" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom:"1px solid rgba(184,147,58,.3)" }}>
                        <th className="text-left pb-2 text-xs uppercase tracking-wider" style={{ color:"var(--navy-400)" }}>Category</th>
                        {showScenarios.low  && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color:"#4ade80" }}>Low</th>}
                        {showScenarios.mid  && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color:"#facc15" }}>Mid</th>}
                        {showScenarios.high && <th className="text-right pb-2 text-xs uppercase tracking-wider px-3" style={{ color:"#f87171" }}>High</th>}
                      </tr>
                    </thead>
                    <tbody>

                      <SectionHeader show={showScenarios} label="CREW" />
                      {model.crew.salaries.breakdown?.map(r => (
                        <tr key={r.role} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <td className="py-2 pr-4 text-sm" style={{ color: "var(--foreground)", paddingLeft: "1rem" }}>  {r.role}</td>
                          {(["low","mid","high"] as (keyof Scenario)[]).filter(s => showScenarios[s]).map(s => {
                            const roleKey = `role__${r.role}`;
                            const edited = edits["crew_roles"]?.[roleKey]?.[s] !== undefined;
                            const val = edited ? edits["crew_roles"][roleKey][s] : r[s];
                            return (
                              <td key={s} className="py-1 px-2">
                                <input type="number" value={val}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setCrewRoleVal(r.role, s, e.target.value)}
                                  className="text-sm text-right rounded px-2 py-1"
                                  style={{ background: edited?"rgba(197,160,100,.12)":"var(--input,rgba(255,255,255,.06))", border: edited?"1px solid var(--brass-400)":"1px solid var(--border)", color:"var(--foreground)", width:"110px", outline:"none" }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      {eRow("Recruitment Fees",  "recruitment",   "crew")}
                      {eRow("Travel",            "travel",        "crew")}
                      {eRow("Accommodation",     "accommodation", "crew")}
                      {eRow("Uniforms",          "uniforms",      "crew")}
                      {eRow("Training & Certification", "training","crew")}
                      {eRow("Food & Beverages",  "foodBeverage",  "crew")}
                      {eRow("Medical Expenses",  "medical",       "crew")}
                      {eRow("Day Workers & Delivery Crew","dayWorkers","crew")}
                      {eRow("Entertainment",     "entertainment", "crew")}
                      <TotalRow show={showScenarios} label="TOTAL CREW" s={crewTotal} />

                      <SectionHeader show={showScenarios} label="COMMUNICATIONS" />
                      {eRow("Phone & Cellular",                  "phone",  "communications")}
                      {eRow("Sat TV",                            "satTV",  "communications")}
                      {eRow("Satcom / Data (Starlink or equiv)", "satcom", "communications")}
                      <TotalRow show={showScenarios} label="TOTAL COMMUNICATIONS" s={commTotal} />

                      <SectionHeader show={showScenarios} label="OPERATIONS" />
                      {eRow("Agency",                   "agency",        "operations")}
                      {eRow("Audio Visual",             "audioVisual",   "operations")}
                      {eRow("Auto",                     "auto",          "operations")}
                      {eRow("Bridge",                   "bridge",        "operations")}
                      {eRow("Computer",                 "computer",      "operations")}
                      {eRow("Deck",                     "deck",          "operations")}
                      {eRow("Dock Express / Shipping",  "dockExpress",   "operations")}
                      {eRow("Engineering",              "engineering",   "operations")}
                      {eRow("Fuels & Lubricants",       "fuels",         "operations")}
                      {eRow("Galley",                   "galley",        "operations")}
                      {eRow("Interior",                 "interior",      "operations")}
                      {eRow("Launches & Tenders",       "launches",      "operations")}
                      {eRow("Mail & Freight",           "mailFreight",   "operations")}
                      {eRow("Office",                   "office",        "operations")}
                      {eRow("Ports, Dockage & Customs", "dockage",       "operations")}
                      {eRow("Safety & Medical",         "safetyMedical", "operations")}
                      {eRow("Security",                 "security",      "operations")}
                      {eRow("Survey & Certification",   "survey",        "operations")}
                      {eRow("Warehousing & Storage",    "warehousing",   "operations")}
                      <TotalRow show={showScenarios} label="TOTAL OPERATIONS" s={opTotal} />

                      <SectionHeader show={showScenarios} label="INSURANCE" />
                      {eRow("Hull & Machinery",       "hull",       "insurance")}
                      {eRow("Protection & Indemnity", "pi",         "insurance")}
                      {eRow("Crew Health Insurance",  "crewHealth", "insurance")}
                      <TotalRow show={showScenarios} label="TOTAL INSURANCE" s={insTotal} />

                      <SectionHeader show={showScenarios} label="ADMINISTRATIVE" />
                      {eRow("Professional Fees",   "professionalFees",  "administrative")}
                      {eRow("Bank Charges",        "bankCharges",       "administrative")}
                      {eRow("Management Fee",      "managementFee",     "administrative")}
                      {eRow("Management Travel",   "managementTravel",  "administrative")}
                      <TotalRow show={showScenarios} label="TOTAL ADMINISTRATIVE" s={adminTotal} />

                      <SectionHeader show={showScenarios} label="CAPITAL IMPROVEMENTS" />
                      {eRow("AV",                "av",             "capital")}
                      {eRow("Engineering / Deck","engineeringDeck","capital")}
                      {eRow("Interior",          "interior",       "capital")}
                      {eRow("Paint",             "paint",          "capital")}
                      {eRow("Tenders / Toys",    "tendersToys",    "capital")}
                      {eRow("Other",             "other",          "capital")}
                      <TotalRow show={showScenarios} label="TOTAL CAPITAL" s={capTotal} />

                      <tr><td colSpan={colCount(showScenarios)} className="pt-6" /></tr>
                      <TotalRow show={showScenarios} label="GRAND TOTAL" s={gt} />

                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "analysis" && (
                <div className="space-y-4">
                  {([
                    ["Use Assumptions", model.assumptions],
                    ["Cost Range Explanation", model.rangeExplanation],
                    ["Category Breakdown", model.categoryBreakdown],
                    ["Crew Structure Note", model.crewStructureNote],
                    ["Key Cost Drivers", model.keyDrivers],
                  ] as [string,string][]).map(([title,content]) => (
                    <div key={title} className="rounded-xl p-5" style={{ background:"var(--card)", border:"1px solid var(--border)" }}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color:"var(--brass-400)" }}>{title}</p>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color:"var(--foreground)" }}>{content}</p>
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
