/**
 * Intel Orchestrator
 * Chains all enrichment providers, runs them in parallel,
 * then triggers the scoring engine.
 *
 * Usage:
 *   import { enrichLead } from "@/lib/intel/orchestrator";
 *   const result = await enrichLead(leadId);
 */

import { upsertProfile, getProfileByLeadId, logAuditEvent } from "./storage";
import { scoreAndSave, type ScoreResult } from "./scoring";
import { checkOFAC } from "./providers/ofac";
import { searchEDGAR } from "./providers/edgar";
import { searchOpenCorporates } from "./providers/opencorp";
import { searchUSCG } from "./providers/uscg";
import { searchFAA } from "./providers/faa";
import { analyzeDomain } from "./providers/domain";
import { searchFEC } from "./providers/fec";
import { discoverSocial } from "./providers/social";
import { searchWeb } from "./providers/websearch";
import { searchNonprofits } from "./providers/nonprofit";
import { searchProperty } from "./providers/property";
import { enrichCompanies } from "./providers/company";
import { reverifyAndDeepDive } from "./providers/reverify";
import { crossVerifyIdentity } from "./verification";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || "/app/data/yotcrm.db";

export type EnrichmentResult = {
  profileId: number;
  leadId: number;
  score: ScoreResult;
  providers: {
    ofac: { success: boolean; matches: number; error?: string };
    edgar: { success: boolean; filings: number; error?: string };
    opencorp: { success: boolean; companies: number; officers: number; error?: string };
    uscg: { success: boolean; vessels: number; error?: string };
    faa: { success: boolean; aircraft: number; error?: string };
    domain: { success: boolean; is_business: boolean; error?: string };
    fec: { success: boolean; donations: number; total_donated: number; employer: string; occupation: string; location: string; error?: string };
    social: { success: boolean; profiles_found: number; news_mentions: number; error?: string };
    websearch: { success: boolean; results: number; categories: Record<string, number>; error?: string };
    nonprofit: { success: boolean; orgs: number; total_compensation: number; error?: string };
  };
  duration_ms: number;
  error?: string;
};

// ─── Main Enrichment Function ───────────────────────────────────────

