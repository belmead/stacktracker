# Stack Tracker PRD (MVP)

## 1. Summary
Stack Tracker is a web platform for normalized peptide pricing intelligence. It scrapes vendor product data, standardizes units/formulations, stores historical pricing, and presents comparison/trend views to end users.

MVP goals:
- Aggregate vendor prices every 24 hours.
- Normalize compounds, aliases, formulations, and package sizes.
- Show public homepage + peptide template pages.
- Sync Finnrick vendor ratings every 24 hours.
- Provide single-admin workflows for alias review, featured compounds, and aggressive rescrape requests.

## 2. Product Scope

### In scope
- Public pages:
  - Homepage with top-five peptide cards.
  - Peptide detail pages with formulation/size selection, trend chart, and paginated vendor table.
  - Vendor detail pages listing all active vendor offerings with last-updated timestamp.
  - Category browsing pages list compounds that have active variants (not taxonomy-only placeholders).
- Metric-aware display (formulation-aware defaults).
- Vendor scraping pipeline with safe mode and AI fallback task queue.
- Finnrick rating ingestion with `N/A` fallback.
- Admin panel with magic-link authentication.
- Review queue for ambiguous alias resolution.
- Featured compounds management.
- Vendor aggressive rescrape queue.
- Category browsing pages and category-first navigation.
- Admin category editor supporting multi-category + primary-category assignment.
- MVP ingestion scope is single-unit listings (single vial/capsule/etc.) for normalized comparison quality.

### Out of scope (MVP)
- Checkout or transactions.
- Affiliate monetization logic (only extension readiness).
- RBAC / multi-admin authorization.
- Multi-currency conversion and settlement.
- Final autonomous ranking of top five compounds.
- Bulk-pack / multi-vial economics and dedicated bulk-normalization logic (deferred to v2).

## 3. User Experience Requirements

### Homepage
- Floating navigation:
  - Brand
  - Peptide selector
  - Metric toggle
- Hero with headline/subhead.
- Five stacked peptide cards:
  - Image placeholder
  - Compound name
  - Category badge
  - Selected metric price
  - Vendor table with:
    - Vendor name (external link)
    - Unit price
    - Finnrick rating (`N/A` if unavailable)

### Peptide page
- Shared floating navigation.
- Hero section.
- Trend chart with ranges: `1w`, `1m` (default), `6m`, `1y`.
- Formulation/size options when multiple variants exist.
- Selected-variant price summary block:
  - `Average price of <size> <formulation> of <compound>`
  - `Low` and `High` values for the selected variant.
- Vendor table (page size 10) with pagination for >10 vendors.
- Default sort is formulation-aware (vial products prioritize `price_per_mg`).
- Vendor name links route to internal vendor detail page; external listing links remain available.

### Vendor page
- Shared floating navigation.
- Vendor identity + Finnrick rating.
- Simplified "Last updated" timestamp (user locale timezone when available; fallback to default rendering).
- Active offers table (compound, product link, formulation/size, list price, selected metric, last seen).

### Compliance UX
- Mandatory 18+ / informational disclaimer gate on first visit.

## 4. Data and Scraping Requirements

### Vendor scraping
- Schedule: every 24 hours.
- Bounded page concurrency: 2 workers by default (configurable up to 3).
- Per-page discovery probes run in fallback order (`WooCommerce API -> Shopify API -> HTML -> Firecrawl`) to avoid duplicate upstream load/rate-limit pressure.
- Woo invalid-pricing diagnostics:
  - If Woo returns product candidates but all observed price fields are zero/empty, emit explicit `INVALID_PRICING_PAYLOAD` diagnostics (sampled product IDs/names + observed fields).
  - Preserve `NO_OFFERS` behavior for true empty/no-catalog payloads.
- Inputs captured:
  - Last scrape timestamp
  - Last run heartbeat timestamp (for lag/stale-run detection)
  - Product price
  - Product size/strength
  - Calculated normalized unit metrics
- MVP offer-eligibility policy:
  - Enforce single-unit offers for comparison pages.
  - Deterministically exclude bulk/pack/kit/multi-vial listings at ingestion before alias/variant/price aggregation.
  - Bulk-pack economics and dedicated normalization remain deferred to v2.
