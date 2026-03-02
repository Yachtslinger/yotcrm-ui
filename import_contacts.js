/**
 * Import Apple Contacts TSV into YotCRM
 * - Deduplicates by email, then by first+last name
 * - Skips contacts already in YotCRM
 * - Sets source = "apple_contacts"
 */
const Database = require("better-sqlite3");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || "/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db";
const TSV_PATH = "/Users/willnoftsinger/Desktop/contacts_export.tsv";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure columns exist
const cols = [
  ["occupation", "TEXT DEFAULT ''"],
  ["employer", "TEXT DEFAULT ''"],
  ["city", "TEXT DEFAULT ''"],
  ["state", "TEXT DEFAULT ''"],
  ["zip", "TEXT DEFAULT ''"],
  ["linkedin_url", "TEXT DEFAULT ''"],
  ["facebook_url", "TEXT DEFAULT ''"],
  ["instagram_url", "TEXT DEFAULT ''"],
  ["twitter_url", "TEXT DEFAULT ''"],
  ["net_worth_range", "TEXT DEFAULT ''"],
  ["board_positions", "TEXT DEFAULT ''"],
  ["yacht_clubs", "TEXT DEFAULT ''"],
  ["nonprofit_roles", "TEXT DEFAULT ''"],
  ["total_donations", "TEXT DEFAULT ''"],
  ["wikipedia_url", "TEXT DEFAULT ''"],
  ["website_url", "TEXT DEFAULT ''"],
  ["media_mentions", "INTEGER DEFAULT 0"],
];
for (const [col, def] of cols) {
  try { db.exec(`ALTER TABLE leads ADD COLUMN ${col} ${def}`); } catch {}
}

// Read TSV
const raw = fs.readFileSync(TSV_PATH, "utf8");
const lines = raw.split("\n").filter(l => l.trim());
const header = lines[0].split("\t");
console.log("Header:", header);
console.log("Total lines:", lines.length - 1);

// Parse contacts
const contacts = [];
const seenEmails = new Set();
const seenNames = new Set();

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split("\t");
  const first = (cols[0] || "").trim();
  const last = (cols[1] || "").trim();
  const email = (cols[2] || "").trim().toLowerCase();
  const phone = (cols[3] || "").trim();
  const company = (cols[4] || "").trim();
  const jobTitle = (cols[5] || "").trim();

  // Skip completely empty
  if (!first && !last && !email) continue;

  // Deduplicate by email first
  if (email && seenEmails.has(email)) continue;
  if (email) seenEmails.add(email);

  // Deduplicate by name if no email
  const nameKey = `${first.toLowerCase()}|${last.toLowerCase()}`;
  if (!email && seenNames.has(nameKey)) continue;
  seenNames.add(nameKey);

  contacts.push({ first, last, email, phone, company, jobTitle });
}

console.log("Unique contacts after dedup:", contacts.length);

// Get existing leads for duplicate detection
const existingEmails = new Set();
const existingNames = new Set();
const existing = db.prepare("SELECT first_name, last_name, email FROM leads").all();
for (const r of existing) {
  if (r.email) existingEmails.add(r.email.toLowerCase().trim());
  const nk = `${(r.first_name || "").toLowerCase()}|${(r.last_name || "").toLowerCase()}`;
  existingNames.add(nk);
}
console.log("Existing leads:", existing.length);

// Filter out duplicates against existing DB
const toInsert = contacts.filter(c => {
  if (c.email && existingEmails.has(c.email)) return false;
  const nk = `${c.first.toLowerCase()}|${c.last.toLowerCase()}`;
  if (!c.email && existingNames.has(nk)) return false;
  return true;
});

console.log("New contacts to insert:", toInsert.length);
console.log("Skipped (already in DB):", contacts.length - toInsert.length);

const hasCompany = (() => {
  try { db.prepare("SELECT company FROM leads LIMIT 1").get(); return true; }
  catch { return false; }
})();

if (!hasCompany) {
  try { db.exec("ALTER TABLE leads ADD COLUMN company TEXT DEFAULT ''"); } catch {}
}

const insert = db.prepare(`
  INSERT INTO leads (first_name, last_name, email, phone, company, source, status, notes, tags, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'apple_contacts', 'new', '', '', datetime('now'), datetime('now'))
`);

const tx = db.transaction(() => {
  let inserted = 0;
  for (const c of toInsert) {
    try {
      insert.run(c.first, c.last, c.email, c.phone, c.company);
      inserted++;
    } catch (err) {
      // Skip on any constraint violation
    }
  }
  return inserted;
});

const inserted = tx();
console.log(`\n✅ Imported ${inserted} contacts into YotCRM`);
console.log(`Total leads now: ${db.prepare("SELECT COUNT(*) as c FROM leads").get().c}`);

db.close();
