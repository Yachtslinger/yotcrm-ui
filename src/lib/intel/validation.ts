/**
 * Identity Anchor Validation Gate
 * 
 * The #1 accuracy problem: name collisions. "Robert Johnson" matches
 * hundreds of people. But if we know the lead's email, phone, city,
 * state, and employer — we can validate whether a search result
 * actually belongs to THIS person.
 * 
 * Every provider result should be scored against these anchors
 * before being accepted into the enrichment database.
 * 
 * Scoring:
 *   Phone match    = +50 (nearly unique identifier)
 *   Email match    = +40 (unique identifier) 
 *   Email domain   = +25 (confirms employer/company)
 *   City match     = +15
 *   State match    = +10
 *   Employer match = +20
 *   Zip match      = +15
 * 
 *   Score >= 30 → ACCEPT (likely same person)
 *   Score 15-29 → FLAG as "unverified"
 *   Score < 15  → REJECT (probably different person)
 */

export type IdentityAnchors = {
  fullName: string;
  firstName: string;
  lastName: string;
  email?: string;
  emailDomain?: string;
  phone?: string;
  phoneDigits?: string;  // just digits, no formatting
  city?: string;
  state?: string;
  zip?: string;
  employer?: string;
  company?: string;
};

export type ValidationResult = {
  score: number;
  accepted: boolean;
  flagged: boolean;
  matches: string[];    // which anchors matched
  mismatches: string[]; // which anchors contradicted
};

/**
 * Build identity anchors from lead data.
 * Call this once at the start of enrichment.
 */
export function buildAnchors(lead: {
  first_name?: string; last_name?: string;
  email?: string; phone?: string;
  city?: string; state?: string; zip?: string;
  company?: string; employer?: string;
}): IdentityAnchors {
  const email = (lead.email || "").toLowerCase().trim();
  const phone = (lead.phone || "").trim();
  const phoneDigits = phone.replace(/\D/g, "");

  let emailDomain = "";
  if (email && email.includes("@")) {
    emailDomain = email.split("@")[1] || "";
    // Skip generic domains — they don't help with validation
    const generic = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
      "icloud.com", "me.com", "mac.com", "live.com", "msn.com",
      "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
      "bellsouth.net", "cox.net", "charter.net", "earthlink.net",
      "protonmail.com", "zoho.com", "mail.com", "ymail.com",
    ]);
    if (generic.has(emailDomain)) emailDomain = "";
  }

  return {
    fullName: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    firstName: (lead.first_name || "").toLowerCase().trim(),
    lastName: (lead.last_name || "").toLowerCase().trim(),
    email,
    emailDomain,
    phone,
    phoneDigits: phoneDigits.length >= 7 ? phoneDigits : undefined,
    city: (lead.city || "").toLowerCase().trim(),
    state: (lead.state || "").toUpperCase().trim(),
    zip: (lead.zip || "").substring(0, 5).trim(),
    employer: (lead.employer || lead.company || "").toLowerCase().trim(),
    company: (lead.company || "").toLowerCase().trim(),
  };

  // Auto-enrich from phone area code if no city/state
  if (!anchors.city && !anchors.state && phoneDigits.length >= 10) {
    const areaCode = phoneDigits.slice(-10, -7);
    const loc = AREA_CODE_MAP[areaCode];
    if (loc) {
      if (!anchors.city) anchors.city = loc.city.toLowerCase();
      if (!anchors.state) anchors.state = loc.state;
    }
  }

  return anchors;
}

/**
 * Enrich anchors mid-pipeline with newly discovered data.
 * Only fills empty fields — never overwrites existing data.
 */
export function enrichAnchors(
  anchors: IdentityAnchors,
  discovered: {
    employer?: string;
    company?: string;
    city?: string;
    state?: string;
    zip?: string;
  },
): IdentityAnchors {
  if (!anchors.employer && discovered.employer)
    anchors.employer = discovered.employer.toLowerCase().trim();
  if (!anchors.company && discovered.company)
    anchors.company = discovered.company.toLowerCase().trim();
  if (!anchors.city && discovered.city)
    anchors.city = discovered.city.toLowerCase().trim();
  if (!anchors.state && discovered.state)
    anchors.state = discovered.state.toUpperCase().trim();
  if (!anchors.zip && discovered.zip)
    anchors.zip = discovered.zip.substring(0, 5).trim();
  // Also set employer from company if employer still empty
  if (!anchors.employer && anchors.company)
    anchors.employer = anchors.company;
  return anchors;
}