- Change behavior:
  - If offer is unchanged: update `last_scraped_at` / `last_seen_at`, do not append duplicate historical point.
  - If changed: append new historical record and close previous effective window.
- Reliability behavior:
  - Reconcile stale `running` scrape runs to `failed` after TTL.
  - Emit lag alert events when active run heartbeat exceeds lag threshold.

### Finnrick scraping
- Schedule: every 24 hours.
- Output:
  - Vendor rating if matched.
  - `N/A` rating when vendor not found.

### Smart matching
- Rules-first alias matching with confidence.
- Strip storefront noise (prices/CTA fragments/generic category text) before matching.
- Non-product listings and blend/stack items are auto-skipped for single-compound tracking.
- Shorthand aliases are inferred when safely mappable (for example retatrutide euphemisms such as `RT` / `GLP-3` with supporting context).
- Unknown/low-confidence alias creates review queue item.
- Admin alert email sent for actionable ambiguity.

### Policy and fallback behavior
- Safe-mode scrape respects robots/policy boundaries.
- When safe mode is blocked or parsing yields no offers:
  - Classify safe-mode access blocks explicitly (`safe_mode_access_blocked`) with provider diagnostics and Cloudflare-specific compatibility tagging (`safe_mode_cloudflare_blocked`).
  - Queue AI-agent fallback task.
  - Track task + scrape events.
  - Alert admin.
- Admin can queue aggressive manual rescrape.

## 5. Architecture
- Frontend/backend: Next.js App Router (TypeScript).
- Database: Postgres (Supabase-compatible schema).
- Jobs:
  - Vendor ingestion worker
  - Finnrick sync worker
- Scheduler:
  - Vercel cron endpoints (`vercel.json`).
- Email:
  - Resend (domain sender once available).

## 6. Data Model (Core Tables)
- `vendors`
- `vendor_pages`
- `compounds`
- `compound_aliases`
- `formulations`
- `compound_variants`
- `offers_current`
- `offer_history`
- `finnrick_ratings`
- `finnrick_rating_history`
- `featured_compounds`
- `categories`
- `compound_category_map`
- `review_queue`
- `scrape_runs`
- `scrape_events`
- `scrape_requests`
- `ai_agent_tasks`
- `admin_magic_links`
- `admin_sessions`
- `admin_audit_log`
- `app_settings`

## 7. API Surface (MVP)

Public:
- `GET /api/home`
- `GET /api/compounds/:slug`
- `GET /api/compounds/:slug/offers`
- `GET /api/compounds/:slug/trend`

Admin:
- `POST /api/admin/auth/request-link`
- `GET /api/admin/auth/verify`
- `POST /api/admin/auth/logout`
- `POST /api/admin/review/:id/resolve`
- `POST /api/admin/featured`
- `POST /api/admin/vendors/:id/rescrape`
- `POST /api/admin/categories`

Internal jobs:
- `GET|POST /api/internal/jobs/vendors`
- `GET|POST /api/internal/jobs/finnrick`

## 8. Non-Functional Requirements
- Node runtime target: `>=20`.
- Secure session cookies and magic-link flow.
- Auditable admin actions.
- Enforce one primary category per compound at the DB level.
- SEO support via sitemap + robots routes.
- Structured scrape event logging and run summaries.
- Production secret hygiene:
  - No secrets/API keys in source control, logs, or event payloads.
  - Runtime secrets are managed only via deployment platform secret stores.
  - Secrets are rotatable without code changes.
- Least-privilege infrastructure:
  - Runtime DB credentials are separate from migration/bootstrap credentials.
  - Internal job endpoints require shared-secret auth and are not publicly callable without token.
- Security operations baseline:
  - CI secret scanning and dependency vulnerability scanning are required before production go-live.
  - Platform/operator accounts (deployment, DB, email provider) require MFA and auditable change logs.

## 9. Operational Defaults
- Currency: USD.
- Timezone display: user local timezone (DB stored in UTC).
- History retention target: 24 months full detail.
- Top-five source default: auto-selection until manual pinning.
- UI stage: minimal wireframe with tokenized styles.
- Typography note: reserve slot for future Geist Pixel application in polish phase.

