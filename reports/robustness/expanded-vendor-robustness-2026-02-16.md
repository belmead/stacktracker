# Expanded Vendor Robustness Report (2026-02-16)

## Continuation Snapshot (2026-02-20, security dependency remediation + Security CI pass)
### Security dependency update
- Applied smallest safe dependency strategy for the vulnerability gate:
  - upgraded `vitest` to `^4.0.18`;
  - upgraded `@vitest/coverage-v8` to `^4.0.18`;
  - added npm override `minimatch: ^10.2.2` to eliminate high-severity transitive `minimatch` advisories.
- Runtime ingestion/app dependencies and behavior remain unchanged (`next`/scraper stack unchanged).

### Verification cycle (post-remediation)
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`80` tests)
- `npm audit --audit-level=high`: pass (`high=0`, `critical=0`, `moderate=9`)

### Security CI runtime validation status
- Branch push commit: `47fe6997ac03d1edb23914d8a4a04c60377908d1`.
- Workflow run: `22238481016` ([Security CI](https://github.com/belmead/stacktracker/actions/runs/22238481016)).
- `Secret Scan (gitleaks)`: pass.
- `Dependency Vulnerability Gate`: pass (`npm audit --audit-level=high`).
- Gate log now reports only moderate advisories in ESLint/AJV chains (`9` moderate), with no high/critical findings.

### Robustness-cycle rerun decision
- Skipped `job:vendors`, `job:review-ai -- --limit=50`, and `job:smoke-top-compounds` in this pass because remediation touched only dev-toolchain/transitive dependencies (no runtime scraping/job logic changes).

## Continuation Snapshot (2026-02-20, moderate-advisory policy governance)
### Policy update
- Added dependency-security policy document: `SECURITY.md`.
- Added tracked exception registry for dev-only moderates: `security/moderate-advisory-exceptions.json`.
- Added enforcement script: `scripts/security/enforce-moderate-advisories.mjs`.
- Security CI dependency gate now enforces:
  - `npm audit --audit-level=high` (block high/critical across all deps),
  - `npm audit --omit=dev --audit-level=moderate` (block moderate+ in production deps),
  - `node scripts/security/enforce-moderate-advisories.mjs` (require tracked owner/ticket/expiry for remaining moderates).

### Verification cycle (policy)
- `npm audit --audit-level=high`: pass (`high=0`, `critical=0`)
- `npm audit --omit=dev --audit-level=moderate`: pass (`0` production vulnerabilities)
- `npm run security:check-moderates`: pass (`moderate=9`, `tracked=9`, `missing=0`, `expired=0`)

### Security CI runtime validation status
- Latest validated run: `22239230993` ([Security CI](https://github.com/belmead/stacktracker/actions/runs/22239230993)).
- `Secret Scan (gitleaks)`: pass.
- `Dependency Vulnerability Policy Gate`: pass.

## Continuation Snapshot (2026-02-20, robustness rerun + live suppression validation + Finnrick ratings range)
### Code/policy update
- Deterministic `network_filter_blocked` queue handling uses hybrid suppression:
  - compute/store `networkFilterSignature` on parse-failure/event payloads;
  - suppress repeated identical triaged queue inserts for `(vendor_id, page_url, reason, networkFilterSignature)` within cooldown window (`NETWORK_FILTER_BLOCKED_QUEUE_SUPPRESSION_DAYS`, default `14`);
  - preserve visibility via emitted `NETWORK_FILTER_BLOCKED` events and `parseFailureQueueSuppressed` metadata.
- Finnrick ingestion now parses the `Ratings range` column directly and stores/serves textual labels (`A`, `A to C`, `N/A`) for UI display.

### Robustness cycle
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`80` tests)
- `npm run job:vendors`:
  - run `89043ac0-e797-49c2-9755-7f928a203c6a`
  - status `partial`
  - `pagesTotal=53`, `pagesSuccess=31`, `pagesFailed=22`
  - `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=823`
  - `offersExcludedByRule=328`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=370`, `aiTasksQueued=22`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`, `leftOpen=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline run `89043ac0-e797-49c2-9755-7f928a203c6a`)
- Live suppression-validation run (vendor-scoped):
  - `c1f47324-133c-4ff5-826f-a98f82392fa4` (`Amino Asylum`)
  - outcome: `NETWORK_FILTER_BLOCKED` event emitted with `parseFailureQueueSuppressed=true`; no new open parse-failure queue row created.

### Event profile in run `89043ac0-e797-49c2-9755-7f928a203c6a`
- `ALIAS_SKIPPED_AI=370`
- `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT=328`
- `DISCOVERY_ATTEMPT_FAILED=126`
- `DISCOVERY_SOURCE=31`
- `NETWORK_FILTER_BLOCKED=21`
- `DISCOVERY_REUSED_ORIGIN=7`
- `INVALID_PRICING_PAYLOAD=1`

### Queue/coverage snapshot after rerun
- Alias queue (`queue_type='alias_match'`): `open=0`, `in_progress=0`, `resolved=466`, `ignored=432`
- Parse-failure queue (`queue_type='parse_failure'`): `open=21`
  - `network_filter_blocked=20`
  - `invalid_pricing_payload=1`
  - `discovery_fetch_failed=0` (prior `elitepeptides.com` outlier reclassified/triaged)
- Network-filter signature completeness on open blocked rows: `20/20`.
- Coverage remains `45` active vendors / `53` active vendor pages.
- `thymosin-alpha-1` coverage: `27` vendors / `28` active offers.

### Finnrick status
- `npm run job:finnrick`:
  - run `28ce6525-14ce-4cfc-b043-83f9440944ea`
  - status `success`
  - `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`
  - latest-vendor labels include `0` numeric-style (`x/5`) values.

### Security CI runtime validation status
- `gh` auth is valid (`repo` + `workflow` scopes).
- Branch push triggered `Security CI` run `22238026251`.
- `Secret Scan (gitleaks)`: pass.
- `Dependency Vulnerability Gate`: fail at `npm audit --audit-level=high` (`20` vulnerabilities: `1` moderate, `19` high; `ajv`/`minimatch` advisories via ESLint-related dependency chains).

## Continuation Snapshot (2026-02-17, rerun + legacy queue cleanup + Finnrick sync)
### Robustness cycle
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`78` tests)
- `npm run job:vendors`:
  - run `2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3`
  - status `partial`
  - `pagesTotal=53`, `pagesSuccess=32`, `pagesFailed=21`
  - `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=849`
  - `offersExcludedByRule=325`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=376`, `aiTasksQueued=21`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`, `leftOpen=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline run `2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3`)

### Parse-failure queue cleanup
- Legacy open `no_offers_found` rows (`4`) were resolved/ignored:
  - `http://eliteresearchusa.com/`
  - `https://eliteresearchusa.com/products`
  - `https://www.alphagresearch.com/`
  - `https://dragonpharmastore.com/`
- Update tag: `resolved_by='system_legacy_no_offers_cleanup'`.
- Open parse-failure queue now:
  - `open=21` (`network_filter_blocked=20`, `invalid_pricing_payload=1`)

### Event profile in run `2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3`
- `NETWORK_FILTER_BLOCKED=20`
- `DISCOVERY_ATTEMPT_FAILED=120`
- `INVALID_PRICING_PAYLOAD=1`
- `ALIAS_SKIPPED_AI=376`
- `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT=325`
- `QUALITY_INVARIANT_EVALUATED=1`
- `TOP_COMPOUND_SMOKE_EVALUATED=1`

### Invariant/smoke verification
- `thymosin-alpha-1` remains stable at `27` vendors / `27` active offers.
- Guardrail summary remains pass-only (`criticalFailures=[]`).

### Security CI validation status
- Workflow file remains configured at `.github/workflows/security-ci.yml` for:
  - full-history `gitleaks` scan
  - dependency gate `npm audit --audit-level=high`
- Local gate command result in this pass:
  - `npm audit --audit-level=high` -> `0` vulnerabilities
- Remote run-status validation caveat:
  - `gh` CLI is unauthenticated in this environment, so GitHub Actions run/log confirmation is blocked until `gh auth login`.

### Finnrick sync
- `npm run job:finnrick` executed per explicit request:
  - run `084b323c-6472-4554-b11f-d0aa19f0889c`
  - status `success`
  - `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`

## Continuation Snapshot (2026-02-17, network-filter classification + parse-failure dedupe)
### Robustness cycle
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`78` tests)
- `npm run job:vendors`:
  - run `44b03125-50f7-4e89-b1a5-28e35d8ddba1`
  - status `partial`
  - `pagesTotal=53`, `pagesSuccess=32`, `pagesFailed=21`
  - `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=849`
  - `offersExcludedByRule=325`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=376`, `aiTasksQueued=21`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`, `leftOpen=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline run `44b03125-50f7-4e89-b1a5-28e35d8ddba1`)

### Regression-cluster diagnosis update (20 pages)
- Deterministic root-cause evidence now captured:
  - affected roots return all-source transport failures (`fetch failed | read ECONNRESET | code=ECONNRESET`) in discovery attempts;
  - follow-up HTTP probes detect Meraki blocked redirects (`wired.meraki.com/blocked.cgi`, category `bs_047`) for the same domains.
- Classification update shipped:
  - no-offers fallback for this signature is now `NETWORK_FILTER_BLOCKED` / `network_filter_blocked` / `no_data_network_filter_blocked`.
  - non-probeable transport failures still fall back to `DISCOVERY_FETCH_FAILED`.
- Metadata payload quality for blocked roots now includes:
  - `networkFilterProvider`, `networkFilterCategory`, `networkFilterLocation`
  - `networkFilterBlockedServer`, `networkFilterBlockedUrl`
  - `networkFilterStatus`, `networkFilterProbeUrl`
  - `discoveryFetchFailedSources`, `discoveryFetchFailedErrors`

### Event + queue deltas
- Event counts in run `44b03125-50f7-4e89-b1a5-28e35d8ddba1`:
  - `NETWORK_FILTER_BLOCKED=20`
  - `DISCOVERY_ATTEMPT_FAILED=120`
  - `INVALID_PRICING_PAYLOAD=1`
  - `DISCOVERY_SOURCE=32`
  - `DISCOVERY_REUSED_ORIGIN=7`
- Parse-failure queue after dedupe hardening + one-time cleanup:
  - `open=25` (`network_filter_blocked=20`, `invalid_pricing_payload=1`, `no_offers_found=4`)
  - dedupe cleanup effect: `96 -> 25` open rows (`71` duplicates marked `ignored`, `resolved_by='system_parse_failure_dedupe'`).
- Metadata completeness:
  - `network_filter_blocked`: `20/20` complete (`provider/category/location` present)
  - `safe_mode_cloudflare_blocked`: `0/0` open in current queue

### Residual open parse-failure rows (legacy no-offers targets)
- `no_offers_found` rows left open (`4`) are historical targets outside the current 20-page cluster:
  - `https://dragonpharmastore.com/`
  - `https://www.alphagresearch.com/`
  - `https://eliteresearchusa.com/products`
  - `http://eliteresearchusa.com/`

## Continuation Snapshot (2026-02-17, transport-failure reclassification + rerun)
### Robustness cycle
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`77` tests)
- `npm run job:vendors`:
  - run `7512b41f-ee44-4e86-9e1f-b7a4daf786e2`
  - status `partial`
  - `pagesTotal=53`, `pagesSuccess=32`, `pagesFailed=21`
  - `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=849`
  - `offersExcludedByRule=325`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=376`, `aiTasksQueued=21`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`, `leftOpen=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline run `7512b41f-ee44-4e86-9e1f-b7a4daf786e2`)

### Regression-cluster diagnosis (20 pages)
- Existing `NO_OFFERS` cluster root cause is now explicit:
  - all affected pages failed all three discovery sources with transport errors (now logged as `fetch failed | read ECONNRESET | code=ECONNRESET`);
  - this is not currently a parsing/selector mismatch signature.
- Code/runtime hardening now applied:
  - worker retries discovery once on all-source transport-failure signatures before fallback;
  - unresolved repeats are now classified as `DISCOVERY_FETCH_FAILED` with parse-failure reason `discovery_fetch_failed`;
  - parse-failure payload now stores complete source/error arrays for deterministic triage.

### Event + queue deltas
- Event counts in run `7512b41f-ee44-4e86-9e1f-b7a4daf786e2`:
  - `DISCOVERY_FETCH_FAILED=20`
  - `DISCOVERY_ATTEMPT_FAILED=120` (first pass + retry pass attempt logs)
  - `INVALID_PRICING_PAYLOAD=1`
  - `DISCOVERY_SOURCE=32`
  - `DISCOVERY_REUSED_ORIGIN=7`
- Parse-failure queue snapshot after rerun:
  - `open=75` (`discovery_fetch_failed=20`, `invalid_pricing_payload=8`, `no_offers_found=44`, `safe_mode_cloudflare_blocked=3`)
- Metadata completeness checks:
  - cloudflare blocked rows: `3/3` complete (`safeModeBlockProvider/status/source` present)
  - discovery-fetch-failed rows from this run: `20/20` complete (`discoveryFetchFailedSources` + `discoveryFetchFailedErrors` arrays present)

### Failed-page profile in run `7512b41f-ee44-4e86-9e1f-b7a4daf786e2`
- `DISCOVERY_FETCH_FAILED` (`20`):
  - `https://aminoasylumllc.com/`
  - `https://amplifypeptides.com/`
  - `https://atomiklabz.com/`
  - `https://biolongevitylabs.com/`
  - `https://www.biopepz.net/`
  - `https://coastalpeptides.com/`
  - `https://crushresearch.com/`
  - `https://dragonpharmastore.com/64-peptides`
  - `https://elitepeptides.com/`
  - `https://erospeptides.com/`
  - `https://hkroids.com/`
  - `https://kits4less.com/`
  - `https://peptidesworld.com/`
  - `https://purapeptides.com/`
  - `https://purepeptidelabs.shop/`
  - `https://purepeps.com/`
  - `https://purerawz.co/`
  - `https://simplepeptide.com/`
  - `https://thepeptidehaven.com/`
  - `https://trustedpeptide.net/`
