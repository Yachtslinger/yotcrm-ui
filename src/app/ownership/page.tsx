"use client";
import React from "react";
import PageShell from "../components/PageShell";

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Scenario = { low: number; mid: number; high: number };
type ShowScenarios = { low: boolean; mid: boolean; high: boolean };

type CostModel = {
  vesselName: string;
  vesselUrl: string;
  segment?: "super" | "small";
  crewMode?: "owner" | "captain" | "captain_mate";
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
  communications: { phone: Scenario; satTV: Scenario; satcom: Scenario };
  operations: {
    agency: Scenario; audioVisual: Scenario; auto: Scenario; bridge: Scenario;
    computer: Scenario; deck: Scenario; dockExpress: Scenario; engineering: Scenario;
    fuels: Scenario; galley: Scenario; interior: Scenario; launches: Scenario;
    mailFreight: Scenario; office: Scenario; dockage: Scenario; safetyMedical: Scenario;
    security: Scenario; survey: Scenario; warehousing: Scenario;
  };
  insurance: { hull: Scenario; pi: Scenario; crewHealth: Scenario };
  administrative: {
    professionalFees: Scenario; bankCharges: Scenario;
    managementFee: Scenario; managementTravel: Scenario;
  };
  capital: {
    av: Scenario; engineeringDeck: Scenario; interior: Scenario;
    paint: Scenario; tendersToys: Scenario; other: Scenario;
  };
  assumptions: string;
  rangeExplanation: string;
  categoryBreakdown: string;
  crewStructureNote: string;
  keyDrivers: string;
};

/* ─── Static configuration ───────────────────────────────────────────────── */
const HOME_PORTS = [
  "Florida / US East Coast",
  "US Gulf Coast",
  "US West Coast",
  "Caribbean",
  "Mediterranean",
  "Pacific Northwest / Alaska",
  "Worldwide / Expedition",
];

const VESSEL_STYLES = [
  "Luxury / Full Fairing & Paint",
  "Production / Standard Finish",
  "Explorer / Commercial Finish",
];

const CATEGORY_EXAMPLES: Record<string, { desc: string; items: string[] }> = {
  CREW: {
    desc: "All costs to hire, compensate, travel, and support the professional crew year-round.",
    items: [
      "Captain, First Mate / Engineer, Chef, Stewardess(es), Deckhand(s) — annual salaries",
      "Recruitment agency fees (typically 10–15% of first-year salary per placement)",
      "Crew rotation flights and ground transportation between vessel and home",
      "Shoreside accommodation during shipyard periods or between programs",
      "Uniforms, foul-weather gear, and deck shoes",
      "STCW / MCA / flag-state certifications and refresher courses",
      "Crew provisions and daily meals aboard",
      "Annual physicals, dental, and crew medical kits",
      "Day workers and delivery crew during yard periods or short-handed legs",
      "Crew entertainment and morale budget at port calls",
    ],
  },
  COMMUNICATIONS: {
    desc: "Connectivity, satellite services, and all onboard communications costs.",
    items: [
      "Captain and crew mobile phone plans (local SIMs and international roaming)",
      "Onboard satellite TV package (DirecTV, SKY, or regional provider)",
      "Starlink Maritime, KVH, or Inmarsat Fleet One broadband data plan",
      "Satellite phone airtime and top-up credits",
      "Vessel email and weather-routing service subscriptions (e.g. PredictWind, Iridium GO)",
    ],
  },
  OPERATIONS: {
    desc: "Day-to-day running costs across every department — deck, engineering, interior, galley, and shore logistics.",
    items: [
      "Agency: port agent fees, cruising permits, transit licences, clearance paperwork",
      "Audio Visual: streaming subscriptions, media server licences, AV equipment repair",
      "Auto: onboard vehicle lease, courtesy car, taxis and ground transport at ports",
      "Bridge: charts, software updates (e.g. Navionics, C-MAP), pilot books, nav instruments",
      "Computer: vessel IT, software licences, network hardware, printers, satellite Wi-Fi routers",
      "Deck: lines, fenders, blocks, winches, running rigging, antifouling, deck consumables",
      "Dock Express / Shipping: DHL, FedEx, courier deliveries of parts and equipment",
      "Engineering: routine engine, generator, and systems servicing; filters, seals, spares, fluids",
      "Fuels & Lubricants: diesel for main engines, petrol for tenders, engine oils and greases",
      "Galley: food, wines, spirits, and all provisions for owner/guests aboard",
      "Interior: soft furnishings, laundry consumables, flowers, guest welcome amenities",
      "Launches & Tenders: fuel, routine maintenance, and insurance for tenders and water toys",
      "Mail & Freight: outbound couriers and document handling",
      "Office: stationery, postage, and admin supplies",
      "Ports, Dockage & Customs: marina berth fees, anchor-port fees, customs and clearance charges",
      "Safety & Medical: EPIRB, flares, fire-suppression recharges, first-aid restock, safety drills",
      "Security: yacht security watches in port, ISPS compliance costs, safe deposit",
      "Survey & Certification: annual flag-state, class, or insurance-required surveys",
      "Warehousing & Storage: off-season equipment storage, bonded stores, winter lay-up costs",
    ],
  },
  INSURANCE: {
    desc: "All insurance policies protecting the vessel, owner's liability, and crew welfare.",
    items: [
      "Hull & Machinery (H&M): physical loss or damage to the vessel — typically 1.0–1.5% of insured value per year",
      "Protection & Indemnity (P&I): third-party liability, wreck removal, oil-pollution liability",
      "Crew Health Insurance: comprehensive medical, dental, and emergency repatriation for all full-time crew",
    ],
  },
  ADMINISTRATIVE: {
    desc: "Professional services, management overhead, and corporate costs of owning the vessel.",
    items: [
      "Professional Fees: maritime lawyers, flag-state registration, offshore corporate structure, accountants",
      "Bank Charges: vessel operating account fees, international wire charges, currency conversion costs",
      "Management Fee: yacht management company charge — typically 5–10% of operating budget if used",
      "Management Travel: manager site visits, owner meetings, yard-period supervision, captain reviews",
    ],
  },
  "CAPITAL IMPROVEMENTS": {
    desc: "Annualised reserves for planned major expenditure and discretionary capital upgrades.",
    items: [
      "AV: new entertainment systems, satcom hardware upgrades, camera and sound system replacement",
      "Engineering / Deck: major engine overhauls, generator set replacement, windlass, bow/stern thruster, stabiliser service",
      "Interior: full soft-goods refresh, upholstery replacement, headliner renewal, galley equipment upgrades",
      "Paint: full hull fairing and topcoat — GRP every 5–7 years; steel/aluminium every 3–5 years; Explorer / commercial finish may use roll-and-tip only at significantly lower cost",
      "Tenders / Toys: tender replacement or full refit, jet ski, dive equipment, water toys and slides",
      "Other: contingency reserve for unexpected capital items, osmosis treatment, diver costs",
    ],
  },
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  if (n < 0) return "−$" + Math.round(-n).toLocaleString("en-US");
  return "$" + Math.round(n).toLocaleString("en-US");
}

