/**
 * extract_profiles.js — Phase 1b step 2: AI draft of buyer search profiles.
 * Reads inquiry notes for active_buyer leads → drafts criteria → profile_status='draft'.
 * NEVER overwrites approved profiles. Writes confidence + source ref per field.
 * Run:  node scripts/extract_profiles.js data/yotcrm.db --dry   (preview, no API, no writes)
 *       node scripts/extract_profiles.js data/yotcrm.db         (live)
 * Model: claude-sonnet-4-6 (per routing policy). ~87 calls expected, ≈ $1.
 */
const Database = require("better-sqlite3");
const fs = require("fs");
try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const DRY = process.argv.includes("--dry");
const KEY = process.env.ANTHROPIC_API_KEY;
if (!DRY && !KEY) { console.error("ANTHROPIC_API_KEY missing in .env.local"); process.exit(1); }

const db = new Database(process.argv[2] || "data/yotcrm.db");
const buyers = db.prepare(`
  SELECT id, first_name, last_name, notes FROM leads
  WHERE category='active_buyer' AND profile_status='none'
    AND length(COALESCE(notes,'')) > 20`).all();
console.log(`${buyers.length} buyers with extractable notes. Mode: ${DRY ? "DRY" : "LIVE"}`);

const PROMPT = (notes) => `From this yacht purchase inquiry, extract search criteria as JSON only, no prose:
{"budget_min":int|null,"budget_max":int|null,"loa_min":int|null,"loa_max":int|null,
"year_min":int|null,"year_max":int|null,"make_preference":str|null,"vessel_type_pref":str|null,
"confidence":{"field":0.0-1.0}}
Rules: If they inquired about ONE specific boat, infer bands: LOA ±20%, year -10/+5.
CRITICAL: sizes may be in meters — "35M", "35m", or European listings mean METERS; convert to feet (×3.28) before banding. All output LOA values must be in feet.
Only include budget if stated or the boat's price is stated; then band ±30%. Null when unknown.
Inquiry: ${notes.slice(0, 1500)}`;

async function extract(notes) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400,
      messages: [{ role: "user", content: PROMPT(notes) }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in response");
  return JSON.parse(text.slice(start, end + 1));
}

const save = db.prepare(`UPDATE leads SET
  budget_min=COALESCE(@budget_min,budget_min), budget_max=COALESCE(@budget_max,budget_max),
  loa_min=COALESCE(@loa_min,loa_min), loa_max=COALESCE(@loa_max,loa_max),
  year_min=COALESCE(@year_min,year_min), year_max=COALESCE(@year_max,year_max),
  make_preference=COALESCE(@make_preference,make_preference),
  vessel_type_pref=COALESCE(@vessel_type_pref,vessel_type_pref),
  profile_status='draft', profile_confidence_json=@conf, profile_source_ref='notes:inquiry'
  WHERE id=@id AND profile_status='none'`);

(async () => {
  let ok = 0, fail = 0;
  for (const b of buyers) {
    if (DRY) { console.log(`[dry] #${b.id} ${b.first_name} ${b.last_name}: ${b.notes.slice(0, 70)}...`); continue; }
    try {
      const p = await extract(b.notes);
      save.run({ id: b.id, budget_min: p.budget_min, budget_max: p.budget_max,
        loa_min: p.loa_min, loa_max: p.loa_max, year_min: p.year_min, year_max: p.year_max,
        make_preference: p.make_preference, vessel_type_pref: p.vessel_type_pref,
        conf: JSON.stringify(p.confidence || {}) });
      ok++; process.stdout.write(".");
      await new Promise(r => setTimeout(r, 300)); // gentle rate
    } catch (e) { fail++; console.error(`\n#${b.id} failed: ${e.message}`); }
  }
  if (!DRY) console.log(`\nDone. drafted=${ok} failed=${fail}`);
  db.close();
})();
