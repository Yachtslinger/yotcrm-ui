"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import PageShell from "../components/PageShell";
import { Anchor, Plus, Search, X, Edit2, Trash2, Phone, Copy, Navigation } from "lucide-react";
import { useToast } from "../components/ToastProvider";

type Marina = {
  id: number; name: string; address: string; city: string; state: string;
  gate_code: string; dockmaster_name: string; dockmaster_phone: string;
  office_phone: string; notes: string; created_at: string; updated_at: string;
};

const EMPTY: Partial<Marina> = {
  name: "", address: "", city: "", state: "", gate_code: "",
  dockmaster_name: "", dockmaster_phone: "", office_phone: "", notes: "",
};

export default function MarinasPage() {
  const { toast } = useToast();
  const [marinas, setMarinas] = useState<Marina[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Marina>>(EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/marinas").then(r => r.json());
      if (res.ok) setMarinas(res.marinas);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    if (!search.trim()) return marinas;
    const q = search.toLowerCase();
    return marinas.filter(m =>
      m.name.toLowerCase().includes(q) || m.city.toLowerCase().includes(q) ||
      m.address.toLowerCase().includes(q) || m.state.toLowerCase().includes(q)
    );
  }, [marinas, search]);

  const openNew = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true); };
  const openEdit = (m: Marina) => { setForm({ ...m }); setEditId(m.id); setShowForm(true); };

  const saveForm = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const action = editId ? "update" : "create";
      const body = editId ? { action, id: editId, ...form } : { action, ...form };
      const res = await fetch("/api/marinas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(r => r.json());
      if (res.ok) {
        if (editId) {
          setMarinas(prev => prev.map(m => m.id === editId ? res.marina : m));
          toast("Marina updated", "success");
        } else {
          setMarinas(prev => [...prev, res.marina]);
          toast("Marina added", "success");
        }
        setShowForm(false);
      }
    } catch { toast("Failed to save", "error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this marina?")) return;
    await fetch("/api/marinas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setMarinas(prev => prev.filter(m => m.id !== id));
    toast("Marina deleted", "success");
  };

  const copyCode = async (code: string, name: string) => {
    await navigator.clipboard.writeText(code);
    toast(`Gate code for ${name} copied`, "success");
  };

  return (
    <PageShell
      title="Marina Gate Codes"
      subtitle={`${marinas.length} marina${marinas.length !== 1 ? "s" : ""} saved`}
      actions={<button onClick={openNew} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Marina</button>}
    >
      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--navy-300)" }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="form-input pl-10 w-full" placeholder="Search marinas..." />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="skeleton rounded-xl" style={{ height: 80 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Anchor className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "var(--navy-400)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--navy-400)" }}>
            {search ? "No marinas match your search" : "No marinas saved yet"}
          </p>
          {!search && (
            <button onClick={openNew} className="mt-3 text-sm font-semibold" style={{ color: "var(--brass-400)" }}>
              + Add your first marina
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(m => (
            <div key={m.id} className="card-elevated p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold truncate" style={{ color: "var(--navy-900)" }}>{m.name}</h3>
                    {m.gate_code && (
                      <button onClick={() => copyCode(m.gate_code, m.name)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold transition-colors hover:bg-[var(--coral-500)]/10"
                        style={{ color: "var(--coral-500)", background: "var(--coral-500)/8" }}
                        title="Tap to copy gate code">
                        <Copy className="w-3 h-3" /> {m.gate_code}
                      </button>
                    )}
                  </div>
                  {m.address && (
                    <p className="text-xs mb-1" style={{ color: "var(--navy-500)" }}>
                      {m.address}{m.city ? `, ${m.city}` : ""}{m.state ? `, ${m.state}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {m.dockmaster_phone && (
                      <a href={`tel:${m.dockmaster_phone}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--sea-500)" }}>
                        <Phone className="w-3 h-3" /> {m.dockmaster_name ? `${m.dockmaster_name}` : "Dockmaster"}: {m.dockmaster_phone}
                      </a>
                    )}
                    {m.office_phone && (
                      <a href={`tel:${m.office_phone}`} className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--sea-500)" }}>
                        <Phone className="w-3 h-3" /> Office: {m.office_phone}
                      </a>
                    )}
                    {m.address && (
                      <a href={`https://maps.apple.com/?q=${encodeURIComponent(m.address + (m.city ? ', ' + m.city : '') + (m.state ? ', ' + m.state : ''))}`}
                        target="_blank" rel="noopener"
                        className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--sea-500)" }}>
                        <Navigation className="w-3 h-3" /> Directions
                      </a>
                    )}
                  </div>
                  {m.notes && (
                    <p className="text-xs mt-2 italic" style={{ color: "var(--navy-400)" }}>{m.notes}</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(m)} className="btn-ghost text-xs p-1.5" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(m.id)} className="btn-ghost text-xs p-1.5 hover:text-[var(--coral-500)]" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div className="absolute inset-0 bg-[rgba(6,14,26,0.65)]" onClick={() => setShowForm(false)} />
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 h-[5vh]" onClick={() => setShowForm(false)} />
            <div className="relative mx-auto w-full max-w-lg flex flex-col rounded-2xl overflow-hidden"
              style={{ background: "var(--card)", boxShadow: "var(--shadow-modal)", maxHeight: "90vh" }}>
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-lg font-bold" style={{ color: "var(--navy-900)" }}>
                  {editId ? "Edit Marina" : "Add Marina"}
                </h2>
                <button onClick={() => setShowForm(false)} className="icon-btn icon-btn-sm"><X /></button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <FormField label="Marina Name *" value={form.name || ""} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Bahia Mar Marina" />
                <FormField label="Address" value={form.address || ""} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="801 Seabreeze Blvd" />
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="City" value={form.city || ""} onChange={v => setForm(f => ({ ...f, city: v }))} placeholder="Fort Lauderdale" />
                  <FormField label="State" value={form.state || ""} onChange={v => setForm(f => ({ ...f, state: v }))} placeholder="FL" />
                </div>
                <FormField label="Gate Code" value={form.gate_code || ""} onChange={v => setForm(f => ({ ...f, gate_code: v }))} placeholder="#1234" />
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Dockmaster Name" value={form.dockmaster_name || ""} onChange={v => setForm(f => ({ ...f, dockmaster_name: v }))} placeholder="John" />
                  <FormField label="Dockmaster Phone" value={form.dockmaster_phone || ""} onChange={v => setForm(f => ({ ...f, dockmaster_phone: v }))} placeholder="+1 (555) 123-4567" />
                </div>
                <FormField label="Office Phone" value={form.office_phone || ""} onChange={v => setForm(f => ({ ...f, office_phone: v }))} placeholder="+1 (555) 987-6543" />
                <FormField label="Notes" value={form.notes || ""} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Hours, parking info, special access..." multiline />
              </div>

              {/* Footer */}
              <div className="shrink-0 flex gap-3 p-5 border-t" style={{ borderColor: "var(--border)" }}>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost flex-1" style={{ minHeight: "48px" }}>Cancel</button>
                <button type="button" onClick={saveForm} disabled={saving || !form.name?.trim()}
                  className="btn-primary flex-1 disabled:opacity-50" style={{ minHeight: "48px" }}>
                  {saving ? "Saving..." : editId ? "Save Changes" : "Add Marina"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function FormField({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: "var(--navy-500)" }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          className="form-input w-full resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="form-input w-full" />
      )}
    </div>
  );
}
