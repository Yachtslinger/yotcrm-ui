"use client";
import React from "react";
import { Upload, BarChart2, Trash2, ExternalLink, Plus, Link, X } from "lucide-react";
import PageShell from "../components/PageShell";

const BROKERS = [
  {
    id: "will",
    name: "Will Noftsinger III",
    title: "Yacht Broker",
    email: "WN@DenisonYachting.com",
    phone: "+1 (850) 461-3342",
    location: "Fort Lauderdale, FL",
    bio: "Will Noftsinger, a senior yacht broker at Denison Yachting in Fort Lauderdale with 15+ years of experience in superyacht transactions.",
  },
  {
    id: "erik",
    name: "Erik Mayol",
    title: "Yacht Broker",
    email: "em@DenisonYachting.com",
    phone: "C: (949) 338-7907 | O: 949.791.4220",
    location: "Newport Beach, CA",
    bio: "Erik Mayol, a yacht broker at Denison Yachting specializing in motor yachts and sailing vessels.",
  },
] as const;

type BrokerId = typeof BROKERS[number]["id"];

type CompRecord = {
  name: string; make: string; model: string; year: string; length: string;
  listedPrice: number | null; soldPrice: number | null; askPrice: number | null;
  listedDate: string; soldDate: string; daysOnMarket: number | null;
  location: string; source: string;
};

type CompUrl = {
  url: string; type: "sold" | "active"; soldPrice: string; daysOnMarket: string;
  status: "idle" | "scraping" | "done" | "error";
  result: CompRecord | null;
  preview: { name: string; price: string; location: string; image: string } | null;
  error: string;
};

type SavedAnalysis = {
  id: number; title: string; subject_vessel: string; subject_year: string;
  subject_make: string; subject_model: string; subject_asking_price: string;
  created_at: string; updated_at: string;
};

type Step = "list" | "setup" | "comps" | "generating" | "review" | "done";

