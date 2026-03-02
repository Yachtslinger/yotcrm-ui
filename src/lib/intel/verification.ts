/**
 * Identity Verification & Net Worth Aggregation Engine
 * 
 * Cross-references data from all providers to:
 * 1. Confirm we have the right person (identity confidence 0-100)
 * 2. Estimate total net worth from all discoverable assets
 * 3. Extract personal details (spouse, age, addresses)
 */

import { getSourcesByProfile, addSource, logAuditEvent } from "./storage";

export type VerificationResult = {
  identity_confidence: number;
  verifications: VerificationCheck[];
  estimated_net_worth: string;
  net_worth_breakdown: NetWorthComponent[];
  net_worth_low: number;
  net_worth_high: number;
  personal: {
    date_of_birth: string;
    age: string;
    spouse_name: string;
    spouse_employer: string;
    primary_address: string;
    secondary_addresses: string[];
  };
};

export type VerificationCheck = {
  method: string;
  result: "confirmed" | "partial" | "mismatch" | "not_found";
  detail: string;
  weight: number; // 0-20 confidence points
};

export type NetWorthComponent = {
  category: string;
  label: string;
  low: number;
  high: number;
  confidence: "high" | "medium" | "low" | "estimated";
  source: string;
};

// ─── Cross-Verify Identity ──────────────────────────────────────────

