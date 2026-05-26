# YotCRM (YotBot) — Session Handoff

_Last updated: 2026-05-25_

---

## How to work in this repo

- **Canonical repo:** `/Users/willnoftsinger/yotcrm-ui` — this is the ONLY repo to touch.
- **Deploy flow:** Railway auto-deploys from the GitHub `main` branch. Workflow is:
  commit → push to `main` → Railway builds automatically (~3–4 min). No manual deploy step.
- **Dead folders — ignore, eventually delete:** `yotcrm-deploy`, `YotCRM_UI`, `YotCRM`.
  These are stale. (Note: `yotcrm-deploy/data/yotcrm.db` is referenced by `.env.local` —
  see "Known minor debt" below — but the *code* in that folder is dead.)
- **Backup:** A full backup from an earlier session is at
  `/Users/willnoftsinger/YotCRM_BACKUP_20260523-212340/`.
- **First step every session:** review past conversations for context before changing
  anything. Trace before editing.

---

## What was completed in the last session (all pushed, all build-verified)

Eleven commits, latest first:

- `791baa0` — refactor(types): unify the three VesselData definitions into one
- `7964a75` — fix(types): clear final 6 errors — type checker now at zero
- `bd3360e` — fix(types): resolve independent type errors (12 to 6)
- `02f2576` — fix(types): clear real broken-reference bugs (23 to 12)
- `953b636` — fix(types): clear campaigns + vessel-scraper type errors (90 to 23)
- `b157548` — fix(matches): create buyer_searches table in initMatchTables
- `c9db082` — fix(buyers): correct parameter count in filtered buyer-list query
- `0c21fbd` — fix(scraper): correct range units and engine label on Denison listings
- `729bb64` — feat(brochures): re-scrape button refreshes saved brochures from source

Headline outcomes:

- **Type checker: 90 errors → 0.** Three of those were real latent bugs, not type
  nits: (1) Denison generator hours were being written to a non-existent `notes`
  field and silently dropped; (2) `intel/providers/social.ts` had a loop over an
  undeclared `probes` variable; (3) `brochures/generate` passed brochure HTML as
  `saveBrochure`'s `isPocket` arg, so every generated brochure was silently flagged
  as a pocket listing.
- **`VesselData` unified.** There were three drifted definitions — `vessel-scraper/
  types.ts`, `brochure-storage.ts`, and a local copy in `brochures/page.tsx`. Now
  one canonical definition in `vessel-scraper/types.ts`; the other two import/alias
  it. ~210 lines of duplicated type removed.
- **Brochure scraper fixed.** Root cause of both the `10,357.02 mi` range and the
  bare `2` engines value was BoatsGroup's JSON-LD `additionalProperty` array (its
  `Range` is pre-converted to statute miles; `Number of Engines` is a count). The
  scraper now skips those two properties and reads the listing's own text.
- **Re-scrape button** added to saved brochures (`729bb64`) — pulls fresh specs
  from the stored source URL into the editor for review before saving.
- **Buyers-page filters** and **`/api/matches/list`** both fixed (parameter-count
  bug; missing `buyer_searches` table).

`brochure-scraper.ts` was deleted (dead, orphaned, superseded by `vessel-scraper/`).

---

## NEXT SESSION — LOCKED PLAN: Scraper consolidation + brokerage coverage

### The decision

YachtWorld is being **retired as a server-side scrape target.** It sits behind
Cloudflare and reliably 403s Railway's datacenter IPs — months of friction for an
aggregator whose listings mostly appear on brokerage sites we can scrape directly.
The strategy is: lean on brokerage-house sites, make the generic fallback solid.

This is a coverage-vs-reliability trade, chosen deliberately in favour of
reliability. The one cost: a listing that lives ONLY on a brokerage with no
dedicated provider depends on the generic fallback — hence step 1 below.

### Target site list (33 sites — ALL used regularly)

