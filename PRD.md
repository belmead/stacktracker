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

### Out of scope (MVP)
- Checkout or transactions.
- Affiliate monetization logic (only extension readiness).
- RBAC / multi-admin authorization.
- Multi-currency conversion and settlement.
- Final autonomous ranking of top five compounds.

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
- Inputs captured:
  - Last scrape timestamp
  - Last run heartbeat timestamp (for lag/stale-run detection)
  - Product price
  - Product size/strength
  - Calculated normalized unit metrics
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

## 9. Operational Defaults
- Currency: USD.
- Timezone display: user local timezone (DB stored in UTC).
- History retention target: 24 months full detail.
- Top-five source default: auto-selection until manual pinning.
- UI stage: minimal wireframe with tokenized styles.
- Typography note: reserve slot for future Geist Pixel application in polish phase.

## 10. Current Implementation Status (as of 2026-02-16)
- MVP scaffold implemented across app, API, schema, jobs, admin, and tests.
- Code quality gates are passing under Node 20.
- Vendor catalog route (`/vendors/[slug]`) and admin category editor are implemented.
- Category taxonomy importer is implemented and currently applies `51/51` curated assignments with multi-category support.
- Category browsing queries are aligned with selector rules (active variants required).
- Bootstrap schema includes one-primary-category partial unique index on `compound_category_map`.
- Regression tests cover category query guards and categories page metric/link behavior.
- Discovery/extraction now supports custom storefront embedded payloads (Inertia `data-page`) in addition to JSON-LD/card parsing.
- Discovery runtime now memoizes per-origin Woo/Shopify API outcomes and reuses API-origin payloads to reduce redundant probes/persistence work within a scrape run.
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
- Latest `job:review-ai` baseline run (`2026-02-15`, pre-key fix) completed with `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516` in `420.01s`.
- Measured review-ai throughput baseline (`~0.72s/item`, `82.86 items/min`) is faster than the planning budget target (`~1.5s/item`) without code changes.
- Coverage expansion batches are onboarded in seed data:
  - Batch 1 added 10 vetted storefront/API vendors (`3/10` -> `13/21` vendors/pages).
  - Batch 2 added 5 vetted storefront/API vendors (`13/21` -> `18/26` vendors/pages).
  - Batch 3 added 12 vetted storefront/API vendors (`18/26` -> `30/38` vendors/pages).
- Expanded ingestion robustness cycles (`2026-02-16`) ran with:
  - Batch 1 vendor run `d515a861-ad68-4d28-9155-d2439bfe0f4a` (`status=partial`, `pagesTotal=21`, `pagesSuccess=20`, `pagesFailed=1`, `offersCreated=425`, `unresolvedAliases=73`, `aliasesSkippedByAi=231`).
  - Batch 2 vendor run `37c41def-d773-4d16-9556-4d45d5902a3f` (`status=partial`, `pagesTotal=26`, `pagesSuccess=25`, `pagesFailed=1`, `offersCreated=274`, `offersUpdated=1`, `offersUnchanged=537`, `unresolvedAliases=16`, `aliasesSkippedByAi=339`).
  - Batch 3 vendor run `9b1960c1-9db9-467e-b477-eba428770954` (`status=partial`, `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `unresolvedAliases=69`, `aliasesSkippedByAi=543`).
  - Latest Finnrick run remains `5233e9be-24fb-42ba-9084-2e8dde507589` and is intentionally deferred during active scrape-expansion passes.
- Alias queue delta across expansion cycles:
  - Batch 1: `open=73` -> `open=0` (net `resolved +53`, `ignored +20`).
  - Batch 2: `open=16` -> `open=0` (net `resolved +3`, `ignored +13`).
  - Batch 3: `open=69` -> `open=0` (net `resolved +23`, `ignored +46`).
  - Current totals: `open=0`, `in_progress=0`, `resolved=463`, `ignored=412`.
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
- Finnrick ingestion has a recent successful expanded-coverage run (`5233e9be-24fb-42ba-9084-2e8dde507589`) under full-access network execution.
- Expanded-run quality report is documented in:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`.
- Cross-vendor exclusion-rule work is started with a report-only audit script:
  - `npm run job:exclusion-audit` generates `reports/exclusion-audit/single-vendor-audit-latest.md`.
  - Latest audit (`2026-02-16T01:01:59Z`) found `23` single-vendor compounds across `28` offers.
  - Enforcement remains manual-gated and now has an explicit compilation step:
    - `npm run job:exclusion-enforce` compiles only reviewer-approved exclusions into `config/manual-offer-exclusions.json`.
    - Vendor ingestion loads active rules from that config and skips/deactivates matched product URLs.
- Remaining prerequisite for first full ingestion cycle is infrastructure:
  - Working Postgres endpoint (Supabase recommended).
  - Project env vars populated in Vercel and local `.env.local`.
  - Initial `db:bootstrap` execution against target database.
