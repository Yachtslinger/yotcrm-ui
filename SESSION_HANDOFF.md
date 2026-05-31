# YotCRM (YotBot) — Session Handoff

_Last updated: 2026-05-31 (Round 3)_

---

## ▶ THIS SESSION (2026-05-31) — three rounds, two scraper PRs shipped

### Net outcome — generic fallback PASS rate went up 8×

| Round | n  | PASS | PARTIAL | FAIL | avg /12 |
|------:|---:|---:|---:|---:|---:|
| R1 baseline (`a9f1711`)            | 16 | **1** | 9 | 6 | 4.6 |
| R2 after JSON-LD fix (`e03b613`)   | 16 | **5** | 5 | 6 | 5.8 |
| R3 after DOM fix    (`a675d3a`)    | 16 | **8** | 3 | 5 | 7.0 |

Of the 11 generic sites that respond with 200 (i.e. not Cloudflare-blocked):
**8 PASS + 3 PARTIAL + 1 FAIL (YPI)**. Two PRs, ~150 lines of code, no new
providers, no new dependencies. The remaining FAILs are entirely Cloudflare
blocks + the YPI text-only case.

### Per-site movement, all 23 URLs

```
Denison                R1=12 → R2=12 → R3=12  PASS  (dedicated baseline)
Edmiston               R1=12 → R2=12 → R3=12  PASS
Fraser                 R1= 0 → R2= 0 → R3= 0  FAIL  (Axioma sold — stale URL)
Burgess                R1=12 → R2=12 → R3=12  PASS
IYC                    R1=10 → R2=10 → R3=10  PASS
SuperYachtTimes        R1= 0 → R2= 0 → R3= 0  FAIL  (provider 403 — Cloudflare upgraded)
BoatInternational      R1= 5 → R2= 6 → R3= 5  PARTIAL (provider regression)
Y.CO                   R1= 6 → R2=11 → R3=11  PASS   (+5)
ItalianYachtGroup      R1= 6 → R2=12 → R3=12  PASS   (+6) ⭐ perfect
Galati                 R1= 0 → R2= 0 → R3= 0  FAIL   Cloudflare block
SuperYachtsMonaco      R1= 5 → R2= 5 → R3= 5  PARTIAL (no JSON-LD; SPM uses an
                                                       unrecognised <li> container)
YPI                    R1= 4 → R2= 4 → R3= 4  FAIL   text-only specs, needs provider
CecilWright            R1= 5 → R2= 5 → R3= 7  PARTIAL (+2: LOA, year, builder)
RoyalYachtIntl         R1=11 → R2=12 → R3=12  PASS   (+1) ⭐ perfect
Gilman                 R1= 7 → R2= 7 → R3=11  PASS   (+4) — colon-strip alone fixed it
Yacht-Zoo              R1= 6 → R2= 6 → R3=11  PASS   (+5) — empty-leading-cell fix
Bluewater              R1= 4 → R2= 4 → R3= 6  PARTIAL (+2: LOA, beam, year, engines)
YATCO                  R1= 5 → R2=11 → R3=11  PASS   (+6) — JSON-LD fix
Boats.com              R1= 0 → R2= 0 → R3= 0  FAIL   Cloudflare block
Moran                  R1= 8 → R2=10 → R3=10  PASS   (+2)
OceanIndependence      R1= 0 → R2= 0 → R3= 0  FAIL   Cloudflare block
MerleWood              R1= 0 → R2= 0 → R3= 0  FAIL   Cloudflare block
SYS                    R1= 6 → R2= 6 → R3= 9  PASS   (+3) — schema.org microdata fix
```

### Two scraper PRs landed this session

