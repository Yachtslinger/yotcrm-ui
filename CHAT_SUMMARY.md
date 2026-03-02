# YotCRM — New Chat Summary (Feb 10, 2026)

## WHAT IS YOTCRM
Yacht lead CRM for Will Noftsinger (Denison Yachting broker, Miami FL). Next.js 15 app with SQLite, deployed on Railway. Features: lead management, email parsing, PDF generation from listings, email campaign builder (Denison branded), PWA.

## LIVE URL
https://yotcrm-production.up.railway.app

## CODEBASE LOCATION
**Local deploy directory:** `/Users/willnoftsinger/yotcrm-deploy/`
**GitHub:** https://github.com/Yachtslinger/yotcrm (private)
**Railway project:** yotcrm (trial plan, $5 credits)

## TECH STACK
- Next.js 15.5.9 (App Router)
- SQLite via better-sqlite3
- Puppeteer + Chromium (headless, for scraping & PDF gen)
- Cheerio (for campaign scraping)
- Tailwind CSS v4
- Docker container on Railway (node:20-slim + Chromium)
- Radix UI components

## ARCHITECTURE
```
Railway Container (/app/):
├── Next.js UI (port from $PORT env, exposed via Railway proxy)
├── SQLite Database (/data/yotcrm.db if volume mounted, else /app/data/yotcrm.db)
├── PDF Generator (Puppeteer + Chromium)
│   ├── scripts/scrapeYachtWorld.js (Puppeteer-based, anti-bot evasion)
│   ├── scripts/scrapeYatco.js (Puppeteer-based, NEW - just added)
│   └── scripts/generateListingPDF.js (Puppeteer PDF output)
├── Email Parser (scripts/parseEmails.js) — NOT yet triggered automatically
├── Campaign Builder (src/app/campaigns/page.tsx) — Cheerio-based scraping
├── Assets (/app/assets/) — broker photos, logos
├── start.sh — env var setup, volume detection, DB seeding
└── Volume mount: /data (MAY OR MAY NOT BE CONFIGURED YET)
```

## DATABASE SCHEMA
```sql
leads (id, first_name, last_name, email, phone, tags, notes, source, status, created_at, updated_at)
boats (id, lead_id FK, make, model, year, length, price, location, listing_url, source_email, added_at)
todos (id, title, description, status, priority, due_date, lead_id FK, created_at, updated_at)
```
Current data: 14 leads, 3 todos, associated boats.

## PAGES / ROUTES
| Path | Description |
|------|-------------|
| /clients | Lead list with search, status tags, boat info |
| /todos | Todo list with priorities |
| /vessels | PDF generator — paste YachtWorld/YATCO URL, select broker (Will/Paolo/Both), generates branded PDF |
| /campaigns | Email campaign builder — Denison branded HTML emails, Single Listing or Multi-Boat Showcase modes |
| /settings | App settings |

## API ROUTES
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/clients | GET/POST | CRUD leads |
| /api/clients/[id] | GET/PUT/DELETE | Single lead |
| /api/todos | GET/POST | CRUD todos |
| /api/pdf | POST | Scrape listing URL + generate PDF (auto-detects YachtWorld vs YATCO) |
| /api/pdf | GET | List all generated PDFs |
| /api/pdf/download | GET | Download a PDF file |
| /api/scrape | POST | Scrape listing URL for campaign data (Cheerio-based, for campaign builder) |
| /api/emails | POST | Accept raw .eml content, save to inbox, run parser |
| /api/config | GET/POST | App configuration |
| /api/share/paolo | POST | Share listing with Paolo |
| /api/health | GET | Health check |

