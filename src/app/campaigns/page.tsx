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
type BoatCard = { id: string; name: string; description: string; price: string; imageUrl: string; ctaUrl: string; buildTime?: string };
type NLSection  = { id: string; heading: string; body: string };
type NLFeatured = { id: string; name: string; price: string; imageUrl: string; url: string };
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
    { name:"Will Noftsinger", title:"Yacht Broker, Denison Yachting", email:"WN@DenisonYachting.com",  cell:"850.461.3342",  office:"786.482.5000", photo:"/email/will-noftsinger.jpg", enabled:true  },
    { name:"Paolo Ameglio",   title:"Yacht Broker, Denison Yachting", email:"PGA@DenisonYachting.com", cell:"786.251.2588",  office:"954.763.3971", photo:"/email/paolo-ameglio.png",   enabled:false },
    { name:"Peter Quintal",   title:"Yacht Broker, Denison Yachting", email:"Peter@DenisonYachting.com",cell:"(954) 817-5662",office:"954.763.3971", photo:"/email/peter-quintal.jpg",   enabled:false },
  ];
}
function defaultBoat(): BoatCard { return { id:crypto.randomUUID(), name:"DOGE 500", price:"€36,800,000", description:"50M flagship of the Doge series.", imageUrl:"", ctaUrl:"", buildTime:"36 Months" }; }
function defaultNLSection(): NLSection { return { id:crypto.randomUUID(), heading:"Market Update", body:"Write your market update here." }; }
function defaultNLFeatured(): NLFeatured { return { id:crypto.randomUUID(), name:"", price:"", imageUrl:"", url:"" }; }

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export default function CampaignsPage(): React.ReactElement {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<Mode>("New Listing");

  /* ── Shared ── */
  const [subject,   setSubject]   = React.useState("");
  const [heroUrl,   setHeroUrl]   = React.useState("");
  const [ctaText,   setCtaText]   = React.useState("VIEW ONLINE");
  const [ctaHref,   setCtaHref]   = React.useState("https://www.denisonyachtsales.com/");
  const [intro,     setIntro]     = React.useState("");
  const [agents,    setAgents]    = React.useState<Agent[]>(defaultAgents);
  const enabledAgents = React.useMemo(() => agents.filter(a => a.enabled), [agents]);

  /* ── Listing (New Listing / Price Drop / Single Listing) ── */
  const [headline,     setHeadline]     = React.useState("52' Astondoa 2021");
  const [location,     setLocation]     = React.useState("AVENTURA, FL");
  const [bannerTag,    setBannerTag]    = React.useState("New Listing");
  const [price,        setPrice]        = React.useState("$875,000");
  const [wasPrice,     setWasPrice]     = React.useState("$950,000");
  const [galleryText,  setGalleryText]  = React.useState("");
  const gallery = React.useMemo(() => galleryText.split("\n").map(s=>s.trim()).filter(Boolean).slice(0,2), [galleryText]);
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
  const [showDesc,   setShowDesc]   = React.useState("Join us at FLIBS this year. We'll have a stunning lineup on display and would love to connect in person.");
  const [showCta,    setShowCta]    = React.useState("RSVP NOW");
  const [showCtaUrl, setShowCtaUrl] = React.useState("mailto:WN@DenisonYachting.com");

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
      const res = await fetch(`/api/campaign/contacts?source=${source}&limit=2000`);
      const data = await res.json();
      if (data.ok) setAllContacts(data.contacts); else toast(data.error||"Failed to load contacts","error");
    } catch { toast("Failed to load contacts","error"); } finally { setContactsLoading(false); }
  }
  function openSendPanel() { setSendOpen(true); setSendResult(null); setSendStatus("idle"); if (allContacts.length===0) loadContacts(contactSource); }
  function toggleSelect(id: number) { setSelected(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function selectAll() { setSelected(new Set(filteredContacts.map(c=>c.id))); }
  function clearAll()  { setSelected(new Set()); }

  async function doSend(testMode: boolean) {
    if (selected.size===0 && !testMode) { toast("Select at least one recipient","error"); return; }
    if (!subject.trim()) { toast("Set an email subject first","error"); return; }
    const recipients = testMode
      ? [{ email:"WN@DenisonYachting.com", name:"Will Noftsinger" }]
      : allContacts.filter(c=>selected.has(c.id)).map(c=>({ email:c.email, name:c.name }));
    if (recipients.length===0) { toast("No recipients selected","error"); return; }
    setSendStatus(testMode?"testing":"sending");
    try {
      const res = await fetch("/api/campaign/send",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ subject, html, recipients, testMode }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Send failed");
      setSendResult({ sent:data.sent, failed:data.failed }); setSendStatus("done");
      toast(testMode?`Test sent to ${recipients[0].email}`:`Sent to ${data.sent} recipients`,"success");
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
      if (d.gallery?.length) setGalleryText(d.gallery.slice(0,3).join("\n"));
      if (d.description) setIntro(d.description);
      if (d.features?.length) setFeaturesText(d.features.join("\n"));
      if (d.specs) { const map:[string,string][]=[ ["loa","LENGTH"],["beam","BEAM"],["draft","DRAFT"],["staterooms","STATEROOMS"],["engines","ENGINES"],["power","POWER"] ]; const next=map.map(([k,l])=>d.specs[k]?{label:l,value:String(d.specs[k])}:null).filter((x): x is Spec=>!!x); if(next.length) setSpecs(next); }
    } catch(err) { toast(err instanceof Error?err.message:"Import failed","error"); } finally { setImporting(false); }
  }

  /* Spec helpers */
  function updateSpec(i:number,key:"label"|"value",v:string){setSpecs(p=>p.map((s,idx)=>idx===i?{...s,[key]:v}:s));}
  function addSpec(){setSpecs(p=>[...p,{label:"",value:""}]);}
  function delSpec(i:number){setSpecs(p=>p.filter((_,idx)=>idx!==i));}
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
    const listing = { subject, bannerTag, headline, location, ctaText, ctaHref, price, heroUrl, intro, gallery, specs, featuresText, agents:enabledAgents };
    if (mode==="New Listing")  return buildSingleListingHtml({ ...listing, bannerTag:"NEW LISTING" });
    if (mode==="Price Drop")   return buildPriceDropHtml({ subject, headline, location, ctaHref, price, wasPrice, heroUrl, intro, gallery, specs, featuresText, agents:enabledAgents });
    if (mode==="Single Listing") return buildSingleListingHtml(listing);
    if (mode==="Boat Show")    return buildBoatShowHtml({ subject, heroUrl, showName, showDates, showVenue, showBooth, showDesc, showCta, showCtaUrl, agents:enabledAgents });
    if (mode==="Open House")   return buildOpenHouseHtml({ subject, heroUrl, ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp, agents:enabledAgents });
    if (mode==="Newsletter")   return buildNewsletterHtml({ subject, nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured, agents:enabledAgents });
    return buildMultiBoatHtml({ subject, showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats, agents:enabledAgents });
  }, [mode, subject, bannerTag, headline, location, ctaText, ctaHref, price, wasPrice, heroUrl, intro, gallery, specs, featuresText, enabledAgents,
      showName, showDates, showVenue, showBooth, showDesc, showCta, showCtaUrl,
      ohVessel, ohDate, ohTime, ohMarina, ohAddress, ohDesc, ohRsvp,
      nlTitle, nlSubtitle, nlIntro, nlSections, nlFeatured,
      showcaseTitle, showcaseSubtitle, showcaseIntro, showcaseHeroUrl, boats]);

  function copyHtml() {
    navigator.clipboard.writeText(html).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); toast("HTML copied"); },()=>toast("Copy failed","error"));
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
                <TArea label="Gallery URLs (one per line, max 2)" rows={3} value={galleryText} set={setGalleryText} />
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
                <TArea label="Gallery URLs (one per line, max 2)" rows={3} value={galleryText} set={setGalleryText} />
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
            <Card title="Show Details">
              <Field label="Show Name"          value={showName}   set={setShowName} />
              <Field label="Dates"              value={showDates}  set={setShowDates} />
              <Field label="Venue"              value={showVenue}  set={setShowVenue} />
              <Field label="Our Booth / Dock"   value={showBooth}  set={setShowBooth} />
              <Field label="Hero Image URL"     value={heroUrl}    set={setHeroUrl} />
              <TArea label="Message Body"  rows={4} value={showDesc} set={setShowDesc} />
              <Field label="CTA Button Text"    value={showCta}    set={setShowCta} />
              <Field label="CTA Link / RSVP URL" value={showCtaUrl} set={setShowCtaUrl} />
            </Card>
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
                  <Field label="Details Link" value={boat.ctaUrl}        set={v=>updateBoat(boat.id,"ctaUrl",v)} />
                  <button onClick={()=>delBoat(boat.id)} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded mt-1">Remove boat</button>
                </Card>
              ))}
              <button onClick={addBoat} className="text-sm px-4 py-2 rounded-lg border border-dashed border-gray-300 hover:bg-gray-50 w-full">+ Add Boat</button>
            </>
          )}

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
        </div>{/* end form */}

        {/* ── Sticky Action Bar ── */}
        <div className="fixed bottom-[72px] md:bottom-0 left-0 right-0 z-[110] flex items-center justify-center gap-3 px-4 py-3 bg-white border-t border-gray-200 shadow-lg">
          <button onClick={()=>setPreviewOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1a2b4a] text-white text-sm font-semibold hover:bg-[#243d66]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Preview
          </button>
          <button onClick={openSendPanel} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0e7490] text-white text-sm font-semibold hover:bg-[#0a5f78]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send Campaign
          </button>
          <button onClick={copyHtml} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold ${copied?"bg-[#0e7490]":"bg-[#e57b2e] hover:bg-[#d06a20]"}`}>
            {copied?"✓ Copied!":"Copy HTML"}
          </button>
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
          <div className="px-4 py-4 bg-white border-t border-gray-100 shrink-0 space-y-3">
            {sendStatus==="done"&&sendResult&&(<div className="text-sm text-center py-2 px-3 bg-green-50 text-green-800 rounded-lg font-medium">✓ Sent to {sendResult.sent} recipient{sendResult.sent!==1?"s":""}{sendResult.failed>0?` · ${sendResult.failed} failed`:""}</div>)}
            <div className="text-xs text-gray-500">{selected.size>0?<span className="font-semibold text-gray-900">{selected.size} selected</span>:<span className="text-gray-400">No recipients selected</span>} <span className="text-gray-300">·</span> {filteredContacts.length.toLocaleString()} shown</div>
            <div className="flex gap-2">
              <button onClick={()=>doSend(true)} disabled={sendStatus==="sending"||sendStatus==="testing"} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{sendStatus==="testing"?"Sending test…":"Send test to myself"}</button>
              <button onClick={()=>doSend(false)} disabled={selected.size===0||sendStatus==="sending"||sendStatus==="testing"} className="flex-1 py-2 rounded-xl bg-[#e57b2e] text-white text-sm font-bold hover:bg-[#d06a20] disabled:opacity-40">{sendStatus==="sending"?"Sending…":`Send to ${selected.size}`}</button>
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
function Field({ label, value, set }: { label: string; value: string; set: (v: string) => void }) {
  return (<div className="mb-2"><div className="text-xs text-gray-400 mb-1">{label}</div><input value={value} onChange={e=>set(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" /></div>);
}
function TArea({ label, value, set, rows=4 }: { label:string; value:string; set:(v:string)=>void; rows?:number }) {
  return (<div className="mb-2"><div className="text-xs text-gray-400 mb-1">{label}</div><textarea value={value} onChange={e=>set(e.target.value)} rows={rows} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-y" /></div>);
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
function agentCardHtml(a: Agent): string {
  const photo = a.photo.startsWith("http")?a.photo:`${RAILWAY_URL}${a.photo}`;
  return `<tr><td style="padding:20px 24px 10px;"><table role="presentation" width="100%" style="border-top:1px solid #e2e8f0;padding-top:20px;"><tr>
    <td width="100" valign="top" style="padding-right:16px;"><img src="${escA(photo)}" width="100" height="100" style="display:block;width:100px;height:100px;border-radius:50%;object-fit:cover;" /></td>
    <td valign="top" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${TEXT};">
      <div style="font-size:18px;font-weight:800;color:${DARK_BLUE};">${esc(a.name)}</div>
      <table role="presentation" style="margin-top:8px;">
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;padding-bottom:4px;">EMAIL</td><td style="font-size:13px;padding-bottom:4px;"><a href="mailto:${escA(a.email)}" style="color:${DARK_BLUE};text-decoration:none;">${esc(a.email)}</a></td></tr>
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;padding-bottom:4px;">CELL</td><td style="font-size:13px;padding-bottom:4px;">${esc(a.cell)}</td></tr>
        <tr><td style="font-size:11px;color:${ORANGE};font-weight:800;padding-right:8px;">OFFICE</td><td style="font-size:13px;">${esc(a.office)}</td></tr>
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
function buildSingleListingHtml(opts:{subject:string;bannerTag:string;headline:string;location:string;ctaText:string;ctaHref:string;price:string;heroUrl:string;intro:string;gallery:string[];specs:Spec[];featuresText:string;agents:Agent[]}): string {
  const {subject,bannerTag,headline,location,ctaText,ctaHref,price,heroUrl,intro,gallery,specs,featuresText,agents}=opts;
  const r1=specs.slice(0,3),r2=specs.slice(3,6);
  const specRow=(row:Spec[])=>row.length?`<tr>${row.map(s=>`<td width="33%" style="padding:8px 0;text-align:left;"><div style="color:${LABEL};font-size:11px;letter-spacing:0.5px;font-weight:700;">${esc(s.label)}</div><div style="color:#fff;font-size:14px;font-weight:700;margin-top:2px;">${esc(s.value)}</div></td>`).join("")}</tr>`:"";
  const features=featuresText.split("\n").map(t=>t.trim()).filter(Boolean);
  const body=`
    ${heroUrl?`<tr><td><img src="${escA(heroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`:""}
    <tr><td align="center" style="background:${ORANGE};color:#fff;font-weight:700;font-size:14px;padding:10px 16px;">${esc(bannerTag)}</td></tr>
    <tr><td align="center" style="padding:20px 24px 0;"><div style="font-size:22px;color:${DARK_BLUE};font-weight:800;">${esc(headline)}</div><div style="font-size:12px;color:${DARK_BLUE};margin-top:6px;">📍 ${esc(location)}</div></td></tr>
    <tr><td align="center" style="padding:14px 24px;"><a href="${escA(ctaHref)}" style="display:inline-block;font-size:12px;color:${ORANGE};border:2px solid ${ORANGE};padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${esc(ctaText)}</a></td></tr>
    ${intro?`<tr><td style="padding:4px 24px 12px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(intro)}</p></td></tr>`:""}
    ${price?`<tr><td align="center" style="padding:8px 24px 16px;font-size:20px;color:${ORANGE};font-weight:800;">${esc(price)}</td></tr>`:""}
    ${gallery.length?`<tr><td style="padding:4px 24px 16px;"><table role="presentation" width="100%"><tr>${gallery.slice(0,2).map(src=>`<td width="50%" style="padding:3px;"><img src="${escA(src)}" width="100%" style="display:block;width:100%;height:auto;border-radius:4px;" /></td>`).join("")}</tr></table></td></tr>`:""}
    <tr><td style="padding:0 24px;"><table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};margin:8px 0;">
      <tr><td style="padding:14px 20px 4px;"><div style="color:#fff;font-weight:800;font-size:14px;letter-spacing:0.5px;border-bottom:1px solid ${ORANGE};padding-bottom:8px;">SPECIFICATIONS</div></td></tr>
      <tr><td style="padding:4px 20px 14px;"><table role="presentation" width="100%">${specRow(r1)}${specRow(r2)}</table></td></tr>
    </table></td></tr>
    ${features.length?`<tr><td style="padding:12px 24px 8px;"><div style="color:${DARK_BLUE};font-weight:800;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">KEY FEATURES</div><ul style="padding-left:20px;margin:10px 0 0;">${features.map(f=>`<li style="margin-bottom:6px;font-size:14px;color:${TEXT};line-height:1.5;">${esc(f)}</li>`).join("")}</ul></td></tr>`:""}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Price Drop ─── */
function buildPriceDropHtml(opts:{subject:string;headline:string;location:string;ctaHref:string;price:string;wasPrice:string;heroUrl:string;intro:string;gallery:string[];specs:Spec[];featuresText:string;agents:Agent[]}): string {
  const {subject,headline,location,ctaHref,price,wasPrice,heroUrl,intro,gallery,specs,featuresText,agents}=opts;
  const r1=specs.slice(0,3),r2=specs.slice(3,6);
  const specRow=(row:Spec[])=>row.length?`<tr>${row.map(s=>`<td width="33%" style="padding:8px 0;"><div style="color:${LABEL};font-size:11px;font-weight:700;">${esc(s.label)}</div><div style="color:#fff;font-size:14px;font-weight:700;margin-top:2px;">${esc(s.value)}</div></td>`).join("")}</tr>`:"";
  const features=featuresText.split("\n").map(t=>t.trim()).filter(Boolean);
  const body=`
    ${heroUrl?`<tr><td><img src="${escA(heroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`:""}
    <tr><td align="center" style="background:#dc2626;color:#fff;font-weight:800;font-size:15px;padding:12px 16px;letter-spacing:1px;">📉 PRICE REDUCED</td></tr>
    <tr><td align="center" style="padding:20px 24px 4px;"><div style="font-size:22px;color:${DARK_BLUE};font-weight:800;">${esc(headline)}</div><div style="font-size:12px;color:${DARK_BLUE};margin-top:6px;">📍 ${esc(location)}</div></td></tr>
    <tr><td align="center" style="padding:12px 24px 4px;">
      ${wasPrice?`<div style="font-size:16px;color:#94a3b8;text-decoration:line-through;margin-bottom:4px;">${esc(wasPrice)}</div>`:""}
      <div style="font-size:28px;color:#dc2626;font-weight:900;">${esc(price)}</div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;letter-spacing:0.5px;">NEW ASKING PRICE</div>
    </td></tr>
    <tr><td align="center" style="padding:12px 24px 16px;"><a href="${escA(ctaHref)}" style="display:inline-block;font-size:12px;color:#fff;background:#dc2626;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:700;letter-spacing:1px;">VIEW LISTING</a></td></tr>
    ${intro?`<tr><td style="padding:4px 24px 12px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(intro)}</p></td></tr>`:""}
    ${gallery.length?`<tr><td style="padding:4px 24px 16px;"><table role="presentation" width="100%"><tr>${gallery.slice(0,2).map(src=>`<td width="50%" style="padding:3px;"><img src="${escA(src)}" width="100%" style="display:block;width:100%;height:auto;border-radius:4px;" /></td>`).join("")}</tr></table></td></tr>`:""}
    <tr><td style="padding:0 24px;"><table role="presentation" width="100%" bgcolor="${NAVY}" style="background:${NAVY};margin:8px 0;">
      <tr><td style="padding:14px 20px 4px;"><div style="color:#fff;font-weight:800;font-size:14px;border-bottom:1px solid #dc2626;padding-bottom:8px;">SPECIFICATIONS</div></td></tr>
      <tr><td style="padding:4px 20px 14px;"><table role="presentation" width="100%">${specRow(r1)}${specRow(r2)}</table></td></tr>
    </table></td></tr>
    ${features.length?`<tr><td style="padding:12px 24px 8px;"><div style="color:${DARK_BLUE};font-weight:800;font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">KEY FEATURES</div><ul style="padding-left:20px;margin:10px 0 0;">${features.map(f=>`<li style="margin-bottom:6px;font-size:14px;color:${TEXT};line-height:1.5;">${esc(f)}</li>`).join("")}</ul></td></tr>`:""}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Boat Show ─── */
function buildBoatShowHtml(opts:{subject:string;heroUrl:string;showName:string;showDates:string;showVenue:string;showBooth:string;showDesc:string;showCta:string;showCtaUrl:string;agents:Agent[]}): string {
  const {subject,heroUrl,showName,showDates,showVenue,showBooth,showDesc,showCta,showCtaUrl,agents}=opts;
  const body=`
    ${heroUrl?`<tr><td><img src="${escA(heroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`:""}
    <tr><td align="center" style="background:${NAVY};padding:20px 24px;">
      <div style="font-size:11px;color:${ORANGE};letter-spacing:2px;font-weight:700;margin-bottom:8px;">YOU'RE INVITED</div>
      <div style="font-size:26px;font-weight:900;color:#ffffff;">${esc(showName)}</div>
    </td></tr>
    <tr><td style="padding:20px 24px 0;">
      <table role="presentation" width="100%" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <tr>
          <td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:4px;">DATES</div>
            <div style="font-size:14px;color:${DARK_BLUE};font-weight:700;">${esc(showDates)}</div>
          </td>
          <td width="50%" style="padding:16px 20px;text-align:center;">
            <div style="font-size:10px;color:${ORANGE};font-weight:800;letter-spacing:1px;margin-bottom:4px;">FIND US AT</div>
            <div style="font-size:14px;color:${DARK_BLUE};font-weight:700;">${esc(showBooth)}</div>
            ${showVenue?`<div style="font-size:12px;color:${GRAY};margin-top:2px;">${esc(showVenue)}</div>`:""}
          </td>
        </tr>
      </table>
    </td></tr>
    ${showDesc?`<tr><td style="padding:16px 24px 8px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.7;text-align:center;">${esc(showDesc)}</p></td></tr>`:""}
    <tr><td align="center" style="padding:16px 24px 24px;"><a href="${escA(showCtaUrl)}" style="display:inline-block;font-size:13px;color:#fff;background:${ORANGE};padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:800;letter-spacing:1px;">${esc(showCta)}</a></td></tr>
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Open House ─── */
function buildOpenHouseHtml(opts:{subject:string;heroUrl:string;ohVessel:string;ohDate:string;ohTime:string;ohMarina:string;ohAddress:string;ohDesc:string;ohRsvp:string;agents:Agent[]}): string {
  const {subject,heroUrl,ohVessel,ohDate,ohTime,ohMarina,ohAddress,ohDesc,ohRsvp,agents}=opts;
  const body=`
    ${heroUrl?`<tr><td><img src="${escA(heroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`:""}
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
    ${ohRsvp?`<tr><td align="center" style="padding:16px 24px 24px;"><a href="mailto:${escA(ohRsvp)}?subject=RSVP — ${escA(ohVessel)} Showing" style="display:inline-block;font-size:13px;color:#fff;background:${DARK_BLUE};padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:800;letter-spacing:1px;">RSVP NOW → ${esc(ohRsvp)}</a></td></tr>`:""}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Newsletter ─── */
function buildNewsletterHtml(opts:{subject:string;nlTitle:string;nlSubtitle:string;nlIntro:string;nlSections:NLSection[];nlFeatured:NLFeatured[];agents:Agent[]}): string {
  const {subject,nlTitle,nlSubtitle,nlIntro,nlSections,nlFeatured,agents}=opts;
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
              ${f.imageUrl?`<img src="${escA(f.imageUrl)}" width="100%" style="display:block;width:100%;height:auto;border-radius:6px;margin-bottom:6px;" />`:""}
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
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}

/* ─── Multi-Boat Showcase ─── */
function buildMultiBoatHtml(opts:{subject:string;showcaseTitle:string;showcaseSubtitle:string;showcaseIntro:string;showcaseHeroUrl:string;boats:BoatCard[];agents:Agent[]}): string {
  const {subject,showcaseTitle,showcaseSubtitle,showcaseIntro,showcaseHeroUrl,boats,agents}=opts;
  const boatRows=boats.map(b=>`
    <tr><td style="padding:8px 24px 0;"><div style="text-align:center;font-size:20px;font-weight:800;color:${DARK_BLUE};padding:16px 0 8px;border-top:2px solid ${ORANGE};">${esc(b.name)}</div></td></tr>
    ${b.imageUrl?`<tr><td style="padding:0 24px;"><table role="presentation" width="100%"><tr>
      <td width="50%" valign="top" style="padding-right:8px;"><img src="${escA(b.imageUrl)}" width="100%" style="display:block;width:100%;height:auto;border-radius:4px;" /></td>
      <td width="50%" valign="top" style="padding-left:8px;font-size:13px;color:${GRAY};line-height:1.55;">${esc(b.description)}${b.buildTime?`<div style="margin-top:10px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>`:""}<div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div></td>
    </tr></table></td></tr>`:`<tr><td style="padding:4px 24px;font-size:13px;color:${GRAY};line-height:1.55;">${esc(b.description)}${b.buildTime?`<div style="margin-top:6px;font-size:12px;"><strong>Build Lead Time //</strong> ${esc(b.buildTime)}</div>`:""}<div style="margin-top:4px;font-size:12px;"><strong>Base Price //</strong> ${esc(b.price)}</div></td></tr>`}
    ${b.ctaUrl?`<tr><td align="center" style="padding:12px 24px 16px;"><a href="${escA(b.ctaUrl)}" style="display:inline-block;font-size:11px;color:#fff;background:${ORANGE};padding:8px 18px;border-radius:4px;text-decoration:none;font-weight:700;">SEE FULL DETAILS</a></td></tr>`:""}`).join("");

  const body=`
    ${showcaseHeroUrl?`<tr><td><img src="${escA(showcaseHeroUrl)}" width="600" style="display:block;width:100%;height:auto;" /></td></tr>`:""}
    <tr><td align="center" style="padding:24px 24px 8px;"><div style="font-size:36px;font-weight:900;color:${DARK_BLUE};letter-spacing:2px;">${esc(showcaseTitle)}</div>${showcaseSubtitle?`<div style="font-size:13px;color:${GRAY};letter-spacing:3px;margin-top:4px;">${esc(showcaseSubtitle)}</div>`:""}</td></tr>
    ${showcaseIntro?`<tr><td style="padding:8px 32px 16px;"><p style="margin:0;font-size:14px;color:${GRAY};line-height:1.65;text-align:center;">${esc(showcaseIntro)}</p></td></tr>`:""}
    ${boatRows}
    ${agents.map(a=>agentCardHtml(a)).join("")}
    <tr><td style="height:12px;">&nbsp;</td></tr>
    ${denisonFooterHtml()}`;
  return emailShell(subject,body);
}
