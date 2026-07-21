// extract_batch1.js — Batch 1: profile the 50 most recent boat-conversation threads
// Resume-safe: skips anyone already extracted. Cumulative $100 spend cap.
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

try {
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && m[1] && m[2] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* fall through */ }
const KEY = process.env.ANTHROPIC_API_KEY;
if (KEY === undefined || KEY === "") { console.error("No ANTHROPIC_API_KEY — run from yotcrm-ui folder"); process.exit(1); }

const msg = new Database(os.homedir() + "/Library/Messages/chat.db", { readonly: true });
const crm = new Database("/Users/willnoftsinger/yotcrm-deploy/data/yotcrm.db");

crm.exec(`CREATE TABLE IF NOT EXISTS lead_text_extracts (
  id INTEGER PRIMARY KEY,
  handle_id TEXT UNIQUE, handle_rid INTEGER,
  display_name TEXT, matched_lead_id INTEGER,
  dossier TEXT,
  budget_min INTEGER, budget_max INTEGER, loa_min INTEGER, loa_max INTEGER,
  year_min INTEGER, year_max INTEGER, make_preference TEXT, vessel_type_pref TEXT,
  profile_confidence_json TEXT, temperature TEXT,
  is_prospect INTEGER, category_suggestion TEXT,
  msg_count INTEGER, last_msg_at TEXT,
  review_status TEXT DEFAULT 'pending',
  extracted_at TEXT DEFAULT (datetime('now'))
)`);

crm.exec(`CREATE TABLE IF NOT EXISTS extract_spend (id INTEGER PRIMARY KEY CHECK (id=1), total_usd REAL DEFAULT 0)`);
crm.prepare(`INSERT OR IGNORE INTO extract_spend (id, total_usd) VALUES (1, 0)`).run();
let spendTotal = crm.prepare(`SELECT total_usd FROM extract_spend WHERE id=1`).get().total_usd;
const BUDGET_CAP = 100;

const JUNK = /^(NSString|NSAttributedString|NSDictionary|NSNumber|NSObject|NSMutableString|NSMutableAttributedString|streamtyped|__kIM\w*|\+?[A-Za-z]{1,2})$/;
function decodeBlob(buf) {
  if (buf === null || buf === undefined) return "";
  const s = buf.toString("utf8");
  const runs = s.match(/[\x20-\x7E\u00A0-\uFFFF]{3,}/g) || [];
  const good = runs.filter(r => JUNK.test(r.trim()) === false && r.startsWith("bplist") === false);
  good.sort((a, b) => b.length - a.length);
  return (good[0] || "").slice(0, 600);
}
const toISO = d => d ? new Date(d / 1e6 + 978307200000).toISOString().slice(0, 10) : "";
const norm = p => String(p || "").replace(/[^0-9]/g, "").slice(-10);

const leadRows = crm.prepare(`SELECT id, first_name, last_name, phone, email FROM leads`).all();
const nameByPhone = new Map(), nameByEmail = new Map();
for (const l of leadRows) {
  const nm = ((l.first_name || "") + " " + (l.last_name || "")).trim();
  const rec = { id: l.id, name: nm };
  const pn = norm(l.phone);
  if (pn.length === 10 && nameByPhone.has(pn) === false) nameByPhone.set(pn, rec);
  const em = (l.email || "").toLowerCase();
  if (em.includes("@") && nameByEmail.has(em) === false) nameByEmail.set(em, rec);
}

const already = new Set(crm.prepare(`SELECT handle_id FROM lead_text_extracts`).all().map(r => r.handle_id));
const FIVE_YR_NS = (Date.now() / 1000 - 5 * 365 * 86400 - 978307200) * 1e9;
const handles = msg.prepare(`
  SELECT h.ROWID rid, h.id, MAX(m.date) last_msg, COUNT(m.ROWID) n,
         SUM(m.is_from_me) sent, SUM(1 - m.is_from_me) recvd
  FROM handle h JOIN message m ON m.handle_id = h.ROWID
  WHERE m.date > ?
  GROUP BY h.ROWID
  HAVING n >= 6 AND sent >= 2 AND recvd >= 2
  ORDER BY last_msg DESC`).all(FIVE_YR_NS);
console.log("Two-way threads in last 5 years: " + handles.length);

const BOAT_KW = ["boat", "yacht", "vessel", "sailboat", "motoryacht", "listing", "broker", "sea ray", "survey", "charter", "marina", "helm", "hull", "knots", "trawler", "catamaran", "flybridge", "stateroom", "sportfish", "hatteras", "viking", "azimut", "ferretti"];
const getSample = msg.prepare(`SELECT text, attributedBody FROM message WHERE handle_id=? AND date>? ORDER BY date DESC LIMIT 60`);
const getThread = msg.prepare(`SELECT text, attributedBody, is_from_me, date FROM message WHERE handle_id=? AND date>? ORDER BY date DESC LIMIT 200`);

