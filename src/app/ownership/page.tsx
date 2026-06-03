"use client";
import React from "react";
import PageShell from "../components/PageShell";

type Scenario = { low: number; mid: number; high: number };
type ShowScenarios = { low: boolean; mid: boolean; high: boolean };

type CostModel = {
  vesselName: string; vesselUrl: string;
  segment?: string; crewMode?: string;
  _meta?: {
    crewCount: number; fullTimeCount: number; loa_m: number; loa_ft: number;
    buildYear: number; age: number; hullType: string; hpTotal: number;
    agreedHullValue: number; managementTier: string; crewPreset: string;
    perCrew?: PerCrew; positionKeys: string[]; isDayRateCaptain: boolean;
  };
  crew: {
    salaries: Scenario & { breakdown: { role: string; low: number; mid: number; high: number }[] };
    recruitment: Scenario; travel: Scenario; accommodation: Scenario;
    uniforms: Scenario; training: Scenario; foodBeverage: Scenario;
    medical: Scenario; dayWorkers: Scenario; entertainment: Scenario;
  };
  communications: { phone: Scenario; satTV: Scenario; satcom: Scenario };
  operations: {
    agency: Scenario; audioVisual: Scenario; auto: Scenario; bridge: Scenario;
    computer: Scenario; deck: Scenario; dockExpress: Scenario; engineering: Scenario;
    fuels: Scenario; galley: Scenario; interior: Scenario; launches: Scenario;
    mailFreight: Scenario; office: Scenario; dockage: Scenario;
    safetyMedical: Scenario; security: Scenario; survey: Scenario; warehousing: Scenario;
  };
  insurance: { hull: Scenario; pi: Scenario; crewHealth: Scenario };
  administrative: {
    professionalFees: Scenario; bankCharges: Scenario;
    managementFee: Scenario; managementTravel: Scenario;
  };
  capital: {
    av: Scenario; engineeringDeck: Scenario; interior: Scenario;
    paint: Scenario; tendersToys: Scenario; other: Scenario;
    haulAntifoul?: Scenario;
  };
  capitalEvents?: {
    paint:    { label: string; totalEst: number; perFt: string; periodYears: number; note: string };
    engines:  { label: string; costPerEngine: number; numEngines: number; intervalHours: number; yearsAtCurrentUse: number; note: string };
    systems:  { label: string; totalEst: number; periodYears: number; note: string };
    interior: { label: string; totalEst: number; periodYears: number; note: string };
  };
  assumptions: string; rangeExplanation: string;
  categoryBreakdown: string; crewStructureNote: string; keyDrivers: string;
};

type PerCrew = {
  salJr: Scenario; foodDaily: { low: number; mid: number; high: number };
  health: Scenario; travel: Scenario; uniform: Scenario; training: Scenario;
  namedSalaries?: { role: string; low: number; mid: number; high: number }[];
};

const HOME_PORTS = [
  "Florida / US East Coast","US Gulf Coast","US West Coast",
  "Caribbean","Mediterranean","Pacific Northwest / Alaska","Worldwide / Expedition",
];
const VESSEL_STYLES = [
  "Luxury / Full Fairing & Paint","Production / Standard Finish","Explorer / Commercial Finish",
];

const CATEGORY_EXAMPLES: Record<string, { desc: string; items: string[] }> = {
  CREW: {
    desc: "All costs to hire, compensate, travel, and support the professional crew year-round.",
    items: [
      "Captain, Engineer, Chef, Stewardess(es), Deckhand(s) — annual salaries from Crewfinders 2025 placement data",
      "Recruitment agency fees (typically 10–15% of first-year salary per placement)",
      "Crew rotation flights and ground transportation",
      "Shoreside accommodation during shipyard periods",
      "Uniforms, foul-weather gear, and deck shoes",
      "STCW / MCA / flag-state certifications and refresher courses",
      "Crew provisions and daily meals aboard (separate from guest galley)",
      "Annual physicals, dental, and crew medical kits",
      "Day workers and delivery crew for yard periods",
      "Crew entertainment and morale budget at port calls",
    ],
  },
  COMMUNICATIONS: {
    desc: "All connectivity, satellite services, and onboard communications.",
    items: [
      "Captain and crew mobile phone plans (local SIMs + international roaming)",
      "Onboard satellite TV (DirecTV, SKY, or regional)",
      "Starlink Maritime, KVH V7-HTS, or Inmarsat Fleet One broadband",
      "Satellite phone airtime and weather routing services (PredictWind, Iridium GO)",
    ],
  },
  OPERATIONS: {
    desc: "Day-to-day running costs across every department — deck, engineering, interior, galley, shore logistics.",
    items: [
      "Agency: port agent fees, cruising permits, transit licences, clearance paperwork",
      "Engineering: routine engine and systems servicing; filters, seals, consumables — age-adjusted",
      "Fuels & Lubricants: diesel for main engines (HP-formula based), petrol for tenders, all lubricants",
      "Galley: food, wines, spirits, and all guest provisions",
      "Dockage: home berth + transient port calls + port dues (LOA × regional rate × 12 months)",
      "Safety & Medical: EPIRB recharges, flare kits, fire suppression, first aid, safety drills",
      "Survey & Certification: annual flag-state, class, or insurance-required surveys",
      "Deck, Interior, Bridge, Launches: departmental consumables and routine maintenance",
    ],
  },
  INSURANCE: {
    desc: "All insurance policies protecting the vessel, liability, and crew welfare.",
    items: [
      "Hull & Machinery: physical damage — computed as agreed hull value × rate (0.75–1.75% depending on age/use)",
      "Protection & Indemnity: third-party liability, wreck removal, pollution coverage",
      "Crew Health Insurance: medical, dental, and emergency repatriation for all full-time crew",
    ],
  },
  ADMINISTRATIVE: {
    desc: "Professional services and management overhead.",
    items: [
      "Professional Fees: maritime lawyers, flag-state registration, corporate structure, accountants",
      "Bank Charges: operating account fees, international wires, currency conversion",
      "Management Fee: yacht management company charge — OFF by default; 5–8% of budget if used",
      "Management Travel: manager site visits, yard supervision, captain reviews",
    ],
  },
  "CAPITAL IMPROVEMENTS": {
    desc: "Annualised reserves for planned major expenditure — four separate buckets.",
    items: [
      "Paint Reserve: full job cost ÷ cycle years (luxury 7yr, standard 6yr, steel 4yr, explorer 3yr)",
      "Engine Overhaul Reserve: (overhaul cost × engines) ÷ hours-to-overhaul × annual hours — HP-based",
      "Systems Reserve: electronics refresh every 8yr + generator + HVAC + watermaker annualised",
      "AV / Electronics Upgrade: satcom hardware, entertainment systems, navigation upgrades",
      "Interior Refresh: soft goods, upholstery, headliners, galley equipment",
      "Tenders & Toys: tender replacement / refit, jet ski, water toys",
      "Contingency: unexpected capital items, osmosis treatment, class special surveys",
    ],
  },
};