- `INVALID_PRICING_PAYLOAD` (`1`):
  - `https://peptiatlas.com/`

## Continuation Snapshot (2026-02-17, smoke-fix rerun + queue closure)
### Smoke regression remediation (`thymosin-alpha-1 24 -> 0`)
- Root cause identified:
  - Smoke comparator used only current top-`N` coverage snapshot.
  - Baseline-tracked `thymosin-alpha-1` fell outside current top-`N` rank and was interpreted as missing (`0`) despite active coverage.
- Deterministic fix shipped:
  - Added baseline-slug hydration helpers in `lib/scraping/quality-guardrails.ts`:
    - `getMissingSmokeCoverageSlugs`
    - `mergeCoverageSnapshots`
  - Vendor guardrail flow now fetches current coverage for baseline-tracked compounds missing from current top snapshot before smoke evaluation.
  - Standalone smoke script (`scripts/run-top-compounds-smoke-test.ts`) now uses the same hydration logic.
  - Regression tests added in `tests/unit/quality-guardrails.test.ts`.
- Validation:
  - Current live coverage for `thymosin-alpha-1`: `27` vendors / `27` active offers.
  - Vendor run `425efba4-127e-4792-903d-8113bf45c206` smoke status: `pass` (`failures=[]`).

### Manual alias adjudication closure
- Manually ignored all 14 open `ai_review_cached` alias items (strict peptide scope):
  - Amplify Peptides: `SYN-31 10mg`, `HN-24 10mg`, `SNP-8 10mg`, `PNL-3 20mg`
  - Amino Asylum: `T2 200MCG/ML`, `Prami`, `Adex`, `Stampede`, `PYRO 7MG`, `Helios`, `GAC EXTREME`
  - Crush Research: `Triple Agonist 15mg : Single`
  - Peptides World: `P-21-10Mg`, `Adipotide-FTPP 10mg`
