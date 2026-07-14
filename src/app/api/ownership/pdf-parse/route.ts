import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const EXTRACT_PROMPT = `Extract all vessel specification data from this yacht brochure or specification sheet.

Return ONLY a JSON object with these fields (empty string "" for any field not found):
{
  "name": "vessel name as shown",
  "builder": "shipyard / builder name",
  "year": <number or null>,
  "loa": "length overall e.g. '30.5m' or '100ft'",
  "beam": "beam e.g. '7.2m'",
  "draft": "draft e.g. '2.1m'",
  "displacement": "displacement if stated e.g. '185 tonnes'",
  "hullForm": "displacement / semi-displacement / planing / expedition",
  "hullMaterial": "e.g. 'steel hull, aluminium superstructure' or 'GRP'",
  "engines": "full description e.g. '2 x CAT C18 ACERT, 650 hp each'",
  "power": "total power e.g. '1,300 hp' or '969 kW'",
  "engineMake": "manufacturer only e.g. 'CAT' or 'MTU'",
  "engineModel": "model only e.g. 'C18' or '12V 4000'",
  "engineCount": "number of engines as string e.g. '2'",
  "gensets": "generator description e.g. '2 x 55 kW Northern Lights'",
  "generatorKW": "total generator kW if stated e.g. '110'",
  "cruiseSpeed": "cruise speed e.g. '10 knots'",
  "maxSpeed": "max speed e.g. '14 knots'",
  "range": "range e.g. '3,000 nm at 10 knots'",
  "fuelTank": "fuel capacity e.g. '20,000 litres' or '5,000 gallons'",
  "fuelConsumption": "fuel burn if explicitly stated e.g. '38 GPH' or '144 L/hr'",
  "grossTonnage": "GT if stated e.g. '280 GT'",
  "classification": "class society e.g. 'Lloyd\\'s' or 'MCA Compliant'",
  "flagState": "flag state e.g. 'Cayman Islands'",
  "guests": "max guests e.g. '12'",
  "staterooms": "guest staterooms e.g. '6'",
  "crew": "crew complement e.g. '8'",
  "crewCabins": "crew cabins e.g. '4'",
  "stabilisers": "e.g. 'Quantum zero-speed' or 'Naiad active fin'",
  "airCon": "AC system if stated",
  "waterMaker": "watermaker capacity if stated",
  "navigation": "nav system highlights if stated",
  "tender": "tender / garage description",
  "location": "current location if stated",
  "price": "asking price if stated",
  "refitYear": "most recent refit year if stated",
  "refitDetails": "refit scope / details if stated",
  "engineHours": "engine hours if stated",
  "lastDrydock": "last haul-out / drydock if stated",
  "description": "2-3 sentence summary of what makes this vessel notable"
}

No preamble, no markdown fences — output ONLY the JSON object.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File | null;

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ ok: false, error: "A PDF file is required" }, { status: 400 });
    }
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "PDF must be under 30 MB" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      signal: AbortSignal.timeout(50000),
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        }],
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`Claude API ${aiRes.status}: ${t.slice(0, 200)}`);
    }

    const aiData = await aiRes.json() as { content?: { type: string; text?: string }[] };
    const raw = aiData.content?.find(b => b.type === "text")?.text ?? "";
    const s0 = raw.indexOf("{"), e0 = raw.lastIndexOf("}");
    if (s0 === -1 || e0 === -1) throw new Error("No JSON in Claude response");

    const x = JSON.parse(raw.slice(s0, e0 + 1)) as Record<string, string | number | null>;
    const s = (k: string) => (x[k] as string) ?? "";

    const vessel = {
      name:           s("name") || file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "),
      builder:        s("builder"), year: typeof x.year==="number"?x.year:(parseInt(String(x.year))||null),
      location:       s("location"), price: s("price"), stockNumber: "", sourceUrl: "",
      classification: s("classification"), grossTonnage: s("grossTonnage"), flagState: s("flagState"),
      loa: s("loa"), lwl: "", beam: s("beam"), draft: s("draft"), displacement: s("displacement"),
      hullForm: s("hullForm"), hullMaterial: s("hullMaterial"),
      superstructure: "", exteriorDesign: "", interiorDesign: "", navalArchitect: "",
      engines: s("engines"), power: s("power"), engineMake: s("engineMake"),
      engineModel: s("engineModel"), engineCount: s("engineCount"),
      gearbox: "", propulsion: "", propellers: "",
      gensets: s("gensets"), generatorKW: s("generatorKW"),
      bowThruster: "", sternThruster: "", airCon: s("airCon"),
      maxSpeed: s("maxSpeed"), cruiseSpeed: s("cruiseSpeed"), range: s("range"),
      fuelTank: s("fuelTank"), fuelConsumption: s("fuelConsumption"),
      freshWater: "", holdingTank: "", lubeOil: "",
      guests: s("guests"), staterooms: s("staterooms"), crew: s("crew"),
      crewCabins: s("crewCabins"), tender: s("tender"), livingSpace: "",
      navigation: s("navigation"), stabilisers: s("stabilisers"), waterMaker: s("waterMaker"),
      refitYear: s("refitYear"), refitDetails: s("refitDetails"),
      engineHours: s("engineHours"), lastDrydock: s("lastDrydock"),
      description: s("description"), features: [], images: [], aiExtracted: true,
    };

    return NextResponse.json({ ok: true, vessel, fileName: file.name });
  } catch (err) {
    console.error("[ownership/pdf-parse]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "PDF parse failed" },
      { status: 500 }
    );
  }
}