## 10. Current Implementation Status (as of 2026-02-20)
- MVP scaffold implemented across app, API, schema, jobs, admin, and tests.
- Code quality gates are passing under Node 20.
- Current active coverage is `45` vendors / `53` vendor pages.
- Single-unit ingestion policy is now active:
  - bulk/pack/kit/multi-vial offers are excluded deterministically before alias/variant persistence;
  - excluded offers emit `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT`.
- Storefront remediation shipped for known root-target gaps:
  - `Alpha G Research` now targets `https://www.alphagresearch.com/shop-1`.
  - `Dragon Pharma Store` now targets `https://dragonpharmastore.com/64-peptides` with PrestaShop-style extraction support.
- Safe-mode access blocking is now explicitly classified (`safe_mode_access_blocked`) with provider metadata in no-offers/discovery-failure paths.
- Vendor catalog route (`/vendors/[slug]`) and admin category editor are implemented.
- Category taxonomy importer is implemented and currently applies `51/51` curated assignments with multi-category support.
- Category browsing queries are aligned with selector rules (active variants required).
- Bootstrap schema includes one-primary-category partial unique index on `compound_category_map`.
- Regression tests cover category query guards and categories page metric/link behavior.
- Discovery/extraction now supports custom storefront embedded payloads (Inertia `data-page`) in addition to JSON-LD/card parsing.
- HTML extraction now also supports Wix storefront warmup payloads (`#wix-warmup-data`) for product/price recovery on Wix-only vendors.
- HTML discovery now falls back to vendor root URL when a seeded page target returns empty HTML.
- Discovery runtime now memoizes per-origin Woo/Shopify API outcomes and reuses API-origin payloads to reduce redundant probes/persistence work within a scrape run.
- Discovery and HTML fetch operations now include transient retry/backoff handling to reduce timeout/`ECONNRESET` flakiness.
- Vendor scraper now uses bounded worker concurrency (`2` default, `3` max) for page targets.
- Scrape runs now maintain heartbeat timestamps and auto-reconcile stale `running` runs on job start.
- Runtime emits lag alerts when heartbeat inactivity exceeds threshold.
- Alias resolution now includes deterministic descriptor-stripping fallback matching before AI/review.
- Alias resolution now strips storefront noise before deterministic and AI matching.
- Non-product/noise listings and blend/stack aliases are auto-ignored for single-compound integrity (no offer persistence).
- Non-trackable supplement aliases (for example `pre-workout`) are deterministically ignored to prevent manual-review queue churn.
- Retatrutide shorthand aliases now have deterministic fallback matching to reduce avoidable review queue load (including single-letter `R ... mg` forms).
- Tirzepatide shorthand aliases now have deterministic fallback matching (`TZ`, `tirz`, `GLP-1 TZ`, prefixed forms like `NG-TZ`/`ER-TZ`, plus single-letter `T ... mg` forms).
- Cagrilintide shorthand aliases now have deterministic fallback matching (`Cag`, `Cagrilinitide` misspelling).
- CJC with DAC aliases are now normalized safely even when titles contain HTML entities (for example `&#8211;`).
- LL-37 canonical mapping now covers vendor phrasing like `LL-37 Complex`.
- Alias-review alerting now batches unresolved aliases per page and uses timeout-bounded delivery to avoid blocking scrape completion.
- `job:review-ai` now emits progress logs while scanning large open alias queues.
- `job:review-ai` now supports bounded slices via `--limit=<N>` / `REVIEW_AI_LIMIT`.
- Vendor runtime observability now separates and reports:
  - discovery/network wait by source (`Woo`, `Shopify`, `HTML`, `Firecrawl`)
  - alias resolution time (`deterministic` vs `AI`)
  - DB persistence time
- Formulation inference now defaults mass-unit peptide listings without explicit non-vial form factors (for example `BPC-157 10mg`) to `vial`.
- Offer persistence now reconciles by `(vendor_id, product_url)` fallback so normalization upgrades do not create duplicate active offers.
- Vendor runs now evaluate quality guardrails and persist them in `scrape_runs.summary.qualityGuardrails`:
  - formulation invariant (`bpc-157` `10mg` vial-share)
  - run-over-run formulation drift alerting
  - top-compound vendor-coverage smoke checks