- Verification run:
  - `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`.
- Queue state after closure:
  - `alias_match`: `open=0`, `resolved=466`, `ignored=432`.

### Parse-failure queue triage hardening
- Open parse-failure audit:
  - `open=33` at start of pass (`invalid_pricing_payload=6`, `no_offers_found=24`, `safe_mode_cloudflare_blocked=3`).
- Metadata hygiene:
  - Two legacy open cloudflare-block rows were missing provider/status/source fields.
  - Backfilled those rows from stored error text; open cloudflare-block entries now metadata-complete (`3/3`).
- Post-rerun parse-failure queue:
  - `open=54` (`invalid_pricing_payload=7`, `no_offers_found=44`, `safe_mode_cloudflare_blocked=3`).

### Robustness cycle (this pass)
- `npm run typecheck`: pass
- `npm run lint`: pass
- `npm run test`: pass (`74` tests)
- `npm run job:vendors`:
  - run `425efba4-127e-4792-903d-8113bf45c206`
  - status `partial`
  - `pagesTotal=53`, `pagesSuccess=32`, `pagesFailed=21`
  - `offersCreated=1`, `offersUpdated=29`, `offersUnchanged=822`
  - `offersExcludedByRule=325`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=376`, `aiTasksQueued=21`
  - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
- `npm run job:review-ai -- --limit=50`: pass (`itemsScanned=0`)
- `npm run job:smoke-top-compounds`: pass (`failureCount=0`, baseline run `425efba4-127e-4792-903d-8113bf45c206`)

### Failed-page profile in run `425efba4-127e-4792-903d-8113bf45c206`
- `INVALID_PRICING_PAYLOAD`: `https://peptiatlas.com/` (expected).
- `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`no_offers_found` payload reason) on:
  - `https://aminoasylumllc.com/`
  - `https://amplifypeptides.com/`
  - `https://atomiklabz.com/`
  - `https://biolongevitylabs.com/`
  - `https://www.biopepz.net/`
  - `https://coastalpeptides.com/`
  - `https://crushresearch.com/`
  - `https://dragonpharmastore.com/64-peptides`
  - `https://elitepeptides.com/`
  - `https://erospeptides.com/`
  - `https://hkroids.com/`
  - `https://kits4less.com/`
  - `https://peptidesworld.com/`
  - `https://purapeptides.com/`
  - `https://purepeptidelabs.shop/`
  - `https://purepeps.com/`
  - `https://purerawz.co/`
  - `https://simplepeptide.com/`
  - `https://thepeptidehaven.com/`
  - `https://trustedpeptide.net/`

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
