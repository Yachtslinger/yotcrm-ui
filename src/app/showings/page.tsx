"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import PageShell from "../components/PageShell";
import { MapPin, Plus, Search, Send, X, Edit2, Trash2, Copy, Phone, Mail, ExternalLink, Clock, ChevronLeft, Image as ImageIcon, Navigation } from "lucide-react";

type ShowingLocation = {
  id: number; yacht_name: string; marina_name: string; address: string;
  city: string; slip_number: string; gate_code: string; dockmaster_phone: string;
  special_instructions: string; internal_notes: string; map_image: string;
  status: string; created_at: string; updated_at: string;
};

type SendLogEntry = {
  id: number; showing_id: number; recipient_name: string;
  recipient_contact: string; channel: string; sent_at: string;
};

function mapsLink(address: string, type: "google" | "apple") {
  const encoded = encodeURIComponent(address);
  return type === "google"
    ? `https://www.google.com/maps/search/?api=1&query=${encoded}`
    : `https://maps.apple.com/?q=${encoded}`;
}

function formatShowingMessage(s: ShowingLocation): string {
  const lines = [
    `Yacht Showing Details`,
    ``,
    `Vessel: ${s.yacht_name}`,
    s.marina_name ? `Location: ${s.marina_name}` : "",
    s.address ? `Address: ${s.address}` : "",
    s.slip_number ? `Slip: ${s.slip_number}` : "",
    ``,
    s.address ? `Directions: ${mapsLink(s.address, "google")}` : "",
    ``,
    s.special_instructions ? `${s.special_instructions}` : "",
    ``,
    `Please call when you arrive.`,
  ];
  return lines.filter(l => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EMPTY: Partial<ShowingLocation> = {
  yacht_name: "", marina_name: "", address: "", city: "", slip_number: "",
  gate_code: "", dockmaster_phone: "", special_instructions: "", internal_notes: "",
  map_image: "", status: "active",
};

export default function ShowingsPage() {
  const [items, setItems] = useState<ShowingLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [selected, setSelected] = useState<ShowingLocation | null>(null);
  const [sendLog, setSendLog] = useState<SendLogEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [form, setForm] = useState<Partial<ShowingLocation>>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Send form state */
  const [sendName, setSendName] = useState("");
  const [sendContact, setSendContact] = useState("");
  const [sendChannel, setSendChannel] = useState<"email" | "sms" | "clipboard">("email");

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/showings").then(r => r.json());
      if (res.ok) setItems(res.items);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectItem = async (item: ShowingLocation) => {
    setSelected(item);
    try {
      const res = await fetch(`/api/showings?id=${item.id}`).then(r => r.json());
      if (res.ok) { setSelected(res.showing); setSendLog(res.send_log || []); }
    } catch {}
  };

  const openNew = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true); };
  const openEdit = (item: ShowingLocation) => {
    setForm({ ...item }); setEditId(item.id); setShowForm(true);
  };

  const saveForm = async () => {
    setSaving(true);
    try {
      const action = editId ? "update" : "create";
      const body = editId ? { action, id: editId, ...form } : { action, ...form };
      const res = await fetch("/api/showings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (editId) {
          setItems(prev => prev.map(i => i.id === editId ? data.item : i));
          if (selected?.id === editId) setSelected(data.item);
        } else {
          setItems(prev => [data.item, ...prev]);
        }
        setShowForm(false);
      } else {
        alert("Save failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      alert("Save failed: " + String(err));
    } finally { setSaving(false); }
  };

  const deleteItem = async (id: number) => {
    if (!confirm("Delete this listing location?")) return;
    await fetch("/api/showings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setItems(prev => prev.filter(i => i.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, map_image: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const doSend = async () => {
    if (!selected) return;
    const msg = formatShowingMessage(selected);

    if (sendChannel === "clipboard") {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (sendChannel === "email") {
      const subject = encodeURIComponent(`Showing Details: ${selected.yacht_name}`);
      const body = encodeURIComponent(msg);
      const mailto = sendContact ? `mailto:${sendContact}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`;
      window.open(mailto);
    } else if (sendChannel === "sms") {
      // Try Web Share API first (supports images on iOS)
      if (selected.map_image && navigator.share && navigator.canShare) {
        try {
          // Convert base64 data URL to a File
          const res = await fetch(selected.map_image);
          const blob = await res.blob();
          const file = new File([blob], `${selected.yacht_name.replace(/[^a-zA-Z0-9]/g, "_")}_map.jpg`, { type: blob.type || "image/jpeg" });
          const shareData: ShareData = { text: msg, files: [file] };
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
          } else {
            // Fallback: share without image
            await navigator.share({ text: msg });
          }
        } catch (err: unknown) {
          // User cancelled or share failed — fall back to sms: link
          if (err instanceof Error && err.name !== "AbortError") {
            const body = encodeURIComponent(msg);
            const smsLink = sendContact ? `sms:${sendContact}&body=${body}` : `sms:&body=${body}`;
            window.open(smsLink);
          }
        }
      } else {
        // No map image or no Web Share API — use sms: link
        const body = encodeURIComponent(msg);
        const smsLink = sendContact ? `sms:${sendContact}&body=${body}` : `sms:&body=${body}`;
        window.open(smsLink);
      }
    }

    /* Log it */
    await fetch("/api/showings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "log_send", showing_id: selected.id,
        recipient_name: sendName, recipient_contact: sendContact, channel: sendChannel,
      }),
    });
    setSendLog(prev => [{ id: 0, showing_id: selected.id, recipient_name: sendName, recipient_contact: sendContact, channel: sendChannel, sent_at: new Date().toISOString() }, ...prev]);
    setShowSend(false); setSendName(""); setSendContact("");
  };

  /* Derived data */
  const active = items.filter(i => i.status === "active");
  const cities = useMemo(() => {
    const set = new Set(active.map(i => i.city).filter(Boolean));
    return Array.from(set).sort();
  }, [active]);

  const filtered = useMemo(() => {
    let list = active;
    if (cityFilter) list = list.filter(i => i.city === cityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.yacht_name.toLowerCase().includes(q) ||
        i.marina_name.toLowerCase().includes(q) ||
        i.address.toLowerCase().includes(q) ||
        i.city.toLowerCase().includes(q)
      );
    }
    return list;
  }, [active, cityFilter, search]);

  /* ═══════ DETAIL VIEW ═══════ */
  if (selected) {
    return (
      <PageShell
        title={selected.yacht_name || "Untitled Listing"}
        subtitle={[selected.marina_name, selected.city].filter(Boolean).join(" · ")}
        breadcrumb={[{ label: "Listing Locations", href: "#" }]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => openEdit(selected)} className="btn-ghost text-sm flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
            <button onClick={() => { setShowSend(true); setSendName(""); setSendContact(""); setSendChannel("email"); }}
              className="btn-primary text-sm flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Send Showing Info</button>
          </div>
        }
      >
        {/* Back button for mobile */}
        <button onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1 text-sm font-medium"
          style={{ color: "var(--brass-400)" }}>
          <ChevronLeft className="w-4 h-4" /> Back to Listings
        </button>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Map Image */}
          <div className="card-elevated overflow-hidden">
            {selected.map_image ? (
              <img src={selected.map_image} alt="Dock map"
                className="w-full max-h-[500px] object-contain bg-[var(--navy-900)]" />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center"
                style={{ color: "var(--navy-300)" }}>
                <MapPin className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No map uploaded</p>
                <button onClick={() => openEdit(selected)}
                  className="mt-2 text-xs font-medium" style={{ color: "var(--brass-400)" }}>
                  Add Map Image
                </button>
              </div>
            )}
          </div>

          {/* Details Card */}
          <div className="card-elevated p-5 space-y-4">
            {selected.address && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>Address</p>
                <p className="text-sm" style={{ color: "var(--navy-800)" }}>{selected.address}</p>
                <div className="flex gap-3 mt-2">
                  <a href={mapsLink(selected.address, "google")} target="_blank" rel="noopener"
                    className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--sea-500)" }}>
                    <Navigation className="w-3 h-3" /> Google Maps
                  </a>
                  <a href={mapsLink(selected.address, "apple")} target="_blank" rel="noopener"
                    className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--sea-500)" }}>
                    <ExternalLink className="w-3 h-3" /> Apple Maps
                  </a>
                </div>
              </div>
            )}

            {selected.slip_number && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>Slip</p>
                <p className="text-sm font-medium" style={{ color: "var(--navy-800)" }}>{selected.slip_number}</p>
              </div>
            )}

            {selected.gate_code && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>Gate Code</p>
                <p className="text-sm font-mono font-bold" style={{ color: "var(--coral-500)" }}>{selected.gate_code}</p>
              </div>
            )}

            {selected.dockmaster_phone && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>Dockmaster</p>
                <a href={`tel:${selected.dockmaster_phone}`}
                  className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--sea-500)" }}>
                  <Phone className="w-3.5 h-3.5" /> {selected.dockmaster_phone}
                </a>
              </div>
            )}

            {selected.special_instructions && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-400)" }}>Special Instructions</p>
                <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--navy-700)" }}>{selected.special_instructions}</p>
              </div>
            )}

            {selected.internal_notes && (
              <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--navy-300)" }}>Internal Notes (not sent)</p>
                <p className="text-sm italic whitespace-pre-wrap" style={{ color: "var(--navy-400)" }}>{selected.internal_notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Send Log */}
        {sendLog.length > 0 && (
          <div className="mt-5 card-elevated p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--navy-400)" }}>Send History</h3>
            <div className="space-y-2">
              {sendLog.map((log, i) => (
                <div key={log.id || i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    {log.channel === "email" ? <Mail className="w-3.5 h-3.5" style={{ color: "var(--sea-500)" }} /> :
                     log.channel === "sms" ? <Phone className="w-3.5 h-3.5" style={{ color: "var(--sea-500)" }} /> :
                     <Copy className="w-3.5 h-3.5" style={{ color: "var(--navy-400)" }} />}
                    <span style={{ color: "var(--navy-700)" }}>{log.recipient_name || log.recipient_contact || "Copied"}</span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--navy-300)" }}>{formatDateTime(log.sent_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Send Modal ── */}
        {showSend && (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
            <div className="absolute inset-0 bg-[rgba(6,14,26,0.65)]" onClick={() => setShowSend(false)} />
            <div className="relative z-10 w-full max-w-md rounded-2xl p-6 animate-scale-in"
              style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)" }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold" style={{ color: "var(--navy-900)" }}>Send Showing Info</h2>
                <button onClick={() => setShowSend(false)} className="icon-btn icon-btn-sm"><X /></button>
              </div>

              {/* Channel Tabs */}
              <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--sand-100)" }}>
                {([["email", "Email", Mail], ["sms", "SMS", Phone], ["clipboard", "Copy", Copy]] as const).map(([ch, label, Icon]) => (
                  <button key={ch} onClick={() => setSendChannel(ch)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      sendChannel === ch ? "bg-white shadow-sm" : ""
                    }`}
                    style={{ color: sendChannel === ch ? "var(--navy-900)" : "var(--navy-400)" }}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>

              {sendChannel !== "clipboard" && (
                <>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--navy-500)" }}>Recipient Name</label>
                  <input value={sendName} onChange={e => setSendName(e.target.value)}
                    className="form-input mb-3" placeholder="John Smith" />
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--navy-500)" }}>
                    {sendChannel === "email" ? "Email Address" : "Phone Number"}
                  </label>
                  <input value={sendContact} onChange={e => setSendContact(e.target.value)}
                    className="form-input mb-4"
                    placeholder={sendChannel === "email" ? "john@example.com" : "+1 (555) 123-4567"} />
                </>
              )}

              {/* Preview */}
              <div className="rounded-xl p-3 mb-4 text-xs whitespace-pre-wrap font-mono max-h-40 overflow-y-auto"
                style={{ background: "var(--sand-50)", color: "var(--navy-600)", border: "1px solid var(--border)" }}>
                {formatShowingMessage(selected)}
              </div>

              <button onClick={doSend}
                className="btn-primary w-full flex items-center justify-center gap-2">
                {sendChannel === "clipboard" ? (
                  <>{copied ? "Copied!" : <><Copy className="w-4 h-4" /> Copy to Clipboard</>}</>
                ) : sendChannel === "email" ? (
                  <><Mail className="w-4 h-4" /> Open in Mail</>
                ) : (
                  <><Phone className="w-4 h-4" /> Open in Messages</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Edit Modal (reuse form modal) ── */}
        {showForm && <FormModal form={form} setForm={setForm} editId={editId} saving={saving}
          onSave={saveForm} onClose={() => setShowForm(false)}
          fileRef={fileRef} handleImageUpload={handleImageUpload} />}
      </PageShell>
    );
  }

  /* ═══════ LIST VIEW ═══════ */
  return (
    <PageShell
      title="Listing Locations"
      subtitle={`${active.length} active listing${active.length !== 1 ? "s" : ""}`}
      actions={<button onClick={openNew} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Location</button>}
    >
      {/* Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--navy-300)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="form-input pl-10 w-full" placeholder="Search yacht, marina, address..." />
        </div>
        {cities.length > 1 && (
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
            className="form-input w-full sm:w-auto sm:min-w-[160px]">
            <option value="">All Cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="skeleton rounded-xl" style={{ height: 80 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "var(--navy-400)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--navy-400)" }}>
            {search || cityFilter ? "No locations match your search" : "No showing locations yet"}
          </p>
          {!search && !cityFilter && (
            <button onClick={openNew} className="mt-3 text-sm font-semibold" style={{ color: "var(--brass-400)" }}>
              + Add your first listing
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(item => (
            <button key={item.id} onClick={() => selectItem(item)}
              className="card-elevated p-4 text-left transition-all hover:shadow-md group">
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                  style={{ background: item.map_image ? "var(--navy-900)" : "var(--sand-100)" }}>
                  {item.map_image ? (
                    <img src={item.map_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <MapPin className="w-5 h-5 opacity-30" style={{ color: "var(--navy-400)" }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold truncate group-hover:text-[var(--brass-400)] transition-colors"
                    style={{ color: "var(--navy-900)" }}>{item.yacht_name || "Untitled"}</h3>
                  <p className="text-xs truncate mt-0.5" style={{ color: "var(--navy-500)" }}>{item.marina_name}</p>
                  <p className="text-xs truncate" style={{ color: "var(--navy-400)" }}>
                    {[item.city, item.slip_number ? `Slip ${item.slip_number}` : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && <FormModal form={form} setForm={setForm} editId={editId} saving={saving}
        onSave={saveForm} onClose={() => setShowForm(false)}
        fileRef={fileRef} handleImageUpload={handleImageUpload} />}
    </PageShell>
  );
}

/* ═══════ Form Modal Component ═══════ */
function FormModal({ form, setForm, editId, saving, onSave, onClose, fileRef, handleImageUpload }: {
  form: Partial<ShowingLocation>; setForm: (fn: (f: Partial<ShowingLocation>) => Partial<ShowingLocation>) => void;
  editId: number | null; saving: boolean; onSave: () => void; onClose: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>; handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-[rgba(6,14,26,0.65)]" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col">
        {/* Spacer top */}
        <div className="shrink-0 h-[5vh]" onClick={onClose} />
        {/* Modal card */}
        <div className="relative mx-auto w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
          style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)", maxHeight: "90vh" }}>
          {/* Header — fixed */}
          <div className="shrink-0 flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-bold" style={{ color: "var(--navy-900)" }}>
              {editId ? "Edit Location" : "New Listing Location"}
            </h2>
            <button onClick={onClose} className="icon-btn icon-btn-sm"><X /></button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <Field label="Yacht Name *" value={form.yacht_name || ""} onChange={v => set("yacht_name", v)} placeholder="M/Y Lady Lorraine" />
            <Field label="Marina Name" value={form.marina_name || ""} onChange={v => set("marina_name", v)} placeholder="Marina Bay" />
            <Field label="Full Address" value={form.address || ""} onChange={v => set("address", v)} placeholder="2525 Marina Bay Dr W, Fort Lauderdale, FL 33312" />
            <Field label="City" value={form.city || ""} onChange={v => set("city", v)} placeholder="Fort Lauderdale" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slip Number" value={form.slip_number || ""} onChange={v => set("slip_number", v)} placeholder="B11" />
              <Field label="Gate Code" value={form.gate_code || ""} onChange={v => set("gate_code", v)} placeholder="#7324" />
            </div>
            <Field label="Dockmaster Phone" value={form.dockmaster_phone || ""} onChange={v => set("dockmaster_phone", v)} placeholder="+1 (555) 123-4567" />
            <Field label="Special Instructions (sent to prospect)" value={form.special_instructions || ""} onChange={v => set("special_instructions", v)}
              placeholder="Call owner in advance. Vessel should be unlocked." multiline />
            <Field label="Internal Notes (NOT sent)" value={form.internal_notes || ""} onChange={v => set("internal_notes", v)}
              placeholder="Owner is Stew, prefers morning showings..." multiline />

            {/* Map Image Upload */}
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--navy-500)" }}>Map / Dock Image</p>
              {form.map_image ? (
                <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                  <img src={form.map_image} alt="Map preview" className="w-full max-h-48 object-contain bg-[var(--navy-900)]" />
                  <button onClick={() => setForm(f => ({ ...f, map_image: "" }))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-black/80">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-1.5 transition-colors hover:border-[var(--brass-400)]"
                  style={{ borderColor: "var(--border)", color: "var(--navy-400)" }}>
                  <ImageIcon className="w-6 h-6 opacity-50" />
                  <span className="text-xs font-medium">Upload Map Screenshot</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </div>
          </div>

          {/* Footer — fixed at bottom */}
          <div className="shrink-0 flex gap-3 p-5 border-t" style={{ borderColor: "var(--border)" }}>
            <button type="button" onClick={onClose} className="btn-ghost flex-1" style={{ minHeight: "48px" }}>Cancel</button>
            <button type="button" onClick={onSave} disabled={saving || !form.yacht_name?.trim()}
              className="btn-primary flex-1 disabled:opacity-50" style={{ minHeight: "48px" }}>
              {saving ? "Saving..." : editId ? "Save Changes" : "Create Location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════ Reusable Field ═══════ */
function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--navy-500)" }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={3}
          className="form-input w-full resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="form-input w-full" />
      )}
    </div>
  );
}
