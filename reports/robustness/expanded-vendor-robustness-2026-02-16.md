# Expanded Vendor Robustness Report (2026-02-16)

## Scope
- Second expansion batch: 5 additional vetted US storefront/API vendors added to `sql/seed.sql`:
  - `evolvebiopep.com`
  - `purapeptides.com`
  - `nusciencepeptides.com`
  - `peptides4research.com`
  - `atomiklabz.com`
- Vendor run: `37c41def-d773-4d16-9556-4d45d5902a3f` (manual/safe).
- Finnrick run: intentionally deferred during this scrape-expansion pass.

## Coverage Delta
- Previous expansion baseline: `13` active vendors / `21` active vendor pages.
- Current coverage after reseed: `18` active vendors / `26` active vendor pages.
- Vendors with active offers after run: `18`.

## Run Summary
### Vendors job (`37c41def-d773-4d16-9556-4d45d5902a3f`)
- `status=partial`
- `pagesTotal=26`, `pagesSuccess=25`, `pagesFailed=1`, `policyBlocked=0`
- `offersCreated=274`, `offersUpdated=1`, `offersUnchanged=537`, `offersExcludedByRule=0`
- `unresolvedAliases=16`, `aliasesSkippedByAi=339`, `aiTasksQueued=1`
- Runtime window: `2026-02-16T02:41:29.132Z` -> `2026-02-16T02:55:03.956Z` (~`815.7s`)

### Queue delta (`queue_type='alias_match'`)
#### Baseline before vendor run
- `open=0`, `resolved=437`, `ignored=353`

#### After vendor run, before triage
- `open=16`, `resolved=437`, `ignored=353`

#### Triage execution
- `npm run job:review-ai -- --limit=50` (pass 1): `itemsScanned=16`, `resolved=0`, `ignored=0`, `leftOpen=16`
- Alias robustness fix applied (details below), then:
- `npm run job:review-ai -- --limit=50` (pass 2): `itemsScanned=16`, `resolved=3`, `ignored=0`, `leftOpen=13`
- Manual adjudication pass: `ignored=13` (all remaining open items)
- Verification pass: `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`

#### Final post-triage state
- `open=0`, `in_progress=0`, `resolved=440`, `ignored=366`
- Net delta from pre-run baseline: `open 0`, `resolved +3`, `ignored +13`

## Per-Vendor Robustness Metrics
| Vendor | Active offers | Unresolved aliases (run) | Skipped by AI (run) | Failure/policy signals | Discovery source |
| --- | ---: | ---: | ---: | --- | --- |
| Atomik Labz | 75 | 10 | 42 | none | woocommerce_store_api |
| Bulk Peptide Supply | 45 | 0 | 29 | none | woocommerce_store_api |
| Coastal Peptides | 19 | 0 | 6 | none | woocommerce_store_api |
| Elite Research USA | 52 | 0 | 19 | `NO_OFFERS=1` | html |
| Eternal Peptides | 28 | 0 | 5 | none | woocommerce_store_api |
| Evolve BioPep | 26 | 4 | 10 | none | woocommerce_store_api |
| My Oasis Labs | 36 | 0 | 12 | none | woocommerce_store_api |
| NexGen Peptides | 24 | 0 | 15 | none | woocommerce_store_api (origin reuse events: 5) |
| NuScience Peptides | 44 | 2 | 16 | none | woocommerce_store_api |
| Peptide Labs X | 40 | 0 | 26 | none | woocommerce_store_api (origin reuse events: 2) |
| Peptides 4 Research | 26 | 0 | 11 | none | woocommerce_store_api |
| Peptidology | 38 | 0 | 14 | none | woocommerce_store_api |
| PeptiLab Research | 26 | 0 | 14 | none | woocommerce_store_api |
| Planet Peptide | 47 | 0 | 10 | none | woocommerce_store_api |
| Pura Peptides | 50 | 0 | 6 | none | woocommerce_store_api |
| Pure Tested Peptides | 149 | 0 | 26 | none | woocommerce_store_api |
| Simple Peptide | 44 | 0 | 58 | none | woocommerce_store_api |
| Verified Peptides | 43 | 0 | 20 | none | woocommerce_store_api |

## Vendors/Pages With Zero Offers
- `Elite Research USA` page: `https://eliteresearchusa.com/products`
  - `last_status=no_data`, `NO_OFFERS` event emitted, AI task queued.
  - Likely cause: this path still does not expose parseable/API product payload under safe-mode extraction, while root (`http://eliteresearchusa.com/`) continues to produce valid HTML/Inertia offers.

## Robustness Fixes Applied During Validation
- Alias descriptor stripping now preserves compound numeric identity when numeric token is part of the name:
  - Example fixed: `BPC-157 Peptide 5mg/10mg/20mg` now strips to `bpc 157` (not `bpc`).
- Storefront-noise stripping now removes Atomik batch-note/kit text:
  - `Current batch tested at ...`
  - `with Air Dispersal Kit`
- Regression coverage added in `tests/unit/alias-normalize.test.ts` for both fixes.
- Deterministic re-triage resolved previously cached-open canonical aliases:
  - `Sermorelin ... with Air Dispersal Kit` -> `sermorelin`
  - `Selank ... with Air Dispersal Kit` -> `selank`
  - `BPC-157 Peptide 5mg/10mg/20mg` -> `bpc-157`

## Remaining Open Reason Groups
- None (`open=0`).
