/**
 * Domain & Email Analysis Provider
 * Analyzes lead email address for business signals:
 * - Business domain vs freemail (gmail, yahoo, etc.)
 * - Domain WHOIS age
 * - Company website detection
 */

import { addSource, logAuditEvent } from "../storage";

const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "me.com", "mail.com", "protonmail.com", "proton.me",
  "live.com", "msn.com", "comcast.net", "att.net", "verizon.net",
  "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "earthlink.net", "mac.com", "ymail.com", "rocketmail.com",
]);

export type DomainResult = {
  email_domain: string;
  is_business_email: boolean;
  domain_info: {
    domain: string;
    has_website: boolean;
    title?: string;
  } | null;
  error?: string;
};

export async function analyzeDomain(
  profileId: number,
  leadId: number,
  email: string
): Promise<DomainResult> {
  const result: DomainResult = {
    email_domain: "",
    is_business_email: false,
    domain_info: null,
  };

  if (!email || !email.includes("@")) return result;

  try {
    const domain = email.split("@")[1].toLowerCase();
    result.email_domain = domain;
    result.is_business_email = !FREEMAIL_DOMAINS.has(domain);

    // If business email, probe the domain for a website
    if (result.is_business_email) {
      const siteInfo = await probeWebsite(domain);
      result.domain_info = siteInfo;

      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "domain",
        source_url: `https://${domain}`,
        source_label: `Business email: ${domain}${siteInfo?.title ? ` (${siteInfo.title})` : ""}`,
        layer: "identity",
        data_key: "business_ownership",
        data_value: JSON.stringify({
          company: siteInfo?.title || domain,
          domain,
          has_website: siteInfo?.has_website || false,
          source: "email_domain",
        }),
        confidence: result.is_business_email ? 60 : 30,
        fetched_at: new Date().toISOString(),
      });

      // Business email is a weak positive signal for professionalism
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "domain",
        source_url: `https://${domain}`,
        source_label: "Professional email domain",
        layer: "engagement",
        data_key: "email_tone",
        data_value: "professional",
        confidence: 40,
        fetched_at: new Date().toISOString(),
      });
    } else {
      addSource({
        profile_id: profileId,
        lead_id: leadId,
        source_type: "domain",
        source_url: "",
        source_label: `Freemail: ${domain}`,
        layer: "engagement",
        data_key: "email_domain_type",
        data_value: "freemail",
        confidence: 95,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "domain",
      domain,
      is_business: result.is_business_email,
      has_website: result.domain_info?.has_website || false,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "domain", error: err.message,
    });
  }

  return result;
}

// ─── Internal Helpers ───────────────────────────────────────────────

async function probeWebsite(domain: string): Promise<DomainResult["domain_info"]> {
  try {
    const response = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (response.ok || response.status === 403) {
      // Site exists — try to get title
      let title: string | undefined;
      try {
        const fullResp = await fetch(`https://${domain}`, {
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });
        const html = await fullResp.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].trim().slice(0, 100);
        }
      } catch { /* title extraction is best-effort */ }

      return { domain, has_website: true, title };
    }

    return { domain, has_website: false };
  } catch {
    // Try HTTP fallback
    try {
      const response = await fetch(`http://${domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      return { domain, has_website: response.ok || response.status === 301 };
    } catch {
      return { domain, has_website: false };
    }
  }
}
