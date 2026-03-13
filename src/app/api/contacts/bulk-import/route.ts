import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
export const runtime = "nodejs";

/* ─── Types ─── */
type ParsedContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  notes: string;
};

type PreviewContact = ParsedContact & {
  isDuplicate: boolean;
  existingLeadId?: number;
  duplicateReason?: string;
};

/* ═══════════════════════════════════════════
   POST  — Parse uploaded file + dedup check
   Body: FormData with "file" and "format"
   ═══════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    let content: string;
    let format: string;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // FormData upload (primary path)
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      format = (formData.get("format") as string) || "vcf";

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      content = await file.text();
    } else {
      // JSON fallback
      const body = await req.json();
      content = body.content;
      format = body.format || "vcf";
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }

    const parsed = format === "csv" ? parseCSV(content) : parseVCard(content);
    if (parsed.length === 0) {
      return NextResponse.json({ error: "No contacts found in file" }, { status: 400 });
    }

    const preview = checkDuplicates(parsed);
    const newCount = preview.filter(c => !c.isDuplicate).length;
    const dupeCount = preview.filter(c => c.isDuplicate).length;

    return NextResponse.json({
      total: preview.length,
      newContacts: newCount,
      duplicates: dupeCount,
      contacts: preview,
    });
  } catch (err: any) {
    console.error("[bulk-import] Parse error:", err);
    return NextResponse.json({ error: err.message || "Parse failed" }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════
   PUT  — Confirm import of selected contacts
   Body: { contacts: ParsedContact[] }
   ═══════════════════════════════════════════ */
export async function PUT(req: NextRequest) {
  try {
    const { contacts, source: importSource } = await req.json() as { contacts: ParsedContact[]; source?: string };
    if (!contacts?.length) {
      return NextResponse.json({ error: "No contacts to import" }, { status: 400 });
    }
    const source = importSource || "csv-import";

    const db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");

    // Ensure company/title columns exist
    for (const [col, def] of [["company", "TEXT DEFAULT ''"], ["title", "TEXT DEFAULT ''"]]) {
      try { db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${def}`); } catch { /* exists */ }
    }

    const insert = db.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, status, tags, notes, source, company, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'new', '', ?, ?, ?, datetime('now'), datetime('now'))
    `);

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const txn = db.transaction(() => {
      for (const c of contacts) {
        try {
          const emailVal = c.email?.trim() || null;
          const notes = [c.title, c.notes].filter(Boolean).join(" — ");
          insert.run(
            c.firstName?.trim() || "",
            c.lastName?.trim() || "",
            emailVal,
            c.phone?.trim() || "",
            notes,
            source,
            c.company?.trim() || "",
          );
          imported++;
        } catch (err: any) {
          if (err.message?.includes("UNIQUE constraint")) {
            skipped++;
          } else {
            errors.push(`${c.firstName} ${c.lastName}: ${err.message}`);
            skipped++;
          }
        }
      }
    });

    txn();
    db.close();

    return NextResponse.json({ imported, skipped, errors });
  } catch (err: any) {
    console.error("[bulk-import] Import error:", err);
    return NextResponse.json({ error: err.message || "Import failed" }, { status: 500 });
  }
}


/* ═══════════════════════════════════════════
   vCard Parser
   ═══════════════════════════════════════════ */
function parseVCard(text: string): ParsedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).filter(c => c.trim());
  const contacts: ParsedContact[] = [];

  for (const card of cards) {
    const lines = unfoldLines(card);
    const c: ParsedContact = {
      firstName: "", lastName: "", email: "", phone: "",
      company: "", title: "", notes: "",
    };

    for (const line of lines) {
      if (/^N[;:]/i.test(line)) {
        const val = extractValue(line);
        const parts = val.split(";");
        c.lastName = clean(parts[0] || "");
        c.firstName = clean(parts[1] || "");
      }
      else if (/^FN[;:]/i.test(line)) {
        const val = clean(extractValue(line));
        if (!c.firstName && !c.lastName && val) {
          const parts = val.split(/\s+/);
          c.firstName = parts[0] || "";
          c.lastName = parts.slice(1).join(" ") || "";
        }
      }
      else if (/^EMAIL[;:]/i.test(line) && !c.email) {
        c.email = clean(extractValue(line));
      }
      else if (/^TEL[;:]/i.test(line) && !c.phone) {
        c.phone = clean(extractValue(line));
      }
      else if (/^ORG[;:]/i.test(line)) {
        c.company = clean(extractValue(line).replace(/;/g, " ").trim());
      }
      else if (/^TITLE[;:]/i.test(line)) {
        c.title = clean(extractValue(line));
      }
      else if (/^NOTE[;:]/i.test(line)) {
        c.notes = clean(extractValue(line).replace(/\\n/g, "\n"));
      }
    }

    if (c.firstName || c.lastName || c.email || c.phone) {
      contacts.push(c);
    }
  }

  return contacts;
}

