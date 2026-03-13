import { NextResponse } from "next/server";
import { getProfilesByBroker, seedDefaultProfiles } from "@/lib/cards/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brokerId: string }> }
) {
  try {
    const { brokerId } = await params;
    // Auto-seed Will's profiles on first access
    if (brokerId === "will") seedDefaultProfiles();

    const profiles = getProfilesByBroker(brokerId);
    if (!profiles.length) {
      return NextResponse.json({ error: "No profiles found" }, { status: 404 });
    }
    return NextResponse.json({ profiles });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cards] GET /api/cards/[brokerId]:", message);
    return NextResponse.json({ error: "Failed to load profiles", detail: message }, { status: 500 });
  }
}
