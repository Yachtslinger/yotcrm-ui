// src/app/campaigns/page.tsx
"use client";
import * as React from "react";
import { useToast } from "../components/ToastProvider";
import PageShell from "../components/PageShell";

/**
 * Denison Campaign Builder v3
 * Templates: New Listing · Price Drop · Boat Show · Open House · Newsletter · Single Listing · Multi-Boat
 */

type Spec   = { label: string; value: string };
type Agent  = { name: string; title: string; email: string; cell: string; office: string; photo: string; enabled: boolean };
type BoatCard = { id: string; name: string; description: string; price: string; imageUrl: string; imageLink: string; ctaUrl: string; buildTime?: string };
type NLSection  = { id: string; heading: string; body: string };
type NLFeatured = { id: string; name: string; price: string; imageUrl: string; url: string };
type CtaButton  = { id: string; text: string; href: string; color: string };
type Mode = "New Listing" | "Price Drop" | "Boat Show" | "Open House" | "Newsletter" | "Single Listing" | "Multi-Boat Showcase";
type Contact    = { id: number; name: string; email: string; company: string; source: string; location: string };
type SendStatus = "idle" | "testing" | "sending" | "done";

const NAVY      = "#1a2b4a";
const ORANGE    = "#e57b2e";
const DARK_BLUE = "#002f6c";
const TEXT      = "#0f172a";
const GRAY      = "#4b5563";
const LABEL     = "#cbd5e1";
const GREEN     = "#16a34a";

