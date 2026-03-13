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
import { scrapeCompanySite } from "./providers/companysite";
import { reverifyAndDeepDive } from "./providers/reverify";
import { buildAnchors, type IdentityAnchors, enrichAnchors } from "./validation";
import { crossVerifyIdentity } from "./verification";
import { validateAllSources } from "./sweep";
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
  sweep?: { total_sources: number; validated: number; flagged: number; downgraded: number; boosted: number };
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

    // 2b. Build identity anchors for result validation
    // Includes area code → city/state lookup for sparse leads
    const anchors = buildAnchors({
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      company: lead.company,
      employer: lead.employer,
    });

    // ── Phase 1a: Quick lookups (no anchors needed) ──
    const [ofacRes, domainRes] = await Promise.allSettled([
      fullName ? checkOFAC(profileId, leadId, fullName, companyName) : null,
      email ? analyzeDomain(profileId, leadId, email) : null,
    ]);

    // ── Phase 1b: Enrich anchors from domain analysis ──
    if (domainRes.status === "fulfilled" && domainRes.value) {
      const d = domainRes.value;
      if (d.domain_info?.title) {
        enrichAnchors(anchors, { employer: d.domain_info.title, company: d.domain_info.title });
      } else if (d.is_business_email) {
        // Use domain name as company fallback (e.g. "abelconstruct" from abelconstruct.com)
        const domBase = d.email_domain.split(".")[0];
        if (domBase.length > 3) enrichAnchors(anchors, { employer: domBase, company: domBase });
      }
    }

    // ── Phase 1c: FEC search (uses anchors, discovers city/state/employer) ──
    const fecRes = await Promise.resolve(
      fullName ? searchFEC(profileId, leadId, fullName, anchors) : null
    ).then(r => ({ status: "fulfilled" as const, value: r }))
     .catch(e => ({ status: "rejected" as const, reason: e }));

    // ── Phase 1d: Enrich anchors from FEC results ──
    if (fecRes.status === "fulfilled" && fecRes.value) {
      const f = fecRes.value;
      enrichAnchors(anchors, {
        city: f.address_city || undefined,
        state: f.address_state || undefined,
        zip: f.address_zip || undefined,
        employer: f.employer || undefined,
      });
    }

    // ── Phase 1d.5: Company website scrape (enriches anchors with HQ city/state before social/web) ──
    const emailDomain = email?.includes("@") ? email.split("@")[1]?.toLowerCase() : "";
    const isBizEmail = emailDomain && !["gmail.com","yahoo.com","hotmail.com","outlook.com","aol.com","icloud.com","me.com","live.com","msn.com","comcast.net","att.net","verizon.net","protonmail.com"].includes(emailDomain);

    let companySiteRes: PromiseSettledResult<any> = { status: "fulfilled" as const, value: null };
    if (isBizEmail) {
      companySiteRes = await Promise.resolve(
        scrapeCompanySite(profileId, leadId, fullName, emailDomain, anchors)
      ).then(r => ({ status: "fulfilled" as const, value: r }))
       .catch(e => ({ status: "rejected" as const, reason: e }));

      if (companySiteRes.status === "fulfilled" && companySiteRes.value) {
        const cs = companySiteRes.value;
        if (cs.company_info?.headquarters) {
          const parts = cs.company_info.headquarters.split(",").map((s: string) => s.trim());
          if (parts.length >= 2) enrichAnchors(anchors, { city: parts[0], state: parts[1] });
        }
        if (cs.company_info?.name) enrichAnchors(anchors, { employer: cs.company_info.name, company: cs.company_info.name });
      }
    }

    // ── Phase 1e: All remaining providers (with fully enriched anchors) ──
    const [edgarRes, ocRes, uscgRes, faaRes, socialRes, webRes, nonprofitRes] = await Promise.allSettled([
      fullName ? searchEDGAR(profileId, leadId, fullName, companyName) : null,
      (fullName || companyName) ? searchOpenCorporates(profileId, leadId, fullName, companyName) : null,
      fullName ? searchUSCG(profileId, leadId, fullName, companyName) : null,
      fullName ? searchFAA(profileId, leadId, fullName, companyName) : null,
      fullName ? discoverSocial(profileId, leadId, fullName, email, anchors) : null,
      fullName ? searchWeb(profileId, leadId, fullName, email, anchors) : null,
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
    const reverifyRes = await reverifyAndDeepDive(profileId, leadId, fullName, email, anchors);

    // ── Phase 3b: Validation Sweep — check ALL sources against identity anchors ──
    // Downgrades confidence on wrong-person data, boosts verified matches
    const sweepResult = validateAllSources(profileId, anchors);
    result.sweep = sweepResult;

    // ── Phase 4: Cross-verify identity & aggregate net worth ──
    const verification = crossVerifyIdentity(
      profileId, leadId, fullName, email,
      lead.city || undefined, lead.state || undefined,
    );

    // 5. Run scoring engine
    const scoreResult = scoreAndSave(profileId, leadId);
    result.score = scoreResult;

    // 6. Write discovered profile fields back to lead record
    writeDiscoveredFields(leadId, fullName, fecRes, socialRes, webRes, nonprofitRes, propertyRes, companyRes, verification, reverifyRes, companySiteRes);

    // 7. Update profile status
    upsertProfile(leadId, { enrichment_status: "complete" });

    logAuditEvent(leadId, "enrich_completed", "system", {
      score: scoreResult.score,
      band: scoreResult.band,
      factors_matched: scoreResult.breakdown.length,
      flags: scoreResult.flags.length,
      sweep: sweepResult,
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
  zip: string;
  employer: string;
} | null {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return (db.prepare("SELECT id, first_name, last_name, email, company, phone, city, state, COALESCE(zip,'') as zip, COALESCE(employer,'') as employer FROM leads WHERE id = ?").get(leadId) as any) || null;
  } catch {
    try {
      const row = db.prepare("SELECT id, first_name, last_name, email, phone FROM leads WHERE id = ?").get(leadId) as any;
      return row ? { ...row, company: "", city: "", state: "", zip: "", employer: "" } : null;
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
  fullName: string,
  fecRes: PromiseSettledResult<any>,
  socialRes: PromiseSettledResult<any>,
  webRes: PromiseSettledResult<any>,
  nonprofitRes: PromiseSettledResult<any>,
  propertyRes: PromiseSettledResult<any>,
  companyRes: PromiseSettledResult<any>,
  verification?: import("./verification").VerificationResult,
  reverifyRes?: import("./providers/reverify").ReverifyResult,
  companySiteRes?: PromiseSettledResult<any>,
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
      updates.net_worth_range = extracted.net_worth_signals.join("; ");
      updates.net_worth_confidence = "Low — web mention";
      // Estimate net worth from company revenue if available
      const revSignal = extracted.net_worth_signals.find((s: string) => /revenue/i.test(s));
      if (revSignal) {
        const revNum = revSignal.match(/\$\s*([\d,.]+)\s*(million|billion|m|b)/i);
        if (revNum) {
          let revVal = parseFloat(revNum[1].replace(/,/g, ""));
          if (/billion|b/i.test(revNum[2])) revVal *= 1000;
          // Private company owner: est. net worth = 0.5-1.5x revenue (use 1x as midpoint)
          updates.estimated_net_worth = `$${revVal.toFixed(1)} million (est. from company revenue)`;
          updates.net_worth_confidence = "Medium — company revenue";
        }
      }
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

  // Reverify deep dive data
  if (reverifyRes) {
    // Court records summary
    if (reverifyRes.court_records.length > 0) {
      updates.court_records = JSON.stringify(reverifyRes.court_records);
    }
    // Professional history
    if (reverifyRes.professional_history.length > 0) {
      updates.professional_history = JSON.stringify(reverifyRes.professional_history);
    }
    // Relatives/associates — clean junk entries
    if (reverifyRes.relatives.length > 0) {
      const cleanRels = [...new Set(reverifyRes.relatives)].filter(r => {
        const words = r.split(/\s+/);
        if (words.length < 2) return false; // need first + last
        if (!/^[A-Z]/.test(words[0])) return false; // first word capitalized
        const junk = /^(named|any|the|our|his|her|their|this|about|eligibility|determination|information)/i;
        return !junk.test(words[0]);
      });
      if (cleanRels.length > 0) updates.relatives = JSON.stringify(cleanRels);
    }
    // Additional properties
    if (reverifyRes.additional_properties.length > 0) {
      updates.additional_properties = JSON.stringify(reverifyRes.additional_properties);
    }
    // Age from reverify (higher confidence than web)
    if (reverifyRes.age_estimates.length > 0 && !updates.age) {
      updates.age = reverifyRes.age_estimates[0];
    }
    // Additional addresses from reverify
    if (reverifyRes.additional_addresses.length > 0) {
      const existing = verification?.personal?.secondary_addresses || [];
      const all = [...new Set([...existing, ...reverifyRes.additional_addresses])];
      updates.secondary_addresses = JSON.stringify(all);
    }
    // Confirmations count
    if (reverifyRes.confirmations.length > 0) {
      const confirmed = reverifyRes.confirmations.filter(c => c.confirmed).length;
      updates.reverify_status = `${confirmed}/${reverifyRes.confirmations.length} confirmed`;
    }
  }

  // Company website data
  if (companySiteRes?.status === "fulfilled" && companySiteRes.value) {
    const cs = companySiteRes.value;
    // Set city/state from company HQ if not already known
    if (cs.company_info?.headquarters) {
      const parts = cs.company_info.headquarters.split(",").map((s: string) => s.trim());
      if (parts[0] && !updates.city) updates.city = parts[0];
      if (parts[1] && !updates.state) updates.state = parts[1];
    }
    // Set company name
    if (cs.company_info?.name && !updates.company) updates.company = cs.company_info.name;
    // Set occupation from lead's OWN entry in leadership (match by name, not just family)
    const nameParts = fullName.toLowerCase().split(/\s+/);
    const selfEntry = cs.leadership?.find((l: any) => {
      const lName = l.name.toLowerCase();
      return nameParts.every((p: string) => lName.includes(p));
    });
    if (selfEntry?.title && !updates.occupation) updates.occupation = selfEntry.title;
    // Spouse: first check family_members for wife/husband/spouse tag
    const spouseFromFamily = cs.family_members?.find((f: string) => /\(wife\)|\(husband\)|\(spouse\)/i.test(f));
    if (spouseFromFamily && !updates.spouse_name) {
      updates.spouse_name = spouseFromFamily.replace(/\s*\(.*\)\s*$/, "").trim();
    }
    // If no explicit spouse tag, check if "Chairwoman" or "Chairman" in leadership is a different-named family member
    if (!updates.spouse_name) {
      const spouseFromLeadership = cs.leadership?.find((l: any) =>
        l.relation === "family" && /chairwoman|chairman/i.test(l.title)
        && !nameParts.every((p: string) => l.name.toLowerCase().includes(p))
      );
      if (spouseFromLeadership) updates.spouse_name = spouseFromLeadership.name;
    }
    // Relatives
    if (cs.family_members?.length > 0 && !updates.relatives) {
      const cleanFam = cs.family_members.filter((f: string) => {
        const name = f.replace(/\s*\(.*\)\s*$/, ""); // strip "(son)" etc
        const words = name.split(/\s+/);
        if (words.length < 2) return false;
        const junk = /^(Solutions|Greater|Named|Any|About|Contact|Joined)/i;
        return !junk.test(words[0]);
      });
      if (cleanFam.length > 0) updates.relatives = JSON.stringify(cleanFam);
    }
    // LinkedIn from leadership
    if (cs.linkedin && !updates.linkedin_url) updates.linkedin_url = cs.linkedin;
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
