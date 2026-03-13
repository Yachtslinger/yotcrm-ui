import { NextResponse } from "next/server";
import { insertCardView } from "@/lib/cards/storage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { card_profile_id, broker_id } = body;

    if (!card_profile_id || !broker_id) {
      return NextResponse.json({ error: "card_profile_id and broker_id required" }, { status: 400 });
    }

    insertCardView({
      card_profile_id,
      broker_id,
      referrer: req.headers.get("referer") || undefined,
      user_agent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cards] POST /api/cards/views:", message);
    // Non-fatal — don't surface errors to the card page visitor
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
