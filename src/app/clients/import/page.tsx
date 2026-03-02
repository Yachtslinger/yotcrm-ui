"use client";
import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, ArrowLeft, CheckCircle, AlertTriangle, Loader2, X, Zap } from "lucide-react";

const LEAD_FIELDS = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "occupation", label: "Occupation / Title" },
  { key: "employer", label: "Employer" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "boat_make", label: "Boat Make" },
  { key: "boat_model", label: "Boat Model" },
  { key: "boat_year", label: "Boat Year" },
  { key: "boat_length", label: "Boat Length" },
  { key: "boat_price", label: "Boat Price" },
];

// Smart auto-map: match CSV headers to lead fields
function autoMapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    first_name: ["first name", "first", "fname", "given name", "first_name"],
    last_name: ["last name", "last", "lname", "surname", "family name", "last_name"],
    email: ["email", "e-mail", "email address", "e-mail address"],
    phone: ["phone", "telephone", "tel", "mobile", "cell", "phone number"],
    company: ["company", "organization", "org", "company name", "business"],
    occupation: ["occupation", "title", "job title", "position", "role"],
    employer: ["employer", "work", "workplace"],
    city: ["city", "town"],
    state: ["state", "province", "region", "st"],
    zip: ["zip", "zipcode", "zip code", "postal", "postal code"],
    status: ["status", "lead status", "stage"],
    source: ["source", "lead source", "origin", "channel"],
    notes: ["notes", "note", "comments", "description"],
    linkedin_url: ["linkedin", "linkedin url", "linkedin_url"],
    boat_make: ["boat make", "make", "manufacturer", "brand"],
    boat_model: ["boat model", "model"],
    boat_year: ["boat year", "year"],
    boat_length: ["boat length", "length", "loa"],
    boat_price: ["boat price", "price", "asking price"],
  };
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(h) && !Object.values(mapping).includes(field)) {
        mapping[String(i)] = field;
        break;
      }
    }
  }
  return mapping;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));
  return { headers, rows };
}