// Major US area codes → city/state (covers ~80% of leads)
const AREA_CODE_MAP: Record<string, { city: string; state: string }> = {
  "201":"NJ","202":"DC","203":"CT","205":"AL","206":"WA","207":"ME","208":"ID",
  "209":"CA","210":"TX","212":"NY","213":"CA","214":"TX","215":"PA","216":"OH",
  "217":"IL","218":"MN","219":"IN","224":"IL","225":"LA","228":"MS","229":"GA",
  "231":"MI","234":"OH","239":"FL","240":"MD","248":"MI","251":"AL","252":"NC",
  "253":"WA","254":"TX","256":"AL","260":"IN","262":"WI","267":"PA","269":"MI",
  "270":"KY","272":"PA","276":"VA","281":"TX","301":"MD","302":"DE","303":"CO",
  "304":"WV","305":"FL","307":"WY","308":"NE","309":"IL","310":"CA","312":"IL",
  "313":"MI","314":"MO","315":"NY","316":"KS","317":"IN","318":"LA","319":"IA",
  "320":"MN","321":"FL","323":"CA","325":"TX","330":"OH","331":"IL","334":"AL",
  "336":"NC","337":"LA","339":"MA","340":"VI","346":"TX","347":"NY","351":"MA",
  "352":"FL","360":"WA","361":"TX","385":"UT","386":"FL","401":"RI","402":"NE",
  "404":"GA","405":"OK","406":"MT","407":"FL","408":"CA","409":"TX","410":"MD",
  "412":"PA","413":"MA","414":"WI","415":"CA","417":"MO","419":"OH","423":"TN",
  "424":"CA","425":"WA","430":"TX","432":"TX","434":"VA","435":"UT","440":"OH",
  "442":"CA","443":"MD","458":"OR","469":"TX","470":"GA","475":"CT","478":"GA",
  "479":"AR","480":"AZ","484":"PA","501":"AR","502":"KY","503":"OR","504":"LA",
  "505":"NM","507":"MN","508":"MA","509":"WA","510":"CA","512":"TX","513":"OH",
  "515":"IA","516":"NY","517":"MI","518":"NY","520":"AZ","530":"CA","531":"NE",
  "534":"WI","539":"OK","540":"VA","541":"OR","551":"NJ","559":"CA","561":"FL",
  "562":"CA","563":"IA","567":"OH","570":"PA","571":"VA","573":"MO","574":"IN",
  "575":"NM","580":"OK","585":"NY","586":"MI","601":"MS","602":"AZ","603":"NH",
  "605":"SD","606":"KY","607":"NY","608":"WI","609":"NJ","610":"PA","612":"MN",
  "614":"OH","615":"TN","616":"MI","617":"MA","618":"IL","619":"CA","620":"KS",
  "623":"AZ","626":"CA","628":"CA","629":"TN","630":"IL","631":"NY","636":"MO",
  "641":"IA","646":"NY","650":"CA","651":"MN","657":"CA","660":"MO","661":"CA",
  "662":"MS","667":"MD","669":"CA","678":"GA","681":"WV","682":"TX","701":"ND",
  "702":"NV","703":"VA","704":"NC","706":"GA","707":"CA","708":"IL","712":"IA",
  "713":"TX","714":"CA","715":"WI","716":"NY","717":"PA","718":"NY","719":"CO",
  "720":"CO","724":"PA","727":"FL","731":"TN","732":"NJ","734":"MI","737":"TX",
  "740":"OH","743":"NC","747":"CA","754":"FL","757":"VA","760":"CA","762":"GA",
  "763":"MN","765":"IN","769":"MS","770":"GA","772":"FL","773":"IL","774":"MA",
  "775":"NV","779":"IL","781":"MA","785":"KS","786":"FL","801":"UT","802":"VT",
  "803":"SC","804":"VA","805":"CA","806":"TX","808":"HI","810":"MI","812":"IN",
  "813":"FL","814":"PA","815":"IL","816":"MO","817":"TX","818":"CA","828":"NC",
  "830":"TX","831":"CA","832":"TX","843":"SC","845":"NY","847":"IL","848":"NJ",
  "850":"FL","854":"SC","856":"NJ","857":"MA","858":"CA","859":"KY","860":"CT",
  "862":"NJ","863":"FL","864":"SC","865":"TN","870":"AR","872":"IL","878":"PA",
  "901":"TN","903":"TX","904":"FL","907":"AK","908":"NJ","909":"CA","910":"NC",
  "912":"GA","913":"KS","914":"NY","915":"TX","916":"CA","917":"NY","918":"OK",
  "919":"NC","920":"WI","925":"CA","928":"AZ","929":"NY","931":"TN","936":"TX",
  "937":"OH","940":"TX","941":"FL","947":"MI","949":"CA","951":"CA","952":"MN",
  "954":"FL","956":"TX","959":"CT","970":"CO","971":"OR","972":"TX","973":"NJ",
  "975":"MO","978":"MA","979":"TX","980":"NC","984":"NC","985":"LA",
} as any;

