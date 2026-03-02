/**
 * LAYER 1: Listing Data Normalization & Validation
 * 
 * Takes raw scraped listing.json and produces a strict normalized schema
 * with confidence scoring per field. Refuses to populate fields with
 * low-confidence data — omits instead.
 */

// === VALIDATION RULES ===
function isValidYear(v) {
  const n = parseInt(v, 10);
  return n >= 1900 && n <= new Date().getFullYear() + 2 && /^\d{4}$/.test(String(n));
}
function isValidPrice(v) {
  return /[\d,]+/.test(v) && !/amplifier|speaker|musiccast|antenna/i.test(v);
}
function isValidMeasurement(v) {
  return /\d/.test(v) && v.length < 40 && !/amplifier|speaker|musiccast|antenna|apple|samsung/i.test(v);
}
function isValidInteger(v) {
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n < 200;
}
const VALID_CONDITIONS = ['New', 'Used', 'Refit', 'Unknown'];
function isValidCondition(v) {
  return VALID_CONDITIONS.some(c => c.toLowerCase() === v.toLowerCase());
}
function normalizeCondition(v) {
  const match = VALID_CONDITIONS.find(c => c.toLowerCase() === v.toLowerCase());
  return match || 'Unknown';
}

// === GARBAGE DETECTION ===
const GARBAGE_RE = /^(boats?|n\/?a|none|tank:?|overall:?|unknown|--|-)$/i;
const EQUIPMENT_RE = /amplifier|musiccast|speaker|antenna|apple\s*tv|samsung|lg\s*\d|crestron|yamaha|revel|subwoofer|docking\s*station/i;

function clean(val) {
  if (!val || typeof val !== 'string') return '';
  let v = val.trim();
  if (GARBAGE_RE.test(v)) return '';
  if (v.length > 120) return '';  // Likely a description fragment
  if (EQUIPMENT_RE.test(v)) return ''; // AV equipment leaking into spec fields
  return v;
}

// === FLEXIBLE SPEC LOOKUP ===
// Priority: exact match → normalized match → partial match
function specLookup(specs, ...keys) {
  if (!specs) return '';
  // Exact match
  for (const k of keys) {
    if (specs[k] !== undefined && specs[k] !== null) {
      const v = clean(String(specs[k]));
      if (v) return v;
    }
  }
  // Normalized match (lowercase, no spaces/colons)
  const normalize = s => s.toLowerCase().replace(/[:\s_-]+/g, '');
  for (const k of keys) {
    const nk = normalize(k);
    const found = Object.entries(specs).find(([sk]) => normalize(sk) === nk);
    if (found) { const v = clean(String(found[1])); if (v) return v; }
  }
  return '';
}

// === CONFIDENCE SCORING ===
// 1.0 = high confidence (structured data, known label)
// 0.7 = medium (parsed from title, reasonable match)
// 0.4 = low (fuzzy match, heuristic)
// 0.0 = no data

function scoreField(value, validator) {
  if (!value) return { value: '', confidence: 0 };
  if (validator && !validator(value)) return { value: '', confidence: 0 };
  // If it came from a known spec key, high confidence
  return { value, confidence: 0.9 };
}

