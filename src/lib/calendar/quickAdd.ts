/**
 * Quick-Add Natural Language Parser for Calendar Events
 * 
 * Parses casual text messages (iMessage, email, etc.) into structured event data.
 * Handles patterns like:
 *   "confirmed for the dodgers bank up at Indian Town on Thursday between 10 & 11"
 *   "Dauntless Samsara around 1:30 on Thursday"
 *   "The CDM will be Friday morning around 10:00 am"
 *   "survey scheduled for Monday at 9am at Lauderdale Marine Center"
 *   "sea trial Tuesday 2pm at Sailfish Marina for the 72 Viking"
 */

export type ParsedEvent = {
  title: string;
  event_type: string;
  start_at: string;      // ISO datetime
  end_at: string;        // ISO datetime
  location: string;
  vessel_hint: string;   // raw vessel text extracted
  prospect_hint: string; // raw prospect text extracted
  confidence: number;    // 0-1 how confident the parse is
  raw: string;
};

// ─── Event Type Detection ───────────────────────────────

const TYPE_PATTERNS: [RegExp, string][] = [
  [/\b(cdm|closing\s*doc|closing\s*milestone|closing)\b/i, "closing_milestone"],
  [/\b(survey|marine\s*survey)\b/i, "survey"],
  [/\b(sea\s*trial|test\s*run|demo\s*ride)\b/i, "sea_trial"],
  [/\b(haul[\s-]?out|haul\s*up|pull[\s-]?out)\b/i, "haul_out"],
  [/\b(yard\s*visit|boat\s*yard)\b/i, "yard_visit"],
  [/\b(boat\s*show|show\s*appearance)\b/i, "boat_show"],
  [/\b(call|phone\s*call|client\s*call|zoom|teams)\b/i, "client_call"],
  [/\b(follow[\s-]?up|check[\s-]?in|touch\s*base)\b/i, "follow_up"],
  [/\b(broker\s*showing|broker\s*open)\b/i, "broker_showing"],
  [/\b(owner\s*showing|owner\s*tour)\b/i, "owner_showing"],
  [/\b(showing|tour|visit|walk[\s-]?through|see\s+the|go\s+to\s+the|look\s*at)\b/i, "showing"],
  [/\b(travel|flight|drive\s*down|drive\s*up|road\s*trip)\b/i, "travel_block"],
];

function detectType(text: string): string {
  for (const [pat, type] of TYPE_PATTERNS) {
    if (pat.test(text)) return type;
  }
  return "showing"; // default
}

// ─── Day Name Resolution ────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, thur: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

