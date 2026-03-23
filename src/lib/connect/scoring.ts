// src/lib/connect/scoring.ts
// Connect engine — pure scoring logic, no DB dependencies.
// Scores a CRM lead (from leads table) against a CRM brochure (from brochures table).

import type {
  ConnectLead, ConnectBrochure, ConnectScoreResult,
  ConnectExplanation, ScoreBreakdown, ExplanationReason, CautionFlag, NextAction,
} from './types';

// ─── Parsers ─────────────────────────────────────────────────────────────────

/** Parse a price string to USD number. Returns null if unparseable. */
export function parsePrice(s: string | null | undefined): number | null {
  if (!s) return null;
  const lower = s.toLowerCase().trim();
  if (/^(ask|poa|tba|contact|n\/a|-+)$/.test(lower)) return null;
  // Remove currency symbols and letters except M/K/B
  const withM = lower.replace(/[€£¥]/g, '').replace(/usd|eur|gbp/gi, '').trim();
  // Handle "4.5m" or "4.5 million"
  const millionMatch = withM.match(/([\d,.]+)\s*(?:m(?:illion)?)\b/);
  if (millionMatch) return parseFloat(millionMatch[1].replace(/,/g, '')) * 1_000_000;
  const stripped = withM.replace(/[^0-9.]/g, '');
  const n = parseFloat(stripped);
  if (isNaN(n) || n === 0) return null;
  // If number looks like it's in millions without suffix (e.g. "4.5" from "€4.5M already handled above")
  // Small numbers < 1000 are probably millions (yacht prices)
  return n < 1000 ? n * 1_000_000 : n;
}

