#!/usr/bin/env node
/**
 * YotCRM Email Parser v2 — SQLite Edition
 * 
 * Parses yacht lead emails and stores in SQLite with multi-boat tracking.
 * Dedup: same email = update existing lead + add new boat.
 * 
 * Email Types Supported:
 * 1. Denison Internal (Price Watch, Featured Listings, Website Chat)
 * 2. YachtWorld/MLS leads (from boatwizard)
 * 3. Boat Show leads
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Paths — use env vars (set by start.sh on Railway, or by API route)
const RAW_EMAILS_DIR = process.env.RAW_EMAILS_DIR || '/data/inbox/raw_emails';
const PROCESSED_DIR = process.env.PROCESSED_EMAILS_DIR || '/data/inbox/processed_emails';
const DB_PATH = process.env.DB_PATH || '/data/yotcrm.db';

// Database — lazy init (so module can be imported without opening DB)
let db = null;
let findLeadByEmail, findLeadByPhone, findLeadByName;
let insertLead, updateLeadTimestamp, insertBoat, checkDuplicateBoat;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    findLeadByEmail = db.prepare('SELECT id FROM leads WHERE email = ? COLLATE NOCASE');
    findLeadByPhone = db.prepare("SELECT id FROM leads WHERE phone = ? AND phone != ''");
    findLeadByName = db.prepare("SELECT id FROM leads WHERE first_name = ? COLLATE NOCASE AND last_name = ? COLLATE NOCASE AND first_name != ''");
    insertLead = db.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, tags, notes, source, status, created_at, updated_at)
      VALUES (@first_name, @last_name, @email, @phone, @tags, @notes, @source, @status, datetime('now'), datetime('now'))
    `);
    updateLeadTimestamp = db.prepare(`UPDATE leads SET updated_at = datetime('now') WHERE id = ?`);
    insertBoat = db.prepare(`
      INSERT INTO boats (lead_id, make, model, year, length, price, location, listing_url, source_email, added_at)
      VALUES (@lead_id, @make, @model, @year, @length, @price, @location, @listing_url, @source_email, datetime('now'))
    `);
    checkDuplicateBoat = db.prepare("SELECT id FROM boats WHERE lead_id = ? AND listing_url = ? AND listing_url != ''");
  }
  return db;
}

// ─── Email Parsing (v3 — proper MIME/base64/multipart support) ──────

function decodeQuotedPrintable(str) {
    if (!str) return '';
    str = str.replace(/=\r?\n/g, '');
    str = str.replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    return str;
}

function decodeBase64(str) {
    if (!str) return '';
    // Strip whitespace that's common in MIME base64 blocks
    const cleaned = str.replace(/[\r\n\s]/g, '');
    try {
        return Buffer.from(cleaned, 'base64').toString('utf-8');
    } catch (e) {
        return str; // Return raw if decode fails
    }
}

/**
 * Extract text/plain body from a MIME multipart email.
 * Handles: base64, quoted-printable, nested multipart, forwarded emails.
 */
function extractTextParts(raw) {
    const results = [];

    // Find all boundaries defined in the email
    const boundaryMatches = [...raw.matchAll(/boundary="?([^"\r\n;]+)"?/gi)];
    if (boundaryMatches.length === 0) {
        // Not multipart — return entire body after first blank line
        const idx = raw.search(/\r?\n\r?\n/);
        if (idx === -1) return [raw];
        const headerBlock = raw.substring(0, idx);
        let body = raw.substring(idx).replace(/^\r?\n\r?\n/, '');
        if (/Content-Transfer-Encoding:\s*base64/i.test(headerBlock)) {
            body = decodeBase64(body);
        } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headerBlock)) {
            body = decodeQuotedPrintable(body);
        }
        return [body];
    }

    for (const bm of boundaryMatches) {
        const boundary = bm[1];
        const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Split on boundary
        const partRegex = new RegExp('--' + escapedBoundary + '\\s*\\r?\\n([\\s\\S]*?)(?=--' + escapedBoundary + ')', 'g');
        let match;
        while ((match = partRegex.exec(raw)) !== null) {
            const part = match[1];
            // Find headers section (before first blank line)
            const bodyIdx = part.search(/\r?\n\r?\n/);
            if (bodyIdx === -1) continue;
            const partHeaders = part.substring(0, bodyIdx);
            // Only check THIS part's headers for text/plain (not nested content)
            const ctMatch = partHeaders.match(/Content-Type:\s*text\/plain[^\r\n]*/i);
            if (ctMatch) {
                let partBody = part.substring(bodyIdx).replace(/^\r?\n\r?\n/, '');
                // Strip trailing boundary markers
                partBody = partBody.replace(/\r?\n--[^\r\n]+--\s*$/, '').replace(/\r?\n--[^\r\n]+\s*$/, '');

                if (/Content-Transfer-Encoding:\s*base64/i.test(partHeaders)) {
                    partBody = decodeBase64(partBody);
                } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(partHeaders)) {
                    partBody = decodeQuotedPrintable(partBody);
                }
                results.push(partBody);
            }
        }
    }
    return results;
}

