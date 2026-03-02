/**
 * Intel Scoring Engine
 * Computes a 0-100 Credibility & Capital Probability Score
 * from enrichment sources using admin-editable weights.
 */

import {
  getActiveWeights,
  getSourcesByProfile,
  upsertProfile,
  logAuditEvent,
  scoreBand,
  type EnrichmentSource,
  type ScoreWeight,
  type IdentityLayer,
  type CapitalLayer,
  type RiskLayer,
  type EngagementLayer,
} from "./storage";

export type ScoreResult = {
  score: number;
  band: string;
  // 5-layer sub-scores (0-100 each)
  identity_score: number;
  capital_score: number;
  risk_score: number;
  digital_score: number;
  engagement_score: number;
  breakdown: { factor: string; label: string; points: number; source_ids: number[]; reason: string; category: string }[];
  flags: string[];
};

// ─── Main Scoring Function ──────────────────────────────────────────

export function computeScore(profileId: number, leadId: number): ScoreResult {
  const weights = getActiveWeights();
  const sources = getSourcesByProfile(profileId);

  const breakdown: ScoreResult["breakdown"] = [];
  const flags: string[] = [];

  // Index sources by data_key for fast lookup
  const sourcesByKey = new Map<string, EnrichmentSource[]>();
  for (const s of sources) {
    const list = sourcesByKey.get(s.data_key) || [];
    list.push(s);
    sourcesByKey.set(s.data_key, list);
  }

  // Map factors to the 5-layer display categories
  const layerMap: Record<string, string> = {
    verified_business_ownership: "identity", csuite_role: "identity",
    multi_year_history: "identity", cross_source_match: "identity",
    verified_employer: "identity", verified_location: "identity",
    property_ownership: "capital", aircraft_registration: "capital",
    vessel_registration: "capital", prior_company_exit: "capital",
    political_donor: "capital", charity_board_member: "capital",
    nonprofit_officer: "capital", wealth_signal: "capital",
    prior_bankruptcy: "risk", fraud_litigation: "risk",
    sanctions_flag: "risk", regulatory_action: "risk", litigation_frequent: "risk",
    social_presence: "digital", news_coverage: "digital",
    web_executive_mention: "digital", media_presence: "digital",
    specific_inquiry: "engagement", fast_response: "engagement",
    professional_tone: "engagement", yacht_club_member: "engagement",
  };

  // Max possible points per layer (for normalization)
  const layerMaxPositive: Record<string, number> = { identity: 0, capital: 0, risk: 0, digital: 0, engagement: 0 };
  const layerEarned: Record<string, number> = { identity: 0, capital: 0, risk: 0, digital: 0, engagement: 0 };

  // Calculate max possible positive points per layer
  for (const w of weights) {
    const layer = layerMap[w.factor] || w.category;
    if (w.points > 0) {
      layerMaxPositive[layer] = (layerMaxPositive[layer] || 0) + w.points;
    }
  }

  // Evaluate each active weight factor
  for (const w of weights) {
    const match = evaluateFactor(w, sourcesByKey);
    if (match.matched) {
      const layer = layerMap[w.factor] || w.category;
      breakdown.push({
        factor: w.factor, label: w.label, points: w.points,
        source_ids: match.source_ids, reason: match.reason, category: layer,
      });
      layerEarned[layer] = (layerEarned[layer] || 0) + w.points;
      if (w.points < 0) {
        flags.push(`⚠️ ${w.label}: ${match.reason}`);
      }
    }
  }

  // Compute sub-scores (0-100 each)
  const subScore = (layer: string): number => {
    const max = layerMaxPositive[layer] || 1;
    const earned = layerEarned[layer] || 0;
    // For risk, invert: no risk factors = 100 (clean), all risk = 0
    if (layer === "risk") {
      return Math.max(0, Math.min(100, 100 + Math.round((earned / 40) * 100)));
    }
    // For positive layers, scale earned points to 0-100
    return Math.max(0, Math.min(100, Math.round((earned / max) * 100)));
  };

  const identity_score = subScore("identity");
  const capital_score = subScore("capital");
  const risk_score = subScore("risk");
  const digital_score = subScore("digital");
  const engagement_score = subScore("engagement");

  // Overall score = weighted blend of 5 layers
  const overall = Math.round(
    identity_score * 0.25 +
    capital_score * 0.30 +
    risk_score * 0.20 +
    digital_score * 0.10 +
    engagement_score * 0.15
  );
  const score = Math.max(0, Math.min(100, overall));
  const band = scoreBand(score);

  if (flags.some(f => f.includes("Sanctions"))) {
    flags.unshift("🚨 CRITICAL: OFAC sanctions match — DO NOT PROCEED without compliance review");
  }

  return { score, band, identity_score, capital_score, risk_score, digital_score, engagement_score, breakdown, flags };
}

