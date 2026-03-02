"use client";

import React, { useState, useRef } from "react";
import { Search, UserPlus, Upload, X, ChevronDown } from "lucide-react";

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STATUS_OPTIONS = ["new", "hot", "warm", "cold", "nurture", "other"];
const SOURCE_OPTIONS = [
  "YachtWorld", "Denison", "JamesEdition", "RightBoat", "YATCO",
  "Boat Show", "Referral", "Cold Call", "Walk-in", "Website Chat", "Other",
];

const YACHT_MAKES = [
  "Absolute", "Azimut", "Baglietto", "Benetti", "Bertram", "Burger", "Cabo",
  "Cheoy Lee", "Chris-Craft", "CRN", "Custom", "Damen", "Delta Marine",
  "Fairline", "Feadship", "Ferretti", "Galeon", "Grady-White", "Gulf Craft",
  "Hargrave", "Hatteras", "Heesen", "Hinckley", "Horizon", "Intermarine",
  "Jupiter", "Lazzara", "Lürssen", "Mangusta", "Maritimo", "Marlow",
  "Marquis", "MCP", "Meridian", "Monte Carlo", "Nordhavn", "Numarine",
  "Ocean Alexander", "Oceanfast", "Outer Reef", "Pacific Mariner",
  "Palmer Johnson", "Pardo", "Pershing", "President", "Princess",
  "Pursuit", "Regulator", "Richmond Yachts", "Riva", "Riviera",
  "Rossinavi", "Sanlorenzo", "Sabre", "Scout", "Sea Ray", "Sunreef",
  "Sunseeker", "Tiara", "Trinity", "Uniesse", "Van der Valk",
  "Viking", "Vicem", "Wally", "Wellcraft", "Westport", "Zeelander",
];

type AppleContact = { firstName: string; lastName: string; email: string; phone: string };

const emptyForm = {
  firstName: "", lastName: "", email: "", phone: "",
  status: "new", notes: "", source: "manual",
  boat_make: "", boat_model: "", boat_year: "", boat_length: "",
  boat_price: "", boat_location: "", listing_url: "",
};

