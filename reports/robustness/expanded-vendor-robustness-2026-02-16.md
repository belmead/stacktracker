# Expanded Vendor Robustness Report (2026-02-16)

## Continuation Snapshot (2026-02-17, post-onboarding run)
### Newly onboarded vendors (this pass)
- Added to seed/onboarded:
  - `precisionpeptideco.com`
  - `aminoasylumllc.com`
  - `elitepeptides.com`
  - `peptidesworld.com`
  - `amplifypeptides.com`
  - `peptidesupplyco.org`
  - `trustedpeptide.net`
  - `crushresearch.com`

### Robustness cycle
- `npm run job:vendors`:
  - run `e0a4b0fc-2063-4c38-9ac5-e01d271deaa4`
  - status `failed` (guardrail failure after ingestion)
  - `pagesTotal=53`, `pagesSuccess=51`, `pagesFailed=2`
  - `offersCreated=151`, `offersUpdated=0`, `offersUnchanged=1205`
  - `offersExcludedByRule=427`
  - `unresolvedAliases=14`, `aliasesSkippedByAi=784`, `aiTasksQueued=2`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=fail`
- Smoke failure detail:
  - `thymosin-alpha-1` dropped from `24` vendors in baseline to `0` current (`required=16`, `dropPct=1`).
- Latest passing guardrail baseline remains:
  - run `973e56fa-dd68-4a26-b674-c54cebad5b19` (`invariant/drift/smoke = pass`).

### AI validation after scrape
- `npm run job:review-ai -- --limit=200`
  - `itemsScanned=14`, `resolved=0`, `ignored=0`, `leftOpen=14`
  - all remaining alias items are `ai_review_cached` and require manual adjudication.
- Open alias-review items in this pass:
  - Amplify Peptides: `SYN-31 10mg`, `HN-24 10mg`, `SNP-8 10mg`, `PNL-3 20mg`
  - Amino Asylum: `T2 200MCG/ML`, `Prami`, `Adex`, `Stampede`, `PYRO 7MG`, `Helios`, `GAC EXTREME`
  - Crush Research: `Triple Agonist 15mg : Single`
  - Peptides World: `P-21-10Mg`, `Adipotide-FTPP 10mg`

### Queue/coverage snapshot
- Alias queue (`queue_type='alias_match'`): `open=14`, `in_progress=0`, `resolved=466`, `ignored=418`
- Parse-failure queue (`queue_type='parse_failure'`): `open=33`
- Active coverage: `45` vendors / `53` vendor pages

### New vendor ingestion outcomes
- `Amino Asylum`: `success`, `activeOffers=20`
- `Amplify Peptides`: `success`, `activeOffers=8`
- `Crush Research`: `success`, `activeOffers=9`
- `Elite Peptides`: `success`, `activeOffers=15`
- `Peptide Supply Co`: `success`, `activeOffers=27`
- `Peptides World`: `success`, `activeOffers=45`
- `Precision Peptide Co`: `success`, `activeOffers=22`
- `Trusted Peptide`: `success`, `activeOffers=5`

### Current failed-page diagnostics
- `Kits4Less` (`https://kits4less.com/`):
  - `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`safe_mode_access_blocked`, provider `cloudflare`).
- `PeptiAtlas` (`https://peptiatlas.com/`):
  - `INVALID_PRICING_PAYLOAD` (expected/desired behavior).

### Scope status
- MVP single-unit policy is active for ingestion/public offer aggregation.
- Bulk-pack economics remain deferred to v2.

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

## Invalid Pricing Diagnostic Hardening (2026-02-16, Woo zero-price fallback)
### Code/test changes
- Added targeted Woo invalid-pricing detection in discovery:
  - Detects when Woo Store API returns product candidates but all observed price fields are zero/empty.
  - Emits structured diagnostic metadata (`productsObserved`, `productCandidates`, `candidatesWithPriceFields`, sampled product IDs/names, observed/parsed price fields).
- Worker no-offers path now branches:
  - `INVALID_PRICING_PAYLOAD` event + `no_data_invalid_pricing` page status when invalid Woo pricing diagnostic exists.
  - Existing `NO_OFFERS` behavior remains for true empty/no-catalog paths.
