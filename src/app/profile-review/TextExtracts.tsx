"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Check, SkipForward, MessageSquareText } from "lucide-react";

type Extract = {
  id: number; handle_id: string; display_name: string; matched_lead_id: number | null;
  dossier: string; budget_min: number | null; budget_max: number | null;
  loa_min: number | null; loa_max: number | null; year_min: number | null; year_max: number | null;
  make_preference: string | null; vessel_type_pref: string | null;
  temperature: string | null; is_prospect: number; category_suggestion: string | null;
  msg_count: number; last_msg_at: string;
};

const CATS: [string, string][] = [
  ["active_buyer", "Buyer"], ["owner_seller", "Seller"], ["past_client", "Past client"],
  ["co_broker", "Broker"], ["vendor", "Vendor"], ["dead_dnc", "Dead"],
];
const CAT_ALIAS: Record<string, string> = { seller: "owner_seller", industry: "co_broker" };
const TEMPS: [string, string][] = [["hot", "🔥 Hot"], ["warm", "Warm"], ["cool", "Cool"], ["cold", "🧊 Cold"]];

const fmtMoney = (n: number | null) => n == null ? null : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

export default function TextExtracts() {
  const [items, setItems] = useState<Extract[]>([]);
  const [cats, setCats] = useState<Record<number, string>>({});
  const [temps, setTemps] = useState<Record<number, string>>({});
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [approved, setApproved] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/text-extracts");
      const j = await r.json();
      setItems(j.pending || []);
      setApproved(j.approvedCount || 0);
    } catch { /* table may not exist yet */ }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id: number, action: "approve" | "skip") => {
    setBusy(id);
    const it = items.find(x => x.id === id);
    await fetch("/api/text-extracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id, action,
        category: cats[id] || CAT_ALIAS[it?.category_suggestion || ""] || it?.category_suggestion || null,
        temperature: temps[id] || it?.temperature || null,
        overrides: edits[id] || {},
      }),
    });
    setItems(p => p.filter(x => x.id !== id));
    if (action === "approve") setApproved(c => c + 1);
    setBusy(null);
  };

  if (!loaded || (items.length === 0 && approved === 0)) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquareText className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-semibold">From your texts</h2>
        <span className="text-sm opacity-60">{items.length} to review · {approved} approved</span>
      </div>
      <p className="text-xs opacity-60 mb-3">
        Profiles built from your iMessage history. Approving updates the matching lead — or creates a new one if they are not in the CRM yet.
      </p>
      {items.length === 0 && (
        <div className="rounded-lg border p-4 text-sm opacity-70">All caught up — run the next batch to extract more threads.</div>
      )}
      {items.map(it => {
        const selCat = cats[it.id] || CAT_ALIAS[it.category_suggestion || ""] || it.category_suggestion || "";
        const selTemp = temps[it.id] || it.temperature || "";
        const ed = edits[it.id] || {};
        const val = (k: string, orig: unknown) => (k in ed ? ed[k] : (orig == null ? "" : String(orig)));
        const setEd = (k: string, v: string) => setEdits(p => ({ ...p, [it.id]: { ...(p[it.id] || {}), [k]: v } }));
        const inp = "rounded border px-2 py-1 text-xs bg-transparent w-full";
        return (
          <div key={it.id} className={`rounded-lg border mb-3 p-4 ${it.is_prospect ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
              <div className="flex-1 min-w-[240px]">
                <input className="font-medium rounded border px-2 py-1 text-sm bg-transparent w-full max-w-xs"
                  value={val("display_name", it.display_name || "")} placeholder="Name"
                  onChange={e => setEd("display_name", e.target.value)} />
                <span className="text-xs opacity-60 block mt-1">
                  {it.handle_id} · {it.msg_count} msgs · last {it.last_msg_at}
                  {it.matched_lead_id === null && <span className="ml-1.5 text-emerald-600 font-semibold">NEW — not in CRM</span>}
                </span>
              </div>
              <div className="flex gap-2 items-center">
                <button className="btn-secondary flex items-center gap-1.5" disabled={busy === it.id}
                  onClick={() => act(it.id, "skip")}>
                  <SkipForward className="w-4 h-4" /> Skip
                </button>
                <button className="btn-primary flex items-center gap-1.5" disabled={busy === it.id || !selCat}
                  title={selCat ? "" : "Pick a category first"}
                  onClick={() => act(it.id, "approve")}>
                  <Check className="w-4 h-4" /> Approve
                </button>
              </div>
            </div>
            <textarea className="text-sm bg-black/5 dark:bg-white/5 rounded p-3 mb-2 w-full min-h-[84px] border-0"
              value={val("dossier", it.dossier || "")} placeholder="Dossier — who they are, what they want"
              onChange={e => setEd("dossier", e.target.value)} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
              <input className={inp} inputMode="numeric" placeholder="Budget min $" value={val("budget_min", it.budget_min)} onChange={e => setEd("budget_min", e.target.value)} />
              <input className={inp} inputMode="numeric" placeholder="Budget max $" value={val("budget_max", it.budget_max)} onChange={e => setEd("budget_max", e.target.value)} />
              <input className={inp} inputMode="numeric" placeholder="LOA min ft" value={val("loa_min", it.loa_min)} onChange={e => setEd("loa_min", e.target.value)} />
              <input className={inp} inputMode="numeric" placeholder="LOA max ft" value={val("loa_max", it.loa_max)} onChange={e => setEd("loa_max", e.target.value)} />
              <input className={inp} inputMode="numeric" placeholder="Year min" value={val("year_min", it.year_min)} onChange={e => setEd("year_min", e.target.value)} />
              <input className={inp} inputMode="numeric" placeholder="Year max" value={val("year_max", it.year_max)} onChange={e => setEd("year_max", e.target.value)} />
              <input className={inp} placeholder="Make pref" value={val("make_preference", it.make_preference)} onChange={e => setEd("make_preference", e.target.value)} />
              <input className={inp} placeholder="Vessel type" value={val("vessel_type_pref", it.vessel_type_pref)} onChange={e => setEd("vessel_type_pref", e.target.value)} />
              <input className={inp} type="email" placeholder="+ email" value={val("email", "")} onChange={e => setEd("email", e.target.value)} />
              <input className={inp} placeholder="+ phone" value={val("phone", "")} onChange={e => setEd("phone", e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex rounded-md border overflow-hidden">
                {CATS.map(([v, label]) => (
                  <button key={v}
                    className={`px-2 py-1 text-xs ${selCat === v ? "bg-blue-600 text-white" : "opacity-70 hover:opacity-100"}`}
                    onClick={() => setCats(p => ({ ...p, [it.id]: v }))}>{label}</button>
                ))}
              </div>
              <div className="flex rounded-md border overflow-hidden">
                {TEMPS.map(([v, label]) => (
                  <button key={v}
                    className={`px-2 py-1 text-xs ${selTemp === v ? "bg-orange-600 text-white" : "opacity-70 hover:opacity-100"}`}
                    onClick={() => setTemps(p => ({ ...p, [it.id]: p[it.id] === v ? "" : v }))}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
