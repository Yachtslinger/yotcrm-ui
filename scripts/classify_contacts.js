/**
 * classify_contacts.js — AI pre-sort of uncategorized contacts (batches of 25).
 * Writes SUGGESTIONS ONLY (suggested_category, prospect_score, suggest_reason).
 * Never sets category — that's the broker's one-tap call in /contact-triage.
 * Run: node scripts/classify_contacts.js /Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db
 * Cost: ~120 Sonnet calls ≈ $3-4. Resumable (skips rows already scored).
 */
const fs = require("fs");
const Database = require("better-sqlite3");
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("no ANTHROPIC_API_KEY"); process.exit(1); }

const db = new Database(process.argv[2]);
const rows = db.prepare(`SELECT id, first_name, last_name, email, company, notes, source, tags
  FROM leads WHERE category IS NULL AND suggested_category IS NULL`).all();
console.log(`${rows.length} contacts to classify`);

const PROMPT = (lines) => `You classify a yacht broker's address-book contacts. For each line (id|name|email|company|notes) return a JSON array only:
[{"id":int,"cat":"active_buyer"|"owner_seller"|"past_client"|"co_broker"|"vendor"|"personal"|null,"score":0-100,"why":"<8 words"}]
score = likelihood this person is a real yacht sales PROSPECT (buyer or seller) worth the broker's review.
Signals for high score: yacht/boat mentions in notes, boat names, marina/slip refs, wealth signals, inquiry language. Company in yachting industry -> co_broker or vendor, low score. Family/personal (shared surname, no company) -> personal, score 0-5. Unknown -> null with low-mid score. Be decisive; err toward higher score when boat-interest evidence exists.
CONTACTS:
${lines}`;

async function callAPI(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 2500,
      messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("no JSON array");
  return JSON.parse(text.slice(s, e + 1));
}

const save = db.prepare(`UPDATE leads SET suggested_category=@cat, prospect_score=@score, suggest_reason=@why
  WHERE id=@id AND category IS NULL`);
const clean = (v) => String(v ?? "").replace(/[|\n\r]+/g, " ").slice(0, 90);

(async () => {
  let done = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const lines = batch.map(r =>
      `${r.id}|${clean(r.first_name + " " + r.last_name)}|${clean(r.email)}|${clean(r.company)}|${clean(r.notes)}`).join("\n");
    try {
      const out = await callAPI(PROMPT(lines));
      const ids = new Set(batch.map(b => b.id));
      db.transaction(() => {
        for (const o of out) {
          if (!ids.has(o.id)) continue; // never trust IDs the model invented
          save.run({ id: o.id, cat: o.cat || null, score: Math.max(0, Math.min(100, +o.score || 0)), why: clean(o.why) });
          done++;
        }
      })();
      process.stdout.write(".");
      await new Promise(r => setTimeout(r, 250));
    } catch (e) { failed += batch.length; console.error(`\nbatch@${i}: ${e.message}`); }
  }
  console.log(`\nDone. scored=${done} failed=${failed}`);
  const top = db.prepare(`SELECT first_name||' '||last_name||' ('||prospect_score||'): '||suggest_reason t
    FROM leads WHERE category IS NULL ORDER BY prospect_score DESC LIMIT 5`).all();
  top.forEach(r => console.log("  " + r.t));
  db.close();
})();
