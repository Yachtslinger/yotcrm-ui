"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import { Send, FileText, ExternalLink, Upload, X, RefreshCw } from "lucide-react";

type PocketListing = {
  id: number; make: string; model: string; year: string; length: string;
  price: string; location: string; description: string; seller_name: string;
  seller_contact: string; status: string; notes: string; listing_url: string;
  created_at: string; updated_at: string;
  // Builder fields (added by listing builder)
  name?: string; hero_image?: string; images?: string;
  highlights?: string; pdf_url?: string; listing_type?: string; show_price?: number;
};

type IsoRequest = {
  id: number; buyer_name: string; buyer_email: string; buyer_phone: string;
  make: string; model: string; year_min: string; year_max: string;
  length_min: string; length_max: string; budget_min: string; budget_max: string;
  preferences: string; status: string; notes: string; lead_id: number | null;
  created_at: string; updated_at: string;
};

type Tab = "pocket" | "iso" | "brochures";

const STATUS_BADGE: Record<string, string> = {
  active: "badge-active",
  sold: "badge-sold",
  withdrawn: "badge-withdrawn",
  found: "badge-found",
  closed: "badge-closed",
};

export default function OffMarketPage() {
  const [tab, setTab] = useState<Tab>("pocket");
  const [pockets, setPockets] = useState<PocketListing[]>([]);
  const [isos, setIsos] = useState<IsoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPocketModal, setShowPocketModal] = useState(false);
  const [showIsoModal, setShowIsoModal] = useState(false);
  const [editPocket, setEditPocket] = useState<PocketListing | null>(null);
  const [editIso, setEditIso] = useState<IsoRequest | null>(null);
  const [emailPocket, setEmailPocket] = useState<PocketListing | null>(null);
  const [brochures, setBrochures] = useState<{id:number;slug:string;title:string;heroSrc:string;is_pocket_listing:number}[]>([]);
  const [togglingBrochure, setTogglingBrochure] = useState<number|null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pRes, iRes, bRes] = await Promise.all([
        fetch("/api/offmarket?type=pocket").then(r => r.json()),
        fetch("/api/offmarket?type=iso").then(r => r.json()),
        fetch("/api/brochures").then(r => r.json()),
      ]);
      setPockets(pRes.items || []);
      setIsos(iRes.items || []);
      setBrochures((bRes.brochures || []).filter((b:any) => b.source === "db").map((b:any) => ({
        id: b.id,
        slug: b.slug,
        title: b.title,
        heroSrc: b.heroSrc || "",
        is_pocket_listing: b.is_pocket_listing || 0,
      })));
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const deletePocket = async (id: number) => {
    if (!confirm("Delete this pocket listing?")) return;
    await fetch("/api/offmarket", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, type: "pocket" }) });
    setPockets(p => p.filter(x => x.id !== id));
  };

  const deleteIso = async (id: number) => {
    if (!confirm("Delete this ISO request?")) return;
    await fetch("/api/offmarket", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, type: "iso" }) });
    setIsos(p => p.filter(x => x.id !== id));
  };

  const activePockets = pockets.filter(p => p.status === "active");
  const inactivePockets = pockets.filter(p => p.status !== "active");
  const activeIsos = isos.filter(i => i.status === "active");
  const inactiveIsos = isos.filter(i => i.status !== "active");
  const activeBrochures = brochures.filter(b => b.is_pocket_listing === 1);

  const toggleBrochurePocket = async (id: number, current: number) => {
    setTogglingBrochure(id);
    try {
      const isPocket = current === 1 ? false : true;
      const res = await fetch("/api/brochures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vessel: { name: "" }, isPocket }),
      });
      const data = await res.json();
      if (data.ok) {
        setBrochures(prev => prev.map(b => b.id === id ? { ...b, is_pocket_listing: isPocket ? 1 : 0 } : b));
      }
    } catch {}
    setTogglingBrochure(null);
  };

  return (
    <PageShell
      title="Off Market"
      subtitle={`${activePockets.length} pocket listing${activePockets.length !== 1 ? "s" : ""} · ${activeIsos.length} buyer search${activeIsos.length !== 1 ? "es" : ""} · ${activeBrochures.length} brochure${activeBrochures.length !== 1 ? "s" : ""} on site`}
      actions={
        tab !== "brochures" ? (
        <button onClick={() => tab === "pocket" ? (setEditPocket(null), setShowPocketModal(true)) : (setEditIso(null), setShowIsoModal(true))}
          className="btn-primary">
          + {tab === "pocket" ? "Pocket Listing" : "Buyer Search"}
        </button>
        ) : undefined
      }
    >

      {/* Tabs */}
      <div className="tab-bar mb-5">
        <button onClick={() => setTab("pocket")}
          className={`tab-bar-item ${tab === "pocket" ? "active" : ""}`}>
          Pocket Listings ({activePockets.length})
        </button>
        <button onClick={() => setTab("iso")}
          className={`tab-bar-item ${tab === "iso" ? "active" : ""}`}>
          In Search Of ({activeIsos.length})
        </button>
        <button onClick={() => setTab("brochures")}
          className={`tab-bar-item ${tab === "brochures" ? "active" : ""}`}>
          Brochures on Site ({activeBrochures.length})
        </button>
      </div>

      {loading ? (
        <p className="text-[var(--navy-400)] text-center py-12 text-sm">Loading…</p>
      ) : tab === "pocket" ? (
        /* ========== POCKET LISTINGS ========== */
        <div className="space-y-3">
          {pockets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon mx-auto mb-3 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="empty-state-text">No pocket listings yet</div>
              <div className="empty-state-sub">Add off-market boats available through your network</div>
            </div>
          ) : (
            <>
              {[...activePockets, ...inactivePockets].map(p => {
                const title = [p.year, p.length ? p.length + (p.length.includes("'") || p.length.includes("ft") ? "" : "'") : "", p.make, p.model].filter(Boolean).join(" ");
                const st = p.status.toLowerCase();
                return (
                  <div key={p.id} className={`card-elevated overflow-hidden ${st !== "active" ? "opacity-60" : ""}`}>
                    {/* Hero image strip */}
                    {p.hero_image && (
                      <div style={{ height: 160, overflow: "hidden", background: "var(--navy-800)" }}>
                        <img src={p.hero_image} alt={p.name || title}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold text-[var(--navy-900)] dark:text-white truncate">
                              {p.name || title || "Untitled Vessel"}
                            </h3>
                            <span className={`badge shrink-0 ${STATUS_BADGE[st] || STATUS_BADGE.active}`}>{st.toUpperCase()}</span>
                            {p.listing_type === "pocket" && (
                              <span className="badge shrink-0" style={{ background: "rgba(184,147,58,.12)", color: "var(--brass-500)", border: "1px solid rgba(184,147,58,.3)", fontSize: 9 }}>OFF MARKET</span>
                            )}
                          </div>
                          {p.price && <div className="text-base font-semibold text-[var(--brass-500)] mb-1">{p.show_price === 0 ? "Price Upon Request" : p.price}</div>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-400)]">
                            {[p.year, p.length, p.make, p.model].filter(Boolean).join(" · ") && (
                              <span>{[p.year, p.length, p.make, p.model].filter(Boolean).join(" · ")}</span>
                            )}
                            {p.location && <span>📍 {p.location}</span>}
                            {p.seller_name && <span>👤 {p.seller_name}</span>}
                            {p.seller_contact && <span>{p.seller_contact}</span>}
                          </div>
                          {p.description && <p className="text-sm text-[var(--navy-600)] dark:text-[var(--navy-300)] mt-2 line-clamp-2">{p.description}</p>}
                          {p.notes && <p className="text-xs text-[var(--navy-400)] mt-1 italic">Note: {p.notes}</p>}
                          {p.pdf_url && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" style={{ color: "var(--brass-400)" }} />
                              <a href={p.pdf_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs" style={{ color: "var(--brass-400)" }}>PDF Brochure attached</a>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          {st === "active" && (
                            <button onClick={() => setEmailPocket(p)}
                              className="btn-primary text-xs flex items-center gap-1.5">
                              <Send className="w-3 h-3" /> Email
                            </button>
                          )}
                          {p.listing_url && (
                            <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
                              className="btn-secondary text-xs flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          )}
                          <button onClick={() => { setEditPocket(p); setShowPocketModal(true); }}
                            className="btn-secondary text-xs">Edit</button>
                          <button onClick={() => deletePocket(p.id)}
                            className="btn-danger text-xs">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        /* ========== IN SEARCH OF ========== */
        <div className="space-y-3">
          {isos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon mx-auto mb-3 flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
              <div className="empty-state-text">No buyer searches yet</div>
              <div className="empty-state-sub">Track what your buyers are looking for off-market</div>
            </div>
          ) : (
            <>
              {[...activeIsos, ...inactiveIsos].map(iso => {
                const vessel = [iso.make, iso.model].filter(Boolean).join(" ") || "Any vessel";
                const yearRange = [iso.year_min, iso.year_max].filter(Boolean).join("–");
                const lengthRange = [iso.length_min, iso.length_max].filter(Boolean).join("–");
                const budgetRange = [iso.budget_min, iso.budget_max].filter(Boolean).join(" – ");
                const st = iso.status.toLowerCase();
                return (
                  <div key={iso.id} className={`card-elevated p-5 ${st !== "active" ? "opacity-60" : ""}`}>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-[var(--navy-900)] dark:text-white truncate">{iso.buyer_name || "Unknown Buyer"}</h3>
                          <span className={`badge shrink-0 ${STATUS_BADGE[st] || STATUS_BADGE.active}`}>{st.toUpperCase()}</span>
                        </div>
                        <div className="text-sm font-medium text-[var(--brass-500)] mb-1">Looking for: {vessel}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-400)]">
                          {yearRange && <span>{yearRange}</span>}
                          {lengthRange && <span>{lengthRange}</span>}
                          {budgetRange && <span>{budgetRange}</span>}
                          {iso.buyer_email && <span>{iso.buyer_email}</span>}
                          {iso.buyer_phone && <span>{iso.buyer_phone}</span>}
                        </div>
                        {iso.preferences && <p className="text-sm text-[var(--navy-600)] dark:text-[var(--navy-300)] mt-2 line-clamp-2">{iso.preferences}</p>}
                        {iso.notes && <p className="text-xs text-[var(--navy-400)] mt-1 italic">Note: {iso.notes}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setEditIso(iso); setShowIsoModal(true); }}
                          className="btn-secondary text-xs">Edit</button>
                        <button onClick={() => deleteIso(iso.id)}
                          className="btn-danger text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ========== BROCHURES TAB ========== */}
      {!loading && tab === "brochures" && (
        <div>
          <p className="text-xs mb-4" style={{ color: "var(--navy-400)" }}>
            Toggle the checkmark to show or hide each brochure in the <strong style={{ color: "var(--foreground)" }}>Off-Market section</strong> of the public website. Checked brochures appear as listings with their hero image.
          </p>
          {brochures.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-sm" style={{ color: "var(--navy-400)" }}>No published brochures yet — build one in the E-Brochures section first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {brochures.map(b => {
                const isOn = b.is_pocket_listing === 1;
                const toggling = togglingBrochure === b.id;
                return (
                  <div key={b.id} className="rounded-xl overflow-hidden flex items-stretch"
                    style={{ background: "var(--card)", border: `1px solid ${isOn ? "var(--brass-400)" : "var(--border)"}`, transition: "border-color 0.2s" }}>
                    {/* Hero thumbnail */}
                    <div className="w-24 flex-shrink-0 relative" style={{ background: "var(--navy-800)" }}>
                      {b.heroSrc
                        ? <img src={b.heroSrc} alt={b.title} className="w-full h-full object-cover" style={{ minHeight: 72 }} />
                        : <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 72, color: "var(--navy-500)", fontSize: 28 }}>⚓</div>}
                    </div>
                    {/* Info */}
                    <div className="flex-1 px-3 py-2.5 flex items-center gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>{b.title}</p>
                        <a href={`/brochures/${b.slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-[10px]" style={{ color: "var(--brass-400)" }}>View →</a>
                      </div>
                      {/* Toggle */}
                      <button
                        onClick={() => toggleBrochurePocket(b.id, b.is_pocket_listing)}
                        disabled={toggling}
                        title={isOn ? "Remove from Off-Market section" : "Show in Off-Market section"}
                        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                        style={{
                          background: isOn ? "var(--brass-400)" : "var(--sand-100)",
                          color: isOn ? "#fff" : "var(--navy-400)",
                          opacity: toggling ? 0.5 : 1,
                          border: `1px solid ${isOn ? "var(--brass-400)" : "var(--border)"}`,
                        }}>
                        {toggling
                          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                          : isOn ? "✓" : "+"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeBrochures.length > 0 && (
            <p className="text-xs mt-4 text-center" style={{ color: "var(--navy-400)" }}>
              {activeBrochures.length} brochure{activeBrochures.length !== 1 ? "s" : ""} currently showing on the website's Off-Market section.
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      {showPocketModal && (
        <PocketModal
          existing={editPocket}
          onClose={() => { setShowPocketModal(false); setEditPocket(null); }}
          onSaved={fetchData}
        />
      )}
      {showIsoModal && (
        <IsoModal
          existing={editIso}
          onClose={() => { setShowIsoModal(false); setEditIso(null); }}
          onSaved={fetchData}
        />
      )}

      {emailPocket && (
        <PocketEmailPanel
          pocket={emailPocket}
          onClose={() => setEmailPocket(null)} />
      )}
    </PageShell>
  );
}

// ===================== POCKET LISTING MODAL =====================

function PocketModal({ existing, onClose, onSaved }: { existing: PocketListing | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    make: existing?.make || "", model: existing?.model || "", year: existing?.year || "",
    length: existing?.length || "", price: existing?.price || "", location: existing?.location || "",
    description: existing?.description || "", seller_name: existing?.seller_name || "",
    seller_contact: existing?.seller_contact || "", status: existing?.status || "active",
    notes: existing?.notes || "", listing_url: existing?.listing_url || "",
    pdf_url: existing?.pdf_url || "", hero_image: existing?.hero_image || "",
  });

  // PDF upload state
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // URL import state
  const [importUrl, setImportUrl] = useState(existing?.listing_url || "");
  const [importing, setImporting] = useState(false);

  // PDF field-scrape state (separate from attachment upload)
  const pdfScrapeRef = React.useRef<HTMLInputElement>(null);
  const [scrapingPdf, setScrapingPdf] = useState(false);

  async function handleUrlImport() {
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
      setF(prev => ({
        ...prev,
        listing_url: importUrl.trim(),
        ...(d.headline && !prev.make ? {
          make: d.headline.replace(/\s*[-–—|].*$/i, "").trim().split(/\s+/).slice(1).join(" ").trim() || prev.make,
        } : {}),
        ...(d.price      && !prev.price       ? { price:       d.price }       : {}),
        ...(d.location   && !prev.location     ? { location:    d.location }     : {}),
        ...(d.description && !prev.description ? { description: d.description }  : {}),
        ...(d.specs?.loa && !prev.length       ? { length:      d.specs.loa }    : {}),
        ...(d.specs?.year && !prev.year        ? { year:        String(d.specs.year) } : {}),
        ...(d.specs?.builder && !prev.make     ? { make:        d.specs.builder } : {}),
        ...(d.specs?.model && !prev.model      ? { model:       d.specs.model }   : {}),
        ...(d.heroUrl && !prev.hero_image      ? { hero_image:  d.heroUrl }       : {}),
      }));
    } catch (e: any) {
      setError("Import failed: " + e.message);
    } finally { setImporting(false); }
  }

  async function handlePdfScrape(files: FileList | null) {
    if (!files?.[0]) return;
    setScrapingPdf(true);
    try {
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch("/api/brochures/scrape-pdf", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Scrape failed");
      const v = data.vessel || {};
      setF(prev => ({
        ...prev,
        ...(v.builder   && !prev.make        ? { make:        v.builder }               : {}),
        ...(v.name      && !prev.model       ? { model:       v.name }                  : {}),
        ...(v.year      && !prev.year        ? { year:        String(v.year) }           : {}),
        ...(v.loa       && !prev.length      ? { length:      v.loa }                   : {}),
        ...(v.price     && !prev.price       ? { price:       v.price }                 : {}),
        ...(v.location  && !prev.location    ? { location:    v.location }              : {}),
        ...(v.description && !prev.description ? { description: v.description }         : {}),
      }));
      const filled = [v.builder,v.name,v.year,v.loa,v.price,v.location,v.description].filter(Boolean).length;
      if (filled === 0) setError("PDF parsed but no recognisable spec fields found — try the URL import instead");
    } catch (e: any) {
      setError("PDF scrape failed: " + e.message);
    } finally {
      setScrapingPdf(false);
      if (pdfScrapeRef.current) pdfScrapeRef.current.value = "";
    }
  }

  async function handlePdfUpload(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("files", files[0]);
      const res = await fetch("/api/listings/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Upload failed");
      const uploaded = data.files?.[0];
      if (uploaded?.url) setF(prev => ({ ...prev, pdf_url: uploaded.url }));
    } catch (e: any) {
      setError("PDF upload failed: " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const ic = "form-input";
  const lc = "form-label";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.make && !f.model) { setError("Make or model required"); return; }
    setSaving(true); setError("");
    try {
      const method = isEdit ? "PUT" : "POST";
      const body = isEdit ? { ...f, id: existing!.id, type: "pocket" } : { ...f, type: "pocket" };      const res = await fetch("/api/offmarket", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      onSaved(); onClose();
    } catch { setError("Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit" : "Add"} Pocket Listing</h2>
          <button onClick={onClose} className="modal-close">&times;</button>
        </div>
        <form onSubmit={handleSave} className="modal-body space-y-3">
          {error && <p className="text-sm text-[var(--coral-500)] bg-[var(--coral-500)]/8 px-3 py-2 rounded-xl">{error}</p>}

          {/* URL import */}
          <div>
            <label className={lc}>Import from URL</label>
            <div className="flex gap-2 mt-1">
              <input
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                placeholder="Paste Denison / YachtWorld listing URL to auto-fill fields…"
                className={`${ic} flex-1`}
              />
              <button type="button" onClick={handleUrlImport} disabled={importing || !importUrl.trim()}
                className="btn-secondary shrink-0 flex items-center gap-1.5 disabled:opacity-50">
                {importing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing…</> : "Import"}
              </button>
            </div>
          </div>

          {/* PDF field scrape */}
          <div>
            <label className={lc}>Scrape fields from spec PDF</label>
            <div
              onClick={() => pdfScrapeRef.current?.click()}
              className="mt-1 rounded-xl border-2 border-dashed flex items-center gap-3 cursor-pointer transition-all px-4"
              style={{
                minHeight: 52,
                borderColor: scrapingPdf ? "var(--brass-400)" : "var(--border)",
                background: scrapingPdf ? "rgba(197,160,100,0.05)" : "transparent",
              }}>
              <input ref={pdfScrapeRef} type="file" accept=".pdf" className="hidden"
                onChange={e => handlePdfScrape(e.target.files)} />
              {scrapingPdf ? (
                <><div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0"
                  style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
                <span className="text-sm" style={{ color: "var(--navy-400)" }}>Extracting from PDF…</span></>
              ) : (
                <><FileText className="w-4 h-4 shrink-0" style={{ color: "var(--brass-400)" }} />
                <span className="text-sm" style={{ color: "var(--navy-400)" }}>Drop spec sheet PDF to populate fields</span></>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lc}>Make</label><input value={f.make} onChange={set("make")} className={ic} placeholder="Azimut" /></div>
            <div><label className={lc}>Model</label><input value={f.model} onChange={set("model")} className={ic} placeholder="Grande 27" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lc}>Year</label><input value={f.year} onChange={set("year")} className={ic} placeholder="2022" /></div>
            <div><label className={lc}>Length</label><input value={f.length} onChange={set("length")} className={ic} placeholder="88'" /></div>
            <div><label className={lc}>Price</label><input value={f.price} onChange={set("price")} className={ic} placeholder="$4,500,000" /></div>
          </div>
          <div><label className={lc}>Location</label><input value={f.location} onChange={set("location")} className={ic} placeholder="Miami, FL" /></div>
          <div><label className={lc}>Description</label><textarea value={f.description} onChange={set("description")} className={`${ic} min-h-[60px]`} placeholder="Vessel details, condition, features…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lc}>Seller Name</label><input value={f.seller_name} onChange={set("seller_name")} className={ic} placeholder="Owner or broker" /></div>
            <div><label className={lc}>Seller Contact</label><input value={f.seller_contact} onChange={set("seller_contact")} className={ic} placeholder="Email or phone" /></div>
          </div>
          <div><label className={lc}>Listing URL (if any)</label><input value={f.listing_url} onChange={set("listing_url")} className={ic} placeholder="https://…" /></div>
          <div><label className={lc}>Notes (internal)</label><textarea value={f.notes} onChange={set("notes")} className={`${ic} min-h-[40px]`} placeholder="Commission, terms, etc." /></div>

          {/* PDF upload */}
          <div>
            <label className={lc}>PDF Brochure</label>
            {f.pdf_url ? (
              <div className="flex items-center gap-2 p-3 rounded-lg mt-1"
                style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <FileText className="w-4 h-4 shrink-0" style={{ color: "#059669" }} />
                <a href={f.pdf_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs flex-1 truncate" style={{ color: "#059669" }}>
                  PDF attached — click to preview
                </a>
                <button type="button" onClick={() => setF(prev => ({ ...prev, pdf_url: "" }))}
                  className="shrink-0 p-1 rounded hover:bg-red-100"
                  style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handlePdfUpload(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                className="mt-1 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 cursor-pointer transition-all"
                style={{
                  minHeight: 72, padding: "12px 20px",
                  borderColor: dragOver ? "var(--brass-400)" : "var(--border)",
                  background: dragOver ? "rgba(197,160,100,0.05)" : "transparent",
                }}>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => handlePdfUpload(e.target.files)} />
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: "var(--brass-400)", borderTopColor: "transparent" }} />
                    <span className="text-sm" style={{ color: "var(--navy-400)" }}>Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 shrink-0" style={{ color: "var(--brass-400)" }} />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                        Drop PDF or click to upload
                      </div>
                      <div className="text-xs" style={{ color: "var(--navy-400)" }}>
                        Brochure, spec sheet — attached to emails automatically
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div>
            <label className={lc}>Status</label>
            <select value={f.status} onChange={set("status")} className={ic}>
              <option value="active">Active</option>
              <option value="sold">Sold</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? "Saving…" : isEdit ? "Update" : "Add Listing"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== ISO REQUEST MODAL =====================

function IsoModal({ existing, onClose, onSaved }: { existing: IsoRequest | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!existing;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    buyer_name: existing?.buyer_name || "", buyer_email: existing?.buyer_email || "",
    buyer_phone: existing?.buyer_phone || "", make: existing?.make || "",
    model: existing?.model || "", year_min: existing?.year_min || "",
    year_max: existing?.year_max || "", length_min: existing?.length_min || "",
    length_max: existing?.length_max || "", budget_min: existing?.budget_min || "",
    budget_max: existing?.budget_max || "", preferences: existing?.preferences || "",
    status: existing?.status || "active", notes: existing?.notes || "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const ic = "form-input";
  const lc = "form-label";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.buyer_name) { setError("Buyer name required"); return; }
    setSaving(true); setError("");
    try {
      const method = isEdit ? "PUT" : "POST";
      const body = isEdit ? { ...f, id: existing!.id, type: "iso" } : { ...f, type: "iso" };
      const res = await fetch("/api/offmarket", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      onSaved(); onClose();
    } catch { setError("Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit" : "Add"} Buyer Search</h2>
          <button onClick={onClose} className="modal-close">&times;</button>
        </div>
        <form onSubmit={handleSave} className="modal-body space-y-3">
          {error && <p className="text-sm text-[var(--coral-500)] bg-[var(--coral-500)]/8 px-3 py-2 rounded-xl">{error}</p>}

          <div className="form-card">
            <div className="form-card-title text-[var(--brass-500)]">Buyer Info</div>
            <div><label className={lc}>Name</label><input value={f.buyer_name} onChange={set("buyer_name")} className={ic} placeholder="John Smith" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>Email</label><input value={f.buyer_email} onChange={set("buyer_email")} className={ic} placeholder="john@example.com" /></div>
              <div><label className={lc}>Phone</label><input value={f.buyer_phone} onChange={set("buyer_phone")} className={ic} placeholder="+1 555-1234" /></div>
            </div>
          </div>

          <div className="form-card">
            <div className="form-card-title text-[var(--navy-500)]">Vessel Criteria</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>Make</label><input value={f.make} onChange={set("make")} className={ic} placeholder="Any or specific" /></div>
              <div><label className={lc}>Model</label><input value={f.model} onChange={set("model")} className={ic} placeholder="Any or specific" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>Year Min</label><input value={f.year_min} onChange={set("year_min")} className={ic} placeholder="2018" /></div>
              <div><label className={lc}>Year Max</label><input value={f.year_max} onChange={set("year_max")} className={ic} placeholder="2024" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>Length Min</label><input value={f.length_min} onChange={set("length_min")} className={ic} placeholder="60'" /></div>
              <div><label className={lc}>Length Max</label><input value={f.length_max} onChange={set("length_max")} className={ic} placeholder="100'" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lc}>Budget Min</label><input value={f.budget_min} onChange={set("budget_min")} className={ic} placeholder="$1,000,000" /></div>
              <div><label className={lc}>Budget Max</label><input value={f.budget_max} onChange={set("budget_max")} className={ic} placeholder="$5,000,000" /></div>
            </div>
          </div>

          <div><label className={lc}>Preferences / Must-haves</label><textarea value={f.preferences} onChange={set("preferences")} className={`${ic} min-h-[60px]`} placeholder="Flybridge, stabilizers, bow thruster, specific hull type…" /></div>
          <div><label className={lc}>Notes (internal)</label><textarea value={f.notes} onChange={set("notes")} className={`${ic} min-h-[40px]`} placeholder="Timeline, motivation, financing…" /></div>
          <div>
            <label className={lc}>Status</label>
            <select value={f.status} onChange={set("status")} className={ic}>
              <option value="active">Active — Still Looking</option>
              <option value="found">Found — Match Located</option>
              <option value="closed">Closed — No Longer Looking</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? "Saving…" : isEdit ? "Update" : "Add Search"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   POCKET LISTING EMAIL PANEL
   Slides in from right — same pattern as EmailPacketPanel
   in listings. Uses /api/listings/send with PDF attached.
═══════════════════════════════════════════════════════ */
function PocketEmailPanel({ pocket, onClose }: { pocket: PocketListing; onClose: () => void }) {
  const vesselName = pocket.name || [pocket.year, pocket.make, pocket.model].filter(Boolean).join(" ") || "Vessel";
  const [to, setTo]     = React.useState("");
  const [cc, setCc]     = React.useState("");
  const [subject, setSubject] = React.useState(`Exclusive Off-Market Opportunity: ${vesselName}`);
  const [body, setBody] = React.useState(
    `I wanted to reach out about a vessel I have quietly available — exclusively off market:\n\n` +
    `${vesselName}${pocket.year ? ` (${pocket.year})` : ""}${pocket.length ? ` · ${pocket.length}` : ""}` +
    `${pocket.location ? `\nCurrently located: ${pocket.location}` : ""}` +
    `${pocket.price && pocket.show_price !== 0 ? `\nAsking: ${pocket.price}` : ""}` +
    `\n\n${pocket.description ? pocket.description + "\n\n" : ""}` +
    `This vessel is not publicly listed. I'd be happy to share more details, arrange a showing, or connect you with the current owner.\n\n` +
    `Please let me know if you'd like to discuss further.\n\nBest regards,\nWill Noftsinger\nDenison Yachting · 850.461.3342`
  );
  const [sending, setSending] = React.useState(false);
  const [sent, setSent]       = React.useState(false);
  const [error, setError]     = React.useState("");
  const [includePdf, setIncludePdf] = React.useState(!!pocket.pdf_url);

  async function handleSend() {
    if (!to.trim()) { setError("Recipient email required"); return; }
    setSending(true); setError("");
    try {
      const pdf_urls = includePdf && pocket.pdf_url
        ? [{ label: vesselName, url: pocket.pdf_url }]
        : [];

      const res = await fetch("/api/listings/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, cc, subject, body, pdf_urls }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Send failed");
      setSent(true);
    } catch (e: any) {
      setError(e.message || "Send failed");
    } finally { setSending(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex" }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)" }}
        onClick={onClose} />
      {/* Panel */}
      <div style={{ width: "min(560px,100vw)", background: "var(--bg)", borderLeft: "1px solid var(--border)",
          overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Email Pocket Listing</h2>
            <p style={{ fontSize: 12, color: "var(--navy-400)", margin: "2px 0 0" }}>{vesselName}</p>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer",
              color: "var(--navy-400)", lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>

        {sent ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: 40, textAlign: "center", gap: 12 }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Email Sent</div>
            <div style={{ fontSize: 13, color: "var(--navy-400)" }}>Successfully sent to {to}</div>
            <button onClick={onClose} className="btn-primary" style={{ marginTop: 8 }}>Close</button>
          </div>
        ) : (
          <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* PDF attachment toggle */}
            {pocket.pdf_url && (
              <div style={{ background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <FileText style={{ width: 18, height: 18, color: "var(--brass-400)", flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>PDF Brochure</div>
                  <div style={{ fontSize: 11, color: "var(--navy-400)" }}>Attach premium listing PDF</div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <input type="checkbox" checked={includePdf}
                    onChange={e => setIncludePdf(e.target.checked)}
                    style={{ accentColor: "var(--brass-400)", width: 16, height: 16 }} />
                  Attach
                </label>
              </div>
            )}

            {[
              { label: "To", val: to, set: setTo, placeholder: "buyer@example.com", required: true },
              { label: "CC", val: cc, set: setCc, placeholder: "optional" },
              { label: "Subject", val: subject, set: setSubject, placeholder: "Email subject" },
            ].map(({ label, val, set, placeholder, required }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                    textTransform: "uppercase", color: "var(--navy-400)", marginBottom: 4 }}>
                  {label}{required && " *"}
                </label>
                <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 14,
                    border: "1px solid var(--border)", background: "var(--input,var(--card))",
                    color: "var(--foreground)", boxSizing: "border-box" }} />
              </div>
            ))}

            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "var(--navy-400)", marginBottom: 4 }}>
                Message
              </label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={12}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 13,
                  lineHeight: 1.6, border: "1px solid var(--border)", background: "var(--input,var(--card))",
                  color: "var(--foreground)", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(220,38,38,.1)",
                  border: "1px solid rgba(220,38,38,.3)", color: "#dc2626", fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleSend} disabled={sending || !to.trim()}
                className="btn-primary" style={{ flex: 2, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 8 }}>
                <Send style={{ width: 14, height: 14 }} />
                {sending ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
