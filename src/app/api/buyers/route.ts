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

  const yearMin   = searchParams.get("yearMin");
  const yearMax   = searchParams.get("yearMax");
  const priceMin  = searchParams.get("priceMin");
  const priceMax  = searchParams.get("priceMax");
  const lengthMin = searchParams.get("lengthMin");
  const lengthMax = searchParams.get("lengthMax");
  const make      = searchParams.get("make");
  const status    = searchParams.get("status");
  const page      = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize  = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "100")));

  const db = getDb();
  try {
    // ── 1. Build SQL WHERE clauses pushed all the way to the DB ──────────────
    const boatConds: string[] = [];
    const boatParams: (string | number)[] = [];

    if (yearMin)   { boatConds.push("CAST(b.year  AS INTEGER) >= ?"); boatParams.push(Number(yearMin)); }
    if (yearMax)   { boatConds.push("CAST(b.year  AS INTEGER) <= ?"); boatParams.push(Number(yearMax)); }
    if (lengthMin) { boatConds.push("CAST(REPLACE(REPLACE(b.length,'ft',''),'''','') AS REAL) >= ?"); boatParams.push(Number(lengthMin)); }
    if (lengthMax) { boatConds.push("CAST(REPLACE(REPLACE(b.length,'ft',''),'''','') AS REAL) <= ?"); boatParams.push(Number(lengthMax)); }
    if (priceMin)  { boatConds.push("CAST(REPLACE(REPLACE(REPLACE(b.price,'$',''),',',''),'USD','') AS REAL) >= ?"); boatParams.push(Number(priceMin)); }
    if (priceMax)  { boatConds.push("CAST(REPLACE(REPLACE(REPLACE(b.price,'$',''),',',''),'USD','') AS REAL) <= ?"); boatParams.push(Number(priceMax)); }
    if (make)      { boatConds.push("LOWER(b.make) LIKE ?"); boatParams.push(`%${make.toLowerCase()}%`); }

    const leadConds: string[] = [];
    const leadParams: (string | number)[] = [];
    if (status && status !== "all") {
      leadConds.push("LOWER(l.status) = ?");
      leadParams.push(status.toLowerCase());
    }

    const hasBoatFilters = boatConds.length > 0;

    // ── 2. Paginated buyer list — JOIN only filters into SQL ─────────────────
    const joinType  = hasBoatFilters ? "INNER" : "LEFT";
    const boatWhere = boatConds.length ? `AND ${boatConds.join(" AND ")}` : "";
    const leadWhere = leadConds.length ? `WHERE ${leadConds.join(" AND ")}` : "";
    const offset    = (page - 1) * pageSize;

    // Count total for pagination
    const countSql = `
      SELECT COUNT(DISTINCT l.id) as c
      FROM leads l
      ${joinType} JOIN boats b ON b.lead_id = l.id ${boatWhere}
      ${leadWhere}
    `;
    const total = (db.prepare(countSql).get(
      ...boatParams, ...leadParams
    ) as any).c;

    // Fetch page of leads with their first matching boat inline
    const listSql = `
      SELECT
        l.id, l.first_name, l.last_name, l.email, l.phone,
        l.status, l.source, l.notes, l.updated_at,
        b.make AS boat_make, b.model AS boat_model,
        b.year AS boat_year, b.length AS boat_length,
        b.price AS boat_price, b.location AS boat_location,
        b.listing_url
      FROM leads l
      ${joinType} JOIN boats b ON b.lead_id = l.id
        AND b.id = (
          SELECT id FROM boats b2
          WHERE b2.lead_id = l.id ${boatWhere.replace(/b\./g, 'b2.')}
          ORDER BY b2.added_at DESC LIMIT 1
        )
      ${leadWhere}
      GROUP BY l.id
      ORDER BY l.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = db.prepare(listSql).all(
      ...boatParams, ...boatParams, ...leadParams, pageSize, offset
    ) as any[];

    const buyers = rows.map(r => ({
      id: r.id,
      firstName: r.first_name,
      lastName:  r.last_name,
      email:     r.email,
      phone:     r.phone,
      status:    r.status || "other",
      source:    r.source,
      notes:     r.notes,
      boat_make:     r.boat_make    || "",
      boat_model:    r.boat_model   || "",
      boat_year:     r.boat_year    || "",
      boat_length:   r.boat_length  || "",
      boat_price:    r.boat_price   || "",
      boat_location: r.boat_location || "",
      listing_url:   r.listing_url  || "",
    }));

    // ── 3. Segment counts — pure SQL aggregation, no JS loops ────────────────
    const segQuery = (col: string, casts: string) =>
      db.prepare(`SELECT ${casts} AS n, COUNT(*) AS c FROM boats WHERE ${col} != '' GROUP BY n`).all() as any[];

    // Price buckets via SQL CASE
    const priceSegs = db.prepare(`
      SELECT
        CASE
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) <  500000   THEN 'Under $500K'
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) < 1000000   THEN '$500K – $1M'
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) < 2000000   THEN '$1M – $2M'
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) < 3000000   THEN '$2M – $3M'
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) < 5000000   THEN '$3M – $5M'
          WHEN CAST(REPLACE(REPLACE(REPLACE(price,'$',''),',',''),'USD','') AS REAL) < 10000000  THEN '$5M – $10M'
          ELSE '$10M+'
        END AS label,
        COUNT(*) AS count
      FROM boats WHERE price != '' AND price IS NOT NULL
      GROUP BY label
    `).all();

    const lengthSegs = db.prepare(`
      SELECT
        CASE
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) <  40 THEN 'Under 40 ft'
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) <  50 THEN '40 – 50 ft'
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) <  60 THEN '50 – 60 ft'
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) <  80 THEN '60 – 80 ft'
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) < 100 THEN '80 – 100 ft'
          WHEN CAST(REPLACE(REPLACE(length,'ft',''),'''','') AS REAL) < 130 THEN '100 – 130 ft'
          ELSE '130 ft+'
        END AS label,
        COUNT(*) AS count
      FROM boats WHERE length != '' AND length IS NOT NULL
      GROUP BY label
    `).all();

    const yearSegs = db.prepare(`
      SELECT
        CASE
          WHEN CAST(year AS INTEGER) < 2000 THEN 'Pre-2000'
          WHEN CAST(year AS INTEGER) < 2006 THEN '2000 – 2005'
          WHEN CAST(year AS INTEGER) < 2011 THEN '2005 – 2010'
          WHEN CAST(year AS INTEGER) < 2016 THEN '2010 – 2015'
          WHEN CAST(year AS INTEGER) < 2021 THEN '2015 – 2020'
          WHEN CAST(year AS INTEGER) < 2026 THEN '2020 – 2025'
          ELSE '2025+'
        END AS label,
        COUNT(*) AS count
      FROM boats WHERE year != '' AND year IS NOT NULL AND CAST(year AS INTEGER) > 1900
      GROUP BY label
    `).all();

    const topMakes = db.prepare(`
      SELECT make AS name, COUNT(*) AS count
      FROM boats WHERE make != '' AND make IS NOT NULL
      GROUP BY make ORDER BY count DESC LIMIT 20
    `).all();

    return NextResponse.json({
      ok: true,
      buyers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      segments: { price: priceSegs, length: lengthSegs, year: yearSegs },
      topMakes,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  } finally { db.close(); }
}
