/**
 * triage_leads.js — Phase 1b step 1: deterministic category triage. ADDITIVE.
 * Only sets category where evidence is unambiguous. Never overwrites an existing category.
 * Run: node scripts/triage_leads.js data/yotcrm.db
 */
const Database = require("better-sqlite3");
const db = new Database(process.argv[2] || "data/yotcrm.db");

const run = (label, sql) => {
  const n = db.prepare(sql).run().changes;
  console.log(`${label}: ${n}`);
  return n;
};

db.transaction(() => {
  // 1. Real inquiry sources → active buyers
  run("active_buyer (lead sources)", `
    UPDATE leads SET category='active_buyer'
    WHERE category IS NULL
      AND source IN ('YachtWorld','JamesEdition','Denison','digital_business_card')`);

  // 2. Denison colleagues → co_broker
  run("co_broker (Denison colleagues)", `
    UPDATE leads SET category='co_broker'
    WHERE category IS NULL AND source='apple_contacts'
      AND (email LIKE '%denisonyachting%' OR company LIKE '%Denison%')`);

  // 3. Industry contacts by company keywords → co_broker
  run("co_broker (industry companies)", `
    UPDATE leads SET category='co_broker'
    WHERE category IS NULL AND source='apple_contacts'
      AND (company LIKE '%yacht%' OR company LIKE '%brokerage%'
        OR company LIKE '%marine%' OR occupation LIKE '%yacht broker%')`);
})();

const summary = db.prepare(`SELECT COALESCE(category,'(uncategorized)') c, COUNT(*) n
  FROM leads GROUP BY c ORDER BY n DESC`).all();
console.log("\nFinal:", summary.map(r => `${r.c}=${r.n}`).join("  "));
db.close();