function sectionTotal(items: Scenario[]): Scenario {
  return {
    low: items.reduce((a, b) => a + b.low, 0),
    mid: items.reduce((a, b) => a + b.mid, 0),
    high: items.reduce((a, b) => a + b.high, 0),
  };
}

function colCount(show: ShowScenarios) {
  return 1 + (show.low ? 1 : 0) + (show.mid ? 1 : 0) + (show.high ? 1 : 0);
}

function parseLoaToFeet(loa: string): number {
  if (!loa) return 100;
  const mMatch = loa.match(/([\d.]+)\s*m/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 3.28084);
  const ftMatch = loa.match(/([\d.]+)\s*(ft|')/i);
  if (ftMatch) return parseFloat(ftMatch[1]);
  const num = parseFloat(loa);
  if (!isNaN(num)) return num > 25 ? num : Math.round(num * 3.28084);
  return 100;
}

/* ─── SectionHeader ───────────────────────────────────────────────────────── */
function SectionHeader({ label, show }: { label: string; show: ShowScenarios }) {
  return (
    <tr>
      <td colSpan={colCount(show)} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>
        {label}
      </td>
    </tr>
  );
}

/* ─── Row (with inline editing) ──────────────────────────────────────────── */
interface RowProps {
  label: string;
  path: string;
  effective: Scenario;
  bold?: boolean;
  show: ShowScenarios;
  overrides: Record<string, number>;
  onOverride: (key: string, value: number) => void;
  onResetRow: (path: string) => void;
}

function Row({ label, path, effective, bold, show, overrides, onOverride, onResetRow }: RowProps) {
  const [editSc, setEditSc] = React.useState<keyof Scenario | null>(null);
  const [editVal, setEditVal] = React.useState("");

  function startEdit(sc: keyof Scenario) {
    if (bold) return;
    setEditSc(sc);
    setEditVal(String(Math.round(effective[sc])));
  }

  function saveEdit() {
    if (editSc === null) return;
    const num = parseFloat(editVal.replace(/[$,\s−-]/g, ""));
    if (!isNaN(num) && num >= 0) onOverride(`${path}.${editSc}`, num);
    setEditSc(null);
  }

  const hasRowOverride = !bold && (
    overrides[`${path}.low`] !== undefined ||
    overrides[`${path}.mid`] !== undefined ||
    overrides[`${path}.high`] !== undefined
  );

  const scColors: Record<keyof Scenario, string> = { low: "#4ade80", mid: "#facc15", high: "#f87171" };

  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <td style={{
        padding: "8px 16px 8px 0", fontSize: 13,
        color: bold ? "var(--brass-400)" : "var(--foreground)",
        fontWeight: bold ? 700 : 400,
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {label}
          {hasRowOverride && (
            <button onClick={() => onResetRow(path)} title="Reset to model values"
              style={{ fontSize: 10, color: "#fb923c", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>
              ↺
            </button>
          )}
        </span>
      </td>
      {(["low", "mid", "high"] as (keyof Scenario)[]).map(sc => {
        if (!show[sc]) return null;
        const color = scColors[sc];
        const isEditing = !bold && editSc === sc;
        const isOverridden = !bold && overrides[`${path}.${sc}`] !== undefined;
        return (
          <td key={sc} onClick={() => !bold && !isEditing && startEdit(sc)}
            title={!bold ? "Click to edit" : undefined}
            style={{ padding: "8px 12px", textAlign: "right", cursor: bold ? "default" : "text", minWidth: 100 }}>
            {isEditing ? (
              <input autoFocus value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditSc(null); }}
                style={{
                  background: "transparent", border: `1px solid ${color}`, borderRadius: 4,
                  color, fontSize: 13, textAlign: "right", width: 90, padding: "2px 6px", outline: "none",
                }}
              />
            ) : (
              <span style={{
                fontSize: 13,
                color: bold ? color : isOverridden ? "#fb923c" : "var(--foreground)",
                fontWeight: bold ? 700 : 400,
                display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
              }}>
                {isOverridden && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fb923c", flexShrink: 0 }} />}
                {fmt(effective[sc])}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/* ─── CategoryExamples ────────────────────────────────────────────────────── */
function CategoryExamples() {
  const [expanded, setExpanded] = React.useState(false);
  const [openCat, setOpenCat] = React.useState<string | null>(null);

  return (
    <div className="rounded-xl mt-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <button
        onClick={() => { setExpanded(e => !e); if (expanded) setOpenCat(null); }}
        style={{
          width: "100%", padding: "14px 20px", display: "flex", alignItems: "center",
          justifyContent: "space-between", background: "none", border: "none", cursor: "pointer",
        }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--brass-400)" }}>
          Category Reference Guide — What's Included in Each Line Item
        </span>
        <span style={{ fontSize: 12, color: "var(--navy-400)" }}>{expanded ? "▲ Collapse" : "▼ Expand"}</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
          {Object.entries(CATEGORY_EXAMPLES).map(([cat, { desc, items }]) => (
            <div key={cat} style={{ marginTop: 16 }}>
              <button
                onClick={() => setOpenCat(o => o === cat ? null : cat)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", background: "none", border: "none", cursor: "pointer",
                  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.06)",
                }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brass-400)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{cat}</span>
                <span style={{ fontSize: 12, color: "var(--navy-400)" }}>{openCat === cat ? "▲" : "▼"}</span>
              </button>
              <p style={{ fontSize: 12, color: "var(--navy-400)", margin: "6px 0 8px", lineHeight: 1.5 }}>{desc}</p>
              {openCat === cat && (
                <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                  {items.map((item, i) => (
                    <li key={i} style={{ fontSize: 12, color: "var(--foreground)", opacity: 0.72, marginBottom: 4, lineHeight: 1.6 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function OwnershipPage() {
  // Form / pre-gen state
  const [url, setUrl] = React.useState("");
  const [segment, setSegment] = React.useState<"super" | "small">("super");
  const [crewMode, setCrewMode] = React.useState<"owner" | "captain" | "captain_mate">("captain");
  const [annualHours, setAnnualHours] = React.useState(800);
  const [charterWeeks, setCharterWeeks] = React.useState(0);
  const [homePort, setHomePort] = React.useState("Florida / US East Coast");
  const [vesselStyle, setVesselStyle] = React.useState("Luxury / Full Fairing & Paint");

  // Generate state
  const [loading, setLoading] = React.useState(false);
  const [model, setModel] = React.useState<CostModel | null>(null);
  const [error, setError] = React.useState("");
  const [pdfLoading, setPdfLoading] = React.useState(false);

  // Display state
  const [activeTab, setActiveTab] = React.useState<"table" | "analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({ low: false, mid: true, high: false });

  // Post-gen realtime adjustment state
  const [baseHours, setBaseHours] = React.useState(800);
  const [adjustHours, setAdjustHours] = React.useState(800);
  const [adjustCharterWeeks, setAdjustCharterWeeks] = React.useState(0);
  const [vesselLoaFt, setVesselLoaFt] = React.useState(100);

  // Manual override state
  const [overrides, setOverrides] = React.useState<Record<string, number>>({});

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.low && !next.mid && !next.high) return prev;
      return next;
    });
  }

  function handleOverride(key: string, value: number) {
    setOverrides(prev => ({ ...prev, [key]: value }));
  }

  function resetRow(path: string) {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[`${path}.low`]; delete next[`${path}.mid`]; delete next[`${path}.high`];
      return next;
    });
  }

  function resetAllOverrides() { setOverrides({}); }

  // Effective value: applies hours ratio (fuel only) then overrides
  function getEff(path: string, s: Scenario): Scenario {
    const ratio = baseHours > 0 ? adjustHours / baseHours : 1;
    const base = path === "operations.fuels"
      ? { low: s.low * ratio, mid: s.mid * ratio, high: s.high * ratio }
      : { ...s };
    return {
      low: overrides[`${path}.low`] ?? base.low,
      mid: overrides[`${path}.mid`] ?? base.mid,
      high: overrides[`${path}.high`] ?? base.high,
    };
  }

  // Charter revenue estimate (~$1,100/ft/week gross, 80% net mid)
  const charterRevenue = React.useMemo((): Scenario => {
    if (adjustCharterWeeks === 0) return { low: 0, mid: 0, high: 0 };
    const weeklyGross = vesselLoaFt * 1100;
    return {
      low: adjustCharterWeeks * weeklyGross * 0.60,
      mid: adjustCharterWeeks * weeklyGross * 0.78,
      high: adjustCharterWeeks * weeklyGross * 0.92,
    };
  }, [adjustCharterWeeks, vesselLoaFt]);

  const overrideCount = Object.keys(overrides).length;

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

  async function generate() {
    if (!url.trim()) return;
    setLoading(true); setError(""); setModel(null); setOverrides({});
    try {
      const scrapeRes = await fetch("/api/brochures/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.ok && !scrapeData.vessel) throw new Error(scrapeData.error || "Scrape failed");
      const vessel = scrapeData.vessel || {};
      setVesselLoaFt(parseLoaToFeet(vessel.loa || ""));
      const res = await fetch("/api/ownership/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vessel, url: url.trim(), annualHours, charterWeeks, homePort, vesselStyle, segment, crewMode }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generation failed");
      setModel(data.model);
      setBaseHours(annualHours);
      setAdjustHours(annualHours);
      setAdjustCharterWeeks(charterWeeks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Grand totals computed from effective values
  function grandTotals(m: CostModel): Scenario {
    const effectiveSalaries = m.crew.salaries.breakdown?.length
      ? sectionTotal(m.crew.salaries.breakdown.map(r => getEff(`crew.salaries.${r.role}`, r)))
      : getEff("crew.salaries", m.crew.salaries);
    const crewItems = [
      effectiveSalaries,
      getEff("crew.recruitment", m.crew.recruitment),
      getEff("crew.travel", m.crew.travel),
      getEff("crew.accommodation", m.crew.accommodation),
      getEff("crew.uniforms", m.crew.uniforms),
      getEff("crew.training", m.crew.training),
      getEff("crew.foodBeverage", m.crew.foodBeverage),
      getEff("crew.medical", m.crew.medical),
      getEff("crew.dayWorkers", m.crew.dayWorkers),
      getEff("crew.entertainment", m.crew.entertainment),
    ];
    const commItems = [
      getEff("communications.phone", m.communications.phone),
      getEff("communications.satTV", m.communications.satTV),
      getEff("communications.satcom", m.communications.satcom),
    ];
    const opItems = [
      getEff("operations.agency", m.operations.agency),
      getEff("operations.audioVisual", m.operations.audioVisual),
      getEff("operations.auto", m.operations.auto),
      getEff("operations.bridge", m.operations.bridge),
      getEff("operations.computer", m.operations.computer),
      getEff("operations.deck", m.operations.deck),
      getEff("operations.dockExpress", m.operations.dockExpress),
      getEff("operations.engineering", m.operations.engineering),
      getEff("operations.fuels", m.operations.fuels),
      getEff("operations.galley", m.operations.galley),
      getEff("operations.interior", m.operations.interior),
      getEff("operations.launches", m.operations.launches),
      getEff("operations.mailFreight", m.operations.mailFreight),
      getEff("operations.office", m.operations.office),
      getEff("operations.dockage", m.operations.dockage),
      getEff("operations.safetyMedical", m.operations.safetyMedical),
      getEff("operations.security", m.operations.security),
      getEff("operations.survey", m.operations.survey),
      getEff("operations.warehousing", m.operations.warehousing),
    ];
    const insItems = [
      getEff("insurance.hull", m.insurance.hull),
      getEff("insurance.pi", m.insurance.pi),
      getEff("insurance.crewHealth", m.insurance.crewHealth),
    ];
    const adminItems = [
      getEff("administrative.professionalFees", m.administrative.professionalFees),
      getEff("administrative.bankCharges", m.administrative.bankCharges),
      getEff("administrative.managementFee", m.administrative.managementFee),
      getEff("administrative.managementTravel", m.administrative.managementTravel),
    ];
    const capItems = [
      getEff("capital.av", m.capital.av),
      getEff("capital.engineeringDeck", m.capital.engineeringDeck),
      getEff("capital.interior", m.capital.interior),
      getEff("capital.paint", m.capital.paint),
      getEff("capital.tendersToys", m.capital.tendersToys),
      getEff("capital.other", m.capital.other),
    ];
    return sectionTotal([...crewItems, ...commItems, ...opItems, ...insItems, ...adminItems, ...capItems]);
  }

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--brass-400)" }}>Annual Ownership Cost Model</h1>
          <p className="text-sm" style={{ color: "var(--navy-400)" }}>
            Paste any YachtWorld listing URL and configure the operational profile before generating.
          </p>
        </div>

        {/* Segment tabs */}
        <div className="flex gap-2 mb-6">
          {([
            { key: "super", label: "Superyacht", sub: "80 ft +" },
            { key: "small", label: "40–80 ft",   sub: "Owner-run class" },
          ] as const).map(s => {
            const active = segment === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSegment(s.key)}
                className="flex-1 rounded-xl px-4 py-3 text-left transition-colors"
                style={{
                  background: active ? "var(--brass-400)" : "var(--card)",
                  border: `1px solid ${active ? "var(--brass-400)" : "var(--border)"}`,
                  color: active ? "#0a1628" : "var(--foreground)",
                }}
              >
                <div className="text-sm font-bold">{s.label}</div>
                <div className="text-xs" style={{ opacity: 0.8 }}>{s.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Input card */}
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <label className="block text-xs uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Listing URL</label>
          <input
            className="w-full rounded-lg text-sm px-3 py-2.5 mb-4"
            style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://www.yachtworld.com/yacht/..."
            onKeyDown={e => e.key === "Enter" && generate()}
          />

          {/* Operational profile */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Annual Cruising Hours</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={100} max={2000} step={50} value={annualHours}
                  onChange={e => setAnnualHours(Math.max(100, Math.min(2000, Number(e.target.value) || 800)))}
                  className="rounded-lg text-sm px-3 py-2"
                  style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)", width: 90 }}
                />
                <span className="text-xs" style={{ color: "var(--navy-400)" }}>hrs/yr · drives fuel projection</span>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Charter Weeks / Year</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={20} step={1} value={charterWeeks}
                  onChange={e => setCharterWeeks(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  className="rounded-lg text-sm px-3 py-2"
                  style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)", width: 90 }}
                />
                <span className="text-xs" style={{ color: "var(--navy-400)" }}>wks · shows as revenue offset</span>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Home Port / Primary Region</label>
              <select value={homePort} onChange={e => setHomePort(e.target.value)}
                className="w-full rounded-lg text-sm px-3 py-2"
                style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                {HOME_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Vessel Style / Finish Level</label>
              <select value={vesselStyle} onChange={e => setVesselStyle(e.target.value)}
                className="w-full rounded-lg text-sm px-3 py-2"
                style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                {VESSEL_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Crew mode — 40–80 ft segment only */}
          {segment === "small" && (
            <div className="mb-5">
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Crew Arrangement</label>
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { key: "owner",        label: "Owner-operated",  sub: "No paid crew" },
                  { key: "captain",      label: "Captain only",    sub: "Day-rate / part-time" },
                  { key: "captain_mate", label: "Captain + Mate",  sub: "Full-time" },
                ] as const).map(c => {
                  const active = crewMode === c.key;
                  return (
                    <button key={c.key} onClick={() => setCrewMode(c.key)}
                      className="flex-1 rounded-lg px-3 py-2 text-left transition-colors"
                      style={{
                        background: active ? "var(--brass-400)" : "var(--input,#1e293b)",
                        border: `1px solid ${active ? "var(--brass-400)" : "var(--border)"}`,
                        color: active ? "#0a1628" : "var(--foreground)",
                      }}>
                      <div className="text-xs font-bold">{c.label}</div>
                      <div className="text-xs" style={{ opacity: 0.75 }}>{c.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={generate} disabled={loading || !url.trim()}
            className="px-6 py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: loading || !url.trim() ? "var(--border)" : "var(--brass-400)",
              color: loading || !url.trim() ? "var(--navy-400)" : "#fff",
              cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            }}>
            {loading ? "Analyzing…" : "Generate Model"}
          </button>
          {loading && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
              <span className="text-xs" style={{ color: "var(--navy-400)" }}>Fetching vessel data… then running cost analysis (~30s)…</span>
            </div>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>Error: {error}</p>}
        </div>

        {/* Model output */}
        {model && (() => {
          const gt = grandTotals(model);
          const netCost: Scenario = {
            low: gt.low - charterRevenue.low,
            mid: gt.mid - charterRevenue.mid,
            high: gt.high - charterRevenue.high,
          };

          const effectiveSalaries = model.crew.salaries.breakdown?.length
            ? sectionTotal(model.crew.salaries.breakdown.map(r => getEff(`crew.salaries.${r.role}`, r)))
            : getEff("crew.salaries", model.crew.salaries);

          const crewTotal = sectionTotal([
            effectiveSalaries,
            getEff("crew.recruitment", model.crew.recruitment),
            getEff("crew.travel", model.crew.travel),
            getEff("crew.accommodation", model.crew.accommodation),
            getEff("crew.uniforms", model.crew.uniforms),
            getEff("crew.training", model.crew.training),
            getEff("crew.foodBeverage", model.crew.foodBeverage),
            getEff("crew.medical", model.crew.medical),
            getEff("crew.dayWorkers", model.crew.dayWorkers),
            getEff("crew.entertainment", model.crew.entertainment),
          ]);
          const commTotal = sectionTotal([
            getEff("communications.phone", model.communications.phone),
            getEff("communications.satTV", model.communications.satTV),
            getEff("communications.satcom", model.communications.satcom),
          ]);
          const opTotal = sectionTotal([
            getEff("operations.agency", model.operations.agency),
            getEff("operations.audioVisual", model.operations.audioVisual),
            getEff("operations.auto", model.operations.auto),
            getEff("operations.bridge", model.operations.bridge),
            getEff("operations.computer", model.operations.computer),
            getEff("operations.deck", model.operations.deck),
            getEff("operations.dockExpress", model.operations.dockExpress),
            getEff("operations.engineering", model.operations.engineering),
            getEff("operations.fuels", model.operations.fuels),
            getEff("operations.galley", model.operations.galley),
            getEff("operations.interior", model.operations.interior),
            getEff("operations.launches", model.operations.launches),
            getEff("operations.mailFreight", model.operations.mailFreight),
            getEff("operations.office", model.operations.office),
            getEff("operations.dockage", model.operations.dockage),
            getEff("operations.safetyMedical", model.operations.safetyMedical),
            getEff("operations.security", model.operations.security),
            getEff("operations.survey", model.operations.survey),
            getEff("operations.warehousing", model.operations.warehousing),
          ]);
          const insTotal = sectionTotal([
            getEff("insurance.hull", model.insurance.hull),
            getEff("insurance.pi", model.insurance.pi),
            getEff("insurance.crewHealth", model.insurance.crewHealth),
          ]);
          const adminTotal = sectionTotal([
            getEff("administrative.professionalFees", model.administrative.professionalFees),
            getEff("administrative.bankCharges", model.administrative.bankCharges),
            getEff("administrative.managementFee", model.administrative.managementFee),
            getEff("administrative.managementTravel", model.administrative.managementTravel),
          ]);
          const capTotal = sectionTotal([
            getEff("capital.av", model.capital.av),
            getEff("capital.engineeringDeck", model.capital.engineeringDeck),
            getEff("capital.interior", model.capital.interior),
            getEff("capital.paint", model.capital.paint),
            getEff("capital.tendersToys", model.capital.tendersToys),
            getEff("capital.other", model.capital.other),
          ]);

          const visibleCount = [showScenarios.low, showScenarios.mid, showScenarios.high].filter(Boolean).length || 1;

          return (
            <div>
              {/* Vessel name + tabs + PDF */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>Annual Ownership Cost Model</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["table", "analysis"] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize"
                      style={{
                        background: activeTab === t ? "var(--brass-400)" : "var(--card)",
                        color: activeTab === t ? "#fff" : "var(--navy-400)",
                        border: "1px solid var(--border)",
                      }}>{t}</button>
                  ))}
                  <button onClick={downloadPDF} disabled={pdfLoading}
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

              {/* Scenario toggles */}
              <div className="flex items-center gap-1 mb-4">
                <span className="text-xs mr-2" style={{ color: "var(--navy-400)" }}>Show:</span>
                {([["low", "#4ade80", "Low"], ["mid", "#facc15", "Mid"], ["high", "#f87171", "High"]] as [keyof ShowScenarios, string, string][]).map(([key, color, label]) => (
                  <button key={key} onClick={() => toggleScenario(key)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={{
                      background: showScenarios[key] ? `${color}20` : "var(--card)",
                      color: showScenarios[key] ? color : "var(--navy-400)",
                      border: `1px solid ${showScenarios[key] ? color + "60" : "var(--border)"}`,
                    }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 3,
                      border: `1.5px solid ${showScenarios[key] ? color : "var(--navy-400)"}`,
                      background: showScenarios[key] ? color : "transparent",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {showScenarios[key] && <span style={{ color: "#000", fontSize: 8, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {/* Grand total cards */}
              <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(${visibleCount}, 1fr)` }}>
                {([["low", "LOW", gt.low, netCost.low, "#4ade80"], ["mid", "MID", gt.mid, netCost.mid, "#facc15"], ["high", "HIGH", gt.high, netCost.high, "#f87171"]] as [keyof ShowScenarios, string, number, number, string][])
                  .filter(([key]) => showScenarios[key])
                  .map(([key, label, val, net, color]) => (
                    <div key={label} className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: `1px solid ${color}40` }}>
                      <p className="text-xs uppercase tracking-widest mb-1" style={{ color }}>{label} SCENARIO</p>
                      <p className="text-2xl font-bold" style={{ color }}>{fmt(val)}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>gross per year</p>
                      {adjustCharterWeeks > 0 && (
                        <>
                          <p className="text-xs mt-2" style={{ color: "#34d399" }}>− {fmt(charterRevenue[key])} charter income</p>
                          <p className="text-sm font-bold mt-1" style={{ color: "#34d399" }}>{fmt(net)} net</p>
                        </>
                      )}
                    </div>
                  ))}
              </div>

              {/* Adjust Assumptions panel */}
              <div className="rounded-xl p-4 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>
                    Adjust Assumptions
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {overrideCount > 0 && (
                      <span className="text-xs" style={{ color: "#fb923c" }}>
                        {overrideCount} manual override{overrideCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {overrideCount > 0 && (
                      <button onClick={resetAllOverrides} className="text-xs px-3 py-1 rounded-lg"
                        style={{ background: "none", border: "1px solid #fb923c40", color: "#fb923c", cursor: "pointer" }}>
                        Reset All Edits
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <label className="text-xs" style={{ color: "var(--navy-400)" }}>Annual Cruising Hours</label>
                      <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>{adjustHours} hrs</span>
                    </div>
                    <input type="range" min={100} max={2000} step={50} value={adjustHours}
                      onChange={e => setAdjustHours(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--brass-400)" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>100</span>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>scales fuel costs · base: {baseHours} hrs</span>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>2,000</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <label className="text-xs" style={{ color: "var(--navy-400)" }}>Charter Weeks / Year</label>
                      <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>{adjustCharterWeeks} wks</span>
                    </div>
                    <input type="range" min={0} max={20} step={1} value={adjustCharterWeeks}
                      onChange={e => setAdjustCharterWeeks(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "#34d399" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>0</span>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>est. {fmt(vesselLoaFt * 858)}/wk net mid</span>
                      <span style={{ fontSize: 10, color: "var(--navy-400)" }}>20</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "var(--navy-400)" }}>
                  Model generated with: <strong style={{ color: "var(--foreground)" }}>{baseHours} hrs/yr</strong>
                  {" · "}<strong style={{ color: "var(--foreground)" }}>{homePort}</strong>
                  {" · "}<strong style={{ color: "var(--foreground)" }}>{vesselStyle}</strong>
                  {charterWeeks > 0 && <> · <strong style={{ color: "var(--foreground)" }}>{charterWeeks} charter weeks</strong></>}
                </div>
              </div>

              {/* Edit hint */}
              <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>
                💡 Click any value cell to edit it inline. Orange dot = manual override. Use ↺ to reset a row to model values.
              </p>

              {activeTab === "table" && (
                <div>
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
                          <Row key={r.role} label={`  ${r.role}`} path={`crew.salaries.${r.role}`}
                            effective={getEff(`crew.salaries.${r.role}`, r)}
                            show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        ))}
                        <Row label="Recruitment Fees" path="crew.recruitment" effective={getEff("crew.recruitment", model.crew.recruitment)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Travel" path="crew.travel" effective={getEff("crew.travel", model.crew.travel)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Accommodation" path="crew.accommodation" effective={getEff("crew.accommodation", model.crew.accommodation)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Uniforms" path="crew.uniforms" effective={getEff("crew.uniforms", model.crew.uniforms)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Training & Certification" path="crew.training" effective={getEff("crew.training", model.crew.training)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Food & Beverages" path="crew.foodBeverage" effective={getEff("crew.foodBeverage", model.crew.foodBeverage)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Medical Expenses" path="crew.medical" effective={getEff("crew.medical", model.crew.medical)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Day Workers & Delivery Crew" path="crew.dayWorkers" effective={getEff("crew.dayWorkers", model.crew.dayWorkers)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Entertainment" path="crew.entertainment" effective={getEff("crew.entertainment", model.crew.entertainment)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL CREW" path="__crewTotal" effective={crewTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <SectionHeader show={showScenarios} label="COMMUNICATIONS" />
                        <Row label="Phone & Cellular" path="communications.phone" effective={getEff("communications.phone", model.communications.phone)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Sat TV" path="communications.satTV" effective={getEff("communications.satTV", model.communications.satTV)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Satcom / Data (Starlink or equivalent)" path="communications.satcom" effective={getEff("communications.satcom", model.communications.satcom)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL COMMUNICATIONS" path="__commTotal" effective={commTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <SectionHeader show={showScenarios} label="OPERATIONS" />
                        <Row label="Agency" path="operations.agency" effective={getEff("operations.agency", model.operations.agency)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Audio Visual" path="operations.audioVisual" effective={getEff("operations.audioVisual", model.operations.audioVisual)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Auto" path="operations.auto" effective={getEff("operations.auto", model.operations.auto)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Bridge" path="operations.bridge" effective={getEff("operations.bridge", model.operations.bridge)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Computer" path="operations.computer" effective={getEff("operations.computer", model.operations.computer)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Deck" path="operations.deck" effective={getEff("operations.deck", model.operations.deck)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Dock Express / Shipping" path="operations.dockExpress" effective={getEff("operations.dockExpress", model.operations.dockExpress)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Engineering" path="operations.engineering" effective={getEff("operations.engineering", model.operations.engineering)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Fuels & Lubricants ★" path="operations.fuels" effective={getEff("operations.fuels", model.operations.fuels)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Galley" path="operations.galley" effective={getEff("operations.galley", model.operations.galley)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Interior" path="operations.interior" effective={getEff("operations.interior", model.operations.interior)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Launches & Tenders" path="operations.launches" effective={getEff("operations.launches", model.operations.launches)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Mail & Freight" path="operations.mailFreight" effective={getEff("operations.mailFreight", model.operations.mailFreight)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Office" path="operations.office" effective={getEff("operations.office", model.operations.office)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Ports, Dockage & Customs" path="operations.dockage" effective={getEff("operations.dockage", model.operations.dockage)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Safety & Medical" path="operations.safetyMedical" effective={getEff("operations.safetyMedical", model.operations.safetyMedical)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Security" path="operations.security" effective={getEff("operations.security", model.operations.security)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Survey & Certification" path="operations.survey" effective={getEff("operations.survey", model.operations.survey)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Warehousing & Storage" path="operations.warehousing" effective={getEff("operations.warehousing", model.operations.warehousing)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL OPERATIONS" path="__opTotal" effective={opTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <SectionHeader show={showScenarios} label="INSURANCE" />
                        <Row label="Hull & Machinery" path="insurance.hull" effective={getEff("insurance.hull", model.insurance.hull)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Protection & Indemnity" path="insurance.pi" effective={getEff("insurance.pi", model.insurance.pi)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Crew Health Insurance" path="insurance.crewHealth" effective={getEff("insurance.crewHealth", model.insurance.crewHealth)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL INSURANCE" path="__insTotal" effective={insTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <SectionHeader show={showScenarios} label="ADMINISTRATIVE" />
                        <Row label="Professional Fees" path="administrative.professionalFees" effective={getEff("administrative.professionalFees", model.administrative.professionalFees)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Bank Charges" path="administrative.bankCharges" effective={getEff("administrative.bankCharges", model.administrative.bankCharges)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Management Fee" path="administrative.managementFee" effective={getEff("administrative.managementFee", model.administrative.managementFee)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Management Travel" path="administrative.managementTravel" effective={getEff("administrative.managementTravel", model.administrative.managementTravel)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL ADMINISTRATIVE" path="__adminTotal" effective={adminTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <SectionHeader show={showScenarios} label="CAPITAL IMPROVEMENTS" />
                        <Row label="AV" path="capital.av" effective={getEff("capital.av", model.capital.av)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Engineering / Deck" path="capital.engineeringDeck" effective={getEff("capital.engineeringDeck", model.capital.engineeringDeck)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Interior" path="capital.interior" effective={getEff("capital.interior", model.capital.interior)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Paint" path="capital.paint" effective={getEff("capital.paint", model.capital.paint)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Tenders / Toys" path="capital.tendersToys" effective={getEff("capital.tendersToys", model.capital.tendersToys)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="Other" path="capital.other" effective={getEff("capital.other", model.capital.other)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                        <Row label="TOTAL CAPITAL" path="__capTotal" effective={capTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        <tr><td colSpan={colCount(showScenarios)} className="pt-4" /></tr>
                        <Row label="GRAND TOTAL" path="__gt" effective={gt} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />

                        {adjustCharterWeeks > 0 && (
                          <>
                            <Row
                              label={`Charter Revenue (${adjustCharterWeeks} wks, est. net)`}
                              path="__charter"
                              effective={{ low: -charterRevenue.low, mid: -charterRevenue.mid, high: -charterRevenue.high }}
                              show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}
                            />
                            <Row label="NET ANNUAL COST" path="__net" effective={netCost} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow} />
                          </>
                        )}
                      </tbody>
                    </table>
                    {adjustHours !== baseHours && (
                      <p className="text-xs mt-3" style={{ color: "var(--navy-400)" }}>
                        ★ Fuels & Lubricants adjusted: {baseHours} hrs base → {adjustHours} hrs current ({adjustHours > baseHours ? "+" : ""}{Math.round((adjustHours / baseHours - 1) * 100)}%)
                      </p>
                    )}
                  </div>

                  {/* Category reference guide */}
                  <CategoryExamples />
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