## KEY FILES
```
/Users/willnoftsinger/yotcrm-deploy/
├── Dockerfile                    # node:20-slim + Chromium + build deps
├── start.sh                      # Volume detection, env vars, DB seeding
├── railway.json                  # Railway config (restart on failure)
├── package.json                  # Dependencies
├── scripts/
│   ├── scrapeYachtWorld.js       # Puppeteer scraper (anti-bot: stealth UA, headers, webdriver hide)
│   ├── scrapeYatco.js            # Puppeteer scraper for YATCO (NEW)
│   ├── generateListingPDF.js     # Puppeteer PDF generator (619 lines, broker signatures)
│   ├── parseEmails.js            # Email parser (599 lines, handles YW, Denison, RightBoat, JamesEdition, YATCO, boat shows)
│   └── yachtToPDF.js             # Alternative PDF script
├── assets/                       # denison-logo.*, paolo-photo.png, will-photo.jpeg, slinger-logo.png, yachtslinger-name-logo.png
├── data/
│   ├── yotcrm.db                 # Seed database (14 leads, 3 todos)
│   └── listings/                 # Scraped listing data + PDFs
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Nav: Leads, To Do, PDFs, Campaigns, Settings + mobile bottom tab bar
│   │   ├── clients/page.tsx      # Leads page
│   │   ├── todos/page.tsx        # Todos page  
│   │   ├── vessels/page.tsx      # PDF generator page (268 lines)
│   │   ├── campaigns/page.tsx    # Campaign builder (697 lines, huge single file)
│   │   ├── settings/page.tsx     # Settings
│   │   └── api/                  # All API routes (see table above)
│   ├── lib/
│   │   ├── clients/storage.ts    # SQLite CRUD for leads + boats
│   │   ├── todos/storage.ts      # SQLite CRUD for todos
│   │   └── campaign/
│   │       ├── providers.ts      # Scrape provider router + email providers (Mock/Postmark/SendGrid)
│   │       ├── providers/denison.ts    # Denison scraper (469 lines, Cheerio)
│   │       ├── providers/yachtworld.ts # YachtWorld scraper (157 lines, Cheerio)
│   │       └── providers/generic.ts    # Generic scraper (178 lines, Cheerio)
│   │       ├── schema.ts, render.ts, storage.ts, serverUtils.ts
│   └── components/
│       ├── ui/                   # Radix-based UI components
│       └── campaign/             # Campaign components
└── public/
    ├── email/                    # Broker photos for campaigns (will, paolo, peter + denison header)
    ├── icons/                    # PWA icons
    ├── manifest.json             # PWA manifest
    └── sw.js                     # Service worker (network-first caching)
```

## GIT HISTORY (most recent first)
```
c4c3382 Fix crash (remove healthcheck), fix scraper 403, fix email parser for Denison Inquiries format, add /api/emails endpoint, better error handling
a4faf31 Fix Railway crash: robust start.sh, health endpoint, railway.json config
e69358f Add YATCO scraper, auto-detect site in PDF route, fix Chromium paths
472a936 Add Chromium/Puppeteer for PDF, fix all paths, add assets
3eeef82 Fix: use bundled data fallback, remove healthcheck, fix PORT
b6aa9be Upgrade Next.js to 15.5.9 (fix security vulnerabilities)
61200f5 Fix Dockerfile: use separate start script
5b16c2f YotCRM - Railway deploy
```

## ENVIRONMENT VARIABLES (set by start.sh)
```
PORT           = Railway-assigned (usually 8080)
DB_PATH        = /data/yotcrm.db (if volume) or /app/data/yotcrm.db
DATA_DIR       = /data/listings (if volume) or /app/data/listings
SCRIPTS_DIR    = /app/scripts
CONFIG_PATH    = /app/data/config.json
RAW_EMAILS_DIR = /data/inbox/raw_emails (if volume)
PROCESSED_DIR  = /data/inbox/processed_emails (if volume)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = true
PUPPETEER_EXECUTABLE_PATH = /usr/bin/chromium
```

## CRITICAL BUGS / ISSUES TO FIX

### 1. PDF Generation FAILING for YachtWorld
**Test URL:** https://www.yachtworld.com/yacht/2003-inace-pilothouse-yacht-9454947/
**Problem:** The /api/pdf route calls scrapeYachtWorld.js via Puppeteer which scrapes the listing page. YachtWorld has aggressive bot detection (Cloudflare). The scraper has stealth measures (UA spoofing, webdriver hiding, headers) but it's still getting blocked with 403. The scraper does have a retry-on-403 mechanism but it may not be sufficient.
**Root cause candidates:**
- Railway container IP may be flagged/datacenter IP
- Cloudflare JS challenge not being solved
- Chromium fingerprint detectable
- Need puppeteer-extra-plugin-stealth
**Note:** The CAMPAIGN import for YachtWorld uses a DIFFERENT code path — it uses the Cheerio-based scraper in `src/lib/campaign/providers/yachtworld.ts` which does a simple `fetch()`, NOT Puppeteer. This may ALSO be failing for the same bot-detection reason.