export async function enrichLead(leadId: number): Promise<EnrichmentResult> {
  const start = Date.now();

  const result: EnrichmentResult = {
    profileId: 0,
    leadId,
    score: { score: 50, band: "unverified", breakdown: [], flags: [] },
    providers: {
      ofac: { success: false, matches: 0 },
      edgar: { success: false, filings: 0 },
      opencorp: { success: false, companies: 0, officers: 0 },
      uscg: { success: false, vessels: 0 },
      faa: { success: false, aircraft: 0 },
      domain: { success: false, is_business: false },
      fec: { success: false, donations: 0, total_donated: 0, employer: "", occupation: "", location: "" },
      social: { success: false, profiles_found: 0, news_mentions: 0 },
      websearch: { success: false, results: 0, categories: {} },
      nonprofit: { success: false, orgs: 0, total_compensation: 0 },
    },
    duration_ms: 0,
  };

  try {
    // 1. Get lead data
    const lead = getLeadById(leadId);
    if (!lead) {
      result.error = `Lead ${leadId} not found`;
      return result;
    }

    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
    const companyName = lead.company || undefined;
    const email = lead.email || "";

    if (!fullName && !email) {
      result.error = "Lead has no name or email — cannot enrich";
      return result;
    }

    // 2. Create or get enrichment profile
    const profileId = upsertProfile(leadId, {
      enrichment_status: "pending",
    });
    result.profileId = profileId;

    logAuditEvent(leadId, "enrich_triggered", "system", {
      name: fullName,
      company: companyName,
      email,
    });

    // 3. Run all providers in parallel
    const [ofacRes, edgarRes, ocRes, uscgRes, faaRes, domainRes, fecRes, socialRes, webRes, nonprofitRes] = await Promise.allSettled([
      fullName ? checkOFAC(profileId, leadId, fullName, companyName) : null,
      fullName ? searchEDGAR(profileId, leadId, fullName, companyName) : null,
      (fullName || companyName) ? searchOpenCorporates(profileId, leadId, fullName, companyName) : null,
      fullName ? searchUSCG(profileId, leadId, fullName, companyName) : null,
      fullName ? searchFAA(profileId, leadId, fullName, companyName) : null,
      email ? analyzeDomain(profileId, leadId, email) : null,
      fullName ? searchFEC(profileId, leadId, fullName) : null,
      fullName ? discoverSocial(profileId, leadId, fullName, email) : null,
      fullName ? searchWeb(profileId, leadId, fullName, email) : null,
      fullName ? searchNonprofits(profileId, leadId, fullName) : null,
    ]);

    // 4. Aggregate provider results
    if (ofacRes.status === "fulfilled" && ofacRes.value) {
      const v = ofacRes.value;
      result.providers.ofac = { success: !v.error, matches: v.matches.length, error: v.error };
    }
    if (edgarRes.status === "fulfilled" && edgarRes.value) {
      const v = edgarRes.value;
      result.providers.edgar = { success: !v.error, filings: v.filings.length, error: v.error };
    }
    if (ocRes.status === "fulfilled" && ocRes.value) {
      const v = ocRes.value;
      result.providers.opencorp = {
        success: !v.error,
        companies: v.companies.length,
        officers: v.officer_matches.length,
        error: v.error,
      };
    }
    if (uscgRes.status === "fulfilled" && uscgRes.value) {
      const v = uscgRes.value;
      result.providers.uscg = { success: !v.error, vessels: v.vessels.length, error: v.error };
    }
    if (faaRes.status === "fulfilled" && faaRes.value) {
      const v = faaRes.value;
      result.providers.faa = { success: !v.error, aircraft: v.aircraft.length, error: v.error };
    }
    if (domainRes.status === "fulfilled" && domainRes.value) {
      const v = domainRes.value;
      result.providers.domain = { success: !v.error, is_business: v.is_business_email, error: v.error };
    }
    if (fecRes.status === "fulfilled" && fecRes.value) {
      const v = fecRes.value;
      result.providers.fec = {
        success: !v.error, donations: v.donations.length, total_donated: v.total_donated,
        employer: v.employer, occupation: v.occupation,
        location: v.address_city ? `${v.address_city}, ${v.address_state}` : "",
        error: v.error,
      };
    }
    if (socialRes.status === "fulfilled" && socialRes.value) {
      const v = socialRes.value;
      result.providers.social = {
        success: !v.error,
        profiles_found: v.profiles.filter(p => p.found).length,
        news_mentions: v.news_mentions.length,
        error: v.error,
      };
    }
    if (webRes.status === "fulfilled" && webRes.value) {
      const v = webRes.value;
      result.providers.websearch = {
        success: !v.error,
        results: v.results.length,
        categories: Object.fromEntries(
          ["bio", "press", "board", "yacht", "charity", "realestate"]
            .map(c => [c, v.results.filter((r: any) => r.category === c).length])
        ),
        error: v.error,
      };
    }
    if (nonprofitRes.status === "fulfilled" && nonprofitRes.value) {
      const v = nonprofitRes.value;
      result.providers.nonprofit = {
        success: !v.error,
        orgs: v.organizations.length,
        total_compensation: v.total_compensation,
        error: v.error,
      };
    }

    // ── Phase 2: Deep enrichment (depends on Phase 1 data) ──
    const [propertyRes, companyRes] = await Promise.allSettled([
      fullName ? searchProperty(profileId, leadId, fullName) : null,
      fullName ? enrichCompanies(profileId, leadId, fullName) : null,
    ]);

    // ── Phase 3: Re-verification & deep dive (uses Phase 1+2 data) ──
    const reverifyRes = await reverifyAndDeepDive(profileId, leadId, fullName, email);

    // ── Phase 4: Cross-verify identity & aggregate net worth ──
    const verification = crossVerifyIdentity(
      profileId, leadId, fullName, email,
      lead.city || undefined, lead.state || undefined,
    );

    // 5. Run scoring engine
    const scoreResult = scoreAndSave(profileId, leadId);
    result.score = scoreResult;

    // 6. Write discovered profile fields back to lead record
    writeDiscoveredFields(leadId, fecRes, socialRes, webRes, nonprofitRes, propertyRes, companyRes, verification);

    // 7. Update profile status
    upsertProfile(leadId, { enrichment_status: "complete" });

    logAuditEvent(leadId, "enrich_completed", "system", {
      score: scoreResult.score,
      band: scoreResult.band,
      factors_matched: scoreResult.breakdown.length,
      flags: scoreResult.flags.length,
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    result.error = err.message;
    upsertProfile(leadId, { enrichment_status: "failed" });
    logAuditEvent(leadId, "enrich_failed", "system", { error: err.message });
  }

  result.duration_ms = Date.now() - start;
  return result;
}

// ─── Lead Data Helper ───────────────────────────────────────────────

function getLeadById(leadId: number): {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  company: string;
  phone: string;
  city: string;
  state: string;
} | null {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return (db.prepare("SELECT id, first_name, last_name, email, company, phone, city, state FROM leads WHERE id = ?").get(leadId) as any) || null;
  } catch {
    // company/city/state columns might not exist in older schema
    try {
      const row = db.prepare("SELECT id, first_name, last_name, email, phone FROM leads WHERE id = ?").get(leadId) as any;
      return row ? { ...row, company: "", city: "", state: "" } : null;
    } catch {
      return null;
    }
  } finally {
    db.close();
  }
}


// ─── Write Discovered Fields Back to Lead ───────────────────────────

function writeDiscoveredFields(
  leadId: number,
  fecRes: PromiseSettledResult<any>,
  socialRes: PromiseSettledResult<any>,
  webRes: PromiseSettledResult<any>,
  nonprofitRes: PromiseSettledResult<any>,
  propertyRes: PromiseSettledResult<any>,
  companyRes: PromiseSettledResult<any>,
  verification?: import("./verification").VerificationResult,
) {
  const updates: Record<string, string | number> = {};

  // FEC data — employer, occupation, location, donations
  if (fecRes.status === "fulfilled" && fecRes.value) {
    const fec = fecRes.value;
    if (fec.employer) updates.employer = fec.employer;
    if (fec.occupation) updates.occupation = fec.occupation;
    if (fec.address_city) updates.city = fec.address_city;
    if (fec.address_state) updates.state = fec.address_state;
    if (fec.address_zip) updates.zip = fec.address_zip;
    if (fec.total_donated > 0) updates.total_donations = `$${fec.total_donated.toLocaleString()} (${fec.donations.length} records)`;
  }

  // Social profiles — extract URLs
  if (socialRes.status === "fulfilled" && socialRes.value) {
    const social = socialRes.value;
    for (const p of social.profiles || []) {
      if (!p.found) continue;
      const platform = p.platform?.toLowerCase();
      if (platform === "linkedin") updates.linkedin_url = p.url;
      else if (platform === "facebook") updates.facebook_url = p.url;
      else if (platform === "instagram") updates.instagram_url = p.url;
      else if (platform?.includes("twitter") || platform?.includes("x")) updates.twitter_url = p.url;
    }
    // Wikipedia
    if (social.wikipedia_summary) {
      const name = social.profiles?.[0]?.display_name || "";
      updates.wikipedia_url = `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;
    }
    // News count
    if (social.news_mentions?.length > 0) {
      updates.media_mentions = social.news_mentions.length;
    }
  }

  // Web search — yacht clubs, boards, wealth signals
  if (webRes.status === "fulfilled" && webRes.value) {
    const web = webRes.value;
    const { extracted } = web;
    if (extracted.yacht_club?.length > 0) updates.yacht_clubs = [...new Set(extracted.yacht_club)].join("; ");
    if (extracted.charity_boards?.length > 0) updates.board_positions = [...new Set(extracted.charity_boards)].join("; ");
    if (extracted.net_worth_signals?.length > 0) {
      updates.net_worth_range = extracted.net_worth_signals[0];
      updates.net_worth_confidence = "Low — web mention";
    }
    // Add web mentions to media count
    const webMediaCount = web.results.filter((r: any) => r.category !== "other").length;
    if (webMediaCount > 0) {
      updates.media_mentions = Math.max(Number(updates.media_mentions || 0), webMediaCount);
    }
  }

  // Nonprofit roles
  if (nonprofitRes.status === "fulfilled" && nonprofitRes.value) {
    const np = nonprofitRes.value;
    if (np.organizations?.length > 0) {
      updates.nonprofit_roles = np.organizations.map((o: any) =>
        `${o.role} at ${o.name}${o.compensation ? ` ($${o.compensation.toLocaleString()}/yr)` : ""}`
      ).join("; ");
    }
  }

  // Property
  if (propertyRes.status === "fulfilled" && propertyRes.value) {
    const prop = propertyRes.value;
    if (prop.estimated_value) {
      updates.property_summary = `Est. ${prop.estimated_value} — ${prop.address?.city || ""}, ${prop.address?.state || ""}`;
    } else if (prop.address?.city) {
      updates.property_summary = `${prop.address.city}, ${prop.address.state} ${prop.address.zip} (value pending)`;
    }
  }

  // Verification & net worth data
  if (verification) {
    if (verification.estimated_net_worth) {
      updates.estimated_net_worth = verification.estimated_net_worth;
      updates.net_worth_breakdown = JSON.stringify(verification.net_worth_breakdown);
      updates.net_worth_confidence = verification.net_worth_breakdown.length >= 3 ? "Medium — multi-source" : "Low — limited data";
    }
    if (verification.identity_confidence > 0) {
      updates.identity_confidence = verification.identity_confidence;
      updates.identity_verifications = JSON.stringify(verification.verifications);
    }
    const p = verification.personal;
    if (p.date_of_birth) updates.date_of_birth = p.date_of_birth;
    if (p.age) updates.age = p.age;
    if (p.spouse_name) updates.spouse_name = p.spouse_name;
    if (p.spouse_employer) updates.spouse_employer = p.spouse_employer;
    if (p.primary_address) updates.primary_address = p.primary_address;
    if (p.secondary_addresses.length > 0) updates.secondary_addresses = JSON.stringify(p.secondary_addresses);
  }

  if (Object.keys(updates).length === 0) return;

  const db = new Database(DB_PATH, { readonly: false });
  try {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [col, val] of Object.entries(updates)) {
      if (col === "media_mentions") {
        // media_mentions is additive, always update
        fields.push(`${col} = ?`);
      } else {
        // Only update empty fields — don't overwrite manual edits
        fields.push(`${col} = CASE WHEN ${col} IS NULL OR ${col} = '' OR ${col} = 0 THEN ? ELSE ${col} END`);
      }
      values.push(val);
    }
    values.push(leadId);
    db.prepare(`UPDATE leads SET ${fields.join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values);
  } catch (err) {
    console.error("[Lighthouse] Failed to write discovered fields to lead:", err);
  } finally {
    db.close();
  }
}