function parseEml(content) {
    // Extract top-level headers
    const headerEnd = content.search(/\r?\n\r?\n/);
    const headerPart = headerEnd > 0 ? content.substring(0, headerEnd) : '';
    const headers = {};
    const headerLines = headerPart.split(/\r?\n/);
    let currentHeader = '';
    for (const line of headerLines) {
        if (line.match(/^[A-Za-z-]+:/)) {
            const colonIdx = line.indexOf(':');
            const key = line.substring(0, colonIdx).toLowerCase();
            const value = line.substring(colonIdx + 1).trim();
            headers[key] = value;
            currentHeader = key;
        } else if (line.startsWith(' ') || line.startsWith('\t')) {
            if (currentHeader) headers[currentHeader] += ' ' + line.trim();
        }
    }

    // Extract all text/plain parts (handles base64, QP, multipart)
    const textParts = extractTextParts(content);
    // Use the longest text part as the body (best chance of containing lead data)
    let body = '';
    for (const part of textParts) {
        if (part.length > body.length) body = part;
    }

    // Fallback: if no text parts found, try the raw body
    if (!body) {
        body = content.substring(headerEnd > 0 ? headerEnd + 2 : 0);
    }

    return { headers, body };
}

function identifyEmailType(headers, body) {
    const from = (headers.from || '').toLowerCase();
    const subject = (headers.subject || '').toLowerCase();
    const bodyLower = body.toLowerCase();

    // YachtWorld / BoatWizard MLS leads
    // YachtWorld / BoatWizard / BoatTrader / BoatsMonitor MLS leads
    if (bodyLower.includes('yachtworld inquiry') || bodyLower.includes('mls - yachtworld') ||
        bodyLower.includes('yachtworld id:') || from.includes('boatwizard') || from.includes('leads.boatwizard.com') ||
        from.includes('boatsmonitor') || bodyLower.includes('boattrader') || bodyLower.includes('boat trader') ||
        bodyLower.includes('sales boat:') || bodyLower.includes('individual prospect:') ||
        subject.includes('boattrader') || subject.includes('boat trader')) {
        return 'yachtworld';
    }

    // RightBoat leads (forwarded via Denison or direct)
    if (bodyLower.includes('rightboat inquiry') || bodyLower.includes('rightboat.com/boats-for-sale') ||
        subject.includes('right boat') || from.includes('rightboat.com')) {
        return 'rightboat';
    }

    // JamesEdition leads (forwarded via Denison or direct)
    if (bodyLower.includes('jamesedition') || from.includes('jamesedition') ||
        subject.includes('jamesedition')) {
        return 'jamesedition';
    }

    // YATCO leads
    if (from.includes('yatco.com') || bodyLower.includes('yatco.com')) {
        return 'yatco';
    }

    // Boat show leads
    if (bodyLower.includes('show attending') || bodyLower.includes('boat of interest') ||
        bodyLower.includes('dates attending') || subject.includes('boat show') ||
        subject.includes('mibs') || subject.includes('flibs')) {
        return 'boatshow';
    }

    // Denison inquiry leads (forwarded from inquiry/inquiries addresses)
    if (from.includes('inquiries@') || from.includes('inquiry@') || from.includes('inquieries@') || from.includes('inquiery@')) {
        if (from.includes('denisonyacht') || from.includes('denisonyachtsales') || from.includes('denison')) return 'denison';
    }

    // Denison internal leads (general catch-all for denison-origin emails)
    if (from.includes('denisonyacht') || from.includes('denison')) return 'denison';
    return 'unknown';
}

function cleanPhone(phone) {
    if (!phone) return '';
    return phone.replace(/[^\d+]/g, '');
}

