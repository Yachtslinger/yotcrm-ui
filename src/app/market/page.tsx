"use client";

import React, { useState, useEffect, useCallback } from "react";
import PageShell from "../components/PageShell";

type Tab = "pockets" | "iso" | "owners" | "matches";

type PocketListing = {
  id: number; make: string; model: string; year: string;
  length: string; price: string; location: string;
  description: string; seller_name: string; seller_contact: string;
  status: string; notes: string; listing_url: string; created_at: string;
};

type IsoRequest = {
  id: number; buyer_name: string; buyer_email: string; buyer_phone: string;
  make: string; model: string; year_min: string; year_max: string;
  length_min: string; length_max: string; budget_min: string; budget_max: string;
  description: string; preferred_location: string; status: string; notes: string;
  lead_id: number | null; created_at: string;
};

type Owner = {
  id: number; owner_name: string; owner_email: string; owner_phone: string;
  make: string; model: string; year: string; length: string;
  estimated_value: string; location: string; vessel_name: string;
  how_known: string; description: string; status: string; notes: string;
  lead_id: number | null; created_at: string;
};

type Match = {
  id: number; owner_id: number; iso_id: number; match_score: number;
  match_reasons: string; status: string; notes: string; created_at: string;
  owner_name?: string; owner_make?: string; owner_model?: string;
  owner_year?: string; owner_length?: string; owner_value?: string; owner_location?: string;
  buyer_name?: string; buyer_email?: string; buyer_phone?: string;
  iso_make?: string; length_min?: string; length_max?: string;
  budget_min?: string; budget_max?: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: "badge-active",
  sold: "badge-sold",
  not_for_sale: "badge-not_for_sale",
  pending: "badge-pending",
  matched: "badge-matched",
  closed: "badge-closed",
};

