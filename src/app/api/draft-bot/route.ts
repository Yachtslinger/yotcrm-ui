import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { ensureLeadsSchema } from "@/lib/leads-schema";
import { scoreMatch, temperature, dedupeListings, makeWeights,
  type Buyer, type Listing } from "@/lib/match-scoring";

export const runtime = "nodejs";
export const maxDuration = 120;
const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
const MIN_SCORE = 70;
const MAX_DRAFTS_PER_RUN = 15;

async function writeEmail(buyer: Buyer, listing: Listing, reasons: string[]): Promise<string> {
  const boat = [listing.year, listing.make, listing.model].filter(Boolean).join(" ");
  const key = process.env.ANTHROPIC_API_KEY;
  let body = "";
  if (key) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400,
          messages: [{ role: "user", content:
`Write a short warm email (90-120 words) from yacht broker Will to client ${buyer.first_name} about a new listing that fits what they told him they want. Boat: ${boat}, ${listing.loa ? Math.round(listing.loa)+"ft" : ""}${listing.asking_price ? ", asking $"+(listing.asking_price/1e6).toFixed(2)+"M" : ""}${listing.location ? ", lying "+listing.location : ""}. Why it fits: ${reasons.join("; ")}. Tone: personal, confident, no hype, no exclamation marks. End by offering to send the full brochure or set up a viewing. Start with "Hi ${buyer.first_name}," and sign off "Will". Output ONLY the email body starting with Hi.` }] }),
      });
      if (res.ok) {
        const data = await res.json();
        body = data.content.filter((b: {type:string}) => b.type === "text").map((b: {text:string}) => b.text).join("").trim();
      }
    } catch {}
  }
  if (!body || !body.startsWith("Hi ")) {
    body = `Hi ${buyer.first_name},\n\nA ${boat} just came on the market and it lines up closely with what you described${reasons[0] ? ` — ${reasons[0].toLowerCase()}` : ""}. ${listing.location ? `She is lying in ${listing.location}. ` : ""}I think this one is worth a serious look before it gets attention.\n\nHappy to send over the full brochure or arrange a viewing whenever suits you.\n\nWill`;
  }
  return [
    `To: ${buyer.email}`,
    `Subject: ${boat} — this one fits your brief`,
    ``, body,
    listing.listing_url ? `\n🔗 Listing: ${listing.listing_url}` : ``,
  ].filter(Boolean).join("\n");
}

// POST /api/draft-bot — scan top matches, write outreach drafts into the Bot Queue.
// Doctrine: only APPROVED profiles, only buyers with emails, never twice for the
// same buyer+boat, capped per run. The bot writes; the broker sends.
export async function POST() {
  const db = new Database(DB_PATH);
  ensureLeadsSchema(db);
  try {
    const buyers = db.prepare(`SELECT id, first_name, last_name, email, profile_status,
        budget_min, budget_max, loa_min, loa_max, year_min, year_max, make_preference,
        vessel_type_pref, pinned_temperature, last_contacted_at
      FROM leads WHERE category='active_buyer' AND profile_status='approved'
        AND email IS NOT NULL AND email LIKE '%@%'`).all() as Buyer[];
    const listings = dedupeListings(db.prepare(`SELECT id, make, model, year, loa, asking_price,
        location, listing_url, vessel_type, created_at
      FROM parsed_listings WHERE created_at >= datetime('now','-45 days')
      ORDER BY created_at DESC`).all() as Listing[]);
    const weights = makeWeights(db);
    const acted = new Set((db.prepare(`SELECT parsed_listing_id||'-'||lead_id k
      FROM match_board_actions`).all() as {k:string}[]).map(r => r.k));
    const alreadyDrafted = new Set((db.prepare(`SELECT listing_id||'-'||lead_id k FROM todos
      WHERE queue='bot' AND todo_type='outreach' AND listing_id IS NOT NULL`).all() as {k:string}[]).map(r => r.k));

    const candidates: { b: Buyer; l: Listing; score: number; reasons: string[] }[] = [];
    for (const b of buyers) for (const l of listings) {
      if (acted.has(`${l.id}-${b.id}`) || alreadyDrafted.has(`${l.id}-${b.id}`)) continue;
      const { pts, reasons } = scoreMatch(b, l);
      const mult = l.make ? (weights.get(`${b.id}-${l.make.toLowerCase()}`) ?? 1) : 1;
      if (pts * mult >= MIN_SCORE) candidates.push({ b, l, score: Math.round(pts * mult), reasons });
    }
    candidates.sort((a, z) => z.score - a.score);
    const batch = candidates.slice(0, MAX_DRAFTS_PER_RUN);

    const insert = db.prepare(`INSERT INTO todos
      (text, completed, priority, lead_id, listing_id, created_at, queue, todo_type, bot_status, email_draft)
      VALUES (?, 0, ?, ?, ?, datetime('now'), 'bot', 'outreach', 'pending', ?)`);
    let drafted = 0;
    for (const c of batch) {
      const boat = [c.l.year, c.l.make, c.l.model].filter(Boolean).join(" ");
      const draft = await writeEmail(c.b, c.l, c.reasons);
      const temp = temperature(c.b);
      insert.run(`✉️ ${c.b.first_name} ${c.b.last_name} ← ${boat} (score ${c.score})`,
        temp === "hot" ? "high" : "normal", c.b.id, c.l.id, draft);
      drafted++;
    }
    return NextResponse.json({ ok: true, drafted,
      eligibleBuyers: buyers.length, candidatesAboveThreshold: candidates.length,
      note: buyers.length === 0 ? "No approved profiles yet — approve profiles at /profile-review to arm the bot." : undefined });
  } finally { db.close(); }
}
