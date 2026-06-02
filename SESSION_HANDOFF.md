# YotCRM (YotBot) — Session Handoff

_Last updated: 2026-06-02 (Round 5 — Bluewater, Cecil Wright, YachtBuyer, Charter, BoatIntl)_

---

## ▶ LATEST UPDATE (2026-06-01) — R4-confirm clean, Bluewater + Cecil Wright shipped

### Shipped
| SHA | Description |
|---|---|
| `1c8a21b` | feat(scraper): dedicated Bluewater provider |
| `8ee3bb9` | fix(scraper): Bluewater images — bypass shared dedupeImages broker-filter |
| `9ce5572` | feat(scraper): dedicated Cecil Wright provider |
| `a423188` | fix(scraper): YachtBuyer builder + name suffix (JSON-LD; markup changed) |
| `7e89464` | feat(scraper): charter first-class — rate/areas fields + 2 providers |
| `901a6d7` | fix(scraper): CharterWorld data-quality (th/td specs, year, images, areas) |
| `ad4e1ff` | fix(scraper): CharterWorld LOA — normalise 'L.O.A.' to LOA |
| `5f0c046` | fix(scraper): BoatInternational markup decay (JSON-LD removed) |

- **Item #1 (SPM) confirmed DONE.** R4-confirm ran clean on prod: SPM PASS 9,
  CharterWorld PASS 9 (that run), Y.CO 11 / Moran 9 / IYG 12 / YATCO 11.
- **Item #2 (Bluewater) DONE.** 6/12 → **PASS 12/12**. See priority list.
- **Item #3 (Cecil Wright) DONE.** 7/12 → **PASS 11/12** (ceiling — beam/draft
  not on page). Both new providers verified coexisting on prod.
- **Item #4 (Yachtbuyer) DONE.** name + builder fixed via schema.org/Vehicle
  JSON-LD (their `labelCopy` spec markup had changed). 8/12 is the ceiling —
  images watermarked (excluded), no editorial description published.
- **Item #5 (Charter scope) DECIDED + DONE.** Charter is now first-class:
  charter fields on `VesselData`, 2 dedicated providers, per-week rate surfaced
  as price. CharterWorld + YachtCharterFleet both **PASS 12/12** on prod.
- **Item #6 (BoatInternational) DONE.** BI removed JSON-LD + renamed spec
  classes → 6/12. Fixed via current `spec-block` markup + title parse + CDN
  image sweep. **6/12 → PASS 9/12** on prod (ceiling: no price published, JS-
  hydrated gallery). Two markup-decay fixes this round (BI, Yachtbuyer) — see
  heads-up below; **#7 SuperYachtTimes is likely the same family.**
