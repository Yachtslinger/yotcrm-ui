/**
 * capacity-utils.ts — src/lib/
 *
 * Parses raw tank/capacity strings and returns dual metric + imperial display.
 * Handles both US format (comma thousands: "50,000 lt") and
 * European format (period thousands: "50.000 lt." — used by Ocean King, Van der Valk, etc.)
 *
 * formatCapacity("50,000 lt")    → "50,000 lt / 13,209 gal"
 * formatCapacity("50.000 lt.")   → "50,000 lt / 13,209 gal"   ← European format
 * formatCapacity("14.000 lt.")   → "14,000 lt / 3,698 gal"    ← Ducale 120 fresh water
 * formatCapacity("7.400 lt.")    → "7,400 lt / 1,955 gal"     ← Ducale 120 holding
 * formatCapacity("13,209 gal")   → "13,209 gal / 50,000 lt"
 * formatCapacity("50000")        → "50,000 lt / 13,209 gal"
 * formatCapacity("")             → ""
 * formatCapacity("N/A")          → "N/A"
 */

const L_TO_GAL = 0.264172;
const GAL_TO_L = 3.785412;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Parse a number string handling BOTH:
 *   US format:      "50,000"  → 50000
 *   European format: "50.000" → 50000  (period as thousands separator)
 *
 * Key heuristic: European thousands separator always has exactly 3 digits
 * after the period (50.000, 7.400, 14.000).
 * A decimal point has 1–2 digits after it (14.5, 3.14).
 * So: if ALL periods in the number are followed by exactly 3 digits → European.
 */
function parseNumberSmart(s: string): number {
  const stripped = s.replace(/\s/g, "");

  // Count periods and commas
  const periods = (stripped.match(/\./g) || []).length;
  const commas  = (stripped.match(/,/g) || []).length;

  if (periods === 0 && commas === 0) {
    // Plain integer: "50000"
    return parseInt(stripped, 10);
  }

  if (periods > 0 && commas === 0) {
    // Could be European thousands ("50.000") or decimal ("50.5")
    // European: period(s) always followed by exactly 3 digits
    const isEuropeanThousands = /^[\d.]+$/.test(stripped) &&
      stripped.split(".").every((part, i, arr) => {
        if (i === 0) return true; // integer part can be any length
        return i < arr.length - 1
          ? part.length === 3           // middle groups: exactly 3
          : part.length === 3;          // last group: exactly 3 (no decimal remainder)
      });

    if (isEuropeanThousands) {
      return parseInt(stripped.replace(/\./g, ""), 10);
    }
    // Otherwise treat as decimal — multiply to get integer (e.g. "50.5" → 50)
    return Math.round(parseFloat(stripped));
  }

  if (commas > 0 && periods === 0) {
    // US thousands: "50,000"
    return parseInt(stripped.replace(/,/g, ""), 10);
  }

  if (commas > 0 && periods > 0) {
    // Mixed: "50,000.00" (US) or "50.000,00" (European with decimal)
    const lastComma  = stripped.lastIndexOf(",");
    const lastPeriod = stripped.lastIndexOf(".");
    if (lastComma > lastPeriod) {
      // European: "50.000,00" — commas after period → comma is decimal
      return Math.round(parseFloat(stripped.replace(/\./g, "").replace(",", ".")));
    } else {
      // US: "50,000.00" — period after comma → period is decimal
      return Math.round(parseFloat(stripped.replace(/,/g, "")));
    }
  }

  return parseInt(stripped.replace(/[,.\s]/g, ""), 10);
}

export function formatCapacity(raw: string): string {
  if (!raw || raw.trim() === "") return raw;

  const s = raw.trim();

  // ── Explicit liter patterns ────────────────────────────────────────────────
  // Matches: "50,000 lt" "50.000 lt." "14.000 lt." "50000 L" "50,000 litres"
  const ltMatch = s.match(/^([\d,.\s]+)\s*(?:lt\.?|l\.?|litr(?:e|es?|es?\.?)|liters?)(?:\s|$)/i);
  if (ltMatch) {
    const liters = parseNumberSmart(ltMatch[1]);
    if (!isNaN(liters) && liters > 0) {
      const gallons = Math.round(liters * L_TO_GAL);
      return `${fmt(liters)} lt / ${fmt(gallons)} gal`;
    }
  }

  // ── Explicit gallon patterns ───────────────────────────────────────────────
  const galMatch = s.match(/^([\d,.\s]+)\s*(?:us\s*)?gal(?:lons?)?(?:\s|$)/i);
  if (galMatch) {
    const gallons = parseNumberSmart(galMatch[1]);
    if (!isNaN(gallons) && gallons > 0) {
      const liters = Math.round(gallons * GAL_TO_L);
      return `${fmt(gallons)} gal / ${fmt(liters)} lt`;
    }
  }

  // ── Bare number with no unit ───────────────────────────────────────────────
  const bareMatch = s.match(/^([\d,.]+)$/);
  if (bareMatch) {
    const n = parseNumberSmart(bareMatch[1]);
    if (!isNaN(n) && n > 0) {
      if (n > 500) {
        const gallons = Math.round(n * L_TO_GAL);
        return `${fmt(n)} lt / ${fmt(gallons)} gal`;
      } else {
        const liters = Math.round(n * GAL_TO_L);
        return `${fmt(n)} gal / ${fmt(liters)} lt`;
      }
    }
  }

  // ── Already dual-formatted ─────────────────────────────────────────────────
  if (s.includes("/")) return s;

  // Fallback: return as-is
  return s;
}

/**
 * extractFuelFromText
 *
 * Scans free-form description/spec text for fuel capacity mentions.
 * Handles both US and European number formats.
 */
export function extractFuelFromText(text: string): string {
  if (!text) return "";

  const patterns = [
    /fuel\s*(?:capacity|oil|tank|oil\s*capacity)?[:\s]+?([\d,.]+)\s*(lt?\.?|litr(?:e|es?)|liters?|gal(?:lons?)?)/i,
    /([\d,.]+)\s*(lt?\.?|litr(?:e|es?)|liters?|gal(?:lons?)?)[\s,]+fuel/i,
    /fuel\s+(?:tank\s+)?([\d,.]+)\s*(lt?\.?|litr(?:e|es?)|liters?|gal(?:lons?)?)/i,
  ];

  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const raw = `${m[1]} ${m[2]}`;
      const formatted = formatCapacity(raw);
      return formatted || raw;
    }
  }

  return "";
}
