# Stack Tracker Handoff Note

## Snapshot
- Date: 2026-02-15
- Project path: `/Users/belmead/Documents/stacktracker`
- Environment: Host DNS/network is healthy; prior `ENOTFOUND` failures were caused by restricted sandbox DNS in Codex, not app or database config.
- App status: app/test/lint/typecheck are operational; networked ingestion jobs run successfully in full-access mode.
- Most recent completed vendor run: `ddf17efd-d5b7-48e9-abf3-4c601eea872f` (`pagesTotal=10`, `pagesSuccess=10`, `pagesFailed=0`, `offersUnchanged=86`, `unresolvedAliases=90`, `aiTasksQueued=0`, ~`131.6s` runtime).
- Most recent Finnrick run: `13073ab4-1f9b-498e-8c81-5130b0c35333` (`vendorsTotal=3`, `vendorsMatched=1`, `ratingsUpdated=1`, `notFound=2`).
- Most recent review-ai full run (completed 2026-02-15 before API-key fix): `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516`, `real=420.01s` (~`82.86 items/min`, ~`0.72s/item`).
- Alias triage queue is fully burned down (`queue_type='alias_match'`): `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.
- Quality gates currently passing: `npm run typecheck`, `npm run lint`, `npm run test`.

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
1. Alias triage queue is fully closed: `alias_match` totals are `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.
2. Heuristics now cover noisy GLP shorthand and vendor euphemisms:
   - retatrutide: `RT`, `GLP-3`, prefixed forms like `ER-RT`
   - tirzepatide: `TZ`, `tirz`, `GLP-1 TZ`, prefixed forms like `NG-TZ` / `ER-TZ`
   - cagrilintide: `Cag` / `Cagrilinitide` misspelling
3. HTML entities are stripped during normalization, which fixed `CJC-1295 &#8211; With DAC (10mg)` matching.
4. Canonical mapping now treats `LL-37 Complex` as `LL-37`.
5. Vendor-exclusive branded formulas from Elite plus `Peak Power` (and currently single-vendor `MK-777`) are intentionally ignored for now.
6. Category importer + seeds now include `Tirzepatide`, `Cagrilintide`, and `LL-37`; latest import result is `seededCompoundCount=51`, `appliedCount=51`, `unresolvedCount=0`.
7. Latest successful networked runs remain:
   - vendors: `ddf17efd-d5b7-48e9-abf3-4c601eea872f`
   - finnrick: `13073ab4-1f9b-498e-8c81-5130b0c35333`
8. Full-access mode is required in Codex sessions for reliable DNS/networked job execution; restricted sandbox mode can produce false `ENOTFOUND` failures.

Pick up by:
1. Re-run quality gates and a fresh ingestion cycle:
   - npm run typecheck
   - npm run lint
   - npm run test
   - npm run job:vendors
   - npm run job:finnrick
2. Confirm whether new unresolved aliases appear after the fresh vendor run; if they do, triage in bounded slices (`npm run job:review-ai -- --limit=25`) and report unresolved reasons grouped by ambiguity vs missing canonical vs parsing noise.
3. Prepare the single-vendor exclusion implementation plan (and optional SQL/report script) without blindly dropping valid but poorly named peptides; keep manual review checkpoints.
4. Update docs with new run IDs, queue deltas, and exclusion-audit findings.
```
