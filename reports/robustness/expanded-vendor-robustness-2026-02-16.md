# Expanded Vendor Robustness Report (2026-02-16)

## Scope
- Expansion batch: 10 additional vetted US storefront/API vendors added to `sql/seed.sql`.
- Vendor run: `d515a861-ad68-4d28-9155-d2439bfe0f4a` (manual/safe).
- Finnrick run: `5233e9be-24fb-42ba-9084-2e8dde507589`.

## Run Summary
### Vendors job (`d515a861-ad68-4d28-9155-d2439bfe0f4a`)
- `status=partial`
- `pagesTotal=21`, `pagesSuccess=20`, `pagesFailed=1`, `policyBlocked=0`
- `offersCreated=425`, `offersUpdated=0`, `offersUnchanged=116`, `offersExcludedByRule=0`
- `unresolvedAliases=73`, `aliasesSkippedByAi=231`, `aiTasksQueued=1`
- Runtime window: `2026-02-16T01:27:36.175Z` -> `2026-02-16T01:53:23.735Z`

### Finnrick job (`5233e9be-24fb-42ba-9084-2e8dde507589`)
- `status=success`
- `vendorsTotal=13`, `vendorsMatched=10`, `ratingsUpdated=10`, `notFound=3`

## Per-Vendor Robustness Metrics
| Vendor | Active offers | Unresolved aliases (run) | Skipped by AI (run) | Failure/policy signals | Discovery source |
| --- | ---: | ---: | ---: | --- | --- |
| Bulk Peptide Supply | 41 | 4 | 29 | none | woocommerce_store_api |
| Coastal Peptides | 13 | 8 | 4 | none | woocommerce_store_api |
| Elite Research USA | 52 | 0 | 19 | `NO_OFFERS=1` | html |
| Eternal Peptides | 26 | 4 | 3 | none | woocommerce_store_api |
| My Oasis Labs | 35 | 2 | 11 | none | woocommerce_store_api |
| NexGen Peptides | 24 | 0 | 15 | none | woocommerce_store_api (origin reuse events: 5) |
| Peptide Labs X | 40 | 0 | 26 | none | woocommerce_store_api (origin reuse events: 2) |
| Peptidology | 30 | 8 | 14 | none | woocommerce_store_api |
| PeptiLab Research | 25 | 1 | 14 | none | woocommerce_store_api |
| Planet Peptide | 45 | 2 | 10 | none | woocommerce_store_api |
| Pure Tested Peptides | 140 | 15 | 20 | none | woocommerce_store_api |
| Simple Peptide | 41 | 12 | 49 | none | woocommerce_store_api |
| Verified Peptides | 29 | 17 | 17 | none | woocommerce_store_api |

## Queue Delta (Alias Match)
### Baseline before expanded vendor run
- `open=0`, `resolved=384`, `ignored=333`

### After vendor run, before triage
- `open=73`, `resolved=384`, `ignored=333`

### Triage execution
- `npm run job:review-ai -- --limit=50` (pre-fix run): `resolved=0`, `ignored=0`, `leftOpen=50`
- Heuristic/cached-evaluation fix applied (details below), then:
- `npm run job:review-ai -- --limit=50`: `resolved=8`, `ignored=17`, `leftOpen=25`
- `npm run job:review-ai -- --limit=25`: `resolved=0`, `ignored=0`, `leftOpen=25`
- `npm run job:review-ai`: `resolved=2`, `ignored=2`, `leftOpen=44`
- `npm run job:review-ai`: `resolved=1`, `ignored=0`, `leftOpen=43`
- Taxonomy onboarding + rule expansion applied, then:
- `npm run job:review-ai`: `resolved=35`, `ignored=2`, `leftOpen=6`
- `npm run job:review-ai`: `resolved=4`, `ignored=2`, `leftOpen=0`
- One additional `--limit=50` attempt failed with `canceling statement due to statement timeout`.
- Manual correction applied for false-ignore edge case: GHK-Cu review row set to `resolved` (admin) to preserve single-compound tracking.
- Manual correction applied for two cached-non-trackable rows: `THYMALIN 10 mg (10 vials)` and `CAGRISEMA 10 mg (10 vials)` were re-resolved to canonical compounds.

### Final post-triage state
- `open=0`, `resolved=437`, `ignored=353`
- Net delta from pre-triage: `open -73`, `resolved +53`, `ignored +20`
- Remaining open reason group: none

## Vendors/Pages With Zero Offers
- `Elite Research USA` page: `https://eliteresearchusa.com/products`
  - `last_status=no_data`, `NO_OFFERS` event emitted, AI task queued.
  - Likely cause: this path currently does not expose parseable/API product payload under safe-mode extraction, while root (`http://eliteresearchusa.com/`) still yields valid Inertia/HTML offers.

## Robustness Fixes Applied During Validation
- Cached review handling in alias resolver now allows deterministic rules to run before returning `ai_review_cached`.
  - Impact: deterministic rules can now drain previously cached queue items without forcing repeated AI calls.
- Added deterministic blend/stack ignore path using explicit blend markers (`blend|stack|combo|mix`, plus-delimited, slash-delimited).
- Added deterministic CJC no-DAC mapping support for Mod GRF phrasing.
- Expanded tirzepatide shorthand coverage to include `GLP2-T`, `GLP-2TZ`, `GLP1-T`, and parenthesized `GLP-2 (T)` forms.
- Added deterministic semaglutide shorthand coverage for `GLP1-S`, `GLP-1 (S)`, and `GLP1`.
- Added deterministic canonical mapping for `argireline` and `pal-tetrapeptide-7`.
- Added descriptor stripping for generic `peptide` suffixes and pack-count descriptor tails (for example `10 vials`).
- Expanded non-product listing detection for cosmetic/noise patterns seen in this run (for example dissolving strips, body cream, hair-growth formulation, conditioner, eye-glow, t-shirt).
- Kept `cagrisema` as a tracked canonical blend compound for now.

## New Alias Patterns Requiring Additional Coverage
All high-frequency unresolved patterns identified in this expansion pass were covered by taxonomy onboarding + deterministic alias updates, and the alias queue is currently closed.
