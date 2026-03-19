import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 30;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400, headers: CORS });
    const prompt = bYou are a marine equipment expert. Extract structured fields from this yacht listing text.
Return ONLY raw JSON - no markdown fences, no explanation.
Omit fields not mentioned. Be specific with brands and models.
Example: "Garmin 9000 chartplotter" -> { "chartPlotter": "Garmin 9000" }

Fields to extract: navigation, radar, chartPlotter, autopilot, satcom, aisSystem, gensets, generatorKW, shorepower, airCon, airConMake, stabilisers, stabilisersMake, zeroSpeedStabilisers, bowThruster, sternThruster, propellers, gearbox, waterMaker, waterMakerCapacity, jacuzzi, tender, tenderCount, toys, garage, fireSuppression, lifeRafts, mobSystem, anchoring, windlass, engineHours, lastDrydock, lastSurvey, refitYear, refitDetails, hullMaterial, flagState, classification, grossTonnage, flybridge, beachClub, swimmingPlatform, gym, cinema

Listing text:
${text.slice(0, 4000)}`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error("API error: " + response.status);
    const data = await response.json();
    const raw = (data.content?.[0]?.text || "{}").replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const fields = JSON.parse(raw);
    return NextResponse.json({ ok: true, fields }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS });
  }
}
