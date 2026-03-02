import Database from "better-sqlite3";
import path from "path";
import { initIntelTables } from "@/lib/intel/storage";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Ensure enrichment profile columns exist on leads table
  const profileCols = [
    ["occupation", "TEXT DEFAULT ''"],
    ["employer", "TEXT DEFAULT ''"],
    ["city", "TEXT DEFAULT ''"],
    ["state", "TEXT DEFAULT ''"],
    ["zip", "TEXT DEFAULT ''"],
    ["linkedin_url", "TEXT DEFAULT ''"],
    ["facebook_url", "TEXT DEFAULT ''"],
    ["instagram_url", "TEXT DEFAULT ''"],
    ["twitter_url", "TEXT DEFAULT ''"],
    // Extended profile fields per intelligence spec
    ["net_worth_range", "TEXT DEFAULT ''"],
    ["net_worth_confidence", "TEXT DEFAULT ''"],
    ["board_positions", "TEXT DEFAULT ''"],
    ["yacht_clubs", "TEXT DEFAULT ''"],
    ["nonprofit_roles", "TEXT DEFAULT ''"],
    ["total_donations", "TEXT DEFAULT ''"],
    ["property_summary", "TEXT DEFAULT ''"],
    ["wikipedia_url", "TEXT DEFAULT ''"],
    ["website_url", "TEXT DEFAULT ''"],
    ["media_mentions", "INTEGER DEFAULT 0"],
    // Deep background fields
    ["estimated_net_worth", "TEXT DEFAULT ''"],
    ["net_worth_breakdown", "TEXT DEFAULT ''"],
    ["date_of_birth", "TEXT DEFAULT ''"],
    ["age", "TEXT DEFAULT ''"],
    ["spouse_name", "TEXT DEFAULT ''"],
    ["spouse_employer", "TEXT DEFAULT ''"],
    ["primary_address", "TEXT DEFAULT ''"],
    ["secondary_addresses", "TEXT DEFAULT '[]'"],
    ["identity_confidence", "INTEGER DEFAULT 0"],
    ["identity_verifications", "TEXT DEFAULT '[]'"],
    ["manual_corrections", "TEXT DEFAULT '[]'"],
  ];
  for (const [col, def] of profileCols) {
    try { db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${def}`); } catch { /* already exists */ }
  }
  return db;
}

// ─── Types ──────────────────────────────────────────────────────────

export type BoatRecord = {
  id: number;
  make: string;
  model: string;
  year: string;
  length: string;
  price: string;
  location: string;
  listing_url: string;
  source_email: string;
  added_at: string;
};

export type ContactRecord = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  tags: string[];
  notes: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
  boats: BoatRecord[];
};

export type Contact = ContactRecord & { id: string };

// Backward compat: flat boat fields for table view (uses first boat)
export type ContactFlat = Contact & {
  boat_make?: string;
  boat_model?: string;
  boat_year?: string;
  boat_length?: string;
  boat_price?: string;
  boat_location?: string;
  listing_url?: string;
  intel_score?: number | null;
  intel_band?: string | null;
  occupation?: string;
  employer?: string;
  city?: string;
  state?: string;
  zip?: string;
  linkedin_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  twitter_url?: string;
  net_worth_range?: string;
  net_worth_confidence?: string;
  board_positions?: string;
  yacht_clubs?: string;
  nonprofit_roles?: string;
  total_donations?: string;
  property_summary?: string;
  wikipedia_url?: string;
  website_url?: string;
  media_mentions?: number;
  // Deep background fields
  estimated_net_worth?: string;
  net_worth_breakdown?: string;
  date_of_birth?: string;
  age?: string;
  spouse_name?: string;
  spouse_employer?: string;
  primary_address?: string;
  secondary_addresses?: string;
  identity_confidence?: number;
  identity_verifications?: string;
  manual_corrections?: string;
};

const STATUS_TAGS = new Set(["hot", "warm", "cold", "other", "new", "nurture"]);

function normalizeTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((t) => t.trim()).filter(Boolean);
  return tags.split(";").map((t) => t.trim()).filter((t) => t.length > 0);
}

// ─── Read ───────────────────────────────────────────────────────────

export async function readContacts(): Promise<ContactFlat[]> {
  // Ensure enrichment tables exist so LEFT JOIN works reliably
  try { initIntelTables(); } catch { /* non-fatal — fallback below */ }

  const db = getDb();
  try {
    // Check if enrichment_profiles table exists for LEFT JOIN
    const hasIntel = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='enrichment_profiles'"
    ).get();

    const leads = hasIntel
      ? db.prepare(`
          SELECT l.*, ep.score AS intel_score, ep.score_band AS intel_band
          FROM leads l
          LEFT JOIN enrichment_profiles ep ON ep.lead_id = l.id
          ORDER BY l.updated_at DESC
        `).all() as any[]
      : db.prepare("SELECT * FROM leads ORDER BY updated_at DESC").all() as any[];

    const allBoats = db.prepare("SELECT * FROM boats ORDER BY added_at DESC").all() as any[];

    // Group boats by lead_id
    const boatsByLead = new Map<number, BoatRecord[]>();
    for (const b of allBoats) {
      const list = boatsByLead.get(b.lead_id) || [];
      list.push(b);
      boatsByLead.set(b.lead_id, list);
    }

    return leads.map((row): ContactFlat => {
      const boats = boatsByLead.get(row.id) || [];
      const firstBoat = boats[0];
      return {
        id: String(row.id),
        first_name: row.first_name || "",
        last_name: row.last_name || "",
        email: row.email || "",
        phone: row.phone || "",
        tags: normalizeTags(row.tags),
        notes: row.notes || "",
        source: row.source || "",
        status: row.status || "other",
        created_at: row.created_at || "",
        updated_at: row.updated_at || "",
        boats,
        // Flat fields for backward compat with table view
        boat_make: firstBoat?.make || "",
        boat_model: firstBoat?.model || "",
        boat_year: firstBoat?.year || "",
        boat_length: firstBoat?.length || "",
        boat_price: firstBoat?.price || "",
        boat_location: firstBoat?.location || "",
        listing_url: firstBoat?.listing_url || "",
        intel_score: row.intel_score ?? null,
        intel_band: row.intel_band ?? null,
        occupation: row.occupation || "",
        employer: row.employer || "",
        city: row.city || "",
        state: row.state || "",
        zip: row.zip || "",
        linkedin_url: row.linkedin_url || "",
        facebook_url: row.facebook_url || "",
        instagram_url: row.instagram_url || "",
        twitter_url: row.twitter_url || "",
        net_worth_range: row.net_worth_range || "",
        net_worth_confidence: row.net_worth_confidence || "",
        board_positions: row.board_positions || "",
        yacht_clubs: row.yacht_clubs || "",
        nonprofit_roles: row.nonprofit_roles || "",
        total_donations: row.total_donations || "",
        property_summary: row.property_summary || "",
        wikipedia_url: row.wikipedia_url || "",
        website_url: row.website_url || "",
        media_mentions: row.media_mentions || 0,
        estimated_net_worth: row.estimated_net_worth || "",
        net_worth_breakdown: row.net_worth_breakdown || "",
        date_of_birth: row.date_of_birth || "",
        age: row.age || "",
        spouse_name: row.spouse_name || "",
        spouse_employer: row.spouse_employer || "",
        primary_address: row.primary_address || "",
        secondary_addresses: row.secondary_addresses || "[]",
        identity_confidence: row.identity_confidence || 0,
        identity_verifications: row.identity_verifications || "[]",
        manual_corrections: row.manual_corrections || "[]",
      };
    });
  } finally {
    db.close();
  }
}

export async function readContact(id: string): Promise<ContactFlat | null> {
  try { initIntelTables(); } catch { /* non-fatal */ }

  const db = getDb();
  try {
    const hasIntel = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='enrichment_profiles'"
    ).get();

    const row = hasIntel
      ? db.prepare(`
          SELECT l.*, ep.score AS intel_score, ep.score_band AS intel_band
          FROM leads l
          LEFT JOIN enrichment_profiles ep ON ep.lead_id = l.id
          WHERE l.id = ?
        `).get(Number(id)) as any
      : db.prepare("SELECT * FROM leads WHERE id = ?").get(Number(id)) as any;
    if (!row) return null;
    const boats = db.prepare("SELECT * FROM boats WHERE lead_id = ? ORDER BY added_at DESC").all(row.id) as BoatRecord[];
    const firstBoat = boats[0];
    return {
      id: String(row.id),
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      email: row.email || "",
      phone: row.phone || "",
      tags: normalizeTags(row.tags),
      notes: row.notes || "",
      source: row.source || "",
      status: row.status || "other",
      created_at: row.created_at || "",
      updated_at: row.updated_at || "",
      boats,
      boat_make: firstBoat?.make || "",
      boat_model: firstBoat?.model || "",
      boat_year: firstBoat?.year || "",
      boat_length: firstBoat?.length || "",
      boat_price: firstBoat?.price || "",
      boat_location: firstBoat?.location || "",
      listing_url: firstBoat?.listing_url || "",
      intel_score: row.intel_score ?? null,
      intel_band: row.intel_band ?? null,
      occupation: row.occupation || "",
      employer: row.employer || "",
      city: row.city || "",
      state: row.state || "",
      zip: row.zip || "",
      linkedin_url: row.linkedin_url || "",
      facebook_url: row.facebook_url || "",
      instagram_url: row.instagram_url || "",
      twitter_url: row.twitter_url || "",
      net_worth_range: row.net_worth_range || "",
      net_worth_confidence: row.net_worth_confidence || "",
      board_positions: row.board_positions || "",
      yacht_clubs: row.yacht_clubs || "",
      nonprofit_roles: row.nonprofit_roles || "",
      total_donations: row.total_donations || "",
      property_summary: row.property_summary || "",
      wikipedia_url: row.wikipedia_url || "",
      website_url: row.website_url || "",
      media_mentions: row.media_mentions || 0,
      estimated_net_worth: row.estimated_net_worth || "",
      net_worth_breakdown: row.net_worth_breakdown || "",
      date_of_birth: row.date_of_birth || "",
      age: row.age || "",
      spouse_name: row.spouse_name || "",
      spouse_employer: row.spouse_employer || "",
      primary_address: row.primary_address || "",
      secondary_addresses: row.secondary_addresses || "[]",
      identity_confidence: row.identity_confidence || 0,
      identity_verifications: row.identity_verifications || "[]",
      manual_corrections: row.manual_corrections || "[]",
    };
  } finally {
    db.close();
  }
}

// ─── Write ──────────────────────────────────────────────────────────

export async function updateContact(id: string, updates: Partial<ContactRecord>): Promise<ContactFlat | null> {
  const db = getDb();
  try {
    const fields: string[] = [];
    const values: any[] = [];

    const allowedFields = [
      "first_name", "last_name", "email", "phone", "notes", "status", "source",
      "occupation", "employer", "city", "state", "zip",
      "linkedin_url", "facebook_url", "instagram_url", "twitter_url",
      "net_worth_range", "net_worth_confidence", "board_positions", "yacht_clubs",
      "nonprofit_roles", "total_donations", "property_summary", "wikipedia_url",
      "website_url", "media_mentions",
      "estimated_net_worth", "net_worth_breakdown", "date_of_birth", "age",
      "spouse_name", "spouse_employer", "primary_address", "secondary_addresses",
      "identity_confidence", "identity_verifications", "manual_corrections",
    ];
    for (const field of allowedFields) {
      if (field in updates && updates[field as keyof ContactRecord] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field as keyof ContactRecord]);
      }
    }

    if (updates.tags) {
      fields.push("tags = ?");
      values.push(Array.isArray(updates.tags) ? updates.tags.join(";") : updates.tags);
    }

    if (fields.length === 0) return readContact(id);

    fields.push("updated_at = datetime('now')");
    values.push(Number(id));

    db.prepare(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return readContact(id);
  } finally {
    db.close();
  }
}

export async function deleteContact(id: string): Promise<boolean> {
  const db = getDb();
  try {
    const numId = Number(id);
    db.prepare("DELETE FROM boats WHERE lead_id = ?").run(numId);
    const result = db.prepare("DELETE FROM leads WHERE id = ?").run(numId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export type CreateContactInput = {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
  source?: string;
  boat?: {
    make?: string;
    model?: string;
    year?: string;
    length?: string;
    price?: string;
    location?: string;
    listing_url?: string;
  };
};

export async function createContact(input: CreateContactInput): Promise<ContactFlat> {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO leads (first_name, last_name, email, phone, status, notes, source, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
    ).run(
      input.first_name || "",
      input.last_name || "",
      input.email || null,
      input.phone || "",
      input.status || "new",
      input.notes || "",
      input.source || "manual",
      now,
      now
    );

    const leadId = result.lastInsertRowid as number;

    if (input.boat && Object.values(input.boat).some(v => v)) {
      const b = input.boat;
      db.prepare(
        `INSERT INTO boats (lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)`
      ).run(leadId, b.make || "", b.model || "", b.year || "", b.length || "", b.price || "", b.location || "", b.listing_url || "", now);
    }

    const contact = await readContact(String(leadId));
    if (!contact) throw new Error("Failed to read created contact");
    return contact;
  } finally {
    db.close();
  }
}

export async function writeContacts(contacts: Contact[]): Promise<void> {
  // Legacy compat — not needed with SQLite but keep the interface
  // Individual updates should use updateContact instead
}

export function applyStatusTag(tags: string[], status?: string): string[] {
  if (!status) return tags;
  const normalizedStatus = status.trim().toLowerCase();
  if (!STATUS_TAGS.has(normalizedStatus)) return tags;
  const cleaned = tags.filter((t) => !STATUS_TAGS.has(t.toLowerCase()));
  cleaned.push(normalizedStatus);
  return cleaned;
}