// Expand to include city for major metro area codes
const AREA_CODE_CITIES: Record<string, string> = {
  "212":"new york","213":"los angeles","214":"dallas","215":"philadelphia",
  "216":"cleveland","281":"houston","301":"baltimore","302":"wilmington",
  "303":"denver","305":"miami","310":"los angeles","312":"chicago",
  "313":"detroit","314":"st louis","315":"syracuse","317":"indianapolis",
  "321":"orlando","323":"los angeles","346":"houston","347":"new york",
  "404":"atlanta","405":"oklahoma city","407":"orlando","408":"san jose",
  "410":"baltimore","412":"pittsburgh","414":"milwaukee","415":"san francisco",
  "424":"los angeles","469":"dallas","470":"atlanta","480":"phoenix",
  "501":"little rock","502":"louisville","503":"portland","504":"new orleans",
  "505":"albuquerque","510":"oakland","512":"austin","513":"cincinnati",
  "515":"des moines","516":"long island","561":"west palm beach","571":"arlington",
  "602":"phoenix","612":"minneapolis","614":"columbus","615":"nashville",
  "617":"boston","619":"san diego","623":"phoenix","626":"pasadena",
  "630":"naperville","646":"new york","650":"palo alto","678":"atlanta",
  "702":"las vegas","703":"arlington","704":"charlotte","706":"augusta",
  "713":"houston","714":"anaheim","718":"new york","720":"denver",
  "727":"st petersburg","732":"new brunswick","737":"austin","747":"los angeles",
  "754":"fort lauderdale","757":"norfolk","770":"atlanta","772":"port st lucie",
  "773":"chicago","786":"miami","801":"salt lake city","803":"columbia",
  "804":"richmond","808":"honolulu","813":"tampa","816":"kansas city",
  "817":"fort worth","818":"los angeles","828":"asheville","832":"houston",
  "843":"charleston","845":"poughkeepsie","847":"chicago","858":"san diego",
  "901":"memphis","904":"jacksonville","908":"elizabeth","909":"riverside",
  "913":"kansas city","914":"white plains","916":"sacramento","917":"new york",
  "918":"tulsa","919":"raleigh","925":"concord","929":"new york","941":"sarasota",
  "949":"irvine","954":"fort lauderdale","972":"dallas",
};

// Fix AREA_CODE_MAP to use objects
for (const [code, val] of Object.entries(AREA_CODE_MAP)) {
  if (typeof val === "string") {
    (AREA_CODE_MAP as any)[code] = {
      city: AREA_CODE_CITIES[code] || "",
      state: val,
    };
  }
}

/**
 * Validate a text blob (search result, FEC record, etc.)
 * against identity anchors. Returns score and accept/reject.
 */
export function validateAgainstAnchors(
  text: string,
  anchors: IdentityAnchors,
): ValidationResult {
  const t = text.toLowerCase();
  const result: ValidationResult = {
    score: 0, accepted: false, flagged: false,
    matches: [], mismatches: [],
  };

  // Phone match — strongest signal (nearly unique)
  if (anchors.phoneDigits && anchors.phoneDigits.length >= 10) {
    // Check for phone in various formats
    const digits = t.replace(/\D/g, "");
    const phone10 = anchors.phoneDigits.slice(-10); // last 10 digits
    if (digits.includes(phone10)) {
      result.score += 50;
      result.matches.push("phone");
    }
  }

  // Email match — unique identifier
  if (anchors.email && t.includes(anchors.email)) {
    result.score += 40;
    result.matches.push("email");
  }

  // Email domain match — confirms employer/company
  if (anchors.emailDomain && t.includes(anchors.emailDomain)) {
    result.score += 25;
    result.matches.push("email_domain");
  }

  // Zip code match — very specific location
  if (anchors.zip && anchors.zip.length === 5 && t.includes(anchors.zip)) {
    result.score += 15;
    result.matches.push("zip");
  }

  // City match
  if (anchors.city && anchors.city.length > 2 && t.includes(anchors.city)) {
    result.score += 15;
    result.matches.push("city");
  }

  // State match (only score if we also have city/zip to avoid generic state matches)
  if (anchors.state && anchors.state.length === 2) {
    // Look for state code near city or zip to avoid false positives
    const stateRegex = new RegExp(`\\b${anchors.state}\\b`, "i");
    if (stateRegex.test(text)) {
      if (result.matches.includes("city") || result.matches.includes("zip")) {
        result.score += 10;
        result.matches.push("state");
      }
    }
  }

  // Employer match — fuzzy match the first significant word
  if (anchors.employer && anchors.employer.length > 2) {
    const empWords = anchors.employer.split(/\s+/).filter(w => w.length > 2);
    const firstWord = empWords[0] || "";
    if (firstWord.length > 3 && t.includes(firstWord)) {
      // Check if at least 2 words match for multi-word employers
      if (empWords.length === 1 || empWords.filter(w => t.includes(w)).length >= 2) {
        result.score += 20;
        result.matches.push("employer");
      }
    }
  }

  // Determine accept/reject
  if (result.score >= 30) {
    result.accepted = true;
  } else if (result.score >= 15) {
    result.flagged = true;
  }

  return result;
}