| # | Site | Domain | Status |
|---|------|--------|--------|
| 1 | Burgess | burgessyachts.com | ✅ dedicated provider, wired |
| 2 | Fraser | fraseryachts.com | ✅ dedicated provider, wired |
| 3 | Northrop & Johnson | northropandjohnson.com | ✅ dedicated provider, wired |
| 4 | Edmiston | edmiston.com | ✅ dedicated provider, wired |
| 5 | Camper & Nicholsons | camperandnicholsons.com | ✅ dedicated provider, wired |
| 6 | IYC | iyc.com | ✅ dedicated provider, wired |
| 7 | Denison Yachting | denisonyachtsales.com / denisonyachting.com | ✅ dedicated provider, wired |
| 8 | Moran Yacht & Ship | moranyachts.com | ⚠️ generic fallback — UNTESTED |
| 9 | Worth Avenue Yachts | worthavenueyachts.com | ✅ dedicated provider, wired |
| 10 | Y.CO | y.co | ⚠️ generic fallback — UNTESTED |
| 11 | Ocean Independence | ocyachts.com | ⚠️ generic fallback — UNTESTED |
| 12 | Merle Wood & Associates | merlewood.com | ⚠️ generic fallback — UNTESTED |
| 13 | The Italian Yacht Group | italianyachtgroup.com | ⚠️ generic fallback — UNTESTED |
| 14 | Allied Marine | alliedmarine.com | ✅ dedicated provider, wired |
| 15 | Galati Yacht Sales | galatiyachts.com | ⚠️ generic fallback — UNTESTED |
| 16 | HMY Yachts | hmy.com | ❌ Cloudflare-blocked (excluded in router, like YachtWorld) |
| 17 | SYS Yacht Sales | sysyachtsales.com | ⚠️ generic fallback — UNTESTED |
| 18 | Gilman Yachts | gilmanyachts.com | ⚠️ generic fallback — UNTESTED |
| 19 | Yachtzoo | yacht-zoo.com | ⚠️ generic fallback — UNTESTED |
| 20 | Bluewater Yachting | bluewateryachting.com | ⚠️ generic fallback — UNTESTED |
| 21 | TWW Yachts | twwyachts.com | ⚠️ generic fallback — UNTESTED |
| 22 | Royal Yacht International | royalyachtinternational.com | ⚠️ generic fallback — UNTESTED |
| 23 | Cecil Wright | cecilwright.com | ⚠️ generic fallback — UNTESTED |
| 24 | SuperYachts Monaco | superyachtsmonaco.com | ⚠️ generic fallback — UNTESTED |
| 25 | G-Yachts | gyachts.fr | ⚠️ generic fallback — UNTESTED |
| 26 | Yacht Broker House | yachtbrokerhouse.com | ⚠️ generic fallback — UNTESTED |
| 27 | David Seal Yachts | davidsealyachts.com | ⚠️ generic fallback — UNTESTED |
| 28 | FGI Yacht Group | fgiyachtgroup.com | ✅ dedicated provider, wired |
| 29 | YPI (Yachting Partners Intl) | ypiyachts.com | ⚠️ generic fallback — UNTESTED |
| 30 | Arcon Yachts | arconyachts.com | ⚠️ generic fallback — UNTESTED |
| 31 | Yachtbuyer | yachtbuyer.com | ✅ dedicated provider (specs only, no images — watermarked) |
| 32 | SuperYacht Times | superyachttimes.com | ✅ dedicated provider, wired |
| 33 | Boats International | boatinternational.com | ✅ dedicated provider, wired |

**Tally:** 12 dedicated providers wired · 1 Cloudflare-blocked (HMY) ·
**20 sites currently on the untested generic fallback.**

### The plan, in order

**Step 1 — Test the generic fallback against all 20 untested sites.**
For each, take one live listing URL, run `scrapeVessel()`, score the output
(name / price / LOA / images / specs / description). The generic scraper is
already capable — JSON-LD, OG meta, DOM specs, table parsing — so many of the 20
will likely just work with zero new code. Produce a pass/partial/fail table.

**Step 2 — Build dedicated providers ONLY for sites that fail or come back
thin.** Do not pre-emptively build 20 scrapers. Every site is used regularly
(confirmed by user), so order by severity of failure, not by guesswork.

**Step 3 — Decide HMY.** Cloudflare-blocked like YachtWorld. Likely treat as a
known gap, not a bug to chase. Confirm with user if HMY volume is high.

**Step 4 — Retire YachtWorld properly.**
- Delete `src/lib/vessel-scraper/providers/yachtworld.ts`.
- Remove the YachtWorld bookmarklet from the active task list (it existed only as
  a workaround for the server-side 403 — no longer needed).
- Update the router comment in `src/lib/vessel-scraper/index.ts`.
- Check `cleanHeadline()` in `utils.ts` still strips "YachtWorld" suffixes from
  titles (harmless to leave, since aggregated listings may still carry them).

**Step 5 — Audit the two scraper trees.** There are two parallel provider
directories: `src/lib/campaign/providers/` and `src/lib/vessel-scraper/providers/`.
`vessel-scraper` is the live path (brochure generator + campaign importer both call
`scrapeVessel()` from `vessel-scraper/index.ts`). Confirm `campaign/providers` is
fully dead, migrate anything unique, delete it. This is the natural follow-on to
the VesselData unification.

### Key files

- Router + generic fallback: `src/lib/vessel-scraper/index.ts`
- Providers: `src/lib/vessel-scraper/providers/*.ts`
- Shared helpers (`assignSpec`, `mineFromText`, `aiExtractSpecs`, `fetchPageText`,
  `cleanHeadline`): `src/lib/vessel-scraper/utils.ts`
- Canonical type: `src/lib/vessel-scraper/types.ts`
- Scrape pipeline is 3-layer: structured parse → `mineFromText` regex →
  `aiExtractSpecs` (AI fills gaps). The AI layer only runs on the deployed app
  (needs API key); local provider tests exercise layers 1–2 only.

---

## Known minor debt (not urgent)

- `.env.local` `DB_PATH` points at `yotcrm-deploy/data/yotcrm.db`. Investigated
  last session: the two local DBs diverged and are NOT clean superset/subset
  (deploy DB has 46 tables incl. brochures/buyer_searches/comms; repo DB has 24
  tables but more `listing_matches` rows). Repointing would risk data loss.
  Recommendation: leave it. Production uses Railway's own volume regardless.
- Stale folders `yotcrm-deploy`, `YotCRM_UI`, `YotCRM` can eventually be deleted.
- `pocket-brochure-sync.ts` has a `SyncableVessel` structural type that is now
  redundant (VesselData is unified) but harmless — optional cleanup.
