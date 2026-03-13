import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

// ─── DB Init ─────────────────────────────────────────────────────────────────

export function getDb() {
  const db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initCardTables(db);
  return db;
}

export function initCardTables(db: ReturnType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_profiles (
      id           TEXT PRIMARY KEY,
      broker_id    TEXT NOT NULL,
      profile_id   TEXT NOT NULL,
      label        TEXT NOT NULL,
      banner_url   TEXT,
      photo_url    TEXT,
      display_name TEXT,
      titles       TEXT DEFAULT '[]',
      companies    TEXT DEFAULT '[]',
      phone        TEXT,
      email        TEXT,
      website      TEXT,
      location     TEXT,
      bio          TEXT,
      accent_color TEXT DEFAULT '#0a2e5c',
      sort_order   INTEGER DEFAULT 0,
      is_active    INTEGER DEFAULT 1,
      created_at   TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_links (
      id               TEXT PRIMARY KEY,
      card_profile_id  TEXT NOT NULL REFERENCES card_profiles(id) ON DELETE CASCADE,
      type             TEXT NOT NULL,
      label            TEXT,
      value            TEXT,
      icon             TEXT,
      sort_order       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS card_socials (
      id               TEXT PRIMARY KEY,
      card_profile_id  TEXT NOT NULL REFERENCES card_profiles(id) ON DELETE CASCADE,
      type             TEXT NOT NULL,
      url              TEXT
    );

    CREATE TABLE IF NOT EXISTS card_leads (
      id               TEXT PRIMARY KEY,
      card_profile_id  TEXT,
      broker_id        TEXT,
      name             TEXT,
      email            TEXT,
      phone            TEXT,
      message          TEXT,
      source           TEXT DEFAULT 'digital_business_card',
      referrer         TEXT,
      user_agent       TEXT,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_views (
      id               TEXT PRIMARY KEY,
      card_profile_id  TEXT,
      broker_id        TEXT,
      viewed_at        TEXT DEFAULT (datetime('now')),
      referrer         TEXT,
      user_agent       TEXT
    );
  `);

  // Index for fast broker lookups
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_card_profiles_broker ON card_profiles(broker_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_card_leads_broker ON card_leads(broker_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_card_views_broker ON card_views(broker_id)`);
  } catch { /* already exists */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type CardProfile = {
  id: string;
  broker_id: string;
  profile_id: string;
  label: string;
  banner_url: string | null;
  photo_url: string | null;
  display_name: string | null;
  titles: string[];
  companies: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  bio: string | null;
  accent_color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  links?: CardLink[];
  socials?: CardSocial[];
};

export type CardLink = {
  id: string;
  card_profile_id: string;
  type: "phone" | "email" | "sms" | "url";
  label: string | null;
  value: string | null;
  icon: string | null;
  sort_order: number;
};

export type CardSocial = {
  id: string;
  card_profile_id: string;
  type: string;
  url: string | null;
};

export type CardLead = {
  id: string;
  card_profile_id: string | null;
  broker_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  referrer: string | null;
  user_agent: string | null;
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): CardProfile {
  return {
    ...row,
    titles:    JSON.parse((row.titles   as string) || "[]"),
    companies: JSON.parse((row.companies as string) || "[]"),
    is_active: row.is_active === 1,
  } as CardProfile;
}

// ─── Profile Queries ──────────────────────────────────────────────────────────

export function getProfilesByBroker(brokerId: string): CardProfile[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM card_profiles WHERE broker_id = ? AND is_active = 1 ORDER BY sort_order ASC"
  ).all(brokerId) as Record<string, unknown>[];
  return rows.map(rowToProfile);
}

export function getProfileWithLinks(brokerId: string, profileId: string): CardProfile | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM card_profiles WHERE broker_id = ? AND profile_id = ? AND is_active = 1"
  ).get(brokerId, profileId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const profile = rowToProfile(row);
  profile.links = db.prepare(
    "SELECT * FROM card_links WHERE card_profile_id = ? ORDER BY sort_order ASC"
  ).all(profile.id) as CardLink[];
  profile.socials = db.prepare(
    "SELECT * FROM card_socials WHERE card_profile_id = ? ORDER BY rowid ASC"
  ).all(profile.id) as CardSocial[];
  return profile;
}

export function updateProfile(brokerId: string, profileId: string, data: Partial<CardProfile>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  const allowed = ["label","banner_url","photo_url","display_name","titles","companies",
    "phone","email","website","location","bio","accent_color","sort_order","is_active"];

  for (const key of allowed) {
    if (key in data) {
      fields.push(`${key} = ?`);
      const val = (data as Record<string,unknown>)[key];
      values.push(Array.isArray(val) ? JSON.stringify(val) : val);
    }
  }
  if (!fields.length) return false;
  fields.push("updated_at = datetime('now')");
  values.push(brokerId, profileId);

  const result = db.prepare(
    `UPDATE card_profiles SET ${fields.join(", ")} WHERE broker_id = ? AND profile_id = ?`
  ).run(...values);
  return result.changes > 0;
}

// ─── Lead Submission ──────────────────────────────────────────────────────────

export function insertCardLead(lead: Omit<CardLead, "id" | "created_at">): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO card_leads (id, card_profile_id, broker_id, name, email, phone, message, source, referrer, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, lead.card_profile_id, lead.broker_id, lead.name, lead.email,
         lead.phone, lead.message, lead.source ?? "digital_business_card",
         lead.referrer, lead.user_agent);
  return id;
}

