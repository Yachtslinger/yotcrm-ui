import { NextRequest, NextResponse } from "next/server";
import { parseQuickAdd } from "@/lib/calendar/quickAdd";
import { getProspects, getVessels } from "@/lib/calendar/storage";

export const runtime = "nodejs";

/**
 * POST /api/calendar/quickadd
 * Body: { text: "..." }
 * Returns: parsed event data + fuzzy-matched prospect/vessel IDs
 */
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const parsed = parseQuickAdd(text);

    // Fuzzy match vessel hint against CRM boats
    let vessel_id: number | null = null;
    if (parsed.vessel_hint) {
      const vessels = getVessels();
      const hint = parsed.vessel_hint.toLowerCase();
      // Exact substring match first
      const exact = vessels.find(v =>
        v.name.toLowerCase().includes(hint) ||
        hint.includes(v.name.toLowerCase().trim())
      );
      if (exact) {
        vessel_id = exact.id;
      } else {
        // Word-level fuzzy: match any word from hint against vessel names
        const hintWords = hint.split(/\s+/).filter(w => w.length > 2);
        const fuzzy = vessels.find(v => {
          const vLower = v.name.toLowerCase();
          return hintWords.some(w => vLower.includes(w));
        });
        if (fuzzy) vessel_id = fuzzy.id;
      }
    }

    // Fuzzy match prospect hint against CRM leads
    let prospect_id: number | null = null;
    if (parsed.prospect_hint) {
      const prospects = getProspects();
      const hint = parsed.prospect_hint.toLowerCase();
      const match = prospects.find(p =>
        p.name.toLowerCase().includes(hint) ||
        hint.includes(p.name.toLowerCase().trim())
      );
      if (match) prospect_id = match.id;
    }

    return NextResponse.json({
      ok: true,
      parsed,
      vessel_id,
      prospect_id,
    });
  } catch (err: any) {
    console.error("[quickadd] Error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
