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


    const prompt = `You are a superyacht operations consultant producing a budget for a yacht broker to share with a prospective buyer. Analyze this vessel and return ONLY a valid JSON object — no markdown, no explanation, just raw JSON.

VESSEL:
${vesselSummary}
URL: ${url || v.url || ""}

SCENARIO DEFINITIONS — follow these exactly:
- LOW = lean private ownership: minimal cruising (400-600 hrs/year), home port in a cost-efficient location (Spain, Turkey, Florida municipal), smallest viable crew, deferred non-essential capex.
- MID = realistic private ownership: moderate use (700-1,000 hrs/year), mix of home port and seasonal cruising, properly staffed crew, routine maintenance on schedule, typical capex reserve. This is what a well-run private yacht actually costs — NOT a charter operation.
- HIGH = active/intensive ownership: heavy use (1,200-1,800 hrs/year), premium Med ports (Monaco, Antibes, Porto Cervo), full charter-ready crew and standards, aggressive capex.

CALIBRATION RULES — apply every figure against these:

CREW SALARIES — use the following annual ranges based on vessel LOA. Low scenario = low end, High = high end, Mid = midpoint. All figures USD annual.

Captain:
- 60–70 ft: $80,000–$100,000
- 71–90 ft: $90,000–$120,000
- 90 ft+: $1,200–$1,500 per foot of LOA (e.g. 100ft = $120k–$150k, 120ft = $144k–$180k, 150ft = $180k–$225k)
Cross-reference: 70–100ft $84–120k | 100–130ft $120–156k | 130–160ft $156–192k | 160–190ft $192–228k | 190ft+ $228k+

First Officer / Chief Mate:
- 70–100ft: $54,000–$66,000 | 100–130ft: $66,000–$78,000 | 130–160ft: $78,000–$90,000 | 160–190ft: $90,000–$95,000 | 190ft+: $102,000+

2nd Mate / Bosun:
- 70–100ft: $48,000–$54,000 | 100–130ft: $54,000–$60,000 | 130–160ft: $60,000–$66,000 | 160–190ft: $66,000–$72,000 | 190ft+: $66,000+

Deckhand:
- 70–100ft: $42,000–$48,000 | 100–130ft: $48,000–$54,000 | 130–160ft: $54,000–$60,000 | 160–190ft: $60,000–$66,000 | 190ft+: $60,000+

Chief Engineer / Solo Engineer:
- 70–100ft: $72,000–$84,000 | 100–130ft: $84,000–$96,000 | 130–160ft: $96,000–$120,000 | 160–190ft: $120,000–$144,000 | 190ft+: $144,000+

Assistant / Second Engineer:
- 70–100ft: $48,000–$60,000 | 100–130ft: $60,000–$66,000 | 130–160ft: $66,000–$72,000 | 160–190ft: $72,000–$84,000 | 190ft+: $84,000+

Culinary-Trained Chef:
- 70–100ft: $60,000–$72,000 | 100–130ft: $72,000–$84,000 | 130–160ft: $84,000–$96,000 | 160–190ft: $96,000–$108,000 | 190ft+: $108,000+

Chef / Cook:
- 70–100ft: $54,000–$60,000 | 100–130ft: $60,000–$66,000 | 130–160ft: $66,000–$72,000 | 160–190ft: $72,000–$84,000 | 190ft+: $84,000+

Chief Steward(ess) / Purser:
- 70–100ft: $54,000–$60,000 | 100–130ft: $60,000–$66,000 | 130–160ft: $66,000–$72,000 | 160–190ft: $72,000–$84,000 | 190ft+: $84,000+

Steward(ess) / Interior crew:
- 70–100ft: $42,000–$48,000 | 100–130ft: $48,000–$54,000 | 130–160ft: $54,000–$60,000 | 160–190ft: $60,000–$66,000 | 190ft+: $66,000+

Scale crew complement to vessel size: under 75ft typically 2–3 crew; 75–100ft = 3–5; 100–130ft = 4–7; 130–160ft = 6–10; 160ft+ = 10+. Only include roles that make sense for the vessel size.

- Fuel: displacement hulls burn LESS than planing hulls. Use realistic burn rates: under 30m = 40-80 L/hr; 30-45m = 80-150 L/hr; 45-60m = 120-220 L/hr; 60m+ = 200-350 L/hr. Mid scenario = moderate hours, not heavy use.
- Dockage: Mid = home port contract + occasional cruising. NOT a full premium Med season. For a Florida/US home port mid = $80-150/ft/year. Med home port mid = €120-200/ft/year.
- Insurance hull: base on replacement/insured value, NOT current asking price. Use approximately €1,500-€2,500/GT for replacement value on a quality build, then apply 1.0-1.25% mid / 1.5-1.75% high.
- Capital improvements: annualize realistically. Paint on a GRP hull every 5-7 years, steel every 3-5 years. Engineering reserves based on engine hours and age. Mid should NOT assume everything happens in year one.
- DO NOT use current asking/sale price as a basis for any calculation. A vessel's sale price reflects depreciation; operating costs do not depreciate with it.

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
  "assumptions": "1 sentence max: key assumptions for mid scenario",
  "rangeExplanation": "1 sentence max: what drives low vs high gap",
  "categoryBreakdown": "1 sentence max: top cost categories",
  "crewStructureNote": "1 sentence max: crew complement and mid salary total",
  "keyDrivers": "Top 3 cost drivers, one phrase each"
}`;


    const message = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8192,
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

    // Strip markdown fences then extract the outermost JSON object
    const stripped = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Find first { and last } to handle any prose before/after
    const jsonStart = stripped.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(`No JSON object found. Preview: ${stripped.slice(0, 200)}`);
    }
    const jsonEnd = stripped.lastIndexOf("}");
    // If no closing brace → response was truncated; take everything from jsonStart and repair below
    let cleaned = jsonEnd >= jsonStart ? stripped.slice(jsonStart, jsonEnd + 1) : stripped.slice(jsonStart);

    let modelData;
    try {
      modelData = JSON.parse(cleaned);
    } catch {
      // Attempt repair: truncated response — close any open string/object/array
      // Count unclosed braces and close them
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (esc) { esc = false; continue; }
        if (c === "\\" && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === "{" || c === "[") depth++;
          else if (c === "}" || c === "]") depth--;
        }
      }
      // If we're mid-string, close it first
      if (inStr) cleaned += '"';
      // Close any open objects/arrays
      while (depth > 0) { cleaned += "}"; depth--; }
      try {
        modelData = JSON.parse(cleaned);
      } catch (e2) {
        throw new Error(`JSON parse failed after repair attempt. Length: ${cleaned.length}. Last 200: ${cleaned.slice(-200)}`);
      }
    }

    return NextResponse.json({ ok: true, model: modelData });
  } catch (err) {
    console.error("Ownership model error:", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
