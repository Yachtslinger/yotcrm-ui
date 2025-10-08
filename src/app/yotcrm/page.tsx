// src/app/yotcrm/page.tsx
"use client";

import * as React from "react";

/* ---------------- Types ---------------- */
type Status = "Hot" | "Warm" | "Cold";
type Segment = "All" | Status;

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  interest: string;
  status: Status;
  rating: number;
  updatedAt: string;
  notes?: string;
  tags?: string;
};

type Buyer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  requirement: string; // 'interest' label for buyers
  status: Status;
  rating: number;
  updatedAt: string;
  notes?: string;
  tags?: string;
};

type View = "Leads" | "Buyers";

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

const SEED_BUYERS: Buyer[] = [
  {
    id: "BY-240930-001",
    name: "Jordan M.",
    email: "jordan@example.com",
    phone: "+1 212 555 0200",
    requirement: "40m explorer, steel hull, 4,000 nm",
    status: "Hot",
    rating: 5,
    updatedAt: "2025-09-30 16:05",
    notes: "Ice-class optional; prefers Northern Europe builds.",
    tags: "explorer, 40m+, steel",
  },
  {
    id: "BY-240930-002",
    name: "Sophie M.",
    email: "sophie@example.com",
    phone: "+33 6 55 55 11 22",
    requirement: "30–35m planing, Med based",
    status: "Warm",
    rating: 4,
    updatedAt: "2025-09-26 11:10",
    tags: "planing, Med",
  },
];

