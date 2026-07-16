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
    agreedHullValue: number; hullValueSource?: string;
    managementTier: string; crewPreset: string;
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
    corrective?: Scenario;
    fuels: Scenario; fuelBasis?: string; fuelConfidence?: string; fuelGphMid?: number;
    galley: Scenario; interior: Scenario; launches: Scenario;
    mailFreight: Scenario; office: Scenario;
    dockage: Scenario; dockageHomeBerth?: Scenario; dockageTransient?: Scenario; dockagePortDues?: Scenario;
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
  capitalEvents?: { disclaimer: string };
  // Reserve planning — optional, NOT in headline total
  reservePlan?: {
    paint:Scenario;teak:Scenario;engines:Scenario;generators:Scenario;stabilizers:Scenario;
    electronics:Scenario;avIT:Scenario;softGoods:Scenario;tenders:Scenario;classSurvey:Scenario;
    other:Scenario;total:Scenario;
  } | null;
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

// Use patterns — sets explicit Low/Mid/High engine hours
const USAGE_PATTERNS: Record<string,[number,number,number]> = {
  light_private:  [100,200,350],
  normal_private: [200,350,600],
  active_owner:   [350,600,900],
  charter_heavy:  [550,850,1300],
};
const USAGE_PATTERN_LABELS: Record<string,{label:string;sub:string}> = {
  light_private:  {label:"Light Private",  sub:"200 hrs mid · weekends & holidays"},
  normal_private: {label:"Normal Private",  sub:"350 hrs mid · 3–4 active months"},
  active_owner:   {label:"Active Owner",    sub:"600 hrs mid · regular seasonal use"},
  charter_heavy:  {label:"Charter / Heavy", sub:"850 hrs mid · professional / liveaboard"},
};

// Vessel condition → affects corrective repair allowance shown in model
const CONDITION_OPTIONS = [
  {key:"excellent", label:"Excellent",  sub:"Recent survey, no known issues",  color:"#4ade80"},
  {key:"good",      label:"Good",       sub:"Well maintained, minor items only", color:"#86efac"},
  {key:"average",   label:"Average",    sub:"Normal wear, some deferred items",  color:"#facc15"},
  {key:"deferred",  label:"Deferred",   sub:"Known maintenance backlog",         color:"#f87171"},
  {key:"unknown",   label:"Unknown",    sub:"No survey data yet (default)",      color:"#94a3b8"},
];

// Complexity — affects engineering, deck, interior, survey
const COMPLEXITY_OPTIONS = [
  {key:"simple",    label:"Simple",    sub:"Express / sport / single-deck",     color:"#38bdf8"},
  {key:"normal",    label:"Normal",    sub:"Standard flybridge motor yacht",     color:"#94a3b8"},
  {key:"high",      label:"High",      sub:"Tri-deck / explorer / classed",      color:"#f59e0b"},
  {key:"very_high", label:"Very High", sub:"Custom systems / complex vintage",   color:"#f87171"},
];