- Added regression coverage:
  - `tests/unit/discovery.test.ts`: Woo zero-priced payload detection.
  - `tests/unit/worker-no-offers.test.ts`: invalid-pricing event/reporting path + preserved `NO_OFFERS` path.
  - `tests/unit/peptide-page.test.ts`: selected-variant average/low/high price summary rendering.

### Robustness cycle (this pass)
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`64` tests)
- `npm run job:vendors`: **blocked by transient DB `read ECONNRESET`** (details below)
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`, `leftOpen=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline `8807da2b-e1d4-4ad9-93c0-15bf66999254`)

### Vendor run attempts + blocker
- `2981b852-0b96-4c2b-9b68-57344bb8506e` (`status=failed`):
  - Progress before failure: `pagesSuccess=20`, `pagesFailed=2`, `offersUnchanged=618`, `aliasesSkippedByAi=310`.
  - Fatal summary error: `read ECONNRESET` during DB write path (`markVendorPageScrape`).
  - Key validation: `https://peptiatlas.com/` now emitted `INVALID_PRICING_PAYLOAD` (not `NO_OFFERS`).
- `4557927e-e446-4896-8278-23ff46ef9b1a` (`status=failed`):
  - Early-run failure with same fatal error (`read ECONNRESET`).
- `8d565b80-2b12-47e4-b33a-cfdb510647ef` (`status=failed`, concurrency override `1`):
  - Still failed with same fatal error (`read ECONNRESET`), indicating infra instability rather than scraper logic.

### Validated PeptiAtlas diagnostic event
- Run/event: `2981b852-0b96-4c2b-9b68-57344bb8506e` / `INVALID_PRICING_PAYLOAD`.
- Payload highlights:
  - `source=woocommerce_store_api`
  - `pageUrl=https://peptiatlas.com/`
  - `productsObserved=59`
  - `productCandidates=59`
  - `candidatesWithPriceFields=59`
  - `candidatesWithPositivePrice=0`
  - sampled product IDs include `730` (`Lipo C`), `728` (`Survodutide`), `726` (`Alprostadil`) with observed `price/regular_price/sale_price = "0"`.

## Stabilization Rerun (2026-02-16, post-fix hardening)
### Vendors job (`783e2611-43ed-471f-b493-d572fa6fd49d`)
- `status=partial`
- `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `policyBlocked=0`
- `offersCreated=48`, `offersUpdated=0`, `offersUnchanged=1210`, `offersExcludedByRule=0`
- `unresolvedAliases=4`, `aliasesSkippedByAi=679`, `aiTasksQueued=1`
- Runtime window: `2026-02-16T16:05:43.402Z` -> `2026-02-16T16:20:55.698Z` (~`913.2s`)

### Runtime observability breakdown (new instrumentation)
- Discovery/network wait totals:
  - `discoveryNetworkMs=71642` (~`71.6s`)
  - source split: `woo=66731`, `shopify=1224`, `html=3687`, `firecrawl=0`
- Alias resolution totals:
  - deterministic/rules path: `aliasDeterministicMs=258153` (~`258.2s`)
  - AI path: `aliasAiMs=300550` (~`300.6s`)
- DB persistence totals:
  - `dbPersistenceMs=1134001` (~`1134.0s`; summed per-page across concurrent workers)
- Page-level logs now emit `discoveryWait`, `aliasDet`, `aliasAi`, and `dbPersist` for each target.

### Queue delta (`queue_type='alias_match'`)
#### Baseline before rerun
- `open=0`, `resolved=463`, `ignored=412`

#### After vendor run, before triage
- `open=4`, `resolved=463`, `ignored=412`

#### Triage + adjudication
- `npm run job:review-ai -- --limit=50` (pass 1): `itemsScanned=4`, `resolved=0`, `ignored=1`, `leftOpen=3`
- `npm run job:review-ai -- --limit=50` (pass 2): `itemsScanned=3`, `resolved=0`, `ignored=0`, `leftOpen=3` (`ai_review_cached`)
- Manual adjudication (`ignored`) for remaining 3 branded/non-trackable aliases:
  - `FAT BLASTER` (`biopepz`)
  - `P21 (P021)` (`purerawz`)
  - `Livagen` (`purerawz`)
- Verification pass: `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`

#### Final post-triage state
- `open=0`, `in_progress=0`, `resolved=463`, `ignored=416`
- Net delta from rerun baseline: `resolved +0`, `ignored +4`

### Known-target stabilization status (post-fix)
| Target | Previous issue | Current rerun outcome | Notes |
| --- | --- | --- | --- |
| `https://www.biopepz.net/` | `NO_OFFERS` | `success` | HTML extraction now parses Wix `#wix-warmup-data`; `19` active offers after strict filtering. |
| `https://eliteresearchusa.com/products` | `NO_OFFERS` | `success` | Empty-page fallback to root HTML now captures Inertia payload; page persisted `71` offers. |
| `https://simplepeptide.com/` | `DISCOVERY_ATTEMPT_FAILED` + `NO_OFFERS` | `success` | Woo discovery stable in rerun; `44` unchanged offers, no page failure. |
| `https://purerawz.co/` | `SCRAPE_PAGE_ERROR` (`read ECONNRESET`) | `success` | Retry-hardened fetch path completed; no page error event in rerun. |
| `https://reta-peptide.com/` | `SCRAPE_PAGE_ERROR` (`read ECONNRESET`) | `success` | Shopify discovery completed; `29` active offers, no page error. |
| `https://peptiatlas.com/` | `NO_OFFERS` | `no_data` (only remaining failed page) | Woo endpoint returns products with `prices.price=0`/`regular_price=0`; no parseable priced offers. |