- Top-compound smoke script is available via `npm run job:smoke-top-compounds` and exits non-zero when tracked coverage drops below configured thresholds.
- Smoke comparator regression fix shipped (`2026-02-17`):
  - root cause: baseline-tracked compound slugs could fall outside current top-`N` snapshot and be interpreted as zero coverage;
  - remediation: hydrate current coverage for baseline-tracked missing slugs before smoke evaluation in both `job:vendors` and `job:smoke-top-compounds`.
- Discovery transport-failure classification hardening shipped (`2026-02-17`):
  - all-source network failures are now classified as `NETWORK_FILTER_BLOCKED` (queue reason `network_filter_blocked`) when Meraki-style blocked redirects are detected;
  - unresolved transport failures without a deterministic blocked-site fingerprint still classify as `DISCOVERY_FETCH_FAILED` (queue reason `discovery_fetch_failed`);
  - worker retries discovery once for this pattern before fallback tasking;
  - parse-failure payloads now persist failing source/error arrays plus blocked-site metadata (`networkFilterProvider/category/location/server/url/status/probeUrl`) for deterministic triage.
- Parse-failure queue dedupe hardening shipped (`2026-02-17`):
  - `parse_failure` review items are now deduped by `(vendor_id, page_url)` while status is `open|in_progress`;
  - one-time duplicate cleanup reduced open parse-failure rows from `96` to `25`.
- Deterministic `network_filter_blocked` queue suppression shipped (`2026-02-20`):
  - parse-failure payloads now include `networkFilterSignature` for deterministic blocked-site fingerprints;
  - repeated identical triaged signatures on the same `(vendor_id, page_url)` are suppressed for a configurable cooldown window (`NETWORK_FILTER_BLOCKED_QUEUE_SUPPRESSION_DAYS`, default `14`);
  - scrape events still emit full `NETWORK_FILTER_BLOCKED` diagnostics with suppression metadata (`parseFailureQueueSuppressed`) for visibility.
- Security controls now implemented in-code (`2026-02-17`):
  - CI security workflow adds full-history secret scanning (`gitleaks`) and high/critical dependency gating (`npm audit --audit-level=high`);
  - scrape-event/review-queue payload redaction is enforced via `lib/security/redaction.ts`;
  - runtime least-privilege credential guard supports `DATABASE_RUNTIME_USER`, and bootstrap/import scripts support `DATABASE_ADMIN_URL`.
- Latest robustness cycle:
  - `npm run typecheck` pass
  - `npm run lint` pass
  - `npm run test` pass (`80` tests)
  - `npm audit --audit-level=high` pass (`0` vulnerabilities)
  - `npm run job:vendors` run `89043ac0-e797-49c2-9755-7f928a203c6a` completed (`status=partial`) with guardrails `invariant=pass`, `drift=pass`, `smoke=pass`.
  - `npm run job:review-ai -- --limit=50` pass (`itemsScanned=0`, `leftOpen=0`).
  - `npm run job:smoke-top-compounds` pass (`failureCount=0`, baseline `89043ac0-e797-49c2-9755-7f928a203c6a`).
  - Live suppression-validation run `c1f47324-133c-4ff5-826f-a98f82392fa4` (vendor-scoped) confirmed event visibility + queue suppression (`parseFailureQueueSuppressed=true`) for deterministic blocked signatures.
- Current queue and coverage snapshot:
  - Alias queue (`queue_type='alias_match'`): `open=0`, `resolved=466`, `ignored=432`.
  - Parse-failure queue (`queue_type='parse_failure'`): `open=21` (`network_filter_blocked=20`, `invalid_pricing_payload=1`).
  - `discovery_fetch_failed` open rows: `0`.
  - Active coverage: `45` vendors / `53` vendor pages.
- Current `thymosin-alpha-1` coverage: `27` active vendors (`28` active offers), validating that the prior `24 -> 0` smoke output was comparator drift rather than ingestion loss.
- Latest vendor run page-failure profile:
  - `22` failed pages total in run `89043ac0-e797-49c2-9755-7f928a203c6a`:
    - `21` are `NETWORK_FILTER_BLOCKED` with repeated transport errors (`fetch failed | read ECONNRESET | code=ECONNRESET`) and deterministic Meraki blocked-page probes;
    - `1` is expected `INVALID_PRICING_PAYLOAD` (`PeptiAtlas`).
  - Prior `elitepeptides.com` `DISCOVERY_FETCH_FAILED` outlier is now reclassified into the deterministic blocked cohort.
