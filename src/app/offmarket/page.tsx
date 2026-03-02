"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";

type PocketListing = {
  id: number; make: string; model: string; year: string; length: string;
  price: string; location: string; description: string; seller_name: string;
  seller_contact: string; status: string; notes: string; listing_url: string;
  created_at: string; updated_at: string;
};

type IsoRequest = {
  id: number; buyer_name: string; buyer_email: string; buyer_phone: string;
  make: string; model: string; year_min: string; year_max: string;
  length_min: string; length_max: string; budget_min: string; budget_max: string;
  preferences: string; status: string; notes: string; lead_id: number | null;
  created_at: string; updated_at: string;
};

type Tab = "pocket" | "iso";

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

  const fetchData = useCallback(async () => {
    try {
      const [pRes, iRes] = await Promise.all([
        fetch("/api/offmarket?type=pocket").then(r => r.json()),
        fetch("/api/offmarket?type=iso").then(r => r.json()),
      ]);
      setPockets(pRes.items || []);
      setIsos(iRes.items || []);
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

  return (
    <PageShell
      title="Off Market"
      subtitle={`${activePockets.length} pocket listing${activePockets.length !== 1 ? "s" : ""} · ${activeIsos.length} buyer search${activeIsos.length !== 1 ? "es" : ""}`}
      actions={
        <button onClick={() => tab === "pocket" ? (setEditPocket(null), setShowPocketModal(true)) : (setEditIso(null), setShowIsoModal(true))}
          className="btn-primary">
          + {tab === "pocket" ? "Pocket Listing" : "Buyer Search"}
        </button>
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
                  <div key={p.id} className={`card-elevated p-5 ${st !== "active" ? "opacity-60" : ""}`}>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-[var(--navy-900)] dark:text-white truncate">{title || "Untitled Vessel"}</h3>
                          <span className={`badge shrink-0 ${STATUS_BADGE[st] || STATUS_BADGE.active}`}>{st.toUpperCase()}</span>
                        </div>
                        {p.price && <div className="text-base font-semibold text-[var(--brass-500)] mb-1">{p.price}</div>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--navy-400)]">
                          {p.location && <span>{p.location}</span>}
                          {p.seller_name && <span>{p.seller_name}</span>}
                          {p.seller_contact && <span>{p.seller_contact}</span>}
                        </div>
                        {p.description && <p className="text-sm text-[var(--navy-600)] dark:text-[var(--navy-300)] mt-2 line-clamp-2">{p.description}</p>}
                        {p.notes && <p className="text-xs text-[var(--navy-400)] mt-1 italic">Note: {p.notes}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {p.listing_url && (
                          <a href={p.listing_url} target="_blank" rel="noopener noreferrer"
                            className="btn-secondary text-xs">View</a>
                        )}
                        <button onClick={() => { setEditPocket(p); setShowPocketModal(true); }}
                          className="btn-secondary text-xs">Edit</button>
                        <button onClick={() => deletePocket(p.id)}
                          className="btn-danger text-xs">Delete</button>
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
  });

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
      const body = isEdit ? { ...f, id: existing!.id, type: "pocket" } : { ...f, type: "pocket" };
      const res = await fetch("/api/offmarket", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