export default function AddLeadModal({ isOpen, onClose, onSuccess }: AddLeadModalProps): React.ReactElement | null {
  const [tab, setTab] = useState<"manual" | "apple" | "hubspot">("manual");
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState("");
  const [scrapeStatus, setScrapeStatus] = useState("");
  const [showBoat, setShowBoat] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [makeSuggestions, setMakeSuggestions] = useState<string[]>([]);
  const [showMakeDrop, setShowMakeDrop] = useState(false);
  const makeRef = useRef<HTMLDivElement>(null);

  // Apple Contacts state
  const [appleSearch, setAppleSearch] = useState("");
  const [appleResults, setAppleResults] = useState<AppleContact[]>([]);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleError, setAppleError] = useState("");
  const [selectedApple, setSelectedApple] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const resetForm = () => {
    setForm({ ...emptyForm });
    setShowBoat(false); setScrapeStatus(""); setError("");
    setAppleSearch(""); setAppleResults([]); setSelectedApple(new Set());
  };

  // ── Make autocomplete ──
  const handleMakeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm({ ...form, boat_make: val });
    if (val.length >= 1) {
      const matches = YACHT_MAKES.filter(m => m.toLowerCase().startsWith(val.toLowerCase()));
      setMakeSuggestions(matches.slice(0, 8));
      setShowMakeDrop(matches.length > 0);
    } else {
      setShowMakeDrop(false);
    }
  };

  const selectMake = (make: string) => {
    setForm({ ...form, boat_make: make });
    setShowMakeDrop(false);
  };

  // ── URL Scrape ──
  const handleScrape = async () => {
    const url = form.listing_url.trim();
    if (!url) { setError("Paste a listing URL first"); return; }
    setScraping(true); setScrapeStatus("Scraping listing…"); setError("");
    try {
      const res = await fetch("/api/scrape", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Scrape failed (${res.status})`);
      const { data } = await res.json();
      if (!data) throw new Error("No data returned");
      const titleMatch = data.headline?.match(/(\d+)\s*(?:ft|')\s*(\d{4})\s+(.+)/i)
        || data.subject?.match(/(\d+)\s*(?:ft|')\s*(\d{4})\s+(.+)/i);
      setForm(prev => ({
        ...prev,
        boat_make: data.specs?.builder || prev.boat_make,
        boat_model: data.specs?.model || prev.boat_model,
        boat_year: data.specs?.year || titleMatch?.[2] || prev.boat_year,
        boat_length: data.specs?.loa || (titleMatch?.[1] ? titleMatch[1] + "ft" : "") || prev.boat_length,
        boat_price: data.price || prev.boat_price,
        boat_location: data.location || prev.boat_location,
        listing_url: data.listingUrl || url,
      }));
      setScrapeStatus("✓ Listing data imported"); setShowBoat(true);
    } catch (err: any) { setError(err.message); setScrapeStatus(""); }
    finally { setScraping(false); }
  };

  // ── Submit ──
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.firstName && !form.lastName && !form.email) { setError("Name or email required"); return; }
    setSaving(true); setError("");
    try {
      const hasBoat = [form.boat_make, form.boat_model, form.boat_year, form.boat_length, form.boat_price, form.listing_url].some(Boolean);
      const res = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          email: form.email || undefined, phone: form.phone,
          status: form.status, notes: form.notes, source: form.source,
          boat: hasBoat ? {
            make: form.boat_make, model: form.boat_model, year: form.boat_year,
            length: form.boat_length, price: form.boat_price, location: form.boat_location,
            listing_url: form.listing_url,
          } : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to create lead");
      onSuccess(); onClose(); resetForm();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  // ── Apple Contacts Search ──
  const searchAppleContacts = async () => {
    if (!appleSearch.trim() || appleSearch.trim().length < 2) return;
    setAppleLoading(true); setAppleError("");
    try {
      const res = await fetch(`/api/clients/import-contacts?q=${encodeURIComponent(appleSearch.trim())}`);
      const data = await res.json();
      if (data.error) setAppleError(data.error);
      setAppleResults(data.contacts || []);
    } catch (err: any) { setAppleError(err.message); }
    finally { setAppleLoading(false); }
  };

  const prefillFromApple = (c: AppleContact) => {
    setForm(prev => ({
      ...prev, firstName: c.firstName, lastName: c.lastName,
      email: c.email, phone: c.phone, source: "Apple Contacts",
    }));
    setTab("manual"); setShowBoat(true);
  };

  const toggleAppleSelect = (idx: number) => {
    const next = new Set(selectedApple);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedApple(next);
  };

  const bulkImportApple = async () => {
    if (selectedApple.size === 0) return;
    setSaving(true); setError("");
    let imported = 0;
    for (const idx of selectedApple) {
      const c = appleResults[idx];
      if (!c) continue;
      try {
        const res = await fetch("/api/clients", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: c.firstName, lastName: c.lastName,
            email: c.email || undefined, phone: c.phone,
            status: "new", source: "Apple Contacts", notes: "",
          }),
        });
        if (res.ok) imported++;
      } catch {}
    }
    setSaving(false);
    if (imported > 0) { onSuccess(); resetForm(); onClose(); }
    else { setError("No contacts could be imported (may already exist)"); }
  };

  // ── Styles ──
  const inp = "form-input w-full";
  const lbl = "block text-xs font-medium mb-1" as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full sm:max-w-lg sm:mx-4 max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}
        onClick={e => e.stopPropagation()}>

        {/* ── Header + Tabs ── */}
        <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>Add Lead</h2>
            <button onClick={() => { onClose(); resetForm(); }} className="p-2 -mr-2 rounded-lg"
              style={{ color: "var(--navy-400)" }}><X className="w-5 h-5" /></button>
          </div>
          <div className="flex px-5 gap-1">
            {([
              { key: "manual", label: "Manual Entry", icon: <UserPlus className="w-3.5 h-3.5" /> },
              { key: "apple", label: "Apple Contacts", icon: <Search className="w-3.5 h-3.5" /> },
              { key: "hubspot", label: "HubSpot", icon: <Upload className="w-3.5 h-3.5" /> },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors"
                style={{
                  color: tab === t.key ? "var(--brass-500)" : "var(--navy-400)",
                  background: tab === t.key ? "var(--background)" : "transparent",
                  borderBottom: tab === t.key ? "2px solid var(--brass-500)" : "2px solid transparent",
                }}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm mb-3 px-3 py-2 rounded-lg" style={{ color: "#dc2626", background: "rgba(239,68,68,0.08)" }}>{error}</p>}

          {/* ════ MANUAL ENTRY TAB ════ */}
          {tab === "manual" && (
            <form onSubmit={handleSubmit} id="addLeadForm" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl} style={{ color: "var(--navy-400)" }}>First Name</label>
                  <input value={form.firstName} onChange={set("firstName")} className={inp} placeholder="John" /></div>
                <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Last Name</label>
                  <input value={form.lastName} onChange={set("lastName")} className={inp} placeholder="Smith" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Email</label>
                  <input type="email" value={form.email} onChange={set("email")} className={inp} placeholder="john@example.com" /></div>
                <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Phone</label>
                  <input value={form.phone} onChange={set("phone")} className={inp} placeholder="+1 (555) 123-4567" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl} style={{ color: "var(--navy-400)" }}>Source</label>
                  <select value={form.source} onChange={set("source")} className={inp}>
                    <option value="manual">Manual</option>
                    {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} style={{ color: "var(--navy-400)" }}>Status</label>
                  <select value={form.status} onChange={set("status")} className={inp}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Notes</label>
                <textarea value={form.notes} onChange={set("notes")} className={`${inp} min-h-[50px]`} rows={2} placeholder="Relevant details…" /></div>

              {/* ── Boat of Interest ── */}
              <div>
                <button type="button" onClick={() => setShowBoat(!showBoat)}
                  className="flex items-center gap-1 text-sm font-semibold transition-colors"
                  style={{ color: "var(--brass-500)" }}>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBoat ? "rotate-180" : ""}`} />
                  {showBoat ? "Hide boat details" : "Add boat of interest"}
                </button>
                {showBoat && (
                  <div className="mt-3 space-y-3 p-4 rounded-xl" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
                    {/* URL Scrape */}
                    <div>
                      <label className={lbl} style={{ color: "var(--navy-400)" }}>Listing URL — paste &amp; fetch</label>
                      <div className="flex gap-2">
                        <input value={form.listing_url} onChange={set("listing_url")}
                          className={`${inp} flex-1`} placeholder="https://www.yachtworld.com/yacht/…" />
                        <button type="button" onClick={handleScrape} disabled={scraping}
                          className="btn-primary px-4 text-sm whitespace-nowrap" style={{ minHeight: 44, opacity: scraping ? 0.5 : 1 }}>
                          {scraping ? "…" : "Fetch"}
                        </button>
                      </div>
                      {scrapeStatus && <p className="text-xs mt-1" style={{ color: "#059669" }}>{scrapeStatus}</p>}
                    </div>
                    {/* Make with autocomplete */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative" ref={makeRef}>
                        <label className={lbl} style={{ color: "var(--navy-400)" }}>Make</label>
                        <input value={form.boat_make} onChange={handleMakeChange}
                          onFocus={() => { if (form.boat_make) handleMakeChange({ target: { value: form.boat_make } } as any); }}
                          onBlur={() => setTimeout(() => setShowMakeDrop(false), 200)}
                          className={inp} placeholder="Viking" autoComplete="off" />
                        {showMakeDrop && makeSuggestions.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg"
                            style={{ background: "var(--card)", border: "1px solid var(--border)", maxHeight: 180, overflowY: "auto" }}>
                            {makeSuggestions.map(m => (
                              <button key={m} type="button" onMouseDown={() => selectMake(m)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--sand-100)] dark:hover:bg-[var(--navy-800)]"
                                style={{ color: "var(--foreground)" }}>{m}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Model</label>
                        <input value={form.boat_model} onChange={set("boat_model")} className={inp} placeholder="55 Convertible" /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Year</label>
                        <input value={form.boat_year} onChange={set("boat_year")} className={inp} placeholder="2024" /></div>
                      <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Length</label>
                        <input value={form.boat_length} onChange={set("boat_length")} className={inp} placeholder="55'" /></div>
                      <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Price</label>
                        <input value={form.boat_price} onChange={set("boat_price")} className={inp} placeholder="$1,500,000" /></div>
                    </div>
                    <div><label className={lbl} style={{ color: "var(--navy-400)" }}>Location</label>
                      <input value={form.boat_location} onChange={set("boat_location")} className={inp} placeholder="Fort Lauderdale, FL" /></div>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* ════ APPLE CONTACTS TAB ════ */}
          {tab === "apple" && (
            <div className="space-y-4">
              <p className="text-xs" style={{ color: "var(--navy-400)" }}>
                Search your Apple Contacts to import as leads. Select one to pre-fill the form, or select multiple for bulk import.
              </p>
              <div className="flex gap-2">
                <input value={appleSearch} onChange={e => setAppleSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchAppleContacts()}
                  className={`${inp} flex-1`} placeholder="Search by name…" />
                <button onClick={searchAppleContacts} disabled={appleLoading || appleSearch.length < 2}
                  className="btn-primary px-4 text-sm whitespace-nowrap" style={{ minHeight: 44, opacity: appleLoading ? 0.5 : 1 }}>
                  {appleLoading ? "…" : "Search"}
                </button>
              </div>
              {appleError && <p className="text-xs" style={{ color: "#d97706" }}>{appleError}</p>}

              {appleResults.length > 0 && (
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                  {appleResults.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: selectedApple.has(i) ? "rgba(168,131,72,0.1)" : "var(--background)",
                        border: `1px solid ${selectedApple.has(i) ? "var(--brass-400)" : "var(--border)"}`,
                      }}
                      onClick={() => toggleAppleSelect(i)}>
                      <input type="checkbox" checked={selectedApple.has(i)} readOnly
                        className="w-4 h-4 rounded" style={{ accentColor: "var(--brass-500)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                          {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--navy-400)" }}>
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); prefillFromApple(c); }}
                        className="text-xs font-semibold px-2 py-1 rounded" style={{ color: "var(--brass-500)" }}>
                        Edit →
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {appleResults.length === 0 && !appleLoading && appleSearch.length >= 2 && !appleError && (
                <p className="text-sm text-center py-6" style={{ color: "var(--navy-400)" }}>No contacts found</p>
              )}
            </div>
          )}

          {/* ════ HUBSPOT TAB ════ */}
          {tab === "hubspot" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ background: "rgba(168,131,72,0.12)" }}>
                <Upload className="w-7 h-7" style={{ color: "var(--brass-500)" }} />
              </div>
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--foreground)" }}>HubSpot Import</h3>
              <p className="text-sm max-w-xs" style={{ color: "var(--navy-400)" }}>
                Import contacts directly from your HubSpot CRM. Search and pull in leads with their full contact history.
              </p>
              <div className="mt-4 px-4 py-2 rounded-full text-xs font-semibold"
                style={{ background: "rgba(168,131,72,0.12)", color: "var(--brass-500)" }}>
                Coming Soon
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-4 flex gap-3" style={{ borderTop: "1px solid var(--border)" }}>
          {tab === "manual" && (
            <>
              <button type="button" onClick={() => { onClose(); resetForm(); }}
                className="flex-1 btn-secondary text-sm" style={{ minHeight: 44 }}>Cancel</button>
              <button type="submit" form="addLeadForm" disabled={saving}
                className="flex-1 btn-primary text-sm font-semibold" style={{ minHeight: 44, opacity: saving ? 0.5 : 1 }}>
                {saving ? "Saving…" : "Add Lead"}
              </button>
            </>
          )}
          {tab === "apple" && (
            <>
              <button type="button" onClick={() => { onClose(); resetForm(); }}
                className="flex-1 btn-secondary text-sm" style={{ minHeight: 44 }}>Cancel</button>
              {selectedApple.size > 0 && (
                <button onClick={bulkImportApple} disabled={saving}
                  className="flex-1 btn-primary text-sm font-semibold" style={{ minHeight: 44, opacity: saving ? 0.5 : 1 }}>
                  {saving ? "Importing…" : `Import ${selectedApple.size} Contact${selectedApple.size > 1 ? "s" : ""}`}
                </button>
              )}
            </>
          )}
          {tab === "hubspot" && (
            <button type="button" onClick={() => { onClose(); resetForm(); }}
              className="w-full btn-secondary text-sm" style={{ minHeight: 44 }}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
