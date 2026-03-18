"use client";

import React from "react";
import { ExternalLink, BookOpen, RefreshCw, Link2, FileDown, Trash2, Plus, ArrowLeft, Eye, Upload } from "lucide-react";
import PageShell from "../components/PageShell";
import { DropboxImagePicker } from "@/components/brochures/DropboxImagePicker";

// Inline capacity formatter so the editor can apply it client-side
// without a server round-trip. Mirrors src/lib/capacity-utils.ts exactly.
const TANK_KEYS = new Set(["fuelTank", "freshWater", "holdingTank"]);
const L_TO_GAL = 0.264172;
const GAL_TO_L = 3.785412;

function parseCapacityNumber(s: string): number {
  const stripped = s.replace(/\s/g, "");
  const periods = (stripped.match(/\./g) || []).length;
  const commas  = (stripped.match(/,/g) || []).length;
  if (periods === 0 && commas === 0) return parseInt(stripped, 10);
  if (periods > 0 && commas === 0) {
    const isEuropean = /^[\d.]+$/.test(stripped) &&
      stripped.split(".").every((part, i) => i === 0 ? true : part.length === 3);
    if (isEuropean) return parseInt(stripped.replace(/\./g, ""), 10);
    return Math.round(parseFloat(stripped));
  }
  if (commas > 0 && periods === 0) return parseInt(stripped.replace(/,/g, ""), 10);
  const lastComma = stripped.lastIndexOf(",");
  const lastPeriod = stripped.lastIndexOf(".");
  if (lastComma > lastPeriod) return Math.round(parseFloat(stripped.replace(/\./g, "").replace(",", ".")));
  return Math.round(parseFloat(stripped.replace(/,/g, "")));
}

function fmtN(n: number): string { return n.toLocaleString("en-US"); }

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatCapacityClient(raw: string): string {
  if (!raw || raw.trim() === "") return raw;
  // Already dual-formatted → pass through
  if (raw.includes("/")) return raw;
  const s = raw.trim();
  const ltMatch = s.match(/^([\d,.\s]+)\s*(?:lt\.?|l\.?|litr(?:e|es?)|liters?)(?:\s|$)/i);
  if (ltMatch) {
    const liters = parseCapacityNumber(ltMatch[1]);
    if (!isNaN(liters) && liters > 0)
      return `${fmtN(liters)} lt / ${fmtN(Math.round(liters * L_TO_GAL))} gal`;
  }
  const galMatch = s.match(/^([\d,.\s]+)\s*(?:us\s*)?gal(?:lons?)?(?:\s|$)/i);
  if (galMatch) {
    const gallons = parseCapacityNumber(galMatch[1]);
    if (!isNaN(gallons) && gallons > 0)
      return `${fmtN(gallons)} gal / ${fmtN(Math.round(gallons * GAL_TO_L))} lt`;
  }
  const bareMatch = s.match(/^([\d,.]+)$/);
  if (bareMatch) {
    const n = parseCapacityNumber(bareMatch[1]);
    if (!isNaN(n) && n > 0) {
      if (n > 500) return `${fmtN(n)} lt / ${fmtN(Math.round(n * L_TO_GAL))} gal`;
      return `${fmtN(n)} gal / ${fmtN(Math.round(n * GAL_TO_L))} lt`;
    }
  }
  return raw; // unrecognised format → leave as-is
}

type Brochure = {
  slug: string; title: string; subtitle: string; builder: string;
  year: string; tag: string; updatedAt: string; source: "file" | "db"; id?: number;
  heroSrc?: string; is_pocket_listing?: number;
};

type VesselData = {
  // Identity
  name: string; builder: string; year: number | null; location: string;
  price: string; askingPriceEUR: string; vatStatus: string;
  stockNumber: string; imoNumber: string; mmsiNumber: string; hullNumber: string;
  registryPort: string; flagState: string; navClass: string;
  classification: string; grossTonnage: string; sourceUrl: string;
  refitYear: string; refitDetails: string;
  // Dimensions
  loa: string; lwl: string; beam: string; beamMax: string;
  draft: string; draftMin: string; airDraft: string; freeboard: string;
  displacement: string; deckCount: string;
  // Hull & Construction
  hullForm: string; hullMaterial: string; deckMaterial: string;
  superstructure: string; paintSystem: string; windowGlazing: string; keelType: string;
  // Design
  exteriorDesign: string; interiorDesign: string; navalArchitect: string;
  interiorStyle: string; colorScheme: string;
  // Propulsion
  engines: string; power: string; engineHours: string; gearbox: string;
  propulsion: string; shaftCount: string; propellers: string;
  bowThruster: string; sternThruster: string;
  stabilisers: string; stabilisersMake: string; zeroSpeedStabilisers: string;
  // Performance
  maxSpeed: string; cruiseSpeed: string; economySpeed: string;
  range: string; transitRange: string;
  // Electrical
  gensets: string; generatorKW: string; shorepower: string;
  voltageSystem: string; emergencyGenerator: string;
  airCon: string; airConMake: string;
  // Tanks
  fuelTank: string; fuelType: string; freshWater: string;
  holdingTank: string; greyWater: string; lubeOil: string;
  sewageTreatment: string; waterMaker: string; waterMakerCapacity: string;
  // Accommodation
  guests: string; staterooms: string; ownersCabin: string; guestCabins: string;
  crew: string; crewCabins: string; crewMess: string; livingSpace: string;
  // Amenities
  flybridge: string; beachClub: string; swimmingPlatform: string;
  jacuzzi: string; gym: string; cinema: string;
  tender: string; tenderCount: string; toys: string; garage: string;
  // Navigation
  navigation: string; radar: string; chartPlotter: string;
  autopilot: string; satcom: string; aisSystem: string;
  anchoring: string; windlass: string;
  // Safety
  fireSuppression: string; lifeRafts: string; mobSystem: string; helideck: string;
  // Condition
  lastSurvey: string; lastDrydock: string; lastService: string; notes: string;
  // Media
  pdfUrl: string;
  gaImages?: { src: string; alt: string }[];
  videos?: { url: string; thumbnail?: string; title?: string; type: string }[];
  description: string; images: { src: string; alt: string }[];
};

const FIELD_GROUPS: { label: string; fields: { key: keyof VesselData; label: string }[] }[] = [
  { label: "Identity", fields: [
    { key:"name", label:"Vessel Name" }, { key:"builder", label:"Builder / Shipyard" },
    { key:"year", label:"Year / Delivery" }, { key:"refitYear", label:"Refit Year" },
    { key:"refitDetails", label:"Refit Details" }, { key:"location", label:"Location" },
    { key:"price", label:"Asking Price (USD)" }, { key:"askingPriceEUR", label:"Asking Price (EUR)" },
    { key:"vatStatus", label:"VAT Status" }, { key:"stockNumber", label:"Stock Number" },
    { key:"hullNumber", label:"Hull Number" }, { key:"imoNumber", label:"IMO Number" },
    { key:"mmsiNumber", label:"MMSI Number" }, { key:"registryPort", label:"Registry / Home Port" },
    { key:"flagState", label:"Flag State" }, { key:"navClass", label:"Navigation Class" },
    { key:"classification", label:"Classification Society" }, { key:"grossTonnage", label:"Gross Tonnage" },
  ]},
  { label: "Links", fields: [
    { key:"sourceUrl", label:"Listing URL" },
    { key:"pdfUrl", label:"Downloadable PDF URL" },
  ]},
  { label: "Dimensions", fields: [
    { key:"loa", label:"LOA" }, { key:"lwl", label:"LWL" },
    { key:"beam", label:"Beam" }, { key:"beamMax", label:"Max Beam" },
    { key:"draft", label:"Draft (max)" }, { key:"draftMin", label:"Draft (min)" },
    { key:"airDraft", label:"Air Draft" }, { key:"freeboard", label:"Freeboard" },
    { key:"displacement", label:"Displacement" }, { key:"deckCount", label:"Number of Decks" },
  ]},
  { label: "Hull & Construction", fields: [
    { key:"hullForm", label:"Hull Form" }, { key:"hullMaterial", label:"Hull Material" },
    { key:"deckMaterial", label:"Deck Material" }, { key:"superstructure", label:"Superstructure" },
    { key:"paintSystem", label:"Paint System" }, { key:"windowGlazing", label:"Windows / Glazing" },
    { key:"keelType", label:"Keel Type" },
  ]},
  { label: "Design", fields: [
    { key:"exteriorDesign", label:"Exterior Design" }, { key:"interiorDesign", label:"Interior Design" },
    { key:"navalArchitect", label:"Naval Architecture" }, { key:"interiorStyle", label:"Interior Style" },
    { key:"colorScheme", label:"Color Scheme" },
  ]},
  { label: "Propulsion", fields: [
    { key:"engines", label:"Main Engines" }, { key:"power", label:"Power Output" },
    { key:"engineHours", label:"Engine Hours" }, { key:"gearbox", label:"Gearbox" },
    { key:"propulsion", label:"Propulsion Type" }, { key:"shaftCount", label:"Shaft Count" },
    { key:"propellers", label:"Propellers" }, { key:"bowThruster", label:"Bow Thruster" },
    { key:"sternThruster", label:"Stern Thruster" }, { key:"stabilisers", label:"Stabilisers" },
    { key:"stabilisersMake", label:"Stabiliser Make" }, { key:"zeroSpeedStabilisers", label:"Zero Speed Stabilisers" },
  ]},
  { label: "Performance", fields: [
    { key:"maxSpeed", label:"Max Speed" }, { key:"cruiseSpeed", label:"Cruise Speed" },
    { key:"economySpeed", label:"Economy Speed" }, { key:"range", label:"Range (cruise)" },
    { key:"transitRange", label:"Range (economy)" },
  ]},
  { label: "Electrical & Generators", fields: [
    { key:"gensets", label:"Generator Sets" }, { key:"generatorKW", label:"Generator Output (kW)" },
    { key:"shorepower", label:"Shore Power" }, { key:"voltageSystem", label:"Voltage System" },
    { key:"emergencyGenerator", label:"Emergency Generator" }, { key:"airCon", label:"Air Conditioning" },
    { key:"airConMake", label:"A/C Make" },
  ]},
  { label: "Tanks", fields: [
    { key:"fuelTank", label:"Fuel Capacity" }, { key:"fuelType", label:"Fuel Type" },
    { key:"freshWater", label:"Fresh Water" }, { key:"holdingTank", label:"Holding Tank" },
    { key:"greyWater", label:"Grey Water" }, { key:"lubeOil", label:"Lube Oil" },
    { key:"sewageTreatment", label:"Sewage Treatment" }, { key:"waterMaker", label:"Water Maker" },
    { key:"waterMakerCapacity", label:"Water Maker Capacity" },
  ]},
  { label: "Accommodation", fields: [
    { key:"guests", label:"Guests" }, { key:"staterooms", label:"Staterooms" },
    { key:"ownersCabin", label:"Owner's Cabin" }, { key:"guestCabins", label:"Guest Cabins" },
    { key:"crew", label:"Crew" }, { key:"crewCabins", label:"Crew Cabins" },
    { key:"crewMess", label:"Crew Mess" }, { key:"livingSpace", label:"Living Space / Gross Area" },
  ]},
  { label: "Amenities & Deck", fields: [
    { key:"flybridge", label:"Flybridge" }, { key:"beachClub", label:"Beach Club" },
    { key:"swimmingPlatform", label:"Swimming Platform" }, { key:"jacuzzi", label:"Jacuzzi / Hot Tub" },
    { key:"gym", label:"Gym" }, { key:"cinema", label:"Cinema / Theatre" },
    { key:"tender", label:"Tender / Garage" }, { key:"tenderCount", label:"Tender Count" },
    { key:"toys", label:"Water Toys" }, { key:"garage", label:"Garage Details" },
  ]},
  { label: "Navigation & Comms", fields: [
    { key:"navigation", label:"Navigation Systems" }, { key:"radar", label:"Radar" },
    { key:"chartPlotter", label:"Chart Plotter" }, { key:"autopilot", label:"Autopilot" },
    { key:"satcom", label:"SATCOM / VSAT" }, { key:"aisSystem", label:"AIS" },
    { key:"anchoring", label:"Anchoring System" }, { key:"windlass", label:"Windlass" },
  ]},
  { label: "Safety", fields: [
    { key:"fireSuppression", label:"Fire Suppression" }, { key:"lifeRafts", label:"Life Rafts" },
    { key:"mobSystem", label:"MOB System" }, { key:"helideck", label:"Helideck" },
  ]},
  { label: "Condition & Service", fields: [
    { key:"lastSurvey", label:"Last Survey" }, { key:"lastDrydock", label:"Last Dry Dock" },
    { key:"lastService", label:"Last Service / Maintenance" }, { key:"notes", label:"Notes / Remarks" },
  ]},
];

