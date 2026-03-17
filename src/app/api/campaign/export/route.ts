import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function csvField(val: string): string {
  const s = (val || "").replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const source = searchParams.get("source") || "all";

    const db = new Database(DB_PATH, { readonly: true });

    const conditions: string[] = ["(email IS NOT NULL AND email != '' AND TRIM(email) != '')"];
    if (source === "pipeline") {
      conditions.push("source NOT IN ('apple_contacts', 'Apple Contacts')");
    } else if (source === "apple_contacts") {
      conditions.push("source IN ('apple_contacts', 'Apple Contacts')");
    }

    const where = "WHERE " + conditions.join(" AND ");

    const rows = db.prepare(`
      SELECT first_name, last_name, email, company, city, state, phone
      FROM leads ${where}
      ORDER BY first_name, last_name
    `).all() as any[];

    db.close();

    // Vertical Response import format
    const header = "Email Address,First Name,Last Name,Company,City,State,Phone";
    const lines = rows.map(r =>
      [
        csvField(r.email || ""),
        csvField(r.first_name || ""),
        csvField(r.last_name || ""),
        csvField(r.company || ""),
        csvField(r.city || ""),
        csvField(r.state || ""),
        csvField(r.phone || ""),
      ].join(",")
    );

    const csv = [header, ...lines].join("\r\n");
    const filename = `yotcrm-contacts-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