/**
 * Validate a structured FEC record.
 * FEC records have explicit city/state/zip/employer fields.
 */
export function validateFECRecord(
  record: {
    contributor_city?: string;
    contributor_state?: string;
    contributor_zip?: string;
    contributor_employer?: string;
  },
  anchors: IdentityAnchors,
): ValidationResult {
  const result: ValidationResult = {
    score: 0, accepted: false, flagged: false,
    matches: [], mismatches: [],
  };

  const recCity = (record.contributor_city || "").toLowerCase().trim();
  const recState = (record.contributor_state || "").toUpperCase().trim();
  const recZip = (record.contributor_zip || "").substring(0, 5).trim();
  const recEmp = (record.contributor_employer || "").toLowerCase().trim();

  // City: if we know the lead's city, check for match or mismatch
  if (anchors.city && recCity) {
    if (recCity === anchors.city || recCity.includes(anchors.city) || anchors.city.includes(recCity)) {
      result.score += 20;
      result.matches.push("city");
    } else {
      result.score -= 10;
      result.mismatches.push(`city: ${recCity} ≠ ${anchors.city}`);
    }
  }

  // State
  if (anchors.state && recState) {
    if (recState === anchors.state) {
      result.score += 10;
      result.matches.push("state");
    } else {
      result.score -= 5;
      result.mismatches.push(`state: ${recState} ≠ ${anchors.state}`);
    }
  }

  // Zip
  if (anchors.zip && anchors.zip.length === 5 && recZip.length === 5) {
    if (recZip === anchors.zip) {
      result.score += 20;
      result.matches.push("zip");
    } else if (recZip.substring(0, 3) === anchors.zip.substring(0, 3)) {
      result.score += 8; // same region
      result.matches.push("zip_region");
    }
  }

  // Employer — fuzzy match
  if (anchors.employer && recEmp && recEmp !== "none" && recEmp !== "n/a"
      && recEmp !== "retired" && recEmp !== "self-employed" && recEmp !== "self"
      && recEmp !== "information requested") {
    const anchorWords = anchors.employer.split(/\s+/).filter(w => w.length > 2);
    const recWords = recEmp.split(/\s+/).filter(w => w.length > 2);
    const matchingWords = anchorWords.filter(w => recWords.some(rw => rw.includes(w) || w.includes(rw)));
    if (matchingWords.length > 0 && matchingWords.length >= Math.min(anchorWords.length, recWords.length) * 0.5) {
      result.score += 20;
      result.matches.push("employer");
    }
  }

  // Email domain vs employer
  if (anchors.emailDomain && recEmp) {
    const domainBase = anchors.emailDomain.split(".")[0].toLowerCase();
    if (domainBase.length > 3 && recEmp.includes(domainBase)) {
      result.score += 15;
      result.matches.push("email_domain_employer");
    }
  }

  // If we have NO anchors to compare, default to flagged (don't reject)
  if (!anchors.city && !anchors.state && !anchors.zip && !anchors.employer && !anchors.emailDomain) {
    result.score = 10;
    result.flagged = true;
    return result;
  }

  if (result.score >= 15) result.accepted = true;
  else if (result.score >= 5) result.flagged = true;
  // else rejected

  return result;
}

/**
 * Generate smarter search queries using all available anchors.
 * Returns an array of targeted queries from strongest to weakest.
 */
export function buildSmartQueries(anchors: IdentityAnchors): string[] {
  const queries: string[] = [];
  const { fullName, email, phoneDigits, phone, city, state, emailDomain } = anchors;

  // Phone search — most unique identifier
  if (phoneDigits && phoneDigits.length >= 10) {
    const formatted = phone || phoneDigits;
    queries.push(`"${formatted}"`);
    // Also try common formats
    const area = phoneDigits.slice(-10, -7);
    const mid = phoneDigits.slice(-7, -4);
    const last = phoneDigits.slice(-4);
    queries.push(`"${area}-${mid}-${last}"`);
  }

  // Email search — unique identifier
  if (email) {
    queries.push(`"${email}"`);
  }

  // Name + city (strong disambiguation)
  if (city && state) {
    queries.push(`"${fullName}" "${city}" "${state}"`);
  } else if (city) {
    queries.push(`"${fullName}" "${city}"`);
  } else if (state) {
    queries.push(`"${fullName}" "${state}"`);
  }

  // Name + email domain (confirms employer)
  if (emailDomain) {
    queries.push(`"${fullName}" "${emailDomain}"`);
  }

  // Fallback: just name (weakest, most collisions)
  queries.push(`"${fullName}"`);

  return queries;
}