type Step = "list" | "scraping" | "preview" | "saving";

export default function BrochuresPage() {
  const [step, setStep]           = React.useState<Step>("list");
  const [urls, setUrls]           = React.useState<string[]>(["", ""]);
  const [url2Warning, setUrl2Warning] = React.useState<string | null>(null);
  // Convenience aliases so the rest of the code keeps working
  const url  = urls[0] ?? "";
  const url2 = urls[1] ?? "";
  const [pendingPdf, setPendingPdf]   = React.useState<File | null>(null);
  const [pdfFileName, setPdfFileName] = React.useState("");
  const [vessel, setVessel]       = React.useState<VesselData | null>(null);
  const [brochures, setBrochures] = React.useState<Brochure[]>([]);
  const [loading, setLoading]     = React.useState(true);
  const [toast, setToast]         = React.useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [deleting, setDeleting]   = React.useState<number | null>(null);
  const [newSlug, setNewSlug]     = React.useState<string | null>(null);
  const [showDropbox, setShowDropbox] = React.useState(false);
  const [buildStatus, setBuildStatus] = React.useState("");
  const [hiddenFields, setHiddenFields] = React.useState<Set<string>>(new Set());
  const [livePreview, setLivePreview] = React.useState(false);
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const previewDebounce = React.useRef<ReturnType<typeof setTimeout>|null>(null);
  const [draftSaved, setDraftSaved] = React.useState(false);
  const [hasDraft, setHasDraft] = React.useState(false);
  const [showPasteImport, setShowPasteImport] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const DRAFT_KEY = "yotcrm_brochure_draft_v1";
  // Check for saved draft after mount
  React.useEffect(() => {
    try { setHasDraft(!!localStorage.getItem(DRAFT_KEY)); } catch { /* ignore */ }
  }, []);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  // Broker selection — all three on by default, user can toggle
  const [selectedBrokers, setSelectedBrokers] = React.useState<Set<string>>(new Set(["Will Noftsinger","Paolo Ameglio","Peter Quintal"]));
  const [isPocket, setIsPocket] = React.useState(false);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const gaInputRef  = React.useRef<HTMLInputElement>(null);

  const isOceanKing = /oceanking\.it/i.test(url);
  const hasAnySources = urls.some(u => u.trim()) || !!pendingPdf;

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  }

  async function fetchBrochures() {
    setLoading(true);
    try {
      const res = await fetch("/api/brochures");
      const data = await res.json();
      if (data.ok) setBrochures(data.brochures);
    } catch { showToast("Could not load brochures", "error"); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { fetchBrochures(); }, []);

  /** Deep merge two vessel objects — b fills any empty fields of a */
  function mergeVessels(a: VesselData, b: VesselData): VesselData {
    const merged = { ...a };
    const skipKeys = new Set(["images", "pdfUrl"]);
    for (const k of Object.keys(b) as (keyof VesselData)[]) {
      if (skipKeys.has(k as string)) continue;
      const av = (a as Record<string,unknown>)[k as string];
      const bv = (b as Record<string,unknown>)[k as string];
      const isEmpty = av === null || av === undefined || av === "" || av === 0;
      if (isEmpty && bv) (merged as Record<string,unknown>)[k as string] = bv;
    }
    // Merge images: keep all unique by src
    const seen = new Set(a.images.map(i => i.src));
    const extra = (b.images || []).filter(i => !seen.has(i.src));
    merged.images = [...a.images, ...extra];
    return merged;
  }

  function prepVessel(v: VesselData): VesselData {
    // Strip HTML from all string fields
    const cleaned = { ...v };
    for (const k of Object.keys(cleaned)) {
      const val = (cleaned as Record<string,unknown>)[k];
      if (typeof val === "string" && val.includes("<")) {
        (cleaned as Record<string,unknown>)[k] = stripHtml(val);
      }
    }
    cleaned.fuelTank    = formatCapacityClient(cleaned.fuelTank    || "");
    cleaned.freshWater  = formatCapacityClient(cleaned.freshWater  || "");
    cleaned.holdingTank = formatCapacityClient(cleaned.holdingTank || "");
    if (!cleaned.pdfUrl) cleaned.pdfUrl = "";
    return cleaned;
  }

  /** Unified build — scrapes all URLs and PDF simultaneously, merges all */
  async function handleBuild(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!hasAnySources) return;
    setStep("scraping");
    setNewSlug(null);
    setUrl2Warning(null);

    const activeUrls = urls.map(u => u.trim()).filter(Boolean);
    const sourceLabels = [
      ...activeUrls.map((u, i) => `URL ${i + 1}: ${u}`),
      ...(pendingPdf ? [`PDF: ${pdfFileName}`] : []),
    ];
    setBuildStatus(`Scraping ${sourceLabels.length} source${sourceLabels.length > 1 ? "s" : ""}…`);

    try {
      const urlPromises = activeUrls.map((u, i) => (async () => {
        setBuildStatus(`Scraping URL ${i + 1}…`);
        const r = await fetch("/api/brochures/preview", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: u }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `URL ${i + 1} failed`);
        return d.vessel as VesselData;
      })());

      const pdfPromise = pendingPdf ? (async () => {
        setBuildStatus("Extracting PDF…");
        const form = new FormData();
        form.append("file", pendingPdf);
        const r = await fetch("/api/brochures/scrape-pdf", { method: "POST", body: form });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "PDF failed");
        return d.vessel as VesselData;
      })() : Promise.resolve(null);

      const results = await Promise.allSettled([...urlPromises, pdfPromise]);

      const vessels: VesselData[] = [];
      const failures: string[] = [];
      const labels = [...activeUrls.map((_, i) => `URL ${i + 1}`), "PDF"];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value) vessels.push(r.value);
        else if (r.status === "rejected") failures.push(`${labels[i]}: ${r.reason?.message || "failed"}`);
      });

      if (!vessels.length) throw new Error("All sources failed — nothing to build from");

      let merged = vessels[0];
      for (let i = 1; i < vessels.length; i++) merged = mergeVessels(merged, vessels[i]);

      if (failures.length) setUrl2Warning(`Some sources failed: ${failures.join("; ")}`);

      setBuildStatus("Processing…");
      setVessel(prepVessel(merged));
      setStep("preview");

      // If scrape returned sparse data (no images, no price) — auto-open paste panel
      const isSparse = merged.images.length === 0 && !merged.price;
      const hasYW = activeUrls.some(u => /yachtworld\.com|boattrader\.com/i.test(u));
      if (isSparse && hasYW) {
        setShowPasteImport(true);
        showToast("YachtWorld blocked auto-scrape — paste the page source below to complete the brochure", "error");
      } else {
        const fieldsFilled = Object.values(merged).filter(v => v && v !== "" && v !== null).length;
        showToast(`Built from ${vessels.length} source${vessels.length > 1 ? "s" : ""} · ${fieldsFilled} fields populated`, "success");
      }
    } catch (err) {
      showToast(`Build failed: ${err instanceof Error ? err.message : "unknown error"}`, "error");
      setStep("list");
    } finally {
      setBuildStatus("");
    }
  }

  function handlePdfSelect(file: File) {
    setPendingPdf(file);
    setPdfFileName(file.name);
    showToast(`PDF staged: ${file.name} — click Build Brochure to include it`, "success");
  }

  /* ── Paste import — handles raw HTML (View Source) AND plain text ── */
  function handlePasteImport() {
    const raw = pasteText.trim();
    if (!raw) return;

    const isHtml = /^<!doctype\s+html|^<html/i.test(raw) || raw.includes("</head>") || raw.includes("</body>");
    const v: Partial<VesselData> = {};
    const images: { src: string; alt: string }[] = [];

    if (isHtml) {
      // ── HTML path: use DOMParser to extract everything ──────────────────
      const doc = new DOMParser().parseFromString(raw, "text/html");

      // 1. JSON-LD (richest source — YachtWorld, BoatTrader embed everything here)
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
        try {
          const json = JSON.parse(el.textContent || "");
          const nodes = Array.isArray(json) ? json : json["@graph"] ? json["@graph"] : [json];
          for (const node of nodes) {
            if (!node) continue;
            if ((node["@type"] || "").match(/Product|Vehicle|Boat/i)) {
              if (!v.name && node.name) v.name = String(node.name).trim();
              if (!v.description && node.description) v.description = String(node.description).trim();
              if (!v.year && (node.productionDate || node.vehicleModelDate)) {
                const yr = parseInt(node.productionDate || node.vehicleModelDate);
                if (yr > 1900) v.year = yr;
              }
              if (!v.builder && node.brand?.name) v.builder = String(node.brand.name).trim();
              if (!v.builder && node.manufacturer?.name) v.builder = String(node.manufacturer.name).trim();
              const offers = node.offers;
              if (offers?.price && !v.price) {
                const p = Number(offers.price);
                const c = String(offers.priceCurrency || "USD");
                v.price = c === "EUR" ? `€${p.toLocaleString("en-US")}` : `$${p.toLocaleString("en-US")}`;
              }
              // Location from offer
              const addr = offers?.availableAtOrFrom?.address;
              if (addr && !v.location) {
                v.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(", ");
              }
              // additionalProperty specs
              const props = Array.isArray(node.additionalProperty) ? node.additionalProperty : [];
              for (const prop of props) {
                if (prop.name && prop.value) _assignFromProp(v, prop.name, String(prop.value));
              }
              // Images from JSON-LD
              const imgs = Array.isArray(node.image) ? node.image : node.image ? [node.image] : [];
              for (const img of imgs) {
                const src = typeof img === "string" ? img : img?.url || "";
                if (src && src.startsWith("http") && !/logo|icon|sprite/i.test(src))
                  images.push({ src: _upscale(src), alt: "" });
              }
            }
          }
        } catch { /* skip malformed */ }
      });

      // 2. Meta tags fallback
      const metaP = (n: string) => doc.querySelector(`meta[property="${n}"]`)?.getAttribute("content") || "";
      const metaN = (n: string) => doc.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || "";
      if (!v.name)     v.name        = metaP("og:title")       || metaN("title")       || "";
      if (!v.description) v.description = metaP("og:description") || metaN("description") || "";
      if (!v.price) {
        const ogPrice = metaP("product:price:amount") || metaP("og:price:amount");
        if (ogPrice) {
          const c = metaP("product:price:currency") || "USD";
          v.price = c === "EUR" ? `€${Number(ogPrice).toLocaleString("en-US")}` : `$${Number(ogPrice).toLocaleString("en-US")}`;
        }
      }
      const ogImg = metaP("og:image");
      if (ogImg && !images.some(i => i.src === ogImg)) images.push({ src: _upscale(ogImg), alt: "" });

      // 3. All boatsgroup CDN image tags (data-src, src, srcset)
      const seen = new Set(images.map(i => i.src));
      doc.querySelectorAll("img[data-src], img[src]").forEach(img => {
        const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
        if (/boatsgroup\.com/i.test(src) && !/logo|icon|sprite/i.test(src)) {
          const up = _upscale(src);
          if (!seen.has(up)) { seen.add(up); images.push({ src: up, alt: "" }); }
        }
      });
      // Also sweep raw HTML for any missed boatsgroup URLs (they may be in JS/next data)
      const bgRx = /https:\/\/images\.boatsgroup\.com\/resize\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)[^\s"'<>]*/gi;
      let m: RegExpExecArray | null;
      while ((m = bgRx.exec(raw)) !== null) {
        const up = _upscale(m[0]);
        if (!seen.has(up) && !/logo|icon|sprite/i.test(up)) { seen.add(up); images.push({ src: up, alt: "" }); }
      }

      // 4. DOM spec tables
      doc.querySelectorAll("dt").forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd?.tagName === "DD") _assignFromProp(v, dt.textContent || "", dd.textContent || "");
      });
      doc.querySelectorAll("table tr").forEach(row => {
        const cells = row.querySelectorAll("th, td");
        if (cells.length >= 2) _assignFromProp(v, cells[0].textContent || "", cells[1].textContent || "");
      });

      // 5. Location from URL or page
      if (!v.location) {
        const locEl = doc.querySelector("[class*='location'], [data-testid*='location']");
        if (locEl) v.location = (locEl.textContent || "").trim();
      }

      // 6. Year from name or page title if not yet found
      if (!v.year) {
        const yearM = (v.name || "").match(/\b(19[5-9]\d|20[0-4]\d)\b/);
        if (yearM) v.year = parseInt(yearM[1]);
      }

    } else {
      // ── Plain text path: enhanced regex extraction ──────────────────────
      const text = raw;
      const grab = (p: RegExp) => { const m = text.match(p); return m ? m[1].trim().replace(/\s+/g, " ") : ""; };
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

      // Name: first short non-header line
      for (const line of lines) {
        if (line.length > 3 && line.length < 60 &&
            !/^(SPECIFICATIONS|HIGHLIGHTS|ELECTRICAL|ELECTRONICS|MACHINERY|GALLEY|SAFETY|REFIT|MISC|DECK|ANCHOR|COMMUNICATION)/i.test(line) &&
            !/^(Yacht Details|Location:|Engines:|Last Updated|Asking Price|Maximum Speed|Max Draft|Cruising|Beam:|Hull|Fuel|Fresh|Holding)/i.test(line)) {
          v.name = line.trim(); break;
        }
      }

      const yearM = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/); if (yearM) v.year = parseInt(yearM[1]);
      const priceM = text.match(/(?:Asking Price[^$€£\d]*)(US\$[\d,]+|\$[\d,]+|€[\d,]+)/i) || text.match(/\b(US\$[\d,]+|\$[\d,]+|€[\d,]+)\b/);
      if (priceM) v.price = priceM[1];
      const locM = text.match(/Location:\s*([^\n]{3,50})/i); if (locM) v.location = locM[1].trim();

      const loaM = grab(/(?:LOA|Length[^:\n]{0,20}):\s*([\d.]+\s*(?:m|ft|')(?:\s*[\d"]+)?)/i); if (loaM) v.loa = loaM;
      const beamM = grab(/Beam:\s*([\d'."\s]+(?:ft|m)?)/i); if (beamM) v.beam = beamM;
      const draftM = grab(/(?:Max Draft|Draft|Draught):\s*([\d'."\s]+(?:ft|m)?)/i); if (draftM) v.draft = draftM;
      const hullM = grab(/Hull(?:\s+Material)?:\s*([^\n]{2,40})/i); if (hullM) v.hullMaterial = hullM;
      const maxSpdM = grab(/(?:Maximum|Max)\s+Speed:\s*([\d.]+\s*kn(?:ots?)?)/i); if (maxSpdM) v.maxSpeed = maxSpdM;
      const cSpdM = grab(/Cruising\s+Speed:\s*([\d.]+\s*kn(?:ots?)?)/i); if (cSpdM) v.cruiseSpeed = cSpdM;
      const engM = grab(/Engines?:\s*([^\n]{2,80})/i); if (engM) v.engines = engM;
      const hrM = text.match(/Engine\s+Hours[^:\n]*:\s*([\d,]+)/i); if (hrM) v.engineHours = hrM[1];
      const guestsM = grab(/(?:Max\s+Passengers?|Guests?):\s*(\d+)/i); if (guestsM) v.guests = guestsM;
      const cabinsM = grab(/(?:Cabins?|Staterooms?):\s*(\d+)/i); if (cabinsM) v.staterooms = cabinsM;

      // Tanks
      const fuelM = text.match(/Fuel\s*(?:Tank)?:\s*(?:\d+\s*x\s*)?([\d,]+)\s*[|]?\s*(?:gallon|gal|lt|litre)/i);
      if (fuelM) v.fuelTank = `${fuelM[1].replace(/,/g,"")} gal`;
      const fwM = text.match(/Fresh\s*Water:\s*(?:\d+\s*x\s*)?([\d,]+)\s*[|]?\s*(?:gallon|gal|lt)/i);
      if (fwM) v.freshWater = `${fwM[1].replace(/,/g,"")} gal`;
      const holdM = text.match(/Holding(?:\s*Tank)?:\s*(?:\d+\s*x\s*)?([\d,]+)\s*[|]?\s*(?:gallon|gal|lt)/i);
      if (holdM) v.holdingTank = `${holdM[1].replace(/,/g,"")} gal`;

      // Nav/safety
      const radarM = text.match(/Radar[^:\n]*[-:]\s*([^\n]{3,60})/i); if (radarM) v.radar = radarM[1].trim();
      const apM = text.match(/Autopilot[^:\n]*[-:]\s*([^\n]{3,60})/i); if (apM) v.autopilot = apM[1].trim();
      if (/Starlink/i.test(text)) v.satcom = "Starlink";
      const bowM = grab(/Bow\s+(?:and\s+Stern\s+)?Thruster[s]?[^:\n]*-?\s*([^\n]{3,80})/i); if (bowM) v.bowThruster = bowM;

      // Description: longest prose paragraph
      const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 80 && /\b(the|and|with|its)\b/i.test(p));
      if (paras.length) v.description = paras[0].slice(0, 800);

      // boatsgroup images from plain text
      const bgRx = /https:\/\/images\.boatsgroup\.com\/[^\s"')]+\.(?:jpg|jpeg|png|webp)/gi;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = bgRx.exec(text)) !== null) {
        const up = _upscale(m[0]);
        if (!seen.has(up) && !/logo|icon|sprite/i.test(up)) { seen.add(up); images.push({ src: up, alt: "" }); }
      }
    }

    const fieldCount = Object.keys(v).filter(k => (v as Record<string,unknown>)[k]).length;
    if (fieldCount === 0 && images.length === 0) {
      showToast("Couldn't extract data. For best results: open the listing → Right-click → View Page Source → CMD+A → CMD+C → paste here", "error");
      return;
    }

    const base = vessel || ({ name: "", builder: "", year: null, location: "", price: "", loa: "", beam: "", draft: "", description: "", images: [], features: [], sourceUrl: url || "" } as unknown as VesselData);
    const merged: VesselData = { ...base };
    for (const [k, val] of Object.entries(v)) {
      if (k === "images") continue;
      const existing = (merged as Record<string,unknown>)[k];
      if (!existing || existing === "" || existing === null || existing === 0)
        (merged as Record<string,unknown>)[k] = val;
    }
    if (images.length) {
      const existingSrcs = new Set(merged.images.map(i => i.src));
      merged.images = [...merged.images, ...images.filter(i => !existingSrcs.has(i.src))];
    }

    setVessel(prepVessel(merged));
    setPasteText("");
    setShowPasteImport(false);
    if (step !== "preview") setStep("preview");
    showToast(`Extracted ${fieldCount} fields${images.length ? ` · ${images.length} images` : ""}`, "success");
  }

  // ── Paste helpers ────────────────────────────────────────────────────────────
  function _upscale(src: string): string {
    return src
      .replace(/[?&]w=\d+/, m => m.replace(/\d+/, "1200"))
      .replace(/[?&]format=webp/, "").replace(/[?&]exact/, "")
      .replace(/&&+/g, "&").replace(/[?&]$/, "");
  }

  function _assignFromProp(v: Partial<VesselData>, rawLabel: string, rawVal: string) {
    const label = rawLabel.replace(/\s+/g, " ").trim().toLowerCase();
    const val = rawVal.replace(/\s+/g, " ").trim();
    if (!val || val.length > 200) return;
    const map: [RegExp, keyof VesselData][] = [
      [/\bloa\b|length\s+overall/i,           "loa"],
      [/\blwl\b|waterline\s+length/i,         "lwl"],
      [/\bbeam\b/i,                           "beam"],
      [/\bdraft\b|\bdraught\b/i,              "draft"],
      [/displacement/i,                       "displacement"],
      [/max\s*speed|maximum\s*speed|top\s*speed/i, "maxSpeed"],
      [/cruise\s*speed|cruising\s*speed/i,   "cruiseSpeed"],
      [/\brange\b/i,                          "range"],
      [/fuel\s*capacity|fuel\s*tank/i,       "fuelTank"],
      [/fresh\s*water/i,                      "freshWater"],
      [/holding\s*tank/i,                     "holdingTank"],
      [/hull\s*material|hull\s*type/i,       "hullMaterial"],
      [/\bstaterooms?\b|\bcabins?\b/i,        "staterooms"],
      [/\bguests?\b|passengers?/i,            "guests"],
      [/\bcrew\b/i,                           "crew"],
      [/gross\s*tonnage/i,                    "grossTonnage"],
      [/\bengines?\b/i,                       "engines"],
      [/bow\s*thruster/i,                     "bowThruster"],
      [/stern\s*thruster/i,                   "sternThruster"],
      [/generators?|gensets?/i,               "gensets"],
      [/shore\s*power/i,                      "shorepower"],
      [/air\s*condit/i,                       "airCon"],
      [/\blocation\b/i,                       "location"],
      [/\bprice\b|asking\s*price/i,           "price"],
      [/hull\s*form|hull\s*type/i,            "hullForm"],
      [/\bpropulsion\b/i,                     "propulsion"],
    ];
    for (const [pat, field] of map) {
      if (pat.test(label)) {
        const existing = (v as Record<string,unknown>)[field as string];
        if (!existing) (v as Record<string,unknown>)[field as string] = val;
        break;
      }
    }
  }

  /* ── Hidden fields ── */
  function hideField(key: string) { setHiddenFields(prev => new Set([...prev, key])); }
  function restoreGroup(keys: string[]) { setHiddenFields(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; }); }
  function restoreAll() { setHiddenFields(new Set()); }

  /* ── Live preview ── */
  function triggerLivePreview(v: VesselData) {
    if (!livePreview) return;
    if (previewDebounce.current) clearTimeout(previewDebounce.current);
    previewDebounce.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/brochures/render", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vessel: v }),
        });
        const d = await res.json();
        if (d.ok) setPreviewHtml(d.html);
      } catch { /* silent */ }
      finally { setPreviewLoading(false); }
    }, 800);
  }

  /* ── Draft save / load ── */
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ vessel, hiddenFields: [...hiddenFields], savedAt: new Date().toISOString() }));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch { showToast("Could not save draft", "error"); }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) { showToast("No saved draft found", "error"); return; }
      const d = JSON.parse(raw);
      if (d.vessel) { setVessel(d.vessel); setStep("preview"); }
      if (d.hiddenFields) setHiddenFields(new Set(d.hiddenFields));
      const when = d.savedAt ? new Date(d.savedAt).toLocaleString() : "unknown";
      showToast(`Draft loaded (saved ${when})`);
    } catch { showToast("Could not load draft", "error"); }
  }

  /* ── Edit existing brochure ── */
  async function loadForEdit(b: Brochure) {
    if (!b.id) return;
    try {
      const res = await fetch(`/api/brochures/render?id=${b.id}`);
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Load failed");
      setVessel(prepVessel(d.vessel));
      setEditingId(b.id);
      setIsPocket(b.is_pocket_listing === 1 || b.isPocket === true);
      setHiddenFields(new Set());
      setStep("preview");
      showToast(`Editing: ${b.title}`);
    } catch (err) { showToast(`Could not load brochure: ${err instanceof Error ? err.message : "unknown"}`, "error"); }
  }

  /* ── Update existing brochure ── */
  const allBrokers = [
    { name:"Will Noftsinger", title:"Yacht Broker · Build Consultant of The Americas", email:"WN@DenisonYachting.com", mobile:"850.461.3342", office:"Denison Yachting · Fort Lauderdale, FL", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg", instagram:"@yachtslinger" },
    { name:"Paolo Ameglio",   title:"Yacht Broker · Superyacht Division",              email:"PGA@DenisonYachting.com", mobile:"786.251.2588", office:"Denison Yachting · Fort Lauderdale, FL", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg" },
    { name:"Peter Quintal",   title:"Yacht Broker · Superyacht Division",              email:"Peter@DenisonYachting.com", mobile:"954.817.5662", office:"Denison Yachting · Fort Lauderdale, FL", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/6855b2c3e4f81.jpg" },
  ];

  async function handleUpdate() {
    if (!editingId || !vessel) return;
    setStep("saving");
    try {
      const publishVessel = {
        ...vessel,
        fuelTank:    formatCapacityClient(vessel.fuelTank    || ""),
        freshWater:  formatCapacityClient(vessel.freshWater  || ""),
        holdingTank: formatCapacityClient(vessel.holdingTank || ""),
      };
      const res = await fetch("/api/brochures", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, vessel: publishVessel, brokers: allBrokers.filter(b => selectedBrokers.has(b.name)), isPocket }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      await fetchBrochures();
      setStep("list");
      setEditingId(null);
      showToast(`Brochure updated for "${vessel.name}"`);
    } catch (err) {
      showToast(`Update failed: ${err instanceof Error ? err.message : "unknown"}`, "error");
      setStep("preview");
    }
  }

  function updateField(key: keyof VesselData, value: string) {
    setVessel(v => {
      const next = v ? { ...v, [key]: value } : v;
      if (next) triggerLivePreview(next);
      return next;
    });
  }

  function blurField(key: keyof VesselData, value: string) {
    // Auto-convert tank fields to metric/imperial on blur
    if (TANK_KEYS.has(key as string)) {
      const formatted = formatCapacityClient(value);
      if (formatted !== value) {
        setVessel(v => v ? { ...v, [key]: formatted } : v);
      }
    }
  }

  function removeImage(idx: number) {
    setVessel(v => v ? { ...v, images: v.images.filter((_, i) => i !== idx) } : v);
  }

  function moveImage(from: number, to: number) {
    setVessel(v => {
      if (!v) return v;
      const imgs = [...v.images];
      const [item] = imgs.splice(from, 1);
      imgs.splice(to, 0, item);
      return { ...v, images: imgs };
    });
  }

  function setImageCategory(idx: number, category: string) {
    setVessel(v => {
      if (!v) return v;
      const imgs = v.images.map((img, i) => i === idx ? { ...img, category } : img);
      return { ...v, images: imgs };
    });
  }

  function addDropboxImages(urls: string[]) {
    setVessel(v => {
      if (!v) return v;
      const existing = new Set(v.images.map(i => i.src));
      const newImgs = urls.filter(u => !existing.has(u)).map(u => ({ src: u, alt: "" }));
      return { ...v, images: [...v.images, ...newImgs] };
    });
  }

  function addGaImageUrls(rawUrls: string) {
    const lines = rawUrls.split(/[\n,]/).map(s => s.trim()).filter(s => s.startsWith("http"));
    if (!lines.length) return;
    setVessel(v => {
      if (!v) return v;
      const existing = new Set((v.gaImages || []).map((i: {src:string}) => i.src));
      const newGa = lines.filter(u => !existing.has(u)).map(u => ({ src: u, alt: "General Arrangement" }));
      return { ...v, gaImages: [...(v.gaImages || []), ...newGa] };
    });
  }

  function removeGaImage(idx: number) {
    setVessel(v => v ? { ...v, gaImages: (v.gaImages || []).filter((_: unknown, i: number) => i !== idx) } : v);
  }

  function addVideo(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    let url = trimmed;
    const ytWatch = trimmed.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/);
    const ytShort = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]+)/);
    if (ytWatch) url = `https://www.youtube.com/embed/${ytWatch[1]}`;
    else if (ytShort) url = `https://www.youtube.com/embed/${ytShort[1]}`;
    const type = url.includes("youtube.com") ? "youtube"
               : url.includes("vimeo.com") ? "vimeo"
               : url.includes("mediadelivery.net") ? "bunny" : "other";
    setVessel(v => {
      if (!v) return v;
      if ((v.videos || []).some(vid => vid.url === url)) return v;
      return { ...v, videos: [...(v.videos || []), { url, type }] };
    });
  }

  function removeVideo(idx: number) {
    setVessel(v => v ? { ...v, videos: (v.videos || []).filter((_, i) => i !== idx) } : v);
  }

  async function uploadImage(file: File, target: "main" | "ga") {
    if (!file.type.startsWith("image/")) { showToast("Please select an image file", "error"); return; }
    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/listings/upload", { method: "POST", body: form });
      const d = await res.json();
      if (d.ok && d.files?.[0]?.url) {
        const fullUrl = `https://yotcrm-production.up.railway.app${d.files[0].url}`;
        if (target === "main") {
          setVessel(v => v ? { ...v, images: [...v.images, { src: fullUrl, alt: "" }] } : v);
        } else {
          setVessel(v => v ? { ...v, gaImages: [...(v.gaImages || []), { src: fullUrl, alt: "General Arrangement" }] } : v);
        }
        showToast("Image uploaded");
      } else throw new Error(d.error || "Upload failed");
    } catch (err) { showToast(err instanceof Error ? err.message : "Upload failed", "error"); }
  }

  function addImageUrl(url: string, target: "main" | "ga") {    const trimmed = url.trim();
    if (!trimmed || !trimmed.startsWith("http")) { showToast("Enter a valid image URL", "error"); return; }
    if (target === "main") {
      setVessel(v => {
        if (!v) return v;
        const exists = v.images.some(i => i.src === trimmed);
        return exists ? v : { ...v, images: [...v.images, { src: trimmed, alt: "" }] };
      });
    } else {
      setVessel(v => {
        if (!v) return v;
        const exists = (v.gaImages || []).some(i => i.src === trimmed);
        return exists ? v : { ...v, gaImages: [...(v.gaImages || []), { src: trimmed, alt: "General Arrangement" }] };
      });
    }
  }

  async function handlePublish() {
    if (editingId) return handleUpdate();
    setStep("saving");
    try {
      // Pre-format all tank fields before saving so the brochure always has
      // clean metric/imperial values even if the user typed a bare number
      const publishVessel = vessel ? {
        ...vessel,
        fuelTank:    formatCapacityClient(vessel.fuelTank    || ""),
        freshWater:  formatCapacityClient(vessel.freshWater  || ""),
        holdingTank: formatCapacityClient(vessel.holdingTank || ""),
      } : vessel;

      const brokers = allBrokers.filter(b => selectedBrokers.has(b.name));
      const res = await fetch("/api/brochures/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vessel: publishVessel, brokers, isPocket }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setNewSlug(data.slug);
      setUrls(["", ""]); setVessel(null);
      await fetchBrochures();
      setStep("list");
      showToast(`Brochure published for "${data.vesselName}"`);
    } catch (err) {
      showToast(`Publish failed: ${err instanceof Error ? err.message : "unknown error"}`, "error");
      setStep("preview");
    }
  }

  async function handleDelete(b: Brochure) {
    if (!confirm(`Delete brochure for "${b.title}"?`)) return;
    if (!b.id) return;
    setDeleting(b.id);
    try {
      await fetch(`/api/brochures?id=${b.id}`, { method: "DELETE" });
      await fetchBrochures();
      showToast("Brochure deleted");
    } catch { showToast("Delete failed", "error"); }
    setDeleting(null);
  }

  async function copyLink(slug: string) {
    const link = `${window.location.origin}/brochures/${slug}`;
    const copied = await (async () => {
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(link); return true; } catch { /* fall through */ }
      }
      // Fallback: textarea + execCommand
      const el = document.createElement("textarea");
      el.value = link; el.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(el); el.focus(); el.select();
      try { document.execCommand("copy"); document.body.removeChild(el); return true; } catch { document.body.removeChild(el); return false; }
    })();
    if (copied) showToast("Link copied to clipboard");
    else window.prompt("Copy link:", link);
  }

  const tagColor = (tag: string) => {
    if (tag === "New Build") return { bg: "rgba(16,185,129,0.12)", color: "#059669" };
    if (tag === "Interior")  return { bg: "rgba(139,92,246,0.12)", color: "#7c3aed" };
    if (tag === "Generated") return { bg: "rgba(212,175,96,0.12)", color: "var(--brass-400)" };
    return { bg: "rgba(201,165,92,0.12)", color: "var(--brass-400)" };
  };

  // ── Preview / Edit ──────────────────────────────────────────────────────────
  if ((step === "preview" || step === "saving") && vessel) {
    const isEditing = editingId !== null;
    return (
      <PageShell
        title={vessel.name || (isEditing ? "Edit Brochure" : "New Brochure")}
        subtitle={isEditing ? `✏️ Editing saved brochure — changes update the live page` : `✏️ Review and edit — then Publish when ready`}
        breadcrumb={[{ label: "E-Brochures", href: "/brochures" }]}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button className="btn-ghost flex items-center gap-1.5 text-sm" onClick={() => { setStep("list"); setVessel(null); setEditingId(null); }} disabled={step === "saving"}>
              <ArrowLeft className="w-4 h-4" /> Cancel
            </button>
            <button onClick={()=>setLivePreview(v=>!v)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all ${livePreview?"border-[var(--brass-400)] text-[var(--brass-400)] bg-[rgba(184,147,58,.08)]":"border-[var(--border)] text-[var(--navy-400)] hover:border-[var(--brass-400)]"}`}>
              <Eye className="w-4 h-4" />{livePreview?"Hide Preview":"Live Preview"}
            </button>
            <button onClick={saveDraft}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-all ${draftSaved?"border-green-500 text-green-600 bg-green-50":"border-[var(--border)] text-[var(--navy-400)] hover:border-green-400"}`}>
              {draftSaved ? "✓ Saved!" : "Save Draft"}
            </button>
            <button onClick={restoreAll} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--navy-400)] hover:border-[var(--brass-400)]">
              Restore Hidden Fields
            </button>
            <button className="btn-primary flex items-center gap-2 text-sm" onClick={handlePublish} disabled={step === "saving"}>
              {step === "saving"
                ? <span className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</span>
                : <span className="flex items-center gap-2"><Eye className="w-4 h-4" />{isEditing ? "Update Brochure" : "Publish Brochure"}</span>}
            </button>
          </div>
        }
      >
        {/* ── Paste enrichment panel — always available in editor, auto-open when no images ── */}
        <div className="rounded-xl mb-4 overflow-hidden" style={{ border: `1px solid ${showPasteImport || vessel.images.length === 0 ? "rgba(184,147,58,.5)" : "var(--border)"}`, background: "var(--card)" }}>
          <button
            onClick={() => setShowPasteImport(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[rgba(184,147,58,.04)]"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>
                  Paste Page Source
                </span>
                <span className="text-xs ml-2" style={{ color: "var(--navy-400)" }}>
                  — for YachtWorld &amp; Cloudflare-blocked sites
                </span>
              </div>
              {vessel.images.length === 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold ml-2" style={{ background: "rgba(245,158,11,.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.35)" }}>
                  No images yet — enrich here
                </span>
              )}
            </div>
            <span className="text-lg" style={{ color: "var(--navy-400)" }}>{showPasteImport ? "−" : "+"}</span>
          </button>
          {(showPasteImport || vessel.images.length === 0) && (
            <div className="px-5 pb-5">
              <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(14,165,233,.08)", border: "1px solid rgba(14,165,233,.25)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "#38bdf8" }}>🏆 Best method — View Page Source (gets images + all specs)</p>
                <p className="text-xs" style={{ color: "var(--navy-400)" }}>
                  1. Open the listing in your browser &nbsp;→&nbsp;
                  2. <strong>Right-click → View Page Source</strong> (or <strong>CMD+OPT+U</strong>) &nbsp;→&nbsp;
                  3. <strong>CMD+A → CMD+C</strong> &nbsp;→&nbsp; paste below
                </p>
              </div>
              <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(100,116,139,.08)", border: "1px solid rgba(100,116,139,.2)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--navy-300)" }}>Alternative — Select All Text (specs + price, no images)</p>
                <p className="text-xs" style={{ color: "var(--navy-400)" }}>
                  Open the listing in your browser &nbsp;→&nbsp; <strong>CMD+A → CMD+C</strong> &nbsp;→&nbsp; paste below
                </p>
              </div>
              <textarea
                className="w-full rounded-lg text-xs p-3 font-mono resize-y mb-3"
                style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)", height: 120 }}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste raw HTML (from View Source) or plain page text here…"
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePasteImport}
                  disabled={!pasteText.trim()}
                  className="text-sm px-4 py-2 rounded-lg font-semibold transition-all"
                  style={{ background: pasteText.trim() ? "var(--brass-400)" : "var(--border)", color: pasteText.trim() ? "#fff" : "var(--navy-400)", cursor: pasteText.trim() ? "pointer" : "default" }}>
                  Extract &amp; Merge
                </button>
                <button
                  onClick={() => { setPasteText(""); setShowPasteImport(false); }}
                  className="text-sm px-4 py-2 rounded-lg border"
                  style={{ borderColor: "var(--border)", color: "var(--navy-400)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Images */}
        <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>
              Photos <span className="font-normal normal-case tracking-normal" style={{ color: "var(--navy-400)" }}>— {vessel.images.length} total · first is hero · reorder freely</span>
            </p>
            <div className="flex gap-2">
              {isOceanKing && (
                <button onClick={() => setShowDropbox(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(184,147,58,.12)", border: "1px solid rgba(184,147,58,.35)", color: "var(--brass-400)" }}>
                  <svg width="12" height="12" viewBox="0 0 40 40" fill="currentColor"><path d="M20 8.571L10 15.714 20 22.857l-10 7.143L0 22.857l10-7.143L0 8.571 10 1.429zM10 31.429L20 24.286l10 7.143-10 7.143zM20 22.857l10-7.143 10 7.143-10 7.143zM30 15.714L20 8.571 30 1.429 40 8.571z"/></svg>
                  Dropbox
                </button>
              )}
            </div>
          </div>
          {/* All thumbnails — no cap, full ↑↓←→ movement */}
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>Click TAG on any photo to label it:</span>
            {[{k:"exterior",c:"#0ea5e9",l:"Exterior"},{k:"interior",c:"#a78bfa",l:"Interior"},{k:"technical",c:"#34d399",l:"Technical"}].map(t=>(
              <span key={t.k} className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${t.c}22`, color: t.c, border: `1px solid ${t.c}55` }}>{t.l}</span>
            ))}
          </div>
          <ImageGrid images={vessel.images} onMove={moveImage} onRemove={removeImage} onCategory={setImageCategory} />
          {/* Add image — URL or upload */}
          <ImageAdder onUrl={url => addImageUrl(url, "main")} onUpload={f => uploadImage(f, "main")} placeholder="https://example.com/photo.jpg" />
        </div>

        {/* GA Images */}
        <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--brass-400)" }}>General Arrangement Drawings</p>
          <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>Deck plans, layout drawings, and GA diagrams — shown full-width in their own section so clients can study the layout.</p>
          {url2Warning && (
            <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}>{url2Warning}</p>
          )}
          {vessel.gaImages && vessel.gaImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {vessel.gaImages.map((img: {src:string;alt:string}, i: number) => (
                <div key={i} className="relative rounded overflow-hidden flex-shrink-0" style={{ width: 200, height: 120, background: "var(--navy-800,#0f172a)" }}>
                  <img src={img.src} alt="" className="w-full h-full object-contain block" style={{ background: "#fff" }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
                  <div className="absolute top-1 left-1 right-1 flex justify-between items-center">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}>GA {i+1}</span>
                    <button onClick={() => removeGaImage(i)} className="w-5 h-5 flex items-center justify-center rounded text-[10px] text-white" style={{ background: "rgba(180,0,0,.7)" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ImageAdder onUrl={url => addImageUrl(url, "ga")} onUpload={f => uploadImage(f, "ga")} placeholder="https://example.com/general-arrangement.jpg" multi />
        </div>

        {/* Videos */}
        <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--brass-400)" }}>Videos</p>
          <p className="text-xs mb-3" style={{ color: "var(--navy-400)" }}>YouTube, Vimeo, or Bunny CDN links — shown in their own section in the brochure.</p>
          {/* Scraped + added videos */}
          {vessel.videos && vessel.videos.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {vessel.videos.map((vid, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-2" style={{ background: "var(--navy-800,#0f172a)", border: "1px solid var(--border)" }}>
                  {vid.thumbnail && (
                    <img src={vid.thumbnail} alt="" className="w-20 h-12 rounded object-cover flex-shrink-0"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  {!vid.thumbnail && (
                    <div className="w-20 h-12 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--navy-950,#020c1b)" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brass-400)" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase font-bold mb-0.5" style={{ color: "var(--brass-400)" }}>{vid.type}</div>
                    <div className="text-xs truncate" style={{ color: "var(--navy-300)" }}>{vid.url}</div>
                  </div>
                  <button onClick={() => removeVideo(i)} className="w-6 h-6 flex items-center justify-center rounded text-[11px] flex-shrink-0"
                    style={{ background: "rgba(180,0,0,.25)", color: "#f87171" }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Add video URL */}
          <VideoAdder onAdd={addVideo} />
        </div>

        {/* Description */}
        <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--brass-400)" }}>Description</p>
          <textarea
            className="w-full rounded-lg text-sm p-3 resize-y"
            style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)", height: 100, fontFamily: "inherit" }}
            value={vessel.description || ""}
            onChange={e => updateField("description", e.target.value)}
            placeholder="Vessel description shown in the overview section…"
          />
        </div>

        {/* Live preview panel */}
        {livePreview && (
          <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--navy-950,#020c1b)", color:"#fff" }}>
              <span className="text-xs font-bold tracking-wide" style={{ color:"var(--brass-400)" }}>Live Preview</span>
              {previewLoading && <div className="w-4 h-4 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin" />}
              <button onClick={()=>setLivePreview(false)} className="text-xs px-2 py-1 rounded" style={{ background:"rgba(255,255,255,.1)" }}>✕ Close</button>
            </div>
            {previewHtml
              ? <iframe title="brochure-preview" srcDoc={previewHtml} className="w-full bg-white" style={{ height: 560, border: "none" }} />
              : <div className="flex items-center justify-center py-10 text-xs" style={{ color:"var(--navy-400)" }}>Edit any field to see the preview</div>}
          </div>
        )}

        {/* Spec groups */}
        {FIELD_GROUPS.map(group => {
          const visibleFields = group.fields.filter(f => !hiddenFields.has(f.key as string));
          const hiddenCount = group.fields.length - visibleFields.length;
          return (
            <div key={group.label} className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brass-400)" }}>{group.label}</p>
                {hiddenCount > 0 && (
                  <button onClick={() => restoreGroup(group.fields.map(f => f.key as string))}
                    className="text-[10px] px-2 py-1 rounded" style={{ background:"rgba(184,147,58,.12)", color:"var(--brass-400)" }}>
                    +{hiddenCount} hidden — restore
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {visibleFields.map(f => {
                  const isTank = TANK_KEYS.has(f.key as string);
                  const rawVal = String((vessel as Record<string,unknown>)[f.key as string] || "");
                  const converted = isTank ? formatCapacityClient(rawVal) : "";
                  const showHint = isTank && converted && converted !== rawVal && rawVal.length > 0;
                  return (
                    <div key={f.key} className="group relative">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] uppercase tracking-wider" style={{ color: "var(--navy-400)" }}>{f.label}</label>
                        <button onClick={() => hideField(f.key as string)}
                          title="Hide this field"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background:"rgba(180,0,0,.15)", color:"#f87171" }}>✕</button>
                      </div>
                      <input
                        className="w-full rounded-lg text-sm p-2.5"
                        style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        value={rawVal}
                        onChange={e => updateField(f.key, e.target.value)}
                        onBlur={e => blurField(f.key, e.target.value)}
                        placeholder={isTank ? "e.g. 50.000 lt. or 13,209 gal" : "—"}
                      />
                      {showHint && <p className="text-[10px] mt-1" style={{ color: "var(--brass-400)" }}>→ {converted}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Broker selector */}
        <div className="rounded-xl p-5 mb-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--brass-400)" }}>Brokers on This Brochure</p>
          <p className="text-xs mb-4" style={{ color: "var(--navy-400)" }}>Select who appears in the contact section of the published brochure.</p>

          {/* Pocket listing toggle */}
          <div
            onClick={() => setIsPocket(p => !p)}
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-4 transition-all"
            style={{ background: isPocket ? "rgba(184,147,58,.08)" : "rgba(255,255,255,.03)", border: `1px solid ${isPocket ? "rgba(184,147,58,.5)" : "var(--border)"}` }}>
            <div className="w-9 h-5 rounded-full relative flex-shrink-0 transition-all"
              style={{ background: isPocket ? "var(--brass-400)" : "rgba(255,255,255,.15)" }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                style={{ left: isPocket ? "calc(100% - 18px)" : 2 }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: isPocket ? "var(--brass-400)" : "var(--foreground)" }}>
                Pocket / Off-Market Listing
              </div>
              <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>
                {isPocket
                  ? "This brochure will appear on the off-market listings page — share via e-brochure link or PDF"
                  : "Mark this as a pocket listing to feature it on the off-market page"}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { name:"Will Noftsinger", title:"Yacht Broker · Build Consultant of The Americas", email:"WN@DenisonYachting.com", mobile:"850.461.3342", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg" },
              { name:"Paolo Ameglio",   title:"Yacht Broker · Superyacht Division",              email:"PGA@DenisonYachting.com", mobile:"786.251.2588", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg" },
              { name:"Peter Quintal",  title:"Yacht Broker · Superyacht Division",              email:"Peter@DenisonYachting.com", mobile:"954.817.5662", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/6855b2c3e4f81.jpg" },
            ].map(b => {
              const on = selectedBrokers.has(b.name);
              return (
                <div key={b.name}
                  onClick={() => setSelectedBrokers(prev => { const n=new Set(prev); on?n.delete(b.name):n.add(b.name); return n; })}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{ background: on ? "rgba(184,147,58,.08)" : "transparent", border: `1px solid ${on ? "rgba(184,147,58,.4)" : "var(--border)"}` }}>
                  <img src={b.photo} alt={b.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" style={{ border: `2px solid ${on ? "var(--brass-400)" : "var(--border)"}` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: on ? "var(--brass-400)" : "var(--foreground)" }}>{b.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>{b.title}</div>
                    <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>{b.email} · {b.mobile}</div>
                  </div>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: on ? "var(--brass-400)" : "transparent", border: `2px solid ${on ? "var(--brass-400)" : "var(--border)"}` }}>
                    {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2 pb-10">
          <button className="btn-ghost text-sm" onClick={() => { setStep("list"); setVessel(null); setEditingId(null); }} disabled={step === "saving"}>Cancel</button>
          <button onClick={loadDraft} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor:"var(--border)", color:"var(--navy-400)" }}>Load Draft</button>
          <button onClick={saveDraft} className={`text-sm px-4 py-2 rounded-lg border transition-all ${draftSaved?"border-green-500 text-green-600":"border-[var(--border)] text-[var(--navy-400)]"}`}>
            {draftSaved ? "✓ Saved!" : "Save Draft"}
          </button>
          <button className="btn-primary flex items-center gap-2 text-sm px-6" onClick={handlePublish} disabled={step === "saving"}>
            {step === "saving" ? "Saving…" : (editingId ? "Update Brochure →" : "Publish Brochure →")}
          </button>
        </div>
        {/* Dropbox image picker — only shown for Ocean King brochures */}
        {showDropbox && (
          <DropboxImagePicker
            onAdd={addDropboxImages}
            onClose={() => setShowDropbox(false)}
          />
        )}
      </PageShell>
    );
  }

  // ── List ────────────────────────────────────────────────────────────────────
  return (
    <PageShell
      title="E-Brochures"
      subtitle={`${brochures.length} brochure${brochures.length !== 1 ? "s" : ""} available`}
      actions={
        <button onClick={fetchBrochures} className="btn-ghost flex items-center gap-1.5 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      }
    >
      {toast && (
        <div className="fixed top-5 right-6 z-50 rounded-xl px-5 py-3 text-sm shadow-xl"
          style={{ background: toast.type === "error" ? "#450a0a" : "#052e16", border: `1px solid ${toast.type === "error" ? "#7f1d1d" : "#14532d"}`, color: "#f1f5f9" }}>
          {toast.msg}
        </div>
      )}

      {step === "scraping" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(2,8,16,.85)", backdropFilter: "blur(6px)" }}>
          <div className="rounded-2xl p-16 text-center max-w-md" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="w-10 h-10 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-lg font-semibold mb-2" style={{ color: "var(--foreground)" }}>Scraping Listing</p>
            <p className="text-sm mb-4" style={{ color: "var(--navy-400)" }}>Extracting specs and images — typically 20–40 seconds.</p>
            <p className="text-xs font-mono break-all" style={{ color: "var(--navy-300)" }}>{url}</p>
          </div>
        </div>
      )}

      {newSlug && (
        <div className="flex items-center gap-4 flex-wrap rounded-xl px-5 py-3.5 mb-5 text-sm" style={{ background: "#052e16", border: "1px solid #14532d" }}>
          <span style={{ color: "#86efac" }}>✓ Brochure published.</span>
          <a href={`/brochures/${newSlug}`} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: "var(--brass-400)" }}>View brochure →</a>
          <button className="rounded px-3 py-1 text-xs" style={{ background: "transparent", border: "1px solid #14532d", color: "#86efac" }} onClick={() => copyLink(newSlug)}>Copy link</button>
          <button className="ml-auto" style={{ background: "none", border: "none", color: "var(--navy-400)", cursor: "pointer" }} onClick={() => setNewSlug(null)}>✕</button>
        </div>
      )}

      {/* Draft loader */}
      {hasDraft && (
        <div className="rounded-xl p-4 mb-4 flex items-center justify-between gap-3" style={{ background: "rgba(184,147,58,.06)", border: "1px solid rgba(184,147,58,.3)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--brass-400)" }}>📝 Unsaved draft found</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--navy-400)" }}>You have a brochure draft in progress — resume editing it.</p>
          </div>
          <button
            onClick={() => {
              try {
                const raw = localStorage.getItem("yotcrm_brochure_draft_v1");
                if (!raw) return;
                const draft = JSON.parse(raw);
                if (draft.vessel) {
                  setVessel(prepVessel(draft.vessel));
                  setEditingId(null);
                  setIsPocket(draft.vessel.isPocket || false);
                  setHasDraft(false);
                  setStep("preview");
                  showToast("Draft loaded — continue editing");
                }
              } catch { showToast("Could not load draft", "error"); }
            }}
            className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: "var(--brass-400)", color: "#fff" }}>
            Resume Draft →
          </button>
        </div>
      )}

      {/* Generate card */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--brass-400)" }}>Generate New Brochure</p>
        <p className="text-xs mb-4" style={{ color: "var(--navy-400)" }}>Add any combination of URLs and/or a PDF — the scraper pulls from ALL sources and merges for maximum completeness.</p>

        <form onSubmit={handleBuild} className="flex flex-col gap-2 mb-3">
          {/* URL inputs — dynamic list */}
          <div className="flex flex-col gap-2 mb-2">
            {urls.map((u, i) => (
              <div key={i} className="flex gap-2 items-center">
                <div className="text-[10px] font-bold uppercase tracking-widest shrink-0 w-10" style={{ color: i === 0 ? "var(--brass-400)" : "var(--navy-400)" }}>URL {i + 1}</div>
                <input type="url" className="flex-1 rounded-lg text-sm px-3 py-2.5"
                  style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)", opacity: i === 0 ? 1 : 0.8 }}
                  placeholder={i === 0 ? "Primary listing URL — Denison, YachtWorld, BoatTrader…" : "Additional URL — cross-reference for more specs & images (optional)"}
                  value={u} onChange={e => setUrls(prev => prev.map((v, j) => j === i ? e.target.value : v))} />
                {urls.length > 2 && (
                  <button onClick={() => setUrls(prev => prev.filter((_, j) => j !== i))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-xs flex-shrink-0"
                    style={{ background: "rgba(180,0,0,.15)", color: "#f87171" }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setUrls(prev => [...prev, ""])}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg mb-3 transition-all"
            style={{ background: "rgba(184,147,58,.08)", border: "1px solid rgba(184,147,58,.25)", color: "var(--brass-400)" }}>
            <Plus className="w-3 h-3" /> Add another URL
          </button>
          {/* PDF drop zone */}
          <div className="flex gap-2 items-center">
            <div className="text-[10px] font-bold uppercase tracking-widest shrink-0 w-10" style={{ color: "var(--navy-400)" }}>PDF</div>
            <div
              className="flex-1 rounded-lg border-2 border-dashed flex items-center gap-3 cursor-pointer transition-colors px-3 py-2"
              style={{ borderColor: pendingPdf ? "var(--brass-400)" : "var(--border)", minHeight: 44,
                background: pendingPdf ? "rgba(184,147,58,.06)" : "transparent" }}
              onClick={() => pdfInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 shrink-0" style={{ color: pendingPdf ? "var(--brass-400)" : "var(--navy-400)" }} />
              <div className="flex-1 min-w-0">
                {pendingPdf
                  ? <><p className="text-sm font-medium truncate" style={{ color: "var(--brass-400)" }}>{pdfFileName}</p><p className="text-[10px]" style={{ color: "var(--navy-400)" }}>PDF staged — will be scraped with Build</p></>
                  : <><p className="text-sm" style={{ color: "var(--navy-400)" }}>Drop or click to add spec sheet / brochure PDF</p></>}
              </div>
              {pendingPdf && (
                <button type="button" onClick={e => { e.stopPropagation(); setPendingPdf(null); setPdfFileName(""); }}
                  className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(180,0,0,.15)", color: "#f87171" }}>Remove</button>
              )}
            </div>
          </div>

          <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfSelect(f); e.target.value = ""; }} />

          <button type="submit"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold mt-1 transition-all"
            style={{ background: hasAnySources ? "var(--brass-400)" : "var(--border)", color: hasAnySources ? "#fff" : "var(--navy-400)",
              cursor: hasAnySources ? "pointer" : "not-allowed" }}
            disabled={!hasAnySources || step === "scraping"}>
            {step === "scraping"
              ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{buildStatus || "Building…"}</>
              : <><Plus className="w-4 h-4" />Build Brochure</>}
          </button>
        </form>

        <p className="text-xs" style={{ color: "var(--navy-400)" }}>
          All sources are merged — URL 1 wins for text fields, others fill any gaps. More sources = more complete brochure.
        </p>
      </div>

      {/* ── Paste import for Cloudflare-blocked sites (e.g. YachtWorld) ── */}
      <div className="rounded-xl mb-6 overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <button
          onClick={() => setShowPasteImport(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          style={{ background: "transparent" }}>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--brass-400)" }}>
              📋 Paste Page Source <span className="font-normal ml-1" style={{ color: "var(--navy-400)" }}>— for YachtWorld &amp; sites that block auto-scraping</span>
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--navy-500)" }}>
              Open the listing in your browser → CMD+A → CMD+C → paste here
            </p>
          </div>
          <span className="text-lg" style={{ color: "var(--navy-400)" }}>{showPasteImport ? "−" : "+"}</span>
        </button>
        {showPasteImport && (
          <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-xs mt-3 mb-2" style={{ color: "var(--navy-400)" }}>
              1. Open the YachtWorld listing in a new tab<br />
              2. Press <strong>CMD+A</strong> to select all, then <strong>CMD+C</strong> to copy<br />
              3. Click in the box below and press <strong>CMD+V</strong> to paste
            </p>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste the full page text here…"
              rows={6}
              className="form-input w-full resize-y"
              style={{ fontSize: 13, minHeight: 100, fontFamily: "monospace" }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: pasteText.trim() ? "var(--brass-400)" : "var(--border)", color: pasteText.trim() ? "#fff" : "var(--navy-400)" }}>
                Extract &amp; Build →
              </button>
              <button onClick={() => { setPasteText(""); setShowPasteImport(false); }}
                className="px-4 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--sand-100)", color: "var(--navy-600)" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin" /></div>}

      {!loading && brochures.length === 0 && (
        <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <BookOpen className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--navy-500)" }}>No brochures yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--navy-400)" }}>Paste a listing URL above to generate your first one.</p>
        </div>
      )}

      {!loading && brochures.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brochures.map(b => {
            const tc = tagColor(b.tag);
            const isDb = b.source === "db";
            return (
              <div key={b.slug} className="rounded-xl overflow-hidden transition-shadow hover:shadow-lg" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                {/* Hero image */}
                {b.heroSrc ? (
                  <div className="w-full h-36 overflow-hidden" style={{ background: "var(--navy-900)" }}>
                    <img src={b.heroSrc} alt={b.title} className="w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }} />
                  </div>
                ) : (
                  <div className="h-1.5" style={{ background: "var(--brass-400)" }} />
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: tc.bg, color: tc.color }}>{b.tag}</span>
                        {b.year && <span className="text-[10px] font-medium" style={{ color: "var(--navy-400)" }}>{b.year}</span>}
                        {b.is_pocket_listing === 1 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(184,147,58,.15)", color: "var(--brass-400)", border: "1px solid rgba(184,147,58,.35)" }}>POCKET</span>}
                      </div>
                      <h3 className="text-base font-bold leading-snug" style={{ color: "var(--foreground)" }}>{b.title}</h3>
                      <p className="text-xs mt-0.5" style={{ color: "var(--navy-500)" }}>{b.subtitle}</p>
                      {b.builder && <p className="text-xs mt-1 font-medium" style={{ color: "var(--brass-400)" }}>{b.builder}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
                    <a href={isDb ? `/brochures/${b.slug}` : `/api/brochures/${b.slug}`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "var(--brass-400)", color: "#fff" }}>
                      <ExternalLink className="w-4 h-4" /> View
                    </a>
                    {isDb && b.id && (
                      <button onClick={() => loadForEdit(b)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: "transparent", border: "1px solid var(--brass-400)", color: "var(--brass-400)" }} title="Edit brochure">
                        ✏️ Edit
                      </button>
                    )}
                    {isDb && (
                      <button onClick={() => copyLink(b.slug)} className="flex items-center justify-center px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--navy-400)" }} title="Copy link">
                        <Link2 className="w-4 h-4" />
                      </button>
                    )}
                    {isDb && (
                      <a href={`/api/brochures/pdf?slug=${b.slug}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--navy-400)" }} title="Download PDF">
                        <FileDown className="w-4 h-4" />
                      </a>
                    )}
                    {isDb && b.id && (
                      <button onClick={() => handleDelete(b)} className="flex items-center justify-center px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "transparent", border: "1px solid var(--border)", color: "#f87171" }} title="Delete"
                        disabled={deleting === b.id}>
                        {deleting === b.id ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

/* ── ImageGrid — all images, ↑↓←→ movement, no cap ── */
/* ── ImageGrid — drag-and-drop reordering ── */
function ImageGrid({ images, onMove, onRemove, onCategory }: {
  images: { src: string; alt: string; category?: string }[];
  onMove: (from: number, to: number) => void;
  onRemove: (idx: number) => void;
  onCategory: (idx: number, cat: string) => void;
}) {
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const CATS = [
    { key: "exterior",  label: "EXT", color: "#0ea5e9" },
    { key: "interior",  label: "INT", color: "#a78bfa" },
    { key: "technical", label: "TEC", color: "#34d399" },
  ];
  function catColor(cat?: string) {
    return CATS.find(c => c.key === cat)?.color || "rgba(255,255,255,.25)";
  }

  if (!images.length) return (
    <div className="text-xs py-4 text-center" style={{ color: "var(--navy-400)" }}>No images yet — paste a URL or upload a file below</div>
  );

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {images.map((img, i) => {
        const cat    = img.category || "";
        const isOpen = expanded === i;
        const isDragging = dragIdx === i;
        const isOver     = overIdx === i && dragIdx !== i;
        return (
          <div key={i}
            draggable
            onDragStart={() => { setDragIdx(i); setExpanded(null); }}
            onDragEnter={() => setOverIdx(i)}
            onDragOver={e => { e.preventDefault(); setOverIdx(i); }}
            onDragEnd={() => {
              if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
                onMove(dragIdx, overIdx);
              }
              setDragIdx(null); setOverIdx(null);
            }}
            onDrop={e => { e.preventDefault(); }}
            className="relative rounded overflow-hidden flex-shrink-0 select-none"
            style={{
              width: 110, height: 74,
              background: "var(--navy-800,#0f172a)",
              cursor: isDragging ? "grabbing" : "grab",
              opacity: isDragging ? 0.45 : 1,
              outline: isOver ? "2px solid var(--brass-400)" : "none",
              transition: "opacity .15s, outline .1s",
            }}>
            <img src={img.src} alt="" className="w-full h-full object-cover block pointer-events-none"
              onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = "0.15"; }} />

            {/* HERO badge */}
            {i === 0 && <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold z-10 pointer-events-none"
              style={{ background: "var(--brass-400)", color: "#fff" }}>HERO</span>}

            {/* Category badge */}
            {i > 0 && !isOpen && (
              <button onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setExpanded(i); }}
                className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-bold z-10 leading-tight"
                style={{ background: cat ? catColor(cat) : "rgba(0,0,0,.45)", color: "#fff", border: `1px solid ${cat ? catColor(cat) : "rgba(255,255,255,.2)"}` }}>
                {cat ? CATS.find(c=>c.key===cat)?.label : "TAG"}
              </button>
            )}

            {/* Category picker overlay */}
            {isOpen && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1"
                style={{ background: "rgba(0,0,0,.82)" }}>
                {CATS.map(c => (
                  <button key={c.key} onMouseDown={e => e.stopPropagation()}
                    onClick={() => { onCategory(i, c.key); setExpanded(null); }}
                    className="w-16 py-0.5 rounded text-[9px] font-bold leading-tight"
                    style={{ background: cat===c.key ? c.color : "rgba(255,255,255,.1)", color: "#fff", border: `1px solid ${c.color}` }}>
                    {c.key}
                  </button>
                ))}
                <button onMouseDown={e => e.stopPropagation()}
                  onClick={() => { onCategory(i, ""); setExpanded(null); }}
                  className="w-16 py-0.5 rounded text-[9px] leading-tight"
                  style={{ background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.5)" }}>clear</button>
                <button onMouseDown={e => e.stopPropagation()} onClick={() => setExpanded(null)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded text-[9px]"
                  style={{ background: "rgba(180,0,0,.5)", color: "#fff" }}>✕</button>
              </div>
            )}

            {/* Delete button — top right */}
            <button onMouseDown={e => e.stopPropagation()} onClick={() => onRemove(i)}
              className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded z-10 text-[10px] font-bold text-white"
              style={{ background: "rgba(180,0,0,.6)" }}>✕</button>

            {/* Index badge — bottom right */}
            <span className="absolute bottom-1 right-1 text-[9px] text-white/40 pointer-events-none">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── VideoAdder ── */
function VideoAdder({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = React.useState("");
  function submit() {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal("");
  }
  return (
    <div className="flex gap-2">
      <input value={val} onChange={e => setVal(e.target.value)}
        placeholder="YouTube, Vimeo, or embed URL…"
        className="flex-1 rounded-lg text-sm px-3 py-2"
        style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        onKeyDown={e => e.key === "Enter" && submit()} />
      <button onClick={submit} className="px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
        style={{ background: "var(--brass-400)", color: "#fff" }}>Add</button>
    </div>
  );
}

/* ── ImageAdder — URL input + file upload in one row ── */
function ImageAdder({ onUrl, onUpload, placeholder, multi = false }: {
  onUrl: (url: string) => void;
  onUpload: (file: File) => void;
  placeholder: string;
  multi?: boolean;
}) {
  const [val, setVal] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try { await onUpload(file); } finally { setUploading(false); }
  }

  function submit() {
    if (!val.trim()) return;
    if (multi) {
      val.split(/[\n,]/).map(s => s.trim()).filter(s => s.startsWith("http")).forEach(onUrl);
    } else {
      onUrl(val.trim());
    }
    setVal("");
  }

  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: "var(--navy-400)" }}>Add image — paste URL or upload a file</div>
      <div className="flex gap-2">
        {multi
          ? <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} placeholder={placeholder}
              className="flex-1 rounded-lg text-sm px-3 py-2 resize-none"
              style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
          : <input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
              className="flex-1 rounded-lg text-sm px-3 py-2"
              style={{ background: "var(--input,#1e293b)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              onKeyDown={e => e.key === "Enter" && submit()} />}
        <button onClick={submit}
          className="px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
          style={{ background: "var(--brass-400)", color: "#fff" }}>Add URL</button>
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer flex-shrink-0 transition-all px-3"
          style={{ minWidth: 72, minHeight: 44, borderColor: drag ? "var(--brass-400)" : "var(--border)", background: drag ? "rgba(184,147,58,.06)" : "transparent" }}>
          {uploading
            ? <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
            : <><Upload className="w-4 h-4 mb-0.5" style={{ color: "var(--navy-400)" }} /><span className="text-[9px]" style={{ color: "var(--navy-400)" }}>Upload</span></>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
}
