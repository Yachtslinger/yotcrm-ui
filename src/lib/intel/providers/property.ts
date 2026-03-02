/**
 * Property Intelligence Provider
 * Uses discovered address (from FEC) to:
 *   1. Generate smart property search links (Zillow, Redfin, county assessor)
 *   2. Probe Zillow search for estimated home values
 *   3. Store property intelligence as enrichment sources
 *
 * Also attempts to find property records via county assessor web searches.
 */

import { addSource, logAuditEvent, getSourcesByProfile } from "../storage";

export type PropertyResult = {
  address: { city: string; state: string; zip: string };
  search_links: {
    zillow: string;
    redfin: string;
    realtor: string;
    county_assessor: string;
  };
  estimated_value?: string;
  property_type?: string;
  error?: string;
};

export async function searchProperty(
  profileId: number,
  leadId: number,
  fullName: string,
): Promise<PropertyResult> {
  const result: PropertyResult = {
    address: { city: "", state: "", zip: "" },
    search_links: { zillow: "", redfin: "", realtor: "", county_assessor: "" },
  };

  try {
    // Get address from previously discovered FEC data
    const sources = getSourcesByProfile(profileId);
    const locationSrc = sources.find(s => s.data_key === "location" && s.source_type === "fec");
    
    let city = "", state = "", zip = "";
    if (locationSrc) {
      try {
        const loc = JSON.parse(locationSrc.data_value);
        city = loc.city || "";
        state = loc.state || "";
        zip = loc.zip || "";
      } catch { /* */ }
    }

    if (!city && !zip) {
      // No address found — can't do property lookup
      result.error = "No address discovered yet";
      return result;
    }

    result.address = { city, state, zip };
    const nameEncoded = encodeURIComponent(fullName);
    const addrEncoded = encodeURIComponent(`${city}, ${state} ${zip}`);

    // Generate smart search links
    result.search_links = {
      zillow: `https://www.zillow.com/homes/${encodeURIComponent(city + " " + state + " " + zip)}_rb/`,
      redfin: `https://www.redfin.com/zipcode/${zip}`,
      realtor: `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(city)}_${state}_${zip}`,
      county_assessor: `https://www.google.com/search?q=${nameEncoded}+property+records+${addrEncoded}+county+assessor`,
    };

    // Try to get Zillow estimate by scraping search
    const zillowEstimate = await probeZillowSearch(fullName, city, state, zip);
    if (zillowEstimate) {
      result.estimated_value = zillowEstimate.value;
      result.property_type = zillowEstimate.type;
    }

    // Store property intelligence
    addSource({
      profile_id: profileId, lead_id: leadId,
      source_type: "property",
      source_url: result.search_links.zillow,
      source_label: `Property: ${city}, ${state} ${zip}${result.estimated_value ? ` — Est. ${result.estimated_value}` : ""}`,
      layer: "capital", data_key: "property_search",
      data_value: JSON.stringify({
        address: result.address,
        links: result.search_links,
        estimated_value: result.estimated_value,
        property_type: result.property_type,
      }),
      confidence: result.estimated_value ? 50 : 30,
      fetched_at: new Date().toISOString(),
    });

    if (result.estimated_value) {
      addSource({
        profile_id: profileId, lead_id: leadId,
        source_type: "property",
        source_url: result.search_links.zillow,
        source_label: `Estimated Home Value: ${result.estimated_value}`,
        layer: "capital", data_key: "home_value",
        data_value: result.estimated_value,
        confidence: 40,
        fetched_at: new Date().toISOString(),
      });
    }

    logAuditEvent(leadId, "source_fetched", "system", {
      provider: "property",
      city, state, zip,
      has_estimate: !!result.estimated_value,
    });
  } catch (err: any) {
    result.error = err.message;
    logAuditEvent(leadId, "source_fetched", "system", { provider: "property", error: err.message });
  }

  return result;
}

// ─── Zillow Search Probe ────────────────────────────────────────────

async function probeZillowSearch(
  name: string, city: string, state: string, zip: string,
): Promise<{ value: string; type: string } | null> {
  try {
    // Use DuckDuckGo to search for property records with owner name
    const query = `"${name}" property "${city}" "${state}" home value zillow OR redfin OR realtor`;
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    // Look for dollar amounts near property/home/value keywords
    const valuePattern = /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|M|k|K))?/g;
    const snippets = html.match(/class="result__snippet"[^>]*>(.*?)<\/a>/gs) || [];
    
    for (const snippet of snippets) {
      const text = snippet.replace(/<[^>]*>/g, "").toLowerCase();
      if (text.includes(name.split(" ")[name.split(" ").length - 1].toLowerCase())) {
        const values = text.match(valuePattern);
        if (values) {
          // Find the largest reasonable home value
          for (const v of values) {
            const num = parseValue(v);
            if (num >= 100000 && num <= 500000000) {
              return {
                value: v.trim(),
                type: text.includes("condo") ? "Condo" : text.includes("apartment") ? "Apartment" : "Residential",
              };
            }
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseValue(str: string): number {
  const cleaned = str.replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  if (cleaned.toLowerCase().includes("million") || cleaned.toLowerCase().includes("m")) return num * 1000000;
  if (cleaned.toLowerCase().includes("k")) return num * 1000;
  return num;
}
