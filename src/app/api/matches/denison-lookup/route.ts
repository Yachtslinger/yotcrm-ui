import { NextRequest, NextResponse } from "next/server";
import { lookupDenisonUrl } from "@/lib/matches/denison-lookup";
import Database from "better-sqlite3";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * POST /api/matches/denison-lookup
 *
 * Body: { listing_url?, make?, model?, year?, loa?, listing_id? }
 *
 * If listing_id is provided and we find a URL, it is persisted back to
 * parsed_listings.denison_url so subsequent calls return instantly.
 *
 * Returns: { ok, url, method, verified, bwId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      listing_url?: string;
      make?: string;
      model?: string;
      year?: string;
      loa?: string;
      listing_id?: number;
    };

    const result = await lookupDenisonUrl({
      listing_url: body.listing_url,
      make:  body.make,
      model: body.model,
      year:  body.year,
      loa:   body.loa,
    });

    // Persist back so the next call is a DB hit, not another HEAD check
    if (body.listing_id && result.url) {
      const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
      const db = new Database(DB_PATH, { readonly: false });
      try {
        try { db.exec("ALTER TABLE parsed_listings ADD COLUMN denison_url TEXT DEFAULT ''"); } catch {}
        db.prepare("UPDATE parsed_listings SET denison_url = ? WHERE id = ?")
          .run(result.url, body.listing_id);
      } finally { db.close(); }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