- Latest `job:review-ai` baseline run (`2026-02-15`, pre-key fix) completed with `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516` in `420.01s`.
- Measured review-ai throughput baseline (`~0.72s/item`, `82.86 items/min`) is faster than the planning budget target (`~1.5s/item`) without code changes.
- Latest Finnrick run: `28ce6525-14ce-4cfc-b043-83f9440944ea` (`vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`).
- Finnrick rating presentation now uses textual `Ratings range` labels (`A`, `A to C`, `N/A`) end-to-end in parsing, storage selection, and UI rendering.
- Security CI runtime validation caveat:
  - `gh` CLI is authenticated locally; remote workflow run/log verification proceeds after branch push.
- Coverage expansion batches are onboarded in seed data:
  - Batch 1 added 10 vetted storefront/API vendors (`3/10` -> `13/21` vendors/pages).
  - Batch 2 added 5 vetted storefront/API vendors (`13/21` -> `18/26` vendors/pages).
  - Batch 3 added 12 vetted storefront/API vendors (`18/26` -> `30/38` vendors/pages).
  - Batch 4 added 8 vetted storefront vendors (`37/45` -> `45/53` vendors/pages).
- Expanded ingestion robustness cycles (`2026-02-16`) ran with:
  - Batch 1 vendor run `d515a861-ad68-4d28-9155-d2439bfe0f4a` (`status=partial`, `pagesTotal=21`, `pagesSuccess=20`, `pagesFailed=1`, `offersCreated=425`, `unresolvedAliases=73`, `aliasesSkippedByAi=231`).
  - Batch 2 vendor run `37c41def-d773-4d16-9556-4d45d5902a3f` (`status=partial`, `pagesTotal=26`, `pagesSuccess=25`, `pagesFailed=1`, `offersCreated=274`, `offersUpdated=1`, `offersUnchanged=537`, `unresolvedAliases=16`, `aliasesSkippedByAi=339`).
  - Batch 3 vendor run `9b1960c1-9db9-467e-b477-eba428770954` (`status=partial`, `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `unresolvedAliases=69`, `aliasesSkippedByAi=543`).
  - Stabilization vendor run `783e2611-43ed-471f-b493-d572fa6fd49d` (`status=partial`, `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `offersCreated=48`, `offersUpdated=0`, `offersUnchanged=1210`, `unresolvedAliases=4`, `aliasesSkippedByAi=679`, `aiTasksQueued=1`).
  - Guardrail drift verification run `8807da2b-e1d4-4ad9-93c0-15bf66999254` (`status=partial`, `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=1243`, `unresolvedAliases=0`, `aliasesSkippedByAi=668`, `aiTasksQueued=1`).
  - Historical expansion note: Finnrick was deferred during those specific expansion passes until the explicit rerun in this pass (`084b323c-6472-4554-b11f-d0aa19f0889c`).
- Alias queue delta across expansion cycles:
  - Batch 1: `open=73` -> `open=0` (net `resolved +53`, `ignored +20`).
  - Batch 2: `open=16` -> `open=0` (net `resolved +3`, `ignored +13`).
  - Batch 3: `open=69` -> `open=0` (net `resolved +23`, `ignored +46`).
  - Stabilization rerun triage/adjudication: `open=4` -> `open=0` (net `ignored +4`).
  - Current totals: `open=0`, `in_progress=0`, `resolved=466`, `ignored=418`.
