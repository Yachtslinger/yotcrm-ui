"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { useToast } from "../components/ToastProvider";
import { Plus, ExternalLink, FileText, Trash2, Edit2, X, Link2, Anchor, MapPin, Send, Upload, Share2, RefreshCw } from "lucide-react";

type ListingLink = { label: string; url: string };
type ListingPdf  = { label: string; url: string; content_b64?: string };
type MyListing = {
  id: number; name: string; make: string; model: string;
  year: string; length: string; price: string; location: string;
  status: string; description: string; highlights: string;
  listing_urls: ListingLink[]; pdf_urls: ListingPdf[];
  hero_image: string; notes: string; broker: string;
  created_at: string; updated_at: string;
};

const STATUS_COLORS: Record<string,string> = {
  active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  sold:      "bg-[var(--navy-100)] text-[var(--navy-500)] dark:bg-[var(--navy-800)] dark:text-[var(--navy-400)]",
  withdrawn: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

/* ═══ MAIN PAGE ═══════════════════════════════════════════════════════════════ */
export default function MyListingsPage() {
  const { toast } = useToast();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<MyListing|null>(null);
  const [showForm, setShowForm] = useState(false);
  const [emailPanel, setEmailPanel] = useState<MyListing|null>(null);

  const fetchListings = useCallback(() => {
    fetch(`/api/listings${filter ? `?status=${filter}` : ""}`)
      .then(r=>r.json()).then(d=>{ if(d.ok) setListings(d.listings); })
      .catch(()=>{}).finally(()=>setLoading(false));
  }, [filter]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  function openNew()               { setEditing(null); setShowForm(true); }
  function openEdit(l: MyListing)  { setEditing(l);    setShowForm(true); }

  async function handleSave(data: Partial<MyListing>) {
    const body = editing ? { action:"update", id:editing.id, ...data } : data;
    const res  = await fetch("/api/listings", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
    const d    = await res.json();
    if (d.ok) { toast(editing ? "Listing updated" : "Listing created"); setShowForm(false); fetchListings(); }
    else toast("Save failed","error");
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this listing?")) return;
    await fetch("/api/listings", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ action:"delete", id }) });
    toast("Listing deleted"); fetchListings();
  }

  async function handleRefresh(l: MyListing) {
    const url = l.listing_urls?.[0]?.url;
    if (!url?.startsWith("http")) { toast("No URL to scrape — add a listing URL first", "error"); return; }
    toast("Scraping from URL…");
    try {
      const res = await fetch("/api/scrape", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ url }) });
      const p = await res.json();
      if (!p.ok || !p.data) throw new Error(p.error || "Scrape failed");
      const d = p.data;
      const updates: Record<string,unknown> = { action:"update", id:l.id };
      if (d.headline && !l.name) updates.name = d.headline.replace(/\s*[-–—|]\s*(Denison|YachtWorld|BoatTrader).*$/i,"").trim();
      if (d.price && !l.price) updates.price = d.price;
      if (d.location && !l.location) updates.location = d.location;
      if (d.heroUrl && !l.hero_image) updates.hero_image = d.heroUrl;
      if (d.description && !l.description) updates.description = d.description;
      if (d.specs?.loa && !l.length) updates.length = d.specs.loa;
      if (d.specs?.year && !l.year) updates.year = String(d.specs.year);
      if (d.specs?.builder && !l.make) updates.make = d.specs.builder;
      if (d.specs?.model && !l.model) updates.model = d.specs.model;
      if (Object.keys(updates).length <= 2) { toast("Nothing new to fill in"); return; }
      await fetch("/api/listings", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(updates) });
      toast("Refreshed from URL ✓"); fetchListings();
    } catch(e:any) { toast("Refresh failed: "+e.message, "error"); }
  }

  return (
    <PageShell title="My Listings" subtitle={`${listings.length} listing${listings.length!==1?"s":""}`}
      actions={<button onClick={openNew} className="btn-primary flex items-center gap-1.5" style={{minHeight:40}}><Plus className="w-4 h-4"/> Add</button>}>
      <>
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {["active","pending","sold","withdrawn",""].map(s=>(
            <button key={s} onClick={()=>{setFilter(s);setLoading(true);}}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filter===s
                ?"bg-[var(--navy-900)] text-white border-[var(--navy-900)] dark:bg-white dark:text-[var(--navy-900)]"
                :"bg-white text-[var(--navy-600)] border-[var(--sand-200)] hover:bg-[var(--sand-50)] dark:bg-[var(--navy-800)] dark:text-[var(--navy-300)] dark:border-[var(--navy-700)]"}`}>
              {s||"All"}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i=>(
              <div key={i} className="card-elevated p-5 animate-pulse">
                <div className="h-40 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded-lg mb-3"/>
                <div className="h-4 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded w-3/4 mb-2"/>
                <div className="h-3 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded w-1/2"/>
              </div>
            ))}
          </div>
        ) : listings.length===0 ? (
          <div className="card-elevated p-12 text-center">
            <Anchor className="w-10 h-10 mx-auto mb-3 text-[var(--navy-300)]"/>
            <div className="text-sm font-semibold text-[var(--navy-500)] mb-1">No listings yet</div>
            <div className="text-xs text-[var(--navy-400)] mb-4">Add your active listings to build email packets</div>
            <button onClick={openNew} className="btn-primary text-xs">Add Your First Listing</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {listings.map(l=>(
              <ListingCard key={l.id} listing={l}
                onEdit={()=>openEdit(l)}
                onDelete={()=>handleDelete(l.id)}
                onEmailPacket={()=>setEmailPanel(l)}
                onRefresh={()=>handleRefresh(l)}
                onShare={()=>{ const u=`${window.location.origin}/listing/${l.id}`; navigator.clipboard.writeText(u).then(()=>toast("Public link copied!")); }}/>
            ))}
          </div>
        )}
        {showForm && <ListingFormModal listing={editing} onClose={()=>setShowForm(false)} onSave={handleSave}/>}
        {emailPanel && <EmailPacketPanel listing={emailPanel} onClose={()=>setEmailPanel(null)}/>}
      </>
    </PageShell>
  );
}

/* ═══ LISTING CARD ════════════════════════════════════════════════════════════ */
function ListingCard({ listing:l, onEdit, onDelete, onEmailPacket, onShare, onRefresh }: {
  listing:MyListing; onEdit:()=>void; onDelete:()=>void; onEmailPacket:()=>void; onShare:()=>void; onRefresh:()=>void;
}) {
  const vessel = [l.year,l.length,l.make,l.model].filter(Boolean).join(" ");
  return (
    <div className="card-elevated overflow-hidden group">
      <div className="relative h-44 bg-[var(--navy-100)] dark:bg-[var(--navy-800)] overflow-hidden">
        {l.hero_image
          ? <img src={l.hero_image} alt={l.name} className="w-full h-full object-cover"/>
          : <div className="w-full h-full flex items-center justify-center"><Anchor className="w-12 h-12 text-[var(--navy-300)] dark:text-[var(--navy-600)]"/></div>}
        <div className="absolute top-2.5 left-2.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${STATUS_COLORS[l.status]||STATUS_COLORS.active}`}>{l.status}</span>
        </div>
        {l.price && <div className="absolute bottom-2.5 right-2.5 bg-black/70 text-white text-sm font-bold px-2.5 py-1 rounded-lg backdrop-blur-sm">{l.price}</div>}
      </div>
      <div className="p-4">
        <div className="text-base font-bold text-[var(--navy-900)] dark:text-white mb-0.5">{l.name||"Untitled"}</div>
        {vessel && <div className="text-xs text-[var(--navy-400)] mb-2">{vessel}</div>}
        {l.location && <div className="flex items-center gap-1 text-xs text-[var(--navy-400)] mb-2"><MapPin className="w-3 h-3"/>{l.location}</div>}
        <div className="flex items-center gap-3 text-[11px] text-[var(--navy-400)] mb-3">
          {l.listing_urls.length>0 && <span className="flex items-center gap-1"><Link2 className="w-3 h-3"/>{l.listing_urls.length} link{l.listing_urls.length!==1?"s":""}</span>}
          {l.pdf_urls.length>0 && <span className="flex items-center gap-1"><FileText className="w-3 h-3"/>{l.pdf_urls.length} PDF{l.pdf_urls.length!==1?"s":""}</span>}
        </div>
        <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <button onClick={onEmailPacket} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--brass-400)] hover:bg-[var(--brass-500)] text-white transition-colors">
            <Send className="w-3.5 h-3.5"/> Email Packet
          </button>
          <button onClick={onShare} title="Copy public link" className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors">
            <Share2 className="w-3.5 h-3.5 text-[var(--navy-400)]"/>
          </button>
          {l.listing_urls.length > 0 && (
            <button onClick={onRefresh} title="Re-scrape from URL to fill missing fields"
              className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors">
              <RefreshCw className="w-3.5 h-3.5 text-[var(--navy-400)]"/>
            </button>
          )}
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors" title="Edit">
            <Edit2 className="w-3.5 h-3.5 text-[var(--navy-400)]"/>
          </button>
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5 text-red-400"/>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ ADD/EDIT FORM MODAL ═════════════════════════════════════════════════════ */
function ListingFormModal({ listing, onClose, onSave }: {
  listing:MyListing|null; onClose:()=>void; onSave:(d:Partial<MyListing>)=>void;
}) {
  const [name,setName]           = useState(listing?.name||"");
  const [make,setMake]           = useState(listing?.make||"");
  const [model,setModel]         = useState(listing?.model||"");
  const [year,setYear]           = useState(listing?.year||"");
  const [length,setLength]       = useState(listing?.length||"");
  const [price,setPrice]         = useState(listing?.price||"");
  const [location,setLocation]   = useState(listing?.location||"");
  const [status,setStatus]       = useState(listing?.status||"active");
  const [description,setDescription] = useState(listing?.description||"");
  const [highlights,setHighlights]   = useState(listing?.highlights||"");
  const [heroImage,setHeroImage]     = useState(listing?.hero_image||"");
  const [broker,setBroker]           = useState(listing?.broker||"Will");
  const [notes,setNotes]             = useState(listing?.notes||"");
  const [listingUrls,setListingUrls] = useState<ListingLink[]>(listing?.listing_urls||[]);
  const [pdfUrls,setPdfUrls]         = useState<ListingPdf[]>(listing?.pdf_urls||[]);
  const [saving,setSaving]           = useState(false);
  const [importUrl,setImportUrl]     = useState("");
  const [importing,setImporting]     = useState(false);
  const pdfScrapeRef = React.useRef<HTMLInputElement>(null);
  const [scrapingPdf,setScrapingPdf] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading,setUploading]     = useState(false);
  const [dragOver,setDragOver]       = useState(false);

  async function handlePdfScrape(files: FileList|null) {
    if (!files?.[0]) return;
    setScrapingPdf(true);
    try {
      const form = new FormData(); form.append("file", files[0]);
      const res  = await fetch("/api/brochures/scrape-pdf", { method:"POST", body:form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Scrape failed");
      const v = data.vessel||{};
      if (v.name && !name) setName(v.name);
      if (v.builder && !make) setMake(v.builder);
      if (v.year && !year) setYear(String(v.year));
      if (v.loa && !length) setLength(v.loa);
      if (v.price && !price) setPrice(v.price);
      if (v.location && !location) setLocation(v.location);
      if (v.description && !description) setDescription(v.description);
      const specMap: [string,string][] = [["beam","Beam"],["draft","Draft"],["displacement","Displacement"],["grossTonnage","Gross Tonnage"],["engines","Engines"],["maxSpeed","Max Speed"],["cruiseSpeed","Cruise Speed"],["range","Range"],["fuelTank","Fuel Tank"],["staterooms","Staterooms"],["crew","Crew"],["classification","Classification"]];
      const lines = specMap.filter(([k])=>v[k]).map(([k,lbl])=>`${lbl}: ${v[k]}`);
      if (lines.length && !highlights) setHighlights("SPECIFICATIONS\n" + lines.join("\n"));
      alert(`Scraped — ${Object.values(v).filter(Boolean).length} fields populated`);
    } catch(e:any) { alert("PDF scrape failed: "+e.message); }
    finally { setScrapingPdf(false); if(pdfScrapeRef.current) pdfScrapeRef.current.value=""; }
  }

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/scrape", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({url:importUrl.trim()}) });
      const p   = await res.json();
      if (!p.ok||!p.data) throw new Error(p.error||"Import failed");
      const d = p.data;
      if (d.headline && !name) setName(d.headline.replace(/\s*[-\u2013\u2014|]\s*(Denison|YachtWorld|BoatTrader|boats\.com).*$/i,"").trim());
      if (d.price && !price) setPrice(d.price);
      if (d.location && !location) setLocation(d.location);
      if (d.heroUrl && !heroImage) setHeroImage(d.heroUrl);
      if (d.description && !description) setDescription(d.description);
      if (d.specs?.loa && !length) setLength(d.specs.loa);
      setListingUrls(prev=>prev.some(u=>u.url===importUrl.trim()) ? prev : [...prev,{label:"Listing Page",url:importUrl.trim()}]);
    } catch(e:any) { alert(e.message||"Import failed"); }
    finally { setImporting(false); }
  }

  function addLink()  { setListingUrls(p=>[...p,{label:"",url:""}]); }
  function rmLink(i:number) { setListingUrls(p=>p.filter((_,idx)=>idx!==i)); }
  function upLink(i:number,k:"label"|"url",v:string) { setListingUrls(p=>p.map((l,idx)=>idx===i?{...l,[k]:v}:l)); }
  function addPdf()   { setPdfUrls(p=>[...p,{label:"",url:""}]); }
  function rmPdf(i:number) { setPdfUrls(p=>p.filter((_,idx)=>idx!==i)); }
  function upPdf(i:number,k:"label"|"url",v:string) { setPdfUrls(p=>p.map((l,idx)=>idx===i?{...l,[k]:v}:l)); }

  async function handleFileUpload(fileList: FileList|File[]) {
    const files = Array.from(fileList).filter(f=>f.size>0); if(!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (listing?.id) form.append("listing_id",String(listing.id));
      for (const f of files) form.append("files",f);
      const res  = await fetch("/api/listings/upload",{method:"POST",body:form});
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Upload failed");
      setPdfUrls(prev=>[...prev,...(data.files||[]).map((f:any)=>({label:f.label,url:f.url,...(f.content_b64?{content_b64:f.content_b64}:{})}))]);
    } catch(e:any) { alert(e.message||"Upload failed"); }
    finally { setUploading(false); if(fileInputRef.current) fileInputRef.current.value=""; }
  }

  function onDrop(e:React.DragEvent) { e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files); }

  async function save() {
    if (!name.trim()) return alert("Name is required");
    setSaving(true);
    await onSave({ name,make,model,year,length,price,location,status,description,highlights,hero_image:heroImage,notes,broker,listing_urls:listingUrls,pdf_urls:pdfUrls });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-8 pb-20">
      <div className="bg-white dark:bg-[var(--navy-900)] rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <h2 className="text-lg font-bold text-[var(--navy-900)] dark:text-white">{listing?"Edit Listing":"Add Listing"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]"><X className="w-5 h-5"/></button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* URL import */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Import from URL</div>
            <div className="flex gap-2">
              <input value={importUrl} onChange={e=>setImportUrl(e.target.value)} placeholder="Paste Denison / YachtWorld listing URL…"
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]"/>
              <button onClick={handleImport} disabled={importing}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--sand-200)] dark:border-[var(--navy-700)] hover:bg-[var(--sand-50)] dark:hover:bg-[var(--navy-800)] disabled:opacity-50">
                {importing?"…":"Import"}
              </button>
            </div>
          </div>

          {/* PDF scrape */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Scrape from Spec Sheet PDF</div>
            <div onClick={()=>pdfScrapeRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${scrapingPdf?"border-[var(--brass-400)] bg-[var(--brass-400)]/5":"border-[var(--sand-300)] dark:border-[var(--navy-600)] hover:border-[var(--brass-400)] hover:bg-[var(--sand-50)] dark:hover:bg-[var(--navy-800)]"}`}>
              <input ref={pdfScrapeRef} type="file" accept=".pdf" className="hidden" onChange={e=>handlePdfScrape(e.target.files)}/>
              {scrapingPdf
                ? <div className="flex items-center justify-center gap-2 text-sm text-[var(--brass-500)]"><div className="w-4 h-4 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin"/>Extracting…</div>
                : <div className="text-sm text-[var(--navy-400)]"><FileText className="w-5 h-5 mx-auto mb-1 text-[var(--navy-300)]"/>Drop a spec sheet PDF to auto-populate fields</div>}
            </div>
          </div>

          {/* Core fields */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <FField label="Vessel Name *" value={name} set={setName} placeholder="e.g. Arthur's Way"/>
            <div>
              <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Status</div>
              <select value={status} onChange={e=>setStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="active">Active</option><option value="pending">Pending</option><option value="sold">Sold</option><option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FField label="Make" value={make} set={setMake} placeholder="Benetti"/>
            <FField label="Model" value={model} set={setModel} placeholder="Classic 120"/>
            <FField label="Year" value={year} set={setYear} placeholder="2008"/>
            <FField label="Length" value={length} set={setLength} placeholder="120'"/>
            <FField label="Asking Price" value={price} set={setPrice} placeholder="$5,900,000"/>
            <FField label="Location" value={location} set={setLocation} placeholder="Fort Lauderdale, FL"/>
          </div>
          <FField label="Hero Image URL" value={heroImage} set={setHeroImage} placeholder="https://..."/>
          {heroImage && <img src={heroImage} alt="Preview" className="w-full h-36 object-cover rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)]"/>}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Description</div>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={4} placeholder="Key selling points for email copy…" className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)]"/>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Highlights <span className="normal-case font-normal text-[var(--navy-300)]">— emoji headers for sections (🚀 🛠️ 🛋️ 🔑)</span></div>
            <textarea value={highlights} onChange={e=>setHighlights(e.target.value)} rows={8}
              placeholder="🚀 VALUE&#10;Best-priced 120' Benetti&#10;&#10;🛠️ ENGINEERING&#10;Reliable C32 CATs"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)]"/>
          </div>

          {/* Online listing links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[var(--navy-400)] uppercase tracking-wider">Online Listings</div>
              <button onClick={addLink} className="text-xs text-[var(--brass-500)] font-medium hover:underline">+ Add Link</button>
            </div>
            {listingUrls.map((l,i)=>(
              <div key={i} className="flex gap-2 mb-2">
                <input value={l.label} onChange={e=>upLink(i,"label",e.target.value)} placeholder="Label" className="w-28 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]"/>
                <input value={l.url}   onChange={e=>upLink(i,"url",e.target.value)}   placeholder="https://..." className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]"/>
                <button onClick={()=>rmLink(i)} className="text-red-400 hover:text-red-600 px-1"><X className="w-4 h-4"/></button>
              </div>
            ))}
          </div>

          {/* PDFs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[var(--navy-400)] uppercase tracking-wider">PDF Documents</div>
              <button onClick={addPdf} className="text-xs text-[var(--brass-500)] font-medium hover:underline">+ Add URL</button>
            </div>
            <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={onDrop} onClick={()=>fileInputRef.current?.click()}
              className={`mb-3 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${dragOver?"border-[var(--brass-400)] bg-[var(--brass-400)]/5":"border-[var(--sand-300)] dark:border-[var(--navy-600)] hover:border-[var(--brass-400)]"}`}>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" multiple className="hidden" onChange={e=>e.target.files&&handleFileUpload(e.target.files)}/>
              {uploading
                ? <div className="flex items-center justify-center gap-2 text-sm text-[var(--brass-500)]"><div className="w-4 h-4 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin"/>Uploading…</div>
                : <><Upload className="w-6 h-6 mx-auto mb-1.5 text-[var(--navy-300)]"/><div className="text-sm font-medium text-[var(--navy-500)] dark:text-[var(--navy-300)]">Drop PDFs or click to upload</div><div className="text-[11px] text-[var(--navy-400)] mt-0.5">Brochures, maintenance logs, financials</div></>}
            </div>
            {pdfUrls.map((p,i)=>(
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input value={p.label} onChange={e=>upPdf(i,"label",e.target.value)} placeholder="Label" className="w-32 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]"/>
                {p.url.startsWith("/api/listings/files/")
                  ? <div className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg border text-sm bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
                      <FileText className="w-4 h-4 text-emerald-500 shrink-0"/>
                      <span className="text-emerald-700 dark:text-emerald-300 truncate text-xs">{p.content_b64?"Uploaded file":"⚠ File missing — re-upload"}</span>
                      {p.content_b64
                        ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0"><ExternalLink className="w-3.5 h-3.5 text-emerald-500"/></a>
                        : <span className="ml-auto shrink-0 text-[10px] font-bold text-amber-600">RE-UPLOAD</span>}
                    </div>
                  : <input value={p.url} onChange={e=>upPdf(i,"url",e.target.value)} placeholder="https://..." className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]"/>}
                <button onClick={()=>rmPdf(i)} className="text-red-400 hover:text-red-600 px-1 shrink-0"><X className="w-4 h-4"/></button>
              </div>
            ))}
          </div>

          {/* Broker + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Broker</div>
              <select value={broker} onChange={e=>setBroker(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="Will">Will Noftsinger</option><option value="Paolo">Paolo Ameglio</option><option value="Peter">Peter Quintal</option>
              </select>
            </div>
            <FField label="Internal Notes" value={notes} set={setNotes} placeholder="e.g. Owner motivated…"/>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--navy-500)] hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-50">{saving?"Saving…":(listing?"Update Listing":"Create Listing")}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══ EMAIL PACKET PANEL ══════════════════════════════════════════════════════ */
function EmailPacketPanel({ listing:l, onClose }: { listing:MyListing; onClose:()=>void }) {
  const { toast } = useToast();
  const [recipientName,setRecipientName] = useState("");
  const [recipientEmail,setRecipientEmail] = useState("");
  const [ccPaolo,setCcPaolo] = useState(true);
  const [copied,setCopied]   = useState(false);
  const [customIntro,setCustomIntro] = useState("");
  const [signOff,setSignOff] = useState("Will");
  const [pdfUrls,setPdfUrls] = useState<ListingPdf[]>(l.pdf_urls||[]);
  const [pdfUploading,setPdfUploading] = useState(false);
  const panelFileRef = React.useRef<HTMLInputElement>(null);
  const [sending,setSending] = useState(false);
  const [sendResult,setSendResult] = useState<"sent"|"error"|null>(null);
  const [mailOpening,setMailOpening] = useState(false);

  const brokenPdfs = pdfUrls.filter(p=>p.url.startsWith("/api/listings/files/")&&!p.content_b64);
  const hasBroken  = brokenPdfs.length>0;

  async function handlePanelUpload(fileList:FileList|File[]) {
    const files = Array.from(fileList).filter(f=>f.size>0); if(!files.length) return;
    setPdfUploading(true);
    try {
      const form = new FormData();
      if (l.id) form.append("listing_id",String(l.id));
      for (const f of files) form.append("files",f);
      const res  = await fetch("/api/listings/upload",{method:"POST",body:form});
      const data = await res.json();
      if (!data.ok) throw new Error(data.error||"Upload failed");
      const newPdfs = (data.files||[]).map((f:any)=>({label:f.label,url:f.url,...(f.content_b64?{content_b64:f.content_b64}:{})}));
      setPdfUrls(prev=>{ const u=[...prev]; for(const np of newPdfs){const idx=u.findIndex(p=>!p.content_b64&&p.label===np.label); if(idx>=0) u[idx]=np; else u.push(np);} return u; });
      await fetch("/api/listings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update",id:l.id,pdf_urls:[...pdfUrls.filter(p=>p.content_b64||!p.url.startsWith("/api/")), ...newPdfs]})});
      toast(`${newPdfs.length} PDF${newPdfs.length!==1?"s":""} re-uploaded — ready to attach`);
    } catch(e:any) { toast("Upload failed: "+e.message,"error"); }
    finally { setPdfUploading(false); if(panelFileRef.current) panelFileRef.current.value=""; }
  }

  const vessel = [l.year,l.length,l.make,l.model].filter(Boolean).join(" ");
  const subject = `${l.name}${vessel?` ${vessel}`:""}`;

  const SIGNATURES: Record<string,{name:string;email:string;cell:string}> = {
    Will:  {name:"Will Noftsinger",  email:"wn@denisonyachting.com",     cell:"1.850.461.3342"},
    Paolo: {name:"Paolo Ameglio",    email:"PGA@denisonyachting.com",     cell:"786.251.2588"},
    Peter: {name:"Peter Quintal",    email:"Peter@denisonyachting.com",   cell:"(954) 817-5662"},
  };

  function buildEmailBody() {
    const sig = SIGNATURES[signOff]||SIGNATURES.Will;
    const firstName = recipientName ? recipientName.split(" ")[0] : "";
    let body = firstName ? `Good morning ${firstName},\n\n` : "Good morning,\n\n";
    if (customIntro.trim()) body += customIntro.trim()+"\n\n";
    if (l.description) body += l.description+"\n\n";
    const lines = l.highlights.split("\n").map(s=>s.trim()).filter(Boolean);
    if (lines.length) {
      body += `⚓ ${l.name} | ${vessel} | Highlights\n\n`;
      for (const line of lines) {
        const isSection = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(line);
        body += isSection ? `\n${line}\n` : `${line}\n`;
      }
      body += "\n";
    }
    // Public listing page — always included
    const publicUrl = typeof window!=="undefined" ? `${window.location.origin}/listing/${l.id}` : `https://yotcrm-production.up.railway.app/listing/${l.id}`;
    body += `🌐 Full Listing Page: ${publicUrl}\n\n`;
    if (l.pdf_urls.length||l.listing_urls.length) {
      body += "📎 Documents & Links:\n";
      for (const pdf of l.pdf_urls) {
        const u = typeof window!=="undefined" ? `${window.location.origin}${pdf.url}` : pdf.url;
        body += `📄 ${pdf.label||"Document"}: ${u}\n`;
      }
      for (const link of l.listing_urls) body += `🔗 ${link.label||"Listing"}: ${link.url}\n`;
      body += "\n";
    }
    body += `Whether you're considering a personal yacht or a charter-ready asset, ${l.name} delivers the size, stature, and comfort at a fraction of the price you would think.\n\n`;
    body += "I'm happy to discuss comps, arrange a walkthrough (live or virtual), or help structure an offer if this yacht makes sense for your goals.\n\n";
    body += `Let me know how you'd like to proceed.\n${sig.name}\nDenison Yachting\nEmail - ${sig.email}\nCell | WhatsApp - ${sig.cell}\n`;
    return body;
  }

  const emailBody = buildEmailBody();

  async function sendViaResend() {
    if (!recipientEmail) { toast("Enter a recipient email first"); return; }
    setSending(true); setSendResult(null);
    const sig = SIGNATURES[signOff]||SIGNATURES.Will;
    try {
      const res  = await fetch("/api/listings/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:recipientEmail,cc:ccPaolo?"PGA@denisonyachting.com":undefined,subject,body:emailBody,pdf_urls:pdfUrls,from_name:sig.name,from_email:"WN@yachtslinger.yachts"})});
      const d    = await res.json();
      if (d.ok) { const msg=d.attachments>0?`Sent with ${d.attachments} PDF attachment${d.attachments!==1?"s":""}`:d.skipped?.length?`Sent — PDFs not found (${d.skipped[0]})`:"Sent (no PDFs attached)"; setSendResult("sent"); toast(msg); }
      else { setSendResult("error"); toast("Send failed: "+d.error); }
    } catch { setSendResult("error"); toast("Send failed"); }
    setSending(false);
  }

  function copyEmail() { navigator.clipboard.writeText(emailBody).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); toast("Email copied"); }); }

  function openInMail() {
    const sig = SIGNATURES[signOff]||SIGNATURES.Will;
    setMailOpening(true);
    const payload = {to:recipientEmail||"",cc:ccPaolo?"PGA@denisonyachting.com":"",subject,body:emailBody,pdf_urls:pdfUrls,make:l.make||l.name||"Yacht"};
    window.location.href = `yotcrm://compose?data=${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
    setTimeout(()=>setMailOpening(false),2000);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose}/>
      <div className="fixed top-0 right-0 h-full z-[70] flex flex-col bg-white dark:bg-[var(--navy-900)] shadow-2xl" style={{width:"min(640px,92vw)"}}>
        <div className="flex items-center justify-between px-5 py-3 bg-[var(--navy-950)] text-white shrink-0">
          <div><h3 className="text-sm font-bold">Email Packet</h3><div className="text-[10px] text-[var(--navy-400)]">{l.name} — {vessel}</div></div>
          <div className="flex items-center gap-2">
            <button onClick={sendViaResend} disabled={sending||!recipientEmail}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${sendResult==="sent"?"bg-emerald-500 text-white":sendResult==="error"?"bg-red-500 text-white":!recipientEmail?"bg-white/10 text-white/40 cursor-not-allowed":"bg-[var(--sea-500)] hover:bg-[var(--sea-600)] text-white"}`}>
              <Send className="w-3 h-3"/>{sending?"Sending…":sendResult==="sent"?"✓ Sent!":"Send + Attach"}
            </button>
            <button onClick={openInMail} disabled={mailOpening} className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-[var(--brass-400)] hover:bg-[var(--brass-500)] text-white disabled:opacity-60 transition-all">
              {mailOpening?"Opening…":"Open in Mail"}
            </button>
            <button onClick={copyEmail} className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${copied?"bg-emerald-500 text-white":"bg-white/10 hover:bg-white/20 text-white"}`}>
              {copied?"✓ Copied":"Copy Text"}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FField label="Recipient Name" value={recipientName} set={setRecipientName} placeholder="Scott Higgs"/>
            <FField label="Recipient Email" value={recipientEmail} set={setRecipientEmail} placeholder="scotthiggs@yahoo.com"/>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--navy-500)]">
              <input type="checkbox" checked={ccPaolo} onChange={e=>setCcPaolo(e.target.checked)} className="w-4 h-4 rounded"/>CC Paolo Ameglio
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--navy-400)] font-semibold uppercase tracking-wider">Sign as</span>
              <select value={signOff} onChange={e=>setSignOff(e.target.value)} className="px-2 py-1 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="Will">Will</option><option value="Paolo">Paolo</option><option value="Peter">Peter</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Personalized Intro <span className="normal-case font-normal text-[var(--navy-300)]">(before description)</span></div>
            <textarea value={customIntro} onChange={e=>setCustomIntro(e.target.value)} rows={4}
              placeholder="e.g. Yes she is available. The owner is beyond motivated…"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)] text-[var(--navy-900)] dark:text-white"/>
          </div>
          {pdfUrls.length>0 && (
            <div className="bg-[var(--sand-50)] dark:bg-[var(--navy-800)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-[var(--navy-500)] uppercase tracking-wider">PDF Attachments</div>
                {hasBroken && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">{brokenPdfs.length} need re-upload</span>}
              </div>
              {pdfUrls.map((p,i)=>{ const isBroken=p.url.startsWith("/api/listings/files/")&&!p.content_b64; return (
                <div key={i} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg mb-1 ${isBroken?"bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800":"bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"}`}>
                  <FileText className={`w-4 h-4 shrink-0 ${isBroken?"text-amber-500":"text-emerald-500"}`}/>
                  <span className={`text-xs flex-1 truncate ${isBroken?"text-amber-700 dark:text-amber-300":"text-emerald-700 dark:text-emerald-300"}`}>{p.label||"PDF Document"}</span>
                  {isBroken ? <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">⚠ Re-upload below</span> : <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">✓ Ready</span>}
                </div>
              );})}
              {hasBroken && (
                <div onClick={()=>panelFileRef.current?.click()} className="mt-3 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-xl p-3 text-center cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">
                  <input ref={panelFileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e=>e.target.files&&handlePanelUpload(e.target.files)}/>
                  {pdfUploading ? <div className="flex items-center justify-center gap-2 text-xs text-amber-600"><div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"/>Uploading…</div> : <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">↑ Re-upload PDFs to attach them to this email</div>}
                </div>
              )}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1 uppercase tracking-wider">Subject Line</div>
            <div className="text-sm font-semibold text-[var(--navy-900)] dark:text-white bg-[var(--sand-50)] dark:bg-[var(--navy-800)] px-3 py-2 rounded-lg">{subject}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1 uppercase tracking-wider">Email Preview</div>
            <div className="bg-white dark:bg-[var(--navy-800)] border border-[var(--sand-200)] dark:border-[var(--navy-700)] rounded-xl p-4 text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)] whitespace-pre-wrap leading-relaxed font-[Arial,sans-serif]" style={{minHeight:200}}>{emailBody}</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══ HELPERS ═════════════════════════════════════════════════════════════════ */
function FField({ label, value, set, placeholder }: { label:string; value:string; set:(v:string)=>void; placeholder?:string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">{label}</div>
      <input value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)] text-[var(--navy-900)] dark:text-white"/>
    </div>
  );
}
