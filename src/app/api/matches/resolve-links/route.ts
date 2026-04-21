import { NextRequest, NextResponse } from "next/server";
import { resolveListingLinks } from "@/lib/matches/resolve-links";
import Database from "better-sqlite3";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/matches/resolve-links
 *
 * Accepts either:
 *   { listing_id: number }                                          — loads listing from DB
 *   { listing_url, make, model, year, loa, asking_price, location } — inline fields
 *
 * Returns: ResolvedLinks — BW and Denison links with confidence labels.
 * Persists denison_url to parsed_listings if listing_id provided and url found.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      listing_id?: number;
      listing_url?: string;
      make?: string; model?: string; year?: string;
      loa?: string; asking_price?: string; location?: string;
    };

    let input = { ...body };

    // If listing_id given, load fields from DB
    if (body.listing_id) {
      const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
      const db = new Database(DB_PATH, { readonly: true });
      try {
        const row = db.prepare(
          `SELECT make, model, year, loa, asking_price, location, listing_url, denison_url
           FROM parsed_listings WHERE id = ?`
        ).get(body.listing_id) as any;
        if (!row) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

        // Short-circuit: denison_url already cached from a previous lookup
        if (row.denison_url) {
          return NextResponse.json({
            ok: true, cached: true,
            result: {
              vessel: { year: row.year, builder: row.make, model: row.model,
                        loa: row.loa, price: row.asking_price, location: row.location },
              boatwizard: { url: row.listing_url, confidence: "exact",
                            reason: "Direct PSP URL from alert email" },
              denison: { url: row.denison_url, confidence: "exact",
                         reason: "Previously resolved — cached result", bwId: null },
              resolvedAt: new Date().toISOString(),
            },
          });
        }
        input = { ...input, ...row };
      } finally { db.close(); }
    }

    const result = await resolveListingLinks(input);

    // Persist Denison URL back to DB if resolved and listing_id was provided
    if (body.listing_id && result.denison.url) {
      const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";
      const db = new Database(DB_PATH, { readonly: false });
      try {
        try { db.exec("ALTER TABLE parsed_listings ADD COLUMN denison_url TEXT DEFAULT ''"); } catch {}
        db.prepare("UPDATE parsed_listings SET denison_url = ? WHERE id = ?")
          .run(result.denison.url, body.listing_id);
      } finally { db.close(); }
    }

    return NextResponse.json({ ok: true, cached: false, result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message || "Internal error" }, { status: 500 });
  }
}
