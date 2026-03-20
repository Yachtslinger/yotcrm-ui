/**
 * POST /api/brochures/generate-writeup
 * Accepts VesselData, sends full listing text + specs to Claude,
 * returns structured brochure copy + normalized spec fields.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let vessel: Record<string, unknown>;
  try { vessel = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

  // ── Spec summary ──────────────────────────────────────────────────────────
  const specLines: string[] = [];
  const add = (label: string, key: string) => {
    const val = vessel[key];
    if (val && String(val).trim()) specLines.push(`${label}: ${String(val).trim()}`);
  };
  add("Vessel Name", "name");         add("Builder", "builder");
  add("Year", "year");                add("LOA", "loa");
  add("Beam", "beam");                add("Draft", "draft");
  add("Displacement", "displacement"); add("Gross Tonnage", "grossTonnage");
  add("Hull Material", "hullMaterial"); add("Hull Form", "hullForm");
  add("Exterior Design", "exteriorDesign"); add("Interior Design", "interiorDesign");
  add("Naval Architect", "navalArchitect"); add("Classification", "classification");
  add("Nav Class", "navClass");       add("Flag State", "flagState");
  add("Location", "location");        add("Asking Price", "price");
  add("Main Engines", "engines");     add("Engine Hours", "engineHours");
  add("Power Output", "power");       add("Max Speed", "maxSpeed");
  add("Cruise Speed", "cruiseSpeed"); add("Range", "range");
  add("Gensets", "gensets");          add("Generator KW", "generatorKW");
  add("Stabilisers", "stabilisers");  add("Zero Speed Stabs", "zeroSpeedStabilisers");
  add("Bow Thruster", "bowThruster"); add("Stern Thruster", "sternThruster");
  add("Fuel Capacity", "fuelTank");   add("Fresh Water", "freshWater");
  add("Holding Tank", "holdingTank"); add("Grey Water", "greyWater");
  add("Staterooms", "staterooms");    add("Guests", "guests");
  add("Crew", "crew");                add("Crew Cabins", "crewCabins");
  add("Owner Cabin", "ownersCabin");
  add("Flybridge", "flybridge");      add("Beach Club", "beachClub");
  add("Jacuzzi", "jacuzzi");          add("Gym", "gym");
  add("Tender", "tender");            add("Water Toys", "toys");
  add("Navigation", "navigation");    add("Chart Plotter", "chartPlotter");
  add("Radar", "radar");              add("Autopilot", "autopilot");
  add("AIS", "aisSystem");            add("SATCOM", "satcom");
  add("Air Con", "airCon");           add("Water Maker", "waterMaker");
  add("Shore Power", "shorepower");   add("Refit Year", "refitYear");
  add("Refit Details", "refitDetails"); add("Fire Suppression", "fireSuppression");
  add("Life Rafts", "lifeRafts");

  // ── Raw listing content — pass full text up to 5000 chars ────────────────
  const rawDescription = String(vessel.description || "").slice(0, 5000);
  const rawFeatures = Array.isArray(vessel.features)
    ? (vessel.features as string[]).slice(0, 30).join("\n")
    : "";

  const prompt = `You are a senior yacht marketing copywriter for an elite brokerage. Your job is to:
1. Read the raw listing text and features list carefully — this is your PRIMARY source
2. Synthesize it into polished, original brochure copy in a formal luxury voice
3. Normalize and extract spec fields from the raw text where scraped values are missing

STRUCTURED SPECS:
${specLines.join("\n")}

RAW LISTING BODY TEXT (your primary source — synthesize this):
${rawDescription || "(none)"}

${rawFeatures ? `KEY FEATURES / HIGHLIGHTS:\n${rawFeatures}` : ""}

Return ONLY a raw JSON object — no markdown fences, no preamble, no explanation.

{
  "headline": "Punchy marketing headline max 12 words. Lead with the vessel name.",
  "customIntro": "2-3 sentences. The hook paragraph that appears beneath the hero image. Evocative, third-person. Capture what makes this vessel unique — her story, commission, character, or standout quality. Never generic.",
  "description": "4-6 paragraphs of polished brochure body copy. SYNTHESIZE the raw listing text — do not copy it verbatim. Cover: (1) vessel identity and design pedigree, (2) performance and range capability, (3) accommodation and interior experience, (4) deck layout and entertaining spaces, (5) technical specification highlights and condition. Formal luxury brokerage voice, third-person, no bullet points. Each paragraph should flow into the next.",
  "engines": "Clean engine string e.g. '2x Caterpillar C32 ACERT'. Extract from raw text if not in specs. Empty string if unknown.",
  "engineHours": "Engine hours as clean string e.g. 'Port: 1,819 hrs / Stbd: 1,824 hrs'. Extract from raw text. Empty string if unknown.",
  "navigation": "Full nav/electronics suite as comma-separated list. Extract makes and models from raw text. e.g. 'Furuno radar, Furuno AIS, Simrad autopilot, Furuno echosounder'. Empty string if unknown.",
  "chartPlotter": "Chart plotter make/model from raw text. Empty string if unknown.",
  "radar": "Radar make/model from raw text. Empty string if unknown.",
  "autopilot": "Autopilot make/model from raw text. Empty string if unknown.",
  "aisSystem": "AIS system from raw text. Empty string if unknown.",
  "satcom": "SATCOM/VSAT/comms systems e.g. 'Starlink x2, Inmarsat GMDSS'. Extract from raw text. Empty string if unknown.",
  "toys": "Water toys and watersports equipment as comma-separated list. Empty string if unknown.",
  "tender": "Tender make/model/size and garage details. e.g. 'Williams 565 Tender in hydraulic portside garage'. Empty string if unknown.",
  "notes": "Generator hours if found (e.g. 'Gen hours — Port: 3,068 / Stbd: 3,078'), plus any other standout notes: charter capability, special equipment, survey status, condition remarks. Empty string if none."
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
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Anthropic API error (${aiRes.status}): ${errText.slice(0, 200)}`);
    }

    const aiData = await aiRes.json() as { content?: { type: string; text?: string }[] };
    const raw = aiData.content?.find(b => b.type === "text")?.text || "";
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let writeup: Record<string, string>;
    try { writeup = JSON.parse(cleaned); }
    catch {
      return NextResponse.json({ ok: false, error: "Claude returned non-JSON output", raw }, { status: 500 });
    }

    return NextResponse.json({ ok: true, writeup });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
