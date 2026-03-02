import { NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  return db;
}

function parsePrice(p: string): number {
  if (!p) return 0;
  const n = parseFloat(p.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  const db = getDb();
  try {
    // Pipeline by status
    const statusRows = db.prepare(
      "SELECT status, COUNT(*) as count FROM leads GROUP BY status"
    ).all() as { status: string; count: number }[];

    // Pipeline value by status (sum of boat prices per lead status)
    const valueRows = db.prepare(`
      SELECT l.status, b.price
      FROM boats b JOIN leads l ON b.lead_id = l.id
      WHERE b.price != ''
    `).all() as { status: string; price: string }[];

    const pipelineValue: Record<string, number> = {};
    let totalValue = 0;
    for (const r of valueRows) {
      const v = parsePrice(r.price);
      const s = (r.status || "other").toLowerCase();
      pipelineValue[s] = (pipelineValue[s] || 0) + v;
      totalValue += v;
    }

    // Lead sources
    const sourceRows = db.prepare(
      "SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC"
    ).all() as { source: string; count: number }[];

    // Weekly lead velocity (last 12 weeks)
    const weeklyRows = db.prepare(`
      SELECT strftime('%Y-W%W', created_at) as week,
             COUNT(*) as count
      FROM leads
      WHERE created_at >= date('now', '-84 days')
      GROUP BY week ORDER BY week
    `).all() as { week: string; count: number }[];

    // Top boats by price
    const topBoats = db.prepare(`
      SELECT b.make, b.model, b.year, b.length, b.price,
             l.first_name, l.last_name, l.status, l.id as lead_id
      FROM boats b JOIN leads l ON b.lead_id = l.id
      WHERE b.price != ''
      ORDER BY CAST(REPLACE(REPLACE(b.price, ',', ''), '$', '') AS REAL) DESC
      LIMIT 10
    `).all() as any[];

    // Total counts
    const totalLeads = db.prepare("SELECT COUNT(*) as c FROM leads").get() as { c: number };
    const totalBoats = db.prepare("SELECT COUNT(*) as c FROM boats").get() as { c: number };
    const totalTodos = db.prepare(
      "SELECT COUNT(*) as c FROM todos WHERE completed = 0"
    ).get() as { c: number };

    // Leads added today / this week / this month
    const todayLeads = db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now')"
    ).get() as { c: number };
    const weekLeads = db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now', '-7 days')"
    ).get() as { c: number };
    const monthLeads = db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now', '-30 days')"
    ).get() as { c: number };

    // Price ranges distribution
    const allPrices = db.prepare(
      "SELECT price FROM boats WHERE price != ''"
    ).all() as { price: string }[];

    const priceRanges = [
      { label: "Under $1M", min: 0, max: 1_000_000, count: 0 },
      { label: "$1M–$3M", min: 1_000_000, max: 3_000_000, count: 0 },
      { label: "$3M–$5M", min: 3_000_000, max: 5_000_000, count: 0 },
      { label: "$5M–$10M", min: 5_000_000, max: 10_000_000, count: 0 },
      { label: "$10M+", min: 10_000_000, max: Infinity, count: 0 },
    ];
    for (const { price } of allPrices) {
      const v = parsePrice(price);
      for (const range of priceRanges) {
        if (v >= range.min && v < range.max) { range.count++; break; }
      }
    }

    return NextResponse.json({
      ok: true,
      totals: {
        leads: totalLeads.c,
        boats: totalBoats.c,
        openTodos: totalTodos.c,
        pipelineValue: totalValue,
      },
      velocity: {
        today: todayLeads.c,
        week: weekLeads.c,
        month: monthLeads.c,
      },
      statusBreakdown: statusRows,
      pipelineValue,
      sources: sourceRows,
      weeklyTrend: weeklyRows,
      priceRanges: priceRanges.map(({ label, count }) => ({ label, count })),
      topBoats: topBoats.map((b: any) => ({
        ...b,
        numericPrice: parsePrice(b.price),
        lead_name: [b.first_name, b.last_name].filter(Boolean).join(" "),
      })),
    });
  } finally {
    db.close();
  }
}
