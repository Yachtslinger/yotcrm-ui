"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageShell from "../components/PageShell";
import { Search, X, Filter, Users, ChevronDown, ChevronUp } from "lucide-react";

type Buyer = {
  id: string; firstName: string; lastName: string; email: string; phone: string;
  status: string; source: string; notes: string;
  boat_make: string; boat_model: string; boat_year: string;
  boat_length: string; boat_price: string; boat_location: string;
  listing_url: string; boats: any[]; matchCount: number;
};
type Segment = { label: string; min: number; max: number; count: number };
type TopMake = { name: string; count: number };

type Filters = {
  yearMin: string; yearMax: string;
  priceMin: string; priceMax: string;
  lengthMin: string; lengthMax: string;
  make: string; status: string;
};

const EMPTY_FILTERS: Filters = {
  yearMin: "", yearMax: "", priceMin: "", priceMax: "",
  lengthMin: "", lengthMax: "", make: "", status: "all",
};

function formatPrice(val: string): string {
  const n = parseFloat((val || "").replace(/[^0-9.]/g, ""));
  if (isNaN(n) || n === 0) return "—";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function BuyerSearchPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [segments, setSegments] = useState<{ price: Segment[]; length: Segment[]; year: Segment[] }>({ price: [], length: [], year: [] });
  const [topMakes, setTopMakes] = useState<TopMake[]>([]);
  const [showFilters, setShowFilters] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchBuyers = useCallback(async (f: Filters) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.yearMin) params.set("yearMin", f.yearMin);
    if (f.yearMax) params.set("yearMax", f.yearMax);
    if (f.priceMin) params.set("priceMin", f.priceMin);
    if (f.priceMax) params.set("priceMax", f.priceMax);
    if (f.lengthMin) params.set("lengthMin", f.lengthMin);
    if (f.lengthMax) params.set("lengthMax", f.lengthMax);
    if (f.make) params.set("make", f.make);
    if (f.status && f.status !== "all") params.set("status", f.status);
    try {
      const res = await fetch(`/api/buyers?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setBuyers(data.buyers);
        setTotal(data.total);
        if (data.segments) setSegments(data.segments);
        if (data.topMakes) setTopMakes(data.topMakes);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBuyers(EMPTY_FILTERS); }, [fetchBuyers]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    fetchBuyers(filters);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    fetchBuyers(EMPTY_FILTERS);
  };

  const selectSegment = (type: "price" | "length" | "year", seg: Segment) => {
    const newF = { ...filters };
    const maxVal = seg.max === Infinity ? "" : String(seg.max);
    if (type === "price") { newF.priceMin = String(seg.min); newF.priceMax = maxVal; }
    else if (type === "length") { newF.lengthMin = String(seg.min); newF.lengthMax = maxVal; }
    else { newF.yearMin = String(seg.min); newF.yearMax = maxVal; }
    setFilters(newF);
    setAppliedFilters(newF);
    fetchBuyers(newF);
  };

  const selectMake = (name: string) => {
    const newF = { ...filters, make: name };
    setFilters(newF);
    setAppliedFilters(newF);
    fetchBuyers(newF);
  };

  const hasActiveFilters = Object.entries(appliedFilters).some(([k, v]) => k !== "status" ? v !== "" : v !== "all");

  return (
    <PageShell
      title="Buyer Search"
      subtitle={hasActiveFilters ? `${total} buyer${total !== 1 ? "s" : ""} matching filters` : `${total} total buyers`}
      actions={
        <button onClick={() => setShowFilters(!showFilters)}
          className="btn-secondary flex items-center gap-1.5">
          <Filter className="w-4 h-4" /> {showFilters ? "Hide" : "Show"} Filters
          {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      }
    >
      {/* ═══ FILTER PANEL ═══ */}
      {showFilters && (
        <div className="card-elevated p-4 md:p-5 mb-5 space-y-4">

          {/* Segment Chips — Price */}
          {segments.price.some(s => s.count > 0) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Price Range</p>
              <div className="flex flex-wrap gap-1.5">
                {segments.price.filter(s => s.count > 0).map(s => {
                  const active = appliedFilters.priceMin === String(s.min) && (s.max === Infinity ? appliedFilters.priceMax === "" : appliedFilters.priceMax === String(s.max));
                  return (
                    <button key={s.label} onClick={() => selectSegment("price", s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        active ? "bg-[var(--brass-400)] text-[var(--navy-900)]" : "bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] dark:text-[var(--navy-300)] hover:bg-[var(--sand-200)]"
                      }`}>{s.label} <span className="opacity-60">({s.count})</span></button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Segment Chips — Length */}
          {segments.length.some(s => s.count > 0) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Length / Size</p>
              <div className="flex flex-wrap gap-1.5">
                {segments.length.filter(s => s.count > 0).map(s => {
                  const active = appliedFilters.lengthMin === String(s.min) && (s.max === Infinity ? appliedFilters.lengthMax === "" : appliedFilters.lengthMax === String(s.max));
                  return (
                    <button key={s.label} onClick={() => selectSegment("length", s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        active ? "bg-[var(--brass-400)] text-[var(--navy-900)]" : "bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] dark:text-[var(--navy-300)] hover:bg-[var(--sand-200)]"
                      }`}>{s.label} <span className="opacity-60">({s.count})</span></button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Segment Chips — Year */}
          {segments.year.some(s => s.count > 0) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Year Range</p>
              <div className="flex flex-wrap gap-1.5">
                {segments.year.filter(s => s.count > 0).map(s => {
                  const active = appliedFilters.yearMin === String(s.min) && (s.max === Infinity ? appliedFilters.yearMax === "" : appliedFilters.yearMax === String(s.max));
                  return (
                    <button key={s.label} onClick={() => selectSegment("year", s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        active ? "bg-[var(--brass-400)] text-[var(--navy-900)]" : "bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] dark:text-[var(--navy-300)] hover:bg-[var(--sand-200)]"
                      }`}>{s.label} <span className="opacity-60">({s.count})</span></button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Make filter */}
          {topMakes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Make / Builder</p>
              <div className="flex flex-wrap gap-1.5">
                {topMakes.map(m => {
                  const active = appliedFilters.make.toLowerCase() === m.name.toLowerCase();
                  return (
                    <button key={m.name} onClick={() => selectMake(m.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        active ? "bg-[var(--brass-400)] text-[var(--navy-900)]" : "bg-[var(--sand-100)] dark:bg-[var(--navy-800)] text-[var(--navy-500)] dark:text-[var(--navy-300)] hover:bg-[var(--sand-200)]"
                      }`}>{m.name} <span className="opacity-60">({m.count})</span></button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manual Range Inputs */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--navy-400)" }}>Custom Range</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Year Min</label>
                <input value={filters.yearMin} onChange={e => setFilters(f => ({ ...f, yearMin: e.target.value }))}
                  placeholder="2005" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Year Max</label>
                <input value={filters.yearMax} onChange={e => setFilters(f => ({ ...f, yearMax: e.target.value }))}
                  placeholder="2015" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Price Min ($)</label>
                <input value={filters.priceMin} onChange={e => setFilters(f => ({ ...f, priceMin: e.target.value }))}
                  placeholder="1000000" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Price Max ($)</label>
                <input value={filters.priceMax} onChange={e => setFilters(f => ({ ...f, priceMax: e.target.value }))}
                  placeholder="3000000" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Length Min (ft)</label>
                <input value={filters.lengthMin} onChange={e => setFilters(f => ({ ...f, lengthMin: e.target.value }))}
                  placeholder="60" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Length Max (ft)</label>
                <input value={filters.lengthMax} onChange={e => setFilters(f => ({ ...f, lengthMax: e.target.value }))}
                  placeholder="100" className="form-input w-full" type="number" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Make</label>
                <input value={filters.make} onChange={e => setFilters(f => ({ ...f, make: e.target.value }))}
                  placeholder="Azimut" className="form-input w-full" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--navy-400)] mb-0.5 block">Status</label>
                <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="form-input w-full">
                  <option value="all">All</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                  <option value="nurture">Nurture</option>
                  <option value="new">New</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button onClick={applyFilters} className="btn-primary flex items-center gap-1.5" style={{ minHeight: "44px" }}>
              <Search className="w-4 h-4" /> Search Buyers
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="btn-ghost flex items-center gap-1.5" style={{ minHeight: "44px" }}>
                <X className="w-4 h-4" /> Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {appliedFilters.yearMin && <FilterTag label={`Year ≥ ${appliedFilters.yearMin}`} onClear={() => { const f = { ...filters, yearMin: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.yearMax && <FilterTag label={`Year ≤ ${appliedFilters.yearMax}`} onClear={() => { const f = { ...filters, yearMax: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.priceMin && <FilterTag label={`Price ≥ ${formatPrice(appliedFilters.priceMin)}`} onClear={() => { const f = { ...filters, priceMin: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.priceMax && <FilterTag label={`Price ≤ ${formatPrice(appliedFilters.priceMax)}`} onClear={() => { const f = { ...filters, priceMax: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.lengthMin && <FilterTag label={`Length ≥ ${appliedFilters.lengthMin}'`} onClear={() => { const f = { ...filters, lengthMin: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.lengthMax && <FilterTag label={`Length ≤ ${appliedFilters.lengthMax}'`} onClear={() => { const f = { ...filters, lengthMax: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.make && <FilterTag label={`Make: ${appliedFilters.make}`} onClear={() => { const f = { ...filters, make: "" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
          {appliedFilters.status !== "all" && <FilterTag label={`Status: ${appliedFilters.status}`} onClear={() => { const f = { ...filters, status: "all" }; setFilters(f); setAppliedFilters(f); fetchBuyers(f); }} />}
        </div>
      )}

      {/* ═══ RESULTS ═══ */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="skeleton rounded-xl" style={{ height: 72 }} />)}
        </div>
      ) : buyers.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: "var(--navy-400)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--navy-400)" }}>
            {hasActiveFilters ? "No buyers match these filters" : "No buyers in the system yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {buyers.map(b => {
            const name = [b.firstName, b.lastName].filter(Boolean).join(" ") || "Untitled";
            const boat = [b.boat_year, b.boat_length ? b.boat_length + "'" : "", b.boat_make, b.boat_model].filter(Boolean).join(" ");
            const status = (b.status || "other").toLowerCase();
            return (
              <Link key={b.id} href={`/clients/${encodeURIComponent(b.id)}`}
                className="card-elevated p-4 flex items-center justify-between gap-3 hover:shadow-md transition-shadow block">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-sm truncate" style={{ color: "var(--navy-900)" }}>{name}</span>
                    <span className={`badge badge-${status} shrink-0`}>{status.toUpperCase()}</span>
                  </div>
                  {boat && <p className="text-xs truncate" style={{ color: "var(--navy-500)" }}>{boat}</p>}
                  {b.email && <p className="text-xs truncate" style={{ color: "var(--navy-400)" }}>{b.email}</p>}
                </div>
                <div className="text-right shrink-0">
                  {b.boat_price && <p className="text-sm font-bold" style={{ color: "var(--brass-500)" }}>{formatPrice(b.boat_price)}</p>}
                  {b.boats.length > 1 && <p className="text-[10px]" style={{ color: "var(--navy-400)" }}>{b.boats.length} boats</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function FilterTag({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: "var(--brass-400)", color: "var(--navy-900)" }}>
      {label}
      <button onClick={onClear} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
    </span>
  );
}
