"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { useToast } from "../components/ToastProvider";
import {
  Plus, ExternalLink, FileText, Trash2, Edit2, X, Link2,
  Copy, Anchor, DollarSign, MapPin, ChevronDown, Send, Eye,
  Upload,
} from "lucide-react";

type ListingLink = { label: string; url: string };
type ListingPdf = { label: string; url: string };
type MyListing = {
  id: number; name: string; make: string; model: string;
  year: string; length: string; price: string; location: string;
  status: string; description: string; highlights: string;
  listing_urls: ListingLink[]; pdf_urls: ListingPdf[];
  hero_image: string; notes: string; broker: string;
  created_at: string; updated_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  sold: "bg-[var(--navy-100)] text-[var(--navy-500)] dark:bg-[var(--navy-800)] dark:text-[var(--navy-400)]",
  withdrawn: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

export default function MyListingsPage() {
  const { toast } = useToast();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("active");
  const [editing, setEditing] = useState<MyListing | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [emailPanel, setEmailPanel] = useState<MyListing | null>(null);

  const fetchListings = useCallback(() => {
    fetch(`/api/listings${filter ? `?status=${filter}` : ""}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setListings(d.listings); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  function openNew() { setEditing(null); setShowForm(true); }
  function openEdit(l: MyListing) { setEditing(l); setShowForm(true); }

  async function handleSave(data: Partial<MyListing>) {
    const body = editing
      ? { action: "update", id: editing.id, ...data }
      : data;
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.ok) {
      toast(editing ? "Listing updated" : "Listing created");
      setShowForm(false);
      fetchListings();
    } else toast("Save failed", "error");
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this listing?")) return;
    await fetch("/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    toast("Listing deleted");
    fetchListings();
  }

  return (
    <PageShell
      title="My Listings"
      subtitle={`${listings.length} listing${listings.length !== 1 ? "s" : ""}`}
      actions={
        <button onClick={openNew} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Listing
        </button>
      }
    >
      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {["active", "pending", "sold", "withdrawn", ""].map(s => (
          <button key={s} onClick={() => { setFilter(s); setLoading(true); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              filter === s
                ? "bg-[var(--navy-900)] text-white border-[var(--navy-900)] dark:bg-white dark:text-[var(--navy-900)]"
                : "bg-white text-[var(--navy-600)] border-[var(--sand-200)] hover:bg-[var(--sand-50)] dark:bg-[var(--navy-800)] dark:text-[var(--navy-300)] dark:border-[var(--navy-700)]"
            }`}>
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Listing cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="card-elevated p-5 animate-pulse">
              <div className="h-40 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded-lg mb-3" />
              <div className="h-4 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[var(--sand-200)] dark:bg-[var(--navy-700)] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <Anchor className="w-10 h-10 mx-auto mb-3 text-[var(--navy-300)]" />
          <div className="text-sm font-semibold text-[var(--navy-500)] mb-1">No listings yet</div>
          <div className="text-xs text-[var(--navy-400)] mb-4">Add your active listings to build email packets for prospects</div>
          <button onClick={openNew} className="btn-primary text-xs">Add Your First Listing</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {listings.map(l => (
            <ListingCard key={l.id} listing={l}
              onEdit={() => openEdit(l)}
              onDelete={() => handleDelete(l.id)}
              onEmailPacket={() => setEmailPanel(l)} />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <ListingFormModal
          listing={editing}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}

      {/* Email Packet Slide-Over */}
      {emailPanel && (
        <EmailPacketPanel
          listing={emailPanel}
          onClose={() => setEmailPanel(null)}
        />
      )}
    </PageShell>
  );
}

/* ═══════════════ Listing Card ═══════════════ */
function ListingCard({ listing: l, onEdit, onDelete, onEmailPacket }: {
  listing: MyListing; onEdit: () => void; onDelete: () => void; onEmailPacket: () => void;
}) {
  const vessel = [l.year, l.length, l.make, l.model].filter(Boolean).join(" ");
  return (
    <div className="card-elevated overflow-hidden group">
      {/* Hero image or placeholder */}
      <div className="relative h-44 bg-[var(--navy-100)] dark:bg-[var(--navy-800)] overflow-hidden">
        {l.hero_image ? (
          <img src={l.hero_image} alt={l.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Anchor className="w-12 h-12 text-[var(--navy-300)] dark:text-[var(--navy-600)]" />
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${STATUS_COLORS[l.status] || STATUS_COLORS.active}`}>
            {l.status}
          </span>
        </div>
        {/* Price badge */}
        {l.price && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/70 text-white text-sm font-bold px-2.5 py-1 rounded-lg backdrop-blur-sm">
            {l.price}
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-4">
        <div className="text-base font-bold text-[var(--navy-900)] dark:text-white mb-0.5">{l.name || "Untitled"}</div>
        {vessel && <div className="text-xs text-[var(--navy-400)] mb-2">{vessel}</div>}
        {l.location && (
          <div className="flex items-center gap-1 text-xs text-[var(--navy-400)] mb-2">
            <MapPin className="w-3 h-3" /> {l.location}
          </div>
        )}

        {/* Links & PDFs count */}
        <div className="flex items-center gap-3 text-[11px] text-[var(--navy-400)] mb-3">
          {l.listing_urls.length > 0 && (
            <span className="flex items-center gap-1">
              <Link2 className="w-3 h-3" /> {l.listing_urls.length} link{l.listing_urls.length !== 1 ? "s" : ""}
            </span>
          )}
          {l.pdf_urls.length > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" /> {l.pdf_urls.length} PDF{l.pdf_urls.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <button onClick={onEmailPacket}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--brass-400)] hover:bg-[var(--brass-500)] text-white transition-colors">
            <Send className="w-3.5 h-3.5" /> Email Packet
          </button>
          <button onClick={onEdit}
            className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)] transition-colors"
            title="Edit">
            <Edit2 className="w-3.5 h-3.5 text-[var(--navy-400)]" />
          </button>
          <button onClick={onDelete}
            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Delete">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Add/Edit Form Modal ═══════════════ */
function ListingFormModal({ listing, onClose, onSave }: {
  listing: MyListing | null; onClose: () => void; onSave: (d: Partial<MyListing>) => void;
}) {
  const [name, setName] = useState(listing?.name || "");
  const [make, setMake] = useState(listing?.make || "");
  const [model, setModel] = useState(listing?.model || "");
  const [year, setYear] = useState(listing?.year || "");
  const [length, setLength] = useState(listing?.length || "");
  const [price, setPrice] = useState(listing?.price || "");
  const [location, setLocation] = useState(listing?.location || "");
  const [status, setStatus] = useState(listing?.status || "active");
  const [description, setDescription] = useState(listing?.description || "");
  const [highlights, setHighlights] = useState(listing?.highlights || "");
  const [heroImage, setHeroImage] = useState(listing?.hero_image || "");
  const [broker, setBroker] = useState(listing?.broker || "Will");
  const [notes, setNotes] = useState(listing?.notes || "");
  const [listingUrls, setListingUrls] = useState<ListingLink[]>(listing?.listing_urls || []);
  const [pdfUrls, setPdfUrls] = useState<ListingPdf[]>(listing?.pdf_urls || []);
  const [saving, setSaving] = useState(false);

  // Import URL
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  // File upload
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleImport() {
    if (!importUrl.trim()) return;
    setImporting(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const p = await res.json();
      if (!p.ok || !p.data) throw new Error(p.error || "Import failed");
      const d = p.data;
      if (d.headline) {
        let h = d.headline.replace(/\s*[-–—|]\s*(Denison|YachtWorld|BoatTrader|boats\.com).*$/i, "").trim();
        if (!name) setName(h);
      }
      if (d.price && !price) setPrice(d.price);
      if (d.location && !location) setLocation(d.location);
      if (d.heroUrl && !heroImage) setHeroImage(d.heroUrl);
      if (d.description && !description) setDescription(d.description);
      if (d.specs) {
        if (d.specs.loa && !length) setLength(d.specs.loa);
      }
      // Add as listing URL
      setListingUrls(prev => {
        if (prev.some(u => u.url === importUrl.trim())) return prev;
        return [...prev, { label: "Listing Page", url: importUrl.trim() }];
      });
    } catch (e: any) {
      alert(e.message || "Import failed");
    } finally { setImporting(false); }
  }

  function addLink() { setListingUrls(p => [...p, { label: "", url: "" }]); }
  function removeLink(i: number) { setListingUrls(p => p.filter((_, idx) => idx !== i)); }
  function updateLink(i: number, key: "label" | "url", v: string) {
    setListingUrls(p => p.map((l, idx) => idx === i ? { ...l, [key]: v } : l));
  }
  function addPdf() { setPdfUrls(p => [...p, { label: "", url: "" }]); }
  function removePdf(i: number) { setPdfUrls(p => p.filter((_, idx) => idx !== i)); }
  function updatePdf(i: number, key: "label" | "url", v: string) {
    setPdfUrls(p => p.map((l, idx) => idx === i ? { ...l, [key]: v } : l));
  }

  async function handleFileUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter(f => f.size > 0);
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (listing?.id) form.append("listing_id", String(listing.id));
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/listings/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed");
      const newPdfs = (data.files || []).map((f: any) => ({ label: f.label, url: f.url }));
      setPdfUrls(prev => [...prev, ...newPdfs]);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
  }

  async function save() {
    if (!name.trim()) return alert("Name is required");
    setSaving(true);
    await onSave({
      name, make, model, year, length, price, location, status,
      description, highlights, hero_image: heroImage,
      notes, broker, listing_urls: listingUrls, pdf_urls: pdfUrls,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-8 pb-20">
      <div className="bg-white dark:bg-[var(--navy-900)] rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <h2 className="text-lg font-bold text-[var(--navy-900)] dark:text-white">
            {listing ? "Edit Listing" : "Add Listing"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Import */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Quick Import</div>
            <div className="flex gap-2">
              <input value={importUrl} onChange={e => setImportUrl(e.target.value)}
                placeholder="Paste Denison / YachtWorld listing URL…"
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]" />
              <button onClick={handleImport} disabled={importing}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--sand-200)] dark:border-[var(--navy-700)] hover:bg-[var(--sand-50)] dark:hover:bg-[var(--navy-800)] disabled:opacity-50">
                {importing ? "…" : "Import"}
              </button>
            </div>
          </div>

          {/* Vessel Name + Status */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <FField label="Vessel Name *" value={name} set={setName} placeholder="e.g. Arthur's Way" />
            <div>
              <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="sold">Sold</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>
          </div>

          {/* Specs row */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FField label="Make" value={make} set={setMake} placeholder="Benetti" />
            <FField label="Model" value={model} set={setModel} placeholder="Classic 120" />
            <FField label="Year" value={year} set={setYear} placeholder="2008" />
            <FField label="Length" value={length} set={setLength} placeholder="120'" />
            <FField label="Asking Price" value={price} set={setPrice} placeholder="$5,900,000" />
            <FField label="Location" value={location} set={setLocation} placeholder="Fort Lauderdale, FL" />
          </div>

          <FField label="Hero Image URL" value={heroImage} set={setHeroImage} placeholder="https://..." />
          {heroImage && (
            <img src={heroImage} alt="Preview" className="w-full h-36 object-cover rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)]" />
          )}

          {/* Description & Highlights */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Description</div>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
              placeholder="Key selling points for email copy…"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Highlights <span className="normal-case font-normal text-[var(--navy-300)]">— use emoji headers for sections (🚀 🛠️ 🛋️ 🔑)</span></div>
            <textarea value={highlights} onChange={e => setHighlights(e.target.value)} rows={8}
              placeholder="🚀 VALUE & POSITIONING&#10;Best-priced 120' Benetti worldwide&#10;$2M+ in recent refits&#10;&#10;🛠️ ENGINEERING & SYSTEMS&#10;Reliable C32 CATs – fully serviced&#10;Zero-speed stabilizers&#10;&#10;🛋️ LAYOUT & LIFESTYLE&#10;5-stateroom layout&#10;Full-beam salon and sky lounge&#10;&#10;🔑 OPPORTUNITY&#10;Privately owned, never chartered"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)]" />
          </div>

          {/* Online Listing Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[var(--navy-400)] uppercase tracking-wider">Online Listings</div>
              <button onClick={addLink} className="text-xs text-[var(--brass-500)] font-medium hover:underline">+ Add Link</button>
            </div>
            {listingUrls.map((l, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={l.label} onChange={e => updateLink(i, "label", e.target.value)}
                  placeholder="Label (e.g. Denison)" className="w-28 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]" />
                <input value={l.url} onChange={e => updateLink(i, "url", e.target.value)}
                  placeholder="https://..." className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]" />
                <button onClick={() => removeLink(i)} className="text-red-400 hover:text-red-600 px-1"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* PDF Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[var(--navy-400)] uppercase tracking-wider">PDF Documents</div>
              <button onClick={addPdf} className="text-xs text-[var(--brass-500)] font-medium hover:underline">+ Add URL</button>
            </div>

            {/* Upload drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-3 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-[var(--brass-400)] bg-[var(--brass-400)]/5"
                  : "border-[var(--sand-300)] dark:border-[var(--navy-600)] hover:border-[var(--brass-400)] hover:bg-[var(--sand-50)] dark:hover:bg-[var(--navy-800)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleFileUpload(e.target.files)}
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-[var(--brass-500)]">
                  <div className="w-4 h-4 border-2 border-[var(--brass-400)] border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto mb-1.5 text-[var(--navy-300)]" />
                  <div className="text-sm font-medium text-[var(--navy-500)] dark:text-[var(--navy-300)]">
                    Drop PDFs here or click to upload
                  </div>
                  <div className="text-[11px] text-[var(--navy-400)] mt-0.5">
                    PDF, DOC, XLS, JPG — brochures, maintenance logs, financials
                  </div>
                </>
              )}
            </div>

            {/* Existing PDF entries */}
            {pdfUrls.map((p, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input value={p.label} onChange={e => updatePdf(i, "label", e.target.value)}
                  placeholder="Label (e.g. Brochure)" className="w-32 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]" />
                {p.url.startsWith("/api/listings/files/") ? (
                  <div className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm">
                    <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-emerald-700 dark:text-emerald-300 truncate text-xs">Uploaded file</span>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0">
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-500 hover:text-emerald-700" />
                    </a>
                  </div>
                ) : (
                  <input value={p.url} onChange={e => updatePdf(i, "url", e.target.value)}
                    placeholder="https://..." className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]" />
                )}
                <button onClick={() => removePdf(i)} className="text-red-400 hover:text-red-600 px-1 shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {/* Broker + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">Broker</div>
              <select value={broker} onChange={e => setBroker(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="Will">Will Noftsinger</option>
                <option value="Paolo">Paolo Ameglio</option>
                <option value="Peter">Peter Quintal</option>
              </select>
            </div>
            <FField label="Internal Notes" value={notes} set={setNotes} placeholder="e.g. Owner motivated…" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--sand-200)] dark:border-[var(--navy-700)]">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--navy-500)] hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="btn-primary disabled:opacity-50">
            {saving ? "Saving…" : (listing ? "Update Listing" : "Create Listing")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Email Packet Panel ═══════════════ */
function EmailPacketPanel({ listing: l, onClose }: {
  listing: MyListing; onClose: () => void;
}) {
  const { toast } = useToast();
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [ccPaolo, setCcPaolo] = useState(true);
  const [copied, setCopied] = useState(false);
  const [customIntro, setCustomIntro] = useState("");
  const [signOff, setSignOff] = useState("Will");

  const vessel = [l.year, l.length, l.make, l.model].filter(Boolean).join(" ");
  const highlightLines = l.highlights.split("\n").map(s => s.trim()).filter(Boolean);

  const subject = `${l.name}${vessel ? ` ${vessel}` : ""}`;

  const SIGNATURES: Record<string, { name: string; email: string; cell: string }> = {
    Will: { name: "Will Noftsinger", email: "wn@denisonyachting.com", cell: "1.850.461.3342" },
    Paolo: { name: "Paolo Ameglio", email: "PGA@denisonyachting.com", cell: "786.251.2588" },
    Peter: { name: "Peter Quintal", email: "Peter@denisonyachting.com", cell: "(954) 817-5662" },
  };

  function buildEmailBody(): string {
    const sig = SIGNATURES[signOff] || SIGNATURES.Will;
    const firstName = recipientName ? recipientName.split(" ")[0] : "";
    const greeting = firstName
      ? `Good morning ${firstName},`
      : "Good morning,";

    let body = `${greeting}\n\n`;

    // Custom personalized intro (like the Arthur's Way motivated seller pitch)
    if (customIntro.trim()) {
      body += `${customIntro.trim()}\n\n`;
    }

    // Core description
    if (l.description) {
      body += `${l.description}\n\n`;
    }

    // Structured highlights with emoji section headers
    if (highlightLines.length > 0) {
      body += `⚓ ${l.name} | ${vessel} | Highlights\n\n`;
      for (const line of highlightLines) {
        // Lines starting with emoji keep their format (section headers)
        // Other lines get bullet points
        const isSection = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(line);
        if (isSection) {
          body += `\n${line}\n`;
        } else {
          body += `${line}\n`;
        }
      }
      body += "\n";
    }

    // Attachments and links
    if (l.pdf_urls.length > 0 || l.listing_urls.length > 0) {
      body += "📎 Documents & Links:\n";
      for (const pdf of l.pdf_urls) {
        const fullUrl = typeof window !== "undefined"
          ? `${window.location.origin}${pdf.url}`
          : pdf.url;
        body += `📄 ${pdf.label || "Document"}: ${fullUrl}\n`;
      }
      for (const link of l.listing_urls) {
        body += `🔗 ${link.label || "Listing"}: ${link.url}\n`;
      }
      body += "\n";
    }

    body += `Whether you're considering a personal yacht or a charter-ready asset, ${l.name} delivers the size, stature, and comfort at a fraction of the price you would think.\n\n`;
    body += "I'm happy to discuss comps, arrange a walkthrough (live or virtual), or help structure an offer if this yacht makes sense for your goals.\n\n";
    body += "Let me know how you'd like to proceed.\n";
    body += `${sig.name}\n`;
    body += "Denison Yachting\n";
    body += `Email - ${sig.email}\n`;
    body += `Cell | WhatsApp - ${sig.cell}\n`;

    return body;
  }

  const emailBody = buildEmailBody();

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"sent"|"error"|null>(null);

  async function sendViaResend() {
    if (!recipientEmail) { toast("Enter a recipient email first"); return; }
    setSending(true); setSendResult(null);
    const sig = SIGNATURES[signOff] || SIGNATURES.Will;
    try {
      const res = await fetch("/api/listings/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          cc: ccPaolo ? "PGA@denisonyachting.com" : undefined,
          subject,
          body: emailBody,
          pdf_urls: l.pdf_urls,
          from_name: sig.name,
          from_email: "WN@yachtslinger.yachts",
        }),
      });
      const d = await res.json();
      if (d.ok) {
        const msg = d.attachments > 0
          ? `Sent with ${d.attachments} PDF attachment${d.attachments !== 1 ? "s" : ""}`
          : d.skipped?.length
            ? `Sent — PDFs not found on server (${d.skipped[0]})`
            : "Sent (no PDFs attached)";
        setSendResult("sent"); toast(msg);
      } else { setSendResult("error"); toast("Send failed: " + d.error); }
    } catch { setSendResult("error"); toast("Send failed"); }
    setSending(false);
  }

  function copyEmail() {
    navigator.clipboard.writeText(emailBody).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Email copied to clipboard");
    });
  }

  const [mailOpening, setMailOpening] = useState(false);

  async function openInMail() {
    const sig = SIGNATURES[signOff] || SIGNATURES.Will;
    const to  = recipientEmail || "";
    const cc  = ccPaolo ? "PGA@denisonyachting.com" : "";

    // Use yotcrm:// custom URL scheme — works from HTTPS (no mixed-content restrictions).
    // The registered macOS app at ~/Applications/YotCRM Compose.app handles it,
    // downloads the PDFs, and opens Mail.app with real attachments via AppleScript.
    setMailOpening(true);
    const payload = { to, cc, subject, body: emailBody, pdf_urls: l.pdf_urls, make: l.make || l.name || "Yacht" };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const schemeUrl = `yotcrm://compose?data=${encoded}`;
    window.location.href = schemeUrl;
    // Give macOS a moment to hand off to the handler app, then reset button state
    setTimeout(() => setMailOpening(false), 2000);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full z-[70] flex flex-col bg-white dark:bg-[var(--navy-900)] shadow-2xl"
        style={{ width: "min(640px, 92vw)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-[var(--navy-950)] text-white shrink-0">
          <div>
            <h3 className="text-sm font-bold">Email Packet</h3>
            <div className="text-[10px] text-[var(--navy-400)]">{l.name} — {vessel}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={sendViaResend} disabled={sending || !recipientEmail}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                sendResult === "sent" ? "bg-emerald-500 text-white" :
                sendResult === "error" ? "bg-red-500 text-white" :
                !recipientEmail ? "bg-white/10 text-white/40 cursor-not-allowed" :
                "bg-[var(--sea-500)] hover:bg-[var(--sea-600)] text-white"
              }`}>
              <Send className="w-3 h-3" />
              {sending ? "Sending…" : sendResult === "sent" ? "✓ Sent!" : "Send + Attach"}
            </button>
            <button onClick={openInMail} disabled={mailOpening}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-[var(--brass-400)] hover:bg-[var(--brass-500)] text-white disabled:opacity-60 transition-all">
              {mailOpening ? "Opening…" : "Open in Mail"}
            </button>
            <button onClick={copyEmail}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                copied ? "bg-emerald-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
              }`}>
              {copied ? "✓ Copied" : "Copy Text"}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Recipient fields */}
          <div className="grid grid-cols-2 gap-3">
            <FField label="Recipient Name" value={recipientName} set={setRecipientName} placeholder="Scott Higgs" />
            <FField label="Recipient Email" value={recipientEmail} set={setRecipientEmail} placeholder="scotthiggs@yahoo.com" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-[var(--navy-500)]">
              <input type="checkbox" checked={ccPaolo} onChange={e => setCcPaolo(e.target.checked)} className="w-4 h-4 rounded" />
              CC Paolo Ameglio
            </label>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--navy-400)] font-semibold uppercase tracking-wider">Sign as</span>
              <select value={signOff} onChange={e => setSignOff(e.target.value)}
                className="px-2 py-1 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)]">
                <option value="Will">Will</option>
                <option value="Paolo">Paolo</option>
                <option value="Peter">Peter</option>
              </select>
            </div>
          </div>

          {/* Personalized Intro */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">
              Personalized Intro <span className="text-[var(--navy-300)] font-normal normal-case">(before description)</span>
            </div>
            <textarea value={customIntro} onChange={e => setCustomIntro(e.target.value)} rows={4}
              placeholder="e.g. Yes she is available. We are showing her tomorrow. The owner is beyond motivated having neared completion of his refit of a 145 Benetti…"
              className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm resize-y bg-white dark:bg-[var(--navy-800)] text-[var(--navy-900)] dark:text-white" />
          </div>

          {/* Attachments reminder */}
          {(l.pdf_urls.length > 0 || l.listing_urls.length > 0) && (
            <div className="bg-[var(--sand-50)] dark:bg-[var(--navy-800)] rounded-xl p-4">
              <div className="text-xs font-semibold text-[var(--navy-500)] mb-2 uppercase tracking-wider">Remember to Attach</div>
              {l.pdf_urls.map((p, i) => (
                <a key={`pdf-${i}`} href={p.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[var(--navy-700)] dark:text-[var(--navy-300)] hover:text-[var(--brass-500)] py-1">
                  <FileText className="w-4 h-4 text-red-400" />
                  {p.label || "PDF Document"}
                  <ExternalLink className="w-3 h-3 ml-auto text-[var(--navy-400)]" />
                </a>
              ))}
              {l.listing_urls.map((u, i) => (
                <a key={`link-${i}`} href={u.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[var(--navy-700)] dark:text-[var(--navy-300)] hover:text-[var(--brass-500)] py-1">
                  <Link2 className="w-4 h-4 text-[var(--sea-500)]" />
                  {u.label || "Online Listing"}
                  <ExternalLink className="w-3 h-3 ml-auto text-[var(--navy-400)]" />
                </a>
              ))}
            </div>
          )}

          {/* Subject line */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1 uppercase tracking-wider">Subject Line</div>
            <div className="text-sm font-semibold text-[var(--navy-900)] dark:text-white bg-[var(--sand-50)] dark:bg-[var(--navy-800)] px-3 py-2 rounded-lg">
              {subject}
            </div>
          </div>

          {/* Email Preview */}
          <div>
            <div className="text-xs font-semibold text-[var(--navy-400)] mb-1 uppercase tracking-wider">Email Preview</div>
            <div className="bg-white dark:bg-[var(--navy-800)] border border-[var(--sand-200)] dark:border-[var(--navy-700)] rounded-xl p-4 text-sm text-[var(--navy-700)] dark:text-[var(--navy-200)] whitespace-pre-wrap leading-relaxed font-[Arial,sans-serif]"
              style={{ minHeight: 200 }}>
              {emailBody}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════ Helpers ═══════════════ */
function FField({ label, value, set, placeholder }: {
  label: string; value: string; set: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--navy-400)] mb-1.5 uppercase tracking-wider">{label}</div>
      <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-[var(--sand-200)] dark:border-[var(--navy-700)] text-sm bg-white dark:bg-[var(--navy-800)] text-[var(--navy-900)] dark:text-white" />
    </div>
  );
}
