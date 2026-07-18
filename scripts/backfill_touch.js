/**
 * backfill_touch.js — reconstruct last_contacted_at from local .eml archives.
 * Evidence: From/To addresses + Date headers across all YotCRM email folders.
 * Only ever moves last_contacted_at FORWARD (never overwrites newer with older).
 * Run: node scripts/backfill_touch.js /Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DIRS = [
  "/Users/willnoftsinger/YotCRM/inbox/processed_emails",
  "/Users/willnoftsinger/YotCRM/inbox/processed_emails/not_a_lead",
  "/Users/willnoftsinger/YotCRM/inbox/comms_processed",
  "/Users/willnoftsinger/YotCRM/inbox/comms_failed",
  "/Users/willnoftsinger/YotCRM/Data/raw_emails_imported",
  "/Users/willnoftsinger/YotCRM/processed",
  "/Users/willnoftsinger/YotCRM/processed/not_a_lead",
];
const OWN = ["denisonyachting.com", "theyotbot", "theyachtcache.com"]; // exclude self

const addrRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const touch = new Map(); // email(lower) -> ISO date string (max)

function noteTouch(addr, iso) {
  const a = addr.toLowerCase();
  if (OWN.some(d => a.includes(d))) return;
  const prev = touch.get(a);
  if (!prev || iso > prev) touch.set(a, iso);
}

let scanned = 0;
for (const dir of DIRS) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".eml")); } catch { continue; }
  for (const f of files) {
    let head = "";
    try { head = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 4000); } catch { continue; }
    const dateM = head.match(/^Date:\s*(.+)$/m);
    const d = dateM ? new Date(dateM[1]) : null;
    if (!d || isNaN(d.getTime())) continue;
    const iso = d.toISOString();
    const fromM = head.match(/^From:\s*(.+)$/m);
    const toM = head.match(/^To:\s*(.+)$/m);
    for (const line of [fromM?.[1], toM?.[1]]) {
      if (!line) continue;
      for (const a of line.match(addrRe) || []) noteTouch(a, iso);
    }
    scanned++;
  }
}
console.log(`Scanned ${scanned} emails → ${touch.size} unique external addresses with dates`);

const db = new Database(process.argv[2]);
const upd = db.prepare(`UPDATE leads SET last_contacted_at = @iso
  WHERE lower(email) = @addr
    AND (last_contacted_at IS NULL OR last_contacted_at = '' OR last_contacted_at < @iso)`);
let updated = 0;
db.transaction(() => {
  for (const [addr, iso] of touch) updated += upd.run({ addr, iso }).changes;
})();
console.log(`Updated last_contacted_at on ${updated} leads`);

const dist = db.prepare(`SELECT CASE
    WHEN last_contacted_at >= datetime('now','-7 days') THEN 'hot (7d)'
    WHEN last_contacted_at >= datetime('now','-30 days') THEN 'warm (30d)'
    WHEN last_contacted_at >= datetime('now','-90 days') THEN 'cool (90d)'
    WHEN last_contacted_at > '' THEN 'cold (90d+)'
    ELSE 'no evidence' END temp, COUNT(*) n
  FROM leads WHERE category='active_buyer' GROUP BY temp ORDER BY n DESC`).all();
console.log("Active buyer temperatures:", dist.map(r => `${r.temp}=${r.n}`).join("  "));
db.close();