/* ---------------- Helpers ---------------- */
function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}
function makeId(prefix: "LD" | "BY" = "LD"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(
    d.getDate()
  )}`;
  return `${prefix}-${stamp}-${Math.floor(100 + Math.random() * 900)}`;
}
const norm = (s: string) => s.toLowerCase();

/* ---------------- Page ---------------- */
export default function YotCRMPage(): React.ReactElement {
  /* view toggle */
  const [view, setView] = React.useState<View>("Leads");

  /* Leads state */
  const [leads, setLeads] = React.useState<Lead[]>(SEED_LEADS);
  const [segment, setSegment] = React.useState<Segment>("All");
  const [query, setQuery] = React.useState<string>("");

  /* Buyers state (read-only for now) */
  const [buyers] = React.useState<Buyer[]>(SEED_BUYERS);
  const [buyerSegment, setBuyerSegment] = React.useState<Segment>("All");
  const [buyerQuery, setBuyerQuery] = React.useState<string>("");

  /* selection ids per view */
  const [selectedLeadId, setSelectedLeadId] = React.useState<string>(leads[0]?.id || "");
  const [selectedBuyerId, setSelectedBuyerId] = React.useState<string>(buyers[0]?.id || "");

  /* filtered lists */
  const filteredLeads = React.useMemo<Lead[]>(() => {
    let list = segment === "All" ? leads : leads.filter((l) => l.status === segment);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((l) =>
        `${l.name} ${l.email} ${l.phone} ${l.interest} ${l.tags ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [leads, segment, query]);

  const filteredBuyers = React.useMemo<Buyer[]>(() => {
    let list = buyerSegment === "All" ? buyers : buyers.filter((b) => b.status === buyerSegment);
    const q = buyerQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        `${b.name} ${b.email} ${b.phone} ${b.requirement} ${b.tags ?? ""}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [buyers, buyerSegment, buyerQuery]);

  /* keep selections valid */
  React.useEffect(() => {
    if (!filteredLeads.find((l) => l.id === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0]?.id || "");
    }
  }, [filteredLeads]);
  React.useEffect(() => {
    if (!filteredBuyers.find((b) => b.id === selectedBuyerId)) {
      setSelectedBuyerId(filteredBuyers[0]?.id || "");
    }
  }, [filteredBuyers]);

  const selectedLead = React.useMemo<Lead | undefined>(
    () => filteredLeads.find((l) => l.id === selectedLeadId) || filteredLeads[0],
    [filteredLeads, selectedLeadId]
  );
  const selectedBuyer = React.useMemo<Buyer | undefined>(
    () => filteredBuyers.find((b) => b.id === selectedBuyerId) || filteredBuyers[0],
    [filteredBuyers, selectedBuyerId]
  );

  /* -------- Add Lead (same as before) -------- */
  const [showAdd, setShowAdd] = React.useState<boolean>(false);
  const [form, setForm] = React.useState<Lead>({
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

  function addLead(): void {
    if (!form.name.trim()) {
      alert("Name is required.");
      return;
    }
    const id = makeId("LD");
    const newLead: Lead = { ...form, id, updatedAt: nowStamp() };
    setLeads((prev) => [newLead, ...prev]);
    setSegment("All");
    setQuery("");
    setSelectedLeadId(id);
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

  /* -------- Edit Lead -------- */
  const [isEditing, setIsEditing] = React.useState<boolean>(false);
  const [edit, setEdit] = React.useState<Lead | null>(null);

  React.useEffect(() => {
    // when selection changes, exit edit mode and reset edit form
    if (selectedLead && view === "Leads") {
      setIsEditing(false);
      setEdit({ ...selectedLead });
    } else if (view === "Leads") {
      setIsEditing(false);
      setEdit(null);
    }
  }, [selectedLead?.id, view]);

  function startEdit(): void {
    if (!selectedLead) return;
    setEdit({ ...selectedLead }); // fresh copy
    setIsEditing(true);
  }
  function cancelEdit(): void {
    if (!selectedLead) return;
    setEdit({ ...selectedLead }); // revert
    setIsEditing(false);
  }
  function saveEdit(): void {
    if (!edit) return;
    if (!edit.name.trim()) {
      alert("Name is required.");
      return;
    }
    const updated: Lead = { ...edit, updatedAt: nowStamp() };
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setIsEditing(false);
  }
  function updateEdit<K extends keyof Lead>(key: K, value: Lead[K]): void {
    setEdit((e) => (e ? { ...e, [key]: value } : e));
  }

  /* ---------------- UI ---------------- */
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

        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 6, marginRight: 8 }}>
            {(["Leads", "Buyers"] as View[]).map((v) => {
              const active = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
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
                  {v}
                </button>
              );
            })}
          </div>

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
        {/* List panel */}
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
            <span>{view}</span>

            {/* Search box */}
            <input
              value={view === "Leads" ? query : buyerQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                view === "Leads" ? setQuery(e.target.value) : setBuyerQuery(e.target.value)
              }
              placeholder={`Search ${view.toLowerCase()}…`}
              style={{
                flex: 1,
                minWidth: 120,
                margin: "0 8px",
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 13,
              }}
            />

            {/* Filters */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["All", "Hot", "Warm", "Cold"] as Segment[]).map((seg) => {
                const active = view === "Leads" ? segment === seg : buyerSegment === seg;
                return (
                  <button
                    key={seg}
                    onClick={() => (view === "Leads" ? setSegment(seg) : setBuyerSegment(seg))}
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

            {/* Add Lead only visible on Leads view */}
            {view === "Leads" && (
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
            )}
          </div>

          {/* Add Lead panel */}
          {view === "Leads" && showAdd && (
            <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <SmallField label="Name" value={form.name} onChange={(v: string) => setForm((f) => ({ ...f, name: v }))} />
                <SmallField label="Email" value={form.email} onChange={(v: string) => setForm((f) => ({ ...f, email: v }))} />
                <SmallField label="Phone" value={form.phone} onChange={(v: string) => setForm((f) => ({ ...f, phone: v }))} />
                <SmallField label="Interest" value={form.interest} onChange={(v: string) => setForm((f) => ({ ...f, interest: v }))} />
                <LabeledSelect
                  label="Status"
                  value={form.status}
                  options={["Hot", "Warm", "Cold"]}
                  onChange={(v: string) => setForm((f) => ({ ...f, status: v as Status }))}
                />
                <SmallField
                  label="Rating (1–5)"
                  value={String(form.rating)}
                  onChange={(v: string) =>
                    setForm((f) => ({ ...f, rating: Math.max(1, Math.min(5, Number(v) || 3)) }))
                  }
                />
                <div className="col-span-2">
                  <SmallField label="Tags (comma-separated)" value={form.tags || ""} onChange={(v: string) => setForm((f) => ({ ...f, tags: v }))} />
                </div>
                <div className="col-span-2">
                  <SmallField label="Notes" value={form.notes || ""} onChange={(v: string) => setForm((f) => ({ ...f, notes: v }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={addLead}
                  style={{
                    fontSize: 13,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #0ea5e9",
                    background: "#0ea5e9",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Save Lead
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{
                    fontSize: 13,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    color: "#0f172a",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ maxHeight: "60vh", overflow: "auto" }}>
            {view === "Leads"
              ? filteredLeads.map((l) => {
                  const active = l.id === selectedLeadId;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelectedLeadId(l.id)}
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
                })
              : filteredBuyers.map((b) => {
                  const active = b.id === selectedBuyerId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBuyerId(b.id)}
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
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
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
                        <span>{b.requirement}</span>
                        <span>•</span>
                        <span>{b.email}</span>
                        <span>•</span>
                        <span>{b.phone}</span>
                      </div>
                    </button>
                  );
                })}
            {(view === "Leads" ? filteredLeads.length === 0 : filteredBuyers.length === 0) && (
              <div style={{ padding: 14, fontSize: 13, color: "#64748b" }}>
                No {view.toLowerCase()} match this filter/search.
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 16,
          }}
        >
          {view === "Leads" ? (
            // Editable detail for Leads
            selectedLead ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                      {isEditing ? (
                        <InlineInput
                          value={edit?.name || ""}
                          onChange={(v: string) => updateEdit("name", v)}
                        />
                      ) : (
                        selectedLead.name
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
                          onChange={(v: string) =>
                            updateEdit("status", v as Status)
                          }
                        />
                      ) : (
                        selectedLead.status
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
                  Updated {isEditing ? edit?.updatedAt || selectedLead.updatedAt : selectedLead.updatedAt}
                </div>

                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  <Row
                    label="Email"
                    value={
                      isEditing ? (
                        <InlineInput
                          value={edit?.email || ""}
                          onChange={(v: string) => updateEdit("email", v)}
                        />
                      ) : (
                        selectedLead.email
                      )
                    }
                  />
                  <Row
                    label="Phone"
                    value={
                      isEditing ? (
                        <InlineInput
                          value={edit?.phone || ""}
                          onChange={(v: string) => updateEdit("phone", v)}
                        />
                      ) : (
                        selectedLead.phone
                      )
                    }
                  />
                  <Row
                    label="Interest"
                    value={
                      isEditing ? (
                        <InlineInput
                          value={edit?.interest || ""}
                          onChange={(v: string) => updateEdit("interest", v)}
                        />
                      ) : (
                        selectedLead.interest
                      )
                    }
                  />
                  <Row
                    label="Rating"
                    value={
                      isEditing ? (
                        <InlineInput
                          value={String(edit?.rating ?? 3)}
                          onChange={(v: string) =>
                            updateEdit(
                              "rating",
                              Math.max(1, Math.min(5, Number(v) || 3))
                            )
                          }
                        />
                      ) : (
                        String(selectedLead.rating)
                      )
                    }
                  />
                  <Row
                    label="Tags"
                    value={
                      isEditing ? (
                        <InlineInput
                          value={edit?.tags || ""}
                          onChange={(v: string) => updateEdit("tags", v)}
                        />
                      ) : (
                        selectedLead.tags || "—"
                      )
                    }
                  />
                  <Row
                    label="Notes"
                    value={
                      isEditing ? (
                        <InlineTextArea
                          value={edit?.notes || ""}
                          onChange={(v: string) => updateEdit("notes", v)}
                        />
                      ) : (
                        selectedLead.notes || "—"
                      )
                    }
                  />
                </div>
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: 14 }}>No lead selected.</div>
            )
          ) : (
            // Read-only detail for Buyers
            selectedBuyer ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    {selectedBuyer.name}
                  </h2>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {selectedBuyer.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Updated {selectedBuyer.updatedAt}
                </div>

                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  <Row label="Email" value={selectedBuyer.email} />
                  <Row label="Phone" value={selectedBuyer.phone} />
                  <Row label="Requirement" value={selectedBuyer.requirement} />
                  <Row label="Rating" value={String(selectedBuyer.rating)} />
                  <Row label="Tags" value={selectedBuyer.tags || "—"} />
                  <Row label="Notes" value={selectedBuyer.notes || "—"} />
                </div>
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: 14 }}>No buyer selected.</div>
            )
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
  value?: React.ReactNode;
}): React.ReactElement {
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
}): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
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
}): React.ReactElement {
  return (
    <input
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange(e.target.value)
      }
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
}): React.ReactElement {
  return (
    <textarea
      value={value}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
        onChange(e.target.value)
      }
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

function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
        onChange(e.target.value)
      }
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
}): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <select
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(e.target.value)
        }
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