/** Parse a LOA string to feet. Handles meters and feet/inches. Returns null if unparseable. */
export function parseLOA(s: string | null | undefined): number | null {
  if (!s) return null;
  const trimmed = s.trim();
  // Feet/inches: "139'5\"" or "139ft" or "139 ft"
  const feetMatch = trimmed.match(/^([\d.]+)\s*(?:ft|feet|'|foot)/i);
  if (feetMatch) return parseFloat(feetMatch[1]);
  // Meters: "42.5m" or "42.50 m" or "42.5 meters"
  const meterMatch = trimmed.match(/^([\d.]+)\s*(?:m(?:eters?|etres?)?)\s*$/i);
  if (meterMatch) return parseFloat(meterMatch[1]) * 3.28084;
  // Bare number: assume meters if < 100, feet if >= 100
  const num = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num === 0) return null;
  return num < 100 ? num * 3.28084 : num;
}

/** Parse a plain numeric string. */
function parseNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// ─── Geo scoring ──────────────────────────────────────────────────────────────

const US_REGIONS: Record<string, string[]> = {
  southeast:    ['fl','ga','sc','nc'],
  mid_atlantic: ['va','md','de','nj','ny'],
  northeast:    ['ct','ri','ma','nh','me'],
  gulf:         ['tx','la','ms','al'],
  great_lakes:  ['il','oh','mi','in','wi','mn'],
  west_coast:   ['ca','or','wa'],
};
const INTL_REGIONS: Record<string, string[]> = {
  mediterranean: ['france','monaco','italy','spain','portugal','croatia','greece','turkey','malta',
                  'gibraltar','montenegro'],
  caribbean:     ['bahamas','virgin islands','cayman','antigua','barbados','martinique','grenada',
                  'trinidad','aruba','turks'],
  northern_europe: ['ireland','netherlands','germany','belgium','denmark','sweden','norway'],
  pacific:       ['australia','zealand','japan','singapore','thailand','indonesia'],
  middle_east:   ['emirates','dubai','qatar','saudi','oman','kuwait'],
};

const GEO_STOP = new Set(['united','states','kingdom','republic','of','the','and','coast','port',
  'bay','city','island','islands','north','south','east','west','new','san','santa','saint','st']);
const US_STATES = new Set(['al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in',
  'ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny',
  'nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy']);

function geoTokens(loc: string) {
  const l = loc.toLowerCase().replace(/[,\.]/g,' ').replace(/\s+/,' ').trim();
  const raw = l.split(' ').filter(Boolean);
  const tokens = raw.filter(t => t.length > 3 && !GEO_STOP.has(t));
  const state = raw.find(t => US_STATES.has(t)) || '';
  const country = l.includes('united states') || raw.includes('us') ? 'us' : raw.at(-1) || '';
  return { state, country, tokens };
}

function geoScore(listingLoc: string, buyerLoc: string): { pts: number; reason: string | null } {
  if (!listingLoc || !buyerLoc) return { pts: 4, reason: null };
  const l = geoTokens(listingLoc);
  const b = geoTokens(buyerLoc);
  const shared = l.tokens.find(t => t.length > 3 && b.tokens.includes(t));
  if (shared) return { pts: 16, reason: `Same area: ${shared}` };
  if (l.state && b.state && l.state === b.state)
    return { pts: 12, reason: `Same state (${l.state.toUpperCase()})` };
  if (l.state && b.state) {
    for (const [region, states] of Object.entries(US_REGIONS)) {
      if (states.includes(l.state) && states.includes(b.state))
        return { pts: 8, reason: `Same region (${region.replace('_',' ')})` };
    }
  }
  if (l.country === 'us' && b.country === 'us') return { pts: 5, reason: 'Both US' };
  for (const [region, terms] of Object.entries(INTL_REGIONS)) {
    const lIn = terms.some(t => l.tokens.includes(t));
    const bIn = terms.some(t => b.tokens.includes(t));
    if (lIn && bIn) return { pts: 8, reason: `Same region (${region.replace('_',' ')})` };
  }
  if (l.country && b.country && l.country === b.country && l.country !== 'us')
    return { pts: 6, reason: 'Same country' };
  return { pts: 1, reason: null };
}

// ─── Feature extraction from vessel data ─────────────────────────────────────

function vesselHasFlybridge(v: ConnectBrochure['vessel']): boolean | null {
  const text = [v.flybridge || '', v.description || '', ...(v.features || [])].join(' ').toLowerCase();
  if (/flybridge|fly\s*bridge|fly\s*deck/.test(text)) return true;
  if (/no flybridge|without flybridge|open bridge|express(?! flybridge)/.test(text)) return false;
  return null;
}

function vesselHasStabilizers(v: ConnectBrochure['vessel']): boolean | null {
  const text = [v.stabilisers || '', v.description || '', ...(v.features || [])].join(' ').toLowerCase();
  if (/stabiliz|gyrostabiliz|seakeeper|active fins|zero[\s-]speed/.test(text)) return true;
  if (/no stabiliz|without stabiliz/.test(text)) return false;
  return null;
}

function vesselEngineType(v: ConnectBrochure['vessel']): 'diesel'|'gas'|'hybrid'|null {
  const text = [v.engines || '', v.description || ''].join(' ').toLowerCase();
  if (/hybrid/.test(text)) return 'hybrid';
  if (/diesel|mtu\b|man\b |caterpillar|cummins|volvo\s*penta/.test(text)) return 'diesel';
  if (/gasoline|petrol|mercruiser/.test(text)) return 'gas';
  return null;
}

function vesselCabins(v: ConnectBrochure['vessel']): number | null {
  // Try staterooms field first (e.g. "6" or "6+1 crew")
  if (v.staterooms) {
    const m = v.staterooms.match(/(\d+)/);
    if (m) return parseInt(m[1]);
  }
  if (v.guestCabins) {
    const m = v.guestCabins.match(/(\d+)/);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function vesselCategory(v: ConnectBrochure['vessel'], builder: string): string {
  const text = [v.classification || '', v.description || ''].join(' ').toLowerCase();
  if (/sail|sloop|ketch|yawl/.test(text)) return 'sailing';
  if (/explorer|expedition|trawler/.test(text)) return 'explorer';
  if (/sport\s*fish|sportfish/.test(text)) return 'sport';
  if (/catamaran|multihull/.test(text)) return 'catamaran';
  if (/motor|flybridge|pilothouse|megayacht|super\s*yacht/.test(text)) return 'motor_yacht';
  return 'motor_yacht'; // default for most brokerage boats
}

// ─── Generate explainability text ────────────────────────────────────────────

function generateSummary(
  lead: ConnectLead, brochure: ConnectBrochure,
  score: number, reasons: ExplanationReason[], penalties: ExplanationReason[]
): string {
  const topReason = reasons[0]?.label || 'Partial match';
  const vessel = `${brochure.year || ''} ${brochure.builder} ${brochure.vessel_name}`.trim();
  if (score >= 70) return `Strong match — ${topReason.toLowerCase()} for ${lead.name}.`;
  if (score >= 45) return `Solid match on ${topReason.toLowerCase()} for ${lead.name}.`;
  if (score >= 25) return `Possible fit — ${topReason.toLowerCase()}. Recommend bot follow-up.`;
  return `Weak match between ${lead.name} and ${vessel}.`;
}

function deriveNextAction(
  routing: string, score: number, sentCount: number, engagementCount: number
): NextAction {
  if (routing === 'suppressed') return { action: 'none', label: 'No action', reason: 'Match suppressed' };
  if (score >= 70 && sentCount === 0)
    return { action: 'send_email', label: 'Send to buyer', reason: 'High-confidence match, not yet sent.' };
  if (score >= 70 && engagementCount > 0)
    return { action: 'call_buyer', label: 'Call buyer', reason: 'High score + recent engagement — escalate.' };
  if (score >= 45 && sentCount === 0)
    return { action: 'review_then_send', label: 'Review then send', reason: 'Good match — broker review recommended.' };
  if (sentCount >= 2 && engagementCount === 0)
    return { action: 'monitor', label: 'Monitor only', reason: 'Already sent twice with no engagement.' };
  if (routing === 'bot_queue')
    return { action: 'bot_send', label: 'Bot will handle', reason: 'Queued for automated outreach.' };
  return { action: 'review_then_send', label: 'Review then send', reason: 'Medium confidence — broker review.' };
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function calculateConnectScore(
  lead: ConnectLead,
  brochure: ConnectBrochure,
  opts: {
    sentCount?: number;
    engagementCount?: number;
    brokerBoost?: number;
    suppressionActive?: boolean;
  } = {}
): ConnectScoreResult {

  const { sentCount = 0, engagementCount = 0, brokerBoost = 0, suppressionActive = false } = opts;
  const v = brochure.vessel;

  // Accumulate per-dimension scores for breakdown
  const bd: ScoreBreakdown = {
    price_fit: 0, length_fit: 0, year_fit: 0, builder_fit: 0, category_fit: 0,
    flybridge_fit: 0, stabilizers_fit: 0, cabins_fit: 0, engine_fit: 0,
    location_fit: 0, listing_freshness: 0, engagement_boost: 0,
    exposure_decay: 0, broker_override: 0, total: 0,
  };

  const reasons: ExplanationReason[] = [];
  const penalties: ExplanationReason[] = [];
  const cautions: CautionFlag[] = [];

  // ── GATE CHECKS ─────────────────────────────────────────────────────────────
  if (suppressionActive) {
    return {
      score: 0, confidence: 'none', routing: 'suppressed',
      hardFail: true, hardFailReason: 'broker_suppressed',
      explanation: buildExplanation(0, 'suppressed', [], [], [],
        { action: 'none', label: 'Suppressed', reason: 'Match manually suppressed' }, bd,
        'Match suppressed by broker.'),
    };
  }

  const activeStatuses = ['active','warm','hot','qualified','interested','pipeline','new'];
  if (!activeStatuses.includes((lead.status || 'new').toLowerCase())) {
    return {
      score: 0, confidence: 'none', routing: 'suppressed',
      hardFail: true, hardFailReason: 'buyer_inactive',
      explanation: buildExplanation(0, 'suppressed', [], [], [],
        { action: 'none', label: 'No action', reason: 'Buyer not active' }, bd,
        'Buyer is inactive.'),
    };
  }

  // Hard budget gate: listing price > 130% of max budget
  const lPrice = parsePrice(v.price);
  const bMaxBudget = parseNum(lead.budget_max);
  if (lPrice !== null && bMaxBudget !== null && lPrice > bMaxBudget * 1.30) {
    return {
      score: 0, confidence: 'none', routing: 'suppressed',
      hardFail: true, hardFailReason: 'hard_budget_miss',
      explanation: buildExplanation(0, 'suppressed', [],
        [{ label: 'Price > 130% of max budget', impact: 0, field: 'price' }], [],
        { action: 'none', label: 'No action', reason: 'Price exceeds budget' }, bd,
        'Listing price exceeds buyer max budget by more than 30%.'),
    };
  }

  // Hard LOA gate: listing LOA > 25% outside buyer range
  const lLOA = parseLOA(v.loa);
  const bLOAMin = parseNum(lead.loa_min);
  const bLOAMax = parseNum(lead.loa_max);
  if (lLOA !== null && bLOAMin !== null && bLOAMax !== null) {
    if (lLOA < bLOAMin * 0.75 || lLOA > bLOAMax * 1.25) {
      return {
        score: 0, confidence: 'none', routing: 'suppressed',
        hardFail: true, hardFailReason: 'hard_loa_miss',
        explanation: buildExplanation(0, 'suppressed', [],
          [{ label: `LOA ${Math.round(lLOA)}ft outside range ${bLOAMin}–${bLOAMax}ft`, impact: 0, field: 'loa' }], [],
          { action: 'none', label: 'No action', reason: 'LOA outside range' }, bd,
          'Vessel length is significantly outside buyer range.'),
      };
    }
  }

  // ── 1. PRICE FIT (0–30 pts) ──────────────────────────────────────────────────
  const bMinBudget = parseNum(lead.budget_min);
  if (lPrice !== null && (bMinBudget !== null || bMaxBudget !== null)) {
    const max = bMaxBudget ?? (bMinBudget! * 1.30);
    const min = bMinBudget ?? 0;
    const ratio = lPrice / max;
    if (ratio <= 1.0 && lPrice >= min * 0.70) {
      bd.price_fit = 30;
      reasons.push({ label: `Price $${(lPrice/1e6).toFixed(1)}M within budget`, impact: 30, field: 'price' });
    } else if (ratio <= 1.15) {
      bd.price_fit = 18;
      cautions.push({ label: `Price ${Math.round((ratio-1)*100)}% above ideal budget`, severity: 'low' });
    } else {
      bd.price_fit = 6;
      penalties.push({ label: `Price ${Math.round((ratio-1)*100)}% over budget`, impact: -12, field: 'price' });
    }
  } else {
    bd.price_fit = 14; // neutral — no pricing data
  }

  // ── 2. LENGTH FIT (0–20 pts) ─────────────────────────────────────────────────
  if (lLOA !== null && (bLOAMin !== null || bLOAMax !== null)) {
    const lo = bLOAMin ?? 0;
    const hi = bLOAMax ?? Infinity;
    if (lLOA >= lo && lLOA <= hi) {
      bd.length_fit = 20;
      reasons.push({ label: `LOA ${Math.round(lLOA)}ft in preferred range`, impact: 20, field: 'loa' });
    } else if (lLOA >= lo * 0.90 && lLOA <= hi * 1.10) {
      bd.length_fit = 10;
      cautions.push({ label: `LOA ${Math.round(lLOA)}ft near but outside range`, severity: 'low' });
    } else {
      bd.length_fit = 0;
      penalties.push({ label: `LOA ${Math.round(lLOA)}ft outside preferred range`, impact: -8, field: 'loa' });
    }
  } else {
    bd.length_fit = 10; // neutral
  }

  // ── 3. YEAR FIT (0–12 pts) ─────────────────────────────────────────────────
  const bYearMin = parseNum(lead.year_min);
  const bYearMax = parseNum(lead.year_max);
  const lYear = brochure.year;
  if (lYear !== null && (bYearMin !== null || bYearMax !== null)) {
    const lo = bYearMin ?? 0;
    const hi = bYearMax ?? 9999;
    if (lYear >= lo && lYear <= hi) {
      bd.year_fit = 12;
      reasons.push({ label: `Year ${lYear} in preferred range`, impact: 12, field: 'year' });
    } else if (lYear >= lo - 4 && lYear <= hi + 4) {
      bd.year_fit = 6;
      cautions.push({ label: `Year ${lYear} near target range`, severity: 'low' });
    } else {
      bd.year_fit = 0;
      penalties.push({ label: `Year ${lYear} outside target range`, impact: -6, field: 'year' });
    }
  } else {
    bd.year_fit = 6; // neutral
  }

  // ── 4. BUILDER FIT (0–12 pts) ──────────────────────────────────────────────
  const bMake = (lead.make_preference || '').toLowerCase().trim();
  const lBuilder = (brochure.builder || '').toLowerCase().trim();
  if (bMake && lBuilder) {
    if (lBuilder === bMake || lBuilder.includes(bMake) || bMake.includes(lBuilder)) {
      bd.builder_fit = 12;
      reasons.push({ label: `Builder match: ${brochure.builder}`, impact: 12, field: 'builder' });
    } else {
      bd.builder_fit = 0;
      penalties.push({ label: `Builder ${brochure.builder} vs preferred ${lead.make_preference}`, impact: -5, field: 'builder' });
    }
  } else {
    bd.builder_fit = 6; // neutral — no preference stated
  }

  // ── 5. CATEGORY / VESSEL TYPE (0–10 pts) ─────────────────────────────────
  const vtPref = (lead.vessel_type_pref || '').toLowerCase().trim();
  if (vtPref && vtPref !== 'any') {
    const lCategory = vesselCategory(v, brochure.builder);
    const typeMap: Record<string,string[]> = {
      motor_yacht:  ['motor','motor_yacht','flybridge','pilothouse','megayacht'],
      sailing:      ['sail','sailing','sloop','ketch','yawl'],
      explorer:     ['explorer','expedition','trawler'],
      sport:        ['sport','sportfish','fishing'],
      catamaran:    ['catamaran','cat','multihull'],
    };
    let matched = false;
    for (const [key, terms] of Object.entries(typeMap)) {
      if (terms.some(t => vtPref.includes(t)) || vtPref.includes(key.replace('_',' '))) {
        if (lCategory === key) {
          bd.category_fit = 10;
          reasons.push({ label: `Vessel type match: ${vtPref}`, impact: 10, field: 'category' });
          matched = true;
        } else {
          bd.category_fit = 0;
          penalties.push({ label: `Type mismatch: want ${vtPref}, vessel is ${lCategory}`, impact: -8, field: 'category' });
          matched = true;
        }
        break;
      }
    }
    if (!matched) bd.category_fit = 5;
  } else {
    bd.category_fit = 5; // neutral
  }

  // ── 6. FLYBRIDGE (0–4 pts) ─────────────────────────────────────────────────
  const fbPref = (lead.flybridge_pref || '').toLowerCase().trim();
  if (fbPref && fbPref !== 'any') {
    const hasFB = vesselHasFlybridge(v);
    if (hasFB !== null) {
      if ((fbPref === 'yes' && hasFB) || (fbPref === 'no' && !hasFB)) {
        bd.flybridge_fit = 4;
        reasons.push({ label: fbPref === 'yes' ? 'Flybridge match' : 'Express layout match', impact: 4, field: 'flybridge' });
      } else {
        bd.flybridge_fit = 0;
        penalties.push({ label: `Flybridge: buyer wants ${fbPref}, vessel has ${hasFB ? 'flybridge' : 'none'}`, impact: -4, field: 'flybridge' });
      }
    }
  }

  // ── 7. STABILIZERS (0–4 pts) ───────────────────────────────────────────────
  const stabPref = (lead.stabilizers_pref || '').toLowerCase().trim();
  if (stabPref === 'yes') {
    const hasStab = vesselHasStabilizers(v);
    if (hasStab === true) {
      bd.stabilizers_fit = 4;
      reasons.push({ label: 'Stabilizers confirmed', impact: 4, field: 'stabilizers' });
    } else if (hasStab === false) {
      bd.stabilizers_fit = 0;
      penalties.push({ label: 'Buyer requires stabilizers — not found', impact: -4, field: 'stabilizers' });
    } else {
      cautions.push({ label: 'Buyer wants stabilizers — not confirmed in listing', severity: 'low' });
    }
  }

  // ── 8. CABINS (0–3 pts) ────────────────────────────────────────────────────
  const minCabins = parseInt(lead.min_cabins || '0');
  if (minCabins > 0) {
    const cabins = vesselCabins(v);
    if (cabins !== null) {
      if (cabins >= minCabins) {
        bd.cabins_fit = 3;
        reasons.push({ label: `${cabins} staterooms meets ${minCabins}+ requirement`, impact: 3, field: 'cabins' });
      } else {
        bd.cabins_fit = 0;
        penalties.push({ label: `${cabins} staterooms below ${minCabins} minimum`, impact: -3, field: 'cabins' });
      }
    }
  }

  // ── 9. ENGINE TYPE (0–3 pts) ───────────────────────────────────────────────
  const engPref = (lead.engine_type_pref || '').toLowerCase().trim();
  if (engPref && engPref !== 'any') {
    const engType = vesselEngineType(v);
    if (engType !== null) {
      if (engType === engPref) {
        bd.engine_fit = 3;
        reasons.push({ label: `${engPref} engines confirmed`, impact: 3, field: 'engines' });
      } else {
        bd.engine_fit = 0;
        penalties.push({ label: `Engine: want ${engPref}, vessel has ${engType}`, impact: -2, field: 'engines' });
      }
    }
  }

  // ── 10. LOCATION (0–16 pts) ────────────────────────────────────────────────
  const buyerLoc = lead.preferred_location || '';
  const vesselLoc = v.location || '';
  const { pts: locPts, reason: locReason } = geoScore(vesselLoc, buyerLoc);
  bd.location_fit = locPts;
  if (locReason) reasons.push({ label: locReason, impact: locPts, field: 'location' });

  // ── 11. LISTING FRESHNESS (0–8 pts) ────────────────────────────────────────
  const brochureAge = brochure.created_at
    ? Math.floor((Date.now() - new Date(brochure.created_at).getTime()) / 86_400_000)
    : 999;
  if (brochureAge <= 7) {
    bd.listing_freshness = 8;
    reasons.push({ label: `New listing — added ${brochureAge}d ago`, impact: 8, field: 'listing_freshness' });
  } else if (brochureAge <= 30) {
    bd.listing_freshness = 3;
  } else if (brochureAge > 180) {
    bd.listing_freshness = -3;
    cautions.push({ label: 'Listing in CRM 6+ months', severity: 'low' });
  }

  // ── 12. ENGAGEMENT BOOST ──────────────────────────────────────────────────
  if (engagementCount > 0) {
    bd.engagement_boost = Math.min(engagementCount * 4, 12);
    reasons.push({ label: `Recent engagement (${engagementCount} events)`, impact: bd.engagement_boost, field: 'engagement' });
  }

  // ── 13. EXPOSURE DECAY ────────────────────────────────────────────────────
  if (sentCount >= 3 && engagementCount === 0) {
    bd.exposure_decay = -20;
    penalties.push({ label: `Sent ${sentCount} times with no engagement`, impact: -20, field: 'exposure' });
  } else if (sentCount >= 2) {
    bd.exposure_decay = -8;
    cautions.push({ label: `Already sent ${sentCount} times`, severity: 'medium' });
  } else if (sentCount === 1) {
    cautions.push({ label: 'Already sent once', severity: 'low' });
  }

  // ── 14. LEAD RECENCY ──────────────────────────────────────────────────────
  if (lead.last_contacted_at) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(lead.last_contacted_at).getTime()) / 86_400_000
    );
    if (daysAgo <= 14) {
      reasons.push({ label: `Buyer active recently (${daysAgo}d ago)`, impact: 5, field: 'lead_recency' });
    } else if (daysAgo > 90) {
      cautions.push({ label: `Buyer not contacted in ${daysAgo} days`, severity: 'medium' });
    }
  }

  // ── 15. BROKER BOOST ──────────────────────────────────────────────────────
  if (brokerBoost > 0) {
    bd.broker_override = brokerBoost;
    reasons.push({ label: 'Broker strategic boost', impact: brokerBoost, field: 'broker_override' });
  }

  // ── COMPUTE TOTAL ─────────────────────────────────────────────────────────
  const rawTotal =
    bd.price_fit + bd.length_fit + bd.year_fit + bd.builder_fit + bd.category_fit +
    bd.flybridge_fit + bd.stabilizers_fit + bd.cabins_fit + bd.engine_fit +
    bd.location_fit + bd.listing_freshness + bd.engagement_boost + bd.exposure_decay;

  // Apply penalty impacts to raw total (penalties store negative values as impact)
  const penaltyTotal = penalties.reduce((sum, p) => sum + Math.min(p.impact, 0), 0);
  const scoreBeforeClamp = rawTotal + penaltyTotal + bd.broker_override;
  const score = Math.max(0, Math.min(100, scoreBeforeClamp));
  bd.total = score;

  // ── ROUTING ───────────────────────────────────────────────────────────────
  const confidence = score >= 70 ? 'high' : score >= 45 ? 'medium' : score >= 25 ? 'low' : 'none';
  const routing = score >= 45 ? 'manual_queue' : score >= 25 ? 'bot_queue' : 'suppressed';

  const routingReason = score >= 70
    ? `Score ${score} — high confidence, send manually`
    : score >= 45
    ? `Score ${score} — medium confidence, broker review`
    : score >= 25
    ? `Score ${score} — low confidence, bot follow-up`
    : `Score ${score} — below threshold, suppressed`;

  // Sort reasons/penalties by absolute impact desc, keep top 3
  reasons.sort((a, b) => b.impact - a.impact);
  penalties.sort((a, b) => a.impact - b.impact); // most negative first

  const nextAction = deriveNextAction(routing, score, sentCount, engagementCount);
  const summary = generateSummary(lead, brochure, score, reasons, penalties);

  return {
    score,
    confidence: confidence as ConnectScoreResult['confidence'],
    routing: routing as ConnectScoreResult['routing'],
    hardFail: false,
    explanation: buildExplanation(
      score, routing, reasons.slice(0,3), penalties.slice(0,3), cautions, nextAction, bd, summary, routingReason
    ),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildExplanation(
  score: number, routing: string,
  top_reasons: ExplanationReason[], top_penalties: ExplanationReason[],
  caution_flags: CautionFlag[], next_best_action: NextAction,
  score_breakdown: ScoreBreakdown, summary_sentence: string,
  routing_reason: string = ''
): ConnectExplanation {
  return {
    summary_sentence, top_reasons, top_penalties, caution_flags,
    next_best_action, score_breakdown, routing_reason,
  };
}

/** Compute manual_priority_score from raw score + context. Range 0–110. */
export function computePriorityScore(
  score: number,
  isStrategicListing: boolean,
  brokerBoost: number,
  sentCount: number,
  engagementCount: number
): number {
  let priority = score;
  if (isStrategicListing) priority += 10;
  priority += brokerBoost;
  priority -= sentCount * 3;
  priority += Math.min(engagementCount * 3, 9);
  return Math.max(0, Math.min(110, priority));
}