function parseName(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Parse a boat description string into structured fields.
 * Handles many common formats from Denison emails:
 *   "2020 Azimut 66"        → year=2020, make=Azimut, model=66
 *   "94 Ferretti 2003"      → length=94, make=Ferretti, year=2003
 *   "38' Viking 1990"       → length=38, make=Viking, year=1990
 *   "72 Azimut 2016"        → length=72, make=Azimut, year=2016
 *   "Marlow 2020"           → make=Marlow, year=2020
 *   "President 2008"        → make=President, year=2008
 *   "107 President 2008"    → length=107, make=President, year=2008
 *   "78 feet Van der Valk"  → length=78, make=Van der Valk
 *   "...availability of the 43 Viking 1997" → length=43, make=Viking, year=1997
 */
function parseBoatDescription(desc) {
    const result = { make: '', model: '', year: '', length: '' };
    if (!desc) return result;

    // Strip HTML tags and clean up
    let clean = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // Strip natural language prefixes: "updates on the availability of the ..."
    const nlPrefix = clean.match(/(?:availability|interested|inquiry|looking)\s+(?:of|in|for|at)\s+(?:the\s+)?/i);
    if (nlPrefix) {
        clean = clean.substring(nlPrefix.index + nlPrefix[0].length).trim();
    }

    // ── Pattern 1: Year-first "2020 Azimut 66" ──
    const yearFirst = clean.match(/^(\d{4})\s+(.+)/);
    if (yearFirst && parseInt(yearFirst[1]) >= 1960 && parseInt(yearFirst[1]) <= 2030) {
        result.year = yearFirst[1];
        const rest = yearFirst[2].trim();
        const makeMatch = matchKnownMake(rest);
        if (makeMatch) {
            result.make = makeMatch.make;
            result.model = makeMatch.remainder;
        } else {
            const parts = rest.split(/\s+/);
            result.make = parts[0];
            result.model = parts.slice(1).join(' ');
        }
        return result;
    }

    // ── Pattern 2: Length-first "94 Ferretti 2003" or "38' Viking 1990" or "72ft Azimut" ──
    const lenFirst = clean.match(/^(\d{2,3})\s*[''′ft feet]*\s+(.+)/i);
    if (lenFirst) {
        result.length = lenFirst[1].replace(/[^\d]/g, '');
        let rest = lenFirst[2].trim();
        // Check if rest ends with a year
        const trailingYear = rest.match(/\s+(\d{4})\s*$/);
        if (trailingYear && parseInt(trailingYear[1]) >= 1960 && parseInt(trailingYear[1]) <= 2030) {
            result.year = trailingYear[1];
            rest = rest.substring(0, trailingYear.index).trim();
        }
        const makeMatch = matchKnownMake(rest);
        if (makeMatch) {
            result.make = makeMatch.make;
            result.model = makeMatch.remainder;
        } else {
            const parts = rest.split(/\s+/);
            result.make = parts[0];
            result.model = parts.slice(1).join(' ');
        }
        return result;
    }

    // ── Pattern 3: "Make Year" or "Make Model Year" (e.g. "Marlow 2020", "President 2008") ──
    const makeMatch = matchKnownMake(clean);
    if (makeMatch) {
        result.make = makeMatch.make;
        let rest = makeMatch.remainder.trim();
        // Check for trailing year
        const trailingYear = rest.match(/\s*(\d{4})\s*$/);
        if (trailingYear && parseInt(trailingYear[1]) >= 1960 && parseInt(trailingYear[1]) <= 2030) {
            result.year = trailingYear[1];
            rest = rest.substring(0, trailingYear.index).trim();
        }
        // Check for leading/embedded length
        const embeddedLen = rest.match(/^(\d{2,3})[''′]?\s*/);
        if (embeddedLen) {
            result.length = embeddedLen[1];
            rest = rest.substring(embeddedLen[0].length).trim();
        }
        result.model = rest;
        return result;
    }

    // ── Pattern 4: Simple "word(s) year" fallback ──
    const simpleYear = clean.match(/^(.+?)\s+(\d{4})\s*$/);
    if (simpleYear && parseInt(simpleYear[2]) >= 1960 && parseInt(simpleYear[2]) <= 2030) {
        result.year = simpleYear[2];
        const parts = simpleYear[1].trim().split(/\s+/);
        result.make = parts[0];
        result.model = parts.slice(1).join(' ');
        return result;
    }

    // ── Fallback: just put it all in model ──
    result.model = clean;
    return result;
}

/** Try to match a known make at the start of a string. Returns { make, remainder } or null. */
function matchKnownMake(str) {
    if (!str) return null;
    const lower = str.toLowerCase();
    // Sort by length descending so "Ocean Alexander" matches before "Ocean", "Van der Valk" before "Van"
    const sorted = [...KNOWN_MAKES_SET].sort((a, b) => b.length - a.length);
    for (const make of sorted) {
        if (lower.startsWith(make.toLowerCase())) {
            const rest = str.substring(make.length).trim();
            return { make, remainder: rest };
        }
    }
    return null;
}

function extractField(body, patterns) {
    for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match && match[1]) return match[1].trim();
    }
    return '';
}

function isInternalEmail(email) {
    if (!email) return false;
    const lower = email.toLowerCase();
    return lower.includes('@denisonyachting.com') || lower.includes('@denisonyachtsales.com') || lower.includes('@denison.com');
}