function resolveDay(dayStr: string, refDate: Date = new Date()): Date {
  const lower = dayStr.toLowerCase().trim();

  // "today" / "tomorrow"
  if (lower === "today") return new Date(refDate);
  if (lower === "tomorrow") {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const targetDay = DAY_NAMES[lower];
  if (targetDay === undefined) return new Date(refDate);

  const current = refDate.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7; // always next occurrence
  const d = new Date(refDate);
  d.setDate(d.getDate() + diff);
  return d;
}

// ─── Date Extraction ────────────────────────────────────

// Matches: "March 5", "Mar 5th", "3/5", "3-5-2026"
const EXPLICIT_DATE_RE = /\b(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?)\b/i;
const SLASH_DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/;
const DAY_NAME_RE = /\b(today|tomorrow|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|thur|fri|sat|sun))\b/i;

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function extractDate(text: string): Date | null {
  // Try explicit date first: "March 5" etc.
  const explicitMatch = text.match(EXPLICIT_DATE_RE);
  if (explicitMatch) {
    const month = MONTH_MAP[explicitMatch[1].toLowerCase().substring(0, 3)];
    const day = parseInt(explicitMatch[2]);
    const year = explicitMatch[3] ? parseInt(explicitMatch[3]) : new Date().getFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Try slash date: "3/5" or "3/5/26"
  const slashMatch = text.match(SLASH_DATE_RE);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = slashMatch[3] ? parseInt(slashMatch[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Try day name: "Thursday", "this Friday", "tomorrow"
  const dayMatch = text.match(DAY_NAME_RE);
  if (dayMatch) {
    const raw = dayMatch[1].replace(/^this\s+/i, "").trim();
    return resolveDay(raw);
  }

  return null;
}

// ─── Time Extraction ────────────────────────────────────

type TimeRange = { startHour: number; startMin: number; endHour: number; endMin: number };

// "between 10 & 11", "between 10:00 and 11:00", "from 2 to 4"
const RANGE_RE = /(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|a\.m\.|p\.m\.)?(?:\s*(?:&|and|to|-)\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

// "at 10:00 am", "around 1:30", "@ 2pm", "10:00 am", "1:30 pm"
const SINGLE_TIME_RE = /(?:at|around|@|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

// "morning", "afternoon", "evening"
const PERIOD_RE = /\b(morning|afternoon|evening|noon|midday)\b/i;

function normalizeAmPm(s: string | undefined): string | null {
  if (!s) return null;
  const lower = s.toLowerCase().replace(/\./g, "");
  if (lower === "am" || lower === "a") return "am";
  if (lower === "pm" || lower === "p") return "pm";
  return null;
}

function resolveHour(hour: number, ampm: string | null): number {
  if (ampm === "am") return hour === 12 ? 0 : hour;
  if (ampm === "pm") return hour === 12 ? 12 : hour + 12;
  // No am/pm: assume business hours. If 1-6, it's PM. If 7-12, could be AM.
  if (hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}

function extractTime(text: string): TimeRange | null {
  // Try range first: "between 10 & 11"
  const rangeMatch = text.match(RANGE_RE);
  if (rangeMatch) {
    const h1 = parseInt(rangeMatch[1]);
    const m1 = rangeMatch[2] ? parseInt(rangeMatch[2]) : 0;
    const h2 = parseInt(rangeMatch[3]);
    const m2 = rangeMatch[4] ? parseInt(rangeMatch[4]) : 0;
    const ampm = normalizeAmPm(rangeMatch[5]);
    // If only end has am/pm, apply to both
    return {
      startHour: resolveHour(h1, ampm),
      startMin: m1,
      endHour: resolveHour(h2, ampm),
      endMin: m2,
    };
  }

  // Try single time: "at 10:00 am", "around 1:30", "2pm"
  // Be more specific to avoid matching random numbers
  const singleTimeRe = /(?:(?:at|around|@|by)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i;
  const singleMatch = text.match(singleTimeRe);
  if (singleMatch) {
    const h = parseInt(singleMatch[1]);
    const m = singleMatch[2] ? parseInt(singleMatch[2]) : 0;
    const ampm = normalizeAmPm(singleMatch[3]);
    const startH = resolveHour(h, ampm);
    return { startHour: startH, startMin: m, endHour: startH + 1, endMin: m };
  }

  // Try time without am/pm but with "at/around": "around 1:30", "at 10"
  const atTimeRe = /(?:at|around|@)\s+(\d{1,2})(?::(\d{2}))?(?!\s*(?:am|pm|a|p))/i;
  const atMatch = text.match(atTimeRe);
  if (atMatch) {
    const h = parseInt(atMatch[1]);
    const m = atMatch[2] ? parseInt(atMatch[2]) : 0;
    const startH = resolveHour(h, null);
    return { startHour: startH, startMin: m, endHour: startH + 1, endMin: m };
  }

  // Try period: "morning", "afternoon"
  const periodMatch = text.match(PERIOD_RE);
  if (periodMatch) {
    const p = periodMatch[1].toLowerCase();
    if (p === "morning") return { startHour: 10, startMin: 0, endHour: 11, endMin: 0 };
    if (p === "afternoon") return { startHour: 14, startMin: 0, endHour: 15, endMin: 0 };
    if (p === "evening") return { startHour: 18, startMin: 0, endHour: 19, endMin: 0 };
    if (p === "noon" || p === "midday") return { startHour: 12, startMin: 0, endHour: 13, endMin: 0 };
  }

  return null;
}

// ─── Location Extraction ────────────────────────────────

// Known South Florida yacht locations/marinas
const KNOWN_LOCATIONS = [
  "Sailfish Marina", "Lauderdale Marine Center", "LMC", "Pier 66",
  "Bahia Mar", "Riviera Beach", "Indian Town", "Indiantown",
  "Stuart", "Fort Pierce", "Ft. Pierce", "Fort Lauderdale", "Ft. Lauderdale",
  "Miami", "Miami Beach", "Coconut Grove", "Key Biscayne",
  "Palm Beach", "West Palm", "North Palm", "Jupiter",
  "Dania Beach", "Dania Cut-Off", "Hollywood", "Pompano",
  "Derecktor", "Rybovich", "Hinckley", "Safe Harbor",
  "Harbour Towne", "Sunset Harbour", "Rickenbacker", "Dinner Key",
  "Bradford", "New River", "Summerfield", "Loggerhead",
  "Thunderbolt", "Savannah", "Jacksonville", "Jax",
  "Deltaville", "Annapolis", "Newport", "Essex",
];

function extractLocation(text: string): string {
  // Check known locations first
  for (const loc of KNOWN_LOCATIONS) {
    const re = new RegExp(`\\b${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return loc;
  }

  // Pattern: "at <Location>" or "in <Location>"
  const atMatch = text.match(/(?:at|in)\s+(?:the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}?)(?:\s+(?:on|at|for|between|around|from|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\s*$)/);
  if (atMatch) return atMatch[1].trim();

  return "";
}

// ─── Vessel Extraction ──────────────────────────────────

const YACHT_MAKES = [
  "Viking", "Hatteras", "Bertram", "Azimut", "Ferretti", "Sunseeker",
  "Princess", "Benetti", "Lürssen", "Lurssen", "Feadship", "Heesen",
  "Oceanco", "Amels", "Westport", "Horizon", "Nordhavn", "Kadey-Krogen",
  "Krogen", "Grand Banks", "Fleming", "Sabre", "Hinckley", "Boston Whaler",
  "Grady-White", "Grady White", "Yellowfin", "Regulator", "Scout",
  "Sea Ray", "Searay", "Cabo", "Riviera", "Maritimo", "Prestige",
  "Beneteau", "Jeanneau", "Lagoon", "Leopard", "Fountaine Pajot",
  "Catana", "Dufour", "Bavaria", "Hallberg-Rassy", "Oyster", "Swan",
  "Nautor", "Wally", "Sanlorenzo", "Riva", "Mangusta", "Pershing",
  "Tiara", "Pursuit", "Contender", "Invincible", "HCB", "Valhalla",
  "Jarrett Bay", "Garlington", "Merritt", "Spencer", "Rybovich",
  "Jim Smith", "Paul Mann", "Bayliss", "Weaver", "Davis", "Buddy Davis",
  "Ocean Alexander", "Marlow", "Outer Reef", "Selene", "Norstar",
  "Van Der Valk", "Van der Vaulk", "Moonen", "Burger", "Trinity",
  "Christensen", "Palmer Johnson", "Broward", "Lazzara", "Dauntless",
  "All Seas", "Numarine", "Gulf Craft", "Majesty",
];

function extractVessel(text: string): string {
  // Pattern: "for the <vessel>" or "for <vessel>" or "the <vessel>"
  const forTheMatch = text.match(/(?:for|see|visit|go\s+to)\s+(?:the\s+)?(?:(\d{2,3})['\s-]?\s*)?([A-Z][a-zA-Z\s]+?)(?:\s+(?:on|at|in|between|around|from|that|this|which|is)|\s*$)/i);

  // Check if any known make appears in text
  for (const make of YACHT_MAKES) {
    const re = new RegExp(`\\b${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) {
      // Try to get "72' Viking" or "72 Viking" or "Nordhavn 76"
      const sizeBeforeRe = new RegExp(`(\\d{2,3})['\s-]?\\s*${make}`, "i");
      const sizeAfterRe = new RegExp(`${make}\\s+(\\d{2,3})`, "i");
      const sizeBefore = text.match(sizeBeforeRe);
      const sizeAfter = text.match(sizeAfterRe);
      if (sizeBefore) return `${sizeBefore[1]}' ${make}`;
      if (sizeAfter) return `${make} ${sizeAfter[1]}`;
      return make;
    }
  }

  // Look for boat name patterns: quoted names, "Blondie", capitalized vessel-like names
  const quotedName = text.match(/[""]([^""]+)[""]|"([^"]+)"/);
  if (quotedName) return quotedName[1] || quotedName[2];

  // "for Blondie the Van Der Vaulk" — extract after "for"
  const forMatch = text.match(/\bfor\s+(?:the\s+)?([A-Z][a-zA-Z]+(?:\s+(?:the\s+)?[A-Z][a-zA-Z\s]*)?)/);
  if (forMatch) {
    const candidate = forMatch[1].trim();
    // Filter out common non-vessel words
    const skipWords = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Carlos", "Paolo", "Will"];
    if (!skipWords.some(w => candidate.startsWith(w))) return candidate;
  }

  return "";
}

// ─── Main Parse Function ────────────────────────────────

export function parseQuickAdd(text: string): ParsedEvent {
  const raw = text.trim();
  let confidence = 0;

  // 1. Event type
  const event_type = detectType(raw);
  if (event_type !== "showing") confidence += 0.15; // non-default type is more confident

  // 2. Date
  const date = extractDate(raw);
  if (date) confidence += 0.3;

  // 3. Time
  const time = extractTime(raw);
  if (time) confidence += 0.3;

  // 4. Location
  const location = extractLocation(raw);
  if (location) confidence += 0.1;

  // 5. Vessel
  const vessel_hint = extractVessel(raw);
  if (vessel_hint) confidence += 0.15;

  // Build start/end dates
  const eventDate = date || new Date();
  const startDate = new Date(eventDate);
  const endDate = new Date(eventDate);

  if (time) {
    startDate.setHours(time.startHour, time.startMin, 0, 0);
    endDate.setHours(time.endHour, time.endMin, 0, 0);
  } else {
    startDate.setHours(10, 0, 0, 0);
    endDate.setHours(11, 0, 0, 0);
  }

  // Build title
  const TYPE_LABELS: Record<string, string> = {
    showing: "Showing", broker_showing: "Broker Showing",
    owner_showing: "Owner Showing", survey: "Survey",
    haul_out: "Haul-Out", sea_trial: "Sea Trial",
    yard_visit: "Yard Visit", closing_milestone: "Closing Milestone",
    client_call: "Client Call", follow_up: "Follow-Up",
    boat_show: "Boat Show", travel_block: "Travel Block",
  };
  const typeLabel = TYPE_LABELS[event_type] || "Showing";
  let title = typeLabel;
  if (vessel_hint) title += ` — ${vessel_hint}`;
  if (location && !vessel_hint) title += ` @ ${location}`;

  return {
    title,
    event_type,
    start_at: startDate.toISOString(),
    end_at: endDate.toISOString(),
    location,
    vessel_hint,
    prospect_hint: "",
    confidence: Math.min(confidence, 1),
    raw,
  };
}
