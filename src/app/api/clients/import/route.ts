import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { enrichLead } from "@/lib/intel/orchestrator";

export const runtime = "nodejs";
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

type ImportRow = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  occupation?: string;
  employer?: string;
  city?: string;
  state?: string;
  zip?: string;
  status?: string;
  source?: string;
  notes?: string;
  linkedin_url?: string;
  boat_make?: string;
  boat_model?: string;
  boat_year?: string;
  boat_length?: string;
  boat_price?: string;
};

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const rows: ImportRow[] = body.rows || [];
    const autoEnrich: boolean = body.autoEnrich ?? false;
    const source: string = body.source || "csv-import";

    if (!rows.length) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }
    if (rows.length > 5000) {
      return NextResponse.json({ error: "Max 5,000 contacts per import" }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");

    // Ensure columns exist
    const cols = [
      ["occupation", "TEXT DEFAULT ''"], ["employer", "TEXT DEFAULT ''"],
      ["city", "TEXT DEFAULT ''"], ["state", "TEXT DEFAULT ''"], ["zip", "TEXT DEFAULT ''"],
      ["linkedin_url", "TEXT DEFAULT ''"], ["company", "TEXT DEFAULT ''"],
    ];
    for (const [col, def] of cols) {
      try { db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${def}`); } catch { /* exists */ }
    }

    // Load existing emails + phones for duplicate detection
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const allLeads = db.prepare("SELECT email, phone FROM leads").all() as any[];
    for (const l of allLeads) {
      if (l.email) existingEmails.add(l.email.toLowerCase().trim());
      if (l.phone) existingPhones.add(l.phone.replace(/\D/g, ""));
    }

    const insertLead = db.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, status, notes, source, tags,
        occupation, employer, city, state, zip, linkedin_url, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBoat = db.prepare(`
      INSERT INTO boats (lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
      VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?)
    `);

    let imported = 0;
    let skippedDupes = 0;
    let skippedEmpty = 0;
    const newLeadIds: number[] = [];

    const importAll = db.transaction(() => {
      const now = new Date().toISOString();
      for (const row of rows) {
        const firstName = (row.first_name || "").trim();
        const lastName = (row.last_name || "").trim();
        const email = (row.email || "").trim().toLowerCase();
        const phone = (row.phone || "").replace(/\D/g, "");

        // Skip empty rows
        if (!firstName && !lastName && !email) { skippedEmpty++; continue; }

        // Duplicate check: email match or phone match
        if (email && existingEmails.has(email)) { skippedDupes++; continue; }
        if (phone && phone.length >= 7 && existingPhones.has(phone)) { skippedDupes++; continue; }

        const result = insertLead.run(
          firstName, lastName, email || null, row.phone || "",
          row.status || "new", row.notes || "", source,
          row.occupation || "", row.employer || row.company || "",
          row.city || "", row.state || "", row.zip || "",
          row.linkedin_url || "", row.company || "",
          now, now
        );
        const leadId = result.lastInsertRowid as number;
        imported++;
        newLeadIds.push(leadId);

        // Track for future dupe checks within same import
        if (email) existingEmails.add(email);
        if (phone) existingPhones.add(phone);

        // Insert boat if any boat fields
        if (row.boat_make || row.boat_model || row.boat_year) {
          insertBoat.run(leadId, row.boat_make || "", row.boat_model || "",
            row.boat_year || "", row.boat_length || "", row.boat_price || "", now);
        }
      }
    });

    importAll();
    db.close();

    // Fire-and-forget: auto-enrich imported leads (stagger to avoid rate limits)
    if (autoEnrich && newLeadIds.length > 0) {
      const enrichBatch = async () => {
        for (let i = 0; i < newLeadIds.length; i++) {
          try {
            await enrichLead(newLeadIds[i]);
          } catch (err) {
            console.error(`[Import] Enrich failed for lead ${newLeadIds[i]}:`, err);
          }
          // Stagger: 500ms between enrichments to avoid rate limits
          if (i < newLeadIds.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      };
      enrichBatch().catch(err => console.error("[Import] Batch enrich failed:", err));
    }

    return NextResponse.json({
      ok: true,
      imported,
      skippedDupes,
      skippedEmpty,
      total: rows.length,
      enriching: autoEnrich ? newLeadIds.length : 0,
    });
  } catch (error: any) {
    console.error("[Import] Failed:", error);
    return NextResponse.json({ error: error.message || "Import failed" }, { status: 500 });
  }
}