export default function MarketAnalysisPage() {
  const [step, setStep] = React.useState<Step>("list");
  const [analyses, setAnalyses] = React.useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [toast, setToast] = React.useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [selectedBroker, setSelectedBroker] = React.useState<BrokerId>("will");

  // Subject vessel
  const [subjectUrl, setSubjectUrl] = React.useState("");
  const [subjectScraping, setSubjectScraping] = React.useState(false);
  const [subjectPreview, setSubjectPreview] = React.useState<{ name: string; price: string; location: string; image: string } | null>(null);
  const [subjectPdfFile, setSubjectPdfFile] = React.useState("");
  const [subjectPdfText, setSubjectPdfText] = React.useState("");
  const [uploadingSubjectPdf, setUploadingSubjectPdf] = React.useState(false);
  const [subjectVessel, setSubjectVessel] = React.useState("");
  const [subjectYear, setSubjectYear] = React.useState("");
  const [subjectMake, setSubjectMake] = React.useState("");
  const [subjectModel, setSubjectModel] = React.useState("");
  const [subjectLength, setSubjectLength] = React.useState("");
  const [subjectAskingPrice, setSubjectAskingPrice] = React.useState("");
  const [notes, setNotes] = React.useState("");
  // Vessel attributes for valuation weighting
  const [grossTonnage, setGrossTonnage] = React.useState("");
  const [engineCount, setEngineCount] = React.useState("");
  const [engineBrand, setEngineBrand] = React.useState("");
  const [engineHp, setEngineHp] = React.useState("");
  const [lastRefitYear, setLastRefitYear] = React.useState("");
  const [refitScope, setRefitScope] = React.useState<"cosmetic"|"mechanical"|"full"|"none"|"">("");
  // Valuation weights — broker-adjustable, defaults match valuation engine defaults
  const [weights, setWeights] = React.useState({
    yearRatePerYear: 1.5,
    yearCap: 20,
    lengthCap: 25,
    brandPerTier: 5,
    brandCap: 20,
    gtCap: 3,
    engineCap: 5,
    refitFull: 8,
    refitMechanical: 5,
    refitCosmetic: 3,
    refitFadeYears: 8,
    manualOverride: 0,
  });
  const [showWeights, setShowWeights] = React.useState(false);

  // Comp PDFs
  const [soldPdfComps, setSoldPdfComps] = React.useState<CompRecord[]>([]);
  const [activePdfComps, setActivePdfComps] = React.useState<CompRecord[]>([]);
  const [uploadingSold, setUploadingSold] = React.useState(false);
  const [uploadingActive, setUploadingActive] = React.useState(false);

  // Supplemental PDF + comp URLs + manual
  const [suppDocs, setSuppDocs] = React.useState<{fileName:string;text:string;pages:number}[]>([]);
  const [uploadingSupp, setUploadingSupp] = React.useState(false);
  const [compUrls, setCompUrls] = React.useState<CompUrl[]>([
    { url: "", type: "sold", soldPrice: "", daysOnMarket: "", status: "idle", result: null, preview: null, error: "" }
  ]);
  const [manualComps, setManualComps] = React.useState<CompRecord[]>([]);
  const [showManualForm, setShowManualForm] = React.useState(false);
  const [manualForm, setManualForm] = React.useState({
    type: "sold" as "sold" | "active",
    name: "", make: "", model: "", year: "", length: "", location: "",
    askPrice: "", soldPrice: "", daysOnMarket: "", listedDate: "", soldDate: "",
  });
  const [genStatus, setGenStatus] = React.useState("");
  const [savedId, setSavedId] = React.useState<number | null>(null);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  // Draft analysis — editable before saving
  const [draft, setDraft] = React.useState<Record<string,unknown>>({});
  const [draftPricing, setDraftPricing] = React.useState({ recommendedListPrice: 0, recommendedListPriceFormatted: "", priceStrategy: "", priceStrategyExplanation: "", rationale: "" });
  const [draftDom, setDraftDom] = React.useState({ lowEstimate: "", highEstimate: "", rationale: "" });
  const [draftMktg, setDraftMktg] = React.useState({ headline: "", targetBuyerProfile: "", keyDifferentiators: [] as string[], channels: [] as string[], timeline: [] as {week:string;action:string}[] });
  const [pendingGenData, setPendingGenData] = React.useState<Record<string,unknown> | null>(null); // null = new, number = editing existing

  const soldPdfRef = React.useRef<HTMLInputElement>(null);
  const activePdfRef = React.useRef<HTMLInputElement>(null);
  const suppPdfRef = React.useRef<HTMLInputElement>(null);
  const subjectPdfRef = React.useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  }

  async function loadAnalyses() {
    setLoading(true);
    try {
      const r = await fetch("/api/market-analysis");
      if (!r.ok) { setLoading(false); return; }
      const d = await r.json();
      if (d.ok) setAnalyses(d.analyses);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  React.useEffect(() => { loadAnalyses(); }, []);
  function loadIntoDraft(a: Record<string,unknown>) {
    const pricing = (a.pricingAnalysis as Record<string,unknown>) || {};
    const dom = (a.daysOnMarketForecast as Record<string,unknown>) || {};
    const mktg = (a.marketingStrategy as Record<string,unknown>) || {};
    setDraft(a);
    setDraftPricing({
      recommendedListPrice: (pricing.recommendedListPrice as number) || 0,
      recommendedListPriceFormatted: (pricing.recommendedListPriceFormatted as string) || "",
      priceStrategy: (pricing.priceStrategy as string) || "at-market",
      priceStrategyExplanation: (pricing.priceStrategyExplanation as string) || "",
      rationale: (pricing.rationale as string) || "",
    });
    setDraftDom({
      lowEstimate: String((dom.lowEstimate as number) || ""),
      highEstimate: String((dom.highEstimate as number) || ""),
      rationale: (dom.rationale as string) || "",
    });
    setDraftMktg({
      headline: (mktg.headline as string) || "",
      targetBuyerProfile: (mktg.targetBuyerProfile as string) || "",
      keyDifferentiators: (mktg.keyDifferentiators as string[]) || [],
      channels: (mktg.channels as string[]) || [],
      timeline: (mktg.timeline as {week:string;action:string}[]) || [],
    });
  }

  function buildFinalAnalysis(textOverrides: Record<string,string>): Record<string,unknown> {
    return {
      ...draft,
      executiveSummary: textOverrides.executive ?? draft.executiveSummary,
      marketConditions: textOverrides.conditions ?? draft.marketConditions,
      competitivePositioning: textOverrides.positioning ?? draft.competitivePositioning,
      priceReductionStrategy: textOverrides.reduction ?? draft.priceReductionStrategy,
      brokerNotes: textOverrides.broker ?? draft.brokerNotes,
      pricingAnalysis: {
        ...draftPricing,
        recommendedListPriceFormatted: draftPricing.recommendedListPriceFormatted || `$${Number(draftPricing.recommendedListPrice).toLocaleString()}`,
      },
      daysOnMarketForecast: {
        ...draftDom,
        lowEstimate: parseInt(draftDom.lowEstimate) || 90,
        highEstimate: parseInt(draftDom.highEstimate) || 240,
      },
      marketingStrategy: { ...draftMktg },
    };
  }

  // Text area refs for the review step — must be top-level hook calls
  const refExecutive   = React.useRef<HTMLTextAreaElement>(null);
  const refConditions  = React.useRef<HTMLTextAreaElement>(null);
  const refPositioning = React.useRef<HTMLTextAreaElement>(null);
  const refReduction   = React.useRef<HTMLTextAreaElement>(null);
  const refBroker      = React.useRef<HTMLTextAreaElement>(null);

  function loadAnalysisForEdit(a: SavedAnalysis & { sold_comps?: CompRecord[]; active_comps?: CompRecord[]; notes?: string }) {
    setEditingId(a.id);
    setSubjectVessel(a.subject_vessel || "");
    setSubjectYear(a.subject_year || "");
    setSubjectMake(a.subject_make || "");
    setSubjectModel(a.subject_model || "");
    setSubjectLength((a as any).subject_length || "");
    setSubjectAskingPrice(a.subject_asking_price || "");
    setNotes((a as any).notes || "");
    // Load stored comps back as manual comps so they're editable
    const sc: CompRecord[] = (a as any).sold_comps || [];
    const ac: CompRecord[] = (a as any).active_comps || [];
    setManualComps([...sc, ...ac]);
    setShowManualForm(false);
    setSoldPdfComps([]);
    setActivePdfComps([]);
    setSuppDocs([]);
    setCompUrls([{ url: "", type: "sold", soldPrice: "", daysOnMarket: "", status: "idle", result: null, preview: null, error: "" }]);
    setSubjectUrl(""); setSubjectPreview(null); setSubjectPdfFile(""); setSubjectPdfText("");
    setStep("setup");
    showToast("Analysis loaded for editing", "success");
  }

  async function fetchAndEditAnalysis(id: number) {
    try {
      const r = await fetch(`/api/market-analysis?id=${id}`);
      const d = await r.json();
      if (d.ok && d.analysis) loadAnalysisForEdit(d.analysis);
      else showToast("Could not load analysis", "error");
    } catch { showToast("Could not load analysis", "error"); }
  }

  async function scrapeSubjectUrl() {
    if (!subjectUrl.trim()) return;
    setSubjectScraping(true);
    try {
      const r = await fetch("/api/market-analysis/scrape-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: subjectUrl.trim(), source: "subject", listingType: "active" }),
      });
      const d = await r.json();
      if (!d.ok) { showToast(`Could not scrape URL: ${d.error}`, "error"); return; }
      const v = d.preview;
      setSubjectPreview(v);
      if (v.name && !subjectVessel) setSubjectVessel(v.name);
      if (d.comp.year && !subjectYear) setSubjectYear(d.comp.year);
      if (d.comp.make && !subjectMake) setSubjectMake(d.comp.make);
      if (d.comp.length && !subjectLength) setSubjectLength(d.comp.length);
      if (v.price && !subjectAskingPrice) setSubjectAskingPrice(v.price);
      showToast(`✓ Loaded: ${v.name}`, "success");
    } catch (err) { showToast(`Scrape error: ${err}`, "error"); }
    finally { setSubjectScraping(false); }
  }

  async function uploadSubjectPdf(file: File) {
    setUploadingSubjectPdf(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/market-analysis/extract-text", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) { showToast(`Extract failed: ${d.error}`, "error"); return; }
      setSubjectPdfText(d.text);
      setSubjectPdfFile(d.fileName);
      // Try to auto-fill fields from extracted text
      const txt = d.text as string;
      if (!subjectVessel) {
        const nm = txt.match(/(?:vessel name|boat name|yacht name)[:\s]+([^\n]+)/i);
        if (nm) setSubjectVessel(nm[1].trim().slice(0, 80));
      }
      if (!subjectYear) {
        const yr = txt.match(/\b(19|20)\d{2}\b/);
        if (yr) setSubjectYear(yr[0]);
      }
      showToast(`✓ Loaded vessel PDF: ${d.pages} pages`, "success");
    } catch (err) { showToast(`Upload error: ${err}`, "error"); }
    finally { setUploadingSubjectPdf(false); }
  }

  async function uploadPdf(type: "sold" | "active", files: FileList) {
    if (type === "sold") setUploadingSold(true); else setUploadingActive(true);
    try {
      const form = new FormData();
      form.append("source", type === "sold" ? "sold_comps" : "active_comps");
      Array.from(files).forEach(f => form.append("files", f));
      const r = await fetch("/api/market-analysis/parse", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) { showToast(`Parse failed: ${d.error}`, "error"); return; }
      if (type === "sold") setSoldPdfComps(p => [...p, ...d.comps]);
      else setActivePdfComps(p => [...p, ...d.comps]);
      showToast(`✓ Extracted ${d.count} records`, "success");
    } catch (err) { showToast(`Upload error: ${err}`, "error"); }
    finally { if (type === "sold") setUploadingSold(false); else setUploadingActive(false); }
  }

  async function uploadSupplementalPdf(file: File) {
    if (suppDocs.length >= 5) { showToast("Maximum 5 supplemental PDFs", "error"); return; }
    setUploadingSupp(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/market-analysis/extract-text", { method: "POST", body: form });
      const d = await r.json();
      if (!d.ok) { showToast(`Extract failed: ${d.error}`, "error"); return; }
      setSuppDocs(p => [...p, { fileName: d.fileName, text: d.text, pages: d.pages }]);
      showToast(`✓ Added: ${d.fileName} (${d.pages} pages)`, "success");
    } catch (err) { showToast(`Upload error: ${err}`, "error"); }
    finally { setUploadingSupp(false); }
  }

  function addCompUrl() {
    if (compUrls.length >= 10) return;
    setCompUrls(p => [...p, { url: "", type: "active", soldPrice: "", daysOnMarket: "", status: "idle", result: null, preview: null, error: "" }]);
  }
  function updateCompUrl(idx: number, patch: Partial<CompUrl>) {
    setCompUrls(p => p.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function removeCompUrl(idx: number) { setCompUrls(p => p.filter((_, i) => i !== idx)); }
  function removeManualComp(idx: number) { setManualComps(p => p.filter((_, i) => i !== idx)); }

  async function scrapeCompUrl(idx: number) {
    const cu = compUrls[idx];
    if (!cu.url.trim()) return;
    updateCompUrl(idx, { status: "scraping", error: "", result: null, preview: null });
    try {
      const soldPriceRaw = cu.soldPrice.replace(/[$,]/g, "").trim();
      const r = await fetch("/api/market-analysis/scrape-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cu.url.trim(), source: cu.type === "sold" ? "sold_comps" : "active_comps",
          listingType: cu.type,
          soldPrice: soldPriceRaw ? parseInt(soldPriceRaw) : null,
          daysOnMarket: cu.daysOnMarket ? parseInt(cu.daysOnMarket) : null,
        }),
      });
      const d = await r.json();
      if (!d.ok) { updateCompUrl(idx, { status: "error", error: d.error }); return; }
      updateCompUrl(idx, { status: "done", result: d.comp, preview: d.preview });
    } catch (err) { updateCompUrl(idx, { status: "error", error: String(err) }); }
  }

  async function scrapeAllUrls() {
    const pending = compUrls.map((c, i) => ({ c, i })).filter(({ c }) => c.url.trim() && c.status !== "done");
    for (const { i } of pending) await scrapeCompUrl(i);
  }

  function addManualComp() {
    const f = manualForm;
    if (!f.name && !f.make) return;
    const pa = (s: string) => { const n = parseInt(s.replace(/[$,]/g, "")); return isNaN(n) ? null : n; };
    const comp: CompRecord = {
      name: f.name || `${f.year} ${f.make} ${f.model}`.trim(),
      make: f.make, model: f.model, year: f.year, length: f.length, location: f.location,
      listedPrice: pa(f.askPrice),
      soldPrice: f.type === "sold" ? pa(f.soldPrice) : null,
      askPrice: f.type === "active" ? pa(f.askPrice) : null,
      listedDate: f.listedDate, soldDate: f.soldDate,
      daysOnMarket: f.daysOnMarket ? parseInt(f.daysOnMarket) : null,
      source: f.type === "sold" ? "sold_comps" : "active_comps",
    };
    setManualComps(p => [...p, comp]);
    setManualForm(prev => ({ ...prev, name: "", make: "", model: "", year: "", length: "", location: "", askPrice: "", soldPrice: "", daysOnMarket: "", listedDate: "", soldDate: "" }));
    showToast(`✓ Added: ${comp.name}`, "success");
  }

  async function generateAnalysis() {
    setStep("generating"); setGenStatus("Compiling comp data…");
    const allSold = [...soldPdfComps, ...compUrls.filter(c => c.type === "sold" && c.result).map(c => c.result!), ...manualComps.filter(c => c.source === "sold_comps")];
    const allActive = [...activePdfComps, ...compUrls.filter(c => c.type === "active" && c.result).map(c => c.result!), ...manualComps.filter(c => c.source === "active_comps")];
    const combinedSupplemental = [subjectPdfText, ...suppDocs.map(d=>d.text)].filter(Boolean).join("\n\n---\n\n");
    setGenStatus("Analyzing with AI…");
    try {
      const genRes = await fetch("/api/market-analysis/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectVessel, subjectYear, subjectMake, subjectModel,
          subjectLength, subjectAskingPrice, notes,
          soldComps: allSold, activeComps: allActive, broadSold: [], broadActive: [],
          supplementalText: combinedSupplemental || undefined,
          brokerId: selectedBroker,
          grossTonnage: grossTonnage ? parseInt(grossTonnage) : null,
          engineCount:  engineCount  ? parseInt(engineCount)  : null,
          engineBrand:  engineBrand  || undefined,
          engineHp:     engineHp     ? parseInt(engineHp)     : null,
          lastRefitYear: lastRefitYear ? parseInt(lastRefitYear) : null,
          refitScope:   refitScope   || undefined,
          valuationWeights: weights,
        }),
      });
      const genData = await genRes.json();
      if (!genData.ok) { showToast(`Analysis failed: ${genData.error}`, "error"); setStep("comps"); return; }
      // Store comps for later save
      setPendingGenData({ genData, allSold, allActive });
      loadIntoDraft(genData.analysis);
      setStep("review");
    } catch (err) { showToast(`Error: ${err}`, "error"); setStep("comps"); }
  }

  async function saveReport() {
    const textOverrides = {
      executive:   refExecutive.current?.value   || "",
      conditions:  refConditions.current?.value  || "",
      positioning: refPositioning.current?.value || "",
      reduction:   refReduction.current?.value   || "",
      broker:      refBroker.current?.value      || "",
    };
    const finalAnalysis = buildFinalAnalysis(textOverrides);
    const pd = pendingGenData as Record<string,unknown> | null;
    const allSold   = (pd?.allSold  as CompRecord[]) || [];
    const allActive = (pd?.allActive as CompRecord[]) || [];
    const savePayload = {
      title: `${subjectYear} ${subjectMake} ${subjectModel}${subjectVessel ? ` — ${subjectVessel}` : ""}`,
      subject_vessel: subjectVessel, subject_year: subjectYear, subject_make: subjectMake,
      subject_model: subjectModel, subject_length: subjectLength,
      subject_asking_price: subjectAskingPrice, notes,
      sold_comps: allSold, active_comps: allActive, broad_sold: [], broad_active: [],
      analysis_json: finalAnalysis, report_html: "",
    };
    try {
      let saveId: number;
      if (editingId) {
        await fetch("/api/market-analysis", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...savePayload }),
        });
        saveId = editingId;
      } else {
        const res = await fetch("/api/market-analysis", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(savePayload),
        });
        const d = await res.json();
        saveId = d.id;
      }
      setSavedId(saveId); setStep("done"); loadAnalyses();
    } catch (err) { showToast(`Save failed: ${err}`, "error"); }
  }

  async function deleteAnalysis(id: number) {
    if (!confirm("Delete this analysis?")) return;
    await fetch(`/api/market-analysis?id=${id}`, { method: "DELETE" });
    loadAnalyses();
  }

  function resetForm() {
    setStep("list"); setEditingId(null); setSelectedBroker("will"); setSubjectUrl(""); setSubjectPreview(null);
    setSubjectPdfFile(""); setSubjectPdfText("");
    setSubjectVessel(""); setSubjectYear(""); setSubjectMake("");
    setSubjectModel(""); setSubjectLength(""); setSubjectAskingPrice(""); setNotes("");
    setGrossTonnage(""); setEngineCount(""); setEngineBrand(""); setEngineHp("");
    setLastRefitYear(""); setRefitScope("");
    setWeights({ yearRatePerYear:1.5, yearCap:20, lengthCap:25, brandPerTier:5, brandCap:20, gtCap:3, engineCap:5, refitFull:8, refitMechanical:5, refitCosmetic:3, refitFadeYears:8, manualOverride:0 });
    setShowWeights(false);
    setSoldPdfComps([]); setActivePdfComps([]);
    setSuppDocs([]);
    setManualComps([]); setShowManualForm(false);
    setManualForm({ type: "sold", name: "", make: "", model: "", year: "", length: "", location: "", askPrice: "", soldPrice: "", daysOnMarket: "", listedDate: "", soldDate: "" });
    setCompUrls([{ url: "", type: "sold", soldPrice: "", daysOnMarket: "", status: "idle", result: null, preview: null, error: "" }]);
    setSavedId(null);
  }

  const iStyle: React.CSSProperties = {
    background: "var(--input,#1e293b)", border: "1px solid var(--border)",
    color: "var(--foreground)", borderRadius: 8, padding: "10px 12px", fontSize: 13, width: "100%",
  };
  const urlCompsPending = compUrls.filter(c => c.url.trim() && c.status !== "done").length;
  const totalSold = soldPdfComps.length + compUrls.filter(c => c.type === "sold" && c.result).length + manualComps.filter(c => c.source === "sold_comps").length;
  const totalActive = activePdfComps.length + compUrls.filter(c => c.type === "active" && c.result).length + manualComps.filter(c => c.source === "active_comps").length;
  const totalComps = totalSold + totalActive;

  return (
    <PageShell title="Market Analysis">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
      {toast && (
        <div style={{ position:"fixed",bottom:24,right:24,zIndex:9999,background:toast.type==="success"?"#14532d":"#7f1d1d",color:"#fff",padding:"12px 20px",borderRadius:10,maxWidth:380,fontSize:13,boxShadow:"0 4px 24px rgba(0,0,0,.4)" }}>
          {toast.msg}
        </div>
      )}

      {/* LIST */}
      {step === "list" && (
        <div style={{ maxWidth:900,margin:"0 auto" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24 }}>
            <div>
              <h1 style={{ fontFamily:"serif",fontSize:26,color:"var(--foreground)",marginBottom:4 }}>Market Analysis</h1>
              <p style={{ fontSize:12,color:"var(--navy-400)" }}>Upload comp PDFs · Paste listing URLs · Generate pricing strategy & client report</p>
            </div>
            <button onClick={() => setStep("setup")} style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8 }}>
              <Plus className="w-4 h-4" /> New Analysis
            </button>
          </div>
          {loading ? <p style={{ color:"var(--navy-400)",fontSize:13 }}>Loading…</p>
          : analyses.length === 0 ? (
            <div style={{ textAlign:"center",padding:"64px 32px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:12 }}>
              <BarChart2 style={{ width:40,height:40,color:"var(--brass-400)",margin:"0 auto 16px" }} />
              <p style={{ fontFamily:"serif",fontSize:20,marginBottom:8 }}>No analyses yet</p>
              <p style={{ fontSize:13,color:"var(--navy-400)",marginBottom:24 }}>Build your first market intelligence report</p>
              <button onClick={() => setStep("setup")} style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontWeight:700,cursor:"pointer" }}>Get Started</button>
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              {analyses.map(a => (
                <div key={a.id} style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 24px",display:"flex",alignItems:"center",gap:16 }}>
                  <BarChart2 style={{ width:28,height:28,color:"var(--brass-400)",flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600,fontSize:15,marginBottom:2 }}>{a.title}</div>
                    <div style={{ fontSize:11,color:"var(--navy-400)" }}>{a.subject_asking_price&&`Ask: ${a.subject_asking_price} · `}{new Date(a.updated_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <a href={`/api/market-analysis/report?id=${a.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ background:"var(--brass-400)",color:"#fff",padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:600,textDecoration:"none",display:"flex",alignItems:"center",gap:6 }}>
                      <ExternalLink className="w-3 h-3" /> View
                    </a>
                    <a href={`/api/market-analysis/pdf?id=${a.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ background:"rgba(184,147,58,.12)",border:"1px solid rgba(184,147,58,.3)",color:"var(--brass-400)",padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:600,textDecoration:"none",display:"flex",alignItems:"center",gap:6 }}>
                      ⬇ PDF
                    </a>
                    <button onClick={() => fetchAndEditAnalysis(a.id)}
                      style={{ background:"rgba(255,255,255,.06)",border:"1px solid var(--border)",color:"var(--foreground)",padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer" }}>
                      ✎ Edit
                    </button>
                    <button onClick={() => deleteAnalysis(a.id)} style={{ background:"rgba(180,0,0,.12)",border:"none",color:"#f87171",padding:"7px 10px",borderRadius:8,cursor:"pointer" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SETUP */}
      {step === "setup" && (
        <div style={{ maxWidth:720,margin:"0 auto" }}>
          <button onClick={resetForm} style={{ background:"none",border:"none",color:"var(--navy-400)",cursor:"pointer",fontSize:13,marginBottom:20 }}>← Back</button>
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:28 }}>
            <p style={{ fontFamily:"serif",fontSize:22,marginBottom:4 }}>{editingId ? "Edit Analysis" : "Subject Vessel"}</p>
            <p style={{ fontSize:12,color:"var(--navy-400)",marginBottom:16 }}>
              {editingId ? "Update subject vessel details and proceed to adjust comp data" : "Paste a listing URL to auto-fill, upload a vessel PDF brochure/spec sheet, or enter details manually"}
            </p>

            {/* Broker selector */}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:8,display:"block" }}>Presenting Broker</label>
              <div style={{ display:"flex",gap:10 }}>
                {BROKERS.map(b => (
                  <button key={b.id} onClick={()=>setSelectedBroker(b.id as BrokerId)}
                    style={{ flex:1,padding:"12px 16px",borderRadius:10,border:`2px solid ${selectedBroker===b.id?"var(--brass-400)":"var(--border)"}`,background:selectedBroker===b.id?"rgba(184,147,58,.08)":"var(--card)",cursor:"pointer",textAlign:"left",transition:"all .15s" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4 }}>
                      <div style={{ width:10,height:10,borderRadius:"50%",background:selectedBroker===b.id?"var(--brass-400)":"var(--border)",flexShrink:0 }} />
                      <span style={{ fontSize:13,fontWeight:700,color:"var(--foreground)" }}>{b.name}</span>
                    </div>
                    <div style={{ fontSize:11,color:"var(--navy-400)",paddingLeft:18 }}>{b.email}</div>
                    <div style={{ fontSize:11,color:"var(--navy-400)",paddingLeft:18 }}>{b.phone}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* URL auto-fill */}
            <div style={{ display:"flex",gap:8,marginBottom:12 }}>
              <input style={{ ...iStyle,flex:1 }}
                placeholder="https://www.denisonyachtsales.com/yacht-for-sale/... or boatinternational.com"
                value={subjectUrl} onChange={e=>setSubjectUrl(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&scrapeSubjectUrl()} />
              <button onClick={scrapeSubjectUrl} disabled={!subjectUrl.trim()||subjectScraping}
                style={{ background:subjectUrl.trim()?"var(--brass-400)":"var(--border)",color:subjectUrl.trim()?"#fff":"var(--navy-400)",border:"none",borderRadius:8,padding:"10px 18px",fontWeight:700,fontSize:13,cursor:subjectUrl.trim()?"pointer":"not-allowed",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6 }}>
                {subjectScraping ? <><div className="spin" style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%" }} />Loading…</> : <><Link className="w-3 h-3" />Auto-Fill</>}
              </button>
            </div>

            {/* PDF upload */}
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 14px",background:"rgba(184,147,58,.04)",border:"1px dashed rgba(184,147,58,.3)",borderRadius:8 }}>
              <Upload style={{ width:16,height:16,color:"var(--brass-400)",flexShrink:0 }} />
              <span style={{ fontSize:12,color:"var(--navy-400)",flex:1 }}>Or upload a vessel PDF — brochure, spec sheet, listing print-out</span>
              {uploadingSubjectPdf && <div className="spin" style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"var(--brass-400)",borderRadius:"50%" }} />}
              <button onClick={() => subjectPdfRef.current?.click()} disabled={uploadingSubjectPdf}
                style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap" }}>
                {subjectPdfFile ? "Replace PDF" : "Upload PDF"}
              </button>
              <input ref={subjectPdfRef} type="file" accept=".pdf" className="hidden" onChange={e=>{if(e.target.files?.[0]){uploadSubjectPdf(e.target.files[0]);e.target.value="";}}} />
            </div>
            {subjectPdfFile && (
              <div style={{ marginBottom:14,display:"flex",alignItems:"center",gap:10,background:"rgba(184,147,58,.06)",border:"1px solid rgba(184,147,58,.2)",borderRadius:8,padding:"8px 14px" }}>
                <span style={{ fontSize:18 }}>📄</span>
                <span style={{ fontSize:13,color:"var(--foreground)",fontWeight:500 }}>{subjectPdfFile}</span>
                <span style={{ fontSize:11,color:"var(--navy-400)" }}>{Math.round(subjectPdfText.length/1000)}k chars — will be sent to Claude for context</span>
                <button onClick={()=>{setSubjectPdfFile("");setSubjectPdfText("");}} style={{ marginLeft:"auto",background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:16 }}>×</button>
              </div>
            )}

            {subjectPreview && (
              <div style={{ background:"rgba(34,197,94,.06)",border:"1px solid rgba(34,197,94,.2)",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:12 }}>
                {subjectPreview.image && <img src={subjectPreview.image} style={{ width:56,height:42,objectFit:"cover",borderRadius:6,flexShrink:0 }} alt="" />}
                <div>
                  <div style={{ fontWeight:600,fontSize:13 }}>{subjectPreview.name}</div>
                  <div style={{ fontSize:12,color:"var(--navy-400)" }}>{subjectPreview.price} · {subjectPreview.location}</div>
                </div>
                <span style={{ marginLeft:"auto",color:"#22c55e",fontSize:18 }}>✓</span>
              </div>
            )}

            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              {([["Vessel Name","e.g. KEMOSABE",subjectVessel,setSubjectVessel],["Year","e.g. 2012",subjectYear,setSubjectYear],["Make","e.g. Westport",subjectMake,setSubjectMake],["Model","e.g. 112",subjectModel,setSubjectModel],["Length","e.g. 112 ft",subjectLength,setSubjectLength],["Proposed Asking Price","e.g. $6,500,000",subjectAskingPrice,setSubjectAskingPrice]] as [string,string,string,(v:string)=>void][]).map(([label,ph,val,setter]) => (
                <div key={label}>
                  <label style={{ fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:5,display:"block" }}>{label}</label>
                  <input style={iStyle} placeholder={ph} value={val} onChange={e=>setter(e.target.value)} />
                </div>
              ))}
            </div>
            <div style={{ marginTop:14 }}>
              <label style={{ fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:5,display:"block" }}>Broker Notes</label>
              <textarea style={{ ...iStyle,minHeight:72,resize:"vertical",fontFamily:"inherit" }} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Condition, refit history, key features, motivation to sell…" />
            </div>

            {/* ── Valuation weighting attributes ── */}
            <div style={{ marginTop:20,padding:"16px 18px",background:"rgba(184,147,58,.04)",border:"1px solid rgba(184,147,58,.2)",borderRadius:8 }}>
              <p style={{ fontSize:11,fontWeight:600,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:12 }}>Valuation Weighting Attributes</p>
              <p style={{ fontSize:11,color:"var(--navy-400)",marginBottom:14 }}>These fields drive the comparable adjustment model — year, length, brand tier, gross tonnage, engines, and refit are used to mathematically adjust each comp's sold price before averaging.</p>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Gross Tonnage (GT)</label>
                  <input style={iStyle} placeholder="e.g. 247" value={grossTonnage} onChange={e=>setGrossTonnage(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Engine Count</label>
                  <input style={iStyle} placeholder="e.g. 2" value={engineCount} onChange={e=>setEngineCount(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Engine Brand</label>
                  <input style={iStyle} placeholder="e.g. CAT, MTU, Cummins" value={engineBrand} onChange={e=>setEngineBrand(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Total Engine HP</label>
                  <input style={iStyle} placeholder="e.g. 2600" value={engineHp} onChange={e=>setEngineHp(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Last Refit Year</label>
                  <input style={iStyle} placeholder="e.g. 2024" value={lastRefitYear} onChange={e=>setLastRefitYear(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Refit Scope</label>
                  <select style={{ ...iStyle }} value={refitScope} onChange={e=>setRefitScope(e.target.value as typeof refitScope)}>
                    <option value="">Not specified</option>
                    <option value="none">No refit</option>
                    <option value="cosmetic">Cosmetic only</option>
                    <option value="mechanical">Mechanical / systems</option>
                    <option value="full">Full refit (cosmetic + mechanical)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Adjustment weights ── */}
            <div style={{ marginTop:14 }}>
              <button onClick={()=>setShowWeights(p=>!p)}
                style={{ background:"none",border:"1px solid rgba(184,147,58,.3)",color:"var(--brass-400)",borderRadius:7,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",letterSpacing:"0.08em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:8,width:"100%" }}>
                <span>{showWeights?"▲":"▼"} Adjustment Weights</span>
                <span style={{ fontSize:10,fontWeight:400,color:"var(--navy-400)",textTransform:"none",letterSpacing:0 }}>set the % applied to each valuation factor</span>
              </button>
              {showWeights && (
                <div style={{ marginTop:10,padding:"16px 18px",background:"rgba(184,147,58,.03)",border:"1px solid rgba(184,147,58,.15)",borderRadius:8 }}>
                  <p style={{ fontSize:11,color:"var(--navy-400)",marginBottom:16 }}>Each slider controls how much a given factor moves the adjusted value per comparable. Slide or type a number. Defaults reflect standard appraisal methodology.</p>
                  {([
                    ["Year rate / yr",     "% adjustment per year of age diff",     "yearRatePerYear",  0, 5,   0.5],
                    ["Year cap ±",         "Max total year adjustment",             "yearCap",          0, 50,  1  ],
                    ["Length cap ±",       "Max total length adjustment",           "lengthCap",        0, 50,  1  ],
                    ["Brand / tier step",  "% per brand tier difference",           "brandPerTier",     0, 20,  1  ],
                    ["Brand cap ±",        "Max total brand adjustment",            "brandCap",         0, 50,  1  ],
                    ["GT cap ±",           "Max gross tonnage adjustment",          "gtCap",            0, 20,  1  ],
                    ["Engine cap ±",       "Max engine quality adjustment",         "engineCap",        0, 20,  1  ],
                    ["Full refit",         "Premium for full cosmetic+mech refit",  "refitFull",        0, 50,  1  ],
                    ["Mech refit",         "Premium for mechanical/systems refit",  "refitMechanical",  0, 50,  1  ],
                    ["Cosmetic refit",     "Premium for cosmetic-only refit",       "refitCosmetic",    0, 30,  1  ],
                    ["Refit fade (yrs)",   "Years until refit premium fades to 0",  "refitFadeYears",   1, 20,  1  ],
                    ["Broker override ±",  "Manual overall adjustment on top",      "manualOverride", -50, 50,  1  ],
                  ] as [string,string,string,number,number,number][]).map(([label,desc,key,min,max,step])=>(
                    <div key={key} style={{ display:"grid",gridTemplateColumns:"150px 1fr 72px",gap:10,alignItems:"center",marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:11,fontWeight:600,color:"var(--foreground)" }}>{label}</div>
                        <div style={{ fontSize:10,color:"var(--navy-400)" }}>{desc}</div>
                      </div>
                      <input type="range" min={min} max={max} step={step}
                        value={(weights as Record<string,number>)[key]}
                        onChange={e=>setWeights(p=>({...p,[key]:parseFloat(e.target.value)}))}
                        style={{ width:"100%",accentColor:"var(--brass-400)" }} />
                      <div style={{ display:"flex",alignItems:"center",gap:3 }}>
                        <input type="number" min={min} max={max} step={step}
                          value={(weights as Record<string,number>)[key]}
                          onChange={e=>setWeights(p=>({...p,[key]:parseFloat(e.target.value)||0}))}
                          style={{ background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",borderRadius:6,padding:"4px 6px",fontSize:12,textAlign:"right",width:52 }} />
                        <span style={{ fontSize:11,color:"var(--navy-400)",flexShrink:0 }}>%</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>setWeights({yearRatePerYear:1.5,yearCap:20,lengthCap:25,brandPerTier:5,brandCap:20,gtCap:3,engineCap:5,refitFull:8,refitMechanical:5,refitCosmetic:3,refitFadeYears:8,manualOverride:0})}
                    style={{ background:"none",border:"1px solid var(--border)",color:"var(--navy-400)",borderRadius:7,padding:"5px 12px",fontSize:11,cursor:"pointer",marginTop:6 }}>
                    Reset to Defaults
                  </button>
                </div>
              )}
            </div>

            <button onClick={() => setStep("comps")} disabled={!subjectMake&&!subjectVessel&&!subjectPdfFile}
              style={{ marginTop:20,width:"100%",background:subjectMake||subjectVessel||subjectPdfFile?"var(--brass-400)":"var(--border)",color:subjectMake||subjectVessel||subjectPdfFile?"#fff":"var(--navy-400)",border:"none",borderRadius:10,padding:"12px 0",fontWeight:700,fontSize:14,cursor:subjectMake||subjectVessel||subjectPdfFile?"pointer":"not-allowed" }}>
              Continue → Add Comparable Data
            </button>
          </div>
        </div>
      )}

      {/* COMPS */}
      {step === "comps" && (
        <div style={{ maxWidth:800,margin:"0 auto" }}>
          <button onClick={() => setStep("setup")} style={{ background:"none",border:"none",color:"var(--navy-400)",cursor:"pointer",fontSize:13,marginBottom:20 }}>← Back</button>
          <p style={{ fontFamily:"serif",fontSize:22,marginBottom:4 }}>Comparable Data</p>
          <p style={{ fontSize:12,color:"var(--navy-400)",marginBottom:20 }}>Upload Denison comp PDFs and/or paste individual listing URLs. Mix sold and active freely.</p>

          {/* Comp PDFs */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 24px",marginBottom:16 }}>
            <p style={{ fontSize:13,fontWeight:600,marginBottom:14 }}>Upload Comp PDFs <span style={{ fontSize:11,fontWeight:400,color:"var(--navy-400)" }}>— Denison comp sheets (multiple vessels per PDF)</span></p>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <div style={{ border:"1px solid var(--border)",borderRadius:8,padding:"14px 16px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                  <div><div style={{ fontSize:13,fontWeight:600,color:"#22c55e" }}>● Sold Comps PDF</div><div style={{ fontSize:11,color:"var(--navy-400)" }}>Recently sold vessels</div></div>
                  <button onClick={() => soldPdfRef.current?.click()} disabled={uploadingSold}
                    style={{ background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",color:"#22c55e",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                    {uploadingSold?<div className="spin" style={{ width:12,height:12,border:"2px solid rgba(34,197,94,.3)",borderTopColor:"#22c55e",borderRadius:"50%" }}/>:<Upload className="w-3 h-3"/>}
                    {soldPdfComps.length>0?`${soldPdfComps.length} records`:"Upload PDF"}
                  </button>
                  <input ref={soldPdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={e=>{if(e.target.files?.length){uploadPdf("sold",e.target.files);e.target.value="";}}}/>
                </div>
                {soldPdfComps.length>0&&<div style={{ maxHeight:100,overflowY:"auto",borderTop:"1px solid var(--border)",paddingTop:8 }}>
                  {soldPdfComps.map((c,i)=><div key={i} style={{ display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"var(--navy-400)" }}>
                    <span>{c.year} {c.make} {c.name?`"${c.name}"`:""}  {c.soldPrice?`Sold $${c.soldPrice.toLocaleString()}`:""}</span>
                    <button onClick={()=>setSoldPdfComps(p=>p.filter((_,j)=>j!==i))} style={{ background:"none",border:"none",color:"#f87171",cursor:"pointer" }}>×</button>
                  </div>)}
                </div>}
              </div>
              <div style={{ border:"1px solid var(--border)",borderRadius:8,padding:"14px 16px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                  <div><div style={{ fontSize:13,fontWeight:600,color:"#3b82f6" }}>● Active Listings PDF</div><div style={{ fontSize:11,color:"var(--navy-400)" }}>Currently for sale</div></div>
                  <button onClick={() => activePdfRef.current?.click()} disabled={uploadingActive}
                    style={{ background:"rgba(59,130,246,.1)",border:"1px solid rgba(59,130,246,.3)",color:"#3b82f6",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                    {uploadingActive?<div className="spin" style={{ width:12,height:12,border:"2px solid rgba(59,130,246,.3)",borderTopColor:"#3b82f6",borderRadius:"50%" }}/>:<Upload className="w-3 h-3"/>}
                    {activePdfComps.length>0?`${activePdfComps.length} records`:"Upload PDF"}
                  </button>
                  <input ref={activePdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={e=>{if(e.target.files?.length){uploadPdf("active",e.target.files);e.target.value="";}}}/>
                </div>
                {activePdfComps.length>0&&<div style={{ maxHeight:100,overflowY:"auto",borderTop:"1px solid var(--border)",paddingTop:8 }}>
                  {activePdfComps.map((c,i)=><div key={i} style={{ display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"var(--navy-400)" }}>
                    <span>{c.year} {c.make} {c.name?`"${c.name}"`:""}  {c.askPrice?`Ask $${c.askPrice.toLocaleString()}`:""}</span>
                    <button onClick={()=>setActivePdfComps(p=>p.filter((_,j)=>j!==i))} style={{ background:"none",border:"none",color:"#f87171",cursor:"pointer" }}>×</button>
                  </div>)}
                </div>}
              </div>
            </div>
          </div>

          {/* Comp URLs */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 24px",marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
              <p style={{ fontSize:13,fontWeight:600 }}>Individual Listing URLs <span style={{ fontSize:11,fontWeight:400,color:"var(--navy-400)" }}>— up to 10</span></p>
              <span style={{ fontSize:11,color:"var(--navy-400)" }}>{compUrls.length}/10</span>
            </div>
            <p style={{ fontSize:12,color:"var(--navy-400)",marginBottom:14 }}>denisonyachtsales.com · yachtworld.com · boatinternational.com · superyachttimes.com · fraseryachts.com · burgessyachts.com · and more</p>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              {compUrls.map((cu,idx)=>(
                <div key={idx} style={{ border:`1px solid ${cu.status==="done"?"rgba(34,197,94,.3)":cu.status==="error"?"rgba(248,113,113,.3)":"var(--border)"}`,borderRadius:10,padding:"14px 16px",background:cu.status==="done"?"rgba(34,197,94,.03)":"transparent" }}>
                  <div style={{ display:"flex",gap:8,alignItems:"flex-start" }}>
                    <div style={{ display:"flex",borderRadius:7,overflow:"hidden",border:"1px solid var(--border)",flexShrink:0,height:38 }}>
                      <button onClick={()=>updateCompUrl(idx,{type:"sold"})} style={{ padding:"0 10px",background:cu.type==="sold"?"#22c55e":"transparent",color:cu.type==="sold"?"#fff":"var(--navy-400)",border:"none",cursor:"pointer",fontSize:11,fontWeight:700 }}>SOLD</button>
                      <button onClick={()=>updateCompUrl(idx,{type:"active"})} style={{ padding:"0 10px",background:cu.type==="active"?"#3b82f6":"transparent",color:cu.type==="active"?"#fff":"var(--navy-400)",border:"none",cursor:"pointer",fontSize:11,fontWeight:700 }}>ACTIVE</button>
                    </div>
                    <input style={{ ...iStyle,flex:1,height:38,padding:"0 12px" }} placeholder={`Comparable #${idx+1} URL`}
                      value={cu.url} onChange={e=>updateCompUrl(idx,{url:e.target.value,status:"idle",result:null,preview:null})}
                      onKeyDown={e=>e.key==="Enter"&&scrapeCompUrl(idx)} />
                    <button onClick={()=>scrapeCompUrl(idx)} disabled={!cu.url.trim()||cu.status==="scraping"}
                      style={{ background:cu.status==="done"?"#22c55e":cu.url.trim()?"var(--brass-400)":"var(--border)",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",height:38,fontWeight:700,fontSize:12,cursor:cu.url.trim()?"pointer":"not-allowed",flexShrink:0,display:"flex",alignItems:"center",gap:5 }}>
                      {cu.status==="scraping"?<><div className="spin" style={{ width:12,height:12,border:"2px solid rgba(255,255,255,.3)",borderTopColor:"#fff",borderRadius:"50%" }}/>Scraping…</>:cu.status==="done"?"✓ Done":"Fetch"}
                    </button>
                    {compUrls.length>1&&<button onClick={()=>removeCompUrl(idx)} style={{ background:"rgba(180,0,0,.12)",border:"none",color:"#f87171",borderRadius:8,width:38,height:38,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><X className="w-4 h-4"/></button>}
                  </div>
                  {cu.type==="sold"&&cu.status!=="done"&&cu.url.trim()&&(
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8 }}>
                      <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Sold Price (if known)</label><input style={{ ...iStyle,padding:"7px 10px" }} placeholder="$5,850,000" value={cu.soldPrice} onChange={e=>updateCompUrl(idx,{soldPrice:e.target.value})}/></div>
                      <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Days on Market</label><input style={{ ...iStyle,padding:"7px 10px" }} placeholder="147" value={cu.daysOnMarket} onChange={e=>updateCompUrl(idx,{daysOnMarket:e.target.value})}/></div>
                    </div>
                  )}
                  {cu.status==="done"&&cu.preview&&(
                    <div style={{ marginTop:8,display:"flex",alignItems:"center",gap:10,fontSize:12,color:"var(--navy-400)" }}>
                      {cu.preview.image&&<img src={cu.preview.image} style={{ width:40,height:30,objectFit:"cover",borderRadius:4,flexShrink:0 }} alt=""/>}
                      <span style={{ color:"var(--foreground)",fontWeight:500 }}>{cu.preview.name}</span>
                      <span>{cu.preview.price}</span><span>{cu.preview.location}</span>
                      <span style={{ marginLeft:"auto",background:cu.type==="sold"?"rgba(34,197,94,.15)":"rgba(59,130,246,.15)",color:cu.type==="sold"?"#22c55e":"#3b82f6",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:700 }}>{cu.type.toUpperCase()}</span>
                    </div>
                  )}
                  {cu.status==="error"&&<div style={{ marginTop:6,fontSize:11,color:"#f87171" }}>⚠ {cu.error}</div>}
                </div>
              ))}
            </div>
            <div style={{ display:"flex",gap:10,marginTop:12 }}>
              {compUrls.length<10&&<button onClick={addCompUrl} style={{ background:"rgba(184,147,58,.08)",border:"1px dashed rgba(184,147,58,.4)",color:"var(--brass-400)",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}><Plus className="w-3 h-3"/> Add URL ({compUrls.length}/10)</button>}
              {urlCompsPending>0&&<button onClick={scrapeAllUrls} style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer" }}>Fetch All {urlCompsPending} Pending</button>}
            </div>
          </div>

          {/* Manual Entry */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 24px",marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600 }}>Manual Entry <span style={{ fontSize:11,fontWeight:400,color:"var(--navy-400)" }}>— type in comp data directly</span></p>
                <p style={{ fontSize:12,color:"var(--navy-400)",marginTop:2 }}>For off-market sales where data isn't published</p>
              </div>
              {manualComps.length>0&&<span style={{ background:"var(--brass-400)",color:"#fff",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700 }}>{manualComps.length}</span>}
            </div>
            {manualComps.length>0&&(
              <div style={{ borderTop:"1px solid var(--border)",paddingTop:10,marginTop:10,marginBottom:12 }}>
                {manualComps.map((c,i)=>(
                  <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",fontSize:12,borderBottom:"1px solid rgba(255,255,255,.04)" }}>
                    <span><span style={{ color:c.source==="sold_comps"?"#22c55e":"#3b82f6",fontWeight:700,fontSize:10,textTransform:"uppercase",marginRight:6 }}>{c.source==="sold_comps"?"SOLD":"ACTIVE"}</span>{c.year} {c.make} {c.model} {c.name?`"${c.name}"`:""}
                      {c.soldPrice?` · Sold $${c.soldPrice.toLocaleString()}`:c.askPrice?` · Ask $${c.askPrice.toLocaleString()}`:""}
                      {c.daysOnMarket?` · ${c.daysOnMarket} DOM`:""}{c.location?` · ${c.location}`:""}</span>
                    <button onClick={()=>removeManualComp(i)} style={{ background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:15,padding:"0 6px" }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {!showManualForm?(
              <button onClick={()=>setShowManualForm(true)} style={{ background:"rgba(184,147,58,.08)",border:"1px dashed rgba(184,147,58,.4)",color:"var(--brass-400)",borderRadius:8,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,marginTop:manualComps.length>0?0:10 }}>
                <span style={{ fontSize:16,lineHeight:1 }}>+</span> Add Comp Manually
              </button>
            ):(
              <div style={{ borderTop:"1px solid var(--border)",paddingTop:14,marginTop:10 }}>
                <div style={{ display:"flex",gap:8,marginBottom:14,alignItems:"center" }}>
                  <span style={{ fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)" }}>Type:</span>
                  <div style={{ display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid var(--border)" }}>
                    <button onClick={()=>setManualForm(f=>({...f,type:"sold"}))} style={{ padding:"6px 16px",background:manualForm.type==="sold"?"#22c55e":"transparent",color:manualForm.type==="sold"?"#fff":"var(--navy-400)",border:"none",cursor:"pointer",fontSize:12,fontWeight:700 }}>SOLD</button>
                    <button onClick={()=>setManualForm(f=>({...f,type:"active"}))} style={{ padding:"6px 16px",background:manualForm.type==="active"?"#3b82f6":"transparent",color:manualForm.type==="active"?"#fff":"var(--navy-400)",border:"none",cursor:"pointer",fontSize:12,fontWeight:700 }}>ACTIVE</button>
                  </div>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10 }}>
                  {([["Vessel Name","e.g. KEMOSABE","name"],["Make","e.g. Westport","make"],["Model","e.g. 112","model"],["Year","e.g. 2012","year"],["Length","e.g. 112 ft","length"],["Location","e.g. Ft Lauderdale","location"]] as [string,string,string][]).map(([label,ph,key])=>(
                    <div key={key}><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>{label}</label>
                    <input style={{ ...iStyle,padding:"8px 10px" }} placeholder={ph} value={(manualForm as Record<string,string>)[key]} onChange={e=>setManualForm(f=>({...f,[key]:e.target.value}))}/></div>
                  ))}
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14 }}>
                  <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Ask Price</label><input style={{ ...iStyle,padding:"8px 10px" }} placeholder="$5,500,000" value={manualForm.askPrice} onChange={e=>setManualForm(f=>({...f,askPrice:e.target.value}))}/></div>
                  {manualForm.type==="sold"&&<>
                    <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"#22c55e",marginBottom:4,display:"block" }}>Sold Price</label><input style={{ ...iStyle,padding:"8px 10px" }} placeholder="$5,100,000" value={manualForm.soldPrice} onChange={e=>setManualForm(f=>({...f,soldPrice:e.target.value}))}/></div>
                    <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Days on Market</label><input style={{ ...iStyle,padding:"8px 10px" }} placeholder="180" value={manualForm.daysOnMarket} onChange={e=>setManualForm(f=>({...f,daysOnMarket:e.target.value}))}/></div>
                    <div><label style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginBottom:4,display:"block" }}>Sale Year</label><input style={{ ...iStyle,padding:"8px 10px" }} placeholder="2024" value={manualForm.soldDate} onChange={e=>setManualForm(f=>({...f,soldDate:e.target.value}))}/></div>
                  </>}
                </div>
                <div style={{ display:"flex",gap:10 }}>
                  <button onClick={addManualComp} disabled={!manualForm.name&&!manualForm.make}
                    style={{ background:manualForm.name||manualForm.make?"var(--brass-400)":"var(--border)",color:manualForm.name||manualForm.make?"#fff":"var(--navy-400)",border:"none",borderRadius:8,padding:"9px 20px",fontWeight:700,fontSize:13,cursor:manualForm.name||manualForm.make?"pointer":"not-allowed" }}>
                    + Add This Comp
                  </button>
                  <button onClick={()=>setShowManualForm(false)} style={{ background:"transparent",border:"1px solid var(--border)",color:"var(--navy-400)",borderRadius:8,padding:"9px 16px",fontSize:13,cursor:"pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Supplemental Analysis PDFs — up to 5 */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"20px 24px",marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:suppDocs.length>0?12:0 }}>
              <div>
                <p style={{ fontSize:13,fontWeight:600 }}>Supplemental Analysis PDFs
                  <span style={{ fontSize:11,fontWeight:400,color:"var(--navy-400)" }}> — optional, up to 5</span>
                </p>
                <p style={{ fontSize:12,color:"var(--navy-400)",marginTop:2 }}>Upload existing market analyses, broker reports, pricing studies — Claude incorporates all of them</p>
              </div>
              <div style={{ display:"flex",gap:8,alignItems:"center",flexShrink:0 }}>
                {uploadingSupp&&<div className="spin" style={{ width:16,height:16,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"var(--brass-400)",borderRadius:"50%" }}/>}
                {suppDocs.length < 5 && (
                  <button onClick={()=>suppPdfRef.current?.click()} disabled={uploadingSupp}
                    style={{ background:"rgba(184,147,58,.08)",border:"1px solid rgba(184,147,58,.3)",color:"var(--brass-400)",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                    <Upload className="w-3 h-3"/> Add PDF ({suppDocs.length}/5)
                  </button>
                )}
                <input ref={suppPdfRef} type="file" accept=".pdf" className="hidden" onChange={e=>{if(e.target.files?.[0]){uploadSupplementalPdf(e.target.files[0]);e.target.value="";}}}/>
              </div>
            </div>
            {suppDocs.length > 0 && (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                {suppDocs.map((doc,i) => (
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:10,background:"rgba(184,147,58,.06)",border:"1px solid rgba(184,147,58,.2)",borderRadius:8,padding:"8px 14px" }}>
                    <span style={{ fontSize:18,flexShrink:0 }}>📄</span>
                    <span style={{ fontSize:13,color:"var(--foreground)",fontWeight:500,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{doc.fileName}</span>
                    <span style={{ fontSize:11,color:"var(--navy-400)",flexShrink:0 }}>{doc.pages} pages · {Math.round(doc.text.length/1000)}k chars</span>
                    <button onClick={()=>setSuppDocs(p=>p.filter((_,j)=>j!==i))}
                      style={{ background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:16,flexShrink:0,padding:"0 4px" }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary + Generate */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"16px 20px",marginBottom:16,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,textAlign:"center" }}>
            <div><div style={{ fontSize:24,fontWeight:700,color:"#22c55e" }}>{totalSold}</div><div style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginTop:3 }}>Sold Comps</div></div>
            <div><div style={{ fontSize:24,fontWeight:700,color:"#3b82f6" }}>{totalActive}</div><div style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginTop:3 }}>Active Comps</div></div>
            <div><div style={{ fontSize:24,fontWeight:700,color:"var(--brass-400)" }}>{totalComps}</div><div style={{ fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--navy-400)",marginTop:3 }}>Total Records</div></div>
          </div>
          <button onClick={generateAnalysis} disabled={totalComps===0}
            style={{ width:"100%",background:totalComps>0?"var(--brass-400)":"var(--border)",color:totalComps>0?"#fff":"var(--navy-400)",border:"none",borderRadius:12,padding:"14px 0",fontWeight:700,fontSize:15,cursor:totalComps>0?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
            <BarChart2 className="w-5 h-5"/> {editingId ? "Regenerate Report" : "Generate Market Intelligence Report"}
          </button>
        </div>
      )}

      {/* REVIEW & EDIT */}
      {step === "review" && (
        <div style={{ maxWidth:820,margin:"0 auto" }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
            <div>
              <button onClick={()=>setStep("comps")} style={{ background:"none",border:"none",color:"var(--navy-400)",cursor:"pointer",fontSize:13,marginBottom:6,display:"block" }}>← Back to Comps</button>
              <p style={{ fontFamily:"serif",fontSize:22 }}>Review & Edit Report</p>
              <p style={{ fontSize:12,color:"var(--navy-400)",marginTop:2 }}>Edit any section before saving. All changes are reflected in the final report and PDF.</p>
            </div>
            <button onClick={saveReport}
              style={{ background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:10,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",flexShrink:0 }}>
              ✓ Save Report
            </button>
          </div>

          {/* Helper for section cards */}
          {([
            ["Executive Summary",        "executive",   refExecutive,   draft.executiveSummary],
            ["Market Conditions",         "conditions",  refConditions,  draft.marketConditions],
            ["Competitive Positioning",   "positioning", refPositioning, draft.competitivePositioning],
            ["Price Reduction Strategy",  "reduction",   refReduction,   draft.priceReductionStrategy],
            ["Broker Notes & Flags",      "broker",      refBroker,      draft.brokerNotes],
          ] as [string,string,React.RefObject<HTMLTextAreaElement>,unknown][]).map(([title,refKey,ref,value]) => (
            <div key={refKey} style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 22px",marginBottom:14 }}>
              <label style={{ fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:8,display:"block" }}>{title}</label>
              <textarea ref={ref}
                defaultValue={String(value||"")}
                style={{ width:"100%",background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",borderRadius:8,padding:"10px 12px",fontSize:13,lineHeight:1.75,resize:"vertical",minHeight:100,fontFamily:"inherit" }}
              />
            </div>
          ))}

          {/* Pricing */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 22px",marginBottom:14 }}>
            <label style={{ fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:12,display:"block" }}>Pricing Strategy</label>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Recommended Price</label>
                <input style={{ ...iStyle }} value={draftPricing.recommendedListPriceFormatted}
                  onChange={e=>setDraftPricing(p=>({...p,recommendedListPriceFormatted:e.target.value}))} placeholder="$3,195,000" />
              </div>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Strategy</label>
                <select style={{ ...iStyle }} value={draftPricing.priceStrategy} onChange={e=>setDraftPricing(p=>({...p,priceStrategy:e.target.value}))}>
                  <option value="aggressive">Aggressive</option>
                  <option value="at-market">At-Market</option>
                  <option value="aspirational">Aspirational</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Strategy Tagline</label>
                <input style={{ ...iStyle }} value={draftPricing.priceStrategyExplanation}
                  onChange={e=>setDraftPricing(p=>({...p,priceStrategyExplanation:e.target.value}))} />
              </div>
            </div>
            <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Pricing Rationale</label>
            <textarea style={{ width:"100%",background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",borderRadius:8,padding:"10px 12px",fontSize:13,lineHeight:1.75,resize:"vertical",minHeight:80,fontFamily:"inherit" }}
              value={draftPricing.rationale} onChange={e=>setDraftPricing(p=>({...p,rationale:e.target.value}))} />
          </div>

          {/* DOM Forecast */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 22px",marginBottom:14 }}>
            <label style={{ fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:12,display:"block" }}>Days on Market Forecast</label>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Best Case (days)</label>
                <input style={{ ...iStyle }} value={draftDom.lowEstimate} onChange={e=>setDraftDom(p=>({...p,lowEstimate:e.target.value}))} placeholder="90" />
              </div>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Expected (days)</label>
                <input style={{ ...iStyle }} value={draftDom.highEstimate} onChange={e=>setDraftDom(p=>({...p,highEstimate:e.target.value}))} placeholder="240" />
              </div>
            </div>
            <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>DOM Rationale</label>
            <textarea style={{ width:"100%",background:"var(--input,#1e293b)",border:"1px solid var(--border)",color:"var(--foreground)",borderRadius:8,padding:"10px 12px",fontSize:13,lineHeight:1.75,resize:"vertical",minHeight:72,fontFamily:"inherit" }}
              value={draftDom.rationale} onChange={e=>setDraftDom(p=>({...p,rationale:e.target.value}))} />
          </div>

          {/* Marketing */}
          <div style={{ background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"18px 22px",marginBottom:14 }}>
            <label style={{ fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--brass-400)",marginBottom:12,display:"block" }}>Marketing Strategy</label>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Headline</label>
                <input style={{ ...iStyle }} value={draftMktg.headline} onChange={e=>setDraftMktg(p=>({...p,headline:e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:4,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Target Buyer Profile</label>
                <input style={{ ...iStyle }} value={draftMktg.targetBuyerProfile} onChange={e=>setDraftMktg(p=>({...p,targetBuyerProfile:e.target.value}))} />
              </div>
            </div>
            <label style={{ fontSize:10,color:"var(--navy-400)",marginBottom:6,display:"block",textTransform:"uppercase",letterSpacing:"0.1em" }}>Key Differentiators</label>
            <div style={{ display:"flex",flexDirection:"column",gap:6,marginBottom:8 }}>
              {draftMktg.keyDifferentiators.map((d,i)=>(
                <div key={i} style={{ display:"flex",gap:6 }}>
                  <input style={{ ...iStyle,flex:1 }} value={d} onChange={e=>setDraftMktg(p=>({...p,keyDifferentiators:p.keyDifferentiators.map((x,j)=>j===i?e.target.value:x)}))} />
                  <button onClick={()=>setDraftMktg(p=>({...p,keyDifferentiators:p.keyDifferentiators.filter((_,j)=>j!==i)}))} style={{ background:"rgba(180,0,0,.12)",border:"none",color:"#f87171",borderRadius:8,padding:"0 10px",cursor:"pointer",flexShrink:0 }}>×</button>
                </div>
              ))}
              <button onClick={()=>setDraftMktg(p=>({...p,keyDifferentiators:[...p.keyDifferentiators,""]}))}
                style={{ background:"rgba(184,147,58,.08)",border:"1px dashed rgba(184,147,58,.3)",color:"var(--brass-400)",borderRadius:7,padding:"6px 14px",fontSize:12,cursor:"pointer",alignSelf:"flex-start" }}>
                + Add Differentiator
              </button>
            </div>
          </div>

          <button onClick={saveReport}
            style={{ width:"100%",background:"var(--brass-400)",color:"#fff",border:"none",borderRadius:12,padding:"14px 0",fontWeight:700,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8 }}>
            ✓ Save & Finalize Report
          </button>
        </div>
      )}

      {/* GENERATING */}
      {step === "generating" && (
        <div style={{ maxWidth:500,margin:"80px auto",textAlign:"center" }}>
          <div className="spin" style={{ width:52,height:52,border:"3px solid rgba(184,147,58,.3)",borderTopColor:"var(--brass-400)",borderRadius:"50%",margin:"0 auto 24px" }}/>
          <p style={{ fontFamily:"serif",fontSize:24,marginBottom:8 }}>Analyzing Market Data</p>
          <p style={{ fontSize:13,color:"var(--navy-400)" }}>{genStatus||"Processing…"}</p>
        </div>
      )}

      {/* DONE */}
      {step === "done" && savedId && (
        <div style={{ maxWidth:600,margin:"0 auto",textAlign:"center",padding:"64px 32px" }}>
          <div style={{ fontSize:52,marginBottom:16 }}>✅</div>
          <p style={{ fontFamily:"serif",fontSize:28,marginBottom:8 }}>Report Ready</p>
          <p style={{ fontSize:14,color:"var(--navy-400)",marginBottom:32 }}>
            {subjectYear} {subjectMake} {subjectModel} {subjectVessel&&`"${subjectVessel}"`}
          </p>
          <div style={{ display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap" }}>
            <a href={`/api/market-analysis/report?id=${savedId}`} target="_blank" rel="noopener noreferrer"
              style={{ background:"var(--brass-400)",color:"#fff",padding:"12px 28px",borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none",display:"flex",alignItems:"center",gap:8 }}>
              <ExternalLink className="w-4 h-4"/> View Report
            </a>
            <a href={`/api/market-analysis/pdf?id=${savedId}`} target="_blank" rel="noopener noreferrer"
              style={{ background:"rgba(184,147,58,.12)",border:"1px solid rgba(184,147,58,.3)",color:"var(--brass-400)",padding:"12px 24px",borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none",display:"flex",alignItems:"center",gap:8 }}>
              ⬇ Download PDF
            </a>
            <button onClick={resetForm} style={{ background:"var(--card)",border:"1px solid var(--border)",color:"var(--foreground)",padding:"12px 24px",borderRadius:10,fontWeight:600,fontSize:14,cursor:"pointer" }}>
              Back to List
            </button>
            <button onClick={()=>{resetForm();setStep("setup");}}
              style={{ background:"var(--card)",border:"1px solid var(--border)",color:"var(--foreground)",padding:"12px 24px",borderRadius:10,fontWeight:600,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6 }}>
              <Plus className="w-4 h-4"/> New Analysis
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
