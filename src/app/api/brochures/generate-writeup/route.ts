/**
 * POST /api/brochures/generate-writeup
 * Accepts a VesselData object (raw scrape output), sends it to Claude,
 * and returns structured writeup JSON:
 *   - headline: marketing headline
 *   - customIntro: brochure intro paragraph (below hero)
 *   - description: full brochure body copy
 *   - engines: normalized engine string
 *   - engineHours: normalized hours string
 *   - navigation: normalized nav/electronics string
 *   - chartPlotter: chart plotter details
 *   - radar: radar details
 *   - autopilot: autopilot details
 *   - aisSystem: AIS details
 *   - satcom: SATCOM/VSAT details
 *   - toys: water toys summary
 *   - tender: tender/garage details
 *   - notes: any additional remarks extracted
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let vessel: Record<string, unknown>;
  try {
    vessel = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  // Build a concise spec summary to send to Claude
  const specLines: string[] = [];
  const add = (label: string, key: string) => {
    const val = vessel[key];
    if (val && String(val).trim()) specLines.push(`${label}: ${String(val).trim()}`);
  };

  add("Vessel Name", "name");
  add("Builder", "builder");
  add("Year", "year");
  add("LOA", "loa");
  add("Beam", "beam");
  add("Draft", "draft");
  add("Location", "location");
  add("Asking Price", "price");
  add("Gross Tonnage", "grossTonnage");
  add("Displacement", "displacement");
  add("Hull Material", "hullMaterial");
  add("Exterior Design", "exteriorDesign");
  add("Interior Design", "interiorDesign");
  add("Naval Architect", "navalArchitect");
  add("Main Engines", "engines");
  add("Engine Hours", "engineHours");
  add("Power Output", "power");
  add("Max Speed", "maxSpeed");
  add("Cruise Speed", "cruiseSpeed");
  add("Range", "range");
  add("Gensets", "gensets");
  add("Stabilisers", "stabilisers");
  add("Fuel Capacity", "fuelTank");
  add("Fresh Water", "freshWater");
  add("Staterooms", "staterooms");
  add("Guests", "guests");
  add("Crew", "crew");
  add("Flybridge", "flybridge");
  add("Beach Club", "beachClub");
  add("Jacuzzi", "jacuzzi");
  add("Tender / Garage", "tender");
  add("Water Toys", "toys");
  add("Navigation Systems", "navigation");
  add("Chart Plotter", "chartPlotter");
  add("Radar", "radar");
  add("Autopilot", "autopilot");
  add("AIS", "aisSystem");
  add("SATCOM / VSAT", "satcom");
  add("Air Conditioning", "airCon");
  add("Water Maker", "waterMaker");
  add("Refit Year", "refitYear");
  add("Refit Details", "refitDetails");
  add("Classification", "classification");
  add("Flag State", "flagState");

  // Include raw description / features so Claude can mine them
  const rawDescription = String(vessel.description || "").slice(0, 2000);
  const rawFeatures = Array.isArray(vessel.features)
    ? (vessel.features as string[]).join("\n")
    : "";

  const prompt = `You are a luxury yacht marketing specialist writing for an elite brokerage.
Given the vessel data below, produce a JSON object (and ONLY JSON — no markdown fences, no preamble).

VESSEL DATA:
${specLines.join("\n")}${rawDescription ? `\n\nRAW LISTING DESCRIPTION:\n${rawDescription}` : ""}${rawFeatures ? `\n\nFEATURES / EQUIPMENT LIST:\n${rawFeatures}` : ""}

Return a JSON object with exactly these keys:
{
  "headline": "Short punchy marketing headline (max 12 words)",
  "customIntro": "2-3 sentence intro paragraph for below the hero image. Evocative, third-person, luxury tone.",
  "description": "Full brochure body copy. 3-5 paragraphs covering: vessel character/design, performance, accommodation, onboard experience, ideal use. Formal, third-person, luxury brokerage voice. No bullet points.",
  "engines": "Normalized engine string extracted or inferred from the data (e.g. '2x MTU 16V 2000 M96'). Empty string if unknown.",
  "engineHours": "Engine hours as a clean string (e.g. '1,200 hrs (2023)'). Empty string if unknown.",
  "navigation": "Full navigation/electronics suite as a comma-separated list extracted from the raw data. Empty string if unknown.",
  "chartPlotter": "Chart plotter make/model if identifiable. Empty string if unknown.",
  "radar": "Radar make/model if identifiable. Empty string if unknown.",
  "autopilot": "Autopilot make/model if identifiable. Empty string if unknown.",
  "aisSystem": "AIS system if identifiable. Empty string if unknown.",
  "satcom": "SATCOM/VSAT system if identifiable. Empty string if unknown.",
  "toys": "Water toys summary as a clean comma-separated list. Empty string if unknown.",
  "tender": "Tender and garage details. Empty string if unknown.",
  "notes": "Any additional remarks, condition notes, or standout features not covered above. Empty string if none."
}`;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Anthropic API error (${aiRes.status}): ${errText.slice(0, 200)}`);
    }

    const aiData = await aiRes.json() as {
      content?: { type: string; text?: string }[];
    };

    const raw = aiData.content?.find(b => b.type === "text")?.text || "";
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let writeup: Record<string, string>;
    try {
      writeup = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Claude returned non-JSON output", raw },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, writeup });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
