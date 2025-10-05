// src/app/yotcrm/page.tsx
"use client";

import * as React from "react";

/* ---------------- Types ---------------- */
type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  interest: string;
  status: "Hot" | "Warm" | "Cold";
  rating: number;
  updatedAt: string; // fixed strings unless explicitly set by action
  notes?: string;
  tags?: string;
};

type Segment = "All" | "Hot" | "Warm" | "Cold";

/* ---------------- Sample data ---------------- */
const SAMPLE_UPDATED_AT = "2025-09-28 14:10";

const SEED_LEADS: Lead[] = [
  {
    id: "LD-240915-001",
    name: "Scott Stevenson",
    email: "scott@client.com",
    phone: "+1 305 555 0142",
    interest: "90'–100' Motor Yacht",
    status: "Hot",
    rating: 5,
    updatedAt: SAMPLE_UPDATED_AT,
    notes: "FLIBS comps.",
    tags: "90-100', motor",
  },
  {
    id: "LD-240915-002",
    name: "Alexandra K.",
    email: "ak@example.com",
    phone: "+44 20 5555 0101",
    interest: "30m classic, Mediterranean",
    status: "Warm",
    rating: 4,
    updatedAt: "2025-09-27 10:25",
    notes: "Prefers wooden interior.",
    tags: "classic, Med",
  },
  {
    id: "LD-240915-003",
    name: "Chris B.",
    email: "cb@example.com",
    phone: "+1 949 555 1000",
    interest: "120' tri-deck, West Coast",
    status: "Cold",
    rating: 2,
    updatedAt: "2025-09-20 09:10",
    notes: "",
    tags: "tri-deck, CA",
  },
];

