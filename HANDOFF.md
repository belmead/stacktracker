# Stack Tracker Handoff Note

## Snapshot
- Date: 2026-02-20
- Project path: `/Users/belmead/Documents/stacktracker`
- Environment: host DNS/network healthy; restricted Codex sandboxes can still produce false `ENOTFOUND` for networked jobs.
- App status: app/typecheck/lint/tests are operational; vendor ingestion includes deterministic network-filter signature suppression, and Finnrick now stores/displays textual rating ranges.
- Most recent full vendor run: `89043ac0-e797-49c2-9755-7f928a203c6a` (`status=partial`, `pagesTotal=53`, `pagesSuccess=31`, `pagesFailed=22`, `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=823`, `offersExcludedByRule=328`, `unresolvedAliases=0`, `aliasesSkippedByAi=370`, `aiTasksQueued=22`, guardrails `invariant=pass`, `drift=pass`, `smoke=pass`).
- Most recent scoped validation run: `c1f47324-133c-4ff5-826f-a98f82392fa4` (`vendor-scoped`, `status=partial`, `pagesTotal=1`, `pagesFailed=1`, `NETWORK_FILTER_BLOCKED` with `parseFailureQueueSuppressed=true`).
- Most recent smoke baseline run: `89043ac0-e797-49c2-9755-7f928a203c6a` (`job:smoke-top-compounds` `failureCount=0`).
- Prior smoke-regression run (historical): `e0a4b0fc-2063-4c38-9ac5-e01d271deaa4` (`smoke=fail`, `thymosin-alpha-1` `24 -> 0` false drop due comparator bug).
- Most recent pre-remediation full run (historical): `96ade0dc-cd5d-47aa-859d-064fe416eec6` (`status=partial`, `pagesSuccess=41`, `pagesFailed=4`).
- Most recent Finnrick run: `28ce6525-14ce-4cfc-b043-83f9440944ea` (`vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`).
- Finnrick rating labels now align to Finnrick `Ratings range` strings (`A`, `A to C`, `N/A`); latest-vendor labels include `0` numeric-style values.
- Alias triage queue (`queue_type='alias_match'`): `open=0`, `in_progress=0`, `resolved=466`, `ignored=432`.
- Parse-failure queue (`queue_type='parse_failure'`): `open=21` (`network_filter_blocked=20`, `invalid_pricing_payload=1`).
- `discovery_fetch_failed` open rows: `0` (prior `elitepeptides.com` row reclassified/triaged).
- Current seeded coverage: `45` active vendors / `53` active vendor pages.
- Quality checks currently passing in this pass: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run job:vendors`, `npm run job:review-ai -- --limit=50`, `npm run job:smoke-top-compounds`.
- Operational note: security workflow runtime verification now depends on remote push/run availability.

## Continuation Update (2026-02-20, robustness rerun + live suppression validation + Finnrick ratings range)
- Robustness cycle executed:
  - `npm run typecheck` -> pass
  - `npm run lint` -> pass
  - `npm run test` -> pass (`80` tests)
  - `npm run job:vendors` -> `89043ac0-e797-49c2-9755-7f928a203c6a` (`status=partial`, guardrails `invariant=pass`, `drift=pass`, `smoke=pass`)
  - `npm run job:review-ai -- --limit=50` -> pass (`itemsScanned=0`)
  - `npm run job:smoke-top-compounds` -> pass (`failureCount=0`, baseline `89043ac0-e797-49c2-9755-7f928a203c6a`)
- Full-run event profile (`89043ac0-e797-49c2-9755-7f928a203c6a`):
  - `NETWORK_FILTER_BLOCKED=21`
  - `DISCOVERY_ATTEMPT_FAILED=126`
  - `INVALID_PRICING_PAYLOAD=1`
  - `ALIAS_SKIPPED_AI=370`
  - `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT=328`
- Live suppression verification (deterministic blocked signature):
  - Manually triaged `Amino Asylum` open parse-failure row (`resolved_by='system_live_suppression_validation'`) to create a deterministic validation window.
  - Ran vendor-scoped job `c1f47324-133c-4ff5-826f-a98f82392fa4` for `Amino Asylum`.
  - Verified outcome:
    - event visibility preserved (`NETWORK_FILTER_BLOCKED` emitted with full `networkFilter*` metadata),
    - queue churn suppressed (`parseFailureQueueSuppressed=true`),
    - no replacement open parse-failure row created for `https://aminoasylumllc.com/`.
- Outlier remediation status:
  - Prior `discovery_fetch_failed` outlier (`https://elitepeptides.com/`) is no longer open.
  - Current path classifies as deterministic `network_filter_blocked` (consistent with the 20-page blocked cohort).
- Finnrick ratings-range rollout:
  - Re-ran Finnrick sync: `28ce6525-14ce-4cfc-b043-83f9440944ea` (`status=success`).
  - Parser/UI now surface Finnrick `Ratings range` labels (`A`, `A to C`, `N/A`) instead of numeric display.
  - Latest-per-vendor label audit: `numeric-like labels = 0`.