- Additional robustness hardening from expansion findings:
  - Cached `needs_review` aliases now allow deterministic heuristics before returning `ai_review_cached`.
  - Deterministic tirzepatide shorthand coverage now includes `GLP2-T`, `GLP-2TZ`, `GLP1-T`, and `GLP-2 (T)` forms.
  - Deterministic semaglutide shorthand coverage now includes `GLP1-S`, `GLP-1 (S)`, and `GLP1`.
  - Deterministic GLP shorthand coverage now includes single-letter dose aliases `R ... mg` / `S ... mg` / `T ... mg`.
  - Single-letter GLP shorthand matching now explicitly requires `mg` dosage context (no-unit and non-`mg` unit forms do not auto-match).
  - Deterministic CJC no-DAC mapping now supports Mod-GRF phrasing.
  - Deterministic canonical mapping now covers `argireline` and `pal-tetrapeptide-7` cosmetic peptide labels.
  - Alias descriptor stripping now drops generic `peptide` suffixes and pack-count descriptor tails (for example `10 vials`).
  - Alias descriptor stripping now preserves canonical numeric tokens when part of a compound identity (for example `BPC-157`), while still removing dosage-choice tails.
  - Storefront-noise stripping now removes `Current batch tested at ...` and `with Air Dispersal Kit` descriptor text.
  - Non-product detection expanded for cosmetic/strip storefront noise.
  - `cagrisema` is intentionally kept as a tracked canonical blend compound (cagrilintide + semaglutide).
- AI triage reliability fix is in place:
  - Long-model `reason` strings no longer trigger parse fallback to `ai_unavailable_fallback`.
  - Chat-completions fallback request removed unsupported `temperature=0` for `gpt-5-mini`.
- Vendor runs now prune aged operational-noise history (`review_queue` resolved/ignored + non-trackable alias rows) via retention env settings.
- Supabase schema drift cleanup has removed legacy unused tables from earlier iterations.
- Vendor ingestion has a recent fully successful run (`3178fe72-36db-4335-8fff-1b3fe6ec640a`) with `pagesSuccess=10`, `pagesFailed=0`, `unresolvedAliases=0`, `offersUnchanged=116`, `offersExcludedByRule=0`.
- Woo invalid-pricing hardening is implemented:
  - Discovery now captures zero/empty Woo pricing diagnostics for product-candidate payloads.
  - Worker now emits `INVALID_PRICING_PAYLOAD` (with structured payload context) and `no_data_invalid_pricing` page status for this class.
  - `NO_OFFERS` behavior remains unchanged for true empty/no-catalog pages.
- Peptide detail pages now display selected-variant pricing summary (`Average`, `Low`, `High`) based on vendor-deduped list prices.
- Recent robustness pass checks succeeded:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test` (`71` tests including single-unit filtering, Cloudflare classification, and PrestaShop extraction assertions)
- Latest vendor-run results for this pass:
  - `0ac9ca28-e764-4195-8511-81f8d31eb306` failed due smoke-baseline mismatch after single-unit scope tightening.
  - `973e56fa-dd68-4a26-b674-c54cebad5b19` rerun passed guardrails (`invariant/drift/smoke`) with `pagesSuccess=43`, `pagesFailed=2`, `offersExcludedByRule=320`.
- Validated event evidence from run `2981b852-0b96-4c2b-9b68-57344bb8506e`:
  - `https://peptiatlas.com/` emitted `INVALID_PRICING_PAYLOAD` with `productCandidates=59`, `candidatesWithPriceFields=59`, `candidatesWithPositivePrice=0`.
- Remaining known no-offer targets:
  - `https://kits4less.com/` (`safe_mode_access_blocked` with provider `cloudflare` in safe mode).
  - `https://peptiatlas.com/` (`INVALID_PRICING_PAYLOAD` expected for zero-priced payloads).
- Finnrick ingestion has a recent successful expanded-coverage run (`5233e9be-24fb-42ba-9084-2e8dde507589`) under full-access network execution.
- Expanded-run quality report is documented in:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`.
- Cross-vendor exclusion-rule work is started with a report-only audit script:
  - `npm run job:exclusion-audit` generates `reports/exclusion-audit/single-vendor-audit-latest.md`.
  - Latest audit (`2026-02-16T01:01:59Z`) found `23` single-vendor compounds across `28` offers.
  - Enforcement remains manual-gated and now has an explicit compilation step:
    - `npm run job:exclusion-enforce` compiles only reviewer-approved exclusions into `config/manual-offer-exclusions.json`.
    - Vendor ingestion loads active rules from that config and skips/deactivates matched product URLs.
- Production prerequisites remain infrastructure-oriented:
  - Working Postgres endpoint (Supabase recommended).
  - Project env vars populated in Vercel and local `.env.local`.
  - Initial `db:bootstrap` execution against target database.