/* ---------------- Helpers ---------------- */
function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}
function makeId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(
    d.getDate()
  )}`;
  return `LD-${stamp}-${Math.floor(100 + Math.random() * 900)}`;
}

/* ---------------- Page ---------------- */
export default function YotCRMPage() {
  // leads state
  const [leads, setLeads] = React.useState<Lead[]>(SEED_LEADS);

  // filters
  const [segment, setSegment] = React.useState<Segment>("All");

  // selection (id)
  const [selectedId, setSelectedId] = React.useState(leads[0]?.id || "");

  // filtered list
  const filtered = React.useMemo(() => {
    if (segment === "All") return leads;
    return leads.filter((l) => l.status === segment);
  }, [leads, segment]);

  // keep a valid selection if filter changes
  React.useEffect(() => {
    if (!filtered.find((l) => l.id === selectedId)) {
      if (filtered.length > 0) setSelectedId(filtered[0].id);
      else setSelectedId(""); // nothing visible
    }
  }, [segment, leads]); // re-check on changes that affect filtered

  const selected = React.useMemo(
    () => filtered.find((l) => l.id === selectedId) || filtered[0],
    [filtered, selectedId]
  );

  // add-lead form toggle + state
  const [showAdd, setShowAdd] = React.useState(false);
  const [form, setForm] = React.useState<Lead>({
    id: "",
    name: "",
    email: "",
    phone: "",
    interest: "",
    status: "Warm",
    rating: 3,
    updatedAt: nowStamp(), // will be set again on save
    notes: "",
    tags: "",
  });

  function addLead() {
    if (!form.name.trim()) {
      alert("Name is required.");
      return;
    }
    const id = makeId();
    const newLead: Lead = {
      ...form,
      id,
      updatedAt: nowStamp(),
    };
    setLeads((prev) => [newLead, ...prev]);
    setSegment("All"); // ensure it's visible after add
    setSelectedId(id);
    setShowAdd(false);
    setForm({
      id: "",
      name: "",
      email: "",
      phone: "",
      interest: "",
      status: "Warm",
      rating: 3,
      updatedAt: nowStamp(),
      notes: "",
      tags: "",
    });
  }

  /* ---------------- Edit (detail panel) ---------------- */
  const [isEditing, setIsEditing] = React.useState(false);
  const [edit, setEdit] = React.useState<Lead | null>(null);

  React.useEffect(() => {
    // when selection changes, exit edit mode and reset edit form to the selected record
    if (selected) {
      setIsEditing(false);
      setEdit({ ...selected });
    } else {
      setIsEditing(false);
      setEdit(null);
    }
  }, [selected?.id]);

  function startEdit() {
    if (!selected) return;
    setEdit({ ...selected }); // fresh copy
    setIsEditing(true);
  }

  function cancelEdit() {
    if (!selected) return;
    setEdit({ ...selected }); // revert
    setIsEditing(false);
  }

  function saveEdit() {
    if (!edit) return;
    if (!edit.name.trim()) {
      alert("Name is required.");
      return;
    }
    const updated: Lead = { ...edit, updatedAt: nowStamp() };
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setIsEditing(false);
  }

  function updateEdit<K extends keyof Lead>(key: K, value: Lead[K]) {
    setEdit((e) => (e ? { ...e, [key]: value } : e));
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#f8fafc",
        padding: 24,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 16,
      }}
    >
      {/* Top Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 12,
              background: "#0f172a",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
            }}
          >
            Y
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>YotCRM</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Leads • Buyers • Sellers • Superyacht Leads
            </div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 8 }}>
          <a
            href="/vessels"
            style={{
              fontSize: 13,
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            Vessels
          </a>
          <a
            href="/campaigns"
            style={{
              fontSize: 13,
              padding: "8px 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              color: "#0f172a",
              textDecoration: "none",
            }}
          >
            Campaigns
          </a>
        </nav>
      </header>

      {/* Body */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Leads List */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid #e2e8f0",
              fontWeight: 600,
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>Leads</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["All", "Hot", "Warm", "Cold"] as Segment[]).map((seg) => {
                const active = segment === seg;
                return (
                  <button
                    key={seg}
                    onClick={() => setSegment(seg)}
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      background: active ? "#e2e8f0" : "#fff",
                      color: "#0f172a",
                      cursor: "pointer",
                    }}
                  >
                    {seg}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowAdd((s) => !s)}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: showAdd ? "#e2e8f0" : "#fff",
                cursor: "pointer",
              }}
            >
              {showAdd ? "Close" : "Add Lead"}
            </button>
          </div>

          {/* Add Lead panel */}
          {showAdd && (
            <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <SmallField label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
                <SmallField label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
                <SmallField label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
                <SmallField label="Interest" value={form.interest} onChange={(v) => setForm((f) => ({ ...f, interest: v }))} />
                {/* Status */}
                <LabeledSelect
                  label="Status"
                  value={form.status}
                  options={["Hot", "Warm", "Cold"]}
                  onChange={(v) => setForm((f) => ({ ...f, status: v as Lead["status"] }))}
                />
                {/* Rating */}
                <SmallField
                  label="Rating (1–5)"
                  value={String(form.rating)}
                  onChange={(v) => setForm((f) => ({ ...f, rating: Math.max(1, Math.min(5, Number(v) || 3)) }))}
                />
                <div className="col-span-2">
                  <SmallField label="Tags (comma-separated)" value={form.tags || ""} onChange={(v) => setForm((f) => ({ ...f, tags: v }))} />
                </div>
                <div className="col-span-2">
                  <SmallField label="Notes" value={form.notes || ""} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={addLead}
                  style={{
                    fontSize: 13, padding: "8px 12px", borderRadius: 8,
                    border: "1px solid #0ea5e9", background: "#0ea5e9", color: "#fff", cursor: "pointer",
                  }}
                >
                  Save Lead
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{
                    fontSize: 13, padding: "8px 12px", borderRadius: 8,
                    border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ maxHeight: "60vh", overflow: "auto" }}>
            {filtered.map((l) => {
              const active = l.id === selectedId;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    borderBottom: "1px solid #f1f5f9",
                    background: active ? "#f1f5f9" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#64748b",
                      marginTop: 2,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{l.interest}</span>
                    <span>•</span>
                    <span>{l.email}</span>
                    <span>•</span>
                    <span>{l.phone}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 14, fontSize: 13, color: "#64748b" }}>
                No leads match this filter.
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel (editable) */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {isEditing ? (
                      <InlineInput value={edit?.name || ""} onChange={(v) => updateEdit("name", v)} />
                    ) : (
                      selected.name
                    )}
                  </h2>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {isEditing ? (
                      <InlineSelect
                        value={edit?.status || "Warm"}
                        options={["Hot", "Warm", "Cold"]}
                        onChange={(v) => updateEdit("status", v as Lead["status"])}
                      />
                    ) : (
                      selected.status
                    )}
                  </span>
                </div>

                {/* Edit / Save / Cancel */}
                <div style={{ display: "flex", gap: 8 }}>
                  {!isEditing ? (
                    <button
                      onClick={startEdit}
                      style={{
                        fontSize: 13,
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        background: "#fff",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={saveEdit}
                        style={{
                          fontSize: 13,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #16a34a",
                          background: "#16a34a",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          fontSize: 13,
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          color: "#0f172a",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Updated {isEditing ? edit?.updatedAt || selected.updatedAt : selected.updatedAt}
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <Row
                  label="Email"
                  value={
                    isEditing ? (
                      <InlineInput value={edit?.email || ""} onChange={(v) => updateEdit("email", v)} />
                    ) : (
                      selected.email
                    )
                  }
                />
                <Row
                  label="Phone"
                  value={
                    isEditing ? (
                      <InlineInput value={edit?.phone || ""} onChange={(v) => updateEdit("phone", v)} />
                    ) : (
                      selected.phone
                    )
                  }
                />
                <Row
                  label="Interest"
                  value={
                    isEditing ? (
                      <InlineInput value={edit?.interest || ""} onChange={(v) => updateEdit("interest", v)} />
                    ) : (
                      selected.interest
                    )
                  }
                />
                <Row
                  label="Rating"
                  value={
                    isEditing ? (
                      <InlineInput
                        value={String(edit?.rating ?? 3)}
                        onChange={(v) =>
                          updateEdit("rating", Math.max(1, Math.min(5, Number(v) || 3)))
                        }
                      />
                    ) : (
                      String(selected.rating)
                    )
                  }
                />
                <Row
                  label="Tags"
                  value={
                    isEditing ? (
                      <InlineInput value={edit?.tags || ""} onChange={(v) => updateEdit("tags", v)} />
                    ) : (
                      selected.tags || "—"
                    )
                  }
                />
                <Row
                  label="Notes"
                  value={
                    isEditing ? (
                      <InlineTextArea value={edit?.notes || ""} onChange={(v) => updateEdit("notes", v)} />
                    ) : (
                      selected.notes || "—"
                    )
                  }
                />
              </div>
            </>
          ) : (
            <div style={{ color: "#64748b", fontSize: 14 }}>No lead selected.</div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ---------------- Small components ---------------- */
function Row({
  label,
  value,
}: {
  label: string;
  value?: string | JSX.Element;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 14, color: "#0f172a" }}>{value ?? "—"}</div>
    </div>
  );
}

function SmallField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          fontSize: 14,
          color: "#0f172a",
          background: "#fff",
          outline: "none",
        }}
      />
    </div>
  );
}

function InlineInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        maxWidth: 360,
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        fontSize: 14,
        color: "#0f172a",
        background: "#fff",
        outline: "none",
      }}
    />
  );
}

function InlineTextArea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      style={{
        width: "100%",
        maxWidth: 480,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        fontSize: 14,
        color: "#0f172a",
        background: "#fff",
        outline: "none",
        resize: "vertical",
      }}
    />
  );
}

function LabeledSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0",
          fontSize: 14, color: "#0f172a", background: "#fff", outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}  // <- fixed: removed extra ')'
      style={{
        padding: "4px 8px",
        borderRadius: 6,
        border: "1px solid #e2e8f0",
        fontSize: 13,
        color: "#0f172a",
        background: "#fff",
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}