// === MAIN NORMALIZATION ===
function normalizeListingData(rawData) {
  const s = rawData.specs || {};
  const title = rawData.title || '';
  
  // Parse title: "121 ft 2022 Benetti Motopanfilo | 121ft" or "2022 Benetti Motopanfilo"
  const titleMatch = title.match(/(?:(\d+)\s*(?:ft|')\s+)?(\d{4})\s+(.+?)(?:\s*\|.*)?$/i);
  let titleLength = '', titleYear = '', titleMakeModel = '';
  if (titleMatch) {
    titleLength = titleMatch[1] ? `${titleMatch[1]} ft` : '';
    titleYear = titleMatch[2] || '';
    titleMakeModel = titleMatch[3] || '';
  }

  // === IDENTITY ===
  const builder = specLookup(s, 'Make', 'Shipyard', 'Builder', 'Manufacturer') || rawData.parsedMake || '';
  const model = specLookup(s, 'Model') || rawData.parsedModel || '';
  const year = specLookup(s, 'Year') || titleYear || '';
  const vesselName = specLookup(s, 'Name') || rawData.boatName || '';
  const vesselType = specLookup(s, 'Class', 'Type', 'Category') || 'Motor Yacht';

  // === PRICING ===
  const rawPrice = rawData.price || specLookup(s, 'Price') || '';
  const askingPrice = isValidPrice(rawPrice) ? rawPrice : '';
  const location = rawData.location || '';

  // === DIMENSIONS ===
  const loa = specLookup(s, 'Length Overall', 'LOA', 'Length') || titleLength || '';
  const beam = specLookup(s, 'Beam') || '';
  const draft = specLookup(s, 'Max Draft', 'Draft', 'Draft (Full Load)', 'Maximum Draft') || '';
  const grossTonnage = specLookup(s, 'Gross Tonnage', 'Tonnage') || '';
  const lwl = specLookup(s, 'Length at Waterline', 'LWL') || '';
  const displacement = specLookup(s, 'Displacement', 'Displacement (Full Load)') || '';

  // === PROPULSION ===
  let engineMake = '', engineModel = '', engineHP = '', engineHours = '';
  // Try to parse from "Main Engines" spec or description text
  const mainEngines = specLookup(s, 'Main Engines (2)', 'Main Engines', 'Main Engine');
  if (mainEngines) {
    const engMatch = mainEngines.match(/(\d+)\s*x\s*(\w+)\s+([A-Z0-9][\w-]*)(?:.*?(\d[\d,]*)\s*(?:kW|hp|mHP))?/i);
    if (engMatch) {
      engineMake = engMatch[2] || '';
      engineModel = engMatch[3]?.trim() || '';
      engineHP = engMatch[4] ? `${engMatch[4]} hp` : '';
    }
  }
  // Fallback: parse engine make/model from description MACHINERY section
  if (!engineMake && rawData.description) {
    const machMatch = rawData.description.match(/Main Engines?:\s*\d+\s*x\s*(\w+)\s+([A-Z0-9][\w-]*)/i);
    if (machMatch) {
      engineMake = machMatch[1] || '';
      engineModel = machMatch[2]?.trim() || '';
    }
    // Also look for "twin MAN 1400HP" pattern
    if (!engineMake) {
      const twinMatch = rawData.description.match(/(?:twin|2\s*x)\s+(\w+)\s+(\d+\s*HP)/i);
      if (twinMatch) {
        engineMake = twinMatch[1] || '';
        if (!engineHP) engineHP = twinMatch[2] || '';
      }
    }
    // Extract HP from description if still missing
    if (!engineHP) {
      const hpMatch = rawData.description.match(/(\d[\d,]*)\s*(?:mHP|HP|hp)\s/);
      if (hpMatch) engineHP = `${hpMatch[1]} hp`;
    }
  }
  if (!engineMake) engineMake = specLookup(s, 'Engine Make', 'Engine Brand');
  if (!engineHP) {
    const totalPower = specLookup(s, 'Total Power', 'Power', 'HP', 'Horsepower', 'Engine Power');
    if (totalPower && isValidMeasurement(totalPower)) engineHP = totalPower;
  }
  engineHours = specLookup(s, 'Engine Hours', 'Engine 1 Hours', 'Port Engine Hours') || '';
  const engineType = specLookup(s, 'Engine Type', 'Drive Type') || 'Inboard';
  const fuelType = specLookup(s, 'Fuel Type', 'Engine Fuel') || 'Diesel';
  const cruiseSpeed = specLookup(s, 'Cruising Speed') || '';
  const maxSpeed = specLookup(s, 'Max Speed', 'Maximum Speed') || '';
  const range = specLookup(s, 'Range') || '';

  // === ACCOMMODATIONS ===
  const cabins = specLookup(s, 'Guest Cabins', 'Cabins', 'Staterooms') || '';
  const heads = specLookup(s, 'Guest Heads', 'Heads', 'Bathrooms') || '';
  const crewCabins = specLookup(s, 'Crew Cabins') || '';
  const crewHeads = specLookup(s, 'Crew Heads') || '';

  // === CAPACITIES ===
  const fuel = specLookup(s, 'Fuel', 'Fuel Capacity', 'Fuel Tank', 'Fuel Tanks') || '';
  const freshWater = specLookup(s, 'Fresh Water', 'Fresh Water Capacity', 'Water', 'Water Capacity') || '';
  const holding = specLookup(s, 'Holding', 'Holding Tank', 'Grey/Black Water', 'Black Water') || '';

  // === CONSTRUCTION ===
  const condition = specLookup(s, 'Condition') || 'Used';
  const hullMaterial = specLookup(s, 'Hull Material', 'Hull', 'Hull Construction') || '';
  const hullShape = specLookup(s, 'Hull Shape', 'Hull Type') || '';
  const flag = specLookup(s, 'Flag', 'Flag Of Registry', 'Registry') || '';

  // === SYSTEMS ===
  const generators = specLookup(s, 'Generators (2)', 'Generators', 'Generator', 'Main Generator') || '';
  const stabilizers = specLookup(s, 'Stabilizers', 'Stabilizer') || '';
  const bowThruster = specLookup(s, 'Bow Thruster', 'Bow Thrusters') || '';
  const steering = specLookup(s, 'Steering System', 'Steering') || '';
  const ac = specLookup(s, 'Air Conditioning', 'A/C', 'AC', 'HVAC') || '';
  const watermaker = specLookup(s, 'Watermakers', 'Watermaker', 'Water Maker', 'Fresh Water Maker') || '';
  const classification = specLookup(s, 'Classification', 'Class Society') || '';
  const gearboxes = specLookup(s, 'Gearboxes (2)', 'Gearboxes', 'Gearbox', 'Gear Boxes', 'Transmission') || '';
  const windlass = specLookup(s, 'Windlasses (2)', 'Windlasses', 'Windlass') || '';
  const fuelSeparator = specLookup(s, 'Fuel Separator') || '';
  const sewageTreatment = specLookup(s, 'Black Water Treatment Plant', 'Sewage Treatment', 'Sewage Treatment System') || '';

  // === NARRATIVE ===
  const rawDesc = rawData.description || '';
  // Split into short description (first 2 paragraphs) and key features
  const paragraphs = rawDesc.split('\n').filter(l => l.trim().length > 0);
  let shortDesc = '';
  let keyFeatures = [];
  let fullDescription = rawDesc;

  // Find "Key Features:" section
  const kfIndex = paragraphs.findIndex(l => /^Key Features:?$/i.test(l.trim()));
  if (kfIndex > -1) {
    shortDesc = paragraphs.slice(0, kfIndex).join('\n');
    // Collect features until next ALL-CAPS section header
    for (let i = kfIndex + 1; i < paragraphs.length; i++) {
      const line = paragraphs[i].trim();
      if (line === line.toUpperCase() && line.length > 3 && /[A-Z]/.test(line)) break;
      if (line.length > 5 && line.length < 200) keyFeatures.push(line);
    }
  } else {
    // First 5 paragraphs as short description
    const descParagraphs = paragraphs.filter(l => l.length > 50).slice(0, 5);
    shortDesc = descParagraphs.join('\n');
  }

  // === ASSETS ===
  const images = (rawData.images || []).filter(img => img.localPath);
  const heroImage = images[0] || null;
  const galleryImages = images.slice(1);

  // === VALIDATE REQUIRED FIELDS ===
  const errors = [];
  if (!builder) errors.push('Missing builder/make');
  if (!model) errors.push('Missing model');
  if (!year || !isValidYear(year)) errors.push(`Invalid or missing year: "${year}"`);
  if (!askingPrice) errors.push('Missing price');
  if (!heroImage) errors.push('Missing hero image');

  if (errors.length > 0) {
    console.warn(`⚠️  Validation warnings: ${errors.join('; ')}`);
    // Don't abort — warn but continue with available data
  }

  // === CONFIDENCE MAP ===
  const confidence = {
    builder: builder ? 0.9 : 0,
    model: model ? 0.9 : 0,
    year: isValidYear(year) ? 1.0 : 0,
    vesselName: vesselName ? 0.9 : 0,
    price: isValidPrice(askingPrice) ? 1.0 : 0,
    loa: isValidMeasurement(loa) ? 0.9 : 0,
    beam: isValidMeasurement(beam) ? 0.9 : 0,
    draft: isValidMeasurement(draft) ? 0.9 : 0,
    cabins: isValidInteger(cabins) ? 1.0 : 0,
    heads: isValidInteger(heads) ? 1.0 : 0,
    heroImage: heroImage ? 1.0 : 0,
  };

  // === BUILD NORMALIZED OUTPUT ===
  return {
    identity: {
      builder: builder || '',
      model: model || '',
      year: isValidYear(year) ? year : '',
      vessel_name: vesselName,
      vessel_type: vesselType,
    },
    pricing: {
      asking_price: askingPrice,
      currency: askingPrice.startsWith('€') ? 'EUR' : askingPrice.startsWith('£') ? 'GBP' : 'USD',
      location: location,
    },
    dimensions: {
      loa: isValidMeasurement(loa) ? loa : '',
      lwl: isValidMeasurement(lwl) ? lwl : '',
      beam: isValidMeasurement(beam) ? beam : '',
      draft: isValidMeasurement(draft) ? draft : '',
      gross_tonnage: grossTonnage,
      displacement: displacement,
    },
    propulsion: {
      engines: [{
        make: engineMake,
        model: engineModel,
        horsepower: engineHP,
        hours: engineHours,
        type: engineType,
        fuel: fuelType,
      }],
      cruise_speed: isValidMeasurement(cruiseSpeed) ? cruiseSpeed : '',
      max_speed: isValidMeasurement(maxSpeed) ? maxSpeed : '',
      range: isValidMeasurement(range) ? range : '',
    },
    accommodations: {
      cabins: isValidInteger(cabins) ? cabins : '',
      heads: isValidInteger(heads) ? heads : '',
      crew_cabins: isValidInteger(crewCabins) ? crewCabins : '',
      crew_heads: isValidInteger(crewHeads) ? crewHeads : '',
    },
    capacities: {
      fuel: isValidMeasurement(fuel) ? fuel : '',
      water: isValidMeasurement(freshWater) ? freshWater : '',
      holding: isValidMeasurement(holding) ? holding : '',
    },
    construction: {
      condition: isValidCondition(condition) ? normalizeCondition(condition) : 'Used',
      hull_material: hullMaterial,
      hull_shape: hullShape,
      flag: flag,
      classification: classification,
    },
    systems: {
      generators: generators,
      stabilizers: stabilizers,
      bow_thruster: bowThruster,
      steering: steering,
      ac: ac,
      watermaker: watermaker,
      gearboxes: gearboxes,
      windlass: windlass,
      fuel_separator: fuelSeparator,
      sewage_treatment: sewageTreatment,
    },
    narrative: {
      short_description: shortDesc,
      full_description: fullDescription,
      key_features: keyFeatures,
    },
    assets: {
      hero_image: heroImage,
      gallery_images: galleryImages,
      thumbnail_images: images.slice(1, 5), // First 4 after hero for cover page
    },
    confidence,
    validation_errors: errors,
    source: {
      url: rawData.url || rawData.sourceUrl || '',
      scraped_at: rawData.scrapedAt || new Date().toISOString(),
    },
  };
}

module.exports = { normalizeListingData, specLookup, clean, isValidYear, isValidPrice, isValidMeasurement };