// ─── View Tracking ────────────────────────────────────────────────────────────

export function insertCardView(view: {
  card_profile_id: string; broker_id: string; referrer?: string; user_agent?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO card_views (id, card_profile_id, broker_id, referrer, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), view.card_profile_id, view.broker_id, view.referrer ?? null, view.user_agent ?? null);
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

export function seedDefaultProfiles(): void {
  const db = getDb();

  // Idempotent — skip if Will's profiles already exist
  const existing = db.prepare(
    "SELECT id FROM card_profiles WHERE broker_id = 'will' LIMIT 1"
  ).get();
  if (existing) return;

  const denisonId = randomUUID();
  const oceankingId = randomUUID();

  // ── Profile 1: Denison Yachting ──────────────────────────────────────────
  db.prepare(`
    INSERT INTO card_profiles
      (id, broker_id, profile_id, label, banner_url, photo_url, display_name, titles, companies,
       phone, email, website, location, bio, accent_color, sort_order)
    VALUES (?, 'will', 'denison', 'Denison Yachting',
      'https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/banners%2f42958226346-icon-1740629089220801866?alt=media',
      'https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/photos%2f42958226346-icon-1740663706841399017.jpg?alt=media',
      'Will Noftsinger',
      '["Yacht Broker","Oceanking Build Consultant of The Americas"]',
      '["Denison Yachting","YachtSlinger","Oceanking"]',
      '+18504613342', 'WN@DenisonYachting.com',
      'https://www.denisonyachtsales.com/2017/05/will-noftsinger-miami-florida-yacht-broker/',
      'Miami, FL',
      'Helping clients find and build their perfect yacht. Yacht broker at Denison Yachting and exclusive Oceanking Build Consultant for the Americas.',
      '#0a2e5c', 0)
  `).run(denisonId);

  // Denison links
  const denisonLinks = [
    { type: "phone", label: "Call Will",          value: "tel:+18504613342",                                                                            icon: "phone",   sort: 0 },
    { type: "email", label: "Email Will",          value: "mailto:WN@DenisonYachting.com",                                                               icon: "mail",    sort: 1 },
    { type: "sms",   label: "Text Will",           value: "sms:+18504613342",                                                                             icon: "message", sort: 2 },
    { type: "url",   label: "Denison Yachting",    value: "https://www.denisonyachtsales.com/2017/05/will-noftsinger-miami-florida-yacht-broker/",        icon: "anchor",  sort: 3 },
    { type: "url",   label: "Oceanking Yachts",    value: "https://www.oceankingyachts.com",                                                             icon: "anchor",  sort: 4 },
  ];
  for (const l of denisonLinks) {
    db.prepare(`INSERT INTO card_links (id, card_profile_id, type, label, value, icon, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), denisonId, l.type, l.label, l.value, l.icon, l.sort);
  }

  // Denison socials
  const denisonSocials = [
    { type: "instagram", url: "https://www.instagram.com/yachtslinger" },
  ];
  for (const s of denisonSocials) {
    db.prepare("INSERT INTO card_socials (id, card_profile_id, type, url) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), denisonId, s.type, s.url);
  }

  // ── Profile 2: Oceanking Yachts ──────────────────────────────────────────
  db.prepare(`
    INSERT INTO card_profiles
      (id, broker_id, profile_id, label, banner_url, photo_url, display_name, titles, companies,
       phone, email, website, location, bio, accent_color, sort_order)
    VALUES (?, 'will', 'oceanking', 'Oceanking Yachts',
      'https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/banners%2f42958226346-icon-1740662201585970770?alt=media',
      'https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/photos%2f42958226346-icon-1767708515437996180.jpg?alt=media',
      'Will Noftsinger',
      '["Oceanking Yachts Sales Consultant"]',
      '["Oceanking Yachts"]',
      '+18504613342', 'WN@DenisonYachting.com',
      'https://www.oceankingyachts.com',
      'Miami, FL',
      'Exclusive Oceanking Yachts Sales Consultant for the Americas — helping clients commission and acquire world-class custom builds.',
      '#1a3a4a', 1)
  `).run(oceankingId);

  // Oceanking links
  const oceankingLinks = [
    { type: "phone", label: "Call Will",        value: "tel:+18504613342",              icon: "phone",   sort: 0 },
    { type: "email", label: "Email Will",        value: "mailto:WN@DenisonYachting.com", icon: "mail",    sort: 1 },
    { type: "sms",   label: "Text Will",         value: "sms:+18504613342",              icon: "message", sort: 2 },
    { type: "url",   label: "Oceanking Yachts",  value: "https://www.oceankingyachts.com", icon: "anchor", sort: 3 },
  ];
  for (const l of oceankingLinks) {
    db.prepare(`INSERT INTO card_links (id, card_profile_id, type, label, value, icon, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), oceankingId, l.type, l.label, l.value, l.icon, l.sort);
  }

  // Oceanking socials
  const oceankingSocials = [
    { type: "instagram", url: "https://www.instagram.com/yachtslinger" },
  ];
  for (const s of oceankingSocials) {
    db.prepare("INSERT INTO card_socials (id, card_profile_id, type, url) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), oceankingId, s.type, s.url);
  }

  console.log("[cards] Seeded default profiles for broker: will");
}

// ── Paolo Ameglio ─────────────────────────────────────────────────────────────
export function seedPaoloProfiles(): void {
  const db = getDb();

  const existing = db.prepare(
    "SELECT id FROM card_profiles WHERE broker_id = 'paolo' LIMIT 1"
  ).get();
  if (existing) return;

  const denisonId = randomUUID();

  db.prepare(`
    INSERT INTO card_profiles
      (id, broker_id, profile_id, label, banner_url, photo_url, display_name, titles, companies,
       phone, email, website, location, bio, accent_color, sort_order)
    VALUES (?, 'paolo', 'denison', 'Denison Yachting',
      'https://firebasestorage.googleapis.com/v0/b/poplco.appspot.com/o/banners%2f42958226346-icon-1740629089220801866?alt=media',
      NULL,
      'Paolo Ameglio',
      '["Yacht Broker"]',
      '["Denison Yachting"]',
      '+17862512588', 'PGA@DenisonYachting.com',
      'https://www.denisonyachtsales.com',
      'Miami, FL',
      'Yacht broker at Denison Yachting, specializing in helping clients find the perfect vessel worldwide.',
      '#0a2e5c', 0)
  `).run(denisonId);

  const links = [
    { type: "phone", label: "Call Paolo",  value: "tel:+17862512588",              icon: "phone",   sort: 0 },
    { type: "email", label: "Email Paolo", value: "mailto:PGA@DenisonYachting.com", icon: "mail",    sort: 1 },
    { type: "sms",   label: "Text Paolo",  value: "sms:+17862512588",               icon: "message", sort: 2 },
    { type: "url",   label: "Denison Yachting", value: "https://www.denisonyachtsales.com", icon: "anchor", sort: 3 },
  ];
  for (const l of links) {
    db.prepare(`INSERT INTO card_links (id, card_profile_id, type, label, value, icon, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), denisonId, l.type, l.label, l.value, l.icon, l.sort);
  }

  console.log("[cards] Seeded default profiles for broker: paolo");
}