type Step = "upload" | "map" | "preview" | "importing" | "done";

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [importSource, setImportSource] = useState("csv-import");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      if (h.length === 0) { setError("Could not parse CSV — no headers found"); return; }
      if (r.length === 0) { setError("CSV has headers but no data rows"); return; }
      setHeaders(h);
      setRows(r);
      setMapping(autoMapColumns(h));
      setStep("map");
    };
    reader.readAsText(file);
  }, []);

  const buildMappedRows = useCallback(() => {
    return rows.map(row => {
      const obj: Record<string, string> = {};
      for (const [colIdx, field] of Object.entries(mapping)) {
        const val = row[Number(colIdx)];
        if (val) obj[field] = val;
      }
      return obj;
    });
  }, [rows, mapping]);

  const handleImport = async () => {
    setStep("importing");
    setError("");
    try {
      const mapped = buildMappedRows();
      const res = await fetch("/api/clients/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped, autoEnrich, source: importSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      setStep("done");
    } catch (err: any) {
      setError(err.message);
      setStep("preview");
    }
  };

  const mappedCount = Object.keys(mapping).length;
  const previewRows = buildMappedRows().slice(0, 5);

  return (
    <div className="min-h-screen" style={{ background: "var(--sand-50)" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => router.push("/clients")}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--navy-800)" }}>Import Contacts</h1>
            <p className="text-sm" style={{ color: "var(--navy-400)" }}>Upload a CSV or Excel export to bulk-add leads</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg flex items-center gap-2 text-sm"
            style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* ─── Step 1: Upload ─── */}
        {step === "upload" && (
          <div
            className={`border-2 border-dashed rounded-2xl p-16 text-center transition-colors cursor-pointer ${dragOver ? "border-blue-400 bg-blue-50" : ""}`}
            style={{ borderColor: dragOver ? undefined : "var(--border)", background: dragOver ? undefined : "var(--card)" }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--brass-400)" }} />
            <p className="text-lg font-semibold mb-1" style={{ color: "var(--navy-700)" }}>
              Drop your CSV file here
            </p>
            <p className="text-sm mb-4" style={{ color: "var(--navy-400)" }}>
              or click to browse — supports .csv files
            </p>
            <p className="text-xs" style={{ color: "var(--navy-300)" }}>
              Columns like First Name, Last Name, Email, Phone, Company will auto-map
            </p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        )}

        {/* ─── Step 2: Column Mapping ─── */}
        {step === "map" && (
          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4" style={{ color: "var(--brass-400)" }} />
                  <span className="font-semibold" style={{ color: "var(--navy-700)" }}>{fileName}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--navy-400)" }}>
                  {rows.length} rows, {headers.length} columns — {mappedCount} mapped
                </p>
              </div>
              <button onClick={() => { setStep("upload"); setHeaders([]); setRows([]); }}
                className="text-xs px-3 py-1.5 rounded-lg hover:bg-gray-100" style={{ color: "var(--navy-400)" }}>
                Choose different file
              </button>
            </div>

            <div className="space-y-2 mb-6">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-[10px] font-bold uppercase tracking-wider px-1"
                style={{ color: "var(--navy-400)" }}>
                <span>CSV Column</span><span></span><span>Maps To</span>
              </div>
              {headers.map((h, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                  <div className="text-sm font-medium px-3 py-2 rounded-lg truncate"
                    style={{ background: "var(--sand-50)", color: "var(--navy-700)" }}>
                    {h}
                    <span className="text-[10px] ml-2" style={{ color: "var(--navy-300)" }}>
                      e.g. {rows[0]?.[i]?.substring(0, 30) || "—"}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--navy-300)" }}>→</span>
                  <select
                    value={mapping[String(i)] || ""}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value) next[String(i)] = e.target.value;
                      else delete next[String(i)];
                      setMapping(next);
                    }}
                    className="form-input text-sm py-2"
                  >
                    <option value="">— skip —</option>
                    {LEAD_FIELDS.map(f => (
                      <option key={f.key} value={f.key} disabled={Object.values(mapping).includes(f.key) && mapping[String(i)] !== f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm rounded-lg"
                style={{ color: "var(--navy-500)" }}>
                Back
              </button>
              <button onClick={() => setStep("preview")}
                disabled={mappedCount === 0}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: "var(--sea-500)" }}>
                Preview {rows.length} Contacts →
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Preview ─── */}
        {step === "preview" && (
          <div className="rounded-2xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--navy-700)" }}>Preview Import</h2>
            <p className="text-sm mb-4" style={{ color: "var(--navy-400)" }}>
              Showing first 5 of {rows.length} contacts. Duplicates (matching email or phone) will be skipped.
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {Object.values(mapping).map(field => (
                      <th key={field} className="text-left py-2 px-3 text-[10px] uppercase tracking-wider font-bold"
                        style={{ color: "var(--navy-400)" }}>
                        {LEAD_FIELDS.find(f => f.key === field)?.label || field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "var(--sand-100)" }}>
                      {Object.values(mapping).map(field => (
                        <td key={field} className="py-2 px-3 truncate max-w-[200px]"
                          style={{ color: "var(--navy-700)" }}>
                          {row[field] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Options */}
            <div className="rounded-xl p-4 mb-6 space-y-3" style={{ background: "var(--sand-50)" }}>
              <div className="flex items-center gap-3">
                <input type="text" value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  className="form-input text-sm flex-1" placeholder="Source tag for these contacts" />
                <span className="text-xs shrink-0" style={{ color: "var(--navy-400)" }}>Source tag</span>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={autoEnrich} onChange={(e) => setAutoEnrich(e.target.checked)}
                  className="w-4 h-4 rounded" />
                <div>
                  <span className="text-sm font-semibold flex items-center gap-1" style={{ color: "var(--navy-700)" }}>
                    <Zap className="w-3.5 h-3.5" style={{ color: "var(--brass-400)" }} />
                    Auto-run Lighthouse Intel on imported contacts
                  </span>
                  <span className="text-xs block" style={{ color: "var(--navy-400)" }}>
                    Discovers employer, donations, social profiles, news — runs in background after import
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => setStep("map")} className="px-4 py-2 text-sm rounded-lg"
                style={{ color: "var(--navy-500)" }}>
                ← Back to mapping
              </button>
              <button onClick={handleImport}
                className="px-8 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: "var(--sea-500)" }}>
                Import {rows.length} Contacts
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Importing ─── */}
        {step === "importing" && (
          <div className="rounded-2xl border p-16 text-center" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: "var(--sea-500)" }} />
            <p className="text-lg font-semibold" style={{ color: "var(--navy-700)" }}>Importing {rows.length} contacts...</p>
            <p className="text-sm mt-1" style={{ color: "var(--navy-400)" }}>This may take a moment</p>
          </div>
        )}

        {/* ─── Step 5: Done ─── */}
        {step === "done" && result && (
          <div className="rounded-2xl border p-8" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="text-center mb-6">
              <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: "#059669" }} />
              <h2 className="text-2xl font-bold" style={{ color: "var(--navy-800)" }}>Import Complete</h2>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(16,185,129,0.06)" }}>
                <div className="text-3xl font-bold" style={{ color: "#059669" }}>{result.imported}</div>
                <div className="text-xs font-semibold" style={{ color: "var(--navy-500)" }}>Imported</div>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(234,179,8,0.06)" }}>
                <div className="text-3xl font-bold" style={{ color: "#d97706" }}>{result.skippedDupes}</div>
                <div className="text-xs font-semibold" style={{ color: "var(--navy-500)" }}>Duplicates Skipped</div>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "var(--sand-50)" }}>
                <div className="text-3xl font-bold" style={{ color: "var(--navy-400)" }}>{result.skippedEmpty}</div>
                <div className="text-xs font-semibold" style={{ color: "var(--navy-500)" }}>Empty Rows</div>
              </div>
            </div>

            {result.enriching > 0 && (
              <div className="rounded-xl p-4 mb-6 flex items-center gap-3" style={{ background: "rgba(59,130,246,0.06)" }}>
                <Zap className="w-5 h-5" style={{ color: "var(--brass-400)" }} />
                <div>
                  <span className="text-sm font-semibold" style={{ color: "var(--navy-700)" }}>
                    Lighthouse is enriching {result.enriching} contacts in the background
                  </span>
                  <span className="text-xs block" style={{ color: "var(--navy-400)" }}>
                    Intel scores, social profiles, FEC data will appear as they complete
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button onClick={() => router.push("/clients")}
                className="px-8 py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: "var(--sea-500)" }}>
                View Leads →
              </button>
              <button onClick={() => { setStep("upload"); setHeaders([]); setRows([]); setResult(null); }}
                className="px-6 py-3 rounded-xl text-sm font-semibold border"
                style={{ borderColor: "var(--border)", color: "var(--navy-500)" }}>
                Import More
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