// What each scenario actually means — shown in the expandable panel
const SCENARIO_DESCRIPTIONS = {
  low: {
    label: "LOW — Lean Operation",
    color: "#4ade80",
    points: [
      "55% of stated engine hours — lighter use year, fewer passages",
      "Economy marina berths or private dock when available",
      "Minimum port agency / customs involvement",
      "Base provisioning, no upgrades or premium expenses",
      "Crew at base complement, no extras",
    ],
  },
  mid: {
    label: "MID — Typical Ownership Year",
    color: "#facc15",
    points: [
      "Stated engine hours at normal cruise load",
      "Standard marina berths, regular port calls",
      "Normal provisioning and crew quality",
      "Routine maintenance at scheduled intervals",
      "The number to plan and budget around",
    ],
  },
  high: {
    label: "HIGH — Active Use, Busy Season",
    color: "#f87171",
    points: [
      "155% of stated engine hours — peak season, frequent passages",
      "Premium berths and transient stops throughout the year",
      "Higher fuel price tier reflecting international markets",
      "Elevated provisioning, guest entertaining, crew usage",
      "What a fully-loaded active season looks like",
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
    <tr><td colSpan={colCount(show)} className="pt-6 pb-1 text-xs font-bold uppercase tracking-widest" style={{color:"var(--brass-400)"}}>{label}</td></tr>
  );
}

/* ─── Row — with checkbox (include/exclude) + inline edit ─────────────── */
interface RowProps {
  label: string; path: string; effective: Scenario; bold?: boolean;
  show: ShowScenarios; overrides: Record<string,number>;
  onOverride: (key:string,val:number)=>void;
  onResetRow: (path:string)=>void;
  excluded?: boolean;
  onToggleExclude?: (path:string)=>void;
}

function Row({ label, path, effective, bold, show, overrides, onOverride, onResetRow, excluded, onToggleExclude }: RowProps) {
  const [editSc, setEditSc] = React.useState<keyof Scenario|null>(null);
  const [editVal, setEditVal] = React.useState("");

  // Rows the user has hidden simply don't render — they're zeroed in getEff
  if (excluded && !bold) return null;

  function startEdit(sc: keyof Scenario) { if (bold) return; setEditSc(sc); setEditVal(String(Math.round(effective[sc]))); }
  function saveEdit() {
    if (editSc===null) return;
    // Strip everything except digits and decimal point — no negatives possible
    const cleaned = editVal.replace(/[^0-9.]/g, "");
    const num = cleaned ? parseFloat(cleaned) : NaN;
    if (!isNaN(num) && isFinite(num)) onOverride(`${path}.${editSc}`, Math.round(num));
    setEditSc(null);
  }
  const hasOv = !bold&&(overrides[`${path}.low`]!==undefined||overrides[`${path}.mid`]!==undefined||overrides[`${path}.high`]!==undefined);
  const scColors: Record<keyof Scenario,string> = {low:"#4ade80",mid:"#facc15",high:"#f87171"};

  return (
    <tr style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
      <td style={{padding:"8px 0",fontSize:13,color:bold?"var(--brass-400)":"var(--foreground)",fontWeight:bold?700:400}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:7}}>
          {/* Checkbox — only on non-bold rows */}
          {!bold && onToggleExclude && (
            <button
              onClick={e=>{e.stopPropagation();onToggleExclude(path);}}
              title={excluded?"Restore this line":"Hide & exclude from total"}
              style={{flexShrink:0,width:14,height:14,borderRadius:3,border:`1.5px solid ${excluded?"#64748b":"var(--brass-400)"}`,background:excluded?"transparent":"var(--brass-400)",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",padding:0,outline:"none"}}>
              {!excluded&&<span style={{color:"#000",fontSize:8,fontWeight:900,lineHeight:1}}>✓</span>}
            </button>
          )}
          <span>{label}</span>
          {hasOv&&<span style={{fontSize:9,fontWeight:700,color:"#fb923c",background:"rgba(251,146,60,.12)",borderRadius:3,padding:"1px 5px",letterSpacing:"0.03em"}}>edited</span>}
          {hasOv&&<button onClick={()=>onResetRow(path)} title="Reset to model value" style={{fontSize:10,color:"#fb923c",background:"none",border:"none",cursor:"pointer",padding:0}}>↺</button>}
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
              <span style={{fontSize:13,color:bold?color:isOv?"#fb923c":"var(--foreground)",fontWeight:bold?700:400}}>
                {fmt(effective[sc])}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

/* ─── Scenario Descriptions panel ───────────────────────────────────────── */
function ScenarioDescriptions({ show }: { show: ShowScenarios }) {
  const [open, setOpen] = React.useState(false);
  const scenarios = (["low","mid","high"] as (keyof ShowScenarios)[]).filter(k=>show[k]);
  return (
    <div style={{marginBottom:4}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",cursor:"pointer",padding:"4px 0"}}>
        <span style={{width:16,height:16,borderRadius:"50%",border:"1px solid var(--navy-400)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"var(--navy-400)",fontWeight:700,flexShrink:0}}>i</span>
        <span style={{fontSize:11,color:"var(--navy-400)",textDecoration:"underline dotted"}}>What do Low / Mid / High actually mean?</span>
      </button>
      {open&&(
        <div className="rounded-xl mt-2 p-4" style={{background:"var(--card)",border:"1px solid var(--border)",display:"grid",gridTemplateColumns:`repeat(${scenarios.length},1fr)`,gap:12}}>
          {scenarios.map(k=>{
            const s=SCENARIO_DESCRIPTIONS[k];
            return (
              <div key={k}>
                <p className="text-xs font-bold mb-2" style={{color:s.color}}>{s.label}</p>
                <ul style={{margin:0,padding:"0 0 0 14px"}}>
                  {s.points.map((pt,i)=><li key={i} style={{fontSize:11,color:"var(--foreground)",opacity:0.75,marginBottom:4,lineHeight:1.55}}>{pt}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Category Reference accordion ─────────────────────────────────────── */
const CATEGORY_EXAMPLES: Record<string,{desc:string;items:string[]}> = {
  CREW:{desc:"All costs to hire, compensate, travel, and support the crew year-round.",items:["Captain, Engineer, Chef, Stewardess(es), Deckhand(s) — salaries from Crewfinders 2025 placement data","Recruitment agency fees (typically 10–15% of first-year salary)","Crew rotation flights and transportation","Accommodation during shipyard periods","Uniforms, foul-weather gear, certifications","Crew provisions, daily meals, medical, entertainment"]},
  COMMUNICATIONS:{desc:"All vessel connectivity and satellite services.",items:["Phone plans for captain and crew","Satellite TV (DirecTV, SKY)","Starlink Maritime / KVH / Inmarsat broadband","Weather routing and satellite phone airtime"]},
  OPERATIONS:{desc:"Day-to-day running costs across every department.",items:["Engineering: routine engine servicing, filters, consumables — age-adjusted","Fuels: HP-formula diesel + tender petrol + lubricants","Dockage: home berth + transient stops (LOA × rate × 12 months)","Galley: guest food, wine, provisions","Agency, deck, interior, safety, survey, warehousing consumables"]},
  INSURANCE:{desc:"Annual insurance premiums.",items:["Hull & Machinery: agreed hull value × rate (0.75–1.75% by age/use)","Protection & Indemnity: third-party liability","Crew Health Insurance: medical, dental, repatriation"]},
  ADMINISTRATIVE:{desc:"Professional services and management overhead.",items:["Professional Fees: lawyers, flag registration, accountants","Bank Charges: account fees, international wires","Management Fee: 0 by default; 5–8% if management company used","Management Travel: site visits, yard supervision"]},
  "HAUL-OUT":{desc:"Annual bottom work.",items:["Haulout fee + blocking + launch","Antifouling paint application","Zinc anode replacement, propeller inspection, seacock service"]},
};

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
  const [url, setUrl]         = React.useState("");
  const [inputMode, setInputMode] = React.useState<"url"|"pdf">("url");
  const [pdfFile, setPdfFile] = React.useState<File|null>(null);
  const [pdfParsing, setPdfParsing] = React.useState(false);
  const [pdfVessel, setPdfVessel] = React.useState<Record<string,unknown>|null>(null);
  const [pdfFileName, setPdfFileName] = React.useState("");
  const [homePort, setHomePort] = React.useState("Florida / US East Coast");
  const [vesselStyle, setVesselStyle] = React.useState("Luxury / Full Fairing & Paint");
  const [usagePattern, setUsagePattern] = React.useState("normal_private");
  const [vesselCondition, setVesselCondition] = React.useState("unknown");
  const [vesselComplexity, setVesselComplexity] = React.useState<string|undefined>(undefined); // auto-inferred if unset
  const [knownGph, setKnownGph] = React.useState<number|undefined>(undefined);
  const [agreedHullValue, setAgreedHullValue] = React.useState<number|undefined>(undefined);  const [includeReservePlanning, setIncludeReservePlanning] = React.useState(false);
  const [charterWeeks, setCharterWeeks] = React.useState(0);
  const [segment, setSegment] = React.useState<"super"|"small">("super");
  const [crewMode, setCrewMode] = React.useState<"owner"|"captain"|"captain_mate">("captain");

  // Charter proforma state
  const [showCharterProforma, setShowCharterProforma] = React.useState(false);
  const [charterWeekScenarios, setCharterWeekScenarios] = React.useState<[number,number,number]>([8,14,20]);
  const [charterWeeklyRate, setCharterWeeklyRate] = React.useState<number|null>(null);
  const [charterCommissionPct, setCharterCommissionPct] = React.useState(15);
  const [charterRepositioning, setCharterRepositioning] = React.useState<"none"|"regional"|"seasonal"|"transatlantic">("regional");

  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState("");
  const [model, setModel]       = React.useState<CostModel|null>(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  // Position index map — maps crew role name → index in breakdown
  // getEff uses this to zero salary for positions above each scenario's crew count
  const positionIndexMap = React.useMemo(() => {
    if (!model) return {} as Record<string,number>;
    const bd = (model.crew?.salaries?.breakdown ?? []) as {role:string}[];
    return Object.fromEntries(bd.map((r,i) => [r.role, i]));
  }, [model]);

  const [activeTab, setActiveTab] = React.useState<"table"|"analysis">("table");
  const [showScenarios, setShowScenarios] = React.useState<ShowScenarios>({low:false,mid:true,high:false});
  const [overrides, setOverrides] = React.useState<Record<string,number>>({});

  // Paths the user has hidden (excluded from total + not rendered)
  const [excludedPaths, setExcludedPaths] = React.useState<Set<string>>(new Set());

  const [baseHours, setBaseHours]   = React.useState(800);
  const [adjustHours, setAdjustHours] = React.useState(800);
  const [adjustCharterWeeks, setAdjustCharterWeeks] = React.useState(0);
  const [vesselLoaFt, setVesselLoaFt] = React.useState(100);

  const [baseCrewCount, setBaseCrewCount] = React.useState(5);
  // Per-scenario crew counts — Low / Mid / High independently
  const [adjustCrewCounts, setAdjustCrewCounts] = React.useState<[number,number,number]>([5,5,5]);
  const [perCrewRates, setPerCrewRates] = React.useState<PerCrew|null>(null);
  type ExtraPos = { key:string; label:string; salMid:number; checked:boolean };
  const [extraPositions, setExtraPositions] = React.useState<ExtraPos[]>([]);

  function toggleScenario(key: keyof ShowScenarios) {
    setShowScenarios(prev=>{const n={...prev,[key]:!prev[key]};if(!n.low&&!n.mid&&!n.high)return prev;return n;});
  }
  function handleOverride(key:string,val:number) { setOverrides(p=>({...p,[key]:val})); }
  function resetRow(path:string) { setOverrides(p=>{const n={...p};delete n[`${path}.low`];delete n[`${path}.mid`];delete n[`${path}.high`];return n;}); }
  function resetAllOverrides() { setOverrides({}); }
  function toggleExclude(path:string) {
    setExcludedPaths(prev=>{const n=new Set(prev);if(n.has(path))n.delete(path);else n.add(path);return n;});
  }
  function restoreAll() { setExcludedPaths(new Set()); }

  // Per-person crew support paths — scale automatically when crew count changes
  const CREW_PER_PERSON = ["crew.foodBeverage","crew.medical","crew.uniforms",
    "crew.training","crew.travel","crew.accommodation","crew.entertainment","insurance.crewHealth"];

  // getEff: returns zero for excluded, scales per-person crew items, scales fuel with hours
  function getEff(path:string, s:Scenario): Scenario {
    if (excludedPaths.has(path)) return {low:0,mid:0,high:0};
    const hasOverride = overrides[`${path}.low`]!==undefined || overrides[`${path}.mid`]!==undefined || overrides[`${path}.high`]!==undefined;
    let base: Scenario;

    // Salary rows: zero out positions above each scenario's crew count
    if (path.startsWith("crew.salaries.") && !hasOverride) {
      const role = path.replace("crew.salaries.","");
      const posIdx = positionIndexMap[role] ?? 999;
      return {
        low:  posIdx < adjustCrewCounts[0] ? (overrides[`${path}.low`]  ?? s.low)  : 0,
        mid:  posIdx < adjustCrewCounts[1] ? (overrides[`${path}.mid`]  ?? s.mid)  : 0,
        high: posIdx < adjustCrewCounts[2] ? (overrides[`${path}.high`] ?? s.high) : 0,
      };
    }

    if (!hasOverride && CREW_PER_PERSON.includes(path) && baseCrewCount > 0) {
      // Scale each scenario independently by its own crew count
      const s0 = adjustCrewCounts[0] / baseCrewCount;
      const s1 = adjustCrewCounts[1] / baseCrewCount;
      const s2 = adjustCrewCounts[2] / baseCrewCount;
      base = { low: s.low*s0, mid: s.mid*s1, high: s.high*s2 };
    } else if (path === "operations.fuels") {
      const ratio = baseHours>0 ? adjustHours/baseHours : 1;
      base = {low: s.low*ratio, mid: s.mid*ratio, high: s.high*ratio};
    } else {
      base = {...s};
    }
    return {low:overrides[`${path}.low`]??base.low, mid:overrides[`${path}.mid`]??base.mid, high:overrides[`${path}.high`]??base.high};
  }

  const charterRevenue = React.useMemo(():Scenario=>{
    if(adjustCharterWeeks===0)return{low:0,mid:0,high:0};
    const wg=vesselLoaFt*1100;
    return{low:adjustCharterWeeks*wg*0.60,mid:adjustCharterWeeks*wg*0.78,high:adjustCharterWeeks*wg*0.92};
  },[adjustCharterWeeks,vesselLoaFt]);

  // crewDelta — per-scenario crew counts, salary-only delta for slider changes
  // Per-person support (food, medical, etc.) auto-scales via getEff per scenario
  const crewDelta: Scenario = React.useMemo(()=>{
    if (!perCrewRates) return {low:0,mid:0,high:0};
    const r5l=(n:number)=>Math.round(n/5000)*5000;
    // sp used for extra position toggles only
    const sp={
      low:  r5l(perCrewRates.foodDaily.low *365)+perCrewRates.health.low +perCrewRates.travel.low +perCrewRates.uniform.low +perCrewRates.training.low,
      mid:  r5l(perCrewRates.foodDaily.mid *365)+perCrewRates.health.mid +perCrewRates.travel.mid +perCrewRates.uniform.mid +perCrewRates.training.mid,
      high: r5l(perCrewRates.foodDaily.high*365)+perCrewRates.health.high+perCrewRates.travel.high+perCrewRates.uniform.high+perCrewRates.training.high,
    };
    // Salary delta: only for ADDING crew above base count
    // Removal is now handled by getEff zeroing salary rows for removed positions
    const computeAddDelta = (targetCount:number, sc:"low"|"mid"|"high"):number => {
      const delta = targetCount - baseCrewCount;
      if (delta <= 0) return 0; // removals handled by getEff position-awareness
      return delta * perCrewRates.salJr[sc];
    };
    const d:Scenario = {
      low:  computeAddDelta(adjustCrewCounts[0], "low"),
      mid:  computeAddDelta(adjustCrewCounts[1], "mid"),
      high: computeAddDelta(adjustCrewCounts[2], "high"),
    };
    // Extra position toggles: full cost (not in model base, so include support)
    extraPositions.filter(p=>p.checked).forEach(pos=>{
      d.low+=r5l(pos.salMid*0.82)+sp.low; d.mid+=pos.salMid+sp.mid; d.high+=r5l(pos.salMid*1.18)+sp.high;
    });
    return d;
  },[adjustCrewCounts,baseCrewCount,perCrewRates,extraPositions]);

  function grandTotals(m:CostModel):Scenario {
    const effSal=m.crew.salaries.breakdown?.length
      ? sectionTotal(m.crew.salaries.breakdown.map(r=>getEff(`crew.salaries.${r.role}`,r)))
      : getEff("crew.salaries",m.crew.salaries);
    return sectionTotal([
      effSal,
      getEff("crew.recruitment",m.crew.recruitment),getEff("crew.travel",m.crew.travel),
      getEff("crew.accommodation",m.crew.accommodation),getEff("crew.uniforms",m.crew.uniforms),
      getEff("crew.training",m.crew.training),getEff("crew.foodBeverage",m.crew.foodBeverage),
      getEff("crew.medical",m.crew.medical),getEff("crew.dayWorkers",m.crew.dayWorkers),
      getEff("crew.entertainment",m.crew.entertainment),
      getEff("communications.phone",m.communications.phone),
      getEff("communications.satTV",m.communications.satTV),
      getEff("communications.satcom",m.communications.satcom),
      getEff("operations.agency",m.operations.agency),getEff("operations.audioVisual",m.operations.audioVisual),
      getEff("operations.auto",m.operations.auto),getEff("operations.bridge",m.operations.bridge),
      getEff("operations.computer",m.operations.computer),getEff("operations.deck",m.operations.deck),
      getEff("operations.dockExpress",m.operations.dockExpress),getEff("operations.engineering",m.operations.engineering),
      getEff("operations.corrective",m.operations.corrective??{low:0,mid:0,high:0}),
      getEff("operations.fuels",m.operations.fuels),getEff("operations.galley",m.operations.galley),
      getEff("operations.interior",m.operations.interior),getEff("operations.launches",m.operations.launches),
      getEff("operations.mailFreight",m.operations.mailFreight),getEff("operations.office",m.operations.office),
      // Dockage — use sub-rows when available, fall back to total
      ...(m.operations.dockageHomeBerth
        ? [getEff("operations.dockageHomeBerth",m.operations.dockageHomeBerth),
           getEff("operations.dockageTransient",m.operations.dockageTransient??{low:0,mid:0,high:0}),
           getEff("operations.dockagePortDues",m.operations.dockagePortDues??{low:0,mid:0,high:0})]
        : [getEff("operations.dockage",m.operations.dockage)]),
      getEff("operations.safetyMedical",m.operations.safetyMedical),
      getEff("operations.security",m.operations.security),getEff("operations.survey",m.operations.survey),
      getEff("operations.warehousing",m.operations.warehousing),
      getEff("insurance.hull",m.insurance.hull),getEff("insurance.pi",m.insurance.pi),
      getEff("insurance.crewHealth",m.insurance.crewHealth),
      getEff("administrative.professionalFees",m.administrative.professionalFees),
      getEff("administrative.bankCharges",m.administrative.bankCharges),
      getEff("administrative.managementFee",m.administrative.managementFee),
      getEff("administrative.managementTravel",m.administrative.managementTravel),
      getEff("capital.haulAntifoul",m.capital.haulAntifoul??{low:0,mid:0,high:0}),
    ]);
  }

  async function generate() {
    if (inputMode==="url"&&!url.trim()) return;
    if (inputMode==="pdf"&&!pdfVessel) return;
    setLoading(true); setError(""); setModel(null); setOverrides({}); setExcludedPaths(new Set());
    try {
      let vessel: Record<string,unknown> = {};
      if (inputMode==="pdf"&&pdfVessel) {
        vessel = pdfVessel;
        setVesselLoaFt(parseLoaToFeet(String(pdfVessel.loa||"")));
      } else {
        const scrapeRes=await fetch("/api/brochures/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:url.trim()})});
        const scrapeData=await scrapeRes.json();
        if(!scrapeData.ok&&!scrapeData.vessel) throw new Error(scrapeData.error||"Scrape failed");
        vessel=scrapeData.vessel||{};
        setVesselLoaFt(parseLoaToFeet(String(vessel.loa||"")));
      }
      const sourceUrl = inputMode==="url" ? url.trim() : "";
      const res=await fetch("/api/ownership/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({vessel,url:sourceUrl,usagePattern,vesselCondition,
          vesselComplexity,knownGph:knownGph||undefined,
          agreedHullValue:agreedHullValue||undefined,
          includeReservePlanning,
          charterWeeks,homePort,vesselStyle,segment,crewMode})});
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"Generation failed");
      setModel(data.model);
      const patternMid = (USAGE_PATTERNS[usagePattern]??USAGE_PATTERNS.normal_private)[1];
      setBaseHours(patternMid); setAdjustHours(patternMid); setAdjustCharterWeeks(charterWeeks);
      const meta=data.model._meta;
      const cc=meta?.crewCount??data.model.crew?.salaries?.breakdown?.length??5;
      setBaseCrewCount(cc); setAdjustCrewCounts([cc,cc,cc]);
      setPerCrewRates(meta?.perCrew??null);
      const lm=meta?.loa_m??40;
      setExtraPositions([
        {key:"bosun",    label:"Bosun",         salMid:lm>=45?82000:62000, checked:false},
        {key:"2nd_eng",  label:"2nd Engineer",  salMid:lm>=50?95000:78000, checked:false},
        {key:"3rd_stew", label:"3rd Stewardess",salMid:lm>=45?58000:50000, checked:false},
        {key:"chef2",    label:"Sous Chef",     salMid:lm>=40?72000:62000, checked:false},
      ]);
    } catch(err){ setError(err instanceof Error?err.message:"Unknown error"); }
    finally{ setLoading(false); }
  }

  async function downloadPDF() {
    if(!model) return;
    setPdfLoading(true);
    try{
      const res=await fetch("/api/ownership/pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model,scenarios:showScenarios,overrides,excludedPaths:Array.from(excludedPaths)})});
      if(!res.ok) throw new Error("PDF failed");
      const blob=await res.blob();
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download=`${(model.vesselName||"budget").replace(/[^a-zA-Z0-9]/g,"-").toLowerCase()}-cost-model.pdf`;
      a.click();
    }catch(e){ alert("PDF failed: "+(e instanceof Error?e.message:"error")); }
    finally{ setPdfLoading(false); }
  }

  const overrideCount=Object.keys(overrides).length;
  const hiddenCount=excludedPaths.size;

  // Helper: pass shared Row props
  const rp = (p:string,l:string,s:Scenario) => ({
    path:p, label:l, effective:getEff(p,s),
    show:showScenarios, overrides, onOverride:handleOverride, onResetRow:resetRow,
    excluded:excludedPaths.has(p), onToggleExclude:toggleExclude,
  });

  return (
    <PageShell title="Ownership Cost Model">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1" style={{color:"var(--brass-400)"}}>Estimated Annual Operating Budget</h1>
          <p className="text-sm" style={{color:"var(--navy-400)"}}>HP-based fuel · Agreed hull value insurance · Crewfinders 2025 salaries · Condition-adjusted corrective allowance</p>
        </div>

        {/* Segment */}
        <div className="flex gap-2 mb-5">
          {([{key:"super",label:"Superyacht",sub:"80 ft+"},{key:"small",label:"40–80 ft",sub:"Owner-operated class"}] as const).map(s=>(
            <button key={s.key} onClick={()=>setSegment(s.key)} className="flex-1 rounded-xl px-4 py-3 text-left"
              style={{background:segment===s.key?"var(--brass-400)":"var(--card)",border:`1px solid ${segment===s.key?"var(--brass-400)":"var(--border)"}`,color:segment===s.key?"#0a1628":"var(--foreground)"}}>
              <div className="text-sm font-bold">{s.label}</div><div className="text-xs" style={{opacity:0.8}}>{s.sub}</div>
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="rounded-xl p-5 mb-6" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
          {/* Input mode toggle */}
          <div className="flex gap-2 mb-3">
            {([["url","🔗 Listing URL","Paste a YachtWorld, Denison, or broker link"],["pdf","📄 Upload PDF","Vessel brochure or spec sheet"]] as [string,string,string][]).map(([mode,label,sub])=>(
              <button key={mode} onClick={()=>setInputMode(mode as "url"|"pdf")} className="flex-1 rounded-lg px-3 py-2 text-left"
                style={{background:inputMode===mode?"var(--brass-400)":"var(--input,#1e293b)",border:`1px solid ${inputMode===mode?"var(--brass-400)":"var(--border)"}`,color:inputMode===mode?"#0a1628":"var(--foreground)"}}>
                <div className="text-xs font-bold">{label}</div>
                <div className="text-xs mt-0.5" style={{opacity:0.7}}>{sub}</div>
              </button>
            ))}
          </div>

          {inputMode==="url"&&(
            <>
              <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>Listing URL</label>
              <input className="w-full rounded-lg text-sm px-3 py-2.5 mb-4"
                style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)"}}
                value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generate()}
                placeholder="https://www.yachtworld.com/yacht/… or denisonyachtsales.com/…"/>
            </>
          )}

          {inputMode==="pdf"&&(
            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>Vessel Brochure or Spec Sheet (PDF)</label>
              <div className="rounded-lg p-4" style={{background:"var(--input,#1e293b)",border:`1px dashed ${pdfVessel?"#4ade80":"var(--border)"}`,textAlign:"center"}}>
                {!pdfVessel&&!pdfParsing&&(
                  <label style={{cursor:"pointer",display:"block"}}>
                    <input type="file" accept="application/pdf" style={{display:"none"}}
                      onChange={async e=>{
                        const f=e.target.files?.[0];
                        if(!f)return;
                        setPdfFile(f);setPdfParsing(true);setPdfVessel(null);setError("");
                        try{
                          const fd=new FormData();fd.append("pdf",f);
                          const res=await fetch("/api/ownership/pdf-parse",{method:"POST",body:fd});
                          const data=await res.json();
                          if(!data.ok)throw new Error(data.error||"PDF parse failed");
                          setPdfVessel(data.vessel);
                          setPdfFileName(data.fileName||f.name);
                        }catch(err){setError(err instanceof Error?err.message:"PDF parse failed");setPdfFile(null);}
                        finally{setPdfParsing(false);}
                      }}/>
                    <div style={{fontSize:24,marginBottom:6}}>📄</div>
                    <p className="text-sm font-semibold" style={{color:"var(--brass-400)"}}>Click to upload PDF</p>
                    <p className="text-xs mt-1" style={{color:"var(--navy-400)"}}>Brochure, spec sheet, survey — up to 30 MB</p>
                  </label>
                )}
                {pdfParsing&&(
                  <div style={{padding:"8px 0"}}>
                    <div className="w-5 h-5 border-2 rounded-full animate-spin mx-auto mb-2" style={{borderColor:"var(--brass-400)",borderTopColor:"transparent"}}/>
                    <p className="text-xs" style={{color:"var(--navy-400)"}}>Reading PDF… extracting vessel specs…</p>
                  </div>
                )}
                {pdfVessel&&!pdfParsing&&(
                  <div style={{textAlign:"left"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>✅</span>
                        <div>
                          <p className="text-xs font-bold" style={{color:"#4ade80"}}>{String(pdfVessel.name||pdfFileName)}</p>
                          <p className="text-xs" style={{color:"var(--navy-400)"}}>{pdfFileName} · specs extracted</p>
                        </div>
                      </div>
                      <button onClick={()=>{setPdfVessel(null);setPdfFile(null);setPdfFileName("");}}
                        style={{fontSize:11,color:"var(--navy-400)",background:"none",border:"none",cursor:"pointer"}}>✕ Remove</button>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {[["LOA",String(pdfVessel.loa||"")],["Year",String(pdfVessel.year||"")],["Engines",String(pdfVessel.engines||"").slice(0,40)],["Range",String(pdfVessel.range||"")]].filter(([,v])=>v&&v!=="null").map(([k,v])=>(
                        <span key={k} style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(74,222,128,.08)",color:"#4ade80",border:"1px solid rgba(74,222,128,.2)"}}>{k}: {v}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>Annual Use Pattern <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>— sets Low / Mid / High engine hours</span></label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(USAGE_PATTERN_LABELS).map(([key,{label,sub}])=>{
                  const hrs=USAGE_PATTERNS[key];
                  return (
                    <button key={key} onClick={()=>setUsagePattern(key)} className="rounded-lg px-3 py-2 text-left"
                      style={{background:usagePattern===key?"var(--brass-400)":"var(--input,#1e293b)",border:`1px solid ${usagePattern===key?"var(--brass-400)":"var(--border)"}`,color:usagePattern===key?"#0a1628":"var(--foreground)"}}>
                      <div className="text-xs font-bold">{label}</div>
                      <div className="text-xs mt-0.5" style={{opacity:0.75}}>{sub}</div>
                      <div className="text-xs mt-1" style={{opacity:0.55,fontFamily:"monospace"}}>{hrs[0]} / {hrs[1]} / {hrs[2]} hrs L/M/H</div>
                    </button>
                  );
                })}
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
            <div>
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Charter Weeks / Year</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="number" min={0} max={20} step={1} value={charterWeeks}
                  onChange={e=>setCharterWeeks(Math.max(0,Math.min(20,Number(e.target.value)||0)))}
                  className="rounded-lg text-sm px-3 py-2"
                  style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:90}}/>
                <span className="text-xs" style={{color:"var(--navy-400)"}}>wks · revenue offset</span>
              </div>
            </div>
          </div>
          {/* Condition rating */}
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>Vessel Condition <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>— affects corrective repair allowance</span></label>
            <div className="flex gap-2 flex-wrap">
              {CONDITION_OPTIONS.map(c=>(
                <button key={c.key} onClick={()=>setVesselCondition(c.key)} className="flex-1 rounded-lg px-3 py-2 text-left min-w-24"
                  style={{background:vesselCondition===c.key?`${c.color}20`:"var(--input,#1e293b)",border:`1.5px solid ${vesselCondition===c.key?c.color:"var(--border)"}`,color:vesselCondition===c.key?c.color:"var(--foreground)"}}>
                  <div className="text-xs font-bold">{c.label}</div>
                  <div className="text-xs mt-0.5" style={{opacity:0.7,fontSize:10}}>{c.sub}</div>
                </button>
              ))}
            </div>
          </div>
          {/* Complexity */}
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider mb-2" style={{color:"var(--navy-400)"}}>
              Complexity <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>— affects engineering, deck, interior, survey · auto-inferred if not set</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COMPLEXITY_OPTIONS.map(c=>(
                <button key={c.key} onClick={()=>setVesselComplexity(prev=>prev===c.key?undefined:c.key)} className="rounded-lg px-3 py-2 text-left"
                  style={{background:vesselComplexity===c.key?`${c.color}20`:"var(--input,#1e293b)",border:`1.5px solid ${vesselComplexity===c.key?c.color:"var(--border)"}`,color:vesselComplexity===c.key?c.color:"var(--foreground)"}}>
                  <div className="text-xs font-bold">{c.label}</div>
                  <div className="text-xs mt-0.5" style={{opacity:0.7,fontSize:10}}>{c.sub}</div>
                </button>
              ))}
            </div>
            {vesselComplexity===undefined&&<p className="text-xs mt-1" style={{color:"var(--navy-400)",opacity:0.7}}>Not set — will be inferred from vessel style and age</p>}
          </div>
          {/* Known fuel burn */}
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>
              Known Fuel Burn <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>— optional · captain/survey/builder data overrides formula</span>
            </label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min={0} max={500} step={1} value={knownGph??""} placeholder="e.g. 38"
                onChange={e=>setKnownGph(e.target.value?Math.max(0,Number(e.target.value)):undefined)}
                className="rounded-lg text-sm px-3 py-2"
                style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:110}}/>
              <span className="text-xs" style={{color:"var(--navy-400)"}}>GPH at cruise · leave blank to use HP formula</span>
              {knownGph&&<button onClick={()=>setKnownGph(undefined)} style={{fontSize:11,color:"var(--navy-400)",background:"none",border:"none",cursor:"pointer"}}>✕ Clear</button>}
            </div>
          </div>
          {/* Agreed hull value */}
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>
              Agreed Hull Value <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>— for H&M insurance · leave blank to use asking price or LOA estimate</span>
            </label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,color:"var(--navy-400)"}}>$</span>
              <input type="text" inputMode="numeric" value={agreedHullValue??""} placeholder="e.g. 4500000"
                onChange={e=>{
                  const raw=e.target.value.replace(/[^0-9]/g,"");
                  setAgreedHullValue(raw?Number(raw):undefined);
                }}
                className="rounded-lg text-sm px-3 py-2"
                style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:160}}/>
              {agreedHullValue&&<span className="text-xs font-semibold" style={{color:"var(--brass-400)"}}>${(agreedHullValue/1_000_000).toFixed(2)}M</span>}
              {agreedHullValue&&<button onClick={()=>setAgreedHullValue(undefined)} style={{fontSize:11,color:"var(--navy-400)",background:"none",border:"none",cursor:"pointer"}}>✕ Clear</button>}
            </div>
            {model&&model._meta?.hullValueSource&&(
              <p className="text-xs mt-1" style={{color:"var(--navy-400)",opacity:0.7}}>
                Currently using: <strong style={{color:"var(--brass-400)"}}>${((model._meta.agreedHullValue as number)/1_000_000).toFixed(2)}M</strong> — {model._meta.hullValueSource as string}
              </p>
            )}
          </div>
          {/* Reserve planning toggle */}
          <div className="mb-2">
            <button onClick={()=>setIncludeReservePlanning(p=>!p)}
              style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0}}>
              <span style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${includeReservePlanning?"#a78bfa":"var(--border)"}`,background:includeReservePlanning?"#a78bfa":"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {includeReservePlanning&&<span style={{color:"#fff",fontSize:8,fontWeight:900,lineHeight:1}}>✓</span>}
              </span>
              <span className="text-xs" style={{color:includeReservePlanning?"#a78bfa":"var(--navy-400)"}}>
                <strong>Include Reserve Planning section</strong> — suggested annual reserves for major future work (excluded from headline budget)
              </span>
            </button>
          </div>
          {/* Charter proforma toggle */}
          <div className="mb-4">
            <button onClick={()=>setShowCharterProforma(p=>!p)}
              style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0}}>
              <span style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${showCharterProforma?"#38bdf8":"var(--border)"}`,background:showCharterProforma?"#38bdf8":"transparent",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {showCharterProforma&&<span style={{color:"#fff",fontSize:8,fontWeight:900,lineHeight:1}}>✓</span>}
              </span>
              <span className="text-xs" style={{color:showCharterProforma?"#38bdf8":"var(--navy-400)"}}>
                <strong>Include Charter Income Proforma</strong> — gross proceeds, broker commission, additional charter costs, repositioning, and net offset to operating budget
              </span>
            </button>
          </div>
          {segment==="small"&&(
            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider mb-1.5" style={{color:"var(--navy-400)"}}>Crew Arrangement</label>
              <div className="flex gap-2">
                {([{key:"owner",l:"Owner-operated",s:"No paid crew"},{key:"captain",l:"Captain only",s:"Day-rate"},{key:"captain_mate",l:"Captain + Mate",s:"Full-time"}] as const).map(c=>(
                  <button key={c.key} onClick={()=>setCrewMode(c.key)} className="flex-1 rounded-lg px-3 py-2 text-left"
                    style={{background:crewMode===c.key?"var(--brass-400)":"var(--input,#1e293b)",border:`1px solid ${crewMode===c.key?"var(--brass-400)":"var(--border)"}`,color:crewMode===c.key?"#0a1628":"var(--foreground)"}}>
                    <div className="text-xs font-bold">{c.l}</div><div className="text-xs" style={{opacity:0.75}}>{c.s}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button onClick={generate} disabled={loading||(inputMode==="url"&&!url.trim())||(inputMode==="pdf"&&!pdfVessel)} className="px-6 py-2.5 rounded-lg text-sm font-bold"
            style={{background:loading||(inputMode==="url"&&!url.trim())||(inputMode==="pdf"&&!pdfVessel)?"var(--border)":"var(--brass-400)",color:loading||(inputMode==="url"&&!url.trim())||(inputMode==="pdf"&&!pdfVessel)?"var(--navy-400)":"#fff",cursor:loading||(inputMode==="url"&&!url.trim())||(inputMode==="pdf"&&!pdfVessel)?"not-allowed":"pointer"}}>
            {loading?"Analyzing…":"Generate Model"}
          </button>
          {loading&&<div className="mt-3 flex items-center gap-2"><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:"var(--brass-400)",borderTopColor:"transparent"}}/><span className="text-xs" style={{color:"var(--navy-400)"}}>{inputMode==="pdf"?"Building cost model from PDF specs (~20s)…":"Scraping vessel data… building cost model (~30s)…"}</span></div>}
          {error&&<p className="mt-2 text-xs" style={{color:"#f87171"}}>Error: {error}</p>}
        </div>

        {/* ── Model output ── */}
        {model&&(()=>{
          const gt=grandTotals(model);
          const gtAdj:Scenario={low:gt.low+crewDelta.low,mid:gt.mid+crewDelta.mid,high:gt.high+crewDelta.high};
          const netCost:Scenario={low:gtAdj.low-charterRevenue.low,mid:gtAdj.mid-charterRevenue.mid,high:gtAdj.high-charterRevenue.high};

          const effSal=model.crew.salaries.breakdown?.length
            ?sectionTotal(model.crew.salaries.breakdown.map(r=>getEff(`crew.salaries.${r.role}`,r)))
            :getEff("crew.salaries",model.crew.salaries);
          const crewTotal=sectionTotal([effSal,getEff("crew.recruitment",model.crew.recruitment),getEff("crew.travel",model.crew.travel),getEff("crew.accommodation",model.crew.accommodation),getEff("crew.uniforms",model.crew.uniforms),getEff("crew.training",model.crew.training),getEff("crew.foodBeverage",model.crew.foodBeverage),getEff("crew.medical",model.crew.medical),getEff("crew.dayWorkers",model.crew.dayWorkers),getEff("crew.entertainment",model.crew.entertainment)]);
          const commTotal=sectionTotal([getEff("communications.phone",model.communications.phone),getEff("communications.satTV",model.communications.satTV),getEff("communications.satcom",model.communications.satcom)]);
          const opTotal=sectionTotal([getEff("operations.agency",model.operations.agency),getEff("operations.audioVisual",model.operations.audioVisual),getEff("operations.auto",model.operations.auto),getEff("operations.bridge",model.operations.bridge),getEff("operations.computer",model.operations.computer),getEff("operations.deck",model.operations.deck),getEff("operations.dockExpress",model.operations.dockExpress),getEff("operations.engineering",model.operations.engineering),getEff("operations.corrective",model.operations.corrective??{low:0,mid:0,high:0}),getEff("operations.fuels",model.operations.fuels),getEff("operations.galley",model.operations.galley),getEff("operations.interior",model.operations.interior),getEff("operations.launches",model.operations.launches),getEff("operations.mailFreight",model.operations.mailFreight),getEff("operations.office",model.operations.office),...(model.operations.dockageHomeBerth?[getEff("operations.dockageHomeBerth",model.operations.dockageHomeBerth),getEff("operations.dockageTransient",model.operations.dockageTransient??{low:0,mid:0,high:0}),getEff("operations.dockagePortDues",model.operations.dockagePortDues??{low:0,mid:0,high:0})]:[getEff("operations.dockage",model.operations.dockage)]),getEff("operations.safetyMedical",model.operations.safetyMedical),getEff("operations.security",model.operations.security),getEff("operations.survey",model.operations.survey),getEff("operations.warehousing",model.operations.warehousing)]);
          const insTotal=sectionTotal([getEff("insurance.hull",model.insurance.hull),getEff("insurance.pi",model.insurance.pi),getEff("insurance.crewHealth",model.insurance.crewHealth)]);
          const admTotal=sectionTotal([getEff("administrative.professionalFees",model.administrative.professionalFees),getEff("administrative.bankCharges",model.administrative.bankCharges),getEff("administrative.managementFee",model.administrative.managementFee),getEff("administrative.managementTravel",model.administrative.managementTravel)]);
          const haulEff=getEff("capital.haulAntifoul",model.capital.haulAntifoul??{low:0,mid:0,high:0});
          const vc=[showScenarios.low,showScenarios.mid,showScenarios.high].filter(Boolean).length||1;

          return (
            <div>
              {/* Title bar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold" style={{color:"var(--foreground)"}}>{model.vesselName}</h2>
                  <p className="text-xs mt-0.5" style={{color:"var(--navy-400)"}}>Estimated Annual Operating Budget</p>
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

              {/* Scenario toggles + descriptions */}
              <div className="mb-3">
                <div className="flex items-center gap-1 mb-2">
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
                <ScenarioDescriptions show={showScenarios}/>
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

              {/* Disclaimer */}
              <p className="text-xs mb-4 px-1" style={{color:"var(--navy-400)",lineHeight:1.55}}>
                <span style={{fontWeight:700,color:"#64748b"}}>Estimated Annual Operating Budget only.</span>{" "}
                Excludes acquisition costs, sales/use tax, import duty, financing costs, depreciation, resale loss, and major capital/refit events. See capital events note below.
              </p>

              {/* Adjust Assumptions */}
              <div className="rounded-xl p-4 mb-4" style={{background:"var(--card)",border:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{color:"var(--brass-400)"}}>Adjust Assumptions</span>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {hiddenCount>0&&<button onClick={restoreAll} className="text-xs px-3 py-1 rounded-lg" style={{background:"none",border:"1px solid rgba(148,163,184,.3)",color:"var(--navy-400)",cursor:"pointer"}}>{hiddenCount} hidden · Restore all</button>}
                    {overrideCount>0&&<span className="text-xs" style={{color:"#fb923c"}}>{overrideCount} override{overrideCount!==1?"s":""}</span>}
                    {overrideCount>0&&<button onClick={resetAllOverrides} className="text-xs px-3 py-1 rounded-lg" style={{background:"none",border:"1px solid #fb923c40",color:"#fb923c",cursor:"pointer"}}>Reset edits</button>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label className="text-xs" style={{color:"var(--navy-400)"}}>Annual Engine Hours</label>
                      <span className="text-xs font-bold" style={{color:"var(--foreground)"}}>{adjustHours} hrs</span>
                    </div>
                    <input type="range" min={100} max={2000} step={50} value={adjustHours} onChange={e=>setAdjustHours(Number(e.target.value))} style={{width:"100%",accentColor:"var(--brass-400)"}}/>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"var(--navy-400)"}}>100</span><span style={{fontSize:10,color:"var(--navy-400)"}}>scales fuel · base: {baseHours}</span><span style={{fontSize:10,color:"var(--navy-400)"}}>2,000</span></div>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <label className="text-xs" style={{color:"var(--navy-400)"}}>Charter Weeks / Year</label>
                      <span className="text-xs font-bold" style={{color:"var(--foreground)"}}>{adjustCharterWeeks} wks</span>
                    </div>
                    <input type="range" min={0} max={20} step={1} value={adjustCharterWeeks} onChange={e=>setAdjustCharterWeeks(Number(e.target.value))} style={{width:"100%",accentColor:"#34d399"}}/>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"var(--navy-400)"}}>0</span><span style={{fontSize:10,color:"var(--navy-400)"}}>≈{fmt(vesselLoaFt*858)}/wk net mid</span><span style={{fontSize:10,color:"var(--navy-400)"}}>20</span></div>
                  </div>
                </div>

                {/* Per-scenario crew sliders */}
                {segment!=="small"&&perCrewRates&&(
                  <div className="mt-4 pt-4" style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div>
                        <span className="text-xs font-bold uppercase tracking-widest" style={{color:"var(--brass-400)"}}>Crew by Scenario</span>
                        <p className="text-xs mt-0.5" style={{color:"var(--navy-400)"}}>Set a different crew count for each cost scenario independently</p>
                      </div>
                      {adjustCrewCounts.some((n,i)=>n!==baseCrewCount)&&(
                        <button onClick={()=>setAdjustCrewCounts([baseCrewCount,baseCrewCount,baseCrewCount])}
                          style={{fontSize:10,color:"var(--navy-400)",background:"none",border:"1px solid rgba(148,163,184,.3)",borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
                          Reset all
                        </button>
                      )}
                    </div>
                    {/* Three sliders — one per scenario */}
                    {([["low","LOW","#4ade80"],["mid","MID","#facc15"],["high","HIGH","#f87171"]] as [string,string,string][]).map(([sc,label,color],i)=>{
                      const count = adjustCrewCounts[i];
                      const diff = count - baseCrewCount;
                      return(
                        <div key={sc} className="mb-3">
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <label style={{fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label} SCENARIO</label>
                            <span style={{fontSize:11,fontWeight:700,color:count===0?"#f87171":"var(--foreground)"}}>
                              {count===0?"Owner-operated":`${count} crew`}
                              {diff!==0&&<span style={{color,marginLeft:5,fontSize:10}}>({diff>0?"+":""}{diff} vs base)</span>}
                            </span>
                          </div>
                          <input type="range" min={0} max={14} step={1} value={count}
                            onChange={e=>{const v=Number(e.target.value);setAdjustCrewCounts(prev=>{const n=[...prev] as [number,number,number];n[i]=v;return n;});}}
                            style={{width:"100%",accentColor:color,marginBottom:2}}/>
                          <div style={{display:"flex",justifyContent:"space-between"}}>
                            <span style={{fontSize:9,color:"#f87171"}}>0</span>
                            <span style={{fontSize:9,color:"var(--navy-400)"}}>base: {baseCrewCount}</span>
                            <span style={{fontSize:9,color:"var(--navy-400)"}}>14</span>
                          </div>
                        </div>
                      );
                    })}
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
                    <p className="text-xs mt-2" style={{color:"var(--navy-400)"}}>Drag to 0 for owner-operated / no-crew scenario. Uncheck individual salary rows in the table for finer control.</p>
                    {/* Removed crew members — show individually so user can restore them */}
                    {(()=>{
                      const removed=(model.crew.salaries.breakdown??[]).filter(r=>excludedPaths.has(`crew.salaries.${r.role}`));
                      if(removed.length===0) return null;
                      return (
                        <div className="mt-3 pt-3" style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
                          <p className="text-xs mb-2" style={{color:"var(--navy-400)"}}>Removed — click to add back:</p>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {removed.map(r=>(
                              <button key={r.role} onClick={()=>toggleExclude(`crew.salaries.${r.role}`)}
                                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,border:"1px solid rgba(248,113,113,.35)",background:"rgba(248,113,113,.08)",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:600}}>
                                + {r.role.trim()} <span style={{fontSize:10,opacity:0.65,fontWeight:400}}>{fmt(r.mid)}/yr</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
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
                    <p className="text-xs mb-3" style={{color:"var(--navy-400)"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5,marginRight:12}}>
                        <span style={{width:12,height:12,borderRadius:3,border:"1.5px solid var(--brass-400)",background:"var(--brass-400)",display:"inline-flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#000",fontSize:7,fontWeight:900}}>✓</span></span>
                        Uncheck any row to hide it and remove it from the total
                      </span>
                      · Click a value to edit · ↺ resets to model value ·{" "}
                      <span style={{color:"#fb923c",fontWeight:600}}>edited</span>{" "}badge = value has been manually changed
                    </p>
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
                        {/* CREW */}
                        <SectionHeader show={showScenarios} label="CREW"/>
                        {model.crew.salaries.breakdown?.map(r=>(
                          <Row key={r.role} {...rp(`crew.salaries.${r.role}`,`  ${r.role}`,r)}/>
                        ))}
                        {([["crew.recruitment","Recruitment Fees",model.crew.recruitment],["crew.travel","Travel",model.crew.travel],["crew.accommodation","Accommodation",model.crew.accommodation],["crew.uniforms","Uniforms",model.crew.uniforms],["crew.training","Training & Certification",model.crew.training],["crew.foodBeverage","Food & Beverages (Crew)",model.crew.foodBeverage],["crew.medical","Medical Expenses",model.crew.medical],["crew.dayWorkers","Day Workers & Delivery",model.crew.dayWorkers],["crew.entertainment","Entertainment",model.crew.entertainment]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        <Row path="__crew" label="TOTAL CREW" effective={crewTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* COMMS */}
                        <SectionHeader show={showScenarios} label="COMMUNICATIONS"/>
                        {([["communications.phone","Phone & Cellular",model.communications.phone],["communications.satTV","Satellite TV",model.communications.satTV],["communications.satcom","Satcom / Data (Starlink etc.)",model.communications.satcom]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        <Row path="__comm" label="TOTAL COMMUNICATIONS" effective={commTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* OPS */}
                        <SectionHeader show={showScenarios} label="OPERATIONS"/>
                        {([["operations.agency","Agency",model.operations.agency],["operations.audioVisual","Audio Visual",model.operations.audioVisual],["operations.auto","Auto",model.operations.auto],["operations.bridge","Bridge",model.operations.bridge],["operations.computer","Computer",model.operations.computer],["operations.deck","Deck",model.operations.deck],["operations.dockExpress","Dock Express / Shipping",model.operations.dockExpress],["operations.engineering","Engineering (Routine Maintenance)",model.operations.engineering],["operations.corrective","Corrective Repair Allowance",model.operations.corrective??{low:0,mid:0,high:0}]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        {/* Fuels with confidence indicator */}
                        <Row {...rp("operations.fuels","Fuels & Lubricants",model.operations.fuels)}/>
                        {model.operations.fuelBasis&&(
                          <tr><td colSpan={colCount(showScenarios)} style={{paddingBottom:4,paddingLeft:22,fontSize:10,color:model.operations.fuelConfidence==="high"?"#4ade80":model.operations.fuelConfidence==="medium"?"#facc15":"#f87171"}}>
                            {model.operations.fuelConfidence==="high"?"🟢":model.operations.fuelConfidence==="medium"?"🟡":"🔴"}{" "}
                            <span style={{opacity:0.75}}>{model.operations.fuelBasis}</span>
                          </td></tr>
                        )}
                        {([["operations.galley","Galley (Guest Provisions)",model.operations.galley],["operations.interior","Interior",model.operations.interior],["operations.launches","Launches & Tenders",model.operations.launches],["operations.mailFreight","Mail & Freight",model.operations.mailFreight],["operations.office","Office",model.operations.office]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        {/* Dockage — 3 sub-rows when available */}
                        {model.operations.dockageHomeBerth ? (
                          <>
                            <Row {...rp("operations.dockageHomeBerth","  Home Berth (Annual Berth Fee)",model.operations.dockageHomeBerth)}/>
                            <Row {...rp("operations.dockageTransient","  Transient Marina & Port Calls",model.operations.dockageTransient??{low:0,mid:0,high:0})}/>
                            <Row {...rp("operations.dockagePortDues","  Port Dues, Utilities & Storm Storage",model.operations.dockagePortDues??{low:0,mid:0,high:0})}/>
                          </>
                        ) : (
                          <Row {...rp("operations.dockage","Ports, Dockage & Customs",model.operations.dockage)}/>
                        )}
                        {([["operations.safetyMedical","Safety & Medical",model.operations.safetyMedical],["operations.security","Security",model.operations.security],["operations.survey","Survey & Certification",model.operations.survey],["operations.warehousing","Warehousing & Storage",model.operations.warehousing]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        <Row path="__op" label="TOTAL OPERATIONS" effective={opTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* INSURANCE */}
                        <SectionHeader show={showScenarios} label="INSURANCE"/>
                        {([["insurance.hull","Hull & Machinery (H&M)",model.insurance.hull],["insurance.pi","Protection & Indemnity (P&I)",model.insurance.pi],["insurance.crewHealth","Crew Health Insurance",model.insurance.crewHealth]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        <Row path="__ins" label="TOTAL INSURANCE" effective={insTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* ADMIN */}
                        <SectionHeader show={showScenarios} label="ADMINISTRATIVE"/>
                        {([["administrative.professionalFees","Professional Fees",model.administrative.professionalFees],["administrative.bankCharges","Bank Charges",model.administrative.bankCharges],["administrative.managementFee","Management Fee",model.administrative.managementFee],["administrative.managementTravel","Management Travel",model.administrative.managementTravel]] as [string,string,Scenario][]).map(([p,l,s])=>(<Row key={p} {...rp(p,l,s)}/>))}
                        <Row path="__adm" label="TOTAL ADMINISTRATIVE" effective={admTotal} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* HAUL */}
                        <SectionHeader show={showScenarios} label="ANNUAL HAUL-OUT & ANTIFOUL"/>
                        <Row {...rp("capital.haulAntifoul","Haul-out, Bottom Paint & Antifoul",model.capital.haulAntifoul??{low:0,mid:0,high:0})}/>
                        <Row path="__haul" label="TOTAL HAUL-OUT" effective={haulEff} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>

                        {/* GRAND TOTAL */}
                        <tr><td colSpan={colCount(showScenarios)} className="pt-4"/></tr>
                        <Row path="__gt" label="ESTIMATED ANNUAL OPERATING BUDGET" effective={gtAdj} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                        {adjustCharterWeeks>0&&<>
                          <Row {...rp("__charter",`Charter Revenue (${adjustCharterWeeks} wks est. net)`,{low:-charterRevenue.low,mid:-charterRevenue.mid,high:-charterRevenue.high})}/>
                          <Row path="__net" label="NET ANNUAL COST" effective={netCost} bold show={showScenarios} overrides={overrides} onOverride={handleOverride} onResetRow={resetRow}/>
                        </>}
                        {(adjustCrewCounts.some(n=>n!==baseCrewCount)||extraPositions.some(p=>p.checked))&&(
                          <tr><td colSpan={colCount(showScenarios)} style={{paddingTop:8,fontSize:11,color:"#a78bfa"}}>
                            ★ Crew per scenario: Low {adjustCrewCounts[0]} · Mid {adjustCrewCounts[1]} · High {adjustCrewCounts[2]}{extraPositions.filter(p=>p.checked).map(p=>` + ${p.label}`).join("")}{crewDelta.mid!==0&&` · Mid delta: ${crewDelta.mid>=0?"+":""}${fmt(crewDelta.mid)}/yr`}
                          </td></tr>
                        )}
                        {hiddenCount>0&&(
                          <tr><td colSpan={colCount(showScenarios)} style={{paddingTop:8,fontSize:11,color:"var(--navy-400)"}}>
                            {hiddenCount} line item{hiddenCount!==1?"s":""} hidden and excluded from totals ·{" "}
                            <button onClick={restoreAll} style={{color:"var(--brass-400)",background:"none",border:"none",cursor:"pointer",fontSize:11,textDecoration:"underline",padding:0}}>Restore all</button>
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Capital events disclaimer */}
                  {model.capitalEvents?.disclaimer&&(
                    <div className="rounded-xl mt-4 p-4" style={{background:"rgba(251,146,60,.06)",border:"1px solid rgba(251,146,60,.20)"}}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{color:"#fb923c"}}>Capital Events — Excluded from Annual Figure</p>
                      <p className="text-sm leading-relaxed" style={{color:"var(--foreground)",opacity:0.82}}>{model.capitalEvents.disclaimer}</p>
                    </div>
                  )}

                  {/* Reserve planning section — optional, NOT in headline total */}
                  {model.reservePlan&&(
                    <div className="rounded-xl mt-4 p-5" style={{background:"rgba(167,139,250,.05)",border:"1px solid rgba(167,139,250,.25)"}}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest" style={{color:"#a78bfa"}}>Reserve Planning — Suggested Annual Reserves</p>
                          <p className="text-xs mt-1" style={{color:"var(--navy-400)"}}>Major future work annualised · <strong>NOT included in the operating budget above</strong> · edit any line directly</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs" style={{color:"#a78bfa"}}>Reserve Plan Total (mid)</p>
                          <p className="text-lg font-bold" style={{color:"#a78bfa"}}>{fmt(model.reservePlan.total.mid)}/yr</p>
                        </div>
                      </div>
                      <table style={{width:"100%",borderCollapse:"collapse"}}>
                        <tbody>
                          {([
                            ["reserve.paint","Paint & Fairing (annualised cycle)",model.reservePlan.paint,"Full paint job ÷ cycle years"],
                            ["reserve.teak","Teak Deck Maintenance",model.reservePlan.teak,"Sanding, resealing, panel replacement"],
                            ["reserve.engines","Engine Overhaul Reserve",model.reservePlan.engines,"HP-based overhaul cost ÷ interval hours × annual hrs"],
                            ["reserve.generators","Generators & Major Systems",model.reservePlan.generators,"Generator overhaul, major system refits"],
                            ["reserve.stabilizers","Stabilizer Rebuild",model.reservePlan.stabilizers,"Fin rebuild, actuator service — age-dependent"],
                            ["reserve.electronics","Electronics & Navigation",model.reservePlan.electronics,"Full nav/bridge refresh every 8 years annualised"],
                            ["reserve.avIT","AV / IT Infrastructure",model.reservePlan.avIT,"Entertainment systems refresh every 5 years"],
                            ["reserve.softGoods","Soft Goods & Interior",model.reservePlan.softGoods,"Upholstery, linen, cabin soft goods refresh"],
                            ["reserve.tenders","Tenders & Water Toys",model.reservePlan.tenders,"Tender replacement every 7 years annualised"],
                            ["reserve.classSurvey","Class / Special Survey",model.reservePlan.classSurvey,"Periodic special survey costs annualised"],
                            ["reserve.other","Other / Contingency",model.reservePlan.other,"Unplanned reserve contingency"],
                          ] as [string,string,Scenario,string][]).map(([p,l,s,desc])=>(
                            <tr key={p} style={{borderBottom:"1px solid rgba(167,139,250,.08)"}}>
                              <td style={{padding:"6px 0",fontSize:12,color:"var(--foreground)"}}>
                                <div>{l}</div>
                                <div style={{fontSize:10,color:"var(--navy-400)",marginTop:1}}>{desc}</div>
                              </td>
                              {showScenarios.low&&<td style={{padding:"6px 8px",textAlign:"right",fontSize:12,color:"#4ade80"}}>{fmt(s.low)}</td>}
                              {showScenarios.mid&&<td style={{padding:"6px 8px",textAlign:"right",fontSize:12,color:"var(--foreground)"}}>{fmt(s.mid)}</td>}
                              {showScenarios.high&&<td style={{padding:"6px 8px",textAlign:"right",fontSize:12,color:"#f87171"}}>{fmt(s.high)}</td>}
                            </tr>
                          ))}
                          <tr style={{borderTop:"1px solid rgba(167,139,250,.3)"}}>
                            <td style={{padding:"8px 0",fontSize:13,fontWeight:700,color:"#a78bfa"}}>RESERVE PLAN TOTAL</td>
                            {showScenarios.low&&<td style={{padding:"8px 8px",textAlign:"right",fontSize:13,fontWeight:700,color:"#4ade80"}}>{fmt(model.reservePlan.total.low)}</td>}
                            {showScenarios.mid&&<td style={{padding:"8px 8px",textAlign:"right",fontSize:13,fontWeight:700,color:"#a78bfa"}}>{fmt(model.reservePlan.total.mid)}</td>}
                            {showScenarios.high&&<td style={{padding:"8px 8px",textAlign:"right",fontSize:13,fontWeight:700,color:"#f87171"}}>{fmt(model.reservePlan.total.high)}</td>}
                          </tr>
                          <tr>
                            <td colSpan={colCount(showScenarios)} style={{paddingTop:6,fontSize:11,color:"#a78bfa",opacity:0.75}}>
                              Combined Operating + Reserve: {fmt(gtAdj.mid + model.reservePlan.total.mid)}/yr mid — this is closer to true ownership cost
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <CategoryExamples/>

                  {/* ── Charter Income Proforma ────────────────────────────── */}
                  {showCharterProforma&&(()=>{
                    const lft = model._meta?.loa_ft ?? vesselLoaFt;
                    // Weekly rate estimate by LOA ($/ft/week)
                    const ratePerFt = lft<80?280:lft<100?335:lft<120?390:lft<140?445:lft<160?505:lft<185?575:650;
                    const medMult = homePort.toLowerCase().includes("mediterr")?1.22:1.0;
                    const estimatedRate = Math.round(lft*ratePerFt*medMult/5000)*5000;
                    const rate = charterWeeklyRate ?? estimatedRate;

                    // Repositioning cost (scales with vessel size)
                    const repoBase:{[k:string]:number} = {none:0,regional:9000,seasonal:28000,transatlantic:88000};
                    const repoCost = Math.round((repoBase[charterRepositioning]*(lft/100))/5000)*5000;

                    // Fixed annual charter costs
                    const insuranceLoading = Math.round((4000+lft*20)/500)*500;
                    const compliance = lft>100?5000:3000;
                    const marketing = Math.round((2500+lft*12)/500)*500;
                    const totalFixed = insuranceLoading+compliance+marketing+repoCost;

                    // Per-week variable costs
                    const weeklyFuelOverage = Math.round((gtAdj.mid/52)*0.20/500)*500;
                    const weeklyWear = Math.round(lft*30/500)*500;

                    const SCEN_LABELS = ["Conservative","Moderate","Active"];
                    const SCEN_COLORS = ["#4ade80","#facc15","#f87171"];

                    const scenarios = charterWeekScenarios.map((weeks,i)=>{
                      const gross = rate*weeks;
                      const commission = Math.round(gross*(charterCommissionPct/100));
                      const netRevenue = gross-commission;
                      const variableCosts = (weeklyFuelOverage+weeklyWear)*weeks;
                      const totalAdditional = variableCosts+totalFixed;
                      const netContribution = netRevenue-totalAdditional;
                      const netOwnerCost = gtAdj.mid-netContribution;
                      const breakEvenWeeks = totalAdditional>0&&rate*(1-charterCommissionPct/100)>0
                        ? Math.ceil((gtAdj.mid+totalFixed)/Math.max(1,(rate*(1-charterCommissionPct/100))-weeklyFuelOverage-weeklyWear))
                        : 0;
                      return{weeks,gross,commission,netRevenue,variableCosts,weeklyFuelOverage,weeklyWear,totalFixed,totalAdditional,netContribution,netOwnerCost,breakEvenWeeks,label:SCEN_LABELS[i],color:SCEN_COLORS[i]};
                    });

                    const r5c=(n:number)=>(n<0?"−$":"$")+Math.round(Math.abs(n)).toLocaleString("en-US");
                    const isEditing_rate = React.useRef(false); void isEditing_rate;

                    return(
                      <div className="rounded-xl mt-4 p-5" style={{background:"rgba(56,189,248,.04)",border:"1px solid rgba(56,189,248,.25)"}}>
                        {/* Section header */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest" style={{color:"#38bdf8"}}>Charter Income Proforma</p>
                            <p className="text-xs mt-1" style={{color:"var(--navy-400)"}}>Gross proceeds, broker commission, additional charter costs, repositioning — net offset to annual operating budget</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{color:"#38bdf8"}}>Est. Weekly Gross Rate</p>
                            <p className="text-lg font-bold" style={{color:"#38bdf8"}}>${(rate).toLocaleString("en-US")}/wk</p>
                            <p className="text-xs" style={{color:"var(--navy-400)"}}>{charterWeeklyRate?"custom rate":"estimated from LOA"}</p>
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="grid grid-cols-2 gap-4 mb-5 p-3 rounded-lg" style={{background:"rgba(0,0,0,.2)"}}>
                          <div>
                            <label className="block text-xs uppercase tracking-wider mb-1" style={{color:"var(--navy-400)"}}>Weekly Charter Rate (Gross)</label>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:13,color:"var(--navy-400)"}}>$</span>
                              <input type="number" min={5000} max={1000000} step={5000}
                                value={charterWeeklyRate??estimatedRate}
                                onChange={e=>setCharterWeeklyRate(Number(e.target.value)||null)}
                                className="rounded-lg text-sm px-2 py-1.5" style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:130}}/>
                              {charterWeeklyRate&&<button onClick={()=>setCharterWeeklyRate(null)} style={{fontSize:10,color:"var(--navy-400)",background:"none",border:"none",cursor:"pointer"}}>↺ Reset</button>}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider mb-1" style={{color:"var(--navy-400)"}}>Broker Commission</label>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <input type="number" min={5} max={30} step={1} value={charterCommissionPct}
                                onChange={e=>setCharterCommissionPct(Math.max(5,Math.min(30,Number(e.target.value)||15)))}
                                className="rounded-lg text-sm px-2 py-1.5" style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",width:60}}/>
                              <span style={{fontSize:13,color:"var(--navy-400)"}}>% (MYBA standard: 15%)</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider mb-1" style={{color:"var(--navy-400)"}}>Charter Weeks / Year</label>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              {charterWeekScenarios.map((w,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
                                  <span style={{fontSize:10,color:SCEN_COLORS[i]}}>{SCEN_LABELS[i].slice(0,4)}:</span>
                                  <input type="number" min={1} max={30} step={1} value={w}
                                    onChange={e=>{const v=Math.max(1,Math.min(30,Number(e.target.value)||w));setCharterWeekScenarios(prev=>{const n=[...prev] as [number,number,number];n[i]=v;return n;});}}
                                    style={{width:40,background:"var(--input,#1e293b)",border:`1px solid ${SCEN_COLORS[i]}40`,borderRadius:6,color:"var(--foreground)",fontSize:12,padding:"2px 4px",textAlign:"center"}}/>
                                </div>
                              ))}
                              <span style={{fontSize:10,color:"var(--navy-400)"}}>wks</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider mb-1" style={{color:"var(--navy-400)"}}>Repositioning</label>
                            <select value={charterRepositioning} onChange={e=>setCharterRepositioning(e.target.value as typeof charterRepositioning)}
                              className="rounded-lg text-xs px-2 py-1.5 w-full" style={{background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)"}}>
                              <option value="none">None — stays in home port</option>
                              <option value="regional">Regional only — Bahamas / nearby</option>
                              <option value="seasonal">Seasonal migration — FL ↔ NE or similar</option>
                              <option value="transatlantic">Transatlantic — Med season + Caribbean</option>
                            </select>
                          </div>
                        </div>

                        {/* Proforma table */}
                        <table style={{width:"100%",borderCollapse:"collapse"}}>
                          <thead>
                            <tr style={{borderBottom:"1px solid rgba(56,189,248,.3)"}}>
                              <th style={{textAlign:"left",padding:"4px 0",fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--navy-400)"}}>Line Item</th>
                              {scenarios.map(s=><th key={s.label} style={{textAlign:"right",padding:"4px 10px",fontSize:10,textTransform:"uppercase",letterSpacing:"0.06em",color:s.color}}>{s.label}<br/><span style={{fontSize:9,fontWeight:400,opacity:0.7}}>({s.weeks} wks/yr)</span></th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {/* Revenue block */}
                            <tr><td colSpan={4} style={{padding:"10px 0 3px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#38bdf8"}}>Revenue</td></tr>
                            {([
                              ["Gross Charter Revenue",(s: typeof scenarios[number])=>s.gross,false],
                              [`Less: Broker Commission (${charterCommissionPct}%)`,(s: typeof scenarios[number])=>-s.commission,false],
                            ] as [string, (s: typeof scenarios[number]) => number, boolean][]).map(([label,fn,bold])=>(
                              <tr key={label as string} style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                                <td style={{padding:"5px 0",fontSize:12,color:bold?"#38bdf8":"var(--foreground)",fontWeight:bold?700:400}}>{label as string}</td>
                                {scenarios.map(s=><td key={s.label} style={{padding:"5px 10px",textAlign:"right",fontSize:12,color:fn(s)<0?"#f87171":"var(--foreground)"}}>{r5c(fn(s))}</td>)}
                              </tr>
                            ))}
                            <tr style={{borderBottom:"1px solid rgba(56,189,248,.4)"}}>
                              <td style={{padding:"6px 0",fontSize:12,fontWeight:700,color:"#38bdf8"}}>Net Charter Revenue</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"6px 10px",textAlign:"right",fontSize:12,fontWeight:700,color:"#38bdf8"}}>{r5c(s.netRevenue)}</td>)}
                            </tr>

                            {/* Additional costs block */}
                            <tr><td colSpan={4} style={{padding:"10px 0 3px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#f87171"}}>Additional Charter Costs</td></tr>
                            {([
                              ["Fuel Overage (charter profile uses more hrs)",(s: typeof scenarios[number])=>-s.weeklyFuelOverage*s.weeks,"20% above operating baseline for charter weeks"],
                              ["Wear & Maintenance Premium",(s: typeof scenarios[number])=>-s.weeklyWear*s.weeks,`$${Math.round(weeklyWear).toLocaleString()}/wk — charter accelerates wear on all systems`],
                              ["Charter Insurance Loading",(_s: typeof scenarios[number])=>-insuranceLoading,"Additional premium for commercial charter use"],
                              ["Flag / USCG Charter Compliance",(_s: typeof scenarios[number])=>-compliance,"Annual certification for charter operations — flag, USCG COI, or MCA"],
                              ["Marketing & Listing Fees",(_s: typeof scenarios[number])=>-marketing,"Central agency listing, boat shows, photography/video refresh"],
                              ...(repoCost>0?[["Repositioning Costs",(_s: typeof scenarios[number])=>-repoCost,"Fuel, crew time, and transient marina for positioning voyages"] as [string, (s: typeof scenarios[number]) => number, string]]:[]),
                            ] as [string, (s: typeof scenarios[number]) => number, string][]).map(([label,fn,desc])=>(
                              <tr key={label as string} style={{borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                                <td style={{padding:"5px 0",fontSize:12,color:"var(--foreground)"}}>
                                  <div>{label as string}</div>
                                  <div style={{fontSize:10,color:"var(--navy-400)",marginTop:1}}>{desc as string}</div>
                                </td>
                                {scenarios.map(s=><td key={s.label} style={{padding:"5px 10px",textAlign:"right",fontSize:12,color:"#f87171"}}>{r5c(fn(s))}</td>)}
                              </tr>
                            ))}
                            <tr style={{borderBottom:"1px solid rgba(248,113,113,.4)"}}>
                              <td style={{padding:"6px 0",fontSize:12,fontWeight:700,color:"#f87171"}}>Total Additional Costs</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"6px 10px",textAlign:"right",fontSize:12,fontWeight:700,color:"#f87171"}}>{r5c(-s.totalAdditional)}</td>)}
                            </tr>

                            {/* Net contribution */}
                            <tr style={{borderBottom:"1px solid rgba(52,211,153,.4)"}}>
                              <td style={{padding:"8px 0",fontSize:13,fontWeight:700,color:"#34d399"}}>Net Charter Contribution to Owner</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"8px 10px",textAlign:"right",fontSize:13,fontWeight:700,color:s.netContribution>0?"#34d399":"#f87171"}}>{r5c(s.netContribution)}</td>)}
                            </tr>

                            {/* Net owner cost */}
                            <tr><td colSpan={4} style={{padding:"12px 0 3px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"var(--brass-400)"}}>Net Annual Cost After Charter</td></tr>
                            <tr style={{borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                              <td style={{padding:"5px 0",fontSize:12,color:"var(--foreground)"}}>Annual Operating Budget (mid)</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"5px 10px",textAlign:"right",fontSize:12,color:"#facc15"}}>{r5c(gtAdj.mid)}</td>)}
                            </tr>
                            <tr style={{borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                              <td style={{padding:"5px 0",fontSize:12,color:"var(--foreground)"}}>Less: Charter Contribution</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"5px 10px",textAlign:"right",fontSize:12,color:"#34d399"}}>{r5c(-Math.max(0,s.netContribution))}</td>)}
                            </tr>
                            <tr style={{borderTop:"2px solid rgba(184,147,58,.4)"}}>
                              <td style={{padding:"8px 0",fontSize:13,fontWeight:700,color:"var(--brass-400)"}}>NET ANNUAL COST TO OWNER</td>
                              {scenarios.map(s=><td key={s.label} style={{padding:"8px 10px",textAlign:"right",fontSize:13,fontWeight:700,color:s.netOwnerCost<gtAdj.mid*0.5?"#4ade80":s.netOwnerCost<0?"#4ade80":"#facc15"}}>{r5c(s.netOwnerCost)}</td>)}
                            </tr>

                            {/* Breakeven */}
                            <tr>
                              <td colSpan={4} style={{paddingTop:10,fontSize:11,color:"var(--navy-400)",lineHeight:1.6}}>
                                Break-even: approximately <strong style={{color:"#38bdf8"}}>{scenarios[1].breakEvenWeeks} charter weeks</strong> at {r5c(rate)}/wk covers the full annual operating budget (mid scenario) after additional charter costs.
                                {repoCost>0&&<span> Repositioning cost of {r5c(repoCost)} is treated as fixed regardless of charter volume.</span>}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        <div className="mt-4 p-3 rounded-lg" style={{background:"rgba(0,0,0,.2)",fontSize:11,color:"var(--navy-400)",lineHeight:1.6}}>
                          <strong style={{color:"#38bdf8"}}>Note on APA (Advanced Provisioning Allowance):</strong> Charter guests pay an APA — typically 30–35% of the base charter rate — on top of the charter fee. This is a client float used for fuel, provisions, port fees, and gratuities during the charter. It is not additional owner revenue; APA income and APA expenses should roughly net to zero. Any surplus is returned to the client. APA is therefore excluded from this proforma as a revenue-neutral item. The additional fuel and provisioning costs above reflect the owner's exposure on any APA shortfall.
                        </div>
                      </div>
                    );
                  })()}
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