### 2. Campaign Builder FAILING to import from YachtWorld
**Related to #1.** When user pastes a YachtWorld URL in the campaign builder's Import field, it calls `/api/scrape` which routes to the Cheerio-based `scrapeYachtWorld()`. This uses a simple `fetch()` with a UA string — no browser fingerprinting evasion at all. YachtWorld likely returns 403 or a Cloudflare challenge page.
**Fix options:**
- Route campaign scraping through Puppeteer too (like PDF does)
- Add `puppeteer-extra` with stealth plugin
- Use a proxy service

### 3. Email Parser NOT WORKING
**Problem:** User ran a "forced rule" (Mac Mail rule?) on an email and it did nothing.
**Root cause:** The email system was designed for a VPS (DigitalOcean) that no longer exists. The Mac → Server email pipeline is broken:
- Originally: Mac Mail rules → save .eml to local folder → file watcher → parseEmails.js
- Then: fetchEmails.js (IMAP) was created for the DigitalOcean server but never configured with credentials
- Now on Railway: No IMAP fetcher running, no file watcher, no connection to Mac Mail
- The `/api/emails` POST endpoint exists but nothing is sending emails to it
- **The email forwarder script** (`tools/email-forwarder.sh`) may exist but isn't connected
**What needs to happen:**
- Option A: Set up IMAP fetcher as a cron job on Railway (needs Microsoft 365 app password)
- Option B: Set up Mac Mail rule to POST .eml content to the Railway `/api/emails` endpoint via curl/script
- Option C: Use a webhook service (e.g., Zapier/n8n) to forward emails to the API

### 4. YATCO Scraper UNTESTED
**Status:** scrapeYatco.js was just written and pushed but has never been tested against a real YATCO URL. May have selector issues since YATCO's DOM structure wasn't inspected in detail.

## PENDING USER ACTIONS
1. **Railway Volume:** Need to confirm if `/data` volume was mounted (critical for data persistence)
2. **Railway Region:** Need to confirm if region was changed to US East (for latency from Miami)
3. **Railway Plan:** Trial plan ($5 credits, 30 days) — needs upgrade to Hobby ($5/mo) before expiry
4. **Email credentials:** IMAP app password for wn@denisonyachting.com needed for email fetching

## CAMPAIGN BUILDER DETAILS
The campaign builder (`/campaigns`) is a 697-line single-file React component with two modes:
- **Single Listing:** Import from Denison/YW/YATCO URL, editable headline/price/location/specs/features/gallery, broker signature toggles (Will/Paolo/Peter)
- **Multi-Boat Showcase:** Multiple boat cards, brand header, broker signatures
- Generates pixel-matched Denison Vertical Response HTML
- "Copy HTML" button for paste into email platform
- Live preview iframe
- Import URL field calls `/api/scrape` (Cheerio-based, NOT Puppeteer)

## BROKER SIGNATURES
Three brokers configurable in campaigns:
- **Will Noftsinger** — WN@DenisonYachting.com, 850.461.3342
- **Paolo Ameglio** — PGA@DenisonYachting.com, 786.251.2588
- **Peter Quintal** — Peter@DenisonYachting.com, (954) 817-5662

## EMAIL PARSER CAPABILITIES
parseEmails.js handles these email types:
- YachtWorld/BoatWizard MLS leads
- Denison internal (Price Watch, Featured Listings, Website Chat, "New Interested Buyer")
- RightBoat leads
- JamesEdition leads  
- YATCO leads
- Boat show leads
3-tier dedup: email → phone → name. Multi-boat tracking per lead.

## PREVIOUS INFRASTRUCTURE HISTORY
1. Started on Mac (localhost, Cloudflare tunnel)
2. DigitalOcean Droplet #1 (134.199.202.188) — compromised in minutes, DDoS botnet
3. DigitalOcean Droplet #2 (165.245.133.126) — also compromised despite SSH keys
4. Migrated to Railway (current) — managed platform, no direct server access