function fmt(n: number) {
  if (n < 0) return "−$" + Math.round(-n).toLocaleString("en-US");
  return "$" + Math.round(n).toLocaleString("en-US");
}
function sectionTotal(items: Scenario[]): Scenario {
  return { low: items.reduce((a,b)=>a+b.low,0), mid: items.reduce((a,b)=>a+b.mid,0), high: items.reduce((a,b)=>a+b.high,0) };
}
function colCount(show: ShowScenarios) {
  return 1 + (show.low?1:0) + (show.mid?1:0) + (show.high?1:0);
}
function parseLoaToFeet(loa: string): number {
  if (!loa) return 100;
  const m = loa.match(/([\d.]+)\s*m/i); if (m) return Math.round(parseFloat(m[1])*3.28084);
  const ft = loa.match(/([\d.]+)\s*(ft|')/i); if (ft) return parseFloat(ft[1]);
  const n = parseFloat(loa); return !isNaN(n) ? (n>25?n:Math.round(n*3.28084)) : 100;
}

/* ─── SectionHeader ─────────────────────────────────────────────────────── */
function SectionHeader({ label, show }: { label: string; show: ShowScenarios }) {
  return (
    <tr><td colSpan={colCount(show)} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{ color:"var(--brass-400)" }}>{label}</td></tr>
  );
}

/* ─── Inline-editable Row ────────────────────────────────────────────────── */
interface RowProps {
  label: string; path: string; effective: Scenario; bold?: boolean;
  show: ShowScenarios; overrides: Record<string,number>;
  onOverride:(key:string,val:number)=>void; onResetRow:(path:string)=>void;
}
function Row({ label, path, effective, bold, show, overrides, onOverride, onResetRow }: RowProps) {
  const [editSc, setEditSc] = React.useState<keyof Scenario|null>(null);
  const [editVal, setEditVal] = React.useState("");
  function startEdit(sc: keyof Scenario) { if (bold) return; setEditSc(sc); setEditVal(String(Math.round(effective[sc]))); }
  function saveEdit() {
    if (editSc===null) return;
    const num = parseFloat(editVal.replace(/[$,\s−-]/g,""));
    if (!isNaN(num)&&num>=0) onOverride(`${path}.${editSc}`,num);
    setEditSc(null);
  }
  const hasOv = !bold&&(overrides[`${path}.low`]!==undefined||overrides[`${path}.mid`]!==undefined||overrides[`${path}.high`]!==undefined);
  const scColors: Record<keyof Scenario,string> = {low:"#4ade80",mid:"#facc15",high:"#f87171"};
  return (
    <tr style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
      <td style={{padding:"8px 16px 8px 0",fontSize:13,color:bold?"var(--brass-400)":"var(--foreground)",fontWeight:bold?700:400}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:6}}>
          {label}
          {hasOv&&<button onClick={()=>onResetRow(path)} title="Reset to model values" style={{fontSize:10,color:"#fb923c",background:"none",border:"none",cursor:"pointer",padding:0}}>↺</button>}
        </span>
      </td>
      {(["low","mid","high"] as (keyof Scenario)[]).map(sc=>{
        if (!show[sc]) return null;
        const color=scColors[sc]; const isEditing=!bold&&editSc===sc; const isOv=!bold&&overrides[`${path}.${sc}`]!==undefined;
        return (
          <td key={sc} onClick={()=>!bold&&!isEditing&&startEdit(sc)} title={!bold?"Click to edit":undefined}
            style={{padding:"8px 12px",textAlign:"right",cursor:bold?"default":"text",minWidth:100}}>
            {isEditing?(
              <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
                onBlur={saveEdit} onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditSc(null);}}
                style={{background:"transparent",border:`1px solid ${color}`,borderRadius:4,color,fontSize:13,textAlign:"right",width:90,padding:"2px 6px",outline:"none"}}/>
            ):(
              <span style={{fontSize:13,color:bold?color:isOv?"#fb923c":"var(--foreground)",fontWeight:bold?700:400,display:"inline-flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
                {isOv&&<span style={{width:5,height:5,borderRadius:"50%",background:"#fb923c",flexShrink:0}}/>}
                {fmt(effective[sc])}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/* ─── Category Examples accordion ──────────────────────────────────────── */
function CategoryExamples() {
  const [open, setOpen] = React.useState(false);
  const [cat, setCat] = React.useState<string|null>(null);
  return (
    <div className="rounded-xl mt-4" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
      <button onClick={()=>{setOpen(o=>!o);if(open)setCat(null);}} style={{width:"100%",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"none",border:"none",cursor:"pointer"}}>
        <span style={{fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--brass-400)"}}>Category Reference — What's Included in Each Line Item</span>
        <span style={{fontSize:12,color:"var(--navy-400)"}}>{open?"▲ Collapse":"▼ Expand"}</span>
      </button>
      {open&&(
        <div style={{padding:"0 20px 20px",borderTop:"1px solid var(--border)"}}>
          {Object.entries(CATEGORY_EXAMPLES).map(([k,{desc,items}])=>(
            <div key={k} style={{marginTop:16}}>
              <button onClick={()=>setCat(o=>o===k?null:k)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",cursor:"pointer",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{fontSize:11,fontWeight:700,color:"var(--brass-400)",letterSpacing:"0.1em",textTransform:"uppercase"}}>{k}</span>
                <span style={{fontSize:12,color:"var(--navy-400)"}}>{cat===k?"▲":"▼"}</span>
              </button>
              <p style={{fontSize:12,color:"var(--navy-400)",margin:"6px 0 8px",lineHeight:1.5}}>{desc}</p>
              {cat===k&&<ul style={{margin:0,padding:"0 0 0 16px"}}>{items.map((it,i)=><li key={i} style={{fontSize:12,color:"var(--foreground)",opacity:0.72,marginBottom:4,lineHeight:1.6}}>{it}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function OwnershipPage() {
  // Form state
  const [url, setUrl]           = React.useState("");
  const [homePort, setHomePort] = React.useState("Florida / US East Coast");
  const [vesselStyle, setVesselStyle] = React.useState("Luxury / Full Fairing & Paint");
  const [annualHours, setAnnualHours] = React.useState(800);
  const [charterWeeks, setCharterWeeks] = React.useState(0);
  const [segment, setSegment]   = React.useState<"super"|"small">("super");
  const [crewMode, setCrewMode] = React.useState<"owner"|"captain"|"captain_mate">("captain");

  // Generate state
  const [loading, setLoading]     = React.useState(false);
  const [error, setError]         = React.useState("");
  const [model, setModel]         = React.useState<CostModel|null>(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);

  // Display state
  const [activeTab, setActiveTab] = React.useState<"table"|"analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({low:false,mid:true,high:false});
  const [overrides, setOverrides] = React.useState<Record<string,number>>({});

  // Post-gen slider state
  const [baseHours, setBaseHours]   = React.useState(800);
  const [adjustHours, setAdjustHours] = React.useState(800);
  const [adjustCharterWeeks, setAdjustCharterWeeks] = React.useState(0);
  const [vesselLoaFt, setVesselLoaFt] = React.useState(100);

  // Crew adjustment state
  const [baseCrewCount, setBaseCrewCount] = React.useState(7);
  const [adjustCrewCount, setAdjustCrewCount] = React.useState(7);
  const [perCrewRates, setPerCrewRates] = React.useState<PerCrew|null>(null);
  type ExtraPos = { key:string; label:string; salMid:number; checked:boolean };
  const [extraPositions, setExtraPositions] = React.useState<ExtraPos[]>([]);

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev => { const n={...prev,[key]:!prev[key]}; if(!n.low&&!n.mid&&!n.high)return prev; return n; });
  }
  function handleOverride(key:string, val:number) { setOverrides(p=>({...p,[key]:val})); }
  function resetRow(path:string) { setOverrides(p=>{ const n={...p}; delete n[`${path}.low`];delete n[`${path}.mid`];delete n[`${path}.high`];return n; }); }
  function resetAllOverrides() { setOverrides({}); }

  function getEff(path: string, s: Scenario): Scenario {
    const ratio = baseHours>0 ? adjustHours/baseHours : 1;
    const base = path==="operations.fuels" ? {low:s.low*ratio,mid:s.mid*ratio,high:s.high*ratio} : {...s};
    return { low:overrides[`${path}.low`]??base.low, mid:overrides[`${path}.mid`]??base.mid, high:overrides[`${path}.high`]??base.high };
  }

  const charterRevenue = React.useMemo(():Scenario => {
    if (adjustCharterWeeks===0) return {low:0,mid:0,high:0};
    const wg = vesselLoaFt*1100;
    return {low:adjustCharterWeeks*wg*0.60, mid:adjustCharterWeeks*wg*0.78, high:adjustCharterWeeks*wg*0.92};
  }, [adjustCharterWeeks,vesselLoaFt]);

  const crewDelta: Scenario = React.useMemo(()=>{
    if (!perCrewRates) return {low:0,mid:0,high:0};
    const r5l=(n:number)=>Math.round(n/5000)*5000;
    const sp={
      low:  r5l(perCrewRates.foodDaily.low *365)+perCrewRates.health.low +perCrewRates.travel.low +perCrewRates.uniform.low +perCrewRates.training.low,
      mid:  r5l(perCrewRates.foodDaily.mid *365)+perCrewRates.health.mid +perCrewRates.travel.mid +perCrewRates.uniform.mid +perCrewRates.training.mid,
      high: r5l(perCrewRates.foodDaily.high*365)+perCrewRates.health.high+perCrewRates.travel.high+perCrewRates.uniform.high+perCrewRates.training.high,
    };
    const delta=adjustCrewCount-baseCrewCount;
    let d:Scenario={low:0,mid:0,high:0};
    if (delta<0) {
      const named=perCrewRates.namedSalaries??[];
      for (let i=baseCrewCount-1;i>=adjustCrewCount;i--) {
        const pos=named[i]??perCrewRates.salJr;
        d.low-=pos.low+sp.low; d.mid-=pos.mid+sp.mid; d.high-=pos.high+sp.high;
      }
    } else if (delta>0) {
      d={low:delta*(perCrewRates.salJr.low+sp.low), mid:delta*(perCrewRates.salJr.mid+sp.mid), high:delta*(perCrewRates.salJr.high+sp.high)};
    }
    extraPositions.filter(p=>p.checked).forEach(pos=>{
      d.low+=r5l(pos.salMid*0.82)+sp.low; d.mid+=pos.salMid+sp.mid; d.high+=r5l(pos.salMid*1.18)+sp.high;
    });
    return d;
  },[adjustCrewCount,baseCrewCount,perCrewRates,extraPositions]);

  function grandTotals(m: CostModel): Scenario {
    const effSal = m.crew.salaries.breakdown?.length
      ? sectionTotal(m.crew.salaries.breakdown.map(r=>getEff(`crew.salaries.${r.role}`,r)))
      : getEff("crew.salaries",m.crew.salaries);
    return sectionTotal([
      effSal,
      getEff("crew.recruitment",m.crew.recruitment), getEff("crew.travel",m.crew.travel),
      getEff("crew.accommodation",m.crew.accommodation), getEff("crew.uniforms",m.crew.uniforms),
      getEff("crew.training",m.crew.training), getEff("crew.foodBeverage",m.crew.foodBeverage),
      getEff("crew.medical",m.crew.medical), getEff("crew.dayWorkers",m.crew.dayWorkers),
      getEff("crew.entertainment",m.crew.entertainment),
      getEff("communications.phone",m.communications.phone),
      getEff("communications.satTV",m.communications.satTV),
      getEff("communications.satcom",m.communications.satcom),
      getEff("operations.agency",m.operations.agency), getEff("operations.audioVisual",m.operations.audioVisual),
      getEff("operations.auto",m.operations.auto), getEff("operations.bridge",m.operations.bridge),
      getEff("operations.computer",m.operations.computer), getEff("operations.deck",m.operations.deck),
      getEff("operations.dockExpress",m.operations.dockExpress), getEff("operations.engineering",m.operations.engineering),
      getEff("operations.fuels",m.operations.fuels), getEff("operations.galley",m.operations.galley),
      getEff("operations.interior",m.operations.interior), getEff("operations.launches",m.operations.launches),
      getEff("operations.mailFreight",m.operations.mailFreight), getEff("operations.office",m.operations.office),
      getEff("operations.dockage",m.operations.dockage), getEff("operations.safetyMedical",m.operations.safetyMedical),
      getEff("operations.security",m.operations.security), getEff("operations.survey",m.operations.survey),
      getEff("operations.warehousing",m.operations.warehousing),
      getEff("insurance.hull",m.insurance.hull), getEff("insurance.pi",m.insurance.pi),
      getEff("insurance.crewHealth",m.insurance.crewHealth),
      getEff("administrative.professionalFees",m.administrative.professionalFees),
      getEff("administrative.bankCharges",m.administrative.bankCharges),
      getEff("administrative.managementFee",m.administrative.managementFee),
      getEff("administrative.managementTravel",m.administrative.managementTravel),
      getEff("capital.av",m.capital.av), getEff("capital.engineeringDeck",m.capital.engineeringDeck),
      getEff("capital.interior",m.capital.interior), getEff("capital.paint",m.capital.paint),
      getEff("capital.tendersToys",m.capital.tendersToys), getEff("capital.other",m.capital.other),
      getEff("capital.haulAntifoul", m.capital.haulAntifoul ?? {low:0,mid:0,high:0}),
    ]);
  }

  async function generate() {
    if (!url.trim()) return;
    setLoading(true); setError(""); setModel(null); setOverrides({});
    try {
      const scrapeRes = await fetch("/api/brochures/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim()})});
      const scrapeData = await scrapeRes.json();
      if (!scrapeData.ok&&!scrapeData.vessel) throw new Error(scrapeData.error||"Scrape failed");
      const vessel = scrapeData.vessel||{};
      setVesselLoaFt(parseLoaToFeet(vessel.loa||""));
      const res = await fetch("/api/ownership/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({vessel,url:url.trim(),annualHours,charterWeeks,homePort,vesselStyle,segment,crewMode})});
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Generation failed");
      setModel(data.model);
      setBaseHours(annualHours); setAdjustHours(annualHours); setAdjustCharterWeeks(charterWeeks);
      const meta = data.model._meta;
      const cc = meta?.crewCount ?? data.model.crew?.salaries?.breakdown?.length ?? 5;
      setBaseCrewCount(cc); setAdjustCrewCount(cc);
      setPerCrewRates(meta?.perCrew??null);
      const lm = meta?.loa_m??40;
      setExtraPositions([
        {key:"bosun",    label:"Bosun",         salMid:lm>=45?82000:62000,  checked:false},
        {key:"2nd_eng",  label:"2nd Engineer",  salMid:lm>=50?95000:78000,  checked:false},
        {key:"3rd_stew", label:"3rd Stewardess",salMid:lm>=45?58000:50000,  checked:false},
        {key:"chef2",    label:"Sous Chef",     salMid:lm>=40?72000:62000,  checked:false},
      ]);
    } catch(err) { setError(err instanceof Error?err.message:"Unknown error"); }
    finally { setLoading(false); }
  }

  async function downloadPDF() {
    if (!model) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/ownership/pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model,scenarios:showScenarios})});
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const a = document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download=`${(model.vesselName||"budget").replace(/[^a-zA-Z0-9]/g,"-").toLowerCase()}-cost-model.pdf`;
      a.click();
    } catch(e) { alert("PDF failed: "+(e instanceof Error?e.message:"error")); }
    finally { setPdfLoading(false); }
  }

  const overrideCount = Object.keys(overrides).length;

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1" style={{color:"var(--brass-400)"}}>Annual Ownership Cost Model</h1>
          <p className="text-sm" style={{color:"var(--navy-400)"}}>Built from first principles — HP-based fuel, agreed hull value insurance, Crewfinders salary data, four-bucket capital reserves.</p>
        </div>

        {/* Segment toggle */}
        <div className="flex gap-2 mb-5">
          {([{key:"super",label:"Superyacht",sub:"80 ft+"},{key:"small",label:"40–80 ft",sub:"Owner-operated class"}] as const).map(s=>(
            <button key={s.key} onClick={()=>setSegment(s.key)} className="flex-1 rounded-xl px-4 py-3 text-left"
              style={{background:segment===s.key?"var(--brass-400)":"var(--card)",border:`1px solid ${segment===s.key?"var(--brass-400)":"var(--border)"}`,color:segment===s.key?"#0a1628":"var(--foreground)"}}>
              <div className="text-sm font-bold">{s.label}</div>
              <div className="text-xs" style={{opacity:0.8}}>{s.sub}</div>
            </button>
          ))}
        </div>

        {/* Input form */}
        <div className="rounded-xl p-5 mb-6" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
          <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>Listing URL</label>
          <input className="w-full rounded-lg text-sm px-3 py-2.5 mb-4"
            style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)"}}
            value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generate()}
            placeholder="https://www.yachtworld.com/yacht/… or denisonyachtsales.com/…" />

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Annual Engine Hours</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min={100} max={2000} step={50} value={annualHours}
                  onChange={e=>setAnnualHours(Math.max(100,Math.min(2000,Number(e.target.value)||800)))}
                  className="rounded-lg text-sm px-3 py-2"
                  style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:90}}/>
                <span className="text-xs" style={{color:"var(--navy-400)"}}>hrs/yr · drives fuel calc</span>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Charter Weeks / Year</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min={0} max={20} step={1} value={charterWeeks}
                  onChange={e=>setCharterWeeks(Math.max(0,Math.min(20,Number(e.target.value)||0)))}
                  className="rounded-lg text-sm px-3 py-2"
                  style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:90}}/>
                <span className="text-xs" style={{color:"var(--navy-400)"}}>wks · shows net after revenue</span>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Home Port / Region</label>
              <select value={homePort} onChange={e=>setHomePort(e.target.value)} className="w-full rounded-lg text-sm px-3 py-2"
                style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)"}}>
                {HOME_PORTS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Vessel Style / Finish</label>
              <select value={vesselStyle} onChange={e=>setVesselStyle(e.target.value)} className="w-full rounded-lg text-sm px-3 py-2"
                style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)"}}>
                {VESSEL_STYLES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {segment==="small"&&(
            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Crew Arrangement</label>
              <div className="flex gap-2">
                {([{key:"owner",l:"Owner-operated",s:"No paid crew"},{key:"captain",l:"Captain only",s:"Day-rate / part-time"},{key:"captain_mate",l:"Captain + Mate",s:"Full-time pair"}] as const).map(c=>(
                  <button key={c.key} onClick={()=>setCrewMode(c.key)} className="flex-1 rounded-lg px-3 py-2 text-left"
                    style={{background:crewMode===c.key?"var(--brass-400)":"var(--input,#1e293b)",border:`1px solid ${crewMode===c.key?"var(--brass-400)":"var(--border)"}`,color:crewMode===c.key?"#0a1628":"var(--foreground)"}}>
                    <div className="text-xs font-bold">{c.l}</div>
                    <div className="text-xs" style={{opacity:0.75}}>{c.s}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={generate} disabled={loading||!url.trim()} className="px-6 py-2.5 rounded-lg text-sm font-bold"
            style={{background:loading||!url.trim()?"var(--border)":"var(--brass-400)",color:loading||!url.trim()?"var(--navy-400)":"#fff",cursor:loading||!url.trim()?"not-allowed":"pointer"}}>
            {loading?"Analyzing…":"Generate Model"}
          </button>
          {loading&&<div className="mt-3 flex items-center gap-2"><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:"var(--brass-400)",borderTopColor:"transparent"}}/><span className="text-xs" style={{color:"var(--navy-400)"}}>Fetching vessel data… running HP-based cost analysis (~30s)…</span></div>}
          {error&&<p className="mt-2 text-xs" style={{color:"#f87171"}}>Error: {error}</p>}
        </div>

        {/* Model output */}
        {model&&(()=>{
          const gt = grandTotals(model);
          const gtAdj:Scenario = {low:gt.low+crewDelta.low, mid:gt.mid+crewDelta.mid, high:gt.high+crewDelta.high};
          const netCost:Scenario = {low:gtAdj.low-charterRevenue.low, mid:gtAdj.mid-charterRevenue.mid, high:gtAdj.high-charterRevenue.high};

          // Section totals
          const effSal = model.crew.salaries.breakdown?.length
            ? sectionTotal(model.crew.salaries.breakdown.map(r=>getEff(`crew.salaries.${r.role}`,r)))
            : getEff("crew.salaries",model.crew.salaries);
          const crewTotal = sectionTotal([effSal,getEff("crew.recruitment",model.crew.recruitment),getEff("crew.travel",model.crew.travel),getEff("crew.accommodation",model.crew.accommodation),getEff("crew.uniforms",model.crew.uniforms),getEff("crew.training",model.crew.training),getEff("crew.foodBeverage",model.crew.foodBeverage),getEff("crew.medical",model.crew.medical),getEff("crew.dayWorkers",model.crew.dayWorkers),getEff("crew.entertainment",model.crew.entertainment)]);
          const commTotal = sectionTotal([getEff("communications.phone",model.communications.phone),getEff("communications.satTV",model.communications.satTV),getEff("communications.satcom",model.communications.satcom)]);
          const opTotal   = sectionTotal([getEff("operations.agency",model.operations.agency),getEff("operations.audioVisual",model.operations.audioVisual),getEff("operations.auto",model.operations.auto),getEff("operations.bridge",model.operations.bridge),getEff("operations.computer",model.operations.computer),getEff("operations.deck",model.operations.deck),getEff("operations.dockExpress",model.operations.dockExpress),getEff("operations.engineering",model.operations.engineering),getEff("operations.fuels",model.operations.fuels),getEff("operations.galley",model.operations.galley),getEff("operations.interior",model.operations.interior),getEff("operations.launches",model.operations.launches),getEff("operations.mailFreight",model.operations.mailFreight),getEff("operations.office",model.operations.office),getEff("operations.dockage",model.operations.dockage),getEff("operations.safetyMedical",model.operations.safetyMedical),getEff("operations.security",model.operations.security),getEff("operations.survey",model.operations.survey),getEff("operations.warehousing",model.operations.warehousing)]);
          const insTotal  = sectionTotal([getEff("insurance.hull",model.insurance.hull),getEff("insurance.pi",model.insurance.pi),getEff("insurance.crewHealth",model.insurance.crewHealth)]);
          const admTotal  = sectionTotal([getEff("administrative.professionalFees",model.administrative.professionalFees),getEff("administrative.bankCharges",model.administrative.bankCharges),getEff("administrative.managementFee",model.administrative.managementFee),getEff("administrative.managementTravel",model.administrative.managementTravel)]);
          const capTotal  = sectionTotal([getEff("capital.av",model.capital.av),getEff("capital.engineeringDeck",model.capital.engineeringDeck),getEff("capital.interior",model.capital.interior),getEff("capital.paint",model.capital.paint),getEff("capital.tendersToys",model.capital.tendersToys),getEff("capital.other",model.capital.other)]);
          const vc = [showScenarios.low,showScenarios.mid,showScenarios.high].filter(Boolean).length||1;

          return (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold" style={{color:"var(--foreground)"}}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{color:"var(--navy-400)"}}>Annual Ownership Cost Model</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["table","analysis"] as const).map(t=>(
                    <button key={t} onClick={()=>setActiveTab(t)} className="px-4 py-1.5 rounded-lg text-xs font-semibold capitalize"
                      style={{background:activeTab===t?"var(--brass-400)":"var(--card)",color:activeTab===t?"#fff":"var(--navy-400)",border:"1px solid var(--border)"}}>{t}</button>
                  ))}
                  <button onClick={downloadPDF} disabled={pdfLoading} className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                    style={{background:pdfLoading?"var(--border)":"#1e3a5f",color:pdfLoading?"var(--navy-400)":"#93c5fd",border:"1px solid #3b82f640",cursor:pdfLoading?"not-allowed":"pointer"}}>
                    {pdfLoading?"Generating…":"⬇ Save PDF"}
                  </button>
                </div>
              </div>

              {/* Scenario toggles */}
              <div className="flex items-center gap-1 mb-4">
                <span className="text-xs mr-2" style={{color:"var(--navy-400)"}}>Show:</span>
                {([["low","#4ade80","Low"],["mid","#facc15","Mid"],["high","#f87171","High"]] as [keyof ShowScenarios,string,string][]).map(([key,color,label])=>(
                  <button key={key} onClick={()=>toggleScenario(key)} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{background:showScenarios[key]?`${color}20`:"var(--card)",color:showScenarios[key]?color:"var(--navy-400)",border:`1px solid ${showScenarios[key]?color+"60":"var(--border)"}`}}>
                    <span style={{width:12,height:12,borderRadius:3,border:`1.5px solid ${showScenarios[key]?color:"var(--navy-400)"}`,background:showScenarios[key]?color:"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {showScenarios[key]&&<span style={{color:"#000",fontSize:8,fontWeight:900,lineHeight:1}}>✓</span>}
                    </span>{label}
                  </button>
                ))}
              </div>

              {/* Grand total cards */}
              <div className="grid gap-3 mb-4" style={{gridTemplateColumns:`repeat(${vc},1fr)`}}>
                {([["low","LOW",gtAdj.low,netCost.low,"#4ade80"],["mid","MID",gtAdj.mid,netCost.mid,"#facc15"],["high","HIGH",gtAdj.high,netCost.high,"#f87171"]] as [keyof ShowScenarios,string,number,number,string][])
                  .filter(([k])=>showScenarios[k]).map(([k,label,val,net,color])=>(
                  <div key={label} className="rounded-xl p-4 text-center" style={{background:"var(--card)",border:`1px solid ${color}40`}}>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{color}}>{label} SCENARIO</p>
                    <p className="text-2xl font-bold" style={{color}}>{fmt(val)}</p>
                    <p className="text-xs mt-0.5" style={{color:"var(--navy-400)"}}>gross per year</p>
                    {adjustCharterWeeks>0&&<><p className="text-xs mt-2" style={{color:"#34d399"}}>− {fmt(charterRevenue[k])} charter income</p><p className="text-sm font-bold mt-1" style={{color:"#34d399"}}>{fmt(net)} net</p></>}
                  </div>
                ))}
              </div>

              {/* Adjust Assumptions */}
              <div className="rounded-xl p-4 mb-4" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{color:"var(--brass-400)"}}>Adjust Assumptions</span>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {overrideCount>0&&<span className="text-xs" style={{color:"#fb923c"}}>{overrideCount} override{overrideCount!==1?"s":""}</span>}
                    {overrideCount>0&&<button onClick={resetAllOverrides} className="text-xs px-3 py-1 rounded-lg" style={{background:"none",border:"1px solid #fb923c40",color:"#fb923c",cursor:"pointer"}}>Reset All Edits</button>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label className="text-xs" style={{color:"var(--navy-400)"}}>Annual Engine Hours</label>
                      <span className="text-xs font-bold" style={{color:"var(--foreground)"}}>{adjustHours} hrs</span>
                    </div>
                    <input type="range" min={100} max={2000} step={50} value={adjustHours} onChange={e=>setAdjustHours(Number(e.target.value))} style={{width:"100%",accentColor:"var(--brass-400)"}}/>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"var(--navy-400)"}}>100</span><span style={{fontSize:10,color:"var(--navy-400)"}}>scales fuel · base: {baseHours} hrs</span><span style={{fontSize:10,color:"var(--navy-400)"}}>2,000</span></div>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label className="text-xs" style={{color:"var(--navy-400)"}}>Charter Weeks / Year</label>
                      <span className="text-xs font-bold" style={{color:"var(--foreground)"}}>{adjustCharterWeeks} wks</span>
                    </div>
                    <input type="range" min={0} max={20} step={1} value={adjustCharterWeeks} onChange={e=>setAdjustCharterWeeks(Number(e.target.value))} style={{width:"100%",accentColor:"#34d399"}}/>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"var(--navy-400)"}}>0</span><span style={{fontSize:10,color:"var(--navy-400)"}}>est. {fmt(vesselLoaFt*858)}/wk net mid</span><span style={{fontSize:10,color:"var(--navy-400)"}}>20</span></div>
                  </div>
                </div>

                {model.segment!=="small"&&perCrewRates&&(
                  <div className="mt-4 pt-4" style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span className="text-xs font-bold uppercase tracking-widest" style={{color:"var(--brass-400)"}}>Crew Configuration</span>
                      {(adjustCrewCount!==baseCrewCount||extraPositions.some(p=>p.checked))&&<span className="text-xs" style={{color:"#fb923c"}}>{crewDelta.mid>=0?"+":""}{fmt(crewDelta.mid)}/yr mid vs model</span>}
                    </div>
                    <div style={{flex:1,marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <label className="text-xs" style={{color:"var(--navy-400)"}}>Total Crew</label>
                        <span className="text-xs font-bold" style={{color:"var(--foreground)"}}>{adjustCrewCount} crew</span>
                      </div>
                      <input type="range" min={1} max={14} step={1} value={adjustCrewCount} onChange={e=>setAdjustCrewCount(Number(e.target.value))} style={{width:"100%",accentColor:"#a78bfa"}}/>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"var(--navy-400)"}}>1</span><span style={{fontSize:10,color:"var(--navy-400)"}}>model base: {baseCrewCount} crew · each additional ≈ {fmt(perCrewRates.salJr.mid+Math.round(perCrewRates.foodDaily.mid*365/5000)*5000+perCrewRates.health.mid)}/yr</span><span style={{fontSize:10,color:"var(--navy-400)"}}>14</span></div>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {extraPositions.map(pos=>(
                        <button key={pos.key} onClick={()=>setExtraPositions(prev=>prev.map(p=>p.key===pos.key?{...p,checked:!p.checked}:p))}
                          style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:8,border:`1px solid ${pos.checked?"#a78bfa60":"var(--border)"}`,background:pos.checked?"#a78bfa15":"var(--input,#1e293b)",color:pos.checked?"#a78bfa":"var(--navy-400)",cursor:"pointer",fontSize:11,fontWeight:pos.checked?700:400}}>
                          <span style={{width:12,height:12,borderRadius:3,flexShrink:0,border:`1.5px solid ${pos.checked?"#a78bfa":"var(--navy-400)"}`,background:pos.checked?"#a78bfa":"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                            {pos.checked&&<span style={{color:"#fff",fontSize:8,fontWeight:900,lineHeight:1}}>✓</span>}
                          </span>
                          {pos.label} <span style={{fontSize:10,opacity:0.6}}>+{fmt(pos.salMid)}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs mt-2" style={{color:"var(--navy-400)"}}>Each toggle adds salary + food + health insurance. Edit individual salaries in the table.</p>
                  </div>
                )}
                <div className="mt-3 pt-3" style={{borderTop:"1px solid rgba(255,255,255,.06)",fontSize:11,color:"var(--navy-400)"}}>
                  Generated with: <strong>{baseHours} hrs/yr</strong> · <strong>{homePort}</strong> · <strong>{vesselStyle}</strong>
                </div>
              </div>

              {/* TABLE TAB */}
              {activeTab==="table"&&(
                <div>
                  <div className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--border)",overflowX:"auto"}}>
                    <p className="text-xs mb-3" style={{color:"var(--navy-400)"}}>Click any value to edit inline · Orange dot = manual override · ↺ to reset that row to model values</p>
                    <table style={{width:"100%",borderCollapse:"collapse"}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid rgba(184,147,58,.3)"}}>
                          <th style={{textAlign:"left",paddingBottom:8,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--navy-400)"}}>Category</th>
                          {showScenarios.low &&<th style={{textAlign:"right",paddingBottom:8,paddingLeft:12,paddingRight:12,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#4ade80"}}>Low</th>}
                          {showScenarios.mid &&<th style={{textAlign:"right",paddingBottom:8,paddingLeft:12,paddingRight:12,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#facc15"}}>Mid</th>}
                          {showScenarios.high&&<th style={{textAlign:"right",paddingBottom:8,paddingLeft:12,paddingRight:12,fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#f87171"}}>High</th>}
                        </tr>
                      </thead>
                      <tbody>
                        <SectionHeader show={showScenarios} label="CREW"/>
                        {model.crew.salaries.breakdown?.map(r=>(
                          <Row key={r.role} label={`  ${r.role}`} path={`crew.salaries.${r.role}`} effective={getEff(`crew.salaries.${r.role}`,r)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                        ))}
                        {([["crew.recruitment","Recruitment Fees",model.crew.recruitment],["crew.travel","Travel",model.crew.travel],["crew.accommodation","Accommodation",model.crew.accommodation],["crew.uniforms","Uniforms",model.crew.uniforms],["crew.training","Training & Certification",model.crew.training],["crew.foodBeverage","Food & Beverages (Crew)",model.crew.foodBeverage],["crew.medical","Medical Expenses",model.crew.medical],["crew.dayWorkers","Day Workers & Delivery",model.crew.dayWorkers],["crew.entertainment","Entertainment",model.crew.entertainment]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} label={l} path={p} effective={getEff(p,s)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>))}
                        <Row label="TOTAL CREW" path="__crew" effective={crewTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <SectionHeader show={showScenarios} label="COMMUNICATIONS"/>
                        {([["communications.phone","Phone & Cellular",model.communications.phone],["communications.satTV","Satellite TV",model.communications.satTV],["communications.satcom","Satcom / Data (Starlink etc.)",model.communications.satcom]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} label={l} path={p} effective={getEff(p,s)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>))}
                        <Row label="TOTAL COMMUNICATIONS" path="__comm" effective={commTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <SectionHeader show={showScenarios} label="OPERATIONS"/>
                        {([["operations.agency","Agency",model.operations.agency],["operations.audioVisual","Audio Visual",model.operations.audioVisual],["operations.auto","Auto",model.operations.auto],["operations.bridge","Bridge",model.operations.bridge],["operations.computer","Computer",model.operations.computer],["operations.deck","Deck",model.operations.deck],["operations.dockExpress","Dock Express / Shipping",model.operations.dockExpress],["operations.engineering","Engineering (Routine Maintenance)",model.operations.engineering],["operations.fuels","Fuels & Lubricants",model.operations.fuels],["operations.galley","Galley (Guest Provisions)",model.operations.galley],["operations.interior","Interior",model.operations.interior],["operations.launches","Launches & Tenders",model.operations.launches],["operations.mailFreight","Mail & Freight",model.operations.mailFreight],["operations.office","Office",model.operations.office],["operations.dockage","Ports, Dockage & Customs",model.operations.dockage],["operations.safetyMedical","Safety & Medical",model.operations.safetyMedical],["operations.security","Security",model.operations.security],["operations.survey","Survey & Certification",model.operations.survey],["operations.warehousing","Warehousing & Storage",model.operations.warehousing]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} label={l} path={p} effective={getEff(p,s)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>))}
                        <Row label="TOTAL OPERATIONS" path="__op" effective={opTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <SectionHeader show={showScenarios} label="INSURANCE"/>
                        {([["insurance.hull","Hull & Machinery (H&M)",model.insurance.hull],["insurance.pi","Protection & Indemnity (P&I)",model.insurance.pi],["insurance.crewHealth","Crew Health Insurance",model.insurance.crewHealth]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} label={l} path={p} effective={getEff(p,s)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>))}
                        <Row label="TOTAL INSURANCE" path="__ins" effective={insTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <SectionHeader show={showScenarios} label="ADMINISTRATIVE"/>
                        {([["administrative.professionalFees","Professional Fees",model.administrative.professionalFees],["administrative.bankCharges","Bank Charges",model.administrative.bankCharges],["administrative.managementFee","Management Fee",model.administrative.managementFee],["administrative.managementTravel","Management Travel",model.administrative.managementTravel]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} label={l} path={p} effective={getEff(p,s)} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>))}
                        <Row label="TOTAL ADMINISTRATIVE" path="__adm" effective={admTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <SectionHeader show={showScenarios} label="ANNUAL HAUL-OUT & ANTIFOUL"/>
                        <Row label="Haul-out, Bottom Paint & Antifoul" path="capital.haulAntifoul"
                          effective={getEff("capital.haulAntifoul", model.capital.haulAntifoul??{low:0,mid:0,high:0})}
                          show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                        <Row label="TOTAL HAUL-OUT" path="__haul"
                          effective={getEff("capital.haulAntifoul", model.capital.haulAntifoul??{low:0,mid:0,high:0})}
                          bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        <tr><td colSpan={colCount(showScenarios)} className="pt-4"/></tr>
                        <Row label="GRAND TOTAL" path="__gt" effective={gtAdj} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {adjustCharterWeeks>0&&<>
                          <Row label={`Charter Revenue (${adjustCharterWeeks} wks est. net)`} path="__charter" effective={{low:-charterRevenue.low,mid:-charterRevenue.mid,high:-charterRevenue.high}} show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                          <Row label="NET ANNUAL COST" path="__net" effective={netCost} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                        </>}
                        {(adjustCrewCount!==baseCrewCount||extraPositions.some(p=>p.checked))&&(
                          <tr><td colSpan={colCount(showScenarios)} style={{paddingTop:8,fontSize:11,color:"#a78bfa"}}>
                            ★ Crew adjusted: {adjustCrewCount} crew{extraPositions.filter(p=>p.checked).map(p=>` + ${p.label}`).join("")} · {crewDelta.mid>=0?"+":""}{fmt(crewDelta.mid)}/yr mid included above
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Capital Events footnote — separate from annual total */}
                  {model.capitalEvents&&(
                    <div className="rounded-xl mt-4 p-5" style={{background:"var(--card)",border:"1px solid rgba(251,146,60,.25)"}}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{color:"#fb923c"}}>Capital Events — Not Included in Annual Figure Above</p>
                      <p className="text-xs mb-4" style={{color:"var(--navy-400)"}}>These are major one-time expenditures that occur on multi-year cycles. Plan for them separately — they are not amortised into the running cost above.</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { key:"paint",   icon:"🎨", e:model.capitalEvents.paint,   val:`${fmt(model.capitalEvents.paint.totalEst)} total · every ${model.capitalEvents.paint.periodYears} yrs` },
                          { key:"engines", icon:"⚙️", e:model.capitalEvents.engines,  val:`${fmt(model.capitalEvents.engines.costPerEngine)} / engine · ${model.capitalEvents.engines.intervalHours.toLocaleString()}hr interval · ≈ ${model.capitalEvents.engines.yearsAtCurrentUse} yrs` },
                          { key:"systems", icon:"📡", e:model.capitalEvents.systems,  val:`${fmt(model.capitalEvents.systems.totalEst)} total · every ${model.capitalEvents.systems.periodYears} yrs` },
                          { key:"interior",icon:"🛋️", e:model.capitalEvents.interior, val:`${fmt(model.capitalEvents.interior.totalEst)} total · every ${model.capitalEvents.interior.periodYears} yrs` },
                        ].map(({key,icon,e,val})=>(
                          <div key={key} style={{background:"rgba(251,146,60,.06)",border:"1px solid rgba(251,146,60,.15)",borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:12,fontWeight:700,color:"#fb923c",marginBottom:3}}>{icon} {e.label}</div>
                            <div style={{fontSize:13,fontWeight:700,color:"var(--foreground)",marginBottom:3}}>{val}</div>
                            <div style={{fontSize:11,color:"var(--navy-400)",lineHeight:1.5}}>{e.note}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <CategoryExamples/>
                </div>
              )}

              {/* ANALYSIS TAB */}
              {activeTab==="analysis"&&(
                <div className="space-y-4">
                  {([["Use Assumptions",model.assumptions],["Cost Range Explanation",model.rangeExplanation],["Category Breakdown",model.categoryBreakdown],["Crew Structure Note",model.crewStructureNote],["Key Cost Drivers",model.keyDrivers]] as [string,string][]).map(([title,content])=>(
                    <div key={title} className="rounded-xl p-5" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:"var(--brass-400)"}}>{title}</p>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{color:"var(--foreground)"}}>{content}</p>
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