function esc(s: string): string { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function escA(s: string): string { return s.replace(/"/g,"&quot;"); }
function ts(): string { const d=new Date(),p=(n:number)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

const RAILWAY_URL       = "https://yotcrm-production.up.railway.app";
// Convert any relative /api/... URL to absolute — emails can't use relative paths
function toAbs(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${RAILWAY_URL}${url.startsWith("/") ? url : "/" + url}`;
}
// Use absolute Railway URL for header — /email/ is now public in middleware
const DENISON_HEADER_IMG = `${RAILWAY_URL}/email/denison-header.png`;
const OFFICES = "ANNAPOLIS • BRADENTON • CHARLESTON • DANIA BEACH • DAYTONA BEACH • DESTIN • FORT LAUDERDALE • LONG BEACH • LOS ANGELES • MIAMI • MONACO • NAPLES • NEW JERSEY • NEWPORT • NEWPORT BEACH • PALM BEACH • SAN DIEGO • SAN FRANCISCO • SEATTLE • STUART";

/* ─── Template metadata ─── */
const TEMPLATES: { mode: Mode; icon: string; label: string; desc: string; color: string }[] = [
  { mode: "New Listing",       icon: "🏠", label: "New Listing",    desc: "Announce a yacht to market",       color: "#0e7490" },
  { mode: "Price Drop",        icon: "📉", label: "Price Drop",     desc: "Highlight a price reduction",      color: "#b45309" },
  { mode: "Boat Show",         icon: "⚓", label: "Boat Show",      desc: "Invite clients to a show",         color: "#7c3aed" },
  { mode: "Open House",        icon: "🔑", label: "Open House",     desc: "Private showing invitation",       color: "#0f766e" },
  { mode: "Newsletter",        icon: "📰", label: "Newsletter",     desc: "Market update & featured boats",   color: "#1d4ed8" },
  { mode: "Single Listing",    icon: "🛥️", label: "Single Listing", desc: "Full spec listing email",          color: "#374151" },
  { mode: "Multi-Boat Showcase", icon: "🚢", label: "Multi-Boat",  desc: "Showcase multiple vessels",        color: "#374151" },
];

/* ─── Defaults ─── */
function defaultAgents(): Agent[] {
  return [
    { name:"Will Noftsinger", title:"Yacht Broker, Denison Yachting", email:"WN@DenisonYachting.com",  cell:"850.461.3342",  office:"786.482.5000", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/69af22d913e91.jpg", enabled:true  },
    { name:"Paolo Ameglio",   title:"Yacht Broker, Denison Yachting", email:"PGA@DenisonYachting.com", cell:"786.251.2588",  office:"954.763.3971", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/699c8a181e92f.jpg",   enabled:false },
    { name:"Peter Quintal",   title:"Yacht Broker, Denison Yachting", email:"Peter@DenisonYachting.com",cell:"(954) 817-5662",office:"954.763.3971", photo:"https://cdn.denisonyachtsales.com/images/denison-update/users/photos/6855b2c3e4f81.jpg",   enabled:false },
  ];
}
function defaultBoat(): BoatCard { return { id:crypto.randomUUID(), name:"DOGE 500", price:"€36,800,000", description:"50M flagship of the Doge series.", imageUrl:"", imageLink:"", ctaUrl:"", buildTime:"36 Months" }; }
function defaultNLSection(): NLSection { return { id:crypto.randomUUID(), heading:"Market Update", body:"Write your market update here." }; }
function defaultNLFeatured(): NLFeatured { return { id:crypto.randomUUID(), name:"", price:"", imageUrl:"", url:"" }; }
function defaultCtaButton(): CtaButton { return { id:crypto.randomUUID(), text:"VIEW LISTING", href:"", color:ORANGE }; }

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export default function CampaignsPage(): React.ReactElement {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<Mode>("New Listing");

  /* ── Shared ── */
  const [subject,      setSubject]      = React.useState("");
  const [heroUrl,      setHeroUrl]      = React.useState("");
  const [heroLink,     setHeroLink]     = React.useState("");
  const [heroSize,     setHeroSize]     = React.useState<"100%"|"75%"|"50%"|"33%">("100%");
  const [heroPosition, setHeroPosition] = React.useState<"top"|"after-specs"|"after-desc">("top");
  const [hero2Url,     setHero2Url]     = React.useState("");
  const [hero2Link,    setHero2Link]    = React.useState("");
  const [hero2Size,    setHero2Size]    = React.useState<"100%"|"75%"|"50%"|"33%">("100%");
  const [hero2Position,setHero2Position]= React.useState<"top"|"after-specs"|"after-desc"|"after-gallery"|"bottom">("after-gallery");
  const [galleryLink,  setGalleryLink]  = React.useState("");
  const [galleryColumns,setGalleryColumns]= React.useState<1|2|3>(3);
  const [galleryPosition,setGalleryPosition]= React.useState<"after-hero"|"after-specs"|"after-desc">("after-desc");
  const [ctaText,      setCtaText]      = React.useState("VIEW ONLINE");
  const [ctaHref,      setCtaHref]      = React.useState("https://www.denisonyachtsales.com/");
  const [intro,        setIntro]        = React.useState("");
  const [agents,       setAgents]       = React.useState<Agent[]>(defaultAgents);
  const [extraButtons, setExtraButtons] = React.useState<CtaButton[]>([]);
  // Attachments — list of {name, base64, mimeType} for Resend
  const [attachments, setAttachments] = React.useState<{name:string;base64:string;mimeType:string;size:number}[]>([]);
  const attachInputRef = React.useRef<HTMLInputElement>(null);
  const enabledAgents = React.useMemo(() => agents.filter(a => a.enabled), [agents]);

  /* ── Listing (New Listing / Price Drop / Single Listing) ── */
  const [headline,     setHeadline]     = React.useState("52' Astondoa 2021");
  const [location,     setLocation]     = React.useState("AVENTURA, FL");
  const [bannerTag,    setBannerTag]    = React.useState("New Listing");
  const [price,        setPrice]        = React.useState("$875,000");
  const [wasPrice,     setWasPrice]     = React.useState("$950,000");
  const [galleryText,  setGalleryText]  = React.useState("");
  const gallery = React.useMemo(() => galleryText.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,6), [galleryText]);
  const [specs,        setSpecs]        = React.useState<Spec[]>([
    { label:"LENGTH", value:"52'" }, { label:"BEAM", value:"15' 3''" }, { label:"DRAFT", value:"4' 6''" },
    { label:"STATEROOMS", value:"3 Staterooms" }, { label:"ENGINES", value:"Volvo Penta" }, { label:"POWER", value:"725 hp" },
  ]);
  const [featuresText, setFeaturesText] = React.useState("SeaKeeper 6\nStarlink\n11' Zar Tender\nCurrent services");

  /* ── Boat Show ── */
  const [showName,   setShowName]   = React.useState("Fort Lauderdale International Boat Show");
  const [showDates,  setShowDates]  = React.useState("October 30 – November 3, 2025");
  const [showVenue,  setShowVenue]  = React.useState("Bahia Mar Yachting Center");
  const [showBooth,  setShowBooth]  = React.useState("Dock A, Slip 14");
  const [showAddress,setShowAddress]= React.useState("");
  const [showDesc,   setShowDesc]   = React.useState("Join us at FLIBS this year. We'll have a stunning lineup on display and would love to connect in person.");
  const [showCta,    setShowCta]    = React.useState("RSVP NOW");
  const [showCtaUrl, setShowCtaUrl] = React.useState("mailto:WN@DenisonYachting.com?cc=PGA@DenisonYachting.com");
  const [showSelectedId, setShowSelectedId] = React.useState<string|null>("flibs");
  const [showImportUrl,  setShowImportUrl]  = React.useState("");
  const [showImporting,  setShowImporting]  = React.useState(false);
  const [showInfoUrl,    setShowInfoUrl]    = React.useState("https://www.flibs.com");
  const [showInfoScraping, setShowInfoScraping] = React.useState(false);
  const [scrapedShowInfo,  setScrapedShowInfo]  = React.useState<{dates?:string;venue?:string;hours?:string;notes?:string}|null>(null);
  // Vessel on display at the show
  const [showVesselName,   setShowVesselName]   = React.useState("");
  const [showVesselSpecs,  setShowVesselSpecs]  = React.useState<Spec[]>([]);
  const [showVesselDesc,   setShowVesselDesc]   = React.useState("");
  const [showVesselCtaUrl, setShowVesselCtaUrl] = React.useState("");

  /* ── Open House ── */
  const [ohVessel,   setOhVessel]   = React.useState("2019 Sunseeker 76");
  const [ohDate,     setOhDate]     = React.useState("Saturday, April 19, 2025");
  const [ohTime,     setOhTime]     = React.useState("11:00 AM – 2:00 PM");
  const [ohMarina,   setOhMarina]   = React.useState("Bahia Mar Marina");
  const [ohAddress,  setOhAddress]  = React.useState("801 Seabreeze Blvd, Fort Lauderdale, FL 33316");
  const [ohDesc,     setOhDesc]     = React.useState("You're invited to an exclusive private showing. Step aboard and experience this exceptional yacht firsthand.");
  const [ohRsvp,     setOhRsvp]     = React.useState("WN@DenisonYachting.com");

  /* ── Newsletter ── */
  const [nlTitle,    setNlTitle]    = React.useState("Yacht Market Update");
  const [nlSubtitle, setNlSubtitle] = React.useState("Spring 2025 | Will Noftsinger, Denison Yachting");
  const [nlIntro,    setNlIntro]    = React.useState("The spring market is active and well-priced yachts are moving quickly. Here's what I'm seeing on the water.");
  const [nlSections, setNlSections] = React.useState<NLSection[]>([defaultNLSection()]);
  const [nlFeatured, setNlFeatured] = React.useState<NLFeatured[]>([defaultNLFeatured()]);

  /* ── Multi-Boat ── */
  const [showcaseTitle,    setShowcaseTitle]    = React.useState("OCEAN KING");
  const [showcaseSubtitle, setShowcaseSubtitle] = React.useState("EXPLORER YACHTS");
  const [showcaseIntro,    setShowcaseIntro]    = React.useState("Ocean King is an Italian shipyard known for luxury explorer yachts built with craftsmanship and durability.");
  const [showcaseHeroUrl,  setShowcaseHeroUrl]  = React.useState("");
  const [boats,            setBoats]            = React.useState<BoatCard[]>([defaultBoat()]);

  /* ── Import ── */
  const [importUrl,  setImportUrl]  = React.useState("");
  const [importing,  setImporting]  = React.useState(false);

  /* ── Send panel ── */
  const [sendOpen,       setSendOpen]       = React.useState(false);
  const [contactSource,  setContactSource]  = React.useState<"pipeline"|"apple_contacts"|"all">("pipeline");
  const [contactSearch,  setContactSearch]  = React.useState("");
  const [allContacts,    setAllContacts]    = React.useState<Contact[]>([]);
  const [contactsLoading,setContactsLoading]= React.useState(false);
  const [selected,       setSelected]       = React.useState<Set<number>>(new Set());
  const [sendStatus,     setSendStatus]     = React.useState<SendStatus>("idle");
  const [sendResult,     setSendResult]     = React.useState<{sent:number;failed:number}|null>(null);
  const [copied,         setCopied]         = React.useState(false);
  const [previewOpen,    setPreviewOpen]    = React.useState(false);
  const [livePreview,    setLivePreview]    = React.useState(false);
  const [draftSaved,     setDraftSaved]     = React.useState(false);

  // ── Named templates ──────────────────────────────────────────────────────
  const TMPL_KEY = "yotcrm_campaign_templates_v1";
  const [savedTemplates, setSavedTemplates] = React.useState<{name:string;mode:string;savedAt:string;data:Record<string,unknown>}[]>([]);
  const [showTmplPanel,  setShowTmplPanel]  = React.useState(false);
  const [tmplNameInput,  setTmplNameInput]  = React.useState("");
  const [tmplSaving,     setTmplSaving]     = React.useState(false);

  // ── SMS generator ────────────────────────────────────────────────────────
  const [smsOpen, setSmsOpen] = React.useState(false);
  const [smsText, setSmsText] = React.useState("");
  const [smsCopied, setSmsCopied] = React.useState(false);
  const [smsLink, setSmsLink] = React.useState("");      // optional link to append
  const [smsImage, setSmsImage] = React.useState("");    // optional image URL for MMS
  const [smsImageUrl, setSmsImageUrl] = React.useState("");
  const [smsLinkUrl, setSmsLinkUrl] = React.useState("");

  /* ── Set defaults when switching template ── */
  function selectTemplate(m: Mode) {
    setMode(m);
    if (m === "New Listing")  { setBannerTag("NEW LISTING");   setCtaText("VIEW ONLINE");    setSubject(""); }
    if (m === "Price Drop")   { setBannerTag("PRICE REDUCED"); setCtaText("VIEW ONLINE");    setSubject(""); }
    if (m === "Single Listing"){ setBannerTag("Price Reduced");setCtaText("VIEW ONLINE");    setSubject(""); }
    if (m === "Boat Show")    { setSubject(showName + " — You're Invited"); }
    if (m === "Open House")   { setSubject("You're Invited: Private Showing — " + ohVessel); }
    if (m === "Newsletter")   { setSubject(nlTitle + " | Will Noftsinger, Denison Yachting"); }
    if (m === "Multi-Boat Showcase") { setSubject(showcaseTitle + " — New Build Opportunities"); }
  }

  const filteredContacts = React.useMemo(() => {
    if (!contactSearch.trim()) return allContacts;
    const q = contactSearch.toLowerCase();
    return allContacts.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
  }, [allContacts, contactSearch]);

  async function loadContacts(source: "pipeline"|"apple_contacts"|"all") {
    setContactsLoading(true); setContactSearch("");
    try {
      const res = await fetch(`/api/campaign/contacts?source=${source}&limit=5000`);
      const data = await res.json();
      if (data.ok) setAllContacts(data.contacts); else toast(data.error||"Failed to load contacts","error");
    } catch { toast("Failed to load contacts","error"); } finally { setContactsLoading(false); }
  }
  function openSendPanel() { setSendOpen(true); setSendResult(null); setSendStatus("idle"); if (allContacts.length===0) loadContacts(contactSource); }

  async function addAttachment(file: File) {
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) { toast(`File too large (max ${MAX_MB}MB)`,"error"); return; }
    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setAttachments(prev => [...prev, { name: file.name, base64, mimeType: file.type || "application/octet-stream", size: file.size }]);
    toast(`Attached: ${file.name}`);
  }

  function removeAttachment(idx: number) {
    setAttachments(prev => prev.filter((_,i) => i !== idx));
  }
  function toggleSelect(id: number) { setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function selectAll() { setSelected(new Set(filteredContacts.map(c=>c.id))); }
  function clearAll()  { setSelected(new Set()); }

  async function doSendToPaolo() {
    if (!subject.trim()) { toast("Set a subject first","error"); return; }
    setSendStatus("testing");
    try {
      const recipients = [{ email: "PGA@DenisonYachting.com", name: "Paolo Ameglio" }];
      const res = await fetch("/api/campaign/send", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ subject, html, recipients, testMode: true,
          attachments: attachments.length > 0 ? attachments.map(a=>({filename:a.name,content:a.base64,type:a.mimeType})) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Send failed");
      toast("Test sent to Paolo","success");
    } catch (err) { toast(`Failed: ${err instanceof Error?err.message:"unknown"}`, "error"); }
    setSendStatus("idle");
  }

  async function doSend(testMode: boolean) {    if (selected.size===0 && !testMode) { toast("Select at least one recipient","error"); return; }
    if (!subject.trim()) { toast("Set an email subject first","error"); return; }
    const recipients = testMode
      ? [{ email:"WN@DenisonYachting.com", name:"Will Noftsinger" }]
      : allContacts.filter(c=>selected.has(c.id)).map(c=>({ email:c.email, name:c.name }));
    if (recipients.length===0) { toast("No recipients selected","error"); return; }

    // CC any enabled co-brokers (non-Will agents) on every send
    const ccEmails = enabledAgents
      .filter(a => !a.email.toLowerCase().startsWith("wn@"))
      .map(a => a.email);

    setSendStatus(testMode?"testing":"sending");
    try {
      const res = await fetch("/api/campaign/send",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({
        subject, html, recipients, testMode,
        templateMode: mode==="Boat Show" ? "boat-show" : undefined,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        attachments: attachments.length > 0 ? attachments.map(a => ({ filename: a.name, content: a.base64, type: a.mimeType })) : undefined,
      }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Send failed");
      setSendResult({ sent:data.sent, failed:data.failed }); setSendStatus("done");
      const ccNote = ccEmails.length > 0 ? ` · CC: ${ccEmails.join(", ")}` : "";
      if (data.rateLimitHit) {
        toast(`⚠️ Rate limit hit — only ${data.sent} of ${data.total} sent. Try again or reduce batch size.`, "error");
      } else {
        toast(testMode?`Test sent to ${recipients[0].email}${ccNote}`:`Sent to ${data.sent} recipients${ccNote}`,"success");
      }
    } catch(err) { toast(err instanceof Error?err.message:"Send failed","error"); setSendStatus("idle"); }
  }

  function toggleAgent(idx: number) { setAgents(prev=>prev.map((a,i)=>i===idx?{...a,enabled:!a.enabled}:a)); }

  /* Import handler */
  async function handleImport() {
    const url = importUrl.trim(); if (!url) return; setImporting(true);
    try {
      const res = await fetch("/api/scrape",{ method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ url }) });
      const payload = await res.json();
      if (!payload.ok||!payload.data) throw new Error(payload.error||"Import failed");
      const d = payload.data;
      if (d.headline||d.subject) { let h=(d.headline||d.subject).replace(/\s*[-–—|]\s*(Denison\s*(Yacht(ing|s?\s*Sales?)?)?|YachtWorld|BoatTrader|boats\.com).*$/i,"").trim(); setSubject(h); setHeadline(h); }
      if (d.location)   setLocation(String(d.location).toUpperCase());
      if (d.listingUrl) setCtaHref(d.listingUrl);
      setPrice(d.price||"");
      if (d.heroUrl)    setHeroUrl(d.heroUrl);
      if (d.gallery?.length) setGalleryText(d.gallery.slice(0,6).join("\n"));
      if (d.description) setIntro(d.description);
      if (d.features?.length) setFeaturesText(d.features.join("\n"));
      if (d.specs) { const map:[string,string][]= [ ["loa","LENGTH"],["beam","BEAM"],["draft","DRAFT"],["year","YEAR"],["builder","BUILDER"],["staterooms","STATEROOMS"],["guests","GUESTS"],["engines","ENGINES"],["power","POWER"],["maxSpeed","MAX SPEED"],["cruiseSpeed","CRUISE SPEED"],["range","RANGE"],["displacement","DISPLACEMENT"],["grossTonnage","GROSS TONNAGE"],["crew","CREW"] ]; const next=map.map(([k,l])=>d.specs[k]?{label:l,value:String(d.specs[k])}:null).filter((x): x is Spec=>!!x); if(next.length) setSpecs(next); }
    } catch(err) { toast(err instanceof Error?err.message:"Import failed","error"); } finally { setImporting(false); }
  }

  /* ── Boat Show data & handlers ── */
  const SHOWS = [
    {id:"flibs",      name:"Fort Lauderdale", full:"Fort Lauderdale International Boat Show", venue:"Bahia Mar Yachting Center & Convention Center, Fort Lauderdale FL", url:"https://www.flibs.com"},
    {id:"palm-beach", name:"Palm Beach",       full:"Palm Beach International Boat Show",       venue:"Palm Beach Convention Center Waterfront, Palm Beach FL",           url:"https://www.pbboatshow.com"},
    {id:"miami",      name:"Miami",            full:"Miami Yacht Show",                         venue:"Island Gardens Deep Harbour, Miami FL",                           url:"https://www.miamiyachtshow.com"},
    {id:"cannes",     name:"Cannes",           full:"Cannes Yachting Festival",                  venue:"Vieux Port de Cannes, France",                                    url:"https://www.cannesyachtingfestival.com"},
    {id:"monaco",     name:"Monaco",           full:"Monaco Yacht Show",                         venue:"Port Hercule, Monaco",                                            url:"https://www.monacoyachtshow.com"},
    {id:"annapolis",  name:"Annapolis",        full:"Annapolis Sailboat Show",                   venue:"City Dock, Annapolis MD",                                         url:"https://www.annapolisboatshows.com"},
    {id:"dubai",      name:"Dubai",            full:"Dubai International Boat Show",             venue:"Dubai Harbour, Dubai UAE",                                        url:"https://www.boatshowdubai.com"},
    {id:"newport-ri", name:"Newport RI",       full:"Newport International Boat Show",           venue:"Newport Yachting Center, Newport RI",                             url:"https://newportboatshow.com"},
    {id:"newport-ca", name:"Newport Beach CA", full:"Newport Beach Boat Show",                   venue:"Lido Marina Village, Newport Beach CA",                           url:"https://www.newportboatshow.com"},
    {id:"stuart",     name:"Stuart",           full:"Stuart Boat Show",                          venue:"Sailfish Marina, Stuart FL",                                      url:"https://www.stuartboatshow.com"},
  ];

  function selectBoatShow(id:string) {
    if (showSelectedId === id) { setShowSelectedId(null); return; }
    const s = SHOWS.find(x=>x.id===id); if (!s) return;
    setShowSelectedId(id);
    setShowName(s.full);
    setShowVenue(s.venue);
    setShowInfoUrl(s.url);
    setSubject(s.full + " — You're Invited");
  }

  async function handleShowImport() {
    const url = showImportUrl.trim(); if (!url) return;
    setShowImporting(true);
    try {
      const res = await fetch("/api/scrape",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
      const payload = await res.json();
      if (!payload.ok) throw new Error(payload.error||"Import failed");

      // Use payload.vessel (VesselData — full direct fields) first,
      // fall back to payload.data (campaign draft shape) if vessel missing
      const v = payload.vessel || {};
      const d = payload.data || {};

      // Hero + gallery
      const heroSrc = v.images?.[0]?.src || d.heroUrl || "";
      if (heroSrc) setHeroUrl(heroSrc);
      const gallerySrcs = (v.images || []).slice(1,7).map((i: {src:string}) => i.src).filter(Boolean);
      if (gallerySrcs.length) setGalleryText(gallerySrcs.join("\n"));
      else if (d.gallery?.length > 1) setGalleryText(d.gallery.slice(1,7).join("\n"));

      // Vessel name
      const vName = (v.name || d.headline || "").replace(/\s*[-–—|]\s*(Van der Valk|Denison|YachtWorld|BoatTrader|YATCO).*$/i,"").trim();
      if (vName) { setShowVesselName(vName); setSubject(showName + " — You're Invited · " + vName); }

      // Description
      const desc = v.description || d.description || "";
      if (desc) setShowVesselDesc(desc);

      // CTA URL
      setShowVesselCtaUrl(v.sourceUrl || d.listingUrl || url);

      // Build spec list from ALL VesselData fields — every non-empty field
      const SPEC_DEFS: [keyof typeof v, string][] = [
        ["loa","LOA"], ["lwl","LWL"], ["beam","BEAM"], ["draft","DRAFT"],
        ["displacement","DISPLACEMENT"], ["grossTonnage","GROSS TONNAGE"],
        ["year","YEAR"], ["builder","BUILDER"], ["hullForm","HULL FORM"],
        ["hullMaterial","HULL MATERIAL"], ["superstructure","SUPERSTRUCTURE"],
        ["classification","CLASSIFICATION"], ["flagState","FLAG"],
        ["exteriorDesign","EXTERIOR DESIGN"], ["interiorDesign","INTERIOR DESIGN"],
        ["navalArchitect","NAVAL ARCHITECT"], ["engines","ENGINES"],
        ["power","POWER OUTPUT"], ["gearbox","GEARBOX"],
        ["propellers","PROPELLERS"], ["gensets","GENERATORS"],
        ["bowThruster","BOW THRUSTER"], ["sternThruster","STERN THRUSTER"],
        ["maxSpeed","MAX SPEED"], ["cruiseSpeed","CRUISE SPEED"], ["range","RANGE"],
        ["fuelTank","FUEL TANK"], ["freshWater","FRESH WATER"],
        ["holdingTank","HOLDING TANK"], ["lubeOil","LUBE OIL"],
        ["guests","GUESTS"], ["staterooms","STATEROOMS"],
        ["crew","CREW"], ["crewCabins","CREW CABINS"],
        ["stabilisers","STABILISERS"], ["waterMaker","WATER MAKER"],
        ["price","PRICE"], ["location","LOCATION"], ["stockNumber","STOCK NO"],
      ];
      const scraped: Spec[] = [];
      for (const [key, label] of SPEC_DEFS) {
        const raw = v[key];
        const val = raw != null && raw !== "" ? String(raw) : "";
        if (val) scraped.push({ label, value: val });
      }
      // Fallback: also check d.specs for any additional fields not in vessel
      if (scraped.length === 0 && d.specs) {
        const fallbackDefs: [string,string][] = [
          ["loa","LOA"],["beam","BEAM"],["draft","DRAFT"],["maxSpeed","MAX SPEED"],
          ["cruiseSpeed","CRUISE SPEED"],["engines","ENGINES"],["year","YEAR"],
          ["staterooms","STATEROOMS"],["guests","GUESTS"],["displacement","DISPLACEMENT"],
          ["grossTonnage","GROSS TONNAGE"],["hullMaterial","HULL MATERIAL"],
          ["classification","CLASSIFICATION"],["range","RANGE"],
        ];
        for (const [key, label] of fallbackDefs) {
          if (d.specs[key]) scraped.push({ label, value: d.specs[key] });
        }
      }
      if (scraped.length) setShowVesselSpecs(scraped);

      const populated = [vName&&"name", heroSrc&&"hero", scraped.length&&`${scraped.length} specs`, desc&&"description"].filter(Boolean);
      toast(`Imported: ${populated.join(", ")}`, "success");
    } catch(err) { toast(err instanceof Error?err.message:"Import failed","error"); } finally { setShowImporting(false); }
  }

  async function handleShowInfoScrape() {
    const url = showInfoUrl.trim(); if (!url) return;
    setShowInfoScraping(true);
    try {
      const res = await fetch("/api/campaign/scrape-show-info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url})});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"Scrape failed");
      setScrapedShowInfo(data);
      // Auto-apply dates and venue immediately
      const applied: string[] = [];
      if (data.dates)  { setShowDates(data.dates);  applied.push("Dates"); }
      if (data.venue)  { setShowVenue(data.venue);  applied.push("Venue"); }
      const src = data._source === "search" ? " (via web search)" : "";
      toast(applied.length ? `Applied: ${applied.join(", ")}${src}` : `Pulled info${src} — no dates/venue found`,"success");
    } catch(err) { toast(err instanceof Error?err.message:"Fetch failed","error"); } finally { setShowInfoScraping(false); }
  }

  /* Spec helpers */
  function updateSpec(i:number,key:"label"|"value",v:string){setSpecs(p=>p.map((s,idx)=>idx===i?{...s,[key]:v}:s));}
  function addSpec(){setSpecs(p=>[...p,{label:"",value:""}]);}
  function delSpec(i:number){setSpecs(p=>p.filter((_,idx)=>idx!==i));}
  /* Extra button helpers */
  function addBtn(){setExtraButtons(p=>[...p,defaultCtaButton()]);}
  function delBtn(id:string){setExtraButtons(p=>p.filter(b=>b.id!==id));}
  function updateBtn(id:string,key:keyof CtaButton,v:string){setExtraButtons(p=>p.map(b=>b.id===id?{...b,[key]:v}:b));}
  /* Boat helpers */
  function addBoat(){setBoats(p=>[...p,defaultBoat()]);}
  function delBoat(id:string){setBoats(p=>p.filter(b=>b.id!==id));}
  function updateBoat(id:string,key:keyof BoatCard,v:string){setBoats(p=>p.map(b=>b.id===id?{...b,[key]:v}:b));}
  /* NL helpers */
  function addNLSection(){setNlSections(p=>[...p,defaultNLSection()]);}
  function delNLSection(id:string){setNlSections(p=>p.filter(s=>s.id!==id));}
  function updateNLSection(id:string,key:keyof NLSection,v:string){setNlSections(p=>p.map(s=>s.id===id?{...s,[key]:v}:s));}
  function addNLFeatured(){setNlFeatured(p=>[...p,defaultNLFeatured()]);}
  function delNLFeatured(id:string){setNlFeatured(p=>p.filter(f=>f.id!==id));}
  function updateNLFeatured(id:string,key:keyof NLFeatured,v:string){setNlFeatured(p=>p.map(f=>f.id===id?{...f,[key]:v}:f));}

  /* Build HTML from current mode */
  const html = React.useMemo(() => {
    const imgOpts = { heroSize, heroPosition, hero2Url, hero2Link, hero2Size, hero2Position, galleryColumns, galleryPosition, galleryLink: galleryLink||ctaHref };
    const listing = { subject, bannerTag, headline, location, ctaText, ctaHref, heroUrl, heroLink: heroLink||ctaHref, price, intro, gallery, specs, featuresText, agents:enabledAgents, extraButtons, ...imgOpts };
    if (mode==="New Listing")  return buildSingleListingHtml({ ...listing, bannerTag:"NEW LISTING" });
    if (mode==="Price Drop")   return buildPriceDropHtml({ subject, headline, location, ctaHref, price, wasPrice, heroUrl, heroLink:heroLink||ctaHref, intro, gallery, specs, featuresText, agents:enabledAgents, extraButtons, ...imgOpts });
    if (mode==="Single Listing") return buildSingleListingHtml(listing);
    if (mode==="Boat Show")    return buildBoatShowHtml({ subject, heroUrl, heroLink:heroLink||showCtaUrl, showName, showDates, showVenue, showBooth, showAddress, showDesc, showCta, showCtaUrl, gallery, agents:enabledAgents, extraButtons, showVesselName, showVesselSpecs, showVesselDesc, showVesselCtaUrl, ...imgOpts });
    if (mode==="Open House")   return buildOpenHouseHtml({ subject, heroUrl, heroLink:heroLink||`mailto:${ohRsvp}`, ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp, agents:enabledAgents, extraButtons, ...imgOpts });
    if (mode==="Newsletter")   return buildNewsletterHtml({ subject, nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured, agents:enabledAgents, extraButtons, ...imgOpts });
    return buildMultiBoatHtml({ subject, showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, heroLink:heroLink||ctaHref, boats, agents:enabledAgents, extraButtons, ...imgOpts });
  }, [mode, subject, bannerTag, headline, location, ctaText, ctaHref, heroUrl, heroLink, heroSize, heroPosition,
      hero2Url, hero2Link, hero2Size, hero2Position, galleryLink, galleryColumns, galleryPosition,
      price, wasPrice, intro, gallery, specs, featuresText, enabledAgents, extraButtons,
      showName, showDates, showVenue, showBooth, showAddress, showDesc, showCta, showCtaUrl, showVesselName, showVesselSpecs, showVesselDesc, showVesselCtaUrl,
      ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp,
      nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured,
      showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats]);

  /* ── Draft save / load ── */
  const DRAFT_KEY = "yotcrm_campaign_draft_v2";

  function saveDraft() {
    const draft = {
      mode, subject, heroUrl, heroLink, heroSize, heroPosition,
      hero2Url, hero2Link, hero2Size, hero2Position,
      galleryText, galleryColumns, galleryPosition, galleryLink,
      bannerTag, headline, location, ctaText, ctaHref, intro, specs, featuresText, price, wasPrice,
      showName, showDates, showVenue, showBooth, showAddress, showDesc, showCta, showCtaUrl,
      showVesselName, showVesselSpecs, showVesselDesc, showVesselCtaUrl,
      ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp,
      nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured,
      showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats,
      agents: agents.map(a => ({ email: a.email, enabled: a.enabled })),
      extraButtons,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } catch { toast("Could not save draft","error"); }
  }

  function loadDraftData(d: Record<string, unknown>) {
      if (d.mode) selectTemplate(d.mode as Mode);
      if (d.subject)    setSubject(d.subject as string);
      if (d.heroUrl)    setHeroUrl(d.heroUrl);
      if (d.heroLink)   setHeroLink(d.heroLink);
      if (d.heroSize)   setHeroSize(d.heroSize);
      if (d.heroPosition) setHeroPosition(d.heroPosition);
      if (d.hero2Url)   setHero2Url(d.hero2Url);
      if (d.hero2Link)  setHero2Link(d.hero2Link);
      if (d.hero2Size)  setHero2Size(d.hero2Size);
      if (d.hero2Position) setHero2Position(d.hero2Position);
      if (d.galleryText) setGalleryText(d.galleryText);
      if (d.galleryColumns) setGalleryColumns(d.galleryColumns);
      if (d.galleryPosition) setGalleryPosition(d.galleryPosition);
      if (d.galleryLink) setGalleryLink(d.galleryLink);
      if (d.bannerTag)  setBannerTag(d.bannerTag);
      if (d.headline)   setHeadline(d.headline);
      if (d.location)   setLocation(d.location);
      if (d.ctaText)    setCtaText(d.ctaText);
      if (d.ctaHref)    setCtaHref(d.ctaHref);
      if (d.intro)      setIntro(d.intro);
      if (d.specs)      setSpecs(d.specs);
      if (d.featuresText) setFeaturesText(d.featuresText);
      if (d.price)      setPrice(d.price);
      if (d.wasPrice)   setWasPrice(d.wasPrice);
      if (d.showName)   setShowName(d.showName);
      if (d.showDates)  setShowDates(d.showDates);
      if (d.showVenue)  setShowVenue(d.showVenue);
      if (d.showBooth)  setShowBooth(d.showBooth);
      if (d.showAddress) setShowAddress(d.showAddress);
      if (d.showDesc)   setShowDesc(d.showDesc);
      if (d.showCta)    setShowCta(d.showCta);
      if (d.showCtaUrl) setShowCtaUrl(d.showCtaUrl);
      if (d.showVesselName) setShowVesselName(d.showVesselName);
      if (d.showVesselSpecs) setShowVesselSpecs(d.showVesselSpecs);
      if (d.showVesselDesc) setShowVesselDesc(d.showVesselDesc);
      if (d.showVesselCtaUrl) setShowVesselCtaUrl(d.showVesselCtaUrl);
      if (d.ohVessel)   setOhVessel(d.ohVessel);
      if (d.ohDate)     setOhDate(d.ohDate);
      if (d.ohTime)     setOhTime(d.ohTime);
      if (d.ohMarina)   setOhMarina(d.ohMarina);
      if (d.ohAddress)  setOhAddress(d.ohAddress);
      if (d.ohDesc)     setOhDesc(d.ohDesc);
      if (d.ohRsvp)     setOhRsvp(d.ohRsvp);
      if (d.nlTitle)    setNlTitle(d.nlTitle);
      if (d.nlSubtitle) setNlSubtitle(d.nlSubtitle);
      if (d.nlIntro)    setNlIntro(d.nlIntro);
      if (d.nlSections) setNlSections(d.nlSections);
      if (d.nlFeatured) setNlFeatured(d.nlFeatured);
      if (d.showcaseTitle) setShowcaseTitle(d.showcaseTitle);
      if (d.showcaseSubtitle) setShowcaseSubtitle(d.showcaseSubtitle);
      if (d.showcaseIntro) setShowcaseIntro(d.showcaseIntro);
      if (d.showcaseHeroUrl) setShowcaseHeroUrl(d.showcaseHeroUrl);
      if (d.boats) setBoats(d.boats);
      if (d.agents) setAgents(prev => prev.map(a => {
        const saved = d.agents.find((s: {email:string;enabled:boolean}) => s.email === a.email);
        return saved ? { ...a, enabled: saved.enabled } : a;
      }));
      if (d.extraButtons) setExtraButtons(d.extraButtons as typeof extraButtons);
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) { toast("No saved draft found","error"); return; }
      const d = JSON.parse(raw);
      loadDraftData(d);
      const when = d.savedAt ? new Date(d.savedAt as string).toLocaleString() : "unknown";
      toast(`Draft loaded (saved ${when})`);
    } catch { toast("Could not load draft","error"); }
  }

  // Auto-save draft to localStorage on every html change
  React.useEffect(() => {
    if (!html) return;
    try { localStorage.setItem(DRAFT_KEY + "_autosave", JSON.stringify({ mode, subject, savedAt: new Date().toISOString() })); } catch { /* ignore */ }
  }, [html]);

  // Load saved templates on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(TMPL_KEY);
      if (raw) setSavedTemplates(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function persistTemplates(list: typeof savedTemplates) {
    setSavedTemplates(list);
    try { localStorage.setItem(TMPL_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  function saveAsTemplate(name: string) {
    if (!name.trim()) return;
    const data = {
      mode, subject, heroUrl, heroLink, heroSize, heroPosition,
      hero2Url, hero2Link, hero2Size, hero2Position,
      galleryText, galleryColumns, galleryPosition, galleryLink,
      bannerTag, headline, location, ctaText, ctaHref, intro, specs, featuresText, price, wasPrice,
      showName, showDates, showVenue, showBooth, showAddress, showDesc, showCta, showCtaUrl,
      showVesselName, showVesselSpecs, showVesselDesc, showVesselCtaUrl,
      ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp,
      nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured,
      showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats,
      agents: agents.map(a => ({ email: a.email, enabled: a.enabled })),
      extraButtons,
    };
    const entry = { name: name.trim(), mode, savedAt: new Date().toISOString(), data: data as Record<string,unknown> };
    const list = [entry, ...savedTemplates.filter(t => t.name !== name.trim())];
    persistTemplates(list);
    setTmplNameInput("");
    setTmplSaving(false);
    setShowTmplPanel(false);
    toast(`Template "${name.trim()}" saved`);
  }

  function loadTemplate(t: typeof savedTemplates[0]) {
    loadDraftData(t.data as Parameters<typeof loadDraftData>[0]);
    setShowTmplPanel(false);
    toast(`Loaded: ${t.name}`);
  }

  function deleteTemplate(name: string) {
    persistTemplates(savedTemplates.filter(t => t.name !== name));
    toast(`Deleted "${name}"`);
  }

  // ── All images available for SMS, keyed by mode ──────────────────────────
  const smsAvailableImages = React.useMemo<{label:string;url:string}[]>(() => {
    const imgs: {label:string;url:string}[] = [];
    if (heroUrl)  imgs.push({ label: "Hero image",   url: heroUrl });
    if (hero2Url) imgs.push({ label: "Second image", url: hero2Url });
    gallery.slice(0,6).forEach((g,i) => { if (g) imgs.push({ label: `Gallery ${i+1}`, url: g }); });
    if (mode === "Multi-Boat Showcase") {
      if (showcaseHeroUrl) imgs.push({ label: "Showcase hero", url: showcaseHeroUrl });
      boats.forEach((b,i) => { if (b.imageUrl) imgs.push({ label: b.name || `Boat ${i+1}`, url: b.imageUrl }); });
    }
    if (mode === "Newsletter") {
      nlFeatured.forEach((f,i) => { if (f.imageUrl) imgs.push({ label: f.name || `Featured ${i+1}`, url: f.imageUrl }); });
    }
    return imgs;
  }, [heroUrl, hero2Url, gallery, mode, showcaseHeroUrl, boats, nlFeatured]);

  // ── All links available for SMS, keyed by mode ───────────────────────────
  const smsAvailableLinks = React.useMemo<{label:string;url:string}[]>(() => {
    const links: {label:string;url:string}[] = [];
    if (mode === "Boat Show") {
      if (showCtaUrl)     links.push({ label: "RSVP / Show CTA",    url: showCtaUrl });
      if (showInfoUrl)    links.push({ label: "Show website",        url: showInfoUrl });
      if (showVesselCtaUrl) links.push({ label: "Vessel listing",    url: showVesselCtaUrl });
    } else if (mode === "Open House") {
      if (ohRsvp)         links.push({ label: "RSVP email",          url: `mailto:${ohRsvp}` });
      if (ctaHref)        links.push({ label: "Listing / CTA",       url: ctaHref });
    } else if (mode === "Newsletter") {
      nlFeatured.forEach((f,i) => { if (f.url) links.push({ label: f.name || `Featured ${i+1}`, url: f.url }); });
      if (ctaHref) links.push({ label: "Main CTA",                   url: ctaHref });
    } else if (mode === "Multi-Boat Showcase") {
      boats.forEach((b,i) => { if (b.ctaUrl) links.push({ label: b.name || `Boat ${i+1}`, url: b.ctaUrl }); });
    } else {
      if (ctaHref)        links.push({ label: "Listing URL",         url: ctaHref });
      if (heroLink)       links.push({ label: "Hero image link",     url: heroLink });
      if (galleryLink)    links.push({ label: "Gallery link",        url: galleryLink });
      extraButtons.forEach(b => { if (b.href) links.push({ label: b.text || "Extra CTA", url: b.href }); });
    }
    return links;
  }, [mode, showCtaUrl, showInfoUrl, showVesselCtaUrl, ohRsvp, ctaHref, heroLink, galleryLink, extraButtons, nlFeatured, boats]);

  function generateSms(imgUrl?: string, linkUrl?: string): string {
    // Vessel: mode-specific — never bleed listing headline into show/open-house templates
    const vessel = mode === "Boat Show"  ? (showVesselName || "")
                 : mode === "Open House" ? (ohVessel || "")
                 : (headline || "");
    const loaSpec  = specs.find(s => s.label.toLowerCase().includes("length") || s.label.toLowerCase() === "loa");
    const yearSpec = specs.find(s => s.label.toLowerCase() === "year");
    const loa      = loaSpec?.value  || "";
    const yr       = yearSpec?.value || "";
    const px       = price           || "";
    const img      = imgUrl  !== undefined ? imgUrl  : smsImageUrl;
    const link     = linkUrl !== undefined ? linkUrl : smsLinkUrl;
    const who      = "Will Noftsinger · Denison Yachting · 850.461.3342";

    const imgLine  = img  ? `\n${img}`  : "";
    const linkLine = link ? `\n${link}` : "";

    switch (mode) {
      case "Boat Show": {
        // Clean showName: strip anything in parens (often dates or notes pasted in)
        const cleanShow = (showName || "the boat show").replace(/\s*\([^)]*\)/g, "").trim();
        const dates     = showDates || "";
        // Booth: if it contains a pipe or is very long, use venue instead
        const rawBooth  = showBooth || "";
        const booth     = rawBooth.length > 40 || rawBooth.includes("|")
          ? (showVenue || "")
          : rawBooth;
        const yName     = vessel || "our featured yacht";
        const dateClause = dates ? ` (${dates})` : "";
        const boothClause = booth ? ` at ${booth}` : "";
        return `Joining us at ${cleanShow}${dateClause}? I'll be aboard the ${yName}${boothClause}.\n\nWant complimentary VIP tickets? Just reply YES and I'll send them right over.${imgLine}${linkLine}\n\n${who}`;
      }
      case "New Listing":
      case "Single Listing": {
        const spec = [yr, vessel].filter(Boolean).join(" ");
        const loaPart = loa ? ` · ${loa}` : "";
        const pxPart  = px  ? ` · ${px}`  : "";
        return `Just hit the market — ${spec || "exceptional yacht"}${loaPart}${pxPart}.\n\nClean, well-specified, priced to move. Happy to arrange a private showing at your convenience.${imgLine}${linkLine}\n\n${who}`;
      }
      case "Price Drop": {
        return `Price reduced — ${vessel || "exceptional yacht"}${px ? ` now asking ${px}` : ""}.\n\nBest value in this class right now. Worth a look before it's gone.${imgLine}${linkLine}\n\n${who}`;
      }
      case "Open House": {
        const when = [ohDate, ohTime].filter(Boolean).join(" at ");
        return `You're invited — private showing aboard ${vessel || "a stunning yacht"} at ${ohMarina || "the marina"}${when ? `, ${when}` : ""}.\n\nReply to RSVP and I'll hold your spot.${imgLine}${linkLine}\n\n${who}`;
      }
      case "Newsletter": {
        return `New market update${nlTitle ? ` — ${nlTitle}` : ""}: a few listings I think are worth your attention.\n\nTake a look when you have 2 minutes.${imgLine}${linkLine}\n\n${who}`;
      }
      case "Multi-Boat Showcase": {
        const title = showcaseTitle || "curated selection";
        return `I put together a ${title} — a few options I think genuinely fit what you're looking for.\n\nWorth a quick look.${imgLine}${linkLine}\n\n${who}`;
      }
      default:
        return `I came across something that I think is worth your attention.\n\nMind if I send details?${imgLine}${linkLine}\n\n${who}`;
    }
  }

  function copyHtml() {    navigator.clipboard.writeText(html).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); toast("HTML copied"); },()=>toast("Copy failed","error"));
  }

  const isListingMode = mode==="New Listing"||mode==="Price Drop"||mode==="Single Listing";

  /* ══════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  return (
    <PageShell title="Campaign Builder" subtitle="Denison branded emails" maxWidth="full" flush>
      <section className="max-w-xl mx-auto">
        <div className="flex flex-col gap-4 pb-32 md:pb-32" style={{paddingBottom:"calc(72px + 80px)"}}>

          {/* ── Template Picker ── */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-bold text-gray-900 mb-3">Choose a Template</div>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.mode} onClick={() => selectTemplate(t.mode)}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${mode===t.mode?"border-[#e57b2e] bg-orange-50":"border-gray-100 hover:border-gray-300 bg-gray-50"}`}>
                  <span className="text-2xl leading-none">{t.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${mode===t.mode?"text-[#e57b2e]":"text-gray-800"}`}>{t.label}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 leading-tight">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Subject Line (shared) ── */}
          <Card title="Email Subject">
            <Field label="Subject line" value={subject} set={setSubject} />
          </Card>

          {/* ── Import (listing modes only) ── */}
          {isListingMode && (
            <Card title="Import from Listing URL">
              <div className="flex gap-2">
                <input value={importUrl} onChange={e=>setImportUrl(e.target.value)} placeholder="Paste Denison or YachtWorld URL…" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <button onClick={handleImport} disabled={importing} className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{importing?"…":"Import"}</button>
              </div>
            </Card>
          )}

          {/* ══════════ TEMPLATE-SPECIFIC FORMS ══════════ */}

          {/* ── Listing fields (New Listing / Single Listing) ── */}
          {(mode==="New Listing"||mode==="Single Listing") && (
            <>
              <Card title="Listing Details">
                <Field label="Headline" value={headline} set={setHeadline} />
                <Field label="Location" value={location} set={setLocation} />
                {mode==="Single Listing" && <Field label="Orange Banner Tag" value={bannerTag} set={setBannerTag} />}
                <Field label="CTA Button Text" value={ctaText} set={setCtaText} />
                <Field label="CTA Link" value={ctaHref} set={setCtaHref} />
              </Card>
              <Card title="Media & Copy">
                <Field label="Price (leave blank for POA)" value={price} set={setPrice} />
                <Field label="Hero Image URL" value={heroUrl} set={setHeroUrl} />
                {(heroUrl||gallery.length>0) && <ImagePicker heroUrl={heroUrl} gallery={gallery} setHeroUrl={setHeroUrl} setGalleryText={setGalleryText} />}
                <GalleryImageInput value={galleryText} set={setGalleryText} />
                <TArea label="Description" rows={5} value={intro} set={setIntro} />
              </Card>
              <Card title="Specifications">
                {specs.map((s,i)=>(
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <input value={s.label} onChange={e=>updateSpec(i,"label",e.target.value)} placeholder="LABEL" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <input value={s.value} onChange={e=>updateSpec(i,"value",e.target.value)} placeholder="Value"  className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <button onClick={()=>delSpec(i)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">✕</button>
                  </div>
                ))}
                <button onClick={addSpec} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">+ Add spec</button>
              </Card>
              <Card title="Key Features"><TArea label="One per line" rows={5} value={featuresText} set={setFeaturesText} /></Card>
            </>
          )}

          {/* ── Price Drop fields ── */}
          {mode==="Price Drop" && (
            <>
              <Card title="Listing Details">
                <Field label="Headline" value={headline} set={setHeadline} />
                <Field label="Location" value={location} set={setLocation} />
                <Field label="CTA Link" value={ctaHref} set={setCtaHref} />
              </Card>
              <Card title="Pricing">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">NEW Price</div>
                    <input value={price}    onChange={e=>setPrice(e.target.value)}    className="w-full px-3 py-2 rounded-lg border-2 border-green-400 text-sm font-bold text-green-700" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">WAS Price (strikethrough)</div>
                    <input value={wasPrice} onChange={e=>setWasPrice(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400" />
                  </div>
                </div>
              </Card>
              <Card title="Media & Copy">
                <Field label="Hero Image URL" value={heroUrl} set={setHeroUrl} />
                {(heroUrl||gallery.length>0) && <ImagePicker heroUrl={heroUrl} gallery={gallery} setHeroUrl={setHeroUrl} setGalleryText={setGalleryText} />}
                <GalleryImageInput value={galleryText} set={setGalleryText} />
                <TArea label="Description" rows={5} value={intro} set={setIntro} />
              </Card>
              <Card title="Specifications">
                {specs.map((s,i)=>(
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                    <input value={s.label} onChange={e=>updateSpec(i,"label",e.target.value)} placeholder="LABEL" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <input value={s.value} onChange={e=>updateSpec(i,"value",e.target.value)} placeholder="Value"  className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                    <button onClick={()=>delSpec(i)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">✕</button>
                  </div>
                ))}
                <button onClick={addSpec} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">+ Add spec</button>
              </Card>
              <Card title="Key Features"><TArea label="One per line" rows={5} value={featuresText} set={setFeaturesText} /></Card>
            </>
          )}

          {/* ── Boat Show fields ── */}
          {mode==="Boat Show" && (
            <>
              {/* Show selector */}
              <Card title="Select Show">
                <p className="text-xs text-gray-400 mb-3">Tap a show to auto-fill name and venue. Dates always entered manually.</p>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  {SHOWS.map(s => (
                    <button key={s.id} type="button" onClick={()=>selectBoatShow(s.id)}
                      className={`flex flex-col items-start px-3 py-2.5 rounded-xl border-2 text-left transition-all ${showSelectedId===s.id?"border-[#e57b2e] bg-orange-50":"border-gray-100 hover:border-gray-300 bg-gray-50"}`}>
                      <span className={`text-xs font-bold leading-tight ${showSelectedId===s.id?"text-[#e57b2e]":"text-gray-800"}`}>{s.name}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5 leading-tight">{s.venue.split(",").slice(-2).join(",").trim()}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Vessel listing import */}
              <Card title="Vessel on Display">
                <p className="text-xs text-gray-400 mb-2">Paste any listing URL to auto-fill everything. Or fill in manually below.</p>
                <div className="flex gap-2 mb-4">
                  <input value={showImportUrl} onChange={e=>setShowImportUrl(e.target.value)} placeholder="https://vandervalkshipyard.com/fleet/one/" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                  <button onClick={handleShowImport} disabled={showImporting||!showImportUrl} className="px-3 py-2 rounded-lg bg-[#1a2b4a] text-white text-sm font-medium hover:bg-[#243d66] disabled:opacity-40 whitespace-nowrap">{showImporting?"Importing…":"Import Vessel"}</button>
                </div>

                {/* Always-visible fields */}
                <Field label="Vessel Name" value={showVesselName} set={setShowVesselName} />
                <Field label="Listing URL (CTA button)" value={showVesselCtaUrl} set={setShowVesselCtaUrl} />
                <TArea label="Description" rows={3} value={showVesselDesc} set={setShowVesselDesc} />

                {/* Specs grid — shows after import, always editable */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-700">
                      Specifications {showVesselSpecs.length > 0 && <span className="font-normal text-gray-400">({showVesselSpecs.length} fields)</span>}
                    </div>
                    <button onClick={()=>setShowVesselSpecs(p=>[...p,{label:"",value:""}])}
                      className="text-[10px] px-2 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">+ Add spec</button>
                  </div>
                  {showVesselSpecs.length === 0 && (
                    <p className="text-[11px] text-gray-400 italic">Import a vessel URL above to auto-fill specs, or click + Add spec to enter manually.</p>
                  )}
                  <div className="grid grid-cols-1 gap-1">
                    {showVesselSpecs.map((s,i)=>(
                      <div key={i} className="flex gap-2 items-center bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                        <input value={s.label} onChange={e=>{const n=[...showVesselSpecs];n[i]={...n[i],label:e.target.value};setShowVesselSpecs(n);}}
                          placeholder="LABEL" className="w-32 text-[11px] font-bold text-[#e57b2e] border-none outline-none bg-transparent uppercase tracking-wide shrink-0" />
                        <input value={s.value} onChange={e=>{const n=[...showVesselSpecs];n[i]={...n[i],value:e.target.value};setShowVesselSpecs(n);}}
                          placeholder="value" className="flex-1 text-xs border-none outline-none bg-transparent text-gray-800 min-w-0" />
                        <button onClick={()=>setShowVesselSpecs(p=>p.filter((_,j)=>j!==i))} className="text-[10px] text-red-400 hover:text-red-600 shrink-0 px-1">✕</button>
                      </div>
                    ))}
                  </div>
                  {showVesselSpecs.length > 0 && (
                    <button onClick={()=>setShowVesselSpecs([])} className="mt-2 text-[10px] text-red-400 hover:text-red-600">Clear all specs</button>
                  )}
                </div>
              </Card>

              {/* Show details */}
              <Card title="Show Details">
                <Field label="Show Name"         value={showName}   set={setShowName} />
                <Field label="Dates — enter each year" value={showDates} set={setShowDates} />
                <Field label="Venue"             value={showVenue}   set={setShowVenue} />
                <Field label="Our Booth / Dock"  value={showBooth}   set={setShowBooth} />
                <Field label="Venue Address"     value={showAddress} set={setShowAddress} placeholder="101 S Flagler Dr, West Palm Beach, FL 33401" />
                <Field label="Hero Image URL"    value={heroUrl}    set={setHeroUrl} />
                {heroUrl && <div className="mb-2 rounded-lg overflow-hidden border border-gray-200"><img src={heroUrl} alt="" className="w-full h-32 object-cover" /></div>}
                <TArea label="Message Body" rows={4} value={showDesc} set={setShowDesc} />
                <Field label="CTA Button Text"   value={showCta}    set={setShowCta} />
                <div className="mb-2">
                  <div className="text-xs text-gray-400 mb-1">CTA Link / RSVP URL</div>
                  <input value={showCtaUrl} onChange={e=>setShowCtaUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                  <p className="text-[10px] text-gray-400 mt-1">Paolo is CC'd by default via ?cc= — adjust to remove or add recipients.</p>
                </div>
              </Card>

              {/* Show info URL scraper */}
              <Card title="Show Info URL — Auto-fill Dates & Venue">
                <p className="text-xs text-gray-400 mb-2">Paste the official show page. Dates and Venue auto-fill above — you can override any field manually after.</p>
                <div className="flex gap-2 mb-2">
                  <input value={showInfoUrl} onChange={e=>setShowInfoUrl(e.target.value)} placeholder="https://www.flibs.com/2025/" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                  <button onClick={handleShowInfoScrape} disabled={showInfoScraping||!showInfoUrl} className="px-3 py-2 rounded-lg bg-[#1a2b4a] text-white text-sm font-medium hover:bg-[#243d66] disabled:opacity-40 whitespace-nowrap">{showInfoScraping?"Pulling…":"Pull & Apply"}</button>
                </div>
                {scrapedShowInfo && (
                  <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-xs overflow-hidden">
                    {([
                      ["Dates",  scrapedShowInfo.dates,  ()=>scrapedShowInfo.dates  && setShowDates(scrapedShowInfo.dates)],
                      ["Venue",  scrapedShowInfo.venue,  ()=>scrapedShowInfo.venue  && setShowVenue(scrapedShowInfo.venue)],
                      ["Hours",  scrapedShowInfo.hours,  null],
                      ["Notes",  scrapedShowInfo.notes,  null],
                    ] as [string, string|undefined, (()=>void)|null][]).filter(([,v])=>v).map(([label,val,apply])=>(
                      <div key={label} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                        <span className="text-gray-400 shrink-0">{label}</span>
                        <span className="font-medium text-gray-800 text-right flex-1">{val}</span>
                        {apply && (
                          <button onClick={()=>{ apply(); toast(`${label} applied`,"success"); }}
                            className="shrink-0 text-[10px] px-2 py-1 rounded bg-[#e57b2e] text-white font-bold hover:bg-[#d06a20]">
                            Apply ↑
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Gallery for boat show */}
              <Card title="Additional Images">
                <GalleryImageInput value={galleryText} set={setGalleryText} />
              </Card>
            </>
          )}

          {/* ── Open House fields ── */}
          {mode==="Open House" && (
            <Card title="Showing Details">
              <Field label="Vessel Name"    value={ohVessel}  set={setOhVessel} />
              <Field label="Hero Image URL" value={heroUrl}   set={setHeroUrl} />
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Date</div>
                  <input value={ohDate} onChange={e=>setOhDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Time</div>
                  <input value={ohTime} onChange={e=>setOhTime(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                </div>
              </div>
              <Field label="Marina / Location"   value={ohMarina}  set={setOhMarina} />
              <Field label="Address"             value={ohAddress} set={setOhAddress} />
              <Field label="RSVP Email"          value={ohRsvp}    set={setOhRsvp} />
              <TArea label="Message Body" rows={4} value={ohDesc}   set={setOhDesc} />
            </Card>
          )}

          {/* ── Newsletter fields ── */}
          {mode==="Newsletter" && (
            <>
              <Card title="Newsletter Header">
                <Field label="Title"    value={nlTitle}    set={setNlTitle} />
                <Field label="Subtitle" value={nlSubtitle} set={setNlSubtitle} />
                <TArea label="Opening paragraph" rows={3} value={nlIntro} set={setNlIntro} />
              </Card>
              {nlSections.map((s,i)=>(
                <Card key={s.id} title={`Section ${i+1}`}>
                  <Field label="Heading" value={s.heading} set={v=>updateNLSection(s.id,"heading",v)} />
                  <TArea label="Body" rows={5} value={s.body} set={v=>updateNLSection(s.id,"body",v)} />
                  <button onClick={()=>delNLSection(s.id)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded mt-1">Remove section</button>
                </Card>
              ))}
              <button onClick={addNLSection} className="text-sm px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 w-full">+ Add Section</button>
              <Card title="Featured Listings">
                <p className="text-xs text-gray-400 mb-3">Add up to 3 featured boats (thumbnail grid)</p>
                {nlFeatured.map((f,i)=>(
                  <div key={f.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">Featured #{i+1}</div>
                    <Field label="Vessel name" value={f.name}     set={v=>updateNLFeatured(f.id,"name",v)} />
                    <Field label="Price"       value={f.price}    set={v=>updateNLFeatured(f.id,"price",v)} />
                    <Field label="Image URL"   value={f.imageUrl} set={v=>updateNLFeatured(f.id,"imageUrl",v)} />
                    <Field label="Link URL"    value={f.url}      set={v=>updateNLFeatured(f.id,"url",v)} />
                    <button onClick={()=>delNLFeatured(f.id)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded">Remove</button>
                  </div>
                ))}
                {nlFeatured.length<3 && <button onClick={addNLFeatured} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">+ Add Featured Listing</button>}
              </Card>
            </>
          )}

          {/* ── Multi-Boat fields ── */}
          {mode==="Multi-Boat Showcase" && (
            <>
              <Card title="Showcase Header">
                <Field label="Brand Title (large)" value={showcaseTitle}    set={setShowcaseTitle} />
                <Field label="Subtitle"            value={showcaseSubtitle} set={setShowcaseSubtitle} />
                <Field label="Hero Image URL"      value={showcaseHeroUrl}  set={setShowcaseHeroUrl} />
                <TArea label="Intro paragraph" rows={4} value={showcaseIntro} set={setShowcaseIntro} />
              </Card>
              {boats.map((boat,i)=>(
                <Card key={boat.id} title={`Boat ${i+1}: ${boat.name||"Untitled"}`}>
                  <Field label="Name"         value={boat.name}          set={v=>updateBoat(boat.id,"name",v)} />
                  <TArea label="Description" rows={3} value={boat.description} set={v=>updateBoat(boat.id,"description",v)} />
                  <Field label="Price"        value={boat.price}         set={v=>updateBoat(boat.id,"price",v)} />
                  <Field label="Build Time"   value={boat.buildTime||""} set={v=>updateBoat(boat.id,"buildTime",v)} />
                  <Field label="Image URL"    value={boat.imageUrl}      set={v=>updateBoat(boat.id,"imageUrl",v)} />
                  <Field label="Image links to (URL)" value={boat.imageLink||""} set={v=>updateBoat(boat.id,"imageLink",v)} />
                  <Field label="Details Link" value={boat.ctaUrl}        set={v=>updateBoat(boat.id,"ctaUrl",v)} />
                  <button onClick={()=>delBoat(boat.id)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded mt-1">Remove boat</button>
                </Card>
              ))}
              <button onClick={addBoat} className="text-sm px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 w-full">+ Add Boat</button>
            </>
          )}

          {/* ── Shared: Image Layout ── */}
          <Card title="Image Layout">
            {/* Hero size + position — URL is set in the template form above */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="text-xs font-bold text-gray-700 mb-2">Hero Image</div>
              <Field label="Clicking hero goes to (optional)" value={heroLink} set={setHeroLink} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Size</div>
                  <div className="flex gap-1">
                    {(["100%","75%","50%","33%"] as const).map(s=>(
                      <button key={s} onClick={()=>setHeroSize(s)}
                        className={`flex-1 py-1 rounded text-[10px] font-semibold border-2 transition-all ${heroSize===s?"border-[#e57b2e] bg-orange-50 text-[#e57b2e]":"border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {s==="100%"?"Full":s==="75%"?"Large":s==="50%"?"Half":"⅓"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Position</div>
                  <select value={heroPosition} onChange={e=>setHeroPosition(e.target.value as typeof heroPosition)}
                    className="w-full px-2 py-1 rounded border border-gray-200 text-xs">
                    <option value="top">Top (default)</option>
                    <option value="after-specs">After specs</option>
                    <option value="after-desc">After description</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Second large image */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="text-xs font-bold text-gray-700 mb-1">Second Large Image <span className="font-normal text-gray-400">— upload a photo or map, or paste a URL</span></div>

              {/* URL + upload zone */}
              <div className="mb-2">
                <div className="text-xs text-gray-400 mb-1">Image</div>
                <div className="flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <input value={hero2Url} onChange={e=>setHero2Url(e.target.value)}
                      placeholder="Paste URL or upload →"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                  </div>
                  <Hero2Uploader onUrl={setHero2Url} currentUrl={hero2Url} />
                </div>
                {/* Preview */}
                {hero2Url && (
                  <div className="mt-2 relative rounded-lg overflow-hidden border border-gray-200" style={{maxHeight:120}}>
                    <img src={hero2Url} alt="" className="w-full object-cover block" style={{maxHeight:120}} onError={e=>{(e.currentTarget as HTMLImageElement).style.opacity="0.2";}} />
                    <button onClick={()=>setHero2Url("")}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{background:"rgba(0,0,0,.55)"}}>✕</button>
                  </div>
                )}
              </div>

              <Field label="Clicking it goes to (optional)" value={hero2Link} set={setHero2Link} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Size</div>
                  <div className="flex gap-1">
                    {(["100%","75%","50%","33%"] as const).map(s=>(
                      <button key={s} onClick={()=>setHero2Size(s)}
                        className={`flex-1 py-1 rounded text-[10px] font-semibold border-2 transition-all ${hero2Size===s?"border-[#1a2b4a] bg-blue-50 text-[#1a2b4a]":"border-gray-200 text-gray-500"}`}>
                        {s==="100%"?"Full":s==="75%"?"Large":s==="50%"?"Half":"⅓"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Position</div>
                  <select value={hero2Position} onChange={e=>setHero2Position(e.target.value as typeof hero2Position)}
                    className="w-full px-2 py-1 rounded border border-gray-200 text-xs">
                    <option value="top">Top (above hero)</option>
                    <option value="after-specs">After specs</option>
                    <option value="after-desc">After description</option>
                    <option value="after-gallery">After gallery</option>
                    <option value="bottom">Bottom (above signature)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gallery */}
            <div>
              <div className="text-xs font-bold text-gray-700 mb-2">Gallery</div>
              <Field label="Gallery images link to (optional)" value={galleryLink} set={setGalleryLink} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Columns</div>
                  <div className="flex gap-1">
                    {([1,2,3] as const).map(n=>(
                      <button key={n} onClick={()=>setGalleryColumns(n)}
                        className={`flex-1 py-1.5 rounded text-xs font-bold border-2 transition-all ${galleryColumns===n?"border-[#e57b2e] bg-orange-50 text-[#e57b2e]":"border-gray-200 text-gray-500"}`}>
                        {n===1?"1 Wide":n===2?"2 Col":"3 Col"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Position</div>
                  <select value={galleryPosition} onChange={e=>setGalleryPosition(e.target.value as typeof galleryPosition)}
                    className="w-full px-2 py-1 rounded border border-gray-200 text-xs">
                    <option value="after-hero">After hero image</option>
                    <option value="after-specs">After specs</option>
                    <option value="after-desc">After description</option>
                  </select>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Attachments">
            <p className="text-xs text-gray-400 mb-3">Attach PDFs, spec sheets, yacht lists, or any file — up to 10MB per file. Sent with every email in this campaign.</p>
            {attachments.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{a.name}</div>
                      <div className="text-xs text-gray-400">{(a.size / 1024).toFixed(0)} KB · {a.mimeType}</div>
                    </div>
                    <button onClick={() => removeAttachment(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-3 cursor-pointer hover:border-gray-300 transition-colors"
              style={{ minHeight: 56, padding: "12px 16px" }}
              onClick={() => attachInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) addAttachment(f); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <span className="text-sm text-gray-500">Drop a file or click to attach — PDF, XLSX, DOCX, images…</span>
            </div>
            <input ref={attachInputRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              onChange={e => { const f = e.target.files?.[0]; if (f) addAttachment(f); e.target.value = ""; }} />
          </Card>

          <Card title="CTA Buttons">
            <p className="text-xs text-gray-400 mb-3">The main CTA button is always included. Add extra buttons here (e.g. Schedule a Showing, Watch Video, Contact Will).</p>
            {extraButtons.map((btn) => (
              <div key={btn.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                  <input value={btn.text} onChange={e=>updateBtn(btn.id,"text",e.target.value)} placeholder="Button text" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                  <input value={btn.href} onChange={e=>updateBtn(btn.id,"href",e.target.value)} placeholder="https://…" className="px-2 py-1.5 rounded border border-gray-200 text-sm" />
                  <button onClick={()=>delBtn(btn.id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded">✕</button>
                </div>
                <div className="flex gap-2">
                  {[["#e57b2e","Orange"],["#1a2b4a","Navy"],["#0e7490","Teal"],["#16a34a","Green"],["#374151","Dark"]].map(([c,label])=>(
                    <button key={c} onClick={()=>updateBtn(btn.id,"color",c)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-white"
                      style={{ background: c, outline: btn.color===c ? "2px solid #000" : "none" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={addBtn} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 w-full">+ Add Button</button>
          </Card>

          {/* ── Broker Signatures (all modes) ── */}
          <Card title="Broker Signatures">
            <p className="text-xs text-gray-400 mb-3">Toggle which brokers appear in the email.</p>
            {agents.map((a,i)=>(
              <label key={a.name} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={a.enabled} onChange={()=>toggleAgent(i)} className="w-4 h-4 rounded" />
                <img src={a.photo} alt={a.name} className="w-10 h-10 rounded-full object-cover border-2 border-gray-200" />
                <div>
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="text-xs text-gray-400">{a.cell}</div>
                </div>
              </label>
            ))}
          </Card>
        {/* ── Live Preview (inline, toggleable) ── */}
        {livePreview && (
          <div className="mt-2 rounded-2xl overflow-hidden border border-gray-200 shadow-lg">
            <div className="flex items-center justify-between px-4 py-2 bg-[#1a2b4a] text-white">
              <span className="text-xs font-bold tracking-wide">Live Preview</span>
              <button onClick={()=>setLivePreview(false)} className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">✕ Close</button>
            </div>
            <iframe title="live-preview" srcDoc={html} className="w-full bg-white" style={{height:500,border:"none"}} />
          </div>
        )}
        </div>{/* end form */}

        {/* ── Sticky Action Bar ── */}
        <div className="fixed bottom-[72px] md:bottom-0 left-0 right-0 z-[110] bg-white border-t border-gray-200 shadow-lg safe-area-pb">
          {/* Action buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-2 md:p-3">
            {/* Col 1: Preview */}
            <button onClick={()=>setLivePreview(v=>!v)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${livePreview?"bg-[#e57b2e] text-white":"bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {livePreview ? "Hide Preview" : "Live Preview"}
            </button>
            {/* Col 2: Save / Load / Templates — collapsed into one button group */}
            <div className="flex gap-1">
              <button onClick={() => { setTmplNameInput(subject || mode); setTmplSaving(true); setShowTmplPanel(false); }}
                title="Save as template"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                Save
              </button>
              <button onClick={loadDraft}
                title="Load last saved draft"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></svg>
                Draft
              </button>
              <button onClick={() => { setShowTmplPanel(p=>!p); setTmplSaving(false); }}
                title="Browse saved templates"
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl text-xs font-semibold border transition-all ${showTmplPanel?"bg-indigo-600 text-white border-indigo-600":"bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                {savedTemplates.filter(t=>t.mode===mode).length > 0 ? `(${savedTemplates.filter(t=>t.mode===mode).length})` : "Tmpl"}
              </button>
            </div>
            {/* Col 3: Test buttons */}
            <div className="flex gap-1">
              <button onClick={()=>{ if(!subject.trim()){toast("Set a subject first","error");return;} doSend(true); }}
                disabled={sendStatus==="testing"||sendStatus==="sending"}
                title="Send test to yourself"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl bg-[#16a34a] text-white text-xs font-bold hover:bg-[#15803d] disabled:opacity-50">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                {sendStatus==="testing" ? "…" : "Test→Me"}
              </button>
              <button onClick={()=>{ if(!subject.trim()){toast("Set a subject first","error");return;} doSendToPaolo(); }}
                disabled={sendStatus==="testing"||sendStatus==="sending"}
                title="Send test to Paolo"
                className="flex-1 flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                →Paolo
              </button>
            </div>
            {/* Col 4: Copy HTML for Vertical Response */}
            <button onClick={()=>{
                navigator.clipboard.writeText(html).then(()=>{
                  toast("HTML copied — paste into Vertical Response","success");
                },()=>toast("Copy failed","error"));
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#0e7490] text-white text-xs font-semibold hover:bg-[#0a5f78]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy HTML
            </button>
          </div>

          {/* ── Save Template Panel ── */}
          {tmplSaving && (
            <div className="mt-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <p className="text-xs font-semibold text-indigo-800 mb-2">Name this template</p>
              <div className="flex gap-2">
                <input value={tmplNameInput} onChange={e=>setTmplNameInput(e.target.value)}
                  placeholder="e.g. PBIBS ONE Invite, Spring Newsletter…"
                  className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-indigo-300 outline-none bg-white"
                  onKeyDown={e=>e.key==="Enter"&&saveAsTemplate(tmplNameInput)} autoFocus />
                <button onClick={()=>saveAsTemplate(tmplNameInput)} className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">Save</button>
                <button onClick={()=>setTmplSaving(false)} className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 text-xs">Cancel</button>
              </div>
            </div>
          )}

          {/* ── Template Browser Panel ── */}
          {showTmplPanel && !tmplSaving && (
            <div className="mt-2 rounded-xl bg-indigo-50 border border-indigo-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-200 bg-indigo-100">
                <p className="text-xs font-bold text-indigo-800">Templates — {mode}</p>
                <div className="flex items-center gap-2">
                  <button onClick={()=>{ setTmplNameInput(subject || mode); setTmplSaving(true); setShowTmplPanel(false); }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                    + Save current
                  </button>
                  <button onClick={()=>setShowTmplPanel(false)} className="text-indigo-400 hover:text-indigo-700 text-base leading-none">✕</button>
                </div>
              </div>
              {savedTemplates.filter(t=>t.mode===mode).length === 0
                ? <p className="text-xs text-indigo-400 italic px-4 py-3">No templates saved for {mode} yet. Fill in the form and click "+ Save current" above.</p>
                : <div className="divide-y divide-indigo-100">
                    {savedTemplates.filter(t=>t.mode===mode).map(t=>(
                      <div key={t.name} className="flex items-center gap-2 px-4 py-2.5 hover:bg-indigo-100/60">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{t.name}</div>
                          <div className="text-[10px] text-gray-400">{new Date(t.savedAt).toLocaleDateString()} {new Date(t.savedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                        <button onClick={()=>loadTemplate(t)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">Load</button>
                        <button onClick={()=>deleteTemplate(t.name)} className="px-2 py-1.5 rounded-lg text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
              }
              <div className="px-4 py-2 border-t border-indigo-200 bg-indigo-100/50">
                <button onClick={()=>{ loadDraft(); setShowTmplPanel(false); }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.31"/></svg>
                  Load last auto-saved draft instead
                </button>
              </div>
            </div>
          )}

          {/* ── SMS Generator ── */}
          <div className="mt-3">
            <button onClick={()=>{ setSmsText(generateSms()); setSmsOpen(p=>!p); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {smsOpen ? "Hide SMS" : "Generate SMS / Text Message"}
            </button>
            {smsOpen && (
              <div className="mt-2 p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                {/* Image picker */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Include Image (MMS)</label>
                  {/* Thumbnail strip — click to select */}
                  {smsAvailableImages.length > 0 && (
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {smsAvailableImages.map((img, i) => (
                        <button key={i} type="button" title={img.label}
                          onClick={() => { setSmsImageUrl(img.url); setSmsText(generateSms(img.url, smsLinkUrl)); }}
                          className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${smsImageUrl===img.url?"border-[#e57b2e] shadow-md":"border-gray-200 hover:border-gray-400"}`}>
                          <img src={img.url} alt={img.label} className="w-full h-full object-cover"
                            onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}} />
                          {smsImageUrl===img.url && (
                            <div className="absolute inset-0 bg-[#e57b2e]/20 flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold">✓</span>
                            </div>
                          )}
                        </button>
                      ))}
                      {smsImageUrl && (
                        <button type="button" onClick={() => { setSmsImageUrl(""); setSmsText(generateSms("", smsLinkUrl)); }}
                          className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-500 text-xs flex-shrink-0">
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                  <input value={smsImageUrl} onChange={e=>{ setSmsImageUrl(e.target.value); setSmsText(generateSms(e.target.value, smsLinkUrl)); }}
                    placeholder="Or paste image URL…"
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white outline-none" />
                </div>
                {/* Link picker */}
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Include Link</label>
                  {/* Quick-select buttons for available links */}
                  {smsAvailableLinks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {smsAvailableLinks.map((lnk, i) => (
                        <button key={i} type="button"
                          onClick={() => { setSmsLinkUrl(smsLinkUrl===lnk.url?"":lnk.url); setSmsText(generateSms(smsImageUrl, smsLinkUrl===lnk.url?"":lnk.url)); }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${smsLinkUrl===lnk.url?"bg-[#e57b2e] text-white border-[#e57b2e]":"bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                          {lnk.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <input value={smsLinkUrl} onChange={e=>{ setSmsLinkUrl(e.target.value); setSmsText(generateSms(smsImageUrl, e.target.value)); }}
                    placeholder="Or paste link URL (listing, brochure, show site…)"
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white outline-none" />
                </div>
                {/* Message */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        TEXT MESSAGE · {smsText.length} chars
                      </p>
                      {smsText.length > 160 && (
                        <span className="text-[10px] font-semibold text-amber-600">
                          {Math.ceil(smsText.length / 153)} segments
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={()=>setSmsText(generateSms())} className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-600 hover:bg-gray-300" title="Regenerate">↺ Regenerate</button>
                      <button onClick={()=>{ const el=document.createElement("textarea");el.value=smsText;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);setSmsCopied(true);setTimeout(()=>setSmsCopied(false),2000); }}
                        className={`px-2 py-1 rounded text-xs font-semibold ${smsCopied?"bg-green-500 text-white":"bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                        {smsCopied?"✓ Copied":"Copy"}
                      </button>
                      <a href={`sms:&body=${encodeURIComponent(smsText)}`}
                        className="px-2 py-1 rounded text-xs font-semibold bg-[#16a34a] text-white hover:bg-[#15803d]">
                        Open in Messages
                      </a>
                    </div>
                  </div>
                  <textarea value={smsText} onChange={e=>setSmsText(e.target.value)} rows={6}
                    className="w-full text-sm p-2.5 rounded-lg border border-gray-200 bg-white resize-y outline-none leading-relaxed"
                    style={{ fontFamily: "inherit" }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Preview Panel ── */}
        <div className={`fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300 ${previewOpen?"opacity-100":"opacity-0 pointer-events-none"}`} onClick={()=>setPreviewOpen(false)} />
        <div className={`fixed top-0 right-0 h-full z-[70] flex flex-col transition-transform duration-300 ease-out ${previewOpen?"translate-x-0":"translate-x-full"}`} style={{width:"min(680px,92vw)"}}>
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--navy-950)] text-white shrink-0">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold tracking-wide">Email Preview</h3>
              <span className="text-[10px] text-[var(--navy-400)] font-mono">{ts()}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyHtml} className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${copied?"bg-[var(--sea-500)] text-white":"bg-[#e57b2e] text-white hover:bg-[#d06a20]"}`}>{copied?"✓ Copied":"Copy HTML"}</button>
              <button onClick={()=>{ if(!subject.trim()){toast("Set a subject first","error");return;} doSend(true); }} disabled={sendStatus==="testing"} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-[#16a34a] text-white hover:bg-[#15803d] disabled:opacity-50">{sendStatus==="testing"?"Sending…":"Test → Me"}</button>
              <button onClick={()=>setPreviewOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-[#1a2b4a]">
            <div className="mx-auto" style={{maxWidth:620,padding:"16px 10px"}}>
              <iframe title="email-preview" srcDoc={html} className="w-full bg-white rounded-lg shadow-2xl" style={{height:"calc(100vh - 72px)",border:"none"}} />
            </div>
          </div>
        </div>

        {/* ── Send Panel ── */}
        <div className={`fixed inset-0 bg-black/40 z-[60] transition-opacity duration-300 ${sendOpen?"opacity-100":"opacity-0 pointer-events-none"}`} onClick={()=>setSendOpen(false)} />
        <div className={`fixed top-0 right-0 h-full z-[70] flex flex-col transition-transform duration-300 ease-out ${sendOpen?"translate-x-0":"translate-x-full"}`} style={{width:"min(520px,96vw)"}}>
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--navy-950)] text-white shrink-0">
            <div><div className="text-sm font-bold">Send Campaign</div><div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[300px]">{subject||"No subject set"}</div></div>
            <button onClick={()=>setSendOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex gap-1 px-4 pt-3 pb-2 bg-white border-b border-gray-100 shrink-0">
            {(["pipeline","apple_contacts","all"] as const).map(s=>(
              <button key={s} onClick={()=>{setContactSource(s);setSelected(new Set());loadContacts(s);}} className={`text-xs px-3 py-1.5 rounded-full border transition-all ${contactSource===s?"bg-gray-800 text-white border-gray-800":"bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                {s==="pipeline"?"Pipeline Leads":s==="apple_contacts"?"Apple Contacts":"All"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 shrink-0">
            <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Search name, email, company…" className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm" />
            <button onClick={selectAll} className="text-xs text-blue-600 hover:underline whitespace-nowrap">All</button>
            <span className="text-gray-300">|</span>
            <button onClick={clearAll} className="text-xs text-gray-500 hover:underline whitespace-nowrap">None</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {contactsLoading?(<div className="flex items-center justify-center h-32 text-sm text-gray-400">Loading contacts…</div>)
            :filteredContacts.length===0?(<div className="flex items-center justify-center h-32 text-sm text-gray-400">No contacts found</div>)
            :(<div className="divide-y divide-gray-50">
              {filteredContacts.map(c=>(
                <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={()=>toggleSelect(c.id)} className="w-4 h-4 rounded shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-xs text-gray-400 truncate">{c.email}{c.company?` · ${c.company}`:""}</div>
                  </div>
                  <div className="ml-auto shrink-0"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.source==="apple_contacts"||c.source==="Apple Contacts"?"bg-gray-100 text-gray-500":"bg-blue-50 text-blue-700"}`}>{c.source==="apple_contacts"||c.source==="Apple Contacts"?"contact":c.source}</span></div>
                </label>
              ))}
            </div>)}
          </div>
          {/* Sticky banner when recipients selected */}
          {selected.size > 0 && sendStatus !== "done" && (
            <div className="px-4 py-2 bg-[#e57b2e]/10 border-t-2 border-[#e57b2e] shrink-0 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-[#e57b2e]">{selected.size} recipient{selected.size!==1?"s":""} selected</span>
                <span className="text-xs text-gray-500 ml-2">— ready to send</span>
              </div>
              <button
                onClick={() => doSend(false)}
                disabled={sendStatus==="sending"||sendStatus==="testing"}
                className="px-5 py-2 rounded-xl bg-[#e57b2e] text-white text-sm font-bold hover:bg-[#d06a20] disabled:opacity-50 flex items-center gap-2 shrink-0">
                {sendStatus==="sending"
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Sending…</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Send Now</>}
              </button>
            </div>
          )}
          <div className="px-4 py-4 bg-white border-t border-gray-100 shrink-0 space-y-3">
            {sendStatus==="done"&&sendResult&&(<div className="text-sm text-center py-2.5 px-3 bg-green-50 text-green-800 rounded-xl font-semibold border border-green-200">✓ Sent to {sendResult.sent} recipient{sendResult.sent!==1?"s":""}{sendResult.failed>0?` · ${sendResult.failed} failed`:""}</div>)}
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {selected.size>0
                  ? <><span className="font-semibold text-gray-900">{selected.size}</span> of {filteredContacts.length} selected</>
                  : <span className="text-amber-600 font-medium">← Select recipients above</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
                <span className="text-gray-300">|</span>
                <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">None</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={()=>doSend(true)}
                disabled={sendStatus==="sending"||sendStatus==="testing"}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {sendStatus==="testing"?"Sending test…":"Test → Me"}
              </button>
              <button
                onClick={doSendToPaolo}
                disabled={sendStatus==="sending"||sendStatus==="testing"}
                className="flex-1 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
                {sendStatus==="testing"?"…":"Test → Paolo"}
              </button>
              <button
                onClick={()=>doSend(false)}
                disabled={selected.size===0||sendStatus==="sending"||sendStatus==="testing"}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selected.size===0?"bg-gray-100 text-gray-400 cursor-not-allowed":"bg-[#e57b2e] text-white hover:bg-[#d06a20]"} disabled:opacity-50`}>
                {sendStatus==="sending"
                  ? "Sending…"
                  : selected.size===0
                    ? "Select recipients"
                    : `🚀 Send to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/* ═══════ UI Helpers ═══════ */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm"><div className="text-sm font-bold text-gray-900 mb-3">{title}</div>{children}</div>);
}
function Field({ label, value, set, placeholder }: { label: string; value: string; set: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mb-2">
      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <input value={value} onChange={e=>set(e.target.value)} placeholder={placeholder||label}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
    </div>
  );
}
function TArea({ label, value, set, rows=4 }: { label:string; value:string; set:(v:string)=>void; rows?:number }) {
  return (<div className="mb-2"><div className="text-xs text-gray-400 mb-1">{label}</div><textarea value={value} onChange={e=>set(e.target.value)} rows={rows} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-y" /></div>);
}
/* ── Hero2Uploader — drag-drop or click to upload a single image ── */
function Hero2Uploader({ onUrl, currentUrl }: { onUrl: (url: string) => void; currentUrl: string }) {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) { toast("Please select an image file", "error"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("files", file);
      const res = await fetch("/api/listings/upload", { method: "POST", body: form });
      const d = await res.json();
      if (d.ok && d.files?.[0]?.url) {
        onUrl(d.files[0].url);
        toast("Image uploaded");
      } else throw new Error(d.error || "Upload failed");
    } catch (err) { toast(err instanceof Error ? err.message : "Upload failed", "error"); }
    finally { setUploading(false); }
  }

  return (
    <div
      onClick={() => !uploading && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      title="Upload image or drop here"
      className="shrink-0 flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all"
      style={{
        width: 68, height: 68, minWidth: 68,
        borderColor: drag ? "#1a2b4a" : uploading ? "#e57b2e" : "#d1d5db",
        background: drag ? "rgba(26,43,74,.06)" : "transparent",
      }}>
      {uploading
        ? <div className="w-5 h-5 border-2 border-[#e57b2e] border-t-transparent rounded-full animate-spin" />
        : <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={drag?"#1a2b4a":"#9ca3af"} strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="text-[9px] text-gray-400 mt-1 text-center leading-tight">Upload<br/>photo</span>
          </>}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
    </div>
  );
}

function ImagePicker({ heroUrl, gallery, setHeroUrl, setGalleryText }: { heroUrl:string; gallery:string[]; setHeroUrl:(v:string)=>void; setGalleryText:(v:string)=>void }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-400 mb-1">Click an image to set as hero</div>
      <div className="flex gap-2 flex-wrap">
        {[heroUrl,...gallery].filter(Boolean).map((src,i)=>(
          <button key={`${src}-${i}`} onClick={()=>{
            if(src&&src!==heroUrl){const all=[heroUrl,...gallery].filter(Boolean);const ng=all.filter(u=>u!==src).slice(0,2);setHeroUrl(src);setGalleryText(ng.join("\n"));}
          }} className={`relative w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${src===heroUrl?"border-orange-500 ring-2 ring-orange-300":"border-gray-200 hover:border-gray-400"}`}>
            <img src={src} alt="" className="w-full h-full object-cover" />
            {src===heroUrl&&(<div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center"><span className="text-[9px] font-bold text-white bg-orange-500 px-1 rounded">HERO</span></div>)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════ Shared email pieces ═══════ */
function GalleryImageInput({ value, set }: { value: string; set: (v: string) => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!arr.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of arr) form.append("files", f);
      const res = await fetch("/api/listings/upload", { method: "POST", body: form });
      const d = await res.json();
      if (d.ok && d.files?.length) {
        const newUrls: string[] = d.files.map((f: any) => f.url);
        const existing = value.split("\n").map((s: string) => s.trim()).filter(Boolean);
        const merged = [...existing, ...newUrls].slice(0, 6);
        set(merged.join("\n"));
        toast(`${d.files.length} image${d.files.length > 1 ? "s" : ""} uploaded`);
      }
    } catch { toast("Upload failed", "error"); }
    setUploading(false);
  }

  const urls = value.split("\n").map((s: string) => s.trim()).filter(Boolean);

  return (
    <div className="mb-3">
      <div className="text-xs text-gray-400 mb-1.5 font-medium">Gallery Images (max 6)</div>
      <div className="flex gap-2 mb-2">
        {/* URL textarea */}
        <textarea
          value={value}
          onChange={e => set(e.target.value)}
          rows={3}
          placeholder={"Paste image URLs (one per line)\nhttps://cdn.example.com/photo1.jpg"}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)] text-[var(--navy-900)] dark:text-white resize-y"
          style={{ minHeight: 72 }}
        />
        {/* Upload button */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors shrink-0"
          style={{
            width: 88, minHeight: 72,
            borderColor: dragOver ? "#c5a064" : "var(--sand-200)",
            background: dragOver ? "rgba(197,160,100,.07)" : "transparent",
          }}
        >
          {uploading
            ? <span className="text-xs text-gray-400 animate-pulse">Uploading…</span>
            : <>
                <span className="text-lg mb-0.5">📎</span>
                <span className="text-[10px] text-center leading-tight" style={{ color: "var(--navy-400)" }}>Drop or<br/>click</span>
              </>}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>
      </div>
      {/* Thumbnails */}
      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {urls.map((src, i) => (
            <div key={i} className="relative rounded overflow-hidden" style={{ height: 52 }}>
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => set(urls.filter((_, j) => j !== i).join("\n"))}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: "rgba(0,0,0,.6)" }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Renders extra CTA buttons in a row below the main button */
/* Renders specs in rows of 3 for email tables */
function chunkSpecs(specs: Spec[]): string {
  const rows: string[] = [];
  for (let i = 0; i < specs.length; i += 3) {
    const row = specs.slice(i, i+3);
    rows.push(`<tr>${row.map(s=>`<td width="33%" style="padding:6px 0;"><div style="color:${LABEL};font-size:10px;letter-spacing:0.5px;font-weight:700;">${esc(s.label)}</div><div style="color:#fff;font-size:13px;font-weight:700;margin-top:1px;">${esc(s.value)}</div></td>`).join("")}</tr>`);
  }
  return rows.join("");
}

/* Shared image/layout options passed to every builder */
type ImgOpts = {
  heroSize: "100%"|"75%"|"50%"|"33%";
  heroPosition: string;
  hero2Url: string; hero2Link: string; hero2Size: "100%"|"75%"|"50%"|"33%"; hero2Position: string;
  galleryColumns: 1|2|3; galleryPosition: string; galleryLink: string;
};

/* Render a sized/linked image row */
function sizedImg(src: string, link: string, size: string): string {
  if (!src) return "";
  const absSrc = toAbs(src);
  const isFullWidth = size === "100%";
  const maxPx = size==="75%"?"450":size==="50%"?"300":size==="33%"?"200":"600";
  const imgStyle = isFullWidth
    ? "display:block;width:100%;max-width:100%;height:auto;"
    : `display:block;width:${size};max-width:${maxPx}px;height:auto;margin:0 auto;`;
  const img = `<img src="${escA(absSrc)}" alt="" style="${imgStyle}" />`;
  const wrapped = link ? `<a href="${escA(link)}" style="display:block;text-align:center;line-height:0;">${img}</a>` : img;
  const pad = isFullWidth ? "" : "padding:8px 24px;";
  return `<tr><td style="${pad}text-align:center;">${wrapped}</td></tr>`;
}

/* Render hero at a specific position check */
function heroAtPos(pos: string, targetPos: string, url: string, link: string, size: string): string {
  if (!url || pos !== targetPos) return "";
  return sizedImg(url, link, size);
}

/* Render gallery rows with configurable columns */
function galleryHtml(imgs: string[], cols: 1|2|3, link: string): string {
  if (!imgs.length) return "";
  const colW = cols===1?"100%":cols===2?"50%":"33%";
  const rows: string[] = [];
  for (let i = 0; i < imgs.length; i += cols) {
    const batch = imgs.slice(i, i+cols);
    rows.push(`<tr>${batch.map(src=>`<td width="${colW}" style="padding:3px;">${linkedImg(src, link, "display:block;width:100%;height:auto;border-radius:4px;")}</td>`).join("")}</tr>`);
  }
  return `<tr><td style="padding:4px 24px 16px;"><table role="presentation" width="100%">${rows.join("")}</table></td></tr>`;
}

/* Render second image at a named position */
function hero2Html(pos: string, targetPos: string, url: string, link: string, size: string): string {
  if (!url || pos !== targetPos) return "";
  return sizedImg(url, link, size);
}

function extraButtonsHtml(buttons: CtaButton[]): string {
  if (!buttons.length) return "";
  return `<tr><td align="center" style="padding:4px 24px 16px;">
    <table role="presentation" style="margin:0 auto;"><tr>
      ${buttons.map(b => `<td style="padding:0 5px;">
        <a href="${escA(b.href)}" style="display:inline-block;font-size:12px;color:#fff;background:${b.color};padding:10px 22px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:0.8px;">${esc(b.text)}</a>
      </td>`).join("")}
    </tr></table>
  </td></tr>`;
}

/* Wraps an img tag in an anchor when a link URL is provided */
function linkedImg(src: string, link: string, style: string, alt = ""): string {
  const absSrc = toAbs(src);
  const img = `<img src="${escA(absSrc)}" alt="${escA(alt)}" style="${style}" />`;
  return link ? `<a href="${escA(link)}" style="display:block;line-height:0;">${img}</a>` : img;
}

function agentCardHtml(a: Agent): string {
  const photo = a.photo.startsWith("http") ? a.photo : `${RAILWAY_URL}${a.photo}`;
  const isWill = a.email.toLowerCase().includes("wn@denison");
  return `<tr><td style="padding:20px 24px 10px;"><table role="presentation" width="100%" style="border-top:1px solid #e2e8f0;padding-top:20px;"><tr>
    <td width="100" valign="top" style="padding-right:16px;"><img src="${escA(photo)}" width="100" height="100" style="display:block;width:100px;height:100px;border-radius:50%;object-fit:cover;" /></td>
    <td valign="top" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${TEXT};">
      <div style="font-size:18px;font-weight:800;color:${DARK_BLUE};">${esc(a.name)}</div>
      <div style="font-size:12px;color:${GRAY};margin-bottom:8px;">${esc(a.title)}</div>
      <table role="presentation" style="margin-top:4px;">
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;padding-bottom:4px;">EMAIL</td><td style="font-size:13px;padding-bottom:4px;"><a href="mailto:${escA(a.email)}" style="color:${DARK_BLUE};text-decoration:none;">${esc(a.email)}</a></td></tr>
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;padding-bottom:4px;">CELL&nbsp;|&nbsp;WHATSAPP</td><td style="font-size:13px;padding-bottom:4px;"><a href="https://wa.me/${a.cell.replace(/\D/g,"")}" style="color:${DARK_BLUE};text-decoration:none;">${esc(a.cell)}</a></td></tr>
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;padding-bottom:4px;">OFFICE</td><td style="font-size:13px;padding-bottom:4px;">${esc(a.office)}</td></tr>
        ${isWill ? `<tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;">INSTAGRAM</td><td style="font-size:13px;"><a href="https://www.instagram.com/yachtslinger" style="color:${DARK_BLUE};text-decoration:none;">@yachtslinger</a></td></tr>` : ""}
      </table>
    </td>
  </tr></table></td></tr>`;
}

function denisonFooterHtml(): string {
  return `<tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="background:${NAVY};padding:24px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <img src="${escA(DENISON_HEADER_IMG)}" width="200" style="display:inline-block;width:200px;height:auto;margin-bottom:16px;" />
    <div style="font-size:9px;color:#94a3b8;line-height:1.8;letter-spacing:0.5px;max-width:480px;margin:0 auto 16px;">${esc(OFFICES)}</div>
    <div style="margin-bottom:12px;"><a href="mailto:WN@DenisonYachting.com" style="color:#ffffff;text-decoration:none;font-size:12px;">WN@DenisonYachting.com</a><span style="color:#64748b;font-size:12px;"> | 850.461.3342</span></div>
    <div style="font-size:10px;color:#64748b;line-height:1.6;">Proud member of: IYBA, MYBA, CYBA, YBAA, MIASF, NWYBA, NMMA<br/>Will Noftsinger &nbsp;·&nbsp; Denison Yachting &nbsp;·&nbsp; Fort Lauderdale, FL<br/><br/>You received this email because you are a client or contact of Will Noftsinger.<br/><a href="#" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a></div>
  </td></tr>`;
}

function emailShell(subject: string, bodyRows: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title>
<style>body,table,td{font-family:Arial,Helvetica,sans-serif;}img{border:0;line-height:0;outline:none;text-decoration:none;}table{border-collapse:collapse;}@media(max-width:620px){.c{width:100%!important;}.p{padding-left:12px!important;padding-right:12px!important;}}</style>
</head><body style="margin:0;padding:0;background:${NAVY};">
<table role="presentation" width="100%" bgcolor="${NAVY}"><tr><td align="center" class="p">
  <table role="presentation" width="600" class="c" style="width:600px;">
    <tr><td align="center" style="padding:16px 0;"><img src="${escA(DENISON_HEADER_IMG)}" width="600" style="display:block;width:600px;max-width:100%;height:auto;" /></td></tr>
  </table>
  <table role="presentation" width="600" class="c" style="width:600px;background:#ffffff;">${bodyRows}</table>
</td></tr></table></body></html>`;
}

/* ═══════════════════════════════════════════
   HTML BUILDERS
═══════════════════════════════════════════ */

/* ─── Single Listing (& New Listing) ─── */
function buildSingleListingHtml(opts:{subject:string;bannerTag:string;headline:string;location:string;ctaText:string;ctaHref:string;heroUrl:string;heroLink:string;price:string;intro:string;gallery:string[];specs:Spec[];featuresText:string;agents:Agent[];extraButtons:CtaButton[]}&ImgOpts): string {
  const {subject,bannerTag,headline,location,ctaText,ctaHref,price,heroUrl,heroLink,intro,gallery,specs,featuresText,agents,extraButtons,heroSize,heroPosition,hero2Url,hero2Link,hero2Size,hero2Position,galleryColumns,galleryPosition,galleryLink}=opts;
  const r1=specs.slice(0,3),r2=specs.slice(3,6);
  const specRow=(row:Spec[])=>row.length?`<tr>${row.map(s=>`<td width="33%" style="padding:8px 0;text-align:left;"><div style="color:${LABEL};font-size:11px;letter-spacing:0.5px;font-weight:700;">${esc(s.label)}</div><div style="color:#fff;font-size:14px;font-weight:700;margin-top:2px;">${esc(s.value)}</div></td>`).join("")}</tr>`:"";
  const features=featuresText.split("\n").map(t=>t.trim()).filter(Boolean);
  const galHtml = galleryHtml(gallery, galleryColumns, galleryLink);
  const body=`
    ${hero2Html(hero2Position,"top",hero2Url,hero2Link,hero2Size)}
    ${heroAtPos(heroPosition,"top",heroUrl,heroLink,heroSize)}
    ${hero2Html(hero2Position,"after-hero",hero2Url,hero2Link,hero2Size)}
    ${galleryPosition==="after-hero"?galHtml:""}
    ${r1.length||r2.length?`<tr><td style="padding:0 24px 4px;"><table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};margin:0;"><tr><td style="padding:10px 20px 2px;"><div style="color:#fff;font-weight:800;font-size:13px;letter-spacing:0.5px;border-bottom:1px solid ${ORANGE};padding-bottom:6px;">SPECIFICATIONS</div></td></tr><tr><td style="padding:2px 20px 10px;"><table role="presentation" width="100%">${specRow(r1)}${specRow(r2)}</table></td></tr></table></td></tr>`:""}
    ${heroAtPos(heroPosition,"after-specs",heroUrl,heroLink,heroSize)}
    ${hero2Html(hero2Position,"after-specs",hero2Url,hero2Link,hero2Size)}
    ${galleryPosition==="after-specs"?galHtml:""}
    <tr><td align="center" style="background:${ORANGE};color:#fff;font-weight:700;font-size:14px;padding:10px 16px;">${esc(bannerTag)}</td></tr>
    <tr><td align="center" style="padding:20px 24px 0;"><div style="font-size:22px;color:${DARK_BLUE};font-weight:800;">${esc(headline)}</div><div style="font-size:12px;color:${DARK_BLUE};margin-top:6px;">📍 ${esc(location)}</div></td></tr>
    <tr><td align="center" style="padding:14px 24px;"><a href="${escA(ctaHref)}" style="display:inline-block;font-size:12px;color:${ORANGE};border:2px solid ${ORANGE};padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${esc(ctaText)}</a></td></tr>
    ${extraButtonsHtml(extraButtons)}
    ${intro?`<tr><td style="padding:4px 24px 12px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(intro)}</p></td></tr>`:""}
    ${heroAtPos(heroPosition,"after-desc",heroUrl,heroLink,heroSize)}
    ${hero2Html(hero2Position,"after-desc",hero2Url,hero2Link,hero2Size)}
    ${price?`<tr><td align="center" style="padding:8px 24px 16px;font-size:20px;color:${ORANGE};font-weight:800;">${esc(price)}</td></tr>`:""}
    ${galleryPosition==="after-desc"?galHtml:""}
    ${hero2Html(hero2Position,"after-gallery",hero2Url,hero2Link,hero2Size)}
    ${features.length?`<tr><td style="padding:12px 24px 8px;"><div style="color:${DARK_BLUE};font-weight:800;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">KEY FEATURES</div><ul style="padding-left:20px;margin:10px 0 0;">${features.map(f=>`<li style="margin-bottom:6px;font-size:14px;color:${TEXT};line-height:1.5;">${esc(f)}</li>`).join("")}</ul></td></tr>`:""}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Price Drop ─── */
function buildPriceDropHtml(opts:{subject:string;headline:string;location:string;ctaHref:string;price:string;wasPrice:string;heroUrl:string;heroLink:string;intro:string;gallery:string[];specs:Spec[];featuresText:string;agents:Agent[];extraButtons:CtaButton[]}&ImgOpts): string {
  const {subject,headline,location,ctaHref,price,wasPrice,heroUrl,heroLink,intro,gallery,specs,featuresText,agents,extraButtons,heroSize,heroPosition,hero2Url,hero2Link,hero2Size,hero2Position,galleryColumns,galleryPosition,galleryLink}=opts;
  const r1=specs.slice(0,3),r2=specs.slice(3,6);
  const specRow=(row:Spec[])=>row.length?`<tr>${row.map(s=>`<td width="33%" style="padding:8px 0;"><div style="color:${LABEL};font-size:11px;font-weight:700;">${esc(s.label)}</div><div style="color:#fff;font-size:14px;font-weight:700;margin-top:2px;">${esc(s.value)}</div></td>`).join("")}</tr>`:"";
  const features=featuresText.split("\n").map(t=>t.trim()).filter(Boolean);
  const galHtml=galleryHtml(gallery,galleryColumns,galleryLink);
  const body=`
    ${hero2Html(hero2Position,"top",hero2Url,hero2Link,hero2Size)}
    ${heroAtPos(heroPosition,"top",heroUrl,heroLink,heroSize)}
    ${r1.length||r2.length?`<tr><td style="padding:0 24px 4px;"><table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};margin:0;"><tr><td style="padding:10px 20px 2px;"><div style="color:#fff;font-weight:800;font-size:13px;letter-spacing:0.5px;border-bottom:1px solid #dc2626;padding-bottom:6px;">SPECIFICATIONS</div></td></tr><tr><td style="padding:2px 20px 10px;"><table role="presentation" width="100%">${specRow(r1)}${specRow(r2)}</table></td></tr></table></td></tr>`:""}
    ${galleryPosition==="after-specs"?galHtml:""}
    <tr><td align="center" style="background:#dc2626;color:#fff;font-weight:800;font-size:15px;padding:12px 16px;letter-spacing:1px;">📉 PRICE REDUCED</td></tr>
    <tr><td align="center" style="padding:20px 24px 4px;"><div style="font-size:22px;color:${DARK_BLUE};font-weight:800;">${esc(headline)}</div><div style="font-size:12px;color:${DARK_BLUE};margin-top:6px;">📍 ${esc(location)}</div></td></tr>
    <tr><td align="center" style="padding:12px 24px 4px;">${wasPrice?`<div style="font-size:16px;color:#94a3b8;text-decoration:line-through;margin-bottom:4px;">${esc(wasPrice)}</div>`:""}<div style="font-size:28px;color:#dc2626;font-weight:900;">${esc(price)}</div><div style="font-size:11px;color:#64748b;margin-top:4px;letter-spacing:0.5px;">NEW ASKING PRICE</div></td></tr>
    <tr><td align="center" style="padding:12px 24px 16px;"><a href="${escA(ctaHref)}" style="display:inline-block;font-size:12px;color:#fff;background:#dc2626;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;">VIEW LISTING</a></td></tr>
    ${extraButtonsHtml(extraButtons)}
    ${intro?`<tr><td style="padding:4px 24px 12px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(intro)}</p></td></tr>`:""}
    ${hero2Html(hero2Position,"after-desc",hero2Url,hero2Link,hero2Size)}
    ${galleryPosition==="after-desc"?galHtml:""}
    ${hero2Html(hero2Position,"after-gallery",hero2Url,hero2Link,hero2Size)}
    ${features.length?`<tr><td style="padding:12px 24px 8px;"><div style="color:${DARK_BLUE};font-weight:800;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">KEY FEATURES</div><ul style="padding-left:20px;margin:10px 0 0;">${features.map(f=>`<li style="margin-bottom:6px;font-size:14px;color:${TEXT};line-height:1.5;">${esc(f)}</li>`).join("")}</ul></td></tr>`:""}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

function buildBoatShowHtml(opts:{subject:string;heroUrl:string;heroLink:string;showName:string;showDates:string;showVenue:string;showBooth:string;showAddress:string;showDesc:string;showCta:string;showCtaUrl:string;gallery:string[];agents:Agent[];extraButtons:CtaButton[];showVesselName:string;showVesselSpecs:Spec[];showVesselDesc:string;showVesselCtaUrl:string}&ImgOpts): string {
  const {subject,heroUrl,heroLink,showName,showDates,showVenue,showBooth,showAddress,showDesc,showCta,showCtaUrl,gallery,agents,extraButtons,showVesselName,showVesselSpecs,showVesselDesc,showVesselCtaUrl,heroSize,heroPosition,hero2Url,hero2Link,hero2Size,hero2Position,galleryColumns,galleryPosition,galleryLink}=opts;
  const galHtml = galleryHtml(gallery, galleryColumns, galleryLink);

  // Vessel spec block — only when vessel was imported
  const vesselBlock = showVesselName ? `
    <tr><td style="padding:0 24px 4px;">
      <div style="border-top:2px solid ${ORANGE};margin-top:4px;"></div>
    </td></tr>
    <tr><td style="padding:8px 24px 0;text-align:center;">
      <div style="font-size:11px;color:${ORANGE};letter-spacing:2px;font-weight:700;margin-bottom:6px;">ON DISPLAY</div>
      <div style="font-size:22px;font-weight:800;color:${DARK_BLUE};">${esc(showVesselName)}</div>
    </td></tr>
    ${showVesselSpecs.length ? `<tr><td style="padding:8px 24px 4px;">
      <table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px;">
        <tr><td style="padding:10px 16px 2px;"><div style="color:#fff;font-weight:800;font-size:11px;letter-spacing:0.5px;border-bottom:1px solid ${ORANGE};padding-bottom:5px;">SPECIFICATIONS</div></td></tr>
        <tr><td style="padding:4px 16px 10px;">
          <table role="presentation" width="100%">
            ${chunkSpecs(showVesselSpecs)}
          </table>
        </td></tr>
      </table>
    </td></tr>` : ""}
    ${showVesselDesc ? `<tr><td style="padding:8px 24px 4px;"><p style="margin:0;font-size:13px;color:${GRAY};line-height:1.65;">${esc(showVesselDesc.slice(0,400))}${showVesselDesc.length>400?"…":""}</p></td></tr>` : ""}
    ${showVesselCtaUrl ? `<tr><td align="center" style="padding:10px 24px 8px;"><a href="${escA(showVesselCtaUrl)}" style="display:inline-block;font-size:11px;color:${ORANGE};border:2px solid ${ORANGE};padding:8px 20px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;">VIEW FULL SPECS</a></td></tr>` : ""}
  ` : "";
  const body=`
    ${hero2Html(hero2Position,"top",hero2Url,hero2Link,hero2Size)}
    ${heroAtPos(heroPosition,"top",heroUrl,heroLink,heroSize)}
    <tr><td align="center" style="background:${NAVY};padding:20px 24px;">
      <div style="font-size:11px;color:${ORANGE};letter-spacing:2px;font-weight:700;margin-bottom:8px;">YOU'RE INVITED</div>
      <div style="font-size:26px;font-weight:900;color:#ffffff;">${esc(showName)}</div>
    </td></tr>
    <tr><td style="padding:20px 24px 0;">
      <table role="presentation" width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <tr>
          <td width="50%" valign="middle" style="padding:16px 20px;border-right:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:6px;">DATES</div>
            <div style="font-size:14px;color:${DARK_BLUE};font-weight:700;line-height:1.4;">${esc(showDates)}</div>
            ${showAddress?`<div style="font-size:11px;color:${GRAY};margin-top:8px;line-height:1.5;">${showAddress.includes("http")?`<a href="${escA(showAddress)}" style="color:${GRAY};text-decoration:underline;">${esc(showAddress)}</a>`:esc(showAddress)}</div>`:""}
          </td>
          <td width="50%" valign="middle" style="padding:16px 20px;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:6px;">FIND US AT</div>
            <div style="font-size:13px;color:${DARK_BLUE};font-weight:700;line-height:1.4;">${esc(showBooth)}</div>
            ${showVenue?`<div style="font-size:11px;color:${GRAY};margin-top:6px;line-height:1.4;">${esc(showVenue)}</div>`:""}
          </td>
        </tr>
      </table>
    </td></tr>
    ${hero2Html(hero2Position,"after-specs",hero2Url,hero2Link,hero2Size)}
    ${showDesc?`<tr><td style="padding:16px 24px 8px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.7;text-align:center;">${esc(showDesc)}</p></td></tr>`:""}
    ${hero2Html(hero2Position,"after-desc",hero2Url,hero2Link,hero2Size)}
    ${vesselBlock}
    ${galleryHtml(gallery, galleryColumns, galleryLink)}
    ${hero2Html(hero2Position,"after-gallery",hero2Url,hero2Link,hero2Size)}
    <tr><td align="center" style="padding:16px 24px 24px;"><a href="${escA(showCtaUrl)}" style="display:inline-block;font-size:13px;color:#fff;background:${ORANGE};padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:800;letter-spacing:1px;">${esc(showCta)}</a></td></tr>
    ${extraButtonsHtml(extraButtons)}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Open House ─── */
function buildOpenHouseHtml(opts:{subject:string;heroUrl:string;heroLink:string;ohVessel:string;ohDate:string;ohTime:string;ohMarina:string;ohAddress:string;ohDesc:string;ohRsvp:string;agents:Agent[];extraButtons:CtaButton[]}&ImgOpts): string {
  const {subject,heroUrl,heroLink,ohVessel,ohDate,ohTime,ohMarina,ohAddress,ohDesc,ohRsvp,agents,extraButtons,heroSize,heroPosition,hero2Url,hero2Link,hero2Size,hero2Position}=opts;
  const body=`
    ${hero2Html(hero2Position,"top",hero2Url,hero2Link,hero2Size)}
    ${heroAtPos(heroPosition,"top",heroUrl,heroLink,heroSize)}
    <tr><td align="center" style="background:${DARK_BLUE};padding:20px 24px;">
      <div style="font-size:11px;color:${ORANGE};letter-spacing:2px;font-weight:700;margin-bottom:6px;">EXCLUSIVE PRIVATE SHOWING</div>
      <div style="font-size:24px;font-weight:900;color:#ffffff;">${esc(ohVessel)}</div>
    </td></tr>
    <tr><td style="padding:20px 24px 0;">
      <table role="presentation" width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <tr>
          <td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:4px;">DATE</div>
            <div style="font-size:13px;color:${DARK_BLUE};font-weight:700;">${esc(ohDate)}</div>
            <div style="font-size:13px;color:${DARK_BLUE};font-weight:700;margin-top:4px;">${esc(ohTime)}</div>
          </td>
          <td width="50%" style="padding:16px 20px;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:13px;color:${DARK_BLUE};font-weight:700;">${esc(ohMarina)}</div>
            ${ohAddress?`<div style="font-size:11px;color:${GRAY};margin-top:4px;line-height:1.4;">${esc(ohAddress)}</div>`:""}
          </td>
        </tr>
      </table>
    </td></tr>
    ${ohDesc?`<tr><td style="padding:16px 24px 8px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.7;text-align:center;">${esc(ohDesc)}</p></td></tr>`:""}
    ${ohRsvp?`<tr><td align="center" style="padding:16px 24px 8px;"><a href="mailto:${escA(ohRsvp)}?subject=RSVP — ${escA(ohVessel)} Showing" style="display:inline-block;font-size:13px;color:#fff;background:${DARK_BLUE};padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:800;letter-spacing:1px;">RSVP NOW → ${esc(ohRsvp)}</a></td></tr>`:""}
    ${extraButtonsHtml(extraButtons)}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Newsletter ─── */
function buildNewsletterHtml(opts:{subject:string;nlTitle:string;nlSubtitle:string;nlIntro:string;nlSections:NLSection[];nlFeatured:NLFeatured[];agents:Agent[];extraButtons:CtaButton[]}&ImgOpts): string {
  const {subject,nlTitle,nlSubtitle,nlIntro,nlSections,nlFeatured,agents,extraButtons,hero2Url,hero2Link,hero2Size,hero2Position}=opts;
  const sectionHtml = nlSections.map(s=>`
    <tr><td style="padding:16px 24px 4px;">
      <div style="font-size:15px;font-weight:800;color:${DARK_BLUE};border-bottom:2px solid ${ORANGE};padding-bottom:6px;margin-bottom:10px;">${esc(s.heading)}</div>
      <p style="margin:0;font-size:14px;color:${GRAY};line-height:1.7;">${esc(s.body).replace(/\n/g,"<br/>")}</p>
    </td></tr>`).join("");
  const featuredHtml = nlFeatured.filter(f=>f.name).length>0 ? `
    <tr><td style="padding:20px 24px 8px;">
      <div style="font-size:14px;font-weight:800;color:${DARK_BLUE};letter-spacing:0.3px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:14px;">FEATURED LISTINGS</div>
      <table role="presentation" width="100%"><tr>
        ${nlFeatured.filter(f=>f.name).slice(0,3).map(f=>`
          <td valign="top" style="padding:4px;width:${Math.floor(100/Math.min(nlFeatured.filter(x=>x.name).length,3))}%;">
            <a href="${escA(f.url||"#")}" style="text-decoration:none;display:block;">
              ${f.imageUrl?`<img src="${escA(toAbs(f.imageUrl))}" width="100%" style="display:block;width:100%;height:auto;border-radius:6px;margin-bottom:6px;" />`:""}
              <div style="font-size:13px;font-weight:700;color:${DARK_BLUE};">${esc(f.name)}</div>
              ${f.price?`<div style="font-size:12px;color:${ORANGE};font-weight:700;">${esc(f.price)}</div>`:""}
            </a>
          </td>`).join("")}
      </tr></table>
    </td></tr>` : "";

  const body=`
    <tr><td align="center" style="background:${NAVY};padding:24px;">
      <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:1px;">${esc(nlTitle)}</div>
      ${nlSubtitle?`<div style="font-size:11px;color:#94a3b8;letter-spacing:1px;margin-top:6px;">${esc(nlSubtitle)}</div>`:""}
    </td></tr>
    ${nlIntro?`<tr><td style="padding:20px 24px 8px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.7;border-left:3px solid ${ORANGE};padding-left:12px;font-style:italic;">${esc(nlIntro)}</p></td></tr>`:""}
    ${sectionHtml}
    ${featuredHtml}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${extraButtonsHtml(extraButtons)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Multi-Boat Showcase ─── */
function buildMultiBoatHtml(opts:{subject:string;showcaseTitle:string;showcaseSubtitle:string;showcaseIntro:string;showcaseHeroUrl:string;heroLink:string;boats:BoatCard[];agents:Agent[];extraButtons:CtaButton[]}&ImgOpts): string {
  const {subject,showcaseTitle,showcaseSubtitle,showcaseIntro,showcaseHeroUrl,heroLink,boats,agents,extraButtons,heroSize,heroPosition,hero2Url,hero2Link,hero2Size,hero2Position}=opts;
  const boatRows=boats.map(b=>`
    <tr><td style="padding:8px 24px 0;"><div style="text-align:center;font-size:20px;font-weight:800;color:${DARK_BLUE};padding:16px 0 8px;border-top:2px solid ${ORANGE};">${esc(b.name)}</div></td></tr>
    ${b.imageUrl?`<tr><td style="padding:0 24px;"><table role="presentation" width="100%"><tr>
      <td width="50%" valign="top" style="padding-right:8px;">${linkedImg(b.imageUrl, b.imageLink||b.ctaUrl||"", "display:block;width:100%;height:auto;border-radius:4px;")}</td>
      <td width="50%" valign="top" style="padding-left:8px;font-size:13px;color:${GRAY};line-height:1.55;">${esc(b.description)}${b.buildTime?`<div style="margin-top:10px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>`:""}<div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div></td>
    </tr></table></td></tr>`:`<tr><td style="padding:4px 24px;font-size:13px;color:${GRAY};line-height:1.55;">${esc(b.description)}${b.buildTime?`<div style="margin-top:6px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>`:""}<div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div></td></tr>`}
    ${b.ctaUrl?`<tr><td align="center" style="padding:12px 24px 16px;"><a href="${escA(b.ctaUrl)}" style="display:inline-block;font-size:11px;color:#fff;background:${ORANGE};padding:8px 18px;border-radius:4px;text-decoration:none;font-weight:700;">SEE FULL DETAILS</a></td></tr>`:""}`).join("");

  const body=`
    ${hero2Html(hero2Position,"top",hero2Url,hero2Link,hero2Size)}
    ${heroAtPos(heroPosition,"top",showcaseHeroUrl,heroLink,heroSize)}
    <tr><td align="center" style="padding:24px 24px 8px;"><div style="font-size:36px;font-weight:900;color:${DARK_BLUE};letter-spacing:2px;">${esc(showcaseTitle)}</div>${showcaseSubtitle?`<div style="font-size:13px;color:${GRAY};letter-spacing:3px;margin-top:4px;">${esc(showcaseSubtitle)}</div>`:""}</td></tr>
    ${showcaseIntro?`<tr><td style="padding:8px 32px 16px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(showcaseIntro)}</p></td></tr>`:""}
    ${boatRows}
    ${hero2Html(hero2Position,"bottom",hero2Url,hero2Link,hero2Size)}
    ${extraButtonsHtml(extraButtons)}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}
