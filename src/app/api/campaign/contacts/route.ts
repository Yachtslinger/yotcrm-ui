import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

/**
 * GET /api/campaign/contacts
 * Returns leads that have an email address, for use in the campaign contact picker.
 *
 * Query params:
 *   source   = "pipeline" | "apple_contacts" | "all"  (default: "pipeline")
 *   search   = text filter on name/email/company
 *   limit    = max results (default 500)
 *   offset   = pagination offset (default 0)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const source = searchParams.get("source") || "pipeline";
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10), 2000);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const db = new Database(DB_PATH, { readonly: true });

    const conditions: string[] = ["(email IS NOT NULL AND email != '')"];
    const params: (string | number)[] = [];

    // Source filtering
    if (source === "pipeline") {
      conditions.push("source NOT IN ('apple_contacts', 'Apple Contacts')");
    } else if (source === "apple_contacts") {
      conditions.push("source IN ('apple_contacts', 'Apple Contacts')");
    }
    // "all" = no filter

    // Text search
    if (search) {
      conditions.push(`(
        LOWER(first_name || ' ' || COALESCE(last_name, '')) LIKE ? OR
        LOWER(email) LIKE ? OR
        LOWER(COALESCE(company, '')) LIKE ?
      )`);
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    const where = "WHERE " + conditions.join(" AND ");

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM leads ${where}`).get(...params) as { total: number };

    const rows = db.prepare(`
      SELECT id, first_name, last_name, email, company, source, status, city, state
      FROM leads
      ${where}
      ORDER BY
        CASE WHEN source NOT IN ('apple_contacts','Apple Contacts') THEN 0 ELSE 1 END,
        first_name, last_name
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    db.close();

    const contacts = rows.map(r => ({
      id: r.id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.email,
      email: r.email,
      company: r.company || "",
      source: r.source || "",
      status: r.status || "",
      location: [r.city, r.state].filter(Boolean).join(", "),
    }));

    return NextResponse.json({
      ok: true,
      total: countRow.total,
      contacts,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
