/**
 * Post-Enrichment Validation Sweep
 * 
 * After all providers run, this function reviews EVERY stored source
 * for a profile and validates it against identity anchors. Sources
 * that can't be verified get their confidence downgraded. Sources
 * that ARE verified get boosted.
 * 
 * This is the single biggest accuracy improvement — it catches
 * wrong-person data that slipped through individual providers.
 */

import Database from "better-sqlite3";
import { getSourcesByProfile } from "./storage";
import { type IdentityAnchors, validateAgainstAnchors } from "./validation";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export type SweepResult = {
  total_sources: number;
  validated: number;
  flagged: number;
  downgraded: number;
  boosted: number;
};

export function validateAllSources(
  profileId: number,
  anchors: IdentityAnchors,
): SweepResult {
  const result: SweepResult = {
    total_sources: 0, validated: 0, flagged: 0, downgraded: 0, boosted: 0,
  };

  const sources = getSourcesByProfile(profileId);
  result.total_sources = sources.length;
  if (sources.length === 0) return result;

  // Keys that don't need person-level validation (they're about the subject by definition)
  const skipKeys = new Set([
    "ofac_clear", "ofac_match", "domain_analysis", "email_analysis",
    "email_tone", "identity_confidence",
    // Reverify confirmations contain lead's own data — don't re-validate
    "reverify_confirmation",
  ]);

  // Keys that benefit from stronger validation
  const personKeys = new Set([
    "web_title", "web_company", "web_mention", "yacht_club", "charity_board",
    "wealth_signal", "news_mention", "social_linkedin", "social_facebook",
    "social_instagram", "social_twitterx", "wikipedia",
    "fec_donation", "fec_employer", "fec_location",
    "uscg_vessel", "faa_aircraft",
    "corporate_role", "business_ownership", "years_active",
    "edgar_filing", "edgar_officer",
    "nonprofit_role",
    "court_record", "additional_property",
    "relative", "professional_history", "reverify_confirmation",
    "spouse_name", "person_age", "date_of_birth", "secondary_address",
  ]);

  const db = new Database(DB_PATH, { readonly: false });
  try {
    const updateStmt = db.prepare(
      "UPDATE enrichment_sources SET confidence = ?, source_label = ? WHERE id = ?"
    );

    const batch = db.transaction(() => {
      for (const source of sources) {
        if (skipKeys.has(source.data_key)) continue;
        if (!personKeys.has(source.data_key)) continue;

        // Build text blob to validate
        let text = [
          source.source_label || "",
          source.data_value || "",
          source.source_url || "",
        ].join(" ");

        // For JSON data_values, extract text content
        if (source.data_value.startsWith("{") || source.data_value.startsWith("[")) {
          try {
            const parsed = JSON.parse(source.data_value);
            if (typeof parsed === "object") {
              text += " " + Object.values(parsed).filter(v => typeof v === "string").join(" ");
            }
          } catch { /* use raw text */ }
        }

        const v = validateAgainstAnchors(text, anchors);
        const oldConf = source.confidence;
        let newConf = oldConf;
        let label = source.source_label;

        // Company-related content gets a pass even without personal anchors.
        // e.g. "Abel Motorsports" news is relevant to Bill Abel even if
        // his name isn't directly in the article.
        const textLower = text.toLowerCase();
        const isCompanyRelated = (
          (anchors.employer && anchors.employer.length > 3 && textLower.includes(anchors.employer.toLowerCase())) ||
          (anchors.emailDomain && anchors.emailDomain.length > 3 && textLower.includes(anchors.emailDomain.split(".")[0].toLowerCase())) ||
          (anchors.company && anchors.company.length > 3 && textLower.includes(anchors.company.toLowerCase())) ||
          (anchors.lastName && textLower.includes(anchors.lastName.toLowerCase()))
        );

        if (v.accepted) {
          // Boost validated sources (cap at 85)
          newConf = Math.min(85, oldConf + 15);
          if (!label.includes("✓")) label = "✓ " + label;
          result.validated++;
          if (newConf > oldConf) result.boosted++;
        } else if (v.flagged || isCompanyRelated) {
          // Slight downgrade for flagged, but company-related content keeps more confidence
          newConf = isCompanyRelated ? Math.max(30, Math.min(oldConf, 50)) : Math.max(10, Math.min(oldConf, 30));
          if (!label.includes("?")) label = "? " + label;
          result.flagged++;
        } else {
          // Significant downgrade for unvalidated (no anchors matched)
          // These are likely wrong-person results
          newConf = Math.max(5, Math.floor(oldConf * 0.3));
          if (!label.includes("⚠")) label = "⚠ " + label;
          result.downgraded++;
        }

        if (newConf !== oldConf || label !== source.source_label) {
          updateStmt.run(newConf, label, source.id);
        }
      }
    });

    batch();
  } finally {
    db.close();
  }

  return result;
}