/* ═══════════════════════════════════════════
   CSV Parser
   ═══════════════════════════════════════════ */
function parseCSV(text: string): ParsedContact[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const contacts: ParsedContact[] = [];

  const findCol = (...names: string[]) =>
    headers.findIndex(h => names.some(n => h.includes(n)));

  const iFirst = findCol("first name", "first_name", "firstname", "given");
  const iLast = findCol("last name", "last_name", "lastname", "surname", "family");
  const iName = findCol("full name", "name", "display name");
  const iEmail = findCol("email", "e-mail", "mail");
  const iPhone = findCol("phone", "telephone", "tel", "mobile", "cell");
  const iCompany = findCol("company", "organization", "org");
  const iTitle = findCol("title", "job title", "position");
  const iNotes = findCol("note", "notes", "comment");

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const c: ParsedContact = {
      firstName: "", lastName: "", email: "", phone: "",
      company: "", title: "", notes: "",
    };
    if (iFirst >= 0) c.firstName = clean(cols[iFirst] || "");
    if (iLast >= 0) c.lastName = clean(cols[iLast] || "");
    if (iName >= 0 && !c.firstName && !c.lastName) {
      const parts = (cols[iName] || "").trim().split(/\s+/);
      c.firstName = parts[0] || "";
      c.lastName = parts.slice(1).join(" ") || "";
    }
    if (iEmail >= 0) c.email = clean(cols[iEmail] || "");
    if (iPhone >= 0) c.phone = clean(cols[iPhone] || "");
    if (iCompany >= 0) c.company = clean(cols[iCompany] || "");
    if (iTitle >= 0) c.title = clean(cols[iTitle] || "");
    if (iNotes >= 0) c.notes = clean(cols[iNotes] || "");

    if (c.firstName || c.lastName || c.email || c.phone) contacts.push(c);
  }
  return contacts;
}

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */
function unfoldLines(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(l => l.trim());
}

function extractValue(line: string): string {
  const i = line.indexOf(":");
  return i >= 0 ? line.slice(i + 1).trim() : "";
}

function clean(s: string): string {
  return s.replace(/^["']|["']$/g, "").replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
}

function parseCSVLine(line: string): string[] {
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
}

function checkDuplicates(contacts: ParsedContact[]): PreviewContact[] {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const existingEmails = new Map<string, number>();
    const existingPhones = new Map<string, number>();
    const existingNames = new Map<string, number>();

    const allLeads = db.prepare("SELECT id, email, phone, first_name, last_name FROM leads").all() as any[];
    for (const l of allLeads) {
      if (l.email) existingEmails.set(l.email.toLowerCase().trim(), l.id);
      if (l.phone) {
        const digits = l.phone.replace(/\D/g, "").slice(-10);
        if (digits.length >= 7) existingPhones.set(digits, l.id);
      }
      const nk = `${(l.first_name || "").toLowerCase().trim()}|${(l.last_name || "").toLowerCase().trim()}`;
      if (nk !== "|") existingNames.set(nk, l.id);
    }

    return contacts.map(c => {
      const p: PreviewContact = { ...c, isDuplicate: false };

      if (c.email) {
        const match = existingEmails.get(c.email.toLowerCase().trim());
        if (match) { p.isDuplicate = true; p.existingLeadId = match; p.duplicateReason = "Email match"; return p; }
      }
      if (c.phone) {
        const digits = c.phone.replace(/\D/g, "").slice(-10);
        if (digits.length >= 7) {
          const match = existingPhones.get(digits);
          if (match) { p.isDuplicate = true; p.existingLeadId = match; p.duplicateReason = "Phone match"; return p; }
        }
      }
      const nk = `${(c.firstName || "").toLowerCase().trim()}|${(c.lastName || "").toLowerCase().trim()}`;
      if (nk !== "|") {
        const match = existingNames.get(nk);
        if (match) { p.isDuplicate = true; p.existingLeadId = match; p.duplicateReason = "Name match"; return p; }
      }

      return p;
    });
  } finally {
    db.close();
  }
}