export default function MarketPage() {
  const [tab, setTab] = useState<Tab>("pockets");
  const [pockets, setPockets] = useState<PocketListing[]>([]);
  const [isos, setIsos] = useState<IsoRequest[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPocketForm, setShowPocketForm] = useState(false);
  const [showIsoForm, setShowIsoForm] = useState(false);
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [expandedIso, setExpandedIso] = useState<number | null>(null);
  const [expandedOwner, setExpandedOwner] = useState<number | null>(null);
  const [isoMatches, setIsoMatches] = useState<Record<number, Match[]>>({});
  const [ownerMatches, setOwnerMatches] = useState<Record<number, Match[]>>({});

  const fetchData = useCallback(async () => {
    try {
      const [pRes, iRes, oRes, mRes] = await Promise.all([
        fetch("/api/market/pockets").then(r => r.json()),
        fetch("/api/market/iso").then(r => r.json()),
        fetch("/api/market/owners").then(r => r.json()),
        fetch("/api/market/matches").then(r => r.json()),
      ]);
      if (pRes.ok) setPockets(pRes.listings || []);
      if (iRes.ok) setIsos(iRes.searches || []);
      if (oRes.ok) setOwners(oRes.owners || []);
      if (mRes.ok) {
        const allMatches: Match[] = mRes.matches || [];
        setMatches(allMatches);
        // Index matches by ISO and owner
        const byIso: Record<number, Match[]> = {};
        const byOwner: Record<number, Match[]> = {};
        for (const m of allMatches) {
          if (!byIso[m.iso_id]) byIso[m.iso_id] = [];
          byIso[m.iso_id].push(m);
          if (!byOwner[m.owner_id]) byOwner[m.owner_id] = [];
          byOwner[m.owner_id].push(m);
        }
        setIsoMatches(byIso);
        setOwnerMatches(byOwner);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const deletePocket = async (id: number) => {
    if (!confirm("Delete this pocket listing?")) return;
    await fetch("/api/market/pockets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setPockets(p => p.filter(x => x.id !== id));
  };

  const deleteIso = async (id: number) => {
    if (!confirm("Delete this buyer search?")) return;
    await fetch("/api/market/iso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setIsos(p => p.filter(x => x.id !== id));
  };

  const deleteOwner = async (id: number) => {
    if (!confirm("Delete this owner?")) return;
    await fetch("/api/market/owners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    setOwners(p => p.filter(x => x.id !== id));
    fetchData(); // refresh matches
  };

  const updateMatch = async (matchId: number, status: string) => {
    await fetch("/api/market/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: matchId, status }) });
    fetchData();
  };

  const activePockets = pockets.filter(p => p.status === "active").length;
  const activeIsos = isos.filter(i => i.status === "active").length;
  const activeOwners = owners.filter(o => o.status === "active").length;
  const newMatches = matches.filter(m => m.status === "new").length;

  const getAddButton = () => {
    if (tab === "pockets") return { label: "+ Pocket Listing", fn: () => setShowPocketForm(true) };
    if (tab === "iso") return { label: "+ Buyer Search", fn: () => setShowIsoForm(true) };
    if (tab === "owners") return { label: "+ Owner", fn: () => setShowOwnerForm(true) };
    return null;
  };

  const addBtn = getAddButton();

  return (
    <PageShell
      title="Market"
      subtitle="Pocket listings, buyer searches & owner matching"
      actions={addBtn ? (
        <button onClick={addBtn.fn} className="btn-primary">
          {addBtn.label}
        </button>
      ) : undefined}
    >

      <div className="tab-bar mb-5">
        {([
          { key: "pockets" as Tab, label: "Pockets", count: activePockets },
          { key: "iso" as Tab, label: "ISO", count: activeIsos },
          { key: "owners" as Tab, label: "Owners", count: activeOwners },
          { key: "matches" as Tab, label: "Matches", count: newMatches },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-bar-item ${tab === t.key ? "active" : ""}`}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--navy-400)] py-12 text-center text-sm">Loading…</p>
      ) : tab === "pockets" ? (
        pockets.length === 0 ? (
          <EmptyState icon="lock" label="No pocket listings yet" onAdd={() => setShowPocketForm(true)} />
        ) : (
          <div className="grid gap-3">
            {pockets.map(p => {
              const title = [p.year, p.length ? p.length + (p.length.includes("'") || p.length.includes("ft") ? "" : "'") : "", p.make, p.model].filter(Boolean).join(" ");
              return (
                <div key={p.id} className="card-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-[var(--navy-900)] dark:text-white">{title || "Untitled Vessel"}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      {p.price && <div className="text-sm font-semibold text-[var(--brass-500)]">{p.price}</div>}
                      {p.location && <div className="text-xs text-[var(--navy-400)] mt-0.5">{p.location}</div>}
                      {p.description && <div className="text-xs text-[var(--navy-400)] mt-2 line-clamp-2">{p.description}</div>}
                      {(p.seller_name || p.seller_contact) && (
                        <div className="text-xs text-[var(--navy-300)] mt-2">Contact: {[p.seller_name, p.seller_contact].filter(Boolean).join(" · ")}</div>
                      )}
                      {p.listing_url && <a href={p.listing_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--brass-500)] hover:text-[var(--brass-400)] mt-1 inline-block transition-colors">View Listing →</a>}
                    </div>
                    <button onClick={() => deletePocket(p.id)} className="btn-ghost text-[var(--navy-300)] hover:text-[var(--coral-500)]">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )

      ) : tab === "iso" ? (
        isos.length === 0 ? (
          <EmptyState icon="search" label="No buyer searches yet" onAdd={() => setShowIsoForm(true)} />
        ) : (
          <div className="grid gap-3">
            {isos.map(iso => {
              const vessel = [iso.make, iso.model].filter(Boolean).join(" ") || "Any vessel";
              const yearRange = [iso.year_min, iso.year_max].filter(Boolean).join("–");
              const lengthRange = [iso.length_min, iso.length_max].filter(Boolean).join("–");
              const budgetRange = [iso.budget_min, iso.budget_max].filter(Boolean).join(" – ");
              const isoMatchList = isoMatches[iso.id] || [];
              const isExpanded = expandedIso === iso.id;
              return (
                <div key={iso.id} className="card-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-[var(--navy-900)] dark:text-white">{iso.buyer_name || "Anonymous Buyer"}</span>
                        <StatusBadge status={iso.status} />
                        {isoMatchList.length > 0 && (
                          <button onClick={() => setExpandedIso(isExpanded ? null : iso.id)}
                            className="badge badge-matched cursor-pointer hover:opacity-80 transition-opacity">
                            {isoMatchList.length} vessel{isoMatchList.length !== 1 ? "s" : ""} match
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-[var(--brass-500)] font-medium">Looking for: {vessel}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--navy-400)]">
                        {yearRange && <span>{yearRange}</span>}
                        {lengthRange && <span>{lengthRange}</span>}
                        {budgetRange && <span>{budgetRange}</span>}
                      </div>
                      {iso.description && <div className="text-xs text-[var(--navy-400)] mt-2 line-clamp-2">{iso.description}</div>}
                      {(iso.buyer_email || iso.buyer_phone) && (
                        <div className="text-xs text-[var(--navy-300)] mt-2">{[iso.buyer_email, iso.buyer_phone].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <button onClick={() => deleteIso(iso.id)} className="btn-ghost text-[var(--navy-300)] hover:text-[var(--coral-500)]">✕</button>
                  </div>
                  {isExpanded && isoMatchList.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                      <div className="form-section-title text-[var(--brass-500)] mb-1">Matching Vessels</div>
                      {isoMatchList.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2 bg-[var(--sand-50)] dark:bg-[var(--navy-800)] rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--navy-800)] dark:text-[var(--navy-200)]">
                              {m.owner_name} — {[m.owner_year, m.owner_length, m.owner_make, m.owner_model].filter(Boolean).join(" ")}
                            </div>
                            <div className="text-[10px] text-[var(--navy-400)]">{m.owner_value} · Score: {m.match_score} · {m.match_reasons}</div>
                          </div>
                          <MatchActions match={m} onUpdate={updateMatch} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )

      ) : tab === "owners" ? (
        owners.length === 0 ? (
          <EmptyState icon="ship" label="No vessel owners yet" onAdd={() => setShowOwnerForm(true)} />
        ) : (
          <div className="grid gap-3">
            {owners.map(o => {
              const vessel = [o.year, o.length ? o.length + (o.length.includes("'") || o.length.includes("ft") ? "" : "'") : "", o.make, o.model].filter(Boolean).join(" ");
              const oMatchList = ownerMatches[o.id] || [];
              const isExpanded = expandedOwner === o.id;
              return (
                <div key={o.id} className="card-elevated p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-bold text-[var(--navy-900)] dark:text-white">{o.owner_name || "Unknown Owner"}</span>
                        <StatusBadge status={o.status} />
                        {oMatchList.length > 0 && (
                          <button onClick={() => setExpandedOwner(isExpanded ? null : o.id)}
                            className="badge badge-matched cursor-pointer hover:opacity-80 transition-opacity">
                            {oMatchList.length} buyer{oMatchList.length !== 1 ? "s" : ""} interested
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-[var(--brass-500)] font-medium">{vessel || "Vessel TBD"}</div>
                      {o.vessel_name && <div className="text-xs text-[var(--navy-400)] mt-0.5">"{o.vessel_name}"</div>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--navy-400)]">
                        {o.estimated_value && <span>{o.estimated_value}</span>}
                        {o.location && <span>{o.location}</span>}
                        {o.how_known && <span>{o.how_known}</span>}
                      </div>
                      {o.description && <div className="text-xs text-[var(--navy-400)] mt-2 line-clamp-2">{o.description}</div>}
                      {(o.owner_email || o.owner_phone) && (
                        <div className="text-xs text-[var(--navy-300)] mt-2">{[o.owner_email, o.owner_phone].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                    <button onClick={() => deleteOwner(o.id)} className="btn-ghost text-[var(--navy-300)] hover:text-[var(--coral-500)]">✕</button>
                  </div>
                  {isExpanded && oMatchList.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
                      <div className="form-section-title text-[var(--brass-500)] mb-1">Interested Buyers</div>
                      {oMatchList.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2 bg-[var(--sand-50)] dark:bg-[var(--navy-800)] rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--navy-800)] dark:text-[var(--navy-200)]">
                              {m.buyer_name} — looking for {[m.iso_make, m.length_min && m.length_max ? `${m.length_min}–${m.length_max}` : ""].filter(Boolean).join(" ")}
                            </div>
                            <div className="text-[10px] text-[var(--navy-400)]">Budget: {[m.budget_min, m.budget_max].filter(Boolean).join("–")} · Score: {m.match_score} · {m.buyer_email}</div>
                          </div>
                          <MatchActions match={m} onUpdate={updateMatch} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )

      ) : /* matches tab */ (
        matches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon mx-auto mb-3 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </div>
            <div className="empty-state-text">No matches yet</div>
            <p className="empty-state-sub">Add owners and ISO requests — matches are generated automatically</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.filter(m => m.status === "new").length > 0 && (
              <div className="form-section-title text-[var(--sea-500)] mb-1">
                New — Needs Action ({matches.filter(m => m.status === "new").length})
              </div>
            )}
            {matches.map(m => {
              const vesselSummary = [m.owner_year, m.owner_length, m.owner_make, m.owner_model].filter(Boolean).join(" ");
              const buyerCriteria = [m.iso_make, m.length_min && m.length_max ? `${m.length_min}–${m.length_max}` : ""].filter(Boolean).join(" ");
              const isNew = m.status === "new";
              const isDismissed = m.status === "dismissed";
              return (
                <div key={m.id}
                  className={`card-elevated p-4 ${
                    isNew ? "border-[var(--brass-200)] dark:border-[var(--brass-500)]/30"
                    : isDismissed ? "opacity-50" : ""
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="match-score">Score: {m.match_score}</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="text-sm text-[var(--navy-900)] dark:text-white">
                        <span className="font-semibold">{m.owner_name}</span> has a <span className="font-medium text-[var(--brass-500)]">{vesselSummary}</span>
                        {m.owner_value && <span className="text-[var(--navy-400)]"> ({m.owner_value})</span>}
                      </div>
                      <div className="text-sm text-[var(--navy-600)] dark:text-[var(--navy-300)] mt-0.5">
                        <span className="font-semibold">{m.buyer_name}</span> is looking for <span className="font-medium">{buyerCriteria || "matching vessels"}</span>
                        {m.budget_min || m.budget_max ? <span className="text-[var(--navy-400)]"> (budget: {[m.budget_min, m.budget_max].filter(Boolean).join("–")})</span> : null}
                      </div>
                      {m.match_reasons && <div className="text-[11px] text-[var(--navy-400)] mt-1">{m.match_reasons}</div>}
                      {m.buyer_email && <div className="text-[11px] text-[var(--navy-300)] mt-0.5">{m.buyer_email} {m.buyer_phone ? `· ${m.buyer_phone}` : ""}</div>}
                    </div>
                    <MatchActions match={m} onUpdate={updateMatch} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {showPocketForm && <PocketForm onClose={() => setShowPocketForm(false)} onSuccess={() => { setShowPocketForm(false); fetchData(); }} />}
      {showIsoForm && <IsoForm onClose={() => setShowIsoForm(false)} onSuccess={() => { setShowIsoForm(false); fetchData(); }} />}
      {showOwnerForm && <OwnerForm onClose={() => setShowOwnerForm(false)} onSuccess={() => { setShowOwnerForm(false); fetchData(); }} />}
    </PageShell>
  );
}

// ─── Helper Components ──────────────────────────────────────────────

const inputClass = "form-input";
const labelClass = "form-label";

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || "badge-active";
  return (
    <span className={`badge ${cls}`}>
      {status.toUpperCase().replace("_", " ")}
    </span>
  );
}

function EmptyState({ icon, label, onAdd }: { icon: string; label: string; onAdd: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon mx-auto mb-3 flex items-center justify-center">
        {icon === "lock" && <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
        {icon === "search" && <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>}
        {icon === "ship" && <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M12 1v4"/></svg>}
      </div>
      <div className="empty-state-text">{label}</div>
      <button onClick={onAdd} className="mt-3 text-sm text-[var(--brass-500)] hover:text-[var(--brass-400)] transition-colors">Add your first</button>
    </div>
  );
}

function MatchActions({ match, onUpdate }: { match: Match; onUpdate: (id: number, status: string) => void }) {
  if (match.status === "dismissed") return <span className="text-[10px] text-[var(--navy-400)]">dismissed</span>;
  return (
    <div className="flex gap-1 shrink-0">
      {match.status === "new" && (
        <button onClick={() => onUpdate(match.id, "contacted")}
          className="badge badge-contacted cursor-pointer hover:opacity-80 transition-opacity">
          Contacted
        </button>
      )}
      {match.status !== "dismissed" && (
        <button onClick={() => onUpdate(match.id, "dismissed")}
          className="badge badge-dismissed cursor-pointer hover:opacity-80 transition-opacity">
          ✕
        </button>
      )}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="modal-close">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PocketForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ make: "", model: "", year: "", length: "", price: "", location: "", description: "", seller_name: "", seller_contact: "", listing_url: "", notes: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.make && !f.model && !f.description) { setError("Add vessel details"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/market/pockets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (!res.ok) throw new Error("Failed");
      onSuccess();
    } catch { setError("Failed to save"); } finally { setSaving(false); }
  };
  return (
    <ModalShell title="Add Pocket Listing" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-body space-y-3">
        {error && <p className="text-sm text-[var(--coral-500)] bg-[var(--coral-500)]/8 px-3 py-2 rounded-xl">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Make</label><input value={f.make} onChange={set("make")} className={inputClass} placeholder="Azimut" /></div>
          <div><label className={labelClass}>Model</label><input value={f.model} onChange={set("model")} className={inputClass} placeholder="Grande 27M" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelClass}>Year</label><input value={f.year} onChange={set("year")} className={inputClass} placeholder="2022" /></div>
          <div><label className={labelClass}>Length</label><input value={f.length} onChange={set("length")} className={inputClass} placeholder="88'" /></div>
          <div><label className={labelClass}>Price</label><input value={f.price} onChange={set("price")} className={inputClass} placeholder="$4,500,000" /></div>
        </div>
        <div><label className={labelClass}>Location</label><input value={f.location} onChange={set("location")} className={inputClass} placeholder="Miami, FL" /></div>
        <div><label className={labelClass}>Description</label><textarea value={f.description} onChange={set("description")} className={`${inputClass} min-h-[60px]`} placeholder="Off-market details…" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Seller Name</label><input value={f.seller_name} onChange={set("seller_name")} className={inputClass} /></div>
          <div><label className={labelClass}>Seller Contact</label><input value={f.seller_contact} onChange={set("seller_contact")} className={inputClass} /></div>
        </div>
        <div><label className={labelClass}>Listing URL</label><input value={f.listing_url} onChange={set("listing_url")} className={inputClass} placeholder="https://..." /></div>
        <div><label className={labelClass}>Notes</label><textarea value={f.notes} onChange={set("notes")} className={`${inputClass} min-h-[40px]`} /></div>
        <FormButtons onClose={onClose} saving={saving} label="Add Listing" />
      </form>
    </ModalShell>
  );
}

function IsoForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({ buyer_name: "", buyer_email: "", buyer_phone: "", make: "", model: "", year_min: "", year_max: "", length_min: "", length_max: "", budget_min: "", budget_max: "", description: "", notes: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.buyer_name && !f.make && !f.description) { setError("Add buyer or vessel details"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/market/iso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      if (!res.ok) throw new Error("Failed");
      onSuccess();
    } catch { setError("Failed to save"); } finally { setSaving(false); }
  };
  return (
    <ModalShell title="Add Buyer Search (ISO)" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-body space-y-3">
        {error && <p className="text-sm text-[var(--coral-500)] bg-[var(--coral-500)]/8 px-3 py-2 rounded-xl">{error}</p>}
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelClass}>Buyer Name</label><input value={f.buyer_name} onChange={set("buyer_name")} className={inputClass} placeholder="John Smith" /></div>
          <div><label className={labelClass}>Email</label><input value={f.buyer_email} onChange={set("buyer_email")} className={inputClass} placeholder="john@email.com" /></div>
          <div><label className={labelClass}>Phone</label><input value={f.buyer_phone} onChange={set("buyer_phone")} className={inputClass} placeholder="+1 555-1234" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Make</label><input value={f.make} onChange={set("make")} className={inputClass} placeholder="Sunseeker" /></div>
          <div><label className={labelClass}>Model</label><input value={f.model} onChange={set("model")} className={inputClass} placeholder="Predator" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Year (min)</label><input value={f.year_min} onChange={set("year_min")} className={inputClass} placeholder="2018" /></div>
          <div><label className={labelClass}>Year (max)</label><input value={f.year_max} onChange={set("year_max")} className={inputClass} placeholder="2025" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Length (min)</label><input value={f.length_min} onChange={set("length_min")} className={inputClass} placeholder="60'" /></div>
          <div><label className={labelClass}>Length (max)</label><input value={f.length_max} onChange={set("length_max")} className={inputClass} placeholder="90'" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Budget (min)</label><input value={f.budget_min} onChange={set("budget_min")} className={inputClass} placeholder="$1,000,000" /></div>
          <div><label className={labelClass}>Budget (max)</label><input value={f.budget_max} onChange={set("budget_max")} className={inputClass} placeholder="$3,000,000" /></div>
        </div>
        <div><label className={labelClass}>Preferences / Requirements</label><textarea value={f.description} onChange={set("description")} className={`${inputClass} min-h-[60px]`} placeholder="Location, features, must-haves…" /></div>
        <div><label className={labelClass}>Notes</label><textarea value={f.notes} onChange={set("notes")} className={`${inputClass} min-h-[40px]`} /></div>
        <FormButtons onClose={onClose} saving={saving} label="Add Search" />
      </form>
    </ModalShell>
  );
}

function OwnerForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [matchResult, setMatchResult] = useState<string>("");
  const [f, setF] = useState({
    owner_name: "", owner_email: "", owner_phone: "",
    make: "", model: "", year: "", length: "", estimated_value: "",
    location: "", vessel_name: "", how_known: "", description: "", notes: "",
    status: "active",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.owner_name) { setError("Owner name is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/market/owners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) throw new Error("Failed");
      if (data.matchCount && data.matchCount > 0) {
        setMatchResult(`🔗 ${data.matchCount} buyer match${data.matchCount > 1 ? "es" : ""} found!`);
        setTimeout(onSuccess, 1500);
      } else {
        onSuccess();
      }
    } catch { setError("Failed to save"); } finally { setSaving(false); }
  };

  return (
    <ModalShell title="Add Vessel Owner" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-body space-y-3">
        {error && <p className="text-sm text-[var(--coral-500)] bg-[var(--coral-500)]/8 px-3 py-2 rounded-xl">{error}</p>}
        {matchResult && <p className="text-sm text-[var(--brass-500)] bg-[var(--brass-50)] dark:bg-[var(--brass-500)]/10 px-3 py-2 rounded-xl font-semibold">{matchResult}</p>}

        <div className="form-section-title">Owner Info</div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelClass}>Name *</label><input value={f.owner_name} onChange={set("owner_name")} className={inputClass} placeholder="Robert Chen" /></div>
          <div><label className={labelClass}>Email</label><input value={f.owner_email} onChange={set("owner_email")} className={inputClass} placeholder="robert@email.com" /></div>
          <div><label className={labelClass}>Phone</label><input value={f.owner_phone} onChange={set("owner_phone")} className={inputClass} placeholder="+1 555-9876" /></div>
        </div>

        <div className="form-section-title">Vessel Details</div>
        <div><label className={labelClass}>Vessel Name</label><input value={f.vessel_name} onChange={set("vessel_name")} className={inputClass} placeholder="Sea Breeze III" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass}>Make</label><input value={f.make} onChange={set("make")} className={inputClass} placeholder="Sunseeker" /></div>
          <div><label className={labelClass}>Model</label><input value={f.model} onChange={set("model")} className={inputClass} placeholder="Predator 74" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={labelClass}>Year</label><input value={f.year} onChange={set("year")} className={inputClass} placeholder="2021" /></div>
          <div><label className={labelClass}>Length</label><input value={f.length} onChange={set("length")} className={inputClass} placeholder="74'" /></div>
          <div><label className={labelClass}>Est. Value</label><input value={f.estimated_value} onChange={set("estimated_value")} className={inputClass} placeholder="$2,500,000" /></div>
        </div>
        <div><label className={labelClass}>Location</label><input value={f.location} onChange={set("location")} className={inputClass} placeholder="Fort Lauderdale, FL" /></div>

        <div className="form-section-title">Context</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>How Known (Source)</label>
            <select value={f.how_known} onChange={set("how_known")} className={inputClass}>
              <option value="">Select…</option>
              <option value="marina contact">Marina Contact</option>
              <option value="broker network">Broker Network</option>
              <option value="public records">Public Records</option>
              <option value="boat show">Boat Show</option>
              <option value="referral">Referral</option>
              <option value="existing client">Existing Client</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={f.status} onChange={set("status")} className={inputClass}>
              <option value="active">Active</option>
              <option value="sold">Sold</option>
              <option value="not_for_sale">Not For Sale</option>
            </select>
          </div>
        </div>
        <div><label className={labelClass}>Description</label><textarea value={f.description} onChange={set("description")} className={`${inputClass} min-h-[60px]`} placeholder="Vessel condition, upgrades, maintenance history…" /></div>
        <div><label className={labelClass}>Notes</label><textarea value={f.notes} onChange={set("notes")} className={`${inputClass} min-h-[40px]`} placeholder="Internal notes…" /></div>
        <FormButtons onClose={onClose} saving={saving} label="Add Owner" />
      </form>
    </ModalShell>
  );
}

function FormButtons({ onClose, saving, label }: { onClose: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
      <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? "Saving…" : label}</button>
    </div>
  );
}
