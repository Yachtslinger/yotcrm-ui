import { NextResponse } from "next/server";
import { getProfileWithLinks, updateProfile, seedDefaultProfiles } from "@/lib/cards/storage";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ brokerId: string; profileId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { brokerId, profileId } = await params;
    if (brokerId === "will") seedDefaultProfiles();

    const profile = getProfileWithLinks(brokerId, profileId);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({ profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cards] GET profile:", message);
    return NextResponse.json({ error: "Failed to load profile", detail: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { brokerId, profileId } = await params;
    const body = await req.json();

    const updated = updateProfile(brokerId, profileId, body);
    if (!updated) {
      return NextResponse.json({ error: "Profile not found or no changes" }, { status: 404 });
    }

    const profile = getProfileWithLinks(brokerId, profileId);
    return NextResponse.json({ profile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cards] PUT profile:", message);
    return NextResponse.json({ error: "Failed to update profile", detail: message }, { status: 500 });
  }
}