- **Heads-up:** YachtBuyer (and CharterWorld's markup quirks) reinforce that
  CSS-class providers are brittle; JSON-LD (`@type` Vehicle/Product) is the
  durable source where a site emits it. YachtCharterFleet uses it and was
  clean first try. Worth auditing other class-based providers if scores drift —
  **directly relevant to #6 (BoatInternational) and #7 (SuperYachtTimes).**

### Findings worth carrying forward (NEW)
1. **`dedupeImages()` has a latent `broker`→`brokerage` false-match.** The
   shared guard `/broker|agent|staff|.../ ` (utils.ts) is meant to drop broker
   *headshots*, but it also matches the substring "broker" inside any gallery
   path like `/_uploads/website/brokerage/yachts/...`. On Bluewater this
   silently zeroed all 15 photos. Worked around inside the provider; the shared
   util is still wrong for **any** brokerage-pathed site. Proper fix: tighten to
   `persons?\/broker|broker[-_](photo|headshot|profile)` — but that's a shared
   util touching all 20 providers, so it needs its own verification pass.
2. **CharterWorld LOA extraction is FLAKY on live fetches.** Three back-to-back
   prod runs gave PASS 9 / PARTIAL 7 / PARTIAL 8 — loa present then absent. Not
   a code regression (Bluewater commit is inert for it; SPM stayed 9). The
   generic structural/JSON matcher on charterworld.com is non-deterministic
   against their live markup. The R4-confirm "CharterWorld 9" was a good-side
   sample. Its PASS is not stable — treat as borderline, not solved.
3. **DEPLOY DRIFT — `yotcrm-deploy` is STALE (~3 months).** Its
   `vessel-scraper/index.ts` (2026-03-23) has NONE of the R2–R4 fixes (no
   `@graph` JSON-LD, no full-page AI text, 0/2 of the `91fcb83` `.children()`
   matcher). All recent work is committed **directly in `yotcrm-ui`** (git
   remote `Yachtslinger/yotcrm-ui`, Railway auto-deploys on push to `main`).
   The old "edit deploy → rsync `--delete` → ui" workflow is ABANDONED and
   would WIPE everything recent. **Edit `yotcrm-ui` directly.** This supersedes
   the deploy workflow described further down in this file.

---

## ▶ LATEST UPDATE (2026-05-31, continuation) — Round 4: SPM fix + regression hunt

### What shipped (two more commits, both build-clean)

| SHA | Description |
|---|---|
| `79ed9ff` | fix(scraper): structural match for bare `<li>`/`<div>` spec containers |
| `91fcb83` | fix(scraper): split structural pair matcher to avoid `.description` body false-match |

### Round 4 — what changed vs Round 3

| Site | R3 | R4 | Δ | Status |
|---|---|---|---:|---|
| **SuperYachts Monaco** | PARTIAL 5 | **PASS 9**  | +4 | ✓ target hit |
| BoatInternational | PARTIAL 5 | PARTIAL 6 | +1 | incidental gain |
| **CharterWorld** | PASS 9 | PARTIAL 7 | -2 | regression — fixed in `91fcb83` |
| All others (22 sites) | — | — | 0 | unchanged |

### How the regression happened (logged for the pattern)

`79ed9ff` added `.description` to the general label-side `.find()` to support
SPM's `<span class="description">Beam</span>` markup. But `.description` is
*also* a common body-text container class on charter and brokerage sites.
On CharterWorld, the general `.find()` descended into a deep `.description`
prose container, grabbed the prose as a "label", substring-matched "length"
somewhere inside it, and routed the adjacent value to the wrong field —
which blocked the correctly-extracted LOA from staying set.

`91fcb83` splits the structural-pair matching into its own loops that use
`.children()` (direct children only) instead of `.find()` (any descendant).
The `:has()` guards still catch SPM's bare `<ul><li>` pattern without
false-matching on pages where `.description` is a body container deeper
in the tree.

### Verification status

`91fcb83` is deployed (Railway uptime confirms it). **R4-confirm RAN CLEAN
2026-06-01** against prod `/api/brochures/preview`: SPM **PASS 9**,
CharterWorld **PASS 9** (LOA extracting again — `.children()` fix did not
re-break it), and Y.CO 11 / Moran 9 / IYG 12 / YATCO 11 all unchanged at PASS.
Runner persisted at `/tmp/r4_confirm.py`; results at
`/tmp/scraper_testpass_results_round4_confirm.json`.

### Cumulative scoreboard (after 5 scraper commits this session)

Across 25 URLs · 1 baseline of 7 dedicated + 16 generic + 2 charter:

| Round  | Generic PASS | Generic PARTIAL | Generic FAIL | Generic avg |
|------:|---:|---:|---:|---:|
| R1 baseline           | 1 | 9 | 6 | 4.6/12 |
| R2 (JSON-LD fix)      | 5 | 5 | 6 | 5.8/12 |
| R3 (DOM fix)          | 8 | 3 | 5 | 7.0/12 |
| R4 (SPM structural fix, regression-corrected) | **9** | 2 | 5 | ~7.4/12 (predicted) |

### Next session first task (5 min)

Run R4-confirm against this 6-site subset:
SuperYachtsMonaco, CharterWorld, Y.CO, Moran, ItalianYachtGroup, YATCO.

Pass criteria: SPM ≥ 9, CharterWorld ≥ 9, the other 4 unchanged at PASS.
If clean → mark item #1 done in priority list, move to #2 (Bluewater).
If not clean → diagnose before continuing down the list.

### Updated priority list

1. ~~**SuperYachts Monaco residual**~~ — **DONE.** Fix shipped (`79ed9ff` +
   `91fcb83`), R4-confirm clean 2026-06-01 (SPM 9, CharterWorld 9, others
   unchanged). Next start point is **#2 (Bluewater)**.
2. ~~**Bluewater residual.**~~ **DONE 2026-06-01.** 6/12 → **PASS 12/12**.
   Dedicated provider `providers/bluewater.ts` (commits `1c8a21b` + `8ee3bb9`):
   builder from `<title>`, price from `div.yachtprice`, gallery from Cloudinary
   `background-image` URLs, specs from `.yachtSPEC` + `<li>label: value</li>`.
   Verified on prod (LOON / icon-134430): name LOON, builder Icon Yachts,
   €42,950,000, 15 images.
3. ~~**CecilWright residual.**~~ **DONE 2026-06-01.** 7/12 → **PASS 11/12**
   (commit `9ce5572`, `providers/cecilwright.ts`). Added price (`.boat-price__price`,
   "Purchase For" label) and the S3 gallery (`cecilwright-craft/store/_large`,
   58 photos). Specs via `.spec-grid__item`. **Beam/draft/engines are not
   published on the page**, so keyspecs caps at 1 → 11/12 is the ceiling for
   this listing, not a fixable gap. Verified on prod (ALCHEMIST).
4. ~~**Yachtbuyer provider: extract `builder` + strip suffix.**~~ **DONE
   2026-06-01** (commit `a423188`). Both targets fixed: name now `BELLA LUNA`
   (SEO " Yacht For Sale" suffix stripped) and builder now `Monte Carlo Yachts`.
   Root cause was bigger than expected — YachtBuyer **changed their spec
   markup** (the old `strong.labelCopy` is gone), which had silently broken the
   whole structured spec list. Fix parses their `schema.org/Vehicle` JSON-LD as
   the primary source (name/builder/year/price — durable vs CSS churn) and
   updates the spec selector to `li > span(label) + span.detail`. That also
   restored beam/draft/engines/guests/staterooms + price €2,950,000.
   **Score 8/12 is the ceiling here, not a gap:** images excluded by design
   (watermarked), and YachtBuyer publishes **no editorial description** for
   listings (it's a comparison/aggregator site — meta desc is SEO boilerplate).
   Verified on prod (bella-luna-62529fb8).
5. ~~**Charter scope decision.**~~ **DECIDED + DONE 2026-06-02 — charter is now
   first-class.** `VesselData` gained `isCharter`, `charterRate`,
   `charterRateLow/High`, `charterCurrency`, `charterAreas`, `charterSeason`,
   `charterType`. Two dedicated providers (`charterworld.ts`,
   `yachtcharterfleet.ts`); `scrapeVessel()` surfaces the per-week rate as
   `price` when a charter listing has no asking price, so every downstream
   consumer shows charter pricing from one place. **Both verified PASS 12/12
   on prod** (CharterWorld INCEPTION, YachtCharterFleet Maltese Falcon).
   Commits `7e89464`, `901a6d7`, `ad4e1ff`.
6. ~~**BoatInternational provider regression.**~~ **DONE 2026-06-02** (commit
   `5f0c046`). Root cause: BI **removed JSON-LD** (the provider's primary
   source) and renamed its spec classes, so it fell through to dead selectors
   → 6/12. Fix reads current markup: `li.spec-block__list-item`
   (`.spec-block__title`/`.spec-block__data`), title parse for
   name/builder/loa/year ("NAME yacht for sale (Builder, Xm, YYYY)"), and a
   `cdn.boatinternational.com` image sweep. **6/12 → PASS 9/12 on prod**
   (verified ABIDE). Ceiling: BI publishes **no asking price** (price-on-
   application) and the gallery is JS-hydrated so server HTML carries only a
   few images — both need JS exec / aren't on the page.
7. **SuperYachtTimes provider regression.** Now 403s from Railway.
   Anti-bot upgrade on their end OR stale UA/header on ours.
8. **YPI custom provider.** Specs in unstructured running text; needs
   either YPI-specific text-mining or improvements to `mineFromText`.
9. **Retire YachtWorld file + clean stale router comment** (still pending).
10. **Audit `campaign/providers/` vs `vessel-scraper/providers/` drift**
    (still pending).

### Test artefacts (in /tmp, not in repo)

- `scraper_testpass_results.json` — Round 1 (baseline)
- `scraper_testpass_results_round2.json` — Round 2
- `scraper_testpass_results_round3.json` — Round 3 (includes Yachtbuyer + charter adds)
- `scraper_testpass_results_round4.json` — Round 4 (with the now-fixed CharterWorld regression)
- `html_cache.pkl` — cached raw HTML for 12 sites for offline probing
- `probe_*.py` — diagnostic scripts written this session

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

### Test-set changes (later in session)

- **Galati removed** from the test set. It's already in the Cloudflare-block
  drop list, so this is a cleanup — not a functional change.
- **Yachtbuyer added** as a DEDICATED baseline (already has a provider that
  intentionally skips images due to source watermarking).
- **Two charter sites added** (YachtCharterFleet, CharterWorld) — flagged as
  `CHARTER` kind, not GENERIC. The brochure scraper was built for sale
  listings; testing charter URLs through it was a deliberate scope probe to
  see what the existing fallback already handles.

### Surprise finding — charter sites scrape vessel metadata for free

| Site | Score | What worked | What didn't |
|---|---|---|---|
| **YachtCharterFleet** | 9/12 PASS | LOA, beam, draft, year, builder, engines, images, desc | No price (charter is per-week) |
| **CharterWorld**      | 9/12 PASS | LOA, beam, builder, engines, 66 images, 6000 char desc | No price (same reason), no year |

**Why this matters.** Both charter sites returned essentially complete vessel
metadata because yacht specs (LOA, builder, etc.) are the same data regardless
of whether a listing is for sale or for charter. The only "missing" field is
price — and that's not really missing, charter pricing is a different field
entirely (weekly rate, currency, charter areas, crew, guest cabins, etc).

**If charter ever moves in-scope**, the path forward is NOT a separate scraper.
It's adding charter-specific fields to `VesselData` (`charterRatePerWeek`,
`charterAreas`, `crewCount`, `guestCabins`) and extending the extraction
layers to populate them. The vessel-side data already lands correctly.

### Yachtbuyer — one real gap surfaced

- **8/12 PARTIAL** under the test rubric, but two of the missing points are
  scoring artifacts:
  - N1: my scorer flags "BELLA LUNA Yacht For Sale" as a junk name because
    the JUNK regex matches the "Yacht For Sale" suffix. Real name extraction
    is fine; the provider just doesn't strip the SEO suffix.
  - I0: intentional — provider explicitly skips images (watermarked source).
- **Real gap:** `builder` returned empty even though the URL slug is
  `monte-carlo-yachts`. The provider isn't extracting builder from the
  page (or from the slug). Worth a 5-minute look next session.

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
4. **Yachtbuyer provider: extract `builder`.** The slug holds the info
   (`monte-carlo-yachts/for-sale/bella-luna-…`); the page presumably does
   too. Also consider stripping " Yacht For Sale" suffix from the title so
   `vessel.name` is the actual yacht name. Small provider edit.
5. **Charter scope decision.** YachtCharterFleet + CharterWorld already
   scrape vessel metadata cleanly through the existing fallback. If charter
   should be in scope, add `charterRate`, `charterAreas`, `crew`,
   `guestCabins` to `VesselData` (and update extractors); the vessel-side
   data is already landing. If charter is out of scope, the existing
   "incidental" coverage doesn't hurt anything — leave it be.
6. **BoatInternational provider regression.** Already had a dedicated provider,
   but it returns only name/desc/1 image now (5/12, was 8/12-ish before).
   Page format probably changed since the provider was written.
7. **SuperYachtTimes provider regression.** Now 403s from Railway. Either an
   anti-bot upgrade on their end or a stale UA/header on ours. Probably needs
   the same kind of "looks-like-browser" header set Burgess uses.
8. **YPI custom provider.** Specs are in unstructured running text on YPI;
   no DOM container holds them. Would need either a YPI-specific provider with
   text-mining regex, or improvements to the `mineFromText` layer in
   `utils.ts`. Lower priority — single site, niche brokerage.
9. **Retire YachtWorld file + clean stale router comment** (still pending
   from the original locked plan).
10. **Audit `campaign/providers/` vs `vessel-scraper/providers/` drift** (still
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
