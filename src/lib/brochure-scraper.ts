// src/lib/brochure-scraper.ts
// Wraps the existing campaign scraper providers (Denison, YachtWorld, generic)
// and normalises their output into the VesselData shape the brochure template needs.

import { scrapeDenison } from "@/lib/campaign/providers/denison";
import { formatCapacity, extractFuelFromText } from "@/lib/capacity-utils";
import { scrapeGeneric } from "@/lib/campaign/providers/generic";
import type { CampaignDraft } from "@/lib/campaign/providers/denison";
import type { VesselData } from "@/lib/brochure-storage";

export async function scrapeVesselUrl(url: string): Promise<VesselData> {
  const trimmed = url.trim();
  const hostname = new URL(trimmed).hostname.toLowerCase();

  let draft: CampaignDraft;

  if (hostname.includes("denisonyachtsales.com")) {
    draft = await scrapeDenison(trimmed);
  } else if (hostname.includes("yachtworld.com")) {
    draft = await scrapeYachtWorld(trimmed);
  } else {
    draft = await scrapeGeneric(trimmed);
  }

  return normaliseDraft(draft, trimmed);
}

function normaliseDraft(draft: CampaignDraft, url: string): VesselData {
  const s = draft.specs || {};

  // Parse year from title or specs
  const titleStr = (draft.headline || "") + " " + (draft.description || "");
  const yearMatch = titleStr.match(/\b(20\d{2})\b/);
  const year = s.year ? parseInt(s.year) : yearMatch ? parseInt(yearMatch[1]) : null;

  // Parse vessel name: strip common noise from headline
  const rawName = draft.headline || "";
  const vesselName = rawName
    .replace(/yacht for sale/gi, "")
    .replace(/\d{3,4}['\u2032]\s*/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/Ocean King|Denison|YachtWorld|for sale|\|.*/gi, "")
    .replace(/[|·—]/g, "")
    .trim();

  // Builder: from specs or headline scan
  const builderPatterns = [
    "Ocean King","Benetti","Heesen","Feadship","Lürssen","Sanlorenzo",
    "Perini","Baglietto","Azimut","Ferretti","Mangusta","Westport",
    "Horizon","Numarine","JFA","Sunseeker","Princess","Majesty",
  ];
  const builderMatch = rawName.match(new RegExp(builderPatterns.join("|"), "i"));
  const builder = s.builder || builderMatch?.[0] || "";

  // Map images: CampaignDraft has gallery: string[]
  const images = (draft.gallery || [])
    .filter(Boolean)
    .map((src) => ({ src, alt: vesselName }));

  return {
    name: vesselName || "Luxury Motor Yacht",
    builder,
    year,
    location: draft.location || "",
    stockNumber: "",
    sourceUrl: url,

    // Hull & design — rarely in campaign drafts; leave blank for user to fill
    classification: "",
    grossTonnage: "",
    hullForm: "",
    hullMaterial: "",
    superstructure: "",
    exteriorDesign: "",
    interiorDesign: "",
    navalArchitect: "",

    // Dimensions
    loa: s.loa || "",
    lwl: "",
    beam: s.beam || "",
    draft: s.draft || "",
    displacement: "",

    // Propulsion
    engines: s.engines || (s.engineMake ? `${s.engineMake} ${s.engineModel || ""}`.trim() : ""),
    power: s.power || "",
    gearbox: "",
    propulsion: "",
    propellers: "",
    gensets: "",
    airCon: "",

    // Performance
    maxSpeed: s.maxSpeed || "",
    cruiseSpeed: s.cruiseSpeed || "",
    range: s.range || "",

    // Tanks — extract fuel from specs or description, format all as metric+imperial
    fuelTank: formatCapacity(s.fuel || extractFuelFromText(draft.description || "")),
    freshWater: formatCapacity(s.freshWater || ""),
    holdingTank: formatCapacity(s.holdingTank || ""),

    // Accommodation
    guests: "",
    staterooms: s.staterooms || "",
    crew: "",
    crewCabins: "",
    tender: "",
    livingSpace: "",

    // Navigation
    navigation: "",

    // Content
    description: draft.description || "",
    images,
  };
}
