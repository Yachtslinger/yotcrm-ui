import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Accepts pre-scraped vessel data directly — scraping is done by the client
    // in a separate call to /api/brochures/preview so each step fits in 60s.
    const { vessel, url } = await req.json();
    if (!vessel && !url) return NextResponse.json({ ok: false, error: "vessel data required" }, { status: 400 });

    const v = vessel || {};
    const vesselSummary = [
      `Name: ${v.name || "Unknown"}`,
      `Builder: ${v.builder || "Unknown"}`,
      `Year: ${v.year || "Unknown"}`,
      `LOA: ${v.loa || "Unknown"}`,
      `Engines: ${v.engines || "Unknown"}`,
      `Power: ${v.power || "Unknown"}`,
      `Fuel Tank: ${v.fuelTank || "Unknown"}`,
      `Guests: ${v.guests || "Unknown"}`,
      `Staterooms: ${v.staterooms || "Unknown"}`,
      `Crew: ${v.crew || "Unknown"}`,
      `Price: ${v.price || "Unknown"}`,
      `Location: ${v.location || "Unknown"}`,
      `Hull Material: ${v.hullMaterial || "Unknown"}`,
      `Description: ${(v.description || "").slice(0, 400)}`,
    ].join("\n");


    const prompt = `You are a superyacht operations consultant and financial analyst. Analyze this vessel and return ONLY a valid JSON object — no markdown, no explanation, just raw JSON.

VESSEL:
${vesselSummary}
URL: ${url || v.url || ""}

JSON structure (all numbers are annual USD amounts):
{
  "vesselName": "string",
  "vesselUrl": "string",
  "crew": {
    "salaries": { "low": 0, "mid": 0, "high": 0, "breakdown": [{"role":"Captain","low":0,"mid":0,"high":0},{"role":"First Mate / Engineer","low":0,"mid":0,"high":0},{"role":"Stewardess","low":0,"mid":0,"high":0},{"role":"Deckhand","low":0,"mid":0,"high":0}] },
    "recruitment": {"low":0,"mid":0,"high":0},
    "travel": {"low":0,"mid":0,"high":0},
    "accommodation": {"low":0,"mid":0,"high":0},
    "uniforms": {"low":0,"mid":0,"high":0},
    "training": {"low":0,"mid":0,"high":0},
    "foodBeverage": {"low":0,"mid":0,"high":0},
    "medical": {"low":0,"mid":0,"high":0},
    "dayWorkers": {"low":0,"mid":0,"high":0},
    "entertainment": {"low":0,"mid":0,"high":0}
  },
  "communications": {
    "phone": {"low":0,"mid":0,"high":0},
    "satTV": {"low":0,"mid":0,"high":0},
    "satcom": {"low":0,"mid":0,"high":0}
  },
  "operations": {
    "agency": {"low":0,"mid":0,"high":0},
    "audioVisual": {"low":0,"mid":0,"high":0},
    "auto": {"low":0,"mid":0,"high":0},
    "bridge": {"low":0,"mid":0,"high":0},
    "computer": {"low":0,"mid":0,"high":0},
    "deck": {"low":0,"mid":0,"high":0},
    "dockExpress": {"low":0,"mid":0,"high":0},
    "engineering": {"low":0,"mid":0,"high":0},
    "fuels": {"low":0,"mid":0,"high":0},
    "galley": {"low":0,"mid":0,"high":0},
    "interior": {"low":0,"mid":0,"high":0},
    "launches": {"low":0,"mid":0,"high":0},
    "mailFreight": {"low":0,"mid":0,"high":0},
    "office": {"low":0,"mid":0,"high":0},
    "dockage": {"low":0,"mid":0,"high":0},
    "safetyMedical": {"low":0,"mid":0,"high":0},
    "security": {"low":0,"mid":0,"high":0},
    "survey": {"low":0,"mid":0,"high":0},
    "warehousing": {"low":0,"mid":0,"high":0}
  },
  "insurance": {
    "hull": {"low":0,"mid":0,"high":0},
    "pi": {"low":0,"mid":0,"high":0},
    "crewHealth": {"low":0,"mid":0,"high":0}
  },
  "administrative": {
    "professionalFees": {"low":0,"mid":0,"high":0},
    "bankCharges": {"low":0,"mid":0,"high":0},
    "managementFee": {"low":0,"mid":0,"high":0},
    "managementTravel": {"low":0,"mid":0,"high":0}
  },
  "capital": {
    "av": {"low":0,"mid":0,"high":0},
    "engineeringDeck": {"low":0,"mid":0,"high":0},
    "interior": {"low":0,"mid":0,"high":0},
    "paint": {"low":0,"mid":0,"high":0},
    "tendersToys": {"low":0,"mid":0,"high":0},
    "other": {"low":0,"mid":0,"high":0}
  },
  "assumptions": "1-2 sentences on usage assumptions",
  "rangeExplanation": "1-2 sentences explaining the cost range",
  "categoryBreakdown": "2-3 sentences covering key cost categories",
  "crewStructureNote": "2-3 sentences: crew roles, total salary range, savings if one crew removed",
  "keyDrivers": "Top 3 cost drivers, one sentence each"
}

Rules: use real operational logic, fuel based on burn rate and hours, dockage based on region, insurance 1-1.75% of vessel value, all values realistic and defensible.`;


    const message = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!message.ok) {
      const errBody = await message.text().catch(() => "");
      throw new Error(`Anthropic API error ${message.status}: ${errBody.slice(0, 200)}`);
    }
    const messageData = await message.json() as { content?: { type: string; text?: string }[] };

    const text = messageData.content?.find(b => b.type === "text")?.text || "";
    if (!text) throw new Error("Anthropic returned no text content");
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let modelData;
    try {
      modelData = JSON.parse(cleaned);
    } catch {
      throw new Error(`JSON parse failed. Response length: ${cleaned.length}. Last 200 chars: ${cleaned.slice(-200)}`);
    }

    return NextResponse.json({ ok: true, model: modelData });
  } catch (err) {
    console.error("Ownership model error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
