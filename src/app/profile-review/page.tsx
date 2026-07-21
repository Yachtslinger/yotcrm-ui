"use client";

import React, { useEffect, useState, useCallback } from "react";
import PageShell from "../components/PageShell";
import TextExtracts from "./TextExtracts";
import { Check, SkipForward, ClipboardCheck } from "lucide-react";

type Draft = {
  id: number; first_name: string; last_name: string; email: string; source: string;
  notes: string; budget_min: number|null; budget_max: number|null;
  loa_min: number|null; loa_max: number|null; year_min: number|null; year_max: number|null;
  make_preference: string|null; vessel_type_pref: string|null;
  profile_confidence_json: string;
};

const NUM_FIELDS: [keyof Draft, string][] = [
  ["budget_min","Budget min ($)"], ["budget_max","Budget max ($)"],
  ["loa_min","LOA min (ft)"], ["loa_max","LOA max (ft)"],
  ["year_min","Year min"], ["year_max","Year max"],
];

export default function ProfileReviewPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [gapCount, setGapCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [edits, setEdits] = useState<Record<number, Partial<Draft>>>({});
  const [temps, setTemps] = useState<Record<number, string>>({});
  const TEMP_OPTS = [["hot","🔥 Hot"],["warm","Warm"],["cool","Cool"],["cold","🧊 Cold"]] as const;
  const [busy, setBusy] = useState<number|null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/profile-review");
    const j = await r.json();
    setDrafts(j.drafts); setGapCount(j.gapCount); setApprovedCount(j.approvedCount);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setField = (id: number, k: string, v: string) =>
    setEdits(p => ({ ...p, [id]: { ...p[id], [k]: v === "" ? null : (isNaN(+v) ? v : +v) } }));

  const act = async (id: number, action: "approve"|"skip") => {
    setBusy(id);
    const fields = { ...(edits[id] || {}), ...(temps[id] ? { pinned_temperature: temps[id] } : {}) };
    await fetch("/api/profile-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, fields }),
    });
    setDrafts(d => d.filter(x => x.id !== id));
    if (action === "approve") setApprovedCount(c => c + 1); else setGapCount(c => c + 1);
    setBusy(null);
  };

  const conf = (d: Draft, k: string): number|undefined => {
    try { return JSON.parse(d.profile_confidence_json || "{}")[k]; } catch { return undefined; }
  };
  const confClass = (c?: number) =>
    c === undefined ? "" : c >= 0.8 ? "border-green-400" : c >= 0.5 ? "border-yellow-400" : "border-red-400";

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-1">
          <ClipboardCheck className="w-6 h-6" />
          <h1 className="text-2xl font-semibold">Profile review</h1>
        </div>
        <p className="text-sm opacity-70 mb-5">
          {drafts.length} drafts to review · {approvedCount} approved · {gapCount} buyers with no profile yet.
          Field borders show AI confidence: green high, yellow medium, red low — check red ones against the inquiry.
        </p>
        <TextExtracts />
        {loading && <p className="opacity-60">Loading drafts…</p>}
        {!loading && drafts.length === 0 && (
          <div className="rounded-lg border p-6 text-center opacity-80">
            No drafts waiting. Run <code>scripts/extract_profiles.js</code> to generate more,
            or fill remaining {gapCount} profiles as you talk to each buyer.
          </div>
        )}

        {drafts.map(d => (
          <div key={d.id} className="rounded-lg border mb-4 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <span className="font-medium">{d.first_name} {d.last_name}</span>
                <span className="text-sm opacity-60 ml-2">{d.email} · {d.source}</span>
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex rounded-md border overflow-hidden mr-1" title="How alive is this buyer? Your call beats the data.">
                  {TEMP_OPTS.map(([v, label]) => (
                    <button key={v}
                      className={`px-2 py-1 text-xs ${temps[d.id] === v ? "bg-blue-600 text-white" : "opacity-70 hover:opacity-100"}`}
                      onClick={() => setTemps(t => ({ ...t, [d.id]: t[d.id] === v ? "" : v }))}>
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn-secondary flex items-center gap-1.5"
                  disabled={busy === d.id} onClick={() => act(d.id, "skip")}>
                  <SkipForward className="w-4 h-4" /> Skip
                </button>
                <button className="btn-primary flex items-center gap-1.5"
                  disabled={busy === d.id} onClick={() => act(d.id, "approve")}>
                  <Check className="w-4 h-4" /> Approve
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="text-sm bg-black/5 dark:bg-white/5 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {d.notes || "No inquiry text"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NUM_FIELDS.map(([k, label]) => (
                  <label key={k} className="text-xs opacity-80">
                    {label}
                    <input type="number"
                      className={`w-full rounded border px-2 py-1 text-sm mt-0.5 bg-transparent ${confClass(conf(d, k as string))}`}
                      defaultValue={(d[k] as number|null) ?? ""}
                      onChange={e => setField(d.id, k as string, e.target.value)} />
                  </label>
                ))}
                <label className="text-xs opacity-80">Make preference
                  <input className={`w-full rounded border px-2 py-1 text-sm mt-0.5 bg-transparent ${confClass(conf(d, "make_preference"))}`}
                    defaultValue={d.make_preference ?? ""}
                    onChange={e => setField(d.id, "make_preference", e.target.value)} />
                </label>
                <label className="text-xs opacity-80">Vessel type
                  <input className={`w-full rounded border px-2 py-1 text-sm mt-0.5 bg-transparent ${confClass(conf(d, "vessel_type_pref"))}`}
                    defaultValue={d.vessel_type_pref ?? ""}
                    onChange={e => setField(d.id, "vessel_type_pref", e.target.value)} />
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