**`e03b613` — fix(scraper): harden generic JSON-LD parsing**
- Unwrap `@graph` recursively (was the #1 root cause; Y.CO, IYG, YATCO all use it).
- Format `offers.price` with currency from `priceCurrency` (`"74000000"` →
  `"€74,000,000"`).
- Handle `offers` as both Offer and Offer[].
- Read `manufacturer.name` / `brand.name` → builder.
- Read `productionDate` / `vehicleModelDate` / `modelDate` → year.
- Read `speed` QuantitativeValue (object or array) → routed via assignSpec
  by name → maxSpeed / cruiseSpeed.
- Read `weight` QuantitativeValue → typically grossTonnage.
- Read ImageObject `contentUrl` as well as `url`.

**`a675d3a` — fix(scraper): harden DOM spec extraction for non-JSON-LD sites**
- **`assignSpec`: strip trailing punctuation (`:` `;` `.`) from labels.** This
  is the highest-leverage one-line fix in the codebase — it lifted Gilman from
  PARTIAL 7 to PASS 11 by itself. Patterns like `"^length$"` and `"^price$"`
  were silently failing whenever DOM labels arrived as `"Length:"` / `"Price:"`.
- Table-row scanner: skip leading empty/icon-only cells (Yacht-Zoo pattern).
- Schema.org microdata loop: walk `[itemtype*='PropertyValue']` with
  `[itemprop='name']` / `[itemprop='value']` children (SYS, BoatsGroup-style).
- Broader DOM label/value selectors:
  added `.spec-grid__item` (Cecil Wright), `.yachtSPEC` (Bluewater),
  `.specifications li/div`, `ul.specs li`, `ol.specs li`, `.specs > *`.
  Broadened label-side children to include `.spec-title / .caps / .description`
  and value-side to include `.result / .spec-data / p.spec`.

### Cloudflare-blocked sites — final drop list (joining YachtWorld/HMY)

After this session: **Galati, Boats.com, Ocean Independence, Merle Wood** —
all confirmed 403 from Railway. Combined with YachtWorld and HMY, these 6 sites
are out of server-side coverage. Same precedent: treat as known gap, not a bug.

### Remaining work for next session (in priority order)

1. **SuperYachts Monaco residual.** Still 0 specs after the DOM fix. Their
   `<li>` containers are likely missing the `.specifications`/`.specs` parent
   that my broadened selector targets. Probe `[class*='spec']` containers and
   add the actual class. Should be a one-line selector addition.
2. **Bluewater residual.** R3 picked up LOA/beam/year/engines but still no
   price, no builder, no images. Worth a 10-minute look at what container the
   builder lives in.
3. **CecilWright residual.** R3 picked up LOA/year/builder but still no beam,
   no price, no images. Same kind of polish.
4. **BoatInternational provider regression.** Already had a dedicated provider,
   but it returns only name/desc/1 image now (5/12, was 8/12-ish before).
   Page format probably changed since the provider was written.
5. **SuperYachtTimes provider regression.** Now 403s from Railway. Either an
   anti-bot upgrade on their end or a stale UA/header on ours. Probably needs
   the same kind of "looks-like-browser" header set Burgess uses.
6. **YPI custom provider.** Specs are in unstructured running text on YPI;
   no DOM container holds them. Would need either a YPI-specific provider with
   text-mining regex, or improvements to the `mineFromText` layer in
   `utils.ts`. Lower priority — single site, niche brokerage.
7. **Retire YachtWorld file + clean stale router comment** (still pending
   from the original locked plan).
8. **Audit `campaign/providers/` vs `vessel-scraper/providers/` drift** (still
   pending from the original locked plan).

### Files touched this session
- `src/lib/vessel-scraper/index.ts` — JSON-LD walker + DOM selectors (~150 lines)
- `src/lib/vessel-scraper/utils.ts` — colon-strip in `assignSpec` (~1 line)
- `SESSION_HANDOFF.md` — this file

### Test artefacts (NOT in repo; regenerate with the same runner)
- `/tmp/scraper_testpass_results.json` — Round 1 (baseline)
- `/tmp/scraper_testpass_results_round2.json` — Round 2 (after JSON-LD fix)
- `/tmp/scraper_testpass_results_round3.json` — Round 3 (after DOM fix)
- `/tmp/html_cache.pkl` — cached raw HTML for 12 sites (for offline probing)
- The runner is in the Python REPL state from this session; reproduce by
  driving `POST /api/brochures/preview` with the SITES list from the chat.

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