// ─── Factor Evaluation ──────────────────────────────────────────────

type FactorResult = {
  matched: boolean;
  source_ids: number[];
  reason: string;
};

function evaluateFactor(weight: ScoreWeight, sources: Map<string, EnrichmentSource[]>): FactorResult {
  const no: FactorResult = { matched: false, source_ids: [], reason: "" };

  switch (weight.factor) {
    case "verified_business_ownership": {
      const hits = sources.get("business_ownership") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits.length} business(es) found` };
      }
      return no;
    }
    case "csuite_role": {
      const hits = sources.get("corporate_role") || [];
      const csuite = hits.filter(h => {
        const val = h.data_value.toLowerCase();
        return /\b(ceo|cfo|cto|coo|president|chairman|founder|partner|managing director)\b/.test(val);
      });
      if (csuite.length > 0) {
        return { matched: true, source_ids: csuite.map(h => h.id), reason: csuite[0].data_value };
      }
      return no;
    }
    case "multi_year_history": {
      const hits = sources.get("years_active") || [];
      const years = hits.length > 0 ? parseInt(hits[0].data_value, 10) : 0;
      if (years >= 5) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${years} years in business` };
      }
      return no;
    }
    case "cross_source_match": {
      const hits = sources.get("cross_source_match") || [];
      if (hits.length > 0 && parseInt(hits[0].data_value, 10) >= 70) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits[0].data_value}% consistency` };
      }
      return no;
    }
    case "property_ownership": {
      const hits = sources.get("property_ownership") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits.length} property record(s)` };
      }
      return no;
    }
    case "aircraft_registration": {
      const hits = sources.get("aircraft_registration") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `FAA: ${hits[0].data_value}` };
      }
      return no;
    }
    case "vessel_registration": {
      const hits = sources.get("vessel_registration") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `USCG: ${hits[0].data_value}` };
      }
      return no;
    }
    case "prior_company_exit": {
      const hits = sources.get("company_exit") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "media_presence": {
      const hits = sources.get("media_mention") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits.length} mention(s)` };
      }
      return no;
    }
    // Risk factors
    case "prior_bankruptcy": {
      const hits = sources.get("bankruptcy_flag") || [];
      const flagged = hits.filter(h => h.data_value === "true" || h.data_value === "1");
      if (flagged.length > 0) {
        return { matched: true, source_ids: flagged.map(h => h.id), reason: "Bankruptcy record found" };
      }
      return no;
    }
    case "fraud_litigation": {
      const hits = sources.get("fraud_indicator") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "sanctions_flag": {
      const hits = sources.get("sanctions_flag") || [];
      const flagged = hits.filter(h => h.data_value === "true" || h.data_value === "1");
      if (flagged.length > 0) {
        return { matched: true, source_ids: flagged.map(h => h.id), reason: "OFAC SDN match" };
      }
      return no;
    }
    case "regulatory_action": {
      const hits = sources.get("regulatory_action") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "litigation_frequent": {
      const hits = sources.get("litigation_count") || [];
      const count = hits.length > 0 ? parseInt(hits[0].data_value, 10) : 0;
      if (count >= 3) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${count} cases` };
      }
      return no;
    }
    // Engagement factors
    case "specific_inquiry": {
      const hits = sources.get("inquiry_specificity") || [];
      if (hits.length > 0 && hits[0].data_value === "specific") {
        return { matched: true, source_ids: hits.map(h => h.id), reason: "Specific vessel inquiry" };
      }
      return no;
    }
    case "fast_response": {
      const hits = sources.get("response_time") || [];
      const hours = hits.length > 0 ? parseFloat(hits[0].data_value) : Infinity;
      if (hours < 24) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hours.toFixed(1)}h avg response` };
      }
      return no;
    }
    case "professional_tone": {
      const hits = sources.get("email_tone") || [];
      if (hits.length > 0 && hits[0].data_value === "professional") {
        return { matched: true, source_ids: hits.map(h => h.id), reason: "Professional email tone" };
      }
      return no;
    }
    // ── NEW: FEC & Social factors ──
    case "political_donor": {
      const hits = sources.get("political_donations") || [];
      if (hits.length > 0) {
        try {
          const d = JSON.parse(hits[0].data_value);
          return { matched: true, source_ids: hits.map(h => h.id), reason: `$${(d.total || 0).toLocaleString()} in ${d.count || 0} donations` };
        } catch { return { matched: true, source_ids: hits.map(h => h.id), reason: "Political donations found" }; }
      }
      return no;
    }
    case "verified_employer": {
      const hits = sources.get("employer") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "verified_location": {
      const hits = sources.get("location") || [];
      if (hits.length > 0) {
        try {
          const loc = JSON.parse(hits[0].data_value);
          return { matched: true, source_ids: hits.map(h => h.id), reason: `${loc.city}, ${loc.state}` };
        } catch { return { matched: true, source_ids: hits.map(h => h.id), reason: "Location verified" }; }
      }
      return no;
    }
    case "social_presence": {
      const linkedIn = sources.get("social_linkedin") || [];
      const fb = sources.get("social_facebook") || [];
      const ig = sources.get("social_instagram") || [];
      const tw = sources.get("social_twitterx") || [];
      const all = [...linkedIn, ...fb, ...ig, ...tw];
      if (all.length > 0) {
        const names = [];
        if (linkedIn.length) names.push("LinkedIn");
        if (fb.length) names.push("Facebook");
        if (ig.length) names.push("Instagram");
        if (tw.length) names.push("Twitter");
        return { matched: true, source_ids: all.map(h => h.id), reason: names.join(", ") };
      }
      return no;
    }
    case "news_coverage": {
      const hits = sources.get("news_mention") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits.length} news article(s)` };
      }
      return no;
    }
    case "web_executive_mention": {
      const hits = sources.get("web_title") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "yacht_club_member": {
      const hits = sources.get("yacht_club") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "charity_board_member": {
      const hits = sources.get("charity_board") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: `${hits.length} board seat(s)` };
      }
      return no;
    }
    case "nonprofit_officer": {
      const hits = sources.get("nonprofit_role") || [];
      if (hits.length > 0) {
        try {
          const d = JSON.parse(hits[0].data_value);
          return { matched: true, source_ids: hits.map(h => h.id), reason: `${d.role} at ${d.name}` };
        } catch { return { matched: true, source_ids: hits.map(h => h.id), reason: "Nonprofit officer" }; }
      }
      return no;
    }
    case "wealth_signal": {
      const hits = sources.get("wealth_signal") || [];
      if (hits.length > 0) {
        return { matched: true, source_ids: hits.map(h => h.id), reason: hits[0].data_value };
      }
      return no;
    }
    case "home_ownership": {
      const hits = [...(sources.get("property_search") || []), ...(sources.get("home_value") || [])];
      if (hits.length > 0) {
        const valHit = sources.get("home_value")?.[0];
        return { matched: true, source_ids: hits.map(h => h.id), reason: valHit ? `Est. ${valHit.data_value}` : "Property record found" };
      }
      return no;
    }
    case "company_verified": {
      const hits = sources.get("company_profile") || [];
      if (hits.length > 0) {
        try {
          const co = JSON.parse(hits[0].data_value);
          return { matched: true, source_ids: hits.map(h => h.id), reason: `${co.name}${co.revenue ? ` — ${co.revenue}` : ""}` };
        } catch { return { matched: true, source_ids: hits.map(h => h.id), reason: "Company verified" }; }
      }
      return no;
    }
    default:
      return no;
  }
}

// ─── Apply Score to Profile ─────────────────────────────────────────

export function scoreAndSave(profileId: number, leadId: number): ScoreResult {
  const result = computeScore(profileId, leadId);

  upsertProfile(leadId, {
    score: result.score,
    score_band: result.band,
    score_breakdown: JSON.stringify(result.breakdown),
    identity_score: result.identity_score,
    capital_score: result.capital_score,
    risk_score: result.risk_score,
    digital_score: result.digital_score,
    engagement_score: result.engagement_score,
    enrichment_status: "complete",
    last_enriched_at: new Date().toISOString(),
  });

  logAuditEvent(leadId, "score_computed", "system", {
    score: result.score,
    band: result.band,
    identity: result.identity_score,
    capital: result.capital_score,
    risk: result.risk_score,
    digital: result.digital_score,
    engagement: result.engagement_score,
    factors_matched: result.breakdown.length,
    flags: result.flags.length,
  });

  return result;
}