export function crossVerifyIdentity(
  profileId: number,
  leadId: number,
  leadName: string,
  leadEmail: string,
  leadCity?: string,
  leadState?: string,
): VerificationResult {
  const sources = getSourcesByProfile(profileId);
  const checks: VerificationCheck[] = [];
  const personal = {
    date_of_birth: "", age: "", spouse_name: "", spouse_employer: "",
    primary_address: "", secondary_addresses: [] as string[],
  };

  // Index sources
  const byKey = new Map<string, any[]>();
  for (const s of sources) {
    const list = byKey.get(s.data_key) || [];
    list.push(s);
    byKey.set(s.data_key, list);
  }

  const nameParts = leadName.toLowerCase().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1] || "";

  // ─── CHECK 1: Name appears in FEC records ───
  const fecEmployer = byKey.get("employer")?.[0];
  const fecOccupation = byKey.get("occupation")?.[0];
  if (fecEmployer || fecOccupation) {
    checks.push({
      method: "FEC Name Match",
      result: "confirmed",
      detail: `Name matched in FEC donation records${fecEmployer ? ` — employer: ${fecEmployer.data_value}` : ""}`,
      weight: 15,
    });
  } else {
    checks.push({ method: "FEC Name Match", result: "not_found", detail: "No FEC donation records for this name", weight: 0 });
  }

  // ─── CHECK 2: Name appears in business registries ───
  const bizOwnership = byKey.get("business_ownership") || [];
  const corpRoles = byKey.get("corporate_role") || [];
  if (bizOwnership.length > 0 || corpRoles.length > 0) {
    const companies = [...bizOwnership, ...corpRoles].map(s => {
      try { const d = JSON.parse(s.data_value); return d.company || d.title || s.data_value; } catch { return s.data_value; }
    });
    checks.push({
      method: "Business Registry Match",
      result: "confirmed",
      detail: `Found in ${bizOwnership.length + corpRoles.length} business records: ${companies.slice(0, 3).join(", ")}`,
      weight: 12,
    });
  } else {
    checks.push({ method: "Business Registry Match", result: "not_found", detail: "No corporate records found", weight: 0 });
  }

  // ─── CHECK 3: Location cross-reference ───
  const fecLocation = byKey.get("location")?.[0];
  let fecCity = "", fecState = "";
  if (fecLocation) {
    try { const loc = JSON.parse(fecLocation.data_value); fecCity = loc.city || ""; fecState = loc.state || ""; } catch { /* */ }
  }
  if (fecCity && leadCity) {
    const cityMatch = fecCity.toLowerCase().includes(leadCity.toLowerCase()) || leadCity.toLowerCase().includes(fecCity.toLowerCase());
    checks.push({
      method: "Location Cross-Reference",
      result: cityMatch ? "confirmed" : "mismatch",
      detail: cityMatch ? `FEC location (${fecCity}, ${fecState}) matches lead location` : `FEC: ${fecCity}, ${fecState} vs Lead: ${leadCity}, ${leadState}`,
      weight: cityMatch ? 10 : -5,
    });
  } else if (fecCity) {
    personal.primary_address = `${fecCity}, ${fecState}`;
    checks.push({ method: "Location Cross-Reference", result: "partial", detail: `FEC location: ${fecCity}, ${fecState} (no lead location to compare)`, weight: 5 });
  }

  // ─── CHECK 4: Email domain matches employer ───
  const domainBiz = byKey.get("business_ownership")?.find(s => s.source_type === "domain");
  if (domainBiz && fecEmployer) {
    try {
      const domainInfo = JSON.parse(domainBiz.data_value);
      const domainCompany = (domainInfo.company || domainInfo.domain || "").toLowerCase();
      const employer = fecEmployer.data_value.toLowerCase();
      const match = employer.includes(domainCompany) || domainCompany.includes(employer.split(/\s+/)[0]);
      checks.push({
        method: "Email-Employer Cross-Match",
        result: match ? "confirmed" : "partial",
        detail: match ? `Email domain company matches FEC employer` : `Email: ${domainCompany}, FEC employer: ${employer}`,
        weight: match ? 15 : 3,
      });
    } catch { /* */ }
  }

  // ─── CHECK 5: Social media profile names match ───
  const socialSources = sources.filter(s => s.data_key?.startsWith("social_"));
  const confirmedSocial = socialSources.filter(s => {
    try {
      const d = JSON.parse(s.data_value);
      const displayName = (d.display_name || d.name || "").toLowerCase();
      return displayName.includes(lastName);
    } catch { return false; }
  });
  if (confirmedSocial.length > 0) {
    checks.push({
      method: "Social Media Name Match",
      result: "confirmed",
      detail: `Name confirmed on ${confirmedSocial.length} social platform(s)`,
      weight: 8,
    });
  }

  // ─── CHECK 6: USCG/FAA records — name confirmation ───
  const vessels = byKey.get("vessel_registration") || [];
  const aircraft = byKey.get("aircraft_registration") || [];
  if (vessels.length > 0 || aircraft.length > 0) {
    checks.push({
      method: "Federal Registry Match",
      result: "confirmed",
      detail: `${vessels.length} USCG vessel(s), ${aircraft.length} FAA aircraft — federal records confirm identity`,
      weight: 18,
    });
  }

  // ─── CHECK 7: Multiple independent sources agree on employer ───
  const employerSources = new Set<string>();
  if (fecEmployer) employerSources.add("fec");
  if (domainBiz) employerSources.add("domain");
  const webTitles = byKey.get("web_title") || [];
  if (webTitles.length > 0) employerSources.add("web");
  const companyProfiles = byKey.get("company_profile") || [];
  if (companyProfiles.length > 0) employerSources.add("company");
  if (employerSources.size >= 2) {
    checks.push({
      method: "Multi-Source Employer Verification",
      result: "confirmed",
      detail: `Employer confirmed by ${employerSources.size} independent sources: ${[...employerSources].join(", ")}`,
      weight: 12,
    });
  }

  // ─── CHECK 8: Personal details from web search ───
  const spouseSrc = byKey.get("spouse_name")?.[0];
  const ageSrc = byKey.get("person_age")?.[0];
  const dobSrc = byKey.get("date_of_birth")?.[0];
  const addressSrc = byKey.get("secondary_address") || [];
  if (spouseSrc) personal.spouse_name = spouseSrc.data_value;
  if (ageSrc) personal.age = ageSrc.data_value;
  if (dobSrc) personal.date_of_birth = dobSrc.data_value;
  if (addressSrc.length > 0) {
    personal.secondary_addresses = addressSrc.map((s: any) => s.data_value);
  }

  // Extract spouse employer from web
  const spouseEmpSrc = byKey.get("spouse_employer")?.[0];
  if (spouseEmpSrc) personal.spouse_employer = spouseEmpSrc.data_value;

  // ─── CHECK 9: Reverification confirmations ───
  const reverifyConfirmations = (byKey.get("reverify_confirmation") || []);
  let confirmedCount = 0;
  let totalReverifyChecks = 0;
  for (const rc of reverifyConfirmations) {
    try {
      const conf = JSON.parse(rc.data_value);
      totalReverifyChecks++;
      if (conf.confirmed) confirmedCount++;
    } catch { /* */ }
  }
  if (totalReverifyChecks > 0) {
    const allConfirmed = confirmedCount === totalReverifyChecks;
    checks.push({
      method: "Targeted Re-Verification",
      result: allConfirmed ? "confirmed" : confirmedCount > 0 ? "partial" : "mismatch",
      detail: `${confirmedCount}/${totalReverifyChecks} data points confirmed by targeted follow-up searches`,
      weight: allConfirmed ? 15 : confirmedCount > 0 ? 8 : -3,
    });
  }

  // ─── CHECK 10: Court records found (risk signal) ───
  const courtRecords = byKey.get("court_record") || [];
  if (courtRecords.length > 0) {
    const types = courtRecords.map(cr => {
      try { return JSON.parse(cr.data_value).type; } catch { return "Unknown"; }
    });
    const hasBankruptcy = types.includes("Bankruptcy");
    const hasLien = types.includes("Lien") || types.includes("Foreclosure");
    checks.push({
      method: "Court Record Check",
      result: hasBankruptcy || hasLien ? "mismatch" : "partial",
      detail: `${courtRecords.length} court record(s) found: ${[...new Set(types)].join(", ")}`,
      weight: hasBankruptcy ? -5 : hasLien ? -3 : 0,
    });
  }

  // ─── CHECK 11: Relatives / associates confirm identity ───
  const relatives = byKey.get("relative") || [];
  if (relatives.length > 0) {
    checks.push({
      method: "Associates/Relatives Found",
      result: "confirmed",
      detail: `${relatives.length} known associates/relatives discovered`,
      weight: 5,
    });
  }

  // ─── CHECK 12: Multiple addresses confirm real person ───
  const allAddresses = byKey.get("secondary_address") || [];
  if (allAddresses.length > 0) {
    checks.push({
      method: "Multiple Addresses Found",
      result: "confirmed",
      detail: `${allAddresses.length} additional address(es) discovered`,
      weight: 5,
    });
  }

  // Build primary address from best available data
  if (!personal.primary_address && fecCity) {
    const fecZip = byKey.get("location")?.[0]?.data_value;
    try {
      const loc = JSON.parse(fecZip || "{}");
      personal.primary_address = `${loc.city || ""}, ${loc.state || ""} ${loc.zip || ""}`.trim();
    } catch {
      personal.primary_address = `${fecCity}, ${fecState}`;
    }
  }

  // ─── COMPUTE IDENTITY CONFIDENCE ───
  const totalWeight = checks.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  const maxPossible = 120; // Perfect score across all 12 checks
  const identity_confidence = Math.min(100, Math.round((totalWeight / maxPossible) * 100));

  // ─── COMPUTE NET WORTH ───
  const nw = aggregateNetWorth(sources, byKey);

  // Store verification results as enrichment source
  addSource({
    profile_id: profileId, lead_id: leadId,
    source_type: "verification", source_url: "",
    source_label: `Identity Confidence: ${identity_confidence}% (${checks.filter(c => c.result === "confirmed").length}/${checks.length} checks passed)`,
    layer: "identity", data_key: "identity_confidence",
    data_value: JSON.stringify({ confidence: identity_confidence, checks_passed: checks.filter(c => c.result === "confirmed").length, total_checks: checks.length }),
    confidence: identity_confidence, fetched_at: new Date().toISOString(),
  });

  if (nw.estimated_net_worth) {
    addSource({
      profile_id: profileId, lead_id: leadId,
      source_type: "aggregation", source_url: "",
      source_label: `Estimated Net Worth: ${nw.estimated_net_worth}`,
      layer: "capital", data_key: "net_worth_estimate",
      data_value: JSON.stringify({ estimate: nw.estimated_net_worth, low: nw.low, high: nw.high, components: nw.breakdown.length }),
      confidence: nw.confidence_pct, fetched_at: new Date().toISOString(),
    });
  }

  logAuditEvent(leadId, "identity_verified", "system", {
    confidence: identity_confidence,
    checks_passed: checks.filter(c => c.result === "confirmed").length,
    net_worth_estimate: nw.estimated_net_worth,
    personal_details_found: Object.values(personal).filter(v => v && (Array.isArray(v) ? v.length > 0 : true)).length,
  });

  return {
    identity_confidence,
    verifications: checks,
    estimated_net_worth: nw.estimated_net_worth,
    net_worth_breakdown: nw.breakdown,
    net_worth_low: nw.low,
    net_worth_high: nw.high,
    personal,
  };
}

