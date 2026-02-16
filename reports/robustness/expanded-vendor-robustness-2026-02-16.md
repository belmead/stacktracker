# Expanded Vendor Robustness Report (2026-02-16)

## Scope
- Third expansion batch: 12 additional vetted US storefront/API vendors added to `sql/seed.sql`:
  - `peptiatlas.com`
  - `purerawz.co`
  - `peptidecrafters.com`
  - `biolongevitylabs.com`
  - `lotilabs.com`
  - `nexaph.com`
  - `erospeptides.com`
  - `biopepz.net`
  - `purepeps.com`
  - `hkroids.com`
  - `reta-peptide.com`
  - `swisschems.is`
- Vendor run: `9b1960c1-9db9-467e-b477-eba428770954` (manual/safe).
- Finnrick run: intentionally deferred during this scrape-expansion pass.

## Coverage Delta
- Previous expansion baseline: `18` active vendors / `26` active vendor pages.
- Current coverage after reseed: `30` active vendors / `38` active vendor pages.
- Vendors with active offers after run: `28`.

## Run Summary
### Vendors job (`9b1960c1-9db9-467e-b477-eba428770954`)
- `status=partial`
- `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `policyBlocked=0`
- `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `offersExcludedByRule=0`
- `unresolvedAliases=69`, `aliasesSkippedByAi=543`, `aiTasksQueued=4`
- Runtime window: `2026-02-16T14:28:18.443Z` -> `2026-02-16T15:17:53.755Z` (~`2976.2s`)

### Queue delta (`queue_type='alias_match'`)
#### Baseline before vendor run
- `open=0`, `resolved=440`, `ignored=366`

#### After vendor run, before triage
- `open=69`, `resolved=440`, `ignored=366`

#### Triage execution
- `npm run job:review-ai -- --limit=50` (pass 1): `itemsScanned=50`, `resolved=0`, `ignored=2`, `leftOpen=48`
- `npm run job:review-ai -- --limit=50` (pass 2): `itemsScanned=50`, `resolved=0`, `ignored=0`, `leftOpen=50`
- `npm run job:review-ai -- --limit=100` (pass 3): `itemsScanned=67`, `resolved=0`, `ignored=0`, `leftOpen=67`
- Alias robustness fix applied (details below), then:
- `npm run job:review-ai -- --limit=100` (pass 4): `itemsScanned=67`, `resolved=23`, `ignored=0`, `leftOpen=44`
- Manual adjudication pass: `ignored=44` (remaining branded/code aliases)
- Verification pass: `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`

#### Final post-triage state
- `open=0`, `in_progress=0`, `resolved=463`, `ignored=412`
- Net delta from pre-run baseline: `open 0`, `resolved +23`, `ignored +46`

## Per-Vendor Robustness Metrics
| Vendor | Active offers | Unresolved aliases (run) | Skipped by AI (run) | Failure/policy signals | Discovery source |
| --- | ---: | ---: | ---: | --- | --- |
| Atomik Labz | 76 | 0 | 51 | none | woocommerce_store_api |
| BioLongevity Labs | 18 | 17 | 43 | none | woocommerce_store_api |
| BioPepz | 0 | 0 | 0 | `NO_OFFERS=1` | n/a (no successful discovery event) |
| Bulk Peptide Supply | 45 | 0 | 29 | none | woocommerce_store_api |
| Coastal Peptides | 19 | 0 | 6 | none | woocommerce_store_api |
| Elite Research USA | 52 | 0 | 19 | `NO_OFFERS=1` | html |
| Eros Peptides | 62 | 29 | 6 | none | woocommerce_store_api |
| Eternal Peptides | 28 | 0 | 5 | none | woocommerce_store_api |
| Evolve BioPep | 26 | 0 | 14 | none | woocommerce_store_api |
| HK Roids | 45 | 0 | 21 | none | woocommerce_store_api |
| Loti Labs | 54 | 0 | 36 | none | woocommerce_store_api |
| My Oasis Labs | 36 | 0 | 12 | none | woocommerce_store_api |
| Nexaph | 32 | 7 | 13 | none | woocommerce_store_api |
| NexGen Peptides | 24 | 0 | 15 | origin reuse events: `5` | woocommerce_store_api |
| NuScience Peptides | 45 | 0 | 17 | none | woocommerce_store_api |
| PeptiAtlas | 0 | 0 | 0 | `NO_OFFERS=1` | n/a (no successful discovery event) |
| Peptide Crafters | 54 | 0 | 12 | none | woocommerce_store_api |
| Peptide Labs X | 40 | 0 | 26 | origin reuse events: `2` | woocommerce_store_api |
| Peptides 4 Research | 26 | 0 | 11 | none | woocommerce_store_api |
| Peptidology | 38 | 0 | 14 | none | woocommerce_store_api |
| PeptiLab Research | 26 | 0 | 14 | none | woocommerce_store_api |
| Planet Peptide | 47 | 0 | 10 | none | woocommerce_store_api |
| Pura Peptides | 50 | 0 | 6 | none | woocommerce_store_api |
| Pure Tested Peptides | 149 | 0 | 26 | none | woocommerce_store_api |
| PurePeps | 9 | 2 | 0 | none | woocommerce_store_api |
| PureRawz | 15 | 8 | 50 | `SCRAPE_PAGE_ERROR=1` (`read ECONNRESET`) | woocommerce_store_api |
| Reta Peptide | 23 | 0 | 6 | `SCRAPE_PAGE_ERROR=1` (`read ECONNRESET`) | shopify_products_api |
| Simple Peptide | 44 | 0 | 0 | `DISCOVERY_ATTEMPT_FAILED=1`, `NO_OFFERS=1` | n/a (discovery aborted) |
| Swiss Chems | 32 | 6 | 61 | none | woocommerce_store_api |
| Verified Peptides | 43 | 0 | 20 | none | woocommerce_store_api |