function parseYachtWorldEmail(body) {
    const lead = { name: '', email: '', phone: '', boatMake: '', boatModel: '', boatYear: '',
        boatLength: '', boatPrice: '', boatLocation: '', listingUrl: '', notes: '', source: 'YachtWorld' };
    lead.name = extractField(body, [/INDIVIDUAL PROSPECT:[\s\S]*?Name:\s*(.+?)(?:\r?\n|$)/i, /Name:\s+(.+?)(?:\r?\n|$)/i]);
    let email = extractField(body, [/Email:\s+([^\s]+@[^\s]+)/i]);
    if (isInternalEmail(email)) email = '';
    lead.email = email;
    lead.phone = extractField(body, [/Telephone:\s+(.+?)(?:\r?\n|$)/i, /Phone:\s+(.+?)(?:\r?\n|$)/i]);

    // Try old BoatWizard format first, then Denison-forwarded MLS format
    lead.boatMake = extractField(body, [/SALES BOAT:[\s\S]*?Make:\s+(.+?)(?:\r?\n|$)/i, /Make:\s+(.+?)(?:\r?\n|$)/i]);
    lead.boatModel = extractField(body, [/Model description:\s+(.+?)(?:\r?\n|$)/i, /Model:\s+(.+?)(?:\r?\n|$)/i]);
    lead.boatYear = extractField(body, [/Year:\s+(\d{4})/i]);
    lead.boatLength = extractField(body, [/Length:\s+(\d+(?:ft|')?)/i]);
    lead.listingUrl = extractField(body, [/URI:\s+(https?:\/\/[^\s]+)/i]);

    // Denison-forwarded MLS fallback: "Vessel Info: 66 feet Azimut 66"
    if (!lead.boatMake) {
        const vesselInfo = extractField(body, [/Vessel Info:\s*(.+?)(?:\r?\n|$)/i]);
        if (vesselInfo) {
            const parsed = parseBoatDescription(vesselInfo);
            if (parsed.make) lead.boatMake = parsed.make;
            if (parsed.model) lead.boatModel = parsed.model;
            if (parsed.year && !lead.boatYear) lead.boatYear = parsed.year;
            if (parsed.length && !lead.boatLength) lead.boatLength = parsed.length;
        }
    }
    if (!lead.boatPrice) {
        const priceRaw = extractField(body, [/Asking Price:\s*([\w\s\d,.$]+?)(?:\r?\n|$)/i]);
        if (priceRaw) lead.boatPrice = priceRaw.replace(/[^\d]/g, '');
    }
    if (!lead.listingUrl) {
        lead.listingUrl = extractField(body, [/Page Link:\s*(https?:\/\/[^\s<]+)/i]);
    }
    if (!lead.boatLocation) {
        lead.boatLocation = extractField(body, [/Boat Location:\s*(.+?)(?:\r?\n|$)/i]);
    }
    // Extract year from Page Link URL if not found: /2020-azimut-66-9652968/
    if (!lead.boatYear && lead.listingUrl) {
        const urlYearMatch = lead.listingUrl.match(/\/(\d{4})-/);
        if (urlYearMatch) lead.boatYear = urlYearMatch[1];
    }

    lead.notes = extractField(body, [/CUSTOMER COMMENTS:\s*([\s\S]*?)(?:\* \*|$)/i, /Comments:\s*([\s\S]*?)(?:\r?\n\r?\n|$)/i]);
    if (lead.notes) lead.notes = lead.notes.replace(/\s+/g, ' ').trim();
    return lead;
}

function parseDenisonEmail(body) {
    const lead = { name: '', email: '', phone: '', boatMake: '', boatModel: '', boatYear: '',
        boatLength: '', boatPrice: '', boatLocation: '', listingUrl: '', notes: '', source: 'Denison' };
    lead.name = extractField(body, [/CLIENT INFORMATION[\s\S]*?Name:\s*(.+?)(?:\r?\n|$)/i, /Name:\s*(.+?)(?:\r?\n|$)/i]);
    let email = extractField(body, [/CLIENT INFORMATION[\s\S]*?Email:\s*([^\s]+@[^\s]+)/i, /Email:\s*([^\s]+@[^\s]+)/i]);
    if (isInternalEmail(email)) email = '';
    lead.email = email;
    lead.phone = extractField(body, [/CLIENT INFORMATION[\s\S]*?Phone:\s*(.+?)(?:\r?\n|$)/i, /Phone:\s*(.+?)(?:\r?\n|$)/i]);
    lead.boatLocation = extractField(body, [/Client Location:\s*(.+?)(?:\r?\n|$)/i]);
    const boatDesc = extractField(body, [/Boat Description:\s*(.+?)(?:\r?\n|$)/i, /Vessel Info:\s*(.+?)(?:\r?\n|$)/i]);
    if (boatDesc) {
        const parsed = parseBoatDescription(boatDesc);
        if (parsed.make) lead.boatMake = parsed.make;
        if (parsed.model) lead.boatModel = parsed.model;
        if (parsed.year) lead.boatYear = parsed.year;
        if (parsed.length) lead.boatLength = parsed.length;
    }
    // Website Chat fallback — extract boat from Chat Summary line
    if (!lead.boatMake && !lead.boatModel) {
        const chatSummary = extractField(body, [/Chat Summary:\s*(.+?)(?:\r?\n|$)/i]);
        if (chatSummary) {
            const parsed = parseBoatDescription(chatSummary);
            if (parsed.make) {
                lead.boatMake = parsed.make;
                if (parsed.model) lead.boatModel = parsed.model;
                if (parsed.year) lead.boatYear = parsed.year;
                if (parsed.length) lead.boatLength = parsed.length;
            }
            if (!lead.notes) lead.notes = chatSummary;
        }
    }
    lead.boatPrice = extractField(body, [/Boat Price:\s*\$?([\d,]+)/i, /Asking Price:\s*\$?([\d,]+)/i]);
    lead.boatLocation = lead.boatLocation || extractField(body, [/Boat Location:\s*(.+?)(?:\r?\n|$)/i]);
    // Also capture Assigned Broker info in notes
    const assignedBroker = extractField(body, [/Assigned Broker:\s*(.+?)(?:\r?\n|$)/i]);
    if (assignedBroker && !lead.notes.includes(assignedBroker)) {
        lead.notes = (lead.notes ? lead.notes + '; ' : '') + 'Assigned: ' + assignedBroker;
    }
    let url = extractField(body, [/Website Link To Boat:\s*(https?:\/\/[^\s]+)/i, /Page Link:\s*(https?:\/\/[^\s]+)/i]);
    if (url && url.includes('denisonyachting.com/e3t/')) {
        const directUrl = body.match(/https:\/\/www\.denisonyachting\.com\/yacht\/[^\s)"<>]+/i);
        if (directUrl) url = directUrl[0];
    }
    lead.listingUrl = url;
    return lead;
}

function parseBoatShowEmail(body) {
    const lead = { name: '', email: '', phone: '', boatMake: '', boatModel: '', boatYear: '',
        boatLength: '', boatPrice: '', boatLocation: '', listingUrl: '', notes: '', source: 'BoatShow' };
    lead.name = extractField(body, [/Name:\s*(.+?)(?:\r?\n|$)/i]);
    let email = extractField(body, [/Email:\s*([^\s]+@[^\s]+)/i]);
    if (isInternalEmail(email)) email = '';
    lead.email = email;
    lead.phone = extractField(body, [/Phone:\s*(.+?)(?:\r?\n|$)/i]);
    const boatOfInterest = extractField(body, [/Boat of Interest:\s*(.+?)(?:\r?\n|$)/i]);
    if (boatOfInterest) { const parts = boatOfInterest.split(/\s+/); lead.boatMake = parts[0] || ''; lead.boatModel = parts.slice(1).join(' '); }
    const showAttending = extractField(body, [/Show Attending:\s*(.+?)(?:\r?\n|$)/i]);
    const datesAttending = extractField(body, [/Dates Attending:\s*(.+?)(?:\r?\n|$)/i]);
    let notes = [];
    if (showAttending) notes.push('Show: ' + showAttending);
    if (datesAttending) notes.push('Dates: ' + datesAttending);
    if (boatOfInterest) notes.push('Interested in: ' + boatOfInterest);
    lead.notes = notes.join('; ');
    lead.listingUrl = extractField(body, [/Page Link:\s*(https?:\/\/[^\s]+)/i]);
    return lead;
}

function parseRightBoatEmail(body) {
    const lead = { name: '', email: '', phone: '', boatMake: '', boatModel: '', boatYear: '',
        boatLength: '', boatPrice: '', boatLocation: '', listingUrl: '', notes: '', source: 'RightBoat' };

    // RightBoat format: "Name:  Howard Laderman" (may have extra spaces)
    // "Contact Owner: Luis Perez" is the Denison person, NOT the lead
    lead.name = extractField(body, [/^Name:\s+(.+?)$/im]);
    let email = extractField(body, [/^Email:\s+([^\s<>]+@[^\s<>]+)/im]);
    if (isInternalEmail(email)) email = '';
    lead.email = email;
    lead.phone = extractField(body, [/^Phone:\s+(.+?)$/im]);

    // Vessel Info: "2007 Cheoy Lee  Bravo"
    // Vessel Info: "2007 Cheoy Lee  Bravo"
    const vesselInfo = extractField(body, [/Vessel Info:\s*(.+?)(?:\r?\n|$)/i]);
    if (vesselInfo) {
        const parsed = parseBoatDescription(vesselInfo);
        if (parsed.make) lead.boatMake = parsed.make;
        if (parsed.model) lead.boatModel = parsed.model;
        if (parsed.year) lead.boatYear = parsed.year;
        if (parsed.length) lead.boatLength = parsed.length;
    }

    lead.boatLocation = extractField(body, [/Boat Location:\s*(.+?)(?:\r?\n|$)/i]);
    lead.listingUrl = extractField(body, [/Page Link:\s*(https?:\/\/[^\s]+)/i]);
    lead.notes = extractField(body, [/Comments:\s*([\s\S]*?)(?:\r?\n\r?\n|Name:|$)/i]);
    if (lead.notes) lead.notes = lead.notes.replace(/\s+/g, ' ').trim();
    return lead;
}

function parseJamesEditionEmail(body) {
    const lead = { name: '', email: '', phone: '', boatMake: '', boatModel: '', boatYear: '',
        boatLength: '', boatPrice: '', boatLocation: '', listingUrl: '', notes: '', source: 'JamesEdition' };

    // JamesEdition format: "Lead name\n\nvalentino nicola"
    lead.name = extractField(body, [
        /Lead name\s*\r?\n\s*\r?\n\s*(.+?)(?:\r?\n|$)/i,
        /Lead name:\s*(.+?)(?:\r?\n|$)/i
    ]);

    let email = extractField(body, [
        /Lead email\s*\r?\n\s*\r?\n\s*([^\s<>]+@[^\s<>]+)/i,
        /Lead email:\s*([^\s<>]+@[^\s<>]+)/i,
        /contact details are\s+([^\s<>.]+@[^\s<>.]+\.[^\s<>]+)/i
    ]);
    if (isInternalEmail(email)) email = '';
    lead.email = email;

    lead.phone = extractField(body, [
        /Lead phone number\s*\r?\n\s*\r?\n\s*(\+?[\d\s\-().]{5,}?)(?:\s*<|\s*\r?\n|$)/i,
        /Lead phone:\s*(\+?[\d\s\-().]{5,}?)(?:\s*<|\s*\r?\n|$)/i
    ]);

    // Listing: "Benetti Vision 145"
    const listing = extractField(body, [
        /Listing\s*\r?\n\s*(.+?)(?:\r?\n|<)/i,
        /listing named\s+(.+?)\s+at\s/i
    ]);
    if (listing) {
        // Try to parse "Benetti Vision 145" → make=Benetti, model=Vision 145
        const parts = listing.trim().split(/\s+/);
        if (parts.length >= 2) {
            lead.boatMake = parts[0];
            lead.boatModel = parts.slice(1).join(' ');
        } else {
            lead.boatModel = listing;
        }
    }

    // Country
    const country = extractField(body, [/Country\s*\r?\n\s*\r?\n\s*(.+?)(?:\r?\n|$)/i]);

    // Message/Notes
    lead.notes = extractField(body, [
        /Message\s*\r?\n\s*(.+?)(?:\r?\n\r?\n|All leads|$)/i,
        /^Message:\s*(.+?)$/im
    ]);
    if (lead.notes) lead.notes = lead.notes.replace(/\s+/g, ' ').trim();
    if (country && lead.notes) lead.notes = `Country: ${country}. ${lead.notes}`;
    else if (country) lead.notes = `Country: ${country}`;

    return lead;
}

// ─── Subject Line Boat Extraction ───────────────────────────────────

const KNOWN_MAKES_SET = [
    "Absolute", "Astondoa", "Azimut", "Benetti", "Bertram", "Bluewater",
    "Broward", "Burger", "Cabo", "Carver", "Cheoy Lee", "Chris-Craft",
    "Cigarette", "Cruisers", "Custom", "Dyna", "Explorer", "Fairline",
    "Ferretti", "Fleming", "Galeon", "Hargrave", "Hatteras", "Hinckley",
    "Horizon", "Johnson", "Kadey-Krogen", "Lazzara", "Luhrs", "Mangusta",
    "Maritimo", "Marquis", "Meridian", "Monte Carlo", "Nordhavn",
    "Ocean Alexander", "Outer Reef", "Pacific Mariner", "Palmer Johnson",
    "Pardo", "Pershing", "Princess", "Regency", "Richmond Yachts",
    "Riva", "Riviera", "Rybovich", "Sabre", "San Lorenzo", "Sanlorenzo",
    "Sea Force IX", "Sea Ray", "Silverton", "Sunreef", "Sunseeker",
    "Tiara", "Trinity", "Van der Valk", "Viking", "Westport",
    "Yellowfin", "Zeelander",
];

function extractBoatFromSubject(subject) {
    const result = { boatMake: '', boatModel: '', boatYear: '', boatLength: '' };
    if (!subject) return result;

    // Strip forwarding prefixes
    let clean = subject.replace(/^(?:Fwd?|Re):\s*/gi, '').trim();

    // Pattern 1: "New lead from BoatTrader PORTAL AD: 2004 Sunseeker 82 Yacht"
    const portalMatch = clean.match(/PORTAL AD:\s*(\d{4})\s+(.+)/i);
    if (portalMatch) {
        result.boatYear = portalMatch[1];
        const rest = portalMatch[2].trim();
        // Try known makes
        for (const make of KNOWN_MAKES_SET) {
            if (rest.toLowerCase().startsWith(make.toLowerCase())) {
                result.boatMake = make;
                result.boatModel = rest.substring(make.length).trim();
                return result;
            }
        }
        // Fallback: first word = make, rest = model
        const parts = rest.split(/\s+/);
        result.boatMake = parts[0];
        result.boatModel = parts.slice(1).join(' ');
        return result;
    }

    // Pattern 2: '50" Hatteras' or "72' Viking" (length + make)
    const lenMakeMatch = clean.match(/(\d{2,3})['""′']\s*(.+)/);
    if (lenMakeMatch) {
        result.boatLength = lenMakeMatch[1];
        const rest = lenMakeMatch[2].trim();
        for (const make of KNOWN_MAKES_SET) {
            if (rest.toLowerCase().startsWith(make.toLowerCase())) {
                result.boatMake = make;
                result.boatModel = rest.substring(make.length).trim();
                return result;
            }
        }
        result.boatMake = rest.split(/\s+/)[0];
        result.boatModel = rest.split(/\s+/).slice(1).join(' ');
        return result;
    }

    // Pattern 3: "2020 Azimut 66" (year make model)
    const yearMakeMatch = clean.match(/(\d{4})\s+(.+)/);
    if (yearMakeMatch) {
        result.boatYear = yearMakeMatch[1];
        const rest = yearMakeMatch[2].trim();
        for (const make of KNOWN_MAKES_SET) {
            if (rest.toLowerCase().startsWith(make.toLowerCase())) {
                result.boatMake = make;
                result.boatModel = rest.substring(make.length).trim();
                return result;
            }
        }
        const parts = rest.split(/\s+/);
        result.boatMake = parts[0];
        result.boatModel = parts.slice(1).join(' ');
        return result;
    }

    // Pattern 4: Just a make name: "Hatteras", "Viking 72"
    for (const make of KNOWN_MAKES_SET) {
        if (clean.toLowerCase().startsWith(make.toLowerCase())) {
            result.boatMake = make;
            result.boatModel = clean.substring(make.length).trim();
            // Check if model starts with a number (that's the length)
            const numMatch = result.boatModel.match(/^(\d{2,3})\b/);
            if (numMatch && !result.boatLength) {
                result.boatLength = numMatch[1];
            }
            return result;
        }
    }

    return result;
}

function parseEmail(headers, body, emailType) {
    let lead;
    switch (emailType) {
        case 'yachtworld':
            lead = parseYachtWorldEmail(body);
            if (!lead.email && headers['reply-to']) {
                const replyTo = headers['reply-to'];
                const emailMatch = replyTo.match(/<([^>]+@[^>]+)>|([^\s<>]+@[^\s<>]+)/);
                if (emailMatch) {
                    const extracted = emailMatch[1] || emailMatch[2];
                    if (!isInternalEmail(extracted)) lead.email = extracted;
                }
            }
            break;
        case 'boatshow': lead = parseBoatShowEmail(body); break;
        case 'rightboat': lead = parseRightBoatEmail(body); break;
        case 'jamesedition': lead = parseJamesEditionEmail(body); break;
        case 'denison': default: lead = parseDenisonEmail(body); break;
    }

    // ── FALLBACK: Extract boat info from Subject if still missing ──
    const hasBoat = lead.boatMake || lead.boatModel || lead.boatYear;
    if (!hasBoat) {
        const subject = headers.subject || '';
        const boatFromSubject = extractBoatFromSubject(subject);
        if (boatFromSubject.boatMake && !lead.boatMake) lead.boatMake = boatFromSubject.boatMake;
        if (boatFromSubject.boatModel && !lead.boatModel) lead.boatModel = boatFromSubject.boatModel;
        if (boatFromSubject.boatYear && !lead.boatYear) lead.boatYear = boatFromSubject.boatYear;
        if (boatFromSubject.boatLength && !lead.boatLength) lead.boatLength = boatFromSubject.boatLength;
    }

    // ── FALLBACK: Extract email from forwarded body if still missing ──
    if (!lead.email) {
        const fwdEmail = body.match(/(?:From|Reply-To):[^<]*?<([^>]+@[^>]+)>/i)
            || body.match(/(?:From|Reply-To):\s*([^\s<>]+@[^\s<>]+)/i);
        if (fwdEmail) {
            const extracted = (fwdEmail[1] || fwdEmail[0]).trim();
            if (!isInternalEmail(extracted)) lead.email = extracted;
        }
    }

    // ── FALLBACK: Extract name from forwarded body if still missing ──
    if (!lead.name) {
        const fwdName = body.match(/From:\s*"?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)"?\s*[<\n]/i);
        if (fwdName) lead.name = fwdName[1].trim();
    }

    return lead;
}

// ─── SQLite Storage (replaces CSV) ──────────────────────────────────

/**
 * Find or create a lead, then attach the boat.
 * Dedup: email → phone → name (3-tier)
 * If lead exists, just add the new boat. If not, create lead + boat.
 */
function saveLead(lead) {
    getDb(); // ensure DB + prepared statements are initialized
    const { firstName, lastName } = parseName(lead.name);
    const phone = cleanPhone(lead.phone);
    const email = (lead.email || '').trim().toLowerCase();

    // 3-tier dedup: email → phone → name
    let existing = null;
    if (email) existing = findLeadByEmail.get(email);
    if (!existing && phone) existing = findLeadByPhone.get(phone);
    if (!existing && firstName) existing = findLeadByName.get(firstName, lastName);

    let leadId;
    let isNew = false;

    if (existing) {
        leadId = existing.id;
        updateLeadTimestamp.run(leadId);
    } else {
        const result = insertLead.run({
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: phone,
            tags: lead.source || '',
            notes: lead.notes || '',
            source: lead.source || '',
            status: 'new',
        });
        leadId = result.lastInsertRowid;
        isNew = true;
    }

    // Add boat (skip if exact same listing_url already on this lead)
    const hasBoatData = lead.boatMake || lead.boatModel || lead.boatYear || lead.listingUrl;
    let boatAdded = false;

    if (hasBoatData) {
        const dupBoat = lead.listingUrl ? checkDuplicateBoat.get(leadId, lead.listingUrl) : null;
        if (!dupBoat) {
            insertBoat.run({
                lead_id: leadId,
                make: lead.boatMake || '',
                model: lead.boatModel || '',
                year: lead.boatYear || '',
                length: (lead.boatLength || '').replace(/ft/i, ''),
                price: lead.boatPrice || '',
                location: lead.boatLocation || lead.clientLocation || '',
                listing_url: lead.listingUrl || '',
                source_email: lead.source || '',
            });
            boatAdded = true;
        } else if (lead.boatMake || lead.boatModel || lead.boatYear) {
            // Update existing boat record if it has empty fields but we now have data
            db.prepare(`UPDATE boats SET
                make = CASE WHEN make = '' AND ? != '' THEN ? ELSE make END,
                model = CASE WHEN model = '' AND ? != '' THEN ? ELSE model END,
                year = CASE WHEN year = '' AND ? != '' THEN ? ELSE year END,
                length = CASE WHEN length = '' AND ? != '' THEN ? ELSE length END,
                price = CASE WHEN price = '' AND ? != '' THEN ? ELSE price END
                WHERE id = ?`).run(
                lead.boatMake, lead.boatMake,
                lead.boatModel, lead.boatModel,
                lead.boatYear, lead.boatYear,
                (lead.boatLength || '').replace(/ft/i, ''), (lead.boatLength || '').replace(/ft/i, ''),
                lead.boatPrice || '', lead.boatPrice || '',
                dupBoat.id
            );
            boatAdded = true;
        }
    }

    return { leadId, isNew, boatAdded };
}

// ─── File Processing ────────────────────────────────────────────────

function moveToProcessed(srcPath, filename) {
    if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    fs.renameSync(srcPath, path.join(PROCESSED_DIR, filename));
}

function main() {
    console.log('='.repeat(60));
    console.log('YotCRM Email Parser v2 (SQLite)');
    console.log(new Date().toISOString());
    console.log('='.repeat(60));

    if (!fs.existsSync(RAW_EMAILS_DIR)) {
        fs.mkdirSync(RAW_EMAILS_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROCESSED_DIR)) {
        fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    }

    const files = fs.readdirSync(RAW_EMAILS_DIR).filter(f => f.endsWith('.eml'));

    if (files.length === 0) {
        console.log('No new emails to process.');
        db.close();
        return;
    }

    console.log(`Found ${files.length} .eml files to process`);
    console.log('-'.repeat(60));

    let newLeads = 0, updatedLeads = 0, boatsAdded = 0, skippedNoEmail = 0, errors = 0;

    for (const filename of files) {
        const filepath = path.join(RAW_EMAILS_DIR, filename);
        console.log(`\nProcessing: ${filename}`);

        try {
            const content = fs.readFileSync(filepath, 'utf8');
            const { headers, body } = parseEml(content);
            const emailType = identifyEmailType(headers, body);
            console.log(`  Type: ${emailType}`);

            const lead = parseEmail(headers, body, emailType);
            console.log(`  Name: ${lead.name}`);
            console.log(`  Email: ${lead.email}`);
            console.log(`  Phone: ${lead.phone}`);
            console.log(`  Boat: ${lead.boatYear} ${lead.boatMake} ${lead.boatModel}`);
            console.log(`  Length: ${lead.boatLength || ''}`);
            console.log(`  Price: ${lead.boatPrice || ''}`);
            console.log(`  URL: ${lead.listingUrl || ''}`);

            if (!lead.email) {
                console.log('  ⚠️  SKIPPED: No valid email found');
                skippedNoEmail++;
                moveToProcessed(filepath, filename);
                continue;
            }

            const result = saveLead(lead);

            if (result.isNew) {
                console.log(`  ✅ NEW LEAD (id: ${result.leadId})`);
                newLeads++;
            } else {
                console.log(`  🔄 EXISTING LEAD (id: ${result.leadId})`);
                updatedLeads++;
            }
            if (result.boatAdded) {
                console.log(`  🚤 BOAT ADDED`);
                boatsAdded++;
            }

            moveToProcessed(filepath, filename);

        } catch (err) {
            console.error(`  ❌ ERROR: ${err.message}`);
            errors++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`New leads:       ${newLeads}`);
    console.log(`Updated leads:   ${updatedLeads}`);
    console.log(`Boats added:     ${boatsAdded}`);
    console.log(`Skipped (no email): ${skippedNoEmail}`);
    console.log(`Errors:          ${errors}`);
    console.log('='.repeat(60));

    if (db) db.close();
}

// Only run main() when called directly (not when required as a module)
if (require.main === module) {
  main();
}

/**
 * Process a single .eml string inline (used by API route).
 * Returns { ok, lead, result } or throws on error.
 */
function processOneEmail(emlContent) {
  getDb();
  const { headers, body } = parseEml(emlContent);
  const emailType = identifyEmailType(headers, body);
  const lead = parseEmail(headers, body, emailType);

  if (!lead.email) {
    return { ok: false, error: 'No valid email found in this lead', emailType, lead };
  }

  const result = saveLead(lead);
  return {
    ok: true,
    emailType,
    lead: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      boat: `${lead.boatYear} ${lead.boatMake} ${lead.boatModel}`.trim(),
      listingUrl: lead.listingUrl,
    },
    result: {
      leadId: Number(result.leadId),
      isNew: result.isNew,
      boatAdded: result.boatAdded,
    },
  };
}

// Export for use by API routes
module.exports = {
  parseEml,
  identifyEmailType,
  parseEmail,
  saveLead,
  processOneEmail,
  parseName,
  cleanPhone,
  isInternalEmail,
  KNOWN_MAKES_SET,
};
