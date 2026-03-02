import { NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const yearMin = searchParams.get("yearMin");
  const yearMax = searchParams.get("yearMax");
  const priceMin = searchParams.get("priceMin");
  const priceMax = searchParams.get("priceMax");
  const lengthMin = searchParams.get("lengthMin");
  const lengthMax = searchParams.get("lengthMax");
  const make = searchParams.get("make");
  const status = searchParams.get("status");

  const db = getDb();
  try {
    // Get all leads with their boats
    const leads = db.prepare("SELECT * FROM leads ORDER BY updated_at DESC").all() as any[];
    const allBoats = db.prepare("SELECT * FROM boats ORDER BY added_at DESC").all() as any[];

    // Group boats by lead
    const boatsByLead = new Map<number, any[]>();
    for (const b of allBoats) {
      if (!boatsByLead.has(b.lead_id)) boatsByLead.set(b.lead_id, []);
      boatsByLead.get(b.lead_id)!.push(b);
    }

    // Helper: parse numeric from messy strings like "$1,500,000" or "72'" or "2020"
    const parseNum = (val: string | null | undefined): number | null => {
      if (!val) return null;
      const cleaned = val.replace(/[^0-9.]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    };

    const results: any[] = [];

    for (const lead of leads) {
      // Filter by status
      if (status && status !== "all") {
        if ((lead.status || "other").toLowerCase() !== status.toLowerCase()) continue;
      }

      const boats = boatsByLead.get(lead.id) || [];
      // Check if any boat matches the criteria
      const matchingBoats = boats.filter((b: any) => {
        const bYear = parseNum(b.year);
        const bPrice = parseNum(b.price);
        const bLength = parseNum(b.length);
        const bMake = (b.make || "").toLowerCase();

        if (yearMin && bYear !== null && bYear < Number(yearMin)) return false;
        if (yearMax && bYear !== null && bYear > Number(yearMax)) return false;
        if (priceMin && bPrice !== null && bPrice < Number(priceMin)) return false;
        if (priceMax && bPrice !== null && bPrice > Number(priceMax)) return false;
        if (lengthMin && bLength !== null && bLength < Number(lengthMin)) return false;
        if (lengthMax && bLength !== null && bLength > Number(lengthMax)) return false;
        if (make && !bMake.includes(make.toLowerCase())) return false;

        // If filters are set but boat has no data for that field, exclude
        if (yearMin && bYear === null) return false;
        if (priceMin && bPrice === null) return false;
        if (lengthMin && bLength === null) return false;

        return true;
      });

      // If filters are active and no boats match, skip this lead
      const hasFilters = yearMin || yearMax || priceMin || priceMax || lengthMin || lengthMax || make;
      if (hasFilters && matchingBoats.length === 0) continue;

      const displayBoats = hasFilters ? matchingBoats : boats;
      const firstBoat = displayBoats[0] || boats[0];

      results.push({
        id: lead.id,
        firstName: lead.first_name,
        lastName: lead.last_name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status || "other",
        source: lead.source,
        notes: lead.notes,
        boat_make: firstBoat?.make || "",
        boat_model: firstBoat?.model || "",
        boat_year: firstBoat?.year || "",
        boat_length: firstBoat?.length || "",
        boat_price: firstBoat?.price || "",
        boat_location: firstBoat?.location || "",
        listing_url: firstBoat?.listing_url || "",
        boats: displayBoats,
        matchCount: matchingBoats.length,
      });
    }

    // Compute segment counts from ALL leads (not filtered)
    const allPrices: number[] = [];
    const allLengths: number[] = [];
    const allYears: number[] = [];
    for (const b of allBoats) {
      const p = parseNum(b.price); if (p !== null && p > 0) allPrices.push(p);
      const l = parseNum(b.length); if (l !== null && l > 0) allLengths.push(l);
      const y = parseNum(b.year); if (y !== null && y > 1900) allYears.push(y);
    }

    const priceSegments = [
      { label: "Under $500K", min: 0, max: 500000 },
      { label: "$500K – $1M", min: 500000, max: 1000000 },
      { label: "$1M – $2M", min: 1000000, max: 2000000 },
      { label: "$2M – $3M", min: 2000000, max: 3000000 },
      { label: "$3M – $5M", min: 3000000, max: 5000000 },
      { label: "$5M – $10M", min: 5000000, max: 10000000 },
      { label: "$10M+", min: 10000000, max: Infinity },
    ].map(s => ({ ...s, count: allPrices.filter(p => p >= s.min && p < s.max).length }));

    const lengthSegments = [
      { label: "Under 40'", min: 0, max: 40 },
      { label: "40' – 50'", min: 40, max: 50 },
      { label: "50' – 60'", min: 50, max: 60 },
      { label: "60' – 80'", min: 60, max: 80 },
      { label: "80' – 100'", min: 80, max: 100 },
      { label: "100' – 130'", min: 100, max: 130 },
      { label: "130'+", min: 130, max: Infinity },
    ].map(s => ({ ...s, count: allLengths.filter(l => l >= s.min && l < s.max).length }));

    const yearSegments = [
      { label: "Pre-2000", min: 0, max: 2000 },
      { label: "2000 – 2005", min: 2000, max: 2006 },
      { label: "2005 – 2010", min: 2005, max: 2011 },
      { label: "2010 – 2015", min: 2010, max: 2016 },
      { label: "2015 – 2020", min: 2015, max: 2021 },
      { label: "2020 – 2025", min: 2020, max: 2026 },
      { label: "2025+", min: 2025, max: Infinity },
    ].map(s => ({ ...s, count: allYears.filter(y => y >= s.min && y < s.max).length }));

    // Top makes
    const makeCounts = new Map<string, number>();
    for (const b of allBoats) {
      const m = (b.make || "").trim();
      if (m) makeCounts.set(m, (makeCounts.get(m) || 0) + 1);
    }
    const topMakes = Array.from(makeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    return NextResponse.json({
      ok: true,
      buyers: results,
      total: results.length,
      segments: { price: priceSegments, length: lengthSegments, year: yearSegments },
      topMakes,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally { db.close(); }
}