// ─── Net Worth Aggregation ──────────────────────────────────────────

function aggregateNetWorth(
  sources: any[],
  byKey: Map<string, any[]>,
): { estimated_net_worth: string; breakdown: NetWorthComponent[]; low: number; high: number; confidence_pct: number } {
  const components: NetWorthComponent[] = [];
  let totalLow = 0;
  let totalHigh = 0;

  // 1. Property values
  const homeValue = byKey.get("home_value")?.[0];
  if (homeValue) {
    const val = parseMoneyValue(homeValue.data_value);
    if (val > 0) {
      const low = Math.round(val * 0.8);
      const high = Math.round(val * 1.2);
      components.push({ category: "Real Estate", label: "Primary Home", low, high, confidence: "medium", source: "Zillow/Web" });
      totalLow += low; totalHigh += high;
    }
  }

  // Additional properties from secondary_address sources
  const propSearches = byKey.get("property_search") || [];
  for (const ps of propSearches) {
    try {
      const d = JSON.parse(ps.data_value);
      if (d.estimated_value && d.is_secondary) {
        const val = parseMoneyValue(d.estimated_value);
        if (val > 0) {
          components.push({ category: "Real Estate", label: `Property: ${d.address?.city || "Secondary"}`, low: Math.round(val * 0.8), high: Math.round(val * 1.2), confidence: "low", source: "Web" });
          totalLow += Math.round(val * 0.8); totalHigh += Math.round(val * 1.2);
        }
      }
    } catch { /* */ }
  }

  // 1b. Additional properties from reverify deep dive
  const additionalProps = byKey.get("additional_property") || [];
  for (const ap of additionalProps) {
    try {
      const d = JSON.parse(ap.data_value);
      if (d.estimated_value) {
        const val = parseMoneyValue(d.estimated_value);
        if (val > 0) {
          components.push({ category: "Real Estate", label: `${d.type || "Property"}: ${d.address || "Additional"}`, low: Math.round(val * 0.7), high: Math.round(val * 1.3), confidence: "low", source: "Web/Reverify" });
          totalLow += Math.round(val * 0.7); totalHigh += Math.round(val * 1.3);
        }
      }
    } catch { /* */ }
  }

  // 2. Vessel registrations — estimate value
  const vessels = byKey.get("vessel_registration") || [];
  if (vessels.length > 0) {
    // Conservative: each registered vessel = $100K-$5M range depending on data
    for (const v of vessels) {
      const vesselName = v.data_value || "Registered Vessel";
      components.push({ category: "Vessels", label: vesselName, low: 100000, high: 5000000, confidence: "estimated", source: "USCG" });
      totalLow += 100000; totalHigh += 5000000;
    }
  }

  // 3. Aircraft registrations — estimate value
  const aircraft = byKey.get("aircraft_registration") || [];
  if (aircraft.length > 0) {
    for (const a of aircraft) {
      components.push({ category: "Aircraft", label: `N${a.data_value || "Aircraft"}`, low: 200000, high: 20000000, confidence: "estimated", source: "FAA" });
      totalLow += 200000; totalHigh += 20000000;
    }
  }

  // 4. Political donations — imply minimum liquid assets
  const donationSrc = byKey.get("political_donations")?.[0];
  if (donationSrc) {
    try {
      const d = JSON.parse(donationSrc.data_value);
      const totalDonated = d.total || 0;
      if (totalDonated > 0) {
        // Donors typically give 1-5% of net worth; use 3% as midpoint
        const impliedLow = Math.round(totalDonated * 15);  // ~6.5% (very generous donor)
        const impliedHigh = Math.round(totalDonated * 100); // ~1% (minimal donor)
        components.push({ category: "Implied (Donations)", label: `$${totalDonated.toLocaleString()} in FEC donations`, low: impliedLow, high: impliedHigh, confidence: "estimated", source: "FEC" });
        totalLow += impliedLow; totalHigh += impliedHigh;
      }
    } catch { /* */ }
  }

  // 5. Nonprofit compensation — implies income level
  const nonprofitRoles = byKey.get("nonprofit_role") || [];
  for (const nr of nonprofitRoles) {
    try {
      const d = JSON.parse(nr.data_value);
      if (d.compensation > 0) {
        // Compensation implies net worth of 5-20x annual comp
        const low = d.compensation * 5;
        const high = d.compensation * 20;
        components.push({ category: "Implied (Compensation)", label: `${d.role} at ${d.name}: $${d.compensation.toLocaleString()}/yr`, low, high, confidence: "estimated", source: "IRS 990" });
        totalLow += low; totalHigh += high;
      }
    } catch { /* */ }
  }

  // 6. Company ownership/executive role — estimate
  const companyProfiles = byKey.get("company_profile") || [];
  for (const cp of companyProfiles) {
    try {
      const co = JSON.parse(cp.data_value);
      if (co.revenue) {
        const rev = parseMoneyValue(co.revenue);
        if (rev > 0 && (co.type === "owned" || co.type === "officer")) {
          const multiplier = co.type === "owned" ? 1.0 : 0.05; // owners get full equity estimate, officers get 5%
          components.push({
            category: "Business Equity", label: `${co.name} (${co.role})`,
            low: Math.round(rev * 0.5 * multiplier), high: Math.round(rev * 5 * multiplier),
            confidence: "estimated", source: co.source || "Web",
          });
          totalLow += Math.round(rev * 0.5 * multiplier);
          totalHigh += Math.round(rev * 5 * multiplier);
        }
      }
    } catch { /* */ }
  }

  // 7. Wealth signals from web search
  const wealthSignals = byKey.get("wealth_signal") || [];
  for (const ws of wealthSignals) {
    const val = parseMoneyValue(ws.data_value);
    if (val > 0) {
      components.push({ category: "Web Signal", label: ws.data_value, low: Math.round(val * 0.7), high: Math.round(val * 1.5), confidence: "low", source: "Web" });
      // Don't double-count wealth signals if we already have components
      if (components.length <= 2) {
        totalLow += Math.round(val * 0.7); totalHigh += Math.round(val * 1.5);
      }
    }
  }

  // Format estimate
  const midpoint = Math.round((totalLow + totalHigh) / 2);
  const estimated_net_worth = midpoint > 0 ? formatNetWorth(totalLow, totalHigh) : "";

  // Confidence based on number and quality of components
  const highConfCount = components.filter(c => c.confidence === "high" || c.confidence === "medium").length;
  const confidence_pct = Math.min(85, highConfCount * 20 + components.length * 5);

  return { estimated_net_worth, breakdown: components, low: totalLow, high: totalHigh, confidence_pct };
}

function parseMoneyValue(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[$,]/g, "").trim().toLowerCase();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  if (cleaned.includes("billion") || cleaned.includes("b")) return num * 1000000000;
  if (cleaned.includes("million") || cleaned.includes("m")) return num * 1000000;
  if (cleaned.includes("k")) return num * 1000;
  return num;
}

function formatNetWorth(low: number, high: number): string {
  const fmt = (n: number): string => {
    if (n >= 1000000000) return `$${(n / 1000000000).toFixed(1)}B`;
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  return `${fmt(low)} — ${fmt(high)}`;
}