## Quality Guardrail Baseline Rerun (2026-02-16, post-normalization hardening)
### Vendors job (`fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`)
- `status=partial`
- `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `policyBlocked=0`
- `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=1243`, `offersExcludedByRule=0`
- `unresolvedAliases=0`, `aliasesSkippedByAi=668`, `aiTasksQueued=1`
- Runtime window: `2026-02-16T21:51:47.990Z` -> `2026-02-16T22:02:08.400Z` (~`621.3s`)

### Guardrail summary (`scrape_runs.summary.qualityGuardrails`)
- Invariant `bpc157_10mg_vial_majority`: `pass` (`vialOffers=20`, `totalOffers=21`, `vialShare=95.2%`, threshold `>=80%` with `minOffers=10`).
- Drift check: `skip` (first baseline capture; no prior run snapshot).
- Top-compound smoke: `skip` during baseline capture (`missing baseline`).
- New standalone smoke command: `npm run job:smoke-top-compounds`.
- Follow-up smoke run after baseline capture: `pass` (`comparedCompounds=10`, `failureCount=0`, baseline run `fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`).

## Guardrail Drift Verification Rerun (2026-02-16, post-baseline comparison)
### Vendors job (`8807da2b-e1d4-4ad9-93c0-15bf66999254`)
- `status=partial`
- `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `policyBlocked=0`
- `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=1243`, `offersExcludedByRule=0`
- `unresolvedAliases=0`, `aliasesSkippedByAi=668`, `aiTasksQueued=1`
- Runtime window: `2026-02-16T22:04:37.015Z` -> `2026-02-16T22:14:38.015Z` (~`601.0s`)

### Guardrail summary (`scrape_runs.summary.qualityGuardrails`)
- Invariant `bpc157_10mg_vial_majority`: `pass` (`vialOffers=20`, `totalOffers=21`, `vialShare=95.2%`).
- Drift check: `pass` (`drop=0`, baseline run `fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`).
- Top-compound smoke: `pass` (`comparedCompounds=10`, baseline run `fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`, no failures).
- Run-level timing totals:
  - `discoveryNetworkMs=55524` (`woo=49852`, `shopify=1442`, `html=4230`, `firecrawl=0`)
  - `aliasDeterministicMs=252041`
  - `aliasAiMs=0`
  - `dbPersistenceMs=864088`

### Post-run triage/smoke
- `npm run job:review-ai -- --limit=50`: `itemsScanned=0`, `leftOpen=0`.
- `npm run job:smoke-top-compounds`: `pass` (`comparedCompounds=10`, `failureCount=0`, baseline run `8807da2b-e1d4-4ad9-93c0-15bf66999254`).
- Next targeted remediation: stabilize transient DB connection resets (`read ECONNRESET`) in vendor-job write paths so full 38-page robustness cycles can complete consistently.

## Coverage Delta
- Previous expansion baseline: `18` active vendors / `26` active vendor pages.
- Current coverage after reseed: `30` active vendors / `38` active vendor pages.
- Vendors with active offers after run: `29`.

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