- Security CI remote validation (post-push):
  - Branch pushed to GitHub (`codex/mvp-scaffold`, commit `cf5686f4c1c7e6dc187e9f583494d581aaef64bb`).
  - Workflow run: `22237905231` ([Security CI](https://github.com/belmead/stacktracker/actions/runs/22237905231)).
  - `Secret Scan (gitleaks)`: pass.
  - `Dependency Vulnerability Gate`: fail at `npm audit --audit-level=high` with `20` vulnerabilities (`1 moderate`, `19 high`) rooted in `ajv`/`minimatch` via ESLint-related dependency chains.
  - Local re-check now matches remote failure (`npm audit --audit-level=high` exits non-zero with the same advisories).

## Continuation Update (2026-02-20, hybrid network-filter queue suppression + robustness rerun)
- Deterministic `network_filter_blocked` queue-noise suppression policy shipped:
  - New `networkFilterSignature` fingerprint is computed from deterministic blocked-site metadata (`provider/category/blockedServer/blockedHost/status`) and stored on parse-failure payloads/events.
  - Worker now checks recent triaged parse-failure history for identical `(vendor_id, page_url, reason, networkFilterSignature)` and suppresses repeated queue inserts for a configurable cooldown window.
  - Visibility is preserved:
    - event emission remains unchanged (`NETWORK_FILTER_BLOCKED` still recorded);
    - event payload now includes `networkFilterSignature` and `parseFailureQueueSuppressed`.
  - Safety scope:
    - suppression applies only to deterministic `network_filter_blocked`;
    - existing open/in-progress parse-failure dedupe behavior remains unchanged.
- New runtime config:
  - `NETWORK_FILTER_BLOCKED_QUEUE_SUPPRESSION_DAYS` (default `14`) in `.env.example` / env parsing.
- Regression coverage added:
  - `tests/unit/worker-no-offers.test.ts` now validates both:
    - non-suppressed `network_filter_blocked` path (queue row created with signature metadata),
    - suppressed repeated-signature path (queue row skipped, event still emitted with suppression marker).
- Robustness cycle executed:
  - `npm run typecheck` -> pass
  - `npm run lint` -> pass
  - `npm run test` -> pass (`79` tests)
  - `npm run job:vendors` -> `99ba0dab-5eec-4836-a078-44eb46a1d835` (`status=partial`, guardrails `invariant=pass`, `drift=pass`, `smoke=pass`)
  - `npm run job:review-ai -- --limit=50` -> pass (`itemsScanned=0`)
  - `npm run job:smoke-top-compounds` -> pass (`failureCount=0`, baseline `99ba0dab-5eec-4836-a078-44eb46a1d835`)
- Latest run event profile (`99ba0dab-5eec-4836-a078-44eb46a1d835`):
  - `NETWORK_FILTER_BLOCKED=20`
  - `DISCOVERY_FETCH_FAILED=1`
  - `DISCOVERY_ATTEMPT_FAILED=126`
  - `INVALID_PRICING_PAYLOAD=1`
  - `ALIAS_SKIPPED_AI=370`
  - `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT=328`
- Queue/coverage checks after rerun:
  - `network_filter_blocked` signatures populated on open rows: `20/20`.
  - parse-failure open reasons: `network_filter_blocked=20`, `discovery_fetch_failed=1` (`Elite Peptides`), `invalid_pricing_payload=1`.
  - `thymosin-alpha-1` coverage: `27` vendors / `28` active offers.
- Security CI remote validation update:
  - `gh auth status` is now authenticated (`repo` + `workflow` scopes present).
  - Remote repository currently has no Actions workflows/runs (`gh workflow list --repo belmead/stacktracker` -> empty; `.github/workflows` path absent remotely), so `Security CI` run/log validation is blocked until workflow files are pushed to GitHub.

## Continuation Update (2026-02-17, robustness rerun + Finnrick sync)
- Queue cleanup action:
  - Resolved legacy open parse-failure rows (`no_offers_found`) from remediated/historical targets:
    - `http://eliteresearchusa.com/`
    - `https://eliteresearchusa.com/products`
    - `https://www.alphagresearch.com/`
    - `https://dragonpharmastore.com/`
  - Applied status update: `ignored`, `resolved_by='system_legacy_no_offers_cleanup'`.
  - Parse-failure open queue changed `25 -> 21`.
- Robustness cycle executed:
  - `npm run typecheck` -> pass
  - `npm run lint` -> pass
  - `npm run test` -> pass (`78` tests)
  - `npm run job:vendors` -> `2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3` (`status=partial`, guardrails `invariant=pass`, `drift=pass`, `smoke=pass`)
  - `npm run job:review-ai -- --limit=50` -> pass (`itemsScanned=0`)
  - `npm run job:smoke-top-compounds` -> pass (`failureCount=0`, baseline `2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3`)
- Latest run event profile (`2aa45eb9-ab35-4c17-a334-ff1ef4e6c6b3`):
  - `NETWORK_FILTER_BLOCKED=20`
  - `DISCOVERY_ATTEMPT_FAILED=120`
  - `INVALID_PRICING_PAYLOAD=1`
  - `ALIAS_SKIPPED_AI=376`
  - `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT=325`
- Metadata quality:
  - open `network_filter_blocked` rows remain metadata-complete (`20/20` provider/category/location populated).
- Security CI validation status:
  - Local gate command passes: `npm audit --audit-level=high` (`0` vulnerabilities).
  - GitHub Actions runtime validation remains blocked in this environment because `gh` is unauthenticated (`gh auth status` prompts login).
- Finnrick sync executed (explicitly requested):
  - `npm run job:finnrick` -> `084b323c-6472-4554-b11f-d0aa19f0889c` (`status=success`)
  - summary: `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17` (`N/A` path expected for unmatched vendors).

## Continuation Update (2026-02-17, network-filter classification + parse-failure dedupe)
- Root-cause confirmation for the 20-page regression cluster:
  - Live probes from this environment show deterministic network-filter redirects on affected roots (Meraki `blocked.cgi` with category `bs_047`) rather than parser drift.
  - Affected roots include `aminoasylumllc.com`, `kits4less.com`, `purerawz.co`, `simplepeptide.com`; control target `alphagresearch.com/shop-1` remains reachable.
- Deterministic no-offers classification hardening shipped:
  - Worker now probes `http://<hostname>/` when all discovery sources fail on transport and classifies Meraki-style blocks as:
    - parse-failure reason `network_filter_blocked`
    - page status `no_data_network_filter_blocked`
    - event code `NETWORK_FILTER_BLOCKED`
  - Payload metadata now includes:
    - `networkFilterProvider`, `networkFilterCategory`, `networkFilterLocation`
    - `networkFilterBlockedServer`, `networkFilterBlockedUrl`
    - `networkFilterStatus`, `networkFilterProbeUrl`
  - Existing `discovery_fetch_failed` fallback remains for non-probeable transport failures.
- Parse-failure queue quality hardening shipped:
  - `createReviewQueueItem` now dedupes `parse_failure` rows by `(queue_type, vendor_id, page_url)` when status is `open|in_progress`.
  - One-time cleanup was applied to existing open parse-failure duplicates:
    - before: `96`
    - deduped rows marked `ignored` with `resolved_by='system_parse_failure_dedupe'`: `71`
    - after: `25`
- Latest run validation (`44b03125-50f7-4e89-b1a5-28e35d8ddba1`):
  - guardrails remain `invariant=pass`, `drift=pass`, `smoke=pass`.
  - event profile includes `NETWORK_FILTER_BLOCKED=20`, `DISCOVERY_ATTEMPT_FAILED=120`, `INVALID_PRICING_PAYLOAD=1`.
  - `NO_OFFERS` no longer carries the 20-page regression cluster in this run.
- Metadata completeness checks:
  - `network_filter_blocked`: `20/20` open rows complete (`provider/category/location` present).
  - `safe_mode_cloudflare_blocked`: `0/0` currently open.
- `thymosin-alpha-1` smoke integrity remains stable at `27` vendors / `27` active offers.

## Continuation Update (2026-02-17, discovery fetch-failure classification + security controls)
- Root cause confirmation for the 20-page regression cluster:
  - Every affected target logged `DISCOVERY_ATTEMPT_FAILED` across all three sources (`woocommerce_store_api`, `shopify_products_api`, `html`) with transport errors (`fetch failed | read ECONNRESET | code=ECONNRESET`).
  - This was not a parser mismatch; it was a repeated transport failure pattern that had been misbucketed as `no_offers_found`.
- Deterministic scraping/triage fixes shipped:
  - Added shared access-block utilities in `lib/scraping/access-blocks.ts` and wired them into both HTML and API fetch paths.
  - Discovery now records full error cause chains (message + nested cause + error code) instead of opaque `fetch failed`.
  - Worker now retries discovery once when all first-pass sources fail on network transport.
  - Worker now classifies unresolved all-source transport failures as:
    - event code `DISCOVERY_FETCH_FAILED`
    - parse-failure reason `discovery_fetch_failed`
    - page status `no_data_fetch_failed`
    - metadata payload with full failing source/error arrays.
- Smoke reliability hardening update:
  - Guardrail report snapshots now persist hydrated smoke coverage (`topCompoundCoverageSnapshot: smokeCurrentCoverage`) so baseline continuity keeps baseline-tracked compounds available for future comparisons.
- Parse-failure metadata quality:
  - Blocked-site metadata remains complete for open cloudflare rows (`3/3` provider/status/source).
  - New transport-failure rows are metadata-complete (`20/20` with populated `discoveryFetchFailedSources` + `discoveryFetchFailedErrors`).
- Security controls implemented in code:
  - Added CI security workflow `.github/workflows/security-ci.yml`:
    - `gitleaks` full git-history secret scan.
    - dependency vulnerability gate (`npm audit --audit-level=high`).
  - Added runtime payload redaction utility `lib/security/redaction.ts`; `recordScrapeEvent` and `createReviewQueueItem` now redact secrets/tokens/cookies before persistence.
  - Added runtime least-privilege credential guard:
    - optional `DATABASE_RUNTIME_USER` assertion in `lib/db/client.ts`.
    - optional `DATABASE_ADMIN_URL` split for bootstrap/import scripts (`scripts/db-bootstrap.ts`, `scripts/import-compound-categories.ts`).
  - Security/vuln baseline updated by dependency patch:
    - upgraded `next` and `eslint-config-next` to `15.5.12`.
    - `npm audit --audit-level=high` now reports `0` vulnerabilities.
- Robustness cycle results in this pass:
  - `npm run typecheck` -> pass
  - `npm run lint` -> pass
  - `npm run test` -> pass (`77` tests)
  - `npm run job:vendors` -> `7512b41f-ee44-4e86-9e1f-b7a4daf786e2` (`status=partial`, guardrails all pass, `pagesFailed=21`)
  - `npm run job:review-ai -- --limit=50` -> pass (`itemsScanned=0`)
  - `npm run job:smoke-top-compounds` -> pass (`failureCount=0`, baseline `7512b41f-ee44-4e86-9e1f-b7a4daf786e2`)
- Current known failing-page profile in latest run:
  - `discovery_fetch_failed` (20): `Amino Asylum`, `Amplify Peptides`, `Atomik Labz`, `BioLongevity Labs`, `BioPepz`, `Coastal Peptides`, `Crush Research`, `Dragon Pharma Store (/64-peptides)`, `Elite Peptides`, `Eros Peptides`, `HK Roids`, `Kits4Less`, `Peptides World`, `Pura Peptides`, `Pure Peptide Labs`, `PurePeps`, `PureRawz`, `Simple Peptide`, `The Peptide Haven`, `Trusted Peptide`.
  - `invalid_pricing_payload` (1): `https://peptiatlas.com/` (expected).

## Continuation Update (2026-02-17, smoke-fix rerun + queue closure)
- Manual alias adjudication completed:
  - Ignored all 14 open `ai_review_cached` aliases (strict peptide scope preserved).
  - Verification: `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, alias queue remains closed (`open=0`).
- Smoke regression (`thymosin-alpha-1 24 -> 0`) root cause + fix:
  - Root cause: smoke comparator evaluated against current top-`N` snapshot only; baseline-tracked compounds falling outside current top-`N` were interpreted as `0`.
  - Fix shipped in both vendor guardrails and standalone smoke script:
    - added `getMissingSmokeCoverageSlugs` and `mergeCoverageSnapshots` in `lib/scraping/quality-guardrails.ts`;
    - hydrated current coverage for baseline-tracked missing slugs before smoke evaluation.
  - Regression coverage added in `tests/unit/quality-guardrails.test.ts`.
  - Validation: live `thymosin-alpha-1` coverage is `27` vendors / `27` active offers; latest vendor run smoke status is `pass`.
- Parse-failure queue hardening:
  - Audited open parse-failure reasons: `invalid_pricing_payload=6`, `no_offers_found=24`, `safe_mode_cloudflare_blocked=3` at start of pass.
  - Backfilled two legacy open cloudflare-block rows missing provider/status/source fields; open cloudflare-block rows now metadata-complete (`3/3`).
- Robustness cycle results:
  - `npm run typecheck` -> pass
  - `npm run lint` -> pass
  - `npm run test` -> pass (`74` tests)
  - `npm run job:vendors` -> `425efba4-127e-4792-903d-8113bf45c206` (`status=partial`, guardrails all pass, `pagesFailed=21`)
  - `npm run job:review-ai -- --limit=50` -> pass (`itemsScanned=0`)
  - `npm run job:smoke-top-compounds` -> pass (`failureCount=0`, baseline `425efba4-127e-4792-903d-8113bf45c206`)
- Security track kickoff:
  - Added production-security hardening baseline requirements in `README.md` and `PRD.md` (secret hygiene, least-privilege DB creds, CI secret scanning/CVE gating, MFA/audit controls).
- Notable open regression cluster from latest vendor run:
  - 20 storefront roots now emit `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` with reason `no_offers_found` (in addition to expected `PeptiAtlas INVALID_PRICING_PAYLOAD`).
  - Priority next step: isolate why these roots returned empty in this pass (target drift vs extraction/source regression) while many high-volume vendors still succeeded.

## Continuation Update (2026-02-17, onboarding batch 4 + smoke regression)
- New vendor onboarding decisions applied in seed data:
  - Added: `precisionpeptideco.com`, `aminoasylumllc.com`, `elitepeptides.com`, `peptidesworld.com`, `amplifypeptides.com`, `peptidesupplyco.org`, `trustedpeptide.net`, `crushresearch.com`.
  - Removed/not onboarded from historical candidate notes: `Amino Lair`, `UWA Elite Peptides`, `Peptide Worldwide`, `Amplified Amino`, `PurePeptides`.
- Robustness execution:
  - `npm run job:vendors` -> `e0a4b0fc-2063-4c38-9ac5-e01d271deaa4` (`status=failed` on smoke guardrail after ingestion).
  - `npm run job:review-ai -- --limit=200` -> `itemsScanned=14`, `resolved=0`, `ignored=0`, `leftOpen=14` (all `ai_review_cached`).
- Smoke guardrail failure details:
  - Compound: `thymosin-alpha-1`
  - Baseline vendors: `24`
  - Current vendors: `0`
  - Required minimum vendors: `16`
  - Failure mode: 100% drop (`dropPct=1`)
- New-vendor ingestion status (`lastStatus=success` for all 8):
  - `Amino Asylum` (`activeOffers=20`)
  - `Amplify Peptides` (`activeOffers=8`)
  - `Crush Research` (`activeOffers=9`)
  - `Elite Peptides` (`activeOffers=15`)
  - `Peptide Supply Co` (`activeOffers=27`)
  - `Peptides World` (`activeOffers=45`)
  - `Precision Peptide Co` (`activeOffers=22`)
  - `Trusted Peptide` (`activeOffers=5`)
- Current open alias-review items (`queue_type='alias_match'`, `open=14`) to manually adjudicate:
  - Amplify Peptides: `SYN-31 10mg`, `HN-24 10mg`, `SNP-8 10mg`, `PNL-3 20mg`
  - Amino Asylum: `T2 200MCG/ML`, `Prami`, `Adex`, `Stampede`, `PYRO 7MG`, `Helios`, `GAC EXTREME`
  - Crush Research: `Triple Agonist 15mg : Single`
  - Peptides World: `P-21-10Mg`, `Adipotide-FTPP 10mg`
- Current failed pages in this run:
  - `https://kits4less.com/` -> `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`safe_mode_access_blocked`, provider `cloudflare`).
  - `https://peptiatlas.com/` -> `INVALID_PRICING_PAYLOAD` (expected).

## Continuation Update (2026-02-17, post-single-unit policy + storefront remediation)
- Single-unit-only ingestion policy is now active:
  - deterministic exclusion for bulk/pack/kit/multi-vial offers in normalization;
  - exclusions applied before alias/variant/price aggregation in worker persistence;
  - worker emits `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT`.
- Storefront `NO_OFFERS` gaps remediated:
  - `Alpha G Research` retargeted to `https://www.alphagresearch.com/shop-1` and now scrapes successfully.
  - `Dragon Pharma Store` retargeted to `https://dragonpharmastore.com/64-peptides`; PrestaShop-style extractor support added and run now succeeds.
- Kits4Less safe-mode behavior is explicit:
  - Safe-mode access challenge is now classified with provider metadata (`safe_mode_access_blocked`) and Cloudflare compatibility tag (`safe_mode_cloudflare_blocked`) with `cf-ray` context.
  - `NO_OFFERS` event payload includes explicit Cloudflare-block metadata.
- Expected invalid-pricing path remains intact:
  - `https://peptiatlas.com/` continues to emit `INVALID_PRICING_PAYLOAD` / `no_data_invalid_pricing`.
- Regression coverage added for:
  - single-unit filtering (`tests/unit/normalize.test.ts`);
  - PrestaShop extraction (`tests/unit/extractors.test.ts`);
  - Cloudflare no-offers classification and pre-aggregation exclusion behavior (`tests/unit/worker-no-offers.test.ts`).
- Robustness cycle in this pass:
  - pass: `npm run typecheck`
  - pass: `npm run lint`
  - pass: `npm run test` (`71` tests)
  - pass: `npm run job:review-ai -- --limit=50` (`itemsScanned=0`)
  - pass: `npm run job:smoke-top-compounds` (`failureCount=0`, baseline `973e56fa-dd68-4a26-b674-c54cebad5b19`)

## Invalid Pricing + Peptide Price Summary Update (2026-02-16)
- Woo zero-priced payload hardening shipped:
  - Discovery now detects Woo payloads where product candidates exist but all observed prices are zero/empty.
  - Worker now emits `INVALID_PRICING_PAYLOAD` with structured diagnostics and marks page status `no_data_invalid_pricing`.
  - True empty/no-catalog pages still emit `NO_OFFERS` (`no_data`) behavior unchanged.
- Verified production-like diagnostic event:
  - Run: `2981b852-0b96-4c2b-9b68-57344bb8506e`
  - Event code: `INVALID_PRICING_PAYLOAD`
  - Target: `https://peptiatlas.com/`
  - Diagnostic payload highlights: `productsObserved=59`, `productCandidates=59`, `candidatesWithPriceFields=59`, `candidatesWithPositivePrice=0`, sampled product IDs/names with `price/regular_price/sale_price="0"`.
- Regression coverage added:
  - `tests/unit/discovery.test.ts` (Woo invalid-pricing detection)
  - `tests/unit/worker-no-offers.test.ts` (worker event/reporting branch + preserved `NO_OFFERS`)
  - `tests/unit/peptide-page.test.ts` (selected-variant average/low/high render)
- Peptide page UX update:
  - `/peptides/[slug]` now renders selected-variant price summary:
    - `Average price of <size> <formulation> of <compound>: $...`
    - `Low: $... High: $...`
  - Summary values come from vendor-deduped selected-variant list prices (`offers_current` ranked per vendor).
- Robustness commands in this pass:
  - pass: `npm run typecheck`
  - pass: `npm run lint`
  - pass: `npm run test` (`64` tests)
  - blocked: `npm run job:vendors` (multiple attempts failed with DB `read ECONNRESET`)
  - pass: `npm run job:review-ai -- --limit=50` (`itemsScanned=0`)
  - pass: `npm run job:smoke-top-compounds` (`failureCount=0`, baseline `8807da2b-e1d4-4ad9-93c0-15bf66999254`)

## Quality Guardrails Update (2026-02-16, formulation + smoke enforcement)
- Formulation normalization hardening:
  - Mass-unit peptide listings without explicit non-vial form factors (for example `BPC-157 10mg`) now default to `vial`.
  - Offer upsert now falls back to `(vendor_id, product_url)` reconciliation so normalization upgrades (for example `other` -> `vial`) update rows in-place instead of splitting duplicates.
- Runtime quality guardrails added to vendor runs:
  - Invariant: `bpc-157` `10mg` vial-share (`QUALITY_INVARIANT_BPC157_10MG_MIN_OFFERS`, `QUALITY_INVARIANT_BPC157_10MG_MIN_VIAL_SHARE`).
  - Drift alert: run-over-run vial-share drop threshold (`QUALITY_DRIFT_BPC157_10MG_MAX_VIAL_SHARE_DROP`).
  - Smoke test: top-compound vendor-coverage drift (`TOP_COMPOUND_SMOKE_LIMIT`, `TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS`, `TOP_COMPOUND_SMOKE_MAX_VENDOR_DROP_PCT`).
  - Guardrail outputs are persisted under `scrape_runs.summary.qualityGuardrails`; critical guardrail failures now fail vendor jobs.
- Validation runs:
  - Full run with guardrail snapshot: `npm run job:vendors` -> `fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`.
  - Invariant outcome in run summary: `bpc157_10mg_vial_majority = pass` (`vialOffers=20`, `totalOffers=21`, `vialShare=95.2%`).
  - Follow-up drift/smoke verification run: `npm run job:vendors` -> `8807da2b-e1d4-4ad9-93c0-15bf66999254` (`invariant=pass`, `drift=pass`, `smoke=pass`, `baselineInvariantRunId=fb5f63f0-a867-42ba-b9d3-92f450d8b2a7`).
  - New smoke script: `npm run job:smoke-top-compounds` currently passes (`failureCount=0`) with latest baseline snapshot `8807da2b-e1d4-4ad9-93c0-15bf66999254`.

## Stabilization Update (2026-02-16, post-fix rerun)
- Robustness cycle executed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run job:vendors` -> `783e2611-43ed-471f-b493-d572fa6fd49d`
  - bounded triage slices: `npm run job:review-ai -- --limit=50` (x3, final verification pass scanned `0`)
  - no `job:finnrick` run (intentionally deferred)
- Known failing-target outcomes:
  - `https://www.biopepz.net/` now `success` via Wix warmup-data HTML extraction.
  - `https://eliteresearchusa.com/products` now `success` via root-page HTML fallback when target HTML is empty.
  - `https://simplepeptide.com/` now `success`; no discovery-abort regression.
  - `https://purerawz.co/` now `success`; no `SCRAPE_PAGE_ERROR` in rerun.
  - `https://reta-peptide.com/` now `success`; no `SCRAPE_PAGE_ERROR` in rerun.
  - `https://peptiatlas.com/` remains `NO_OFFERS`/`no_data` (Woo payload exposes products but all prices are `0` in Store API responses).
- Queue delta for rerun:
  - Baseline before vendor run: `open=0`, `resolved=463`, `ignored=412`.
  - After vendor run (pre-triage): `open=4`, `resolved=463`, `ignored=412`.
  - Final post-triage/adjudication: `open=0`, `resolved=463`, `ignored=416`.
  - Net: `ignored +4`.
- Manual adjudication (`ignored`) applied to final cached-open aliases:
  - `FAT BLASTER` (`biopepz`)
  - `P21 (P021)` (`purerawz`)
  - `Livagen` (`purerawz`)
- Runtime observability added and verified:
  - discovery/network timing split by source (`Woo`, `Shopify`, `HTML`, `Firecrawl`)
  - alias resolution timing split (`deterministic` vs `AI`)
  - DB persistence timing
  - run-level timing totals for `783e2611-43ed-471f-b493-d572fa6fd49d`:
    - `discoveryNetworkMs=71642` (`woo=66731`, `shopify=1224`, `html=3687`, `firecrawl=0`)
    - `aliasDeterministicMs=258153`
    - `aliasAiMs=300550`
    - `dbPersistenceMs=1134001`
- Detailed report update:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`

## Expansion Robustness Update (2026-02-16, third vetted batch)
- Onboarded 12 additional vetted storefront/API vendors in `sql/seed.sql`:
  - `peptiatlas.com`, `purerawz.co`, `peptidecrafters.com`, `biolongevitylabs.com`, `lotilabs.com`,
    `nexaph.com`, `erospeptides.com`, `biopepz.net`, `purepeps.com`, `hkroids.com`,
    `reta-peptide.com` (Shopify), `swisschems.is`.
- Coverage moved from `18` vendors / `26` pages to `30` vendors / `38` pages after `npm run db:bootstrap`.
- Robustness cycle executed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run job:vendors` -> `9b1960c1-9db9-467e-b477-eba428770954`
  - bounded/full triage slices (`npm run job:review-ai -- --limit=50` and `--limit=100`)
  - no `job:finnrick` run (intentionally deferred during expansion)
- Queue delta for this expansion pass:
  - Pre-triage baseline: `open=0`, `resolved=440`, `ignored=366`.
  - After vendor run (pre-triage): `open=69`, `resolved=440`, `ignored=366`.
  - Final post-triage: `open=0`, `resolved=463`, `ignored=412`.
  - Net: `resolved +23`, `ignored +46`.
- Alias robustness hardening applied in code:
  - deterministic single-letter GLP shorthand mapping now covers `R ... mg`, `S ... mg`, and `T ... mg` forms.
  - single-letter GLP shorthand now requires `mg` dosage context (for example `R 30` / `S 10mcg` / `T 60mcg` do not auto-match).
  - regression coverage added in `tests/unit/alias-normalize.test.ts`.
- Run failures/zero-offer diagnostics:
  - `NO_OFFERS`: `https://www.biopepz.net/`, `https://eliteresearchusa.com/products`, `https://peptiatlas.com/`, `https://simplepeptide.com/`.
  - `DISCOVERY_ATTEMPT_FAILED`: `https://simplepeptide.com/` (`woocommerce_store_api` aborted).
  - `SCRAPE_PAGE_ERROR` (`read ECONNRESET`): `https://purerawz.co/`, `https://reta-peptide.com/`.
- Manual adjudication (`ignored`) applied to the remaining 44 branded/code aliases after deterministic fixes.
- Verification run:
  - `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`.
- Detailed robustness report:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`

## Expansion Robustness Update (2026-02-16, second vetted batch)
- Onboarded 5 additional vetted storefront/API vendors in `sql/seed.sql`:
  - `evolvebiopep.com`, `purapeptides.com`, `nusciencepeptides.com`, `peptides4research.com`, `atomiklabz.com`.
- Coverage moved from `13` vendors / `21` pages to `18` vendors / `26` pages after `npm run db:bootstrap`.
- Robustness cycle executed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run job:vendors` -> `37c41def-d773-4d16-9556-4d45d5902a3f`
  - bounded triage slices (`npm run job:review-ai -- --limit=50`)
  - no `job:finnrick` run (intentionally deferred during expansion)
- Queue delta for this expansion pass:
  - Pre-triage baseline: `open=0`, `resolved=437`, `ignored=353`.
  - After vendor run (pre-triage): `open=16`, `resolved=437`, `ignored=353`.
  - Final post-triage: `open=0`, `resolved=440`, `ignored=366`.
  - Net: `resolved +3`, `ignored +13`.
- Alias robustness hardening applied in code:
  - descriptor stripping now preserves compound numeric identity for canonical names like `BPC-157` while still removing dosage-choice tails (`5mg/10mg/20mg`);
  - storefront-noise stripping now removes `Current batch tested at ...` and `with Air Dispersal Kit` descriptor text;
  - regression coverage added in `tests/unit/alias-normalize.test.ts` for both cases.
- Manual adjudication (`ignored`) applied to the 13 remaining branded/ambiguous items after deterministic fixes:
  - `GhRIP Gh Pathway Research Peptide System 21mg`
  - `GLOW Dermal Peptide Research Complex`
  - `illumiNeuro Neuropeptide Research Complex 50mg`
  - `SSM-x31 Systematic Signaling Metabolic Research Compound 10mg`
  - `LIQUID Zeus 485mg per ml (20ml)`
  - `LIQUID Hercules 625mg per ml (20ml)`
  - `LIQUID Minotaur 445mg per ml (20ml)`
  - `LIQUID Lipo Extreme 500mg (20ml)`
  - `LIQUID Essence 245.4mg (20ml)`
  - `Adamax 10mg`
  - `GLP-4 (C) (5mg/5mg)`
  - `P-21 12mg`
  - `Livagen (Bioregulator) 20mg`
- Verification run:
  - `npm run job:review-ai -- --limit=50` -> `itemsScanned=0`, `leftOpen=0`.
- Detailed robustness report:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`

## Expansion Robustness Update (2026-02-16, first 10-vendor batch)
- Onboarded 10 additional vetted storefront/API vendors in `sql/seed.sql`:
  - `peptidology.co`, `eternalpeptides.com`, `puretestedpeptides.com`, `verifiedpeptides.com`, `planetpeptide.com`, `simplepeptide.com`, `bulkpeptidesupply.com`, `coastalpeptides.com`, `myoasislabs.com`, `peptilabresearch.com`.
- Coverage moved from 3 vendors / 10 pages to 13 vendors / 21 pages after `npm run db:bootstrap`.
- Robustness cycle executed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run job:vendors` -> `d515a861-ad68-4d28-9155-d2439bfe0f4a`
  - `npm run job:finnrick` -> `5233e9be-24fb-42ba-9084-2e8dde507589`
  - bounded/full triage slices (`npm run job:review-ai` with `--limit=50` and `--limit=25` plus full scans)
- Queue delta for this expansion pass:
  - Pre-triage (`after vendors run`): `open=73`, `resolved=384`, `ignored=333`.
  - Final post-triage: `open=0`, `resolved=437`, `ignored=353`.
  - Net: `open -73`, `resolved +53`, `ignored +20`.
- One `job:review-ai -- --limit=50` attempt failed with `canceling statement due to statement timeout`; subsequent bounded/full reruns completed.
- Alias robustness hardening applied in code:
  - cached `needs_review` aliases now re-check deterministic heuristics before returning `ai_review_cached`;
  - deterministic shorthand expansion for tirzepatide variants (`GLP2-T`, `GLP-2TZ`, `GLP1-T`, `GLP-2 (T)` forms);
  - semaglutide shorthand mapping for `GLP1-S`, `GLP-1 (S)`, and `GLP1`;
  - deterministic CJC no-DAC mapping for Mod-GRF phrasing;
  - expanded non-product detection for cosmetic/strip noise;
  - deterministic blend/stack skip path now restricted to explicit blend markers;
  - deterministic canonical matching added for `argireline` and `pal-tetrapeptide-7` cosmetic peptide labels;
  - descriptor stripping now removes generic `peptide` suffix tokens and pack-count descriptor tails like `10 vials`.
- Manual correction applied for one false-ignore edge case:
  - `Buy GHK-Cu Copper Peptide 50mg/100mg...` was corrected to `resolved` against canonical `ghk-cu`.
- Legitimate blend policy update:
  - `cagrisema` is kept as a tracked canonical blend compound (cagrilintide + semaglutide) for now.
- Detailed robustness report:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`
- Expansion pass result:
  - Alias queue is fully burned down again (`open=0`).

## Wrap-up Update (2026-02-16, final queue closure verification)
- Applied manual adjudication (`ignored`) to the remaining 7 branded carry-over aliases:
  - `CLARIFYX 30ml`, `FOLLIGEN 30ml`, `MK-777 10mg`, `NOSTRIDAMUS 10ml`, `SYN 20ml`, `TRINITY 15.25mg`, `TRINITY 2.0 75mg`.
- Hardened manual ignore persistence:
  - `markReviewIgnored` now writes admin non-trackable alias memory (`compound_aliases.status='resolved'`, `source='admin'`) so ignored branded noise does not re-open on later runs.
- Verification rerun:
  - `npm run job:vendors` -> `scrapeRunId=3178fe72-36db-4335-8fff-1b3fe6ec640a`.
  - Run summary confirmed `unresolvedAliases=0` and queue remained closed.

## Continuation Update (2026-02-15, fresh ingestion + exclusion audit bootstrap)
- Quality gates re-run and passing:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
- Fresh ingestion reruns:
  - `npm run job:vendors` -> `scrapeRunId=30eaffc8-1dd5-4f2a-98ac-6c3a7670d587` (intermediate rerun before final queue closure).
  - `npm run job:finnrick` -> `scrapeRunId=8a108444-b26a-4f2a-94a9-347cc970a140`.
- Alias queue delta vs prior fully-closed baseline (`open=0`, `resolved=383`, `ignored=320`):
  - After vendor rerun: `open=14`.
  - After bounded triage (`npm run job:review-ai -- --limit=25`): scanned `14`, `resolved=1`, `ignored=1`, `leftOpen=12`.
  - After classifier parse-path fix + triage reruns: scanned `12` (`ignored=5`, `leftOpen=7`), then scanned `7` (`ignored=0`, `leftOpen=7`).
  - Net delta from baseline: `open +7`, `resolved +1`, `ignored +6`.
- Unresolved items grouped by reason (post-bounded triage):
  - `ai_review_cached` (`7` items):
    - `CLARIFYX 30ml`, `FOLLIGEN 30ml`, `MK-777 10mg`, `NOSTRIDAMUS 10ml`, `SYN 20ml`, `TRINITY 15.25mg`, `TRINITY 2.0 75mg`
- AI triage reliability fix applied:
  - Root cause: model outputs with `reason` length >200 were failing local parsing and collapsing to `ai_unavailable_fallback`.
  - Fix: classifier now accepts long reasons and truncates to 200 chars for persistence; chat fallback also removed unsupported `temperature=0` for `gpt-5-mini`.
  - `job:review-ai` now updates payload reason/confidence even when items remain open, so reason-group reporting reflects current AI outcome.
- Cross-vendor exclusion-rule work started:
  - Added `npm run job:exclusion-audit` (`scripts/run-single-vendor-exclusion-audit.ts`).
  - Added `npm run job:exclusion-enforce` (`scripts/run-single-vendor-exclusion-enforcement.ts`) to compile only reviewer-approved exclusions.
  - Latest report: `reports/exclusion-audit/single-vendor-audit-latest.md` (generated `2026-02-16T01:01:59Z`).
  - Report totals: `activeOfferCount=115`, `activeCompoundCount=50`, `singleVendorCompoundCount=23`, `singleVendorOfferCount=28`.
  - Initial manual-review shortlist (`review_for_possible_exclusion`): `bpc-157-kpv`, `glow-2-0`, `illuminate`, `lipo-c-b12`, `thermogenix`.
  - Runtime enforcement source is `config/manual-offer-exclusions.json` (currently compiled with `0` active rules because no candidates are approved yet).
  - Enforcement remains blocked behind manual confirmation to avoid excluding valid but poorly named peptides.

## Final Queue Closure Update (2026-02-15, full burn-down + adjudication)
- Completed all remaining bounded triage slices and manual adjudication pass; no open alias review items remain.
- Manual adjudication outcomes applied:
  - Ignored vendor-exclusive Elite branded formulas plus `Peak Power`; `MK-777` is intentionally excluded for now until cross-vendor evidence appears.
  - Resolved `GLP-1 TZ (10MG)` to canonical `tirzepatide`.
  - Resolved malformed-title `CJC-1295 &#8211; With DAC (10mg)` via HTML-entity cleanup + CJC-with-DAC mapping.
  - Resolved `Cag (Cag (5MG))` to canonical `cagrilintide`.
  - Resolved vendor `LL-37 Complex` phrasing to canonical `ll-37`.
- Heuristic and prompt hardening added for this pass:
  - Deterministic shorthand matching now covers `tirzepatide` (`TZ`/`tirz`/`GLP-1 TZ` plus prefixed forms) and `cagrilintide` (`Cag`, `Cagrilinitide` misspelling).
  - AI prompt now treats blend/stack words as non-fatal without clear multi-compound evidence (prefer `review` over unsafe skip/match).
  - Storefront cleanup now strips HTML entities before alias normalization.
  - Curated taxonomy/seed updates include `Tirzepatide`, `Cagrilintide`, and `LL-37` canonical support.
- Latest category import verification:
  - `npm run db:import-categories` -> `seededCompoundCount=51`, `appliedCount=51`, `unresolvedCount=0`.

## Continuation Update (2026-02-15, limited triage + unresolved audit)
- Quality gates re-run and passing after updates:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
- Added cost-control support for AI triage:
  - `job:review-ai` now supports `--limit=<N>` (and `REVIEW_AI_LIMIT`) to process bounded slices.
- Executed one bounded slice:
  - Command: `npm run job:review-ai -- --limit=25`
  - Output: `itemsScanned=25`, `resolved=13`, `ignored=7`, `leftOpen=5`, `durationSeconds=54.3`.
  - Queue delta from this run: `open -20`, `resolved +13`, `ignored +7`.
- Unresolved items remaining from the processed 25 (all 5) are the same normalized alias:
  - `pre workout tad`
  - IDs: `75f723f1-3703-48b7-9f1d-b5c88b8b9ca4`, `7fd3bbe1-0986-4122-a535-376ac1be8b72`, `3c6a87ad-dccb-469f-a3bf-55bb11b7523a`, `117f8531-f6be-4bcf-ba09-24bb381803d8`, `b740906f-8402-460e-b345-5c6eb2df8df8`.
  - Likely reason group: non-trackable supplement naming plus duplicate queue entries created before alias-memory convergence in-batch (not canonical-compound ambiguity).
- Spot-check precision results:
  - Retatrutide shorthand cases (`NG-1 RT`, including storefront-noise variants) resolved, not ignored.
  - Storefront/merch noise and stack cases (`NexGen x Barbarian`, `Recovery Stack`, `Peptide Kit`) were ignored as intended.
- Heuristic tightened for this unresolved pattern:
  - Added deterministic `pre-workout` detection in non-trackable alias logic so these entries auto-ignore without manual queue carry-over.
  - Regression updated in `tests/unit/alias-normalize.test.ts`.

## Tonight Update (2026-02-15, AI triage activation + queue burn-down)
- Root cause of stalled review queue was confirmed and fixed operationally:
  - `OPENAI_API_KEY` was missing; AI classification returned fallback and could not drain queue.
  - Key is now configured in local environment; AI decisions are active.
- AI triage throughput slices executed after key setup:
  - Slice 1 (`25` items): `resolved=11`, `ignored=12`, `leftOpen=2`, `real=102.55s`.
  - Slice 2 (`25` items): `resolved=12`, `ignored=13`, `leftOpen=0`, `real=70.97s`.
  - Slice 3 (`25` items): `resolved=8`, `ignored=14`, `leftOpen=3`, `real=52.61s`.
  - Combined (`75` items): `resolved=31`, `ignored=39`, `leftOpen=5`.
  - Queue moved from `open=516` -> `open=446` in-session.
- Alias/AI behavior updates implemented:
  - Storefront noise stripping before alias classification (for example `Add to cart`, prices, generic category/banner text).
  - Blend/stack detection now favors skip/non-trackable flow for single-compound offer integrity.
  - Retatrutide shorthand handling added (for example `NG-1 RT`, `GLP-3`) to reduce avoidable manual review.
  - Non-product listing text (for example vendor slogans/merch/storefront chrome) is auto-ignored and does not create offers/variants.
  - `job:review-ai` progress logs now include elapsed time, rate, ETA, and last decision/reason context.
- Operational data retention updates implemented:
  - Vendor runs now prune aged `review_queue` rows with `status in ('resolved','ignored')` after `REVIEW_QUEUE_RETENTION_DAYS` (default `45`).
  - Vendor runs now prune aged non-trackable alias memory (`compound_aliases` where `compound_id is null` and `status='resolved'`) after `NON_TRACKABLE_ALIAS_RETENTION_DAYS` (default `120`).

## Schedule + Observability Update (2026-02-15)
- Vendor cron is now daily (every 24 hours):
  - `vercel.json` schedule changed from `0 */6 * * *` to `0 0 * * *` for `/api/internal/jobs/vendors`.
- Vendor job logging now emits run start/finish, per-page progress lines, and periodic offer-progress heartbeats:
  - Useful to distinguish "actively processing" vs "stalled" during long network-bound runs.
- `job:review-ai` now emits queue scan/progress counters while processing alias review items.
- Peptide detail subhead now includes compound coverage counts:
  - `<vendors> · <variations>` for quick availability context.

## Reliability Mitigation Update (2026-02-15)
- Implemented stale-run reconciler:
  - `running` scrape runs older than `SCRAPE_RUN_STALE_TTL_MINUTES` are marked `failed` at job start.
  - Legacy pre-heartbeat runs are reconciled via `started_at` age; heartbeat-enabled runs use `heartbeat_at`.
- Implemented lightweight run heartbeat + lag alerts:
  - `scrape_runs.heartbeat_at` updates during active runs.
  - Lag alert event + admin alert fire when inactivity exceeds `SCRAPE_RUN_LAG_ALERT_SECONDS`.
- Implemented bounded vendor-page concurrency:
  - `VENDOR_SCRAPE_CONCURRENCY` env (default `2`, max `3`).
  - Current run behavior is 2-worker parallel page processing with deterministic summary aggregation.
- Verified reconciler behavior in-session:
  - Reconciled stale runs: `b9e031ec-2e59-4d33-8e5a-2cef3d362c27`, `412ca66d-1f3b-4eaf-a9fa-b4ca03facd38`, `450bba64-8b86-46a7-a950-d23b206f13b4`, `552ab91f-dd8c-40f8-9347-d601bf51688a`.
- Note:
  - Additional recently interrupted runs may remain `running` until they cross TTL, then auto-reconcile on next job start.

## Runtime Bottleneck Update (2026-02-15)
- Reruns executed:
  - `npm run job:vendors` completed successfully with run `168dd6a9-face-4cb4-aa34-6d1ae0e759ed`.
  - `npm run job:review-ai` was started but did not complete in-session (large open alias queue; see below).
- Delta vs baseline vendor run `b307de3e-62ce-4958-a35b-62f1d9fa9fe8`:
  - Status: `partial` -> `success`
  - Duration: `490s` -> `198s` (292s faster, ~59.6% reduction)
  - `pagesFailed`: `1` -> `0`
  - `aiTasksQueued`: `1` -> `0`
  - `unresolvedAliases`: `432` -> `90` (342 fewer, ~79.2% reduction)
  - `offersUnchanged`: `0` -> `86`
- Runtime fixes implemented:
  - Batched unresolved-alias admin alerts to one email per page instead of one email per alias.
  - Added bounded alert delivery (`12s` timeout wrapper) so alert transport issues do not stall ingestion.
  - Added per-origin discovery cache for Woo/Shopify API outcomes to avoid redundant probes on repeated origins.
  - Added duplicate API-origin short-circuit in worker to skip re-persisting the same discovered catalog payload across multiple page targets.
- Verification from scrape events (`168dd6a9-face-4cb4-aa34-6d1ae0e759ed`):
  - `DISCOVERY_SOURCE=10`
  - `DISCOVERY_REUSED_ORIGIN=7`
  - `UNKNOWN_ALIAS=90`
- Review queue snapshot after attempted `job:review-ai`:
  - `alias_match open=580`
  - `alias_match resolved=123`
- Operational note:
  - Previously interrupted run IDs (`412ca66d-1f3b-4eaf-a9fa-b4ca03facd38`, `450bba64-8b86-46a7-a950-d23b206f13b4`, `552ab91f-dd8c-40f8-9347-d601bf51688a`) were reconciled by stale-run logic and are not active workers.

## Review-AI Throughput Update (2026-02-15)
- Executed to completion:
  - `npm run job:review-ai`
  - Runtime (`/usr/bin/time -p`): `real=420.01s` (`user=3.73s`, `sys=0.77s`)
- Script summary:
  - `itemsScanned=580`
  - `resolved=64`
  - `ignored=0`
  - `leftOpen=516`
- Measured throughput:
  - `82.86 items/minute`
  - `~0.72 seconds/item`
- Post-run queue totals (`review_queue` where `queue_type='alias_match'`):
  - `open=516`
  - `in_progress=0`
  - `resolved=187`
  - `ignored=0`
- Budget assessment:
  - The planning estimate (`~1.5s/item`) is realistic for runtime throughput without code changes; observed runtime is ~2.1x faster.
- Runtime finding:
  - No new non-AI ingestion bottlenecks were observed in this pass; current vendor-path optimizations/observability remain the primary controls.

## Network Resolution Update (2026-02-15)
- Root cause of prior DNS errors was identified:
  - Node/curl inside restricted sandbox returned `ENOTFOUND` for vendor domains and Supabase pooler host.
  - The same lookups outside sandbox resolved normally (`scutil`/`nslookup`/Node DNS checks).
- Validation after enabling full access:
  - DNS resolution now succeeds in-session for:
    - `aws-0-us-west-2.pooler.supabase.com`
    - `peptidelabsx.com`
    - `nexgenpeptides.shop`
  - `npm run job:finnrick` now succeeds (run ID above).
- Operational implication:
  - Do not change application code for this; keep environment/runtime permissions correct in Codex sessions when running networked jobs.

## Latest Update (2026-02-14, ingestion coverage hardening)
- Ingestion runs executed:
  - `npm run job:vendors` succeeded with run `b307de3e-62ce-4958-a35b-62f1d9fa9fe8`.
  - `npm run job:finnrick` failed twice with `getaddrinfo ENOTFOUND aws-0-us-west-2.pooler.supabase.com`.
  - `npm run job:review-ai` failed with the same `ENOTFOUND` error.
- Highest-impact fixes implemented from that run:
  - Added Inertia `data-page` extraction support in HTML parser:
    - `lib/scraping/extractors.ts`
    - Supports custom storefront payloads where product+variant pricing is embedded in `#app[data-page]` (not JSON-LD/cards).
  - Added deterministic stripped-alias matching before AI fallback:
    - `lib/alias/normalize.ts`
    - `lib/db/mutations.ts`
    - Removes dosage/formulation descriptors (for example `10mg`, `vial`, `capsules`) before re-checking existing aliases/compound matches.
  - Added Elite products catalog target to seed list:
    - `sql/seed.sql` now includes `https://eliteresearchusa.com/products`.
- Regression coverage added:
  - `tests/unit/alias-normalize.test.ts`
  - Expanded `tests/unit/extractors.test.ts` with Inertia payload case.
- Validation completed:
  - `npm run test` (pass)
  - `npm run typecheck` (pass)
  - `npm run lint` (pass)
- Note: a post-fix `npm run job:vendors` rerun was started but hung >10 minutes without final JSON output and was manually interrupted; production impact of fixes is therefore code-complete but run-level metrics still need one clean re-run.

## Continuation Update (2026-02-14)
- DB/app category consistency was re-verified against Supabase:
  - `categories=22`, `active compounds=48`, `compound_category_map rows=50`
  - `compoundsWithMappings=48`, `compoundsWithPrimary=48`
  - `compoundsWithMultiplePrimary=0`
  - orphaned mapping rows to missing compounds/categories = `0`
- Targeted QA was completed for:
  - `/vendors/[slug]` (validated vendor identity, active offers table, and local-time "Last updated" label rendering)
  - `/admin/categories` (unauth redirect behavior, API `401` unauth guard, auth flow, successful save, and `admin_audit_log` write)
- Highest-impact fixes implemented:
  - Added one-primary-category partial unique index to bootstrap schema (`sql/schema.sql`) so fresh environments enforce the same invariant.
  - Category browsing queries now only include compounds with active variants, matching selector behavior:
    - `getCategorySummaries`
    - `getCategoryBySlug`
    - `getCompoundsForCategorySlug`
  - Admin category editor save flow now handles fetch/network failures gracefully.
- Added regression coverage:
  - `tests/unit/category-queries.test.ts`
  - `tests/unit/categories-page.test.ts`
- Post-change checks passed:
  - `npm run test`
  - `npm run typecheck`

## Final Update (2026-02-14)
- New user-facing vendor catalog route is implemented:
  - `/vendors/[slug]`
  - Peptide vendor names now link internally to vendor catalog page.
  - Vendor page includes simplified "Last updated: h:mmam TZ" label (user locale timezone when available, UTC fallback on initial render).
- Admin category management is implemented:
  - `/admin/categories`
  - Supports multi-category assignment and explicit primary category per compound.
  - Backed by `POST /api/admin/categories` and audited via `admin_audit_log`.
- Supabase integrity cleanup completed:
  - Removed legacy/unused empty tables: `peptides`, `products`, `product_ingredients`, `price_history`, `finnrick_scores`.
  - Added one-primary-category guard index for `compound_category_map`.
- Category taxonomy import was expanded and executed successfully:
  - `npm run db:import-categories`
  - Latest result: seeded `48` compounds, applied `48/48` assignments, `0` unresolved.
  - Multi-category mappings are active (for example `NAD+` and `NMN` mapped to both `Longevity` and `Mitochondrial`).
- CJC taxonomy is explicitly split into 3 separate compounds:
  - `CJC-1295`
  - `CJC-1295 with DAC (and IPA)`
  - `CJC-1295 no DAC (with IPA)`
  - All mapped to `Growth hormone`.

## Session Update (2026-02-14)
- Product scope is now explicitly narrowed:
  - US-focused vendors only
  - Direct storefront sales only
  - Ignore contact-only and non-storefront domains
- Added tooling script: `scripts/finnrick-vendor-audit.js`.
  - Pulls Finnrick vendors
  - Excludes already-covered list
  - Skips likely wholesale/China names heuristically
  - Audits website/platform/API signals
  - Writes `/tmp/finnrick-vendor-audit.json` + `/tmp/finnrick-vendor-audit.csv`
- Manual URL validation pass completed for user-provided vendors.
  - Confirmed API-ready Woo storefronts include:
    - `peptidology.co`, `eternalpeptides.com`, `puretestedpeptides.com`, `verifiedpeptides.com`,
      `planetpeptide.com`, `simplepeptide.com`, `bulkpeptidesupply.com`, `coastalpeptides.com`,
      `myoasislabs.com` (from `oasispeptides.com`), `peptilabresearch.com`, `evolvebiopep.com`,
      `purapeptides.com`, `nusciencepeptides.com`, `peptides4research.com`, `atomiklabz.com`
  - Additional valid storefronts with non-Woo connectors:
    - `limitlesslifenootropics.com` (BigCommerce)
    - `eliteresearchusa.com` (custom app)
    - `simplyrichards.com` (Wix)
  - Explicitly ignored by user:
    - `peptidegurus.com` (contact-to-order)
    - `peptidesforsale.com` (not a storefront)
    - `tydes.net` (not a peptide vendor)
  - Still unresolved or needs corrected URL:
    - Precision Peptide Co
    - Amino Lair
    - UWA Elite Peptides
    - Amino Asylum (`aminoasylumllc.com` appears brand-correct but storefront/API signals are inconsistent)

## Late Session Update (2026-02-14)
- Additional vendor URL batch validated and classified.
- Newly accepted storefront/API vendors:
  - `peptiatlas.com`, `purerawz.co`, `peptidecrafters.com`, `biolongevitylabs.com`, `lotilabs.com`,
    `nexaph.com`, `erospeptides.com`, `biopepz.net`, `purepeps.com`, `hkroids.com`,
    `reta-peptide.com` (Shopify), `swisschems.is`
- Explicitly excluded in this pass:
  - `next-health.com/peptide-therapy` (clinic)
  - `platinumcryo.com` (clinic)
  - `supplementsbyhazel.com` (clinic)
  - `science.bio` (closed notice)
  - `championpeptide.com` (domain-for-sale)
  - plus previously excluded: `peptidegurus.com`, `peptidesforsale.com`, `tydes.net`
- New unresolved/needs corrected URL:
  - PurePeptides (`purepeptides.co.uk`)
  - Peptide Worldwide
  - Amplified Amino (missing URL)
  - Precision Peptide Co
  - Amino Lair
  - UWA Elite Peptides

## Follow-up Update (2026-02-14)
- Product/UI work completed:
  - Category-first browsing now has dedicated routes:
    - `/categories`
    - `/categories/[slug]`
  - Nav category selection now routes to category pages.
- User-provided vendor decisions captured:
  - Accepted storefront candidates for onboarding:
    - `thepeptidehaven.com`
    - `us.injectify.is`
    - `purepeptidelabs.shop` (US-based signals found on site: domestic U.S. shipping policy + Cedar Park, TX contact location)
    - `alphagresearch.com`
    - `kits4less.com`
    - `toppeptides.com`
    - `dragonpharmastore.com`
  - Excluded by user:
    - The Naughty Needle (vendor not found)
    - Uther (non-US)
    - M-Peptides (not a real vendor by that name)
    - Zen Peptides (non-US)
    - Mix Peptides (not a real vendor)
- Still unresolved from prior batches:
  - PurePeptides (`purepeptides.co.uk`)
  - Peptide Worldwide
  - Amplified Amino (missing URL)
  - Precision Peptide Co
  - Amino Lair
  - UWA Elite Peptides

## Reminder For Next Session
- Validate new UX paths in browser:
  - `/vendors/[slug]` (timestamp display + offering rows)
  - `/admin/categories` (multi-category save + primary toggle)
  - `/categories` and `/categories/[slug]`
- Run ingestion and confirm seeded taxonomy compounds begin receiving variants/offers as vendors are onboarded:
  - `npm run job:vendors`
  - `npm run job:review-ai`

## What Was Changed In This Session
- Setup/docs and env guidance updated for Supabase/Vercel flow.
- Added one-time schema drift recovery: `DB_BOOTSTRAP_RESET=true npm run db:bootstrap`.
- Job scripts now close DB pool on completion so terminal returns promptly.
- Homepage metrics restricted to only `Price per vial` and `Price per mg`.
- Fixed duplicate key/duplicate-vendor rendering behavior by deduping per vendor.
- Blend/composite products are no longer auto-mapped to single compounds.
- Existing misclassified blend URLs are marked unavailable when now unresolved.
- Trend page now falls back to a current snapshot point when no history rows exist.
- Admin login form no longer exposes email placeholder.
- Admin auth endpoint no longer returns token URL in API response.
- In local non-production, magic link is printed to server logs.
- Expanded vendor seed targets to include catalog/category pages (not only site roots).
- Extractor filtering improved to prioritize real product URLs and avoid cart/wishlist actions.
- Variant default/ranking now uses distinct vendor coverage (not raw offer row count).
- Refactored scrape discovery to tool-first source stack:
  - WooCommerce Store API first
  - Shopify products API second
  - HTML extraction (with schema.org JSON-LD) third
  - Firecrawl managed scrape fallback (if API key configured) fourth
  - Playwright fallback remains for aggressive/manual mode
- Added vendor catalog pages and internal vendor navigation from peptide tables.
- Added admin category editor with API + audit logging.
- Added category import utility and npm script:
  - `scripts/import-compound-categories.ts`
  - `npm run db:import-categories`
- Added legacy-table cleanup SQL utility:
  - `sql/maintenance/cleanup-legacy-peptides.sql`

## Current Data Reality (Important)
- `bpc-157` is no longer empty after the latest expanded scrape.
- Active BPC listings now include pure BPC products from at least 2 vendors.
- Blended BPC entries (for example BPC + TB500 blends) are now inactive for `bpc-157`.
- `Elite Research USA` root-page extraction gap fix (Inertia payload parsing) is now validated by subsequent successful vendor runs.
- `unresolvedAliases` remains high; review queue is active and expected.
- Non-peptide/storefront-noise strings are now operationally treated as ignore-only (single-compound offers remain the only persisted catalog objects).
- Category taxonomy mappings are now complete for curated set (`48/48` imported), but many newly seeded compounds are placeholders until scrape discovery creates active variants/offers.

## Open Risks / Remaining Work
- AI-first compound classification now drives match/skip/review decisions; quality depends on `OPENAI_API_KEY` + model behavior.
- Vendor coverage/runtime improvements need ongoing monitoring to catch regressions as target lists expand.
- `job:review-ai` now has progress logging and met runtime throughput targets, but it still lacks an explicit runtime cap/timeout policy for very large queues.
- Vendor job runtime is still sensitive to unresolved alias spikes; alert sends are now batched/timeout-bounded, but high unresolved volume still increases total processing time.
- Retatrutide shorthand inference improves coverage but may need periodic precision checks as vendor euphemisms evolve.
- Email delivery depends on Resend sender/domain verification; local server-log fallback is available.
- Some non-BPC compound alias quality still needs curation because unresolved volume is high.
- Firecrawl fallback is optional and currently disabled unless `FIRECRAWL_API_KEY` is set.
- Newly seeded compounds may not yet appear in public selectors until they have active variants/offers (current selector filter requires variant presence).

## Immediate Next Steps
1. Re-run ingestion now that full-access DNS/network is confirmed:
   - `npm run job:vendors`
   - `npm run job:finnrick`
2. Re-run `npm run job:review-ai` after the next vendor scrape and compare against the new throughput baseline:
   - baseline from 2026-02-15: `82.86 items/min` (`~0.72s/item`)
   - compare resolution yield (`resolved/itemsScanned`) to detect queue-quality changes
3. Verify impact of the extraction + alias fixes from each clean vendor run:
   - confirm `pagesFailed` drops from `1` to `0` (or identify remaining failed target)
   - confirm non-zero `offersCreated`/`offersUpdated`/`offersUnchanged`
   - confirm `unresolvedAliases` stays near or below the recent successful level (`90`)
4. Reduce ingestion runtime overhead:
   - add per-target timing summaries for vendor runs to isolate slow origins/pages
   - add runtime guardrails for long-running review triage scripts
5. Re-check public category UX after ingestion:
   - `/categories`
   - `/categories/[slug]`
   - confirm only variant-backed compounds appear and counts are sensible.
6. Continue vendor onboarding from unresolved URL queue:
   - Precision Peptide Co
   - Amino Lair
   - UWA Elite Peptides
   - Peptide Worldwide
   - Amplified Amino
7. Triage review queue ambiguities after AI pass (focus on true blend/alias ambiguity, ignore CTA/noise).
8. Periodically sample ignored decisions to confirm shorthand/noise heuristics remain precise as vendor copy changes.

## Verification Checklist (Mapped To Your Commentary)
1. Homepage metric scope
- Go to `/`.
- Confirm metric toggle only shows `Per vial` and `Per mg`.

2. BPC detail correctness
- Go to `/peptides/bpc-157`.
- Confirm vendor table is not empty.
- Confirm blend URLs like `wolverine-blend-bpc-157-...-tb500...` are not shown as active BPC offers.
- Confirm variant selection defaults to a high-coverage variant (currently expected: `5mg`).
- Confirm trend section is not blank if current metric values exist (fallback point shown when history is sparse).

3. Admin login/privacy behavior
- Go to `/admin/login`.
- Confirm email input has no exposed placeholder email.
- Submit login request with admin email.
- Confirm UI message is generic and does not display token URL.
- In the terminal running `npm run dev`, find log line:
  - `[admin-auth] local magic link for ...`
- Open that logged URL and verify access to `/admin`.

4. Job UX behavior
- Run `npm run job:vendors`.
- Confirm it prints JSON summary and returns shell prompt.
- Run `npm run job:finnrick`.
- Confirm start/complete logs print and command exits cleanly.

5. Product mapping sanity
- On `/peptides/bpc-157`, verify pure BPC listings like `BPC-157 (10mg)` and `BPC-157 (20mg)` can appear.
- Verify composite products (BPC + another compound) are excluded from active single-compound listing.

6. Known gap check
- Verify post-fix vendor coverage now that Inertia payload extraction is implemented; if a target still fails, capture exact URL + discovery attempts.

## If Starting A New Thread
Use this copy/paste prompt:

```
Continue from /Users/belmead/Documents/stacktracker on branch codex/mvp-scaffold.

Start by reading:
- /Users/belmead/Documents/stacktracker/HANDOFF.md
- /Users/belmead/Documents/stacktracker/README.md
- /Users/belmead/Documents/stacktracker/PRD.md
- /Users/belmead/Documents/stacktracker/CHANGELOG.md

Current state to assume:
1. Alias triage queue is fully burned down again:
   - Current totals: `open=0`, `in_progress=0`, `resolved=463`, `ignored=412`.
2. Heuristics now cover noisy GLP shorthand and vendor euphemisms:
   - retatrutide: `RT`, `GLP-3`, prefixed forms like `ER-RT`, and single-letter `R ... mg`
   - tirzepatide: `TZ`, `tirz`, `GLP-1 TZ`, `GLP2-T`, `GLP-2TZ`, `GLP1-T`, `GLP-2 (T)`, prefixed forms like `NG-TZ` / `ER-TZ`, and single-letter `T ... mg`
   - semaglutide: `sema`, `GLP1-S`, `GLP-1 (S)`, `GLP1`, and single-letter `S ... mg`
   - cagrilintide: `Cag` / `Cagrilinitide` misspelling
3. Alias descriptor stripping now preserves canonical numeric identities while removing dosage-choice tails:
   - `BPC-157 Peptide 5mg/10mg/20mg` strips to `bpc 157` (not `bpc`).
4. Storefront-noise stripping now removes Atomik batch-note text:
   - `Current batch tested at ...`
   - `with Air Dispersal Kit`
5. HTML entities are stripped during normalization, which fixed `CJC-1295 &#8211; With DAC (10mg)` matching.
6. Canonical mapping now treats `LL-37 Complex` as `LL-37`; deterministic mapping also covers `argireline` and `pal-tetrapeptide-7` cosmetic peptide labels.
7. `cagrisema` is intentionally kept as a tracked canonical blend compound (cagrilintide + semaglutide) for now.
8. Category importer + seeds include newly onboarded canonical compounds from expansion triage (for example `semaglutide`, `thymalin`, `mazdutide`, `survodutide`, `cagrisema`, `ghr-2`, `ghr-6`, `ara-290`).
9. Latest networked runs:
   - vendors (expanded batch, third onboarding pass): `9b1960c1-9db9-467e-b477-eba428770954` (`status=partial`, `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `unresolvedAliases=69`, `aliasesSkippedByAi=543`)
   - latest fully successful vendor run: `3178fe72-36db-4335-8fff-1b3fe6ec640a`
   - finnrick: `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun during scrape-expansion unless explicitly requested)
10. Cross-vendor exclusion framework is in place and manual-gated:
   - command: `npm run job:exclusion-audit`
   - latest report: `reports/exclusion-audit/single-vendor-audit-latest.md`
   - compile approved exclusions with `npm run job:exclusion-enforce`
   - runtime rules file: `config/manual-offer-exclusions.json`
   - currently compiled rules: `0`
11. Coverage after third expansion batch:
   - active vendors: `30`
   - active vendor pages: `38`
12. Full-access mode is required in Codex sessions for reliable DNS/networked job execution; restricted sandbox mode can produce false `ENOTFOUND` failures.

Pick up by:
1. Stabilize third-batch scrape reliability by diagnosing and fixing the six known failed/zero-offer targets:
   - `https://www.biopepz.net/`
   - `https://eliteresearchusa.com/products`
   - `https://peptiatlas.com/`
   - `https://simplepeptide.com/`
   - `https://purerawz.co/` (`read ECONNRESET`)
   - `https://reta-peptide.com/` (`read ECONNRESET`)
2. Run robustness cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50` (repeat bounded slices as needed)
3. Generate a run-quality report for the expanded scrape:
   - per-vendor offer counts, discovery source, unresolved alias counts, skipped-by-AI counts, and failures
   - queue deltas (`open/resolved/ignored`) before and after triage
   - vendors/pages with zero offers and likely cause
4. Add/expand regression coverage for any new parsing or alias edge cases found in the expanded run.
5. Keep single-compound integrity strict: no storefront noise, no non-peptide products, and no vendor-exclusive custom blends persisted as tracked offers.
```