const targets = [];
for (const h of handles) {
  if (already.has(h.id)) continue;
  if (targets.length >= 50) break;
  const sample = getSample.all(h.rid, FIVE_YR_NS)
    .map(m => ((m.text || "") + " " + decodeBlob(m.attributedBody)).toLowerCase()).join(" ");
  if (BOAT_KW.some(kw => sample.includes(kw))) targets.push(h);
}
console.log("Batch: " + targets.length + " boat-related threads to profile");

async function extract(name, transcript) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 900,
      messages: [{ role: "user", content:
"You are building a yacht broker's client file from his text thread with " + name + ". \"ME\" = the broker (Will). Return JSON only, no markdown:\n" +
'{"budget_min":int|null,"budget_max":int|null,"loa_min":int|null,"loa_max":int|null,"year_min":int|null,"year_max":int|null,\n' +
'"make_preference":str|null,"vessel_type_pref":str|null,"confidence":{"field":0-1},\n' +
'"dossier":"3-6 sentence broker brief: who they are, boats owned/discussed, what they want, budget signals, personal details, deal history, how to approach",\n' +
'"temperature":"hot"|"warm"|"cool"|"cold"|null,"is_prospect":true|false,\n' +
'"category":"active_buyer"|"seller"|"past_client"|"co_broker"|"vendor"|null}\n' +
'Rules: sizes in FEET (meters x3.28, "35M" means meters). Only criteria actually evidenced. is_prospect=false if not a boat-business relationship (family, friends, services).\n' +
"THREAD (oldest first):\n" + transcript.slice(0, 14000) }]
    })
  });
  if (res.ok === false) throw new Error("API " + res.status);
  const data = await res.json();
  const usage = data.usage || {};
  const cost = ((usage.input_tokens || 4000) * 3 + (usage.output_tokens || 400) * 15) / 1e6;
  const t = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0) throw new Error("no JSON");
  return { p: JSON.parse(t.slice(a, b + 1)), cost: cost };
}

const ins = crm.prepare(`INSERT INTO lead_text_extracts
  (handle_id, handle_rid, display_name, matched_lead_id, dossier,
   budget_min, budget_max, loa_min, loa_max, year_min, year_max,
   make_preference, vessel_type_pref, profile_confidence_json, temperature,
   is_prospect, category_suggestion, msg_count, last_msg_at)
  VALUES (@hid,@rid,@name,@lead,@dossier,@bmin,@bmax,@lmin,@lmax,@ymin,@ymax,@make,@vtype,@conf,@temp,@pros,@cat,@n,@last)
  ON CONFLICT(handle_id) DO UPDATE SET dossier=excluded.dossier, extracted_at=datetime('now')`);
const bumpSpend = crm.prepare(`UPDATE extract_spend SET total_usd = total_usd + ? WHERE id=1`);

(async () => {
  let ok = 0, nonProspect = 0, fail = 0;
  for (const h of targets) {
    if (spendTotal >= BUDGET_CAP) { console.log("\nBudget cap $" + BUDGET_CAP + " reached — stopping. Total: $" + spendTotal.toFixed(2)); break; }
    try {
      const match = nameByPhone.get(norm(h.id)) || nameByEmail.get((h.id || "").toLowerCase()) || null;
      const name = (match && match.name) || h.id;
      const rows = getThread.all(h.rid, FIVE_YR_NS);
      const lines = [];
      for (const r of rows.reverse()) {
        const txt = (r.text && r.text.trim()) || decodeBlob(r.attributedBody);
        if (txt.length < 2) continue;
        lines.push("[" + toISO(r.date) + "] " + (r.is_from_me ? "ME" : "THEM") + ": " + txt.slice(0, 250));
      }
      if (lines.length < 5) { fail++; continue; }
      const out = await extract(name, lines.join("\n"));
      const p = out.p;
      spendTotal += out.cost; bumpSpend.run(out.cost);
      ins.run({ hid: h.id, rid: h.rid, name: name, lead: match ? match.id : null,
        dossier: p.dossier || "", bmin: p.budget_min ?? null, bmax: p.budget_max ?? null,
        lmin: p.loa_min ?? null, lmax: p.loa_max ?? null, ymin: p.year_min ?? null, ymax: p.year_max ?? null,
        make: p.make_preference ?? null, vtype: p.vessel_type_pref ?? null,
        conf: JSON.stringify(p.confidence || {}), temp: p.temperature ?? null,
        pros: p.is_prospect === false ? 0 : 1, cat: p.category ?? null,
        n: rows.length, last: toISO(h.last_msg) });
      if (p.is_prospect === false) nonProspect++; else ok++;
      process.stdout.write(".");
      await new Promise(r => setTimeout(r, 250));
    } catch (e) { fail++; console.error("\n" + h.id + ": " + e.message); }
  }
  console.log("\nDone. prospects=" + ok + " nonProspects=" + nonProspect + " skipped=" + fail);
  console.log("Cumulative extraction spend: $" + spendTotal.toFixed(2) + " of $" + BUDGET_CAP + " cap");
  console.log("Total extracts in DB: " + crm.prepare("SELECT COUNT(*) n FROM lead_text_extracts").get().n);
  msg.close(); crm.close();
})();
