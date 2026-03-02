"use client";

import React, { useState } from "react";
import {
  Shield, ExternalLink, Building2, Ship, Plane, Globe,
  Linkedin, DollarSign, Activity, MapPin, Briefcase,
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Home, Users, Award, Newspaper, BookOpen, Anchor,
  Scale, Clock, UserCheck, History,
} from "lucide-react";

type DossierProps = {
  lead: any;
  intel: any;
  sources: any[];
  leadName: string;
  onRunEnrich: () => void;
  enriching: boolean;
};

export default function Dossier({ lead, intel, sources, leadName, onRunEnrich, enriching }: DossierProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview", "financial", "companies", "property", "personal"]));
  const [showAllSources, setShowAllSources] = useState(false);

  const toggle = (s: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  // ─── Parse all source data ───
  const byKey = new Map<string, any[]>();
  for (const s of sources) {
    const list = byKey.get(s.data_key) || [];
    list.push(s);
    byKey.set(s.data_key, list);
  }

  const identity = intel?.identity_data || {};
  const capital = intel?.capital_data || {};
  const risk = intel?.risk_data || {};
  const breakdown = intel?.score_breakdown || [];
  const score = intel?.score ?? null;
  const band = intel?.score_band || "";

  // FEC data
  const employerSrc = sources.find((s: any) => s.data_key === "employer" && s.source_type === "fec");
  const occupationSrc = sources.find((s: any) => s.data_key === "occupation" && s.source_type === "fec");
  const locationSrc = sources.find((s: any) => s.data_key === "location" && s.source_type === "fec");
  const donationSrc = sources.find((s: any) => s.data_key === "political_donations");
  const donationDetails = sources.filter((s: any) => s.data_key === "donation_detail");
  let locationInfo: any = {};
  try { if (locationSrc) locationInfo = JSON.parse(locationSrc.data_value); } catch { /* */ }
  let donationInfo: any = {};
  try { if (donationSrc) donationInfo = JSON.parse(donationSrc.data_value); } catch { /* */ }

  // Domain
  const domainBizSrc = sources.find((s: any) => s.source_type === "domain" && s.data_key === "business_ownership");
  const domainTypeSrc = sources.find((s: any) => s.source_type === "domain" && s.data_key === "email_domain_type");
  let domainInfo: any = {};
  try { if (domainBizSrc) domainInfo = JSON.parse(domainBizSrc.data_value); } catch { /* */ }

  // Social profiles
  const socialProfiles = sources
    .filter((s: any) => s.data_key?.startsWith("social_"))
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), key: s.data_key, url: s.source_url || JSON.parse(s.data_value).url }; } catch { return null; } })
    .filter(Boolean);

  // News
  const newsMentions = sources
    .filter((s: any) => s.data_key === "news_mention")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), url: s.source_url }; } catch { return null; } })
    .filter(Boolean);

  // Web mentions
  const webMentions = sources
    .filter((s: any) => s.data_key === "web_mention")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), url: s.source_url }; } catch { return null; } })
    .filter(Boolean);

  // Wikipedia
  const wikiSrc = sources.find((s: any) => s.data_key === "wikipedia");

  // Companies
  const companyProfiles = sources
    .filter((s: any) => s.data_key === "company_profile")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), source_url: s.source_url }; } catch { return null; } })
    .filter(Boolean);

  // Property
  const propertySrc = sources.find((s: any) => s.data_key === "property_search");
  const homeValueSrc = sources.find((s: any) => s.data_key === "home_value");
  let propertyInfo: any = {};
  try { if (propertySrc) propertyInfo = JSON.parse(propertySrc.data_value); } catch { /* */ }

  // Nonprofit
  const nonprofitRoles = sources
    .filter((s: any) => s.data_key === "nonprofit_role")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), source_url: s.source_url }; } catch { return null; } })
    .filter(Boolean);

  // Yacht clubs, charity boards, wealth signals
  const yachtClubs = sources.filter((s: any) => s.data_key === "yacht_club");
  const charityBoards = sources.filter((s: any) => s.data_key === "charity_board");
  const wealthSignals = sources.filter((s: any) => s.data_key === "wealth_signal");
  const webTitles = sources.filter((s: any) => s.data_key === "web_title");
  const webCompanies = sources.filter((s: any) => s.data_key === "web_company");

  // Phase 2: Reverify deep dive data
  const courtRecords = sources.filter((s: any) => s.data_key === "court_record")
    .map((s: any) => { try { return { ...JSON.parse(s.data_value), url: s.source_url }; } catch { return null; } })
    .filter(Boolean);
  const additionalProperties = sources.filter((s: any) => s.data_key === "additional_property")
    .map((s: any) => { try { return JSON.parse(s.data_value); } catch { return null; } })
    .filter(Boolean);
  const relatives = sources.filter((s: any) => s.data_key === "relative").map((s: any) => s.data_value);
  const professionalHistory = sources.filter((s: any) => s.data_key === "professional_history")
    .map((s: any) => { try { return JSON.parse(s.data_value); } catch { return null; } })
    .filter(Boolean);
  const reverifyConfirmations = sources.filter((s: any) => s.data_key === "reverify_confirmation")
    .map((s: any) => { try { return JSON.parse(s.data_value); } catch { return null; } })
    .filter(Boolean);

  const hasIntel = !!intel;

  // Parse deep background fields from lead
  let netWorthBreakdown: any[] = [];
  try { netWorthBreakdown = JSON.parse(lead.net_worth_breakdown || "[]"); } catch { /* */ }
  let verifications: any[] = [];
  try { verifications = JSON.parse(lead.identity_verifications || "[]"); } catch { /* */ }
  let secondaryAddresses: string[] = [];
  try { secondaryAddresses = JSON.parse(lead.secondary_addresses || "[]"); } catch { /* */ }

  return (
    <div className="space-y-1">
      {/* ═══ DOSSIER HEADER ═══ */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5" style={{ color: "var(--brass-500)" }} />
          <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--navy-600)" }}>
            Intelligence Dossier
          </span>
          {score !== null && <ScorePill score={score} band={band} />}
          <span className="text-[10px]" style={{ color: "var(--navy-300)" }}>
            {sources.length} sources collected
          </span>
        </div>
        <button onClick={onRunEnrich} disabled={enriching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{ background: "var(--brass-500)", color: "#fff" }}>
          {enriching ? <><span className="animate-spin">⟳</span> Scanning…</> : hasIntel ? "🔄 Re-scan" : "🔍 Run Deep Scan"}
        </button>
      </div>

      {!hasIntel ? (
        <EmptyDossier />
      ) : (
        <div className="space-y-4">

          {/* ═══ NET WORTH HERO ═══ */}
          {lead.estimated_net_worth && (
            <div className="rounded-xl p-5 border-2" style={{ borderColor: "rgba(16,185,129,0.3)", background: "linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.04) 100%)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" style={{ color: "#059669" }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#059669" }}>Estimated Net Worth</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
                  {netWorthBreakdown.length} asset source{netWorthBreakdown.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="text-3xl font-bold mb-3" style={{ color: "#059669" }}>
                {lead.estimated_net_worth}
              </div>
              {netWorthBreakdown.length > 0 && (
                <div className="space-y-1.5">
                  {netWorthBreakdown.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-3 rounded-lg text-sm" style={{ background: "rgba(16,185,129,0.04)" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>{c.category}</span>
                        <span className="font-medium" style={{ color: "var(--navy-700)" }}>{c.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: "var(--navy-600)" }}>
                          {formatRange(c.low, c.high)}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded" style={{
                          background: c.confidence === "high" ? "rgba(16,185,129,0.15)" : c.confidence === "medium" ? "rgba(59,130,246,0.1)" : "rgba(245,158,11,0.1)",
                          color: c.confidence === "high" ? "#059669" : c.confidence === "medium" ? "#3b82f6" : "#d97706",
                        }}>{c.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ IDENTITY VERIFICATION ═══ */}
          {lead.identity_confidence > 0 && (
            <div className="rounded-xl p-4 border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" style={{ color: lead.identity_confidence >= 70 ? "#059669" : lead.identity_confidence >= 40 ? "#d97706" : "#ef4444" }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--navy-500)" }}>Identity Verification</span>
                </div>
                <span className="text-sm font-bold" style={{ color: lead.identity_confidence >= 70 ? "#059669" : lead.identity_confidence >= 40 ? "#d97706" : "#ef4444" }}>
                  {lead.identity_confidence}% Confidence
                </span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--sand-100)" }}>
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${lead.identity_confidence}%`,
                  background: lead.identity_confidence >= 70 ? "#059669" : lead.identity_confidence >= 40 ? "#d97706" : "#ef4444",
                }} />
              </div>
              {verifications.length > 0 && (
                <div className="space-y-1">
                  {verifications.map((v: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1">
                      <span>{v.result === "confirmed" ? "✅" : v.result === "partial" ? "🟡" : v.result === "mismatch" ? "❌" : "⬜"}</span>
                      <span className="font-semibold" style={{ color: "var(--navy-700)" }}>{v.method}</span>
                      <span className="text-[10px] ml-auto truncate max-w-[250px]" style={{ color: "var(--navy-400)" }}>{v.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ PERSONAL DETAILS ═══ */}
          {(lead.spouse_name || lead.date_of_birth || lead.age || lead.primary_address || secondaryAddresses.length > 0) && (
            <DossierSection title="Personal Details" id="personal" icon={<Users className="w-4 h-4" />}
              expanded={expandedSections.has("personal")} onToggle={() => toggle("personal")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {(lead.date_of_birth || lead.age) && (
                  <SourcedField label="Age / DOB" value={lead.age ? `${lead.age} years old${lead.date_of_birth ? ` (${lead.date_of_birth})` : ""}` : lead.date_of_birth} />
                )}
                {lead.spouse_name && (
                  <SourcedField label="Spouse" value={`${lead.spouse_name}${lead.spouse_employer ? ` — ${lead.spouse_employer}` : ""}`} />
                )}
                {lead.primary_address && (
                  <SourcedField label="Primary Address" value={lead.primary_address} />
                )}
                {secondaryAddresses.map((addr: string, i: number) => (
                  <SourcedField key={i} label={i === 0 ? "Secondary Address" : `Address ${i + 2}`} value={addr} />
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 1. PERSON OVERVIEW ═══ */}
          <DossierSection title="Person Overview" id="overview" icon={<Users className="w-4 h-4" />}
            expanded={expandedSections.has("overview")} onToggle={() => toggle("overview")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <SourcedField label="Occupation" value={lead.occupation || occupationSrc?.data_value} url={occupationSrc?.source_url} />
              <SourcedField label="Employer" value={lead.employer || employerSrc?.data_value} url={employerSrc?.source_url} />
              <SourcedField label="Location"
                value={lead.city ? `${lead.city}, ${lead.state} ${lead.zip}` : locationInfo.city ? `${locationInfo.city}, ${locationInfo.state} ${locationInfo.zip}` : undefined}
                url={locationSrc?.source_url} />
              <SourcedField label="Email Type"
                value={domainBizSrc ? `Business — ${domainInfo.domain || lead.email?.split("@")[1]}` : domainTypeSrc ? "Personal / Freemail" : undefined}
                color={domainBizSrc ? "#059669" : "#d97706"} />
              {domainInfo.company && domainInfo.company !== domainInfo.domain && (
                <SourcedField label="Company (from email)" value={domainInfo.company} />
              )}
              {webTitles.length > 0 && (
                <SourcedField label="Title (Web)" value={webTitles[0].data_value} url={webTitles[0].source_url} badge="WEB" />
              )}
              {wikiSrc && (
                <SourcedField label="Notable Person" value="Wikipedia Entry" color="#3b82f6"
                  url={`https://en.wikipedia.org/wiki/${encodeURIComponent(leadName.replace(/ /g, "_"))}`} />
              )}
            </div>
            {wikiSrc && (
              <div className="mt-2 text-xs p-3 rounded-lg" style={{ background: "rgba(59,130,246,0.06)", color: "var(--navy-600)" }}>
                <BookOpen className="w-3 h-3 inline mr-1" style={{ color: "#3b82f6" }} />
                {wikiSrc.data_value?.substring(0, 250)}…
              </div>
            )}
          </DossierSection>

          {/* ═══ 2. FINANCIAL SIGNALS ═══ */}
          <DossierSection title="Financial Signals" id="financial" icon={<DollarSign className="w-4 h-4" />}
            expanded={expandedSections.has("financial")} onToggle={() => toggle("financial")}
            badge={donationInfo.total ? `$${donationInfo.total.toLocaleString()} in donations` : undefined}>
            <div className="space-y-3">
              {donationInfo.total ? (
                <div className="rounded-lg p-3" style={{ background: "rgba(16,185,129,0.05)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-bold" style={{ color: "#059669" }}>
                      ${donationInfo.total.toLocaleString()}
                    </span>
                    <SourceBadge label="FEC" url={`https://www.fec.gov/data/receipts/individual-contributions/?contributor_name=${encodeURIComponent(leadName)}`} />
                  </div>
                  <span className="text-xs" style={{ color: "var(--navy-500)" }}>
                    {donationInfo.count} political donations on record
                  </span>
                  {donationDetails.slice(0, 5).map((d: any, i: number) => {
                    try {
                      const dd = JSON.parse(d.data_value);
                      return (
                        <div key={i} className="flex items-center justify-between py-1.5 mt-1 border-t" style={{ borderColor: "var(--sand-200)" }}>
                          <div>
                            <span className="text-sm font-bold" style={{ color: "var(--navy-700)" }}>
                              ${dd.contribution_amount?.toLocaleString()}
                            </span>
                            <span className="text-xs ml-2" style={{ color: "var(--navy-500)" }}>
                              to {dd.committee_name?.substring(0, 40)}
                            </span>
                          </div>
                          <span className="text-[10px]" style={{ color: "var(--navy-300)" }}>{dd.contribution_date}</span>
                        </div>
                      );
                    } catch { return null; }
                  })}
                </div>
              ) : (
                <EmptyRow label="No political donation records found" />
              )}

              {wealthSignals.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase" style={{ color: "var(--navy-400)" }}>Wealth Signals</span>
                  {wealthSignals.map((w: any, i: number) => (
                    <div key={i} className="text-sm font-semibold py-1" style={{ color: "#059669" }}>
                      📊 {w.data_value}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DossierSection>

          {/* ═══ 3. PROPERTY & REAL ESTATE ═══ */}
          <DossierSection title="Property & Real Estate" id="property" icon={<Home className="w-4 h-4" />}
            expanded={expandedSections.has("property")} onToggle={() => toggle("property")}
            badge={homeValueSrc ? `Est. ${homeValueSrc.data_value}` : undefined}>
            <div className="space-y-2">
              {homeValueSrc ? (
                <div className="rounded-lg p-3" style={{ background: "rgba(16,185,129,0.05)" }}>
                  <div className="text-lg font-bold" style={{ color: "#059669" }}>
                    Est. {homeValueSrc.data_value}
                  </div>
                  <div className="text-xs" style={{ color: "var(--navy-500)" }}>
                    {propertyInfo.address?.city}, {propertyInfo.address?.state} {propertyInfo.address?.zip}
                  </div>
                </div>
              ) : locationInfo.city ? (
                <div className="text-xs" style={{ color: "var(--navy-500)" }}>
                  Address found: {locationInfo.city}, {locationInfo.state} {locationInfo.zip} — property value could not be estimated
                </div>
              ) : (
                <EmptyRow label="No address discovered — property lookup requires a known address" />
              )}

              {propertyInfo.links && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <SearchLink label="🏠 Zillow" url={propertyInfo.links.zillow} />
                  <SearchLink label="🔴 Redfin" url={propertyInfo.links.redfin} />
                  <SearchLink label="🏘 Realtor" url={propertyInfo.links.realtor} />
                  <SearchLink label="🏛 County Records" url={propertyInfo.links.county_assessor} />
                </div>
              )}
              {!propertyInfo.links && locationInfo.city && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <SearchLink label="🏠 Search Zillow" url={`https://www.zillow.com/homes/${encodeURIComponent(locationInfo.city + " " + locationInfo.state)}_rb/`} />
                  <SearchLink label="🔍 Property Records" url={`https://www.google.com/search?q=${encodeURIComponent(leadName)}+property+records+${encodeURIComponent(locationInfo.city + " " + locationInfo.state)}`} />
                </div>
              )}
            </div>
          </DossierSection>

          {/* ═══ 4. CORPORATE WEB ═══ */}
          <DossierSection title="Corporate Web" id="companies" icon={<Building2 className="w-4 h-4" />}
            expanded={expandedSections.has("companies")} onToggle={() => toggle("companies")}
            badge={companyProfiles.length > 0 ? `${companyProfiles.length} companies` : undefined}>
            <div className="space-y-3">
              {companyProfiles.length > 0 ? companyProfiles.map((co: any, i: number) => (
                <div key={i} className="rounded-lg p-3 border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold" style={{ color: "var(--navy-800)" }}>{co.name}</span>
                    <div className="flex items-center gap-2">
                      <TypeBadge type={co.type} />
                      {co.source_url && <SourceBadge label={co.source?.toUpperCase() || "WEB"} url={co.source_url} />}
                    </div>
                  </div>
                  <div className="text-xs mb-1" style={{ color: "var(--navy-500)" }}>
                    Role: <span className="font-semibold">{co.role}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {co.revenue && <CompanyField label="Revenue" value={co.revenue} />}
                    {co.employees && <CompanyField label="Employees" value={co.employees} />}
                    {co.industry && <CompanyField label="Industry" value={co.industry} />}
                    {co.founded && <CompanyField label="Founded" value={co.founded} />}
                    {co.headquarters && <CompanyField label="HQ" value={co.headquarters} />}
                    {co.website && <CompanyField label="Website" value={co.website} link={co.website.startsWith("http") ? co.website : `https://${co.website}`} />}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <SearchLink label="SEC Filings" url={`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(co.name)}%22&forms=10-K,10-Q`} small />
                    <SearchLink label="LinkedIn" url={`https://www.linkedin.com/company/${encodeURIComponent(co.name.toLowerCase().replace(/\s+/g, "-"))}`} small />
                    <SearchLink label="Crunchbase" url={`https://www.crunchbase.com/textsearch?q=${encodeURIComponent(co.name)}`} small />
                  </div>
                </div>
              )) : null}
              {/* Also show OpenCorporates businesses not in company profiles */}
              {(identity.business_ownership || []).length > 0 && companyProfiles.length === 0 && (
                (identity.business_ownership || []).map((b: any, i: number) => (
                  <div key={`oc${i}`} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--sand-200)" }}>
                    <div>
                      <span className="text-sm font-bold" style={{ color: "var(--navy-700)" }}>{b.company}</span>
                      {b.jurisdiction && <span className="text-xs ml-2" style={{ color: "var(--navy-400)" }}>{b.jurisdiction}</span>}
                    </div>
                    <TypeBadge type="owned" />
                  </div>
                ))
              )}
              {(identity.corporate_roles || []).length > 0 && companyProfiles.length === 0 && (
                (identity.corporate_roles || []).map((r: any, i: number) => (
                  <div key={`cr${i}`} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "var(--sand-200)" }}>
                    <div>
                      <span className="text-sm font-semibold" style={{ color: "var(--navy-700)" }}>{r.title}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--navy-500)" }}>at {r.company}</span>
                    </div>
                    <TypeBadge type="officer" />
                  </div>
                ))
              )}
              {companyProfiles.length === 0 && (identity.business_ownership || []).length === 0 && (identity.corporate_roles || []).length === 0 && (
                <EmptyRow label="No corporate associations found — search manually:" />
              )}
              <div className="flex flex-wrap gap-2">
                <SearchLink label="🔍 OpenCorporates" url={`https://opencorporates.com/companies?q=${encodeURIComponent(leadName)}`} />
                <SearchLink label="📋 SEC EDGAR" url={`https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=${encodeURIComponent(leadName)}&type=&dateb=&owner=include&count=40&search_text=&action=getcompany`} />
                <SearchLink label="💼 LinkedIn" url={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(leadName)}`} />
              </div>
            </div>
          </DossierSection>

          {/* ═══ 5. SOCIAL & MEDIA ═══ */}
          <DossierSection title="Social & Media" id="social" icon={<Globe className="w-4 h-4" />}
            expanded={expandedSections.has("social")} onToggle={() => toggle("social")}
            badge={`${socialProfiles.length} profiles, ${newsMentions.length + webMentions.length} mentions`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--navy-400)" }}>Social Profiles</span>
                {socialProfiles.length > 0 ? (
                  <div className="space-y-1.5">
                    {socialProfiles.map((p: any, i: number) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                        <SocialIcon platform={p.key} />
                        <span className="text-sm font-semibold" style={{ color: "var(--sea-500)" }}>
                          {platformLabel(p.key)}
                        </span>
                        <ExternalLink className="w-3 h-3 ml-auto" style={{ color: "var(--navy-300)" }} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div>
                    <EmptyRow label="No confirmed profiles" />
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <SearchLink label="LinkedIn" url={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(leadName)}`} small />
                      <SearchLink label="Facebook" url={`https://www.facebook.com/search/people/?q=${encodeURIComponent(leadName)}`} small />
                      <SearchLink label="Instagram" url={`https://www.google.com/search?q=site:instagram.com+${encodeURIComponent(leadName)}`} small />
                    </div>
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-2" style={{ color: "var(--navy-400)" }}>News & Media</span>
                {newsMentions.length > 0 || webMentions.length > 0 ? (
                  <div className="space-y-1.5">
                    {[...newsMentions, ...webMentions].slice(0, 6).map((n: any, i: number) => (
                      <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                        className="block py-1 hover:underline">
                        <div className="text-xs font-semibold truncate" style={{ color: "var(--navy-700)" }}>
                          {n.title?.substring(0, 70)}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>
                          {n.source || n.category || "Web"} <ExternalLink className="w-2.5 h-2.5 inline" />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div>
                    <EmptyRow label="No news articles found" />
                    <SearchLink label="🔍 Google News" url={`https://news.google.com/search?q=%22${encodeURIComponent(leadName)}%22`} small />
                  </div>
                )}
              </div>
            </div>
          </DossierSection>

          {/* ═══ 6. AFFILIATIONS & LIFESTYLE ═══ */}
          {(yachtClubs.length > 0 || charityBoards.length > 0 || nonprofitRoles.length > 0 || (capital.vessel_registrations || []).length > 0 || (capital.aircraft_registrations || []).length > 0) && (
            <DossierSection title="Affiliations & Assets" id="affiliations" icon={<Award className="w-4 h-4" />}
              expanded={expandedSections.has("affiliations")} onToggle={() => toggle("affiliations")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {yachtClubs.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--navy-400)" }}>⛵ Yacht Clubs</span>
                    {yachtClubs.map((y: any, i: number) => (
                      <div key={i} className="text-sm font-semibold py-0.5" style={{ color: "var(--navy-700)" }}>{y.data_value}</div>
                    ))}
                  </div>
                )}
                {charityBoards.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--navy-400)" }}>🪑 Board Positions</span>
                    {charityBoards.map((b: any, i: number) => (
                      <div key={i} className="text-sm font-semibold py-0.5" style={{ color: "var(--navy-700)" }}>{b.data_value}</div>
                    ))}
                  </div>
                )}
                {nonprofitRoles.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--navy-400)" }}>🏛 Nonprofit Roles (IRS 990)</span>
                    {nonprofitRoles.map((n: any, i: number) => (
                      <div key={i} className="flex items-center gap-1 py-0.5">
                        <span className="text-sm font-semibold" style={{ color: "var(--navy-700)" }}>
                          {n.role} at {n.name}
                          {n.compensation ? <span style={{ color: "#059669" }}> (${n.compensation.toLocaleString()}/yr)</span> : ""}
                        </span>
                        {n.source_url && <a href={n.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" style={{ color: "var(--sea-500)" }} /></a>}
                      </div>
                    ))}
                  </div>
                )}
                {(capital.vessel_registrations || []).length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--navy-400)" }}>🚢 USCG Vessels</span>
                    {capital.vessel_registrations.map((v: any, i: number) => (
                      <div key={i} className="text-sm font-semibold py-0.5" style={{ color: "var(--navy-700)" }}>
                        {v.name} {v.hin && <span className="text-xs" style={{ color: "var(--navy-400)" }}>HIN: {v.hin}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {(capital.aircraft_registrations || []).length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--navy-400)" }}>✈️ FAA Aircraft</span>
                    {capital.aircraft_registrations.map((a: any, i: number) => (
                      <div key={i} className="text-sm font-semibold py-0.5" style={{ color: "var(--navy-700)" }}>
                        N{a.n_number} {a.type && <span className="text-xs" style={{ color: "var(--navy-400)" }}>{a.type}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DossierSection>
          )}

          {/* ═══ 6b. PROFESSIONAL HISTORY ═══ */}
          {professionalHistory.length > 0 && (
            <DossierSection title="Professional History" id="history" icon={<History className="w-4 h-4" />}
              expanded={expandedSections.has("history")} onToggle={() => toggle("history")}
              badge={`${professionalHistory.length} prior roles`}>
              <div className="space-y-1.5">
                {professionalHistory.map((ph: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg" style={{ background: i % 2 === 0 ? "var(--sand-50)" : "transparent" }}>
                    <Briefcase className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brass-400)" }} />
                    <div>
                      <span className="text-sm font-bold" style={{ color: "var(--navy-700)" }}>{ph.title}</span>
                      <span className="text-sm ml-1" style={{ color: "var(--navy-500)" }}>at {ph.company}</span>
                      {ph.years && <span className="text-xs ml-2" style={{ color: "var(--navy-400)" }}>({ph.years})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 6c. ADDITIONAL PROPERTIES ═══ */}
          {additionalProperties.length > 0 && (
            <DossierSection title="Additional Properties" id="addl_properties" icon={<Home className="w-4 h-4" />}
              expanded={expandedSections.has("addl_properties")} onToggle={() => toggle("addl_properties")}
              badge={`${additionalProperties.length} properties`}>
              <div className="space-y-2">
                {additionalProperties.map((prop: any, i: number) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: "var(--sand-50)" }}>
                    <div>
                      <div className="text-sm font-bold" style={{ color: "var(--navy-700)" }}>{prop.address}</div>
                      {prop.type && <div className="text-[10px]" style={{ color: "var(--navy-400)" }}>{prop.type}</div>}
                    </div>
                    {prop.estimated_value && (
                      <span className="text-sm font-bold" style={{ color: "#059669" }}>Est. {prop.estimated_value}</span>
                    )}
                  </div>
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 6d. RELATIVES & ASSOCIATES ═══ */}
          {relatives.length > 0 && (
            <DossierSection title="Known Associates & Relatives" id="relatives" icon={<Users className="w-4 h-4" />}
              expanded={expandedSections.has("relatives")} onToggle={() => toggle("relatives")}
              badge={`${relatives.length} found`}>
              <div className="flex flex-wrap gap-2">
                {relatives.map((rel: string, i: number) => (
                  <span key={i} className="text-sm px-3 py-1.5 rounded-lg font-semibold" style={{ background: "var(--sand-100)", color: "var(--navy-700)" }}>
                    {rel}
                  </span>
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 6e. COURT RECORDS & LITIGATION ═══ */}
          {courtRecords.length > 0 && (
            <DossierSection title="Court Records & Litigation" id="court" icon={<Scale className="w-4 h-4" />}
              expanded={expandedSections.has("court")} onToggle={() => toggle("court")}
              badge={`${courtRecords.length} records`}>
              <div className="space-y-2">
                {courtRecords.map((cr: any, i: number) => (
                  <div key={i} className="rounded-lg p-3 border" style={{
                    borderColor: cr.type === "Bankruptcy" || cr.type === "Foreclosure" ? "rgba(239,68,68,0.2)" : "var(--border)",
                    background: cr.type === "Bankruptcy" || cr.type === "Foreclosure" ? "rgba(239,68,68,0.04)" : "var(--card)",
                  }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{
                        background: cr.type === "Bankruptcy" || cr.type === "Foreclosure" ? "rgba(239,68,68,0.1)" : cr.type === "Lawsuit" ? "rgba(245,158,11,0.1)" : "rgba(107,114,128,0.1)",
                        color: cr.type === "Bankruptcy" || cr.type === "Foreclosure" ? "#ef4444" : cr.type === "Lawsuit" ? "#d97706" : "#6b7280",
                      }}>{cr.type}</span>
                      {cr.date && <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>{cr.date}</span>}
                      {cr.court && <span className="text-[10px]" style={{ color: "var(--navy-400)" }}>{cr.court}</span>}
                    </div>
                    <div className="text-xs" style={{ color: "var(--navy-600)" }}>{cr.description?.substring(0, 150)}</div>
                    {cr.url && (
                      <a href={cr.url} target="_blank" rel="noopener noreferrer" className="text-[10px] flex items-center gap-1 mt-1" style={{ color: "var(--sea-500)" }}>
                        View Record <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 6f. RE-VERIFICATION STATUS ═══ */}
          {reverifyConfirmations.length > 0 && (
            <DossierSection title="Re-Verification Status" id="reverify" icon={<UserCheck className="w-4 h-4" />}
              expanded={expandedSections.has("reverify")} onToggle={() => toggle("reverify")}
              badge={`${reverifyConfirmations.filter((c: any) => c.confirmed).length}/${reverifyConfirmations.length} confirmed`}>
              <div className="space-y-1">
                {reverifyConfirmations.map((conf: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg" style={{ background: conf.confirmed ? "rgba(16,185,129,0.05)" : "rgba(245,158,11,0.05)" }}>
                    {conf.confirmed
                      ? <CheckCircle className="w-4 h-4 shrink-0" style={{ color: "#059669" }} />
                      : <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "#d97706" }} />}
                    <div>
                      <span className="text-xs font-bold uppercase" style={{ color: "var(--navy-500)" }}>{conf.field}</span>
                      <span className="text-sm ml-2 font-semibold" style={{ color: conf.confirmed ? "#059669" : "#d97706" }}>
                        {conf.original}
                      </span>
                      <span className="text-[10px] ml-2" style={{ color: "var(--navy-400)" }}>
                        — {conf.confirmed ? "Confirmed by targeted search" : "Could not confirm"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </DossierSection>
          )}

          {/* ═══ 7. COMPLIANCE ═══ */}
          <div className="rounded-xl p-4" style={{
            background: risk.sanctions_flag ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)",
            border: `1px solid ${risk.sanctions_flag ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}`,
          }}>
            <div className="flex items-center gap-2 mb-1">
              {risk.sanctions_flag
                ? <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />
                : <CheckCircle className="w-4 h-4" style={{ color: "#059669" }} />}
              <span className="text-sm font-bold" style={{ color: risk.sanctions_flag ? "#ef4444" : "#059669" }}>
                {risk.sanctions_flag ? "⚠️ OFAC SANCTIONS MATCH — COMPLIANCE REVIEW REQUIRED" : "OFAC: Clear"}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--navy-500)" }}>
              <span>Bankruptcy: {risk.bankruptcy_flag || courtRecords.some((cr: any) => cr.type === "Bankruptcy") ? "⚠️ Found" : "None"}</span>
              <span>Fraud: {(risk.fraud_indicators || []).length > 0 ? `⚠️ ${risk.fraud_indicators.length}` : "None"}</span>
              <span>Litigation: {risk.litigation_count || courtRecords.filter((cr: any) => cr.type === "Lawsuit").length || 0}</span>
              {courtRecords.length > 0 && <span>Court Records: {courtRecords.length} found</span>}
            </div>
          </div>

          {/* ═══ 8. SCORE BREAKDOWN ═══ */}
          <DossierSection title="Score Breakdown" id="score" icon={<Activity className="w-4 h-4" />}
            expanded={expandedSections.has("score")} onToggle={() => toggle("score")}>
            {breakdown.length > 0 ? (
              <div className="space-y-0.5">
                {breakdown.map((b: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-1 px-2 rounded text-sm"
                    style={{ background: i % 2 === 0 ? "var(--sand-50)" : "transparent" }}>
                    <span className="font-mono text-xs w-10 text-right font-bold"
                      style={{ color: b.points > 0 ? "#059669" : "#ef4444" }}>
                      {b.points > 0 ? "+" : ""}{b.points}
                    </span>
                    <span className="font-medium" style={{ color: "var(--navy-700)" }}>{b.label}</span>
                    <span className="text-xs ml-auto truncate max-w-[200px]" style={{ color: "var(--navy-400)" }}>{b.reason}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 py-1.5 px-2 rounded-lg font-bold border-t mt-1" style={{ borderColor: "var(--sand-200)" }}>
                  <span className="font-mono text-sm w-10 text-right" style={{ color: "var(--navy-700)" }}>{score}</span>
                  <span className="text-sm" style={{ color: "var(--navy-700)" }}>/ 100 Total Score</span>
                  <ScorePill score={score} band={band} />
                </div>
              </div>
            ) : (
              <EmptyRow label="No scoring factors matched" />
            )}
          </DossierSection>

          {/* ═══ 9. RAW SOURCES ═══ */}
          <div>
            <button onClick={() => setShowAllSources(!showAllSources)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none w-full py-2"
              style={{ color: "var(--navy-400)" }}>
              {showAllSources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {sources.length} Raw Sources — {showAllSources ? "Click to collapse" : "Click to expand"}
            </button>
            {showAllSources && (
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                {sources.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded"
                    style={{ background: "var(--sand-50)" }}>
                    <span className="font-bold uppercase w-16 shrink-0 text-[10px]" style={{ color: "var(--navy-500)" }}>{s.source_type}</span>
                    <span className="truncate" style={{ color: "var(--navy-600)" }}>{s.source_label || `${s.data_key}: ${s.data_value?.substring(0, 60)}`}</span>
                    {s.source_url && (
                      <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0">
                        <ExternalLink className="w-3 h-3" style={{ color: "var(--sea-500)" }} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-[10px] text-center py-1" style={{ color: "var(--navy-300)" }}>
            Public records only. Not financial verification. Internal use only.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────────

function ScorePill({ score, band }: { score: number; band: string }) {
  const bg = score >= 80 ? "#059669" : score >= 60 ? "#3b82f6" : score >= 40 ? "#d97706" : "#ef4444";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: bg }}>
      {score}
    </span>
  );
}

function DossierSection({ title, id, icon, badge, expanded, onToggle, children }: {
  title: string; id: string; icon: React.ReactNode; badge?: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
      <button onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/50"
        style={{ background: "var(--card)" }}>
        <span style={{ color: "var(--brass-500)" }}>{icon}</span>
        <span className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--navy-600)" }}>{title}</span>
        {badge && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold ml-auto mr-2" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>{badge}</span>}
        {expanded ? <ChevronUp className="w-4 h-4 ml-auto" style={{ color: "var(--navy-300)" }} /> : <ChevronDown className="w-4 h-4 ml-auto" style={{ color: "var(--navy-300)" }} />}
      </button>
      {expanded && <div className="px-4 pb-4 pt-1" style={{ background: "var(--card)" }}>{children}</div>}
    </div>
  );
}

function SourcedField({ label, value, url, color, badge }: {
  label: string; value?: string; url?: string; color?: string; badge?: string;
}) {
  if (!value) return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs" style={{ color: "var(--navy-400)" }}>{label}</span>
      <span className="text-xs" style={{ color: "var(--navy-300)" }}>—</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between py-1.5 gap-2">
      <span className="text-xs shrink-0" style={{ color: "var(--navy-400)" }}>{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        {badge && <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: "var(--sand-100)", color: "var(--navy-400)" }}>{badge}</span>}
        <span className="text-xs font-bold truncate" style={{ color: color || "var(--navy-700)" }}>{value}</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <ExternalLink className="w-3 h-3" style={{ color: "var(--sea-500)" }} />
          </a>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold transition-opacity hover:opacity-80"
      style={{ background: "var(--sand-100)", color: "var(--sea-500)" }}>
      {label} <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

function SearchLink({ label, url, small }: { label: string; url: string; small?: boolean }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 ${small ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1.5"} rounded-lg font-semibold transition-all hover:opacity-80`}
      style={{ background: "var(--sand-100)", color: "var(--sea-500)" }}>
      {label} <ExternalLink className={small ? "w-2.5 h-2.5" : "w-3 h-3"} />
    </a>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    employer: "#3b82f6", owned: "#059669", officer: "#8b5cf6", associated: "#d97706",
  };
  const labels: Record<string, string> = {
    employer: "EMPLOYER", owned: "OWNED", officer: "OFFICER", associated: "ASSOCIATED",
  };
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${colors[type] || "#6b7280"}15`, color: colors[type] || "#6b7280" }}>
      {labels[type] || type}
    </span>
  );
}

function CompanyField({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="text-xs">
      <span style={{ color: "var(--navy-400)" }}>{label}: </span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: "var(--sea-500)" }}>
          {value} <ExternalLink className="w-2.5 h-2.5 inline" />
        </a>
      ) : (
        <span className="font-semibold" style={{ color: "var(--navy-700)" }}>{value}</span>
      )}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-2 text-xs" style={{ color: "var(--navy-400)" }}>
      <AlertTriangle className="w-3 h-3" style={{ color: "var(--navy-300)" }} />
      {label}
    </div>
  );
}

function EmptyDossier() {
  return (
    <div className="text-center py-10 rounded-xl" style={{ background: "var(--sand-50)" }}>
      <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--navy-300)" }} />
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--navy-600)" }}>No intelligence report yet</p>
      <p className="text-xs max-w-md mx-auto" style={{ color: "var(--navy-400)" }}>
        Click <strong>Run Deep Scan</strong> to search 14+ public databases with multi-pass re-verification:
        estimated net worth, identity verification, court records &amp; litigation, professional history,
        spouse &amp; family, properties &amp; second homes, relatives &amp; associates,
        political donations, corporate filings, vessel &amp; aircraft records, social media, and more.
      </p>
    </div>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  if (platform.includes("linkedin")) return <Linkedin className="w-4 h-4" style={{ color: "#0077B5" }} />;
  if (platform.includes("facebook")) return <Globe className="w-4 h-4" style={{ color: "#1877F2" }} />;
  if (platform.includes("instagram")) return <Globe className="w-4 h-4" style={{ color: "#E4405F" }} />;
  if (platform.includes("twitter")) return <Globe className="w-4 h-4" style={{ color: "#1DA1F2" }} />;
  return <Globe className="w-4 h-4" style={{ color: "var(--navy-400)" }} />;
}

function platformLabel(key: string): string {
  if (key.includes("linkedin")) return "LinkedIn";
  if (key.includes("facebook")) return "Facebook";
  if (key.includes("instagram")) return "Instagram";
  if (key.includes("twitter")) return "Twitter / X";
  return key;
}

function formatRange(low: number, high: number): string {
  const fmt = (n: number): string => {
    if (n >= 1000000000) return `$${(n / 1000000000).toFixed(1)}B`;
    if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  if (!low && !high) return "—";
  return `${fmt(low)} — ${fmt(high)}`;
}
