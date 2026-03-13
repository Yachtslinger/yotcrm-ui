"use client";

import React, { useState, useRef, useCallback } from "react";
import PageShell from "@/app/components/PageShell";
import { useToast } from "@/app/components/ToastProvider";
import {
  Upload, FileText, Users, CheckCircle, AlertTriangle,
  X, Search, ArrowRight, Loader2, Download,
} from "lucide-react";

/* ─── Types ─── */
type PreviewContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  notes: string;
  isDuplicate: boolean;
  existingLeadId?: number;
  duplicateReason?: string;
};

type ParseResult = {
  total: number;
  newContacts: number;
  duplicates: number;
  contacts: PreviewContact[];
};

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

/* ═══════════════════════════════════════════
   Import Contacts Page
   ═══════════════════════════════════════════ */
export default function ImportPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // State
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [showDupes, setShowDupes] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importSource, setImportSource] = useState("VerticalResponse");

  /* ─── File Handler ─── */
  const handleFile = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    const isVcf = name.endsWith(".vcf") || name.endsWith(".vcard");
    const isCsv = name.endsWith(".csv");

    if (!isVcf && !isCsv) {
      toast("Unsupported file. Use .vcf (vCard) or .csv", "error");
      return;
    }

    setParsing(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", isCsv ? "csv" : "vcf");

      const res = await fetch("/api/contacts/bulk-import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        toast(data.error || "Parse failed", "error");
        setParsing(false);
        return;
      }

      setResult(data);
      // Auto-select all non-duplicates
      const newSet = new Set<number>();
      data.contacts.forEach((c: PreviewContact, i: number) => {
        if (!c.isDuplicate) newSet.add(i);
      });
      setSelected(newSet);
      setStep("preview");
    } catch (err: any) {
      toast(err.message || "Failed to parse file", "error");
    } finally {
      setParsing(false);
    }
  }, [toast]);

  /* ─── Drag & Drop ─── */
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  /* ─── Import ─── */
  const handleImport = async () => {
    if (!result || selected.size === 0) return;
    setImporting(true);

    const toImport = result.contacts.filter((_, i) => selected.has(i));

    try {
      const res = await fetch("/api/contacts/bulk-import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: toImport, source: importSource }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        toast(data.error || "Import failed", "error");
        setImporting(false);
        return;
      }

      setImportResult(data);
      setStep("done");
      toast(`${data.imported} contacts imported!`, "success");
    } catch (err: any) {
      toast(err.message || "Import failed", "error");
    } finally {
      setImporting(false);
    }
  };

  /* ─── Selection Helpers ─── */
  const toggleSelect = (idx: number) => {
    const next = new Set(selected);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelected(next);
  };

  const selectAllNew = () => {
    if (!result) return;
    const s = new Set<number>();
    result.contacts.forEach((c, i) => { if (!c.isDuplicate) s.add(i); });
    setSelected(s);
  };

  const selectAll = () => {
    if (!result) return;
    const s = new Set<number>();
    result.contacts.forEach((_, i) => s.add(i));
    setSelected(s);
  };

  const selectNone = () => setSelected(new Set());

  /* ─── Filtered Contacts ─── */
  const filteredContacts = result?.contacts.filter(c => {
    if (!showDupes && c.isDuplicate) return false;
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  }) || [];

  /* ─── Reset ─── */
  const reset = () => {
    setStep("upload");
    setResult(null);
    setImportResult(null);
    setFileName("");
    setSelected(new Set());
    setSearchFilter("");
    setShowDupes(true);
    if (fileRef.current) fileRef.current.value = "";
  };


  /* ═══════════════════════════════════════════
     Render
     ═══════════════════════════════════════════ */
  return (
    <PageShell title="Import Contacts" subtitle="Import from VerticalResponse, Apple Contacts, Google, or any CSV export">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ════ STEP 1: UPLOAD ════ */}
        {step === "upload" && (
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-2xl p-12 text-center transition-all"
            style={{
              background: dragOver ? "rgba(168,131,72,0.08)" : "var(--card)",
              border: `2px dashed ${dragOver ? "var(--brass-500)" : "var(--border)"}`,
            }}
          >
            <input ref={fileRef} type="file" accept=".vcf,.vcard,.csv" onChange={onFileSelect} className="hidden" />

            {parsing ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin" style={{ color: "var(--brass-500)" }} />
                <p className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Parsing {fileName}…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(168,131,72,0.12)" }}>
                  <Upload className="w-10 h-10" style={{ color: "var(--brass-500)" }} />
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                    Drop your contacts file here
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--navy-400)" }}>
                    or click to browse — supports <strong>.vcf</strong> (vCard) and <strong>.csv</strong>
                  </p>
                </div>
                <div className="flex gap-6 mt-4 flex-wrap justify-center">
                  <HowTo icon="📧" label="VerticalResponse" steps={["1. Log into VerticalResponse", "2. Contacts → pick your list", "3. Click Export → Download CSV"]} />
                  <HowTo icon="🍎" label="Apple Contacts" steps={["1. Open Contacts app", "2. Select All (⌘A)", "3. File → Export vCard"]} />
                  <HowTo icon="🌐" label="Google Contacts" steps={["1. contacts.google.com", "2. Export → Google CSV or vCard"]} />
                  <HowTo icon="📋" label="Any CRM / Excel" steps={["1. Export as CSV", "2. Needs Name, Email, Phone columns"]} />
                </div>

                {/* Source label */}
                <div className="mt-6 flex items-center gap-3 justify-center">
                  <label className="text-sm font-medium" style={{ color: "var(--navy-400)" }}>Tag these leads as imported from:</label>
                  <select
                    value={importSource}
                    onChange={e => setImportSource(e.target.value)}
                    className="form-input text-sm px-3 py-1.5 w-auto"
                  >
                    <option value="VerticalResponse">VerticalResponse</option>
                    <option value="Apple Contacts">Apple Contacts</option>
                    <option value="Google Contacts">Google Contacts</option>
                    <option value="csv-import">Other CSV</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ STEP 2: PREVIEW ════ */}
        {step === "preview" && result && (
          <>
            {/* Stats Bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <FileText className="w-4 h-4" style={{ color: "var(--navy-400)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{fileName}</span>
              </div>
              <Stat icon={<Users className="w-4 h-4" />} label="Total" value={result.total} color="var(--foreground)" />
              <Stat icon={<CheckCircle className="w-4 h-4" />} label="New" value={result.newContacts} color="#059669" />
              <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Duplicates" value={result.duplicates} color="#d97706" />
              <Stat icon={<ArrowRight className="w-4 h-4" />} label="Selected" value={selected.size} color="var(--brass-500)" />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--navy-400)" }} />
                <input
                  value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
                  className="form-input w-full pl-9" placeholder="Filter contacts…"
                />
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none"
                style={{ color: "var(--navy-400)" }}>
                <input type="checkbox" checked={showDupes} onChange={() => setShowDupes(!showDupes)}
                  className="w-4 h-4 rounded" style={{ accentColor: "var(--brass-500)" }} />
                Show duplicates
              </label>

              <div className="flex gap-2 ml-auto">
                <button onClick={selectAllNew} className="btn-secondary text-xs px-3 py-1.5">Select New</button>
                <button onClick={selectAll} className="btn-secondary text-xs px-3 py-1.5">Select All</button>
                <button onClick={selectNone} className="btn-secondary text-xs px-3 py-1.5">Clear</button>
              </div>
            </div>

            {/* Contact Table */}
            <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10" style={{ background: "var(--card)" }}>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="px-3 py-3 text-left w-10">
                        <input type="checkbox"
                          checked={selected.size === result.contacts.length && result.contacts.length > 0}
                          onChange={() => selected.size === result.contacts.length ? selectNone() : selectAll()}
                          className="w-4 h-4 rounded" style={{ accentColor: "var(--brass-500)" }} />
                      </th>
                      <th className="px-3 py-3 text-left font-semibold" style={{ color: "var(--navy-400)" }}>Name</th>
                      <th className="px-3 py-3 text-left font-semibold" style={{ color: "var(--navy-400)" }}>Email</th>
                      <th className="px-3 py-3 text-left font-semibold" style={{ color: "var(--navy-400)" }}>Phone</th>
                      <th className="px-3 py-3 text-left font-semibold" style={{ color: "var(--navy-400)" }}>Company</th>
                      <th className="px-3 py-3 text-left font-semibold w-28" style={{ color: "var(--navy-400)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((c, idx) => {
                      const realIdx = result.contacts.indexOf(c);
                      const isSelected = selected.has(realIdx);
                      return (
                        <tr key={realIdx}
                          onClick={() => toggleSelect(realIdx)}
                          className="cursor-pointer transition-colors"
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: c.isDuplicate
                              ? "rgba(217,119,6,0.04)"
                              : isSelected ? "rgba(168,131,72,0.06)" : "transparent",
                          }}
                        >
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={isSelected} readOnly
                              className="w-4 h-4 rounded" style={{ accentColor: "var(--brass-500)" }} />
                          </td>
                          <td className="px-3 py-2.5 font-medium" style={{ color: "var(--foreground)" }}>
                            {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-3 py-2.5" style={{ color: "var(--navy-400)" }}>
                            {c.email || "—"}
                          </td>
                          <td className="px-3 py-2.5" style={{ color: "var(--navy-400)" }}>
                            {c.phone || "—"}
                          </td>
                          <td className="px-3 py-2.5" style={{ color: "var(--navy-400)" }}>
                            {c.company || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {c.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(217,119,6,0.1)", color: "#d97706" }}>
                                <AlertTriangle className="w-3 h-3" />
                                {c.duplicateReason}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}>
                                <CheckCircle className="w-3 h-3" />
                                New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 justify-between">
              <button onClick={reset} className="btn-secondary text-sm px-4 py-2.5">
                <X className="w-4 h-4 mr-1.5 inline" /> Start Over
              </button>
              <button onClick={handleImport} disabled={importing || selected.size === 0}
                className="btn-primary text-sm font-semibold px-6 py-2.5"
                style={{ opacity: importing || selected.size === 0 ? 0.5 : 1 }}>
                {importing ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" /> Importing…</>
                ) : (
                  <><Download className="w-4 h-4 mr-1.5 inline" /> Import {selected.size} Contact{selected.size !== 1 ? "s" : ""}</>
                )}
              </button>
            </div>
          </>
        )}

        {/* ════ STEP 3: DONE ════ */}
        {step === "done" && importResult && (
          <div className="rounded-2xl p-12 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6"
              style={{ background: "rgba(5,150,105,0.12)" }}>
              <CheckCircle className="w-10 h-10" style={{ color: "#059669" }} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
              {importResult.imported} Contacts Imported
            </h2>
            {importResult.skipped > 0 && (
              <p className="text-sm mb-4" style={{ color: "var(--navy-400)" }}>
                {importResult.skipped} skipped (duplicates or errors)
              </p>
            )}
            {importResult.errors.length > 0 && (
              <div className="text-left max-w-md mx-auto mb-6 p-3 rounded-lg text-xs"
                style={{ background: "rgba(217,119,6,0.06)", color: "#d97706" }}>
                {importResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
                {importResult.errors.length > 5 && <p>…and {importResult.errors.length - 5} more</p>}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={reset} className="btn-secondary text-sm px-5 py-2.5">Import More</button>
              <a href="/clients" className="btn-primary text-sm font-semibold px-5 py-2.5 inline-flex items-center gap-1.5">
                View Leads <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ─── Small Components ─── */
function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-xs" style={{ color: "var(--navy-400)" }}>{label}</span>
      <span className="text-sm font-bold" style={{ color }}>{value.toLocaleString()}</span>
    </div>
  );
}

function HowTo({ icon, label, steps }: { icon: string; label: string; steps: string | string[] }) {
  const list = Array.isArray(steps) ? steps : [steps];
  return (
    <div className="text-left max-w-[180px]">
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
        {icon} {label}
      </p>
      {list.map((s, i) => (
        <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--navy-400)" }}>{s}</p>
      ))}
    </div>
  );
}