## Vendors/Pages With Zero Offers or Page Errors
- `https://www.biopepz.net/`
  - `NO_OFFERS`, AI fallback task queued.
  - Likely cause: safe-mode extraction did not find a parseable storefront/API payload.
- `https://eliteresearchusa.com/products`
  - `NO_OFFERS`, AI fallback task queued.
  - Existing known gap: this path still fails under safe-mode extraction while root URL remains parseable.
- `https://peptiatlas.com/`
  - `NO_OFFERS`, AI fallback task queued.
  - Likely cause: storefront/API payload inaccessible in current safe-mode path.
- `https://simplepeptide.com/`
  - `DISCOVERY_ATTEMPT_FAILED` (`woocommerce_store_api` aborted) followed by `NO_OFFERS` and AI fallback task.
- `https://purerawz.co/`
  - `SCRAPE_PAGE_ERROR` (`read ECONNRESET`) after partial ingestion (`created=15`, `unresolved=8`, `skippedByAi=50`).
- `https://reta-peptide.com/`
  - `SCRAPE_PAGE_ERROR` (`read ECONNRESET`) after partial ingestion (`created=23`, `unresolved=0`, `skippedByAi=6`).

## Robustness Fixes Applied During Validation
- Added deterministic single-letter GLP shorthand handling for dose-only storefront aliases:
  - `R ... mg` -> `retatrutide`
  - `S ... mg` -> `semaglutide`
  - `T ... mg` -> `tirzepatide`
- Regression coverage expanded in `tests/unit/alias-normalize.test.ts` for these shorthand forms, including negative guards that no-unit/non-`mg` variants are rejected.
- Post-fix triage rerun resolved 23 previously cached-open aliases without manual mapping.

## Manual Adjudication (Ignored)
Remaining `44` open aliases were manually ignored as vendor-coded/branded non-trackable items to preserve strict single-compound quality:
- BioLongevity Labs (`17`): `BioAmp`, `BioBloodVessels ...`, `BioHeart ...`, `BioIgnite`, `BioMind`, `BioMuscle ...`, `BioOvary ...`, `BioPineal ...`, `BioProstate ...`, `BioRestore`, `BioRetina ...`, `BioThymus ...`, `BioZapetite`, `LeptoGR 10mg`, `Livagen Peptide (20mg)`, `Pancragen Peptide (20mg)`, `Vesilute Peptide (20mg)`.
- Eros Peptides (`4`): `Livagen 20MG`, `Pancragen 20MG`, `Thymogen 20MG`, `Tri-Core 45MG`.
- Nexaph (`7`): `NXP-2P ...`, `NXP-3P ...`, `PDA 10mg ...`, pre-order code variants.
- PurePeps (`2`): `2G-T 10mg`, `3G-R 10mg`.
- PureRawz (`8`): `FGL`, `HEP-1`, `Orexin B`, `Pancragen`, `PP-405`, `PTD-DBM`, `Thymagen (Thymogen)`, `Thyroidget`.
- Swiss Chems (`6`): `Brain Research`, `Livagen, 20mg`, `Pancragen, 20mg`, `Recombinant 12629-01-5 (1vial) 10IU`, `Thymogen, 20mg`, `Vesilute, 20mg`.

## Remaining Open Reason Groups
- None (`open=0`).
