# Stack Tracker MVP

Stack Tracker is a Next.js + Postgres application that scrapes peptide pricing, normalizes formulation/size variants, and exposes both public comparison pages and admin review workflows.

Primary docs:
- Product requirements: `PRD.md`
- Current status and restart checklist: `HANDOFF.md`

## Latest Status (2026-02-17)

- Coverage:
  - Active vendors: `37`
  - Active vendor pages: `45`
- Latest full vendor run:
  - Run ID: `96ade0dc-cd5d-47aa-859d-064fe416eec6`
  - Status: `partial`
  - `pagesTotal=45`, `pagesSuccess=41`, `pagesFailed=4`
  - `offersCreated=0`, `offersUpdated=141`, `offersUnchanged=1206`
  - `unresolvedAliases=0`, `aliasesSkippedByAi=774`
  - quality guardrails: invariant `pass`, drift `pass`, smoke `pass`
- Alias queue (`queue_type='alias_match'`):
  - `open=0`, `in_progress=0`, `resolved=466`, `ignored=418`
- Current failing-page diagnostics in the latest run:
  - `Alpha G Research` (`https://www.alphagresearch.com/`) -> `NO_OFFERS` (root target is not the right storefront page; `shop-1` does expose products).
  - `Dragon Pharma Store` (`https://dragonpharmastore.com/`) -> `NO_OFFERS` (site has products; current extractor misses this PrestaShop layout from root target).
  - `Kits4Less` (`https://kits4less.com/`) -> `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`HTTP 403` Cloudflare).
  - `PeptiAtlas` (`https://peptiatlas.com/`) -> `INVALID_PRICING_PAYLOAD` (Woo candidates found, all observed price fields are zero).
- Pricing parsing fix validated:
  - Woo discovery now prefers storefront sale price from `price_html` when API numeric fields are stale.
  - Example: Eros `S 20MG` now persists as `$95.99` (`9599` cents) instead of stale `$119.99`.
- Current product-scope note:
  - Bulk/pack listings are still ingested today.
  - Planned next step is to enforce MVP scope to single-unit/single-vial offers only and defer bulk handling to v2.

## What is implemented

- Public pages:
  - `/` homepage with floating nav, metric toggle, hero, and 5 featured cards.
  - `/categories` + `/categories/[slug]` category browsing pages.
  - `/peptides/[slug]` detail template with trend chart, formulation/size switching, and vendor pagination.
  - `/peptides/[slug]` now includes selected-variant pricing summary (`Average`, `Low`, `High`) using vendor-deduped list prices.
  - `/vendors/[slug]` vendor offerings page with latest-update timestamp and catalog table.
- APIs:
  - `GET /api/home`
  - `GET /api/compounds/:slug`
  - `GET /api/compounds/:slug/offers`
  - `GET /api/compounds/:slug/trend`
  - Admin and internal job routes from the PRD.
- Scraping:
  - 24-hour vendor scrape flow with normalization and dedupe/update behavior.
  - Bounded vendor-page parallelism (default concurrency: `2`, configurable up to `3`).
  - Discovery sources are intentionally probed in fallback order per page (`WooCommerce API -> Shopify API -> HTML -> Firecrawl`) to limit duplicate vendor traffic and rate-limit risk.
  - API-first discovery using WooCommerce Store API / Shopify products API when available.
  - Per-origin API discovery caching to avoid redundant Woo/Shopify probes across repeated vendor page targets.
  - Duplicate API-origin persistence short-circuit (reuse discovery payload once per vendor/source/origin in a run).
  - Standards-first extraction from embedded page data (`schema.org` JSON-LD plus Inertia `data-page` payloads) when present.
  - HTML extraction now also parses Wix storefront warmup payloads (`#wix-warmup-data`) for product/price recovery on Wix-only vendors.
  - HTML discovery now falls back to vendor root URL when a seeded page target returns empty HTML (for example `eliteresearchusa.com/products`).
  - Discovery and HTML fetch calls now use transient retry/backoff guards to reduce `ECONNRESET`/timeout flakiness.
  - Woo discovery now emits explicit invalid-pricing diagnostics when product candidates exist but all observed prices are zero/empty (`INVALID_PRICING_PAYLOAD`).
  - Formulation inference now defaults mass-unit peptide listings like `BPC-157 10mg` to `vial` when no non-vial form is indicated.
  - Offer upsert logic now reconciles by `(vendor_id, product_url)` fallback so normalization changes (for example `other` -> `vial`) update existing rows instead of duplicating active offers.
  - Alias triage strips storefront/CTA noise and price fragments before deterministic and AI matching.
  - Non-product listings and blend/stack products are auto-skipped for single-compound tracking integrity.
  - Post-run quality guardrails now evaluate formulation invariants, run-over-run drift, and top-compound coverage smoke checks.
  - GLP shorthand (for example `RT`, `GLP-3`, `NG-1 RT`, and single-letter `R/S/T` dose aliases) is recognized to reduce avoidable manual review.
  - Single-letter GLP aliases only auto-match when paired with milligram dosage (`R ... mg`, `S ... mg`, `T ... mg`).
  - 24-hour Finnrick sync with `N/A` fallback.
  - Safe-mode robots policy handling.
  - AI-agent fallback task queue for blocked/empty pages.
  - Unresolved-alias admin alerts are batched per page and sent with timeout-bounded delivery.
  - Scrape-run heartbeat updates with lag detection alerts.
  - Stale-run reconciliation marks abandoned `running` scrape runs as failed after TTL.
  - Manual aggressive rescrape queue from admin.
- Admin:
  - Magic-link auth (single owner).
  - Review queue resolution.
  - Featured compound ordering.
  - Vendor rescrape trigger.
  - `/admin/categories` category editor (multi-category assignment + primary category selection).
- Compliance:
  - 18+ gate + informational disclaimer.
- SEO:
  - Sitemap and robots routes.

## Tech stack

- Next.js App Router (TypeScript)
- Postgres (Supabase-compatible)
- Playwright for JS-heavy extraction fallback
- Resend for email alerts
- Vercel cron endpoints

## Local setup

Node requirement: `>=20.0.0` (recommended: Node 20 LTS or newer).

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env.local
```

3. Set required env vars in `.env.local`:

- `DATABASE_URL`
- `DATABASE_SSL_MODE` (`require` for Supabase, `disable` for local Postgres)
- `DATABASE_PREPARE=false` (recommended for pooled/serverless connections)
- `ADMIN_EMAIL=stacktracker@proton.me`
- `ADMIN_AUTH_SECRET`
- `CRON_SECRET`

Optional while domain is not purchased yet:

- For local development only, leave `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, and `ALERT_TO_EMAIL` unset.
- In local non-production, submitting admin login prints the magic link in server logs.
- Keep `SCRAPER_USER_AGENT` quoted if it contains spaces/parentheses.
- Do not `source .env.local` manually; npm scripts load it automatically.
- Set `OPENAI_API_KEY` to enable AI-based product/alias classification (required if you expect `job:review-ai` to drain unresolved queue items).
- Optional: set `OPENAI_MODEL` (default: `gpt-5-mini`).
- Optional: set `FIRECRAWL_API_KEY` to enable managed rendering/extraction fallback.
- Optional runtime tuning:
  - `VENDOR_SCRAPE_CONCURRENCY` (default `2`, max `3`)
  - `SCRAPE_RUN_STALE_TTL_MINUTES` (default `30`)
  - `SCRAPE_RUN_HEARTBEAT_SECONDS` (default `20`)
  - `SCRAPE_RUN_LAG_ALERT_SECONDS` (default `120`)
  - `REVIEW_QUEUE_RETENTION_DAYS` (default `45`, prunes aged `resolved`/`ignored` review rows)
  - `NON_TRACKABLE_ALIAS_RETENTION_DAYS` (default `120`, prunes aged non-trackable alias memory where `compound_id` is null)
  - `QUALITY_INVARIANT_BPC157_10MG_MIN_OFFERS` (default `10`)
  - `QUALITY_INVARIANT_BPC157_10MG_MIN_VIAL_SHARE` (default `0.8`)
  - `QUALITY_DRIFT_BPC157_10MG_MAX_VIAL_SHARE_DROP` (default `0.2`)
  - `TOP_COMPOUND_SMOKE_LIMIT` (default `10`)
  - `TOP_COMPOUND_SMOKE_MIN_BASELINE_VENDORS` (default `4`)
  - `TOP_COMPOUND_SMOKE_MAX_VENDOR_DROP_PCT` (default `0.35`)

4. Bootstrap DB schema and seed:

```bash
npm run db:bootstrap
```

If you are reusing an existing database with stale tables from older iterations, run a one-time reset bootstrap:

```bash
DB_BOOTSTRAP_RESET=true npm run db:bootstrap
```

Import curated compound categories (supports multi-category mappings via `compound_category_map`):
- The importer now seeds missing compounds from the curated taxonomy list before applying category mappings.

```bash
npm run db:import-categories
```

Legacy Supabase cleanup plan for old `public.peptides` table:
- SQL script: `sql/maintenance/cleanup-legacy-peptides.sql`
- Behavior: preflight + timestamped backup + dependency checks + guarded drop (`perform_drop=false` by default).
- Run in Supabase SQL editor (or `psql`) and only enable the drop flag after checks are clean.

5. Run app:

```bash
npm run dev
```

## Job execution

Manual local run:

```bash
npm run job:vendors
npm run job:finnrick
npm run job:review-ai
npm run job:review-ai -- --limit=25
npm run job:exclusion-audit
npm run job:exclusion-enforce
npm run job:smoke-top-compounds
```

`job:review-ai` runs AI triage on open alias review items and auto-resolves/auto-ignores clear cases.
Use `--limit=<N>` (or `REVIEW_AI_LIMIT`) for cost-controlled slices instead of scanning the full queue.
If `OPENAI_API_KEY` is missing, AI classification falls back and queue burn-down quality drops sharply.
During active scrape-expansion phases, defer additional `job:finnrick` runs to reduce unnecessary load; run Finnrick after scrape expansion stabilizes.
`job:exclusion-audit` generates a report-only single-vendor exclusion audit (no automatic enforcement).
`job:exclusion-enforce` compiles only reviewer-approved exclusions (`manualDecision.status='approved_exclusion'`) into `config/manual-offer-exclusions.json` and can optionally deactivate currently active offers with `--apply-db`.
`job:smoke-top-compounds` compares current top-compound vendor coverage against the latest stored baseline and exits non-zero when coverage drops below configured expectations.

Runtime observability:
- `job:vendors` now emits run-level, page-level, and offer-level progress logs.
- `job:vendors` page-completion logs now include timing splits:
  - discovery/network wait (`discoveryWait`)
  - alias resolution (`aliasDet`, `aliasAi`)
  - DB persistence (`dbPersist`)
- `job:vendors` run summary now includes `qualityGuardrails` with:
  - `bpc-157` `10mg` vial-share invariant evaluation
  - run-over-run vial-share drift checks
  - top-compound coverage smoke evaluation
- `job:review-ai` now emits queue-size progress with elapsed time, throughput, ETA, and last decision/reason context.
- Baseline full review-ai run (`2026-02-15`, pre-key fix): `580` items scanned in `420.01s` (`82.86 items/min`, `~0.72s/item`) with `resolved=64`, `ignored=0`, `leftOpen=516`.
- Fresh ingestion reruns (`2026-02-15` through `2026-02-16`) were used to validate triage hardening:
  - Pre-rerun baseline: `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.
  - After vendor run `0dc6600c-aae3-4a0b-8e00-5f1c4251463c`: `open=14`.
  - After classifier fix + bounded triage reruns: `open=7`, `resolved=384`, `ignored=326`.
  - After manual adjudication of the remaining 7 branded aliases and one clean rerun (`3178fe72-36db-4335-8fff-1b3fe6ec640a`): `open=0`, `resolved=384`, `ignored=333`, with `unresolvedAliases=0` in-run.
  - Expansion batch rerun (`d515a861-ad68-4d28-9155-d2439bfe0f4a`) reopened queue to `open=73`; follow-up triage + taxonomy onboarding returned to `open=0`, `resolved=437`, `ignored=353`.
  - Second expansion-batch rerun (`37c41def-d773-4d16-9556-4d45d5902a3f`) reopened queue to `open=16`; deterministic normalization fixes + manual adjudication returned to `open=0`, `resolved=440`, `ignored=366`.
  - Third expansion-batch rerun (`9b1960c1-9db9-467e-b477-eba428770954`) reopened queue to `open=69`; single-letter GLP shorthand hardening (`R/S/T`) + manual adjudication returned to `open=0`, `resolved=463`, `ignored=412`.
  - Stabilization rerun (`783e2611-43ed-471f-b493-d572fa6fd49d`) reduced known failure pages from `6` to `1` (`peptiatlas` only), with queue reopening to `open=4` and returning to `open=0`, `resolved=463`, `ignored=416`.
  - Guardrail drift verification rerun (`8807da2b-e1d4-4ad9-93c0-15bf66999254`) held queue at `open=0` and recorded `qualityGuardrails` (`invariant=pass`, `drift=pass`, `smoke=pass`).
  - Latest run timing totals (`8807da2b-e1d4-4ad9-93c0-15bf66999254`):
    - `discoveryNetworkMs=55524` (`woo=49852`, `shopify=1442`, `html=4230`, `firecrawl=0`)
    - `aliasDeterministicMs=252041`
    - `aliasAiMs=0`
    - `dbPersistenceMs=864088`

Codex runtime note:
- In restricted sandbox mode, DNS/network resolution may fail with false `ENOTFOUND` errors.
- Use full-access mode for networked ingestion commands.

## Production-first setup (Supabase + Vercel)

1. Create a Supabase project and copy the Postgres connection string.
2. In Vercel project settings, set env vars:
   - `DATABASE_URL` (Supabase connection string)
   - `DATABASE_SSL_MODE=require`
   - `DATABASE_PREPARE=false`
   - `ADMIN_EMAIL`, `ADMIN_AUTH_SECRET`, `CRON_SECRET`
   - `OPENAI_API_KEY` (required for AI-first product classification)
   - `OPENAI_MODEL` (optional override; default `gpt-5-mini`)
   - `FIRECRAWL_API_KEY` (optional managed scrape fallback for difficult pages)
   - `FIRECRAWL_API_BASE_URL` (optional override; default `https://api.firecrawl.dev/v2`)
   - `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL` (required for production admin magic-link email delivery)
   - `NEXT_PUBLIC_APP_URL` (production base URL)
3. In your local `.env.local`, mirror the same values.
4. Run `npm run db:bootstrap` once against the target DB.
5. Deploy to Vercel (cron jobs are defined in `vercel.json`).

Cron endpoints (production/internal use):

- `/api/internal/jobs/vendors`
- `/api/internal/jobs/finnrick`

Current cron cadence in `vercel.json`:
- Vendors: daily at `00:00` UTC (`0 0 * * *`)
- Finnrick: daily at `02:00` UTC (`0 2 * * *`)

Use `Authorization: Bearer $CRON_SECRET` when invoking manually.

## Vendor seed URLs

Seeded in `sql/seed.sql`:

- `http://eliteresearchusa.com/`
- `https://eliteresearchusa.com/products`
- `https://peptidelabsx.com/`
- `https://peptidelabsx.com/product-category/products-all/`
- `https://peptidelabsx.com/shop/`
- `https://nexgenpeptides.shop/`
- `https://nexgenpeptides.shop/shop/`
- `https://nexgenpeptides.shop/product-category/us-finished/`
- `https://nexgenpeptides.shop/product-category/foundation/`
- `https://nexgenpeptides.shop/product-category/longevity/`
- `https://nexgenpeptides.shop/product-category/strength/`
- `https://peptidology.co/`
- `https://eternalpeptides.com/`
- `https://www.puretestedpeptides.com/`
- `https://verifiedpeptides.com/`
- `https://planetpeptide.com/`
- `https://simplepeptide.com/`
- `https://bulkpeptidesupply.com/`
- `https://coastalpeptides.com/`
- `https://myoasislabs.com/`
- `https://peptilabresearch.com/`
- `https://evolvebiopep.com/`
- `https://purapeptides.com/`
- `https://nusciencepeptides.com/`
- `https://peptides4research.com/`
- `https://atomiklabz.com/`
- `https://peptiatlas.com/`
- `https://purerawz.co/`
- `https://peptidecrafters.com/`
- `https://biolongevitylabs.com/`
- `https://lotilabs.com/`
- `https://nexaph.com/`
- `https://erospeptides.com/`
- `https://www.biopepz.net/`
- `https://purepeps.com/`
- `https://hkroids.com/`
- `https://reta-peptide.com/`
- `https://swisschems.is/`

## Testing

```bash
npm run test
```

## Notes

- UI is a minimal wireframe by design for early validation.
- A dedicated display font token is reserved for the future Geist Pixel visual pass.
- Once you purchase a domain, set `ALERT_FROM_EMAIL` to a verified sender (for example `alerts@yourdomain.com`) and connect Resend.

## Current status

- Code quality gates are passing under Node 20:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
- Supabase schema drift cleanup completed:
  - Removed legacy empty tables (`peptides`, `products`, `product_ingredients`, `price_history`, `finnrick_scores`).
  - Added one-primary-category guard index on `compound_category_map`.
- Bootstrap schema now includes the one-primary-category partial unique index for fresh DBs:
  - `compound_category_map_one_primary_per_compound` in `sql/schema.sql`.
- Curated category taxonomy import is operational:
  - `npm run db:import-categories` now seeds/matches compounds and applies category mappings.
  - Latest run seeded `51` compounds, applied `51`/`51` assignments, with `0` unresolved.
- Category browsing query behavior is now aligned with selector behavior:
  - `/categories` and `/categories/[slug]` include only compounds with active variants.
- Admin category editor save flow now handles network/fetch failures with explicit error feedback.
- Regression coverage added for category logic:
  - `tests/unit/category-queries.test.ts`
  - `tests/unit/categories-page.test.ts`
- Additional regression coverage for ingestion matching/extraction:
  - `tests/unit/alias-normalize.test.ts`
  - `tests/unit/extractors.test.ts` (Inertia `data-page` case)
- Additional runtime regression coverage:
  - `tests/unit/discovery.test.ts` now validates per-origin discovery cache reuse/unsupported-origin memoization.
  - `tests/unit/worker-alerts.test.ts` validates alias alert batching/truncation formatting.
  - `tests/unit/worker-no-offers.test.ts` validates invalid-pricing no-offers branch routing (`INVALID_PRICING_PAYLOAD`) and preserved `NO_OFFERS` behavior.
  - `tests/unit/peptide-page.test.ts` validates selected-variant average/low/high price summary rendering.
- Latest verified networked ingestion runs:
  - Guardrail drift verification run: `npm run job:vendors` -> `8807da2b-e1d4-4ad9-93c0-15bf66999254` (`status=partial`, `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `offersUnchanged=1243`, `unresolvedAliases=0`, with `qualityGuardrails` invariant/drift/smoke all `pass`).
  - Guardrail-baseline run: `npm run job:vendors` -> `fb5f63f0-a867-42ba-b9d3-92f450d8b2a7` (`status=partial`, `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `offersUnchanged=1243`, `unresolvedAliases=0`, with `qualityGuardrails.formulationInvariants[0].status='pass'` for `bpc-157` `10mg` vial share).
  - Stabilization run: `npm run job:vendors` -> `783e2611-43ed-471f-b493-d572fa6fd49d` (`status=partial`, `pagesTotal=38`, `pagesSuccess=37`, `pagesFailed=1`, `offersCreated=48`, `offersUpdated=0`, `offersUnchanged=1210`, `unresolvedAliases=4`, `aliasesSkippedByAi=679`, `aiTasksQueued=1`).
  - Expanded coverage run (third onboarding pass): `npm run job:vendors` -> `9b1960c1-9db9-467e-b477-eba428770954` (`status=partial`, `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `unresolvedAliases=69`, `aliasesSkippedByAi=543`).
  - Expanded coverage run (second onboarding pass): `npm run job:vendors` -> `37c41def-d773-4d16-9556-4d45d5902a3f` (`status=partial`, `pagesTotal=26`, `pagesSuccess=25`, `pagesFailed=1`, `offersCreated=274`, `offersUpdated=1`, `offersUnchanged=537`, `unresolvedAliases=16`, `aliasesSkippedByAi=339`).
  - Prior expanded coverage run (first onboarding pass): `npm run job:vendors` -> `d515a861-ad68-4d28-9155-d2439bfe0f4a` (`status=partial`, `pagesTotal=21`, `pagesSuccess=20`, `pagesFailed=1`, `offersCreated=425`, `offersUnchanged=116`, `unresolvedAliases=73`, `aliasesSkippedByAi=231`).
  - Latest fully successful vendor run remains `3178fe72-36db-4335-8fff-1b3fe6ec640a` (`pagesSuccess=10`, `pagesFailed=0`, `unresolvedAliases=0`, `offersUnchanged=116`, `offersExcludedByRule=0`).
  - Latest vendor-job attempts in the current hardening pass failed with transient DB write errors (`read ECONNRESET`):
    - `2981b852-0b96-4c2b-9b68-57344bb8506e` (`status=failed`, reached `pagesSuccess=20`, `pagesFailed=2`, and emitted validated PeptiAtlas `INVALID_PRICING_PAYLOAD` event).
    - `4557927e-e446-4896-8278-23ff46ef9b1a` (`status=failed`, early-run `read ECONNRESET`).
    - `8d565b80-2b12-47e4-b33a-cfdb510647ef` (`status=failed`, concurrency override `1`, same `read ECONNRESET`).
  - Latest `npm run job:finnrick` run remains `5233e9be-24fb-42ba-9084-2e8dde507589` (`vendorsTotal=13`, `vendorsMatched=10`, `ratingsUpdated=10`, `notFound=3`) and was intentionally deferred during the current scrape-expansion pass.
  - Current seeded coverage after expansion: `30` active vendors / `38` active vendor pages (`29` vendors with active offers).
- Latest `job:review-ai` outcomes:
  - Historical baseline full run (pre-key fix): `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516`.
  - First expansion-cycle triage + taxonomy onboarding (`2026-02-16`) reduced reopened queue from `open=73` to `open=0` (net `resolved +53`, `ignored +20`).
  - Second expansion-cycle triage (`2026-02-16`) reduced reopened queue from `open=16` to `open=0` (net `resolved +3`, `ignored +13`).
  - Third expansion-cycle triage (`2026-02-16`) reduced reopened queue from `open=69` to `open=0` (net `resolved +23`, `ignored +46`).
  - Stabilization-rerun triage (`2026-02-16`) processed reopened queue `open=4` -> `open=0`; AI ignored `1`, manual adjudication ignored `3` (`FAT BLASTER`, `P21 (P021)`, `Livagen`).
  - Current queue totals (`alias_match`): `open=0`, `in_progress=0`, `resolved=463`, `ignored=416`.
  - Strict normalized `bpc-157` `10mg` vial coverage is currently `20` active offers (including `http://eliteresearchusa.com/products/bpc-157?variant=97`).
  - Top-compound smoke script (`npm run job:smoke-top-compounds`) now runs against latest baseline snapshot `8807da2b-e1d4-4ad9-93c0-15bf66999254` and currently passes (`failureCount=0`).
  - One bounded triage attempt encountered DB timeout (`canceling statement due to statement timeout`); subsequent bounded/full reruns completed successfully.
  - `GLP1-S`/`GLP-1 (S)`/`GLP1` are now deterministically mapped to canonical `semaglutide`.
  - `cagrisema` is kept as a tracked canonical blend compound (cagrilintide + semaglutide).
- Expanded-run robustness report:
  - `reports/robustness/expanded-vendor-robustness-2026-02-16.md`
- Current remaining unstable target:
  - `https://peptiatlas.com/` now emits explicit `INVALID_PRICING_PAYLOAD` diagnostics (validated in run `2981b852-0b96-4c2b-9b68-57344bb8506e`) instead of generic `NO_OFFERS`.
  - Current blocker is transient DB write-path instability (`read ECONNRESET`) preventing a clean full 38-page vendor-run completion in this pass.
- AI triage root-cause fix applied:
  - OpenAI responses with long `reason` text previously failed local validation and were downgraded to `ai_unavailable_fallback`.
  - Classifier now accepts long reasons safely and truncates to 200 chars for storage, and chat fallback removed unsupported `temperature=0` for `gpt-5-mini`.
- Manual adjudication hardening update:
  - Ignored reviews now also write a resolved non-trackable alias record (`compound_aliases.source='admin'`, `status='resolved'`) so known branded noise does not reopen in later vendor runs.
- Cross-vendor exclusion audit bootstrap is now available:
  - `npm run job:exclusion-audit` writes a reviewable report at `reports/exclusion-audit/single-vendor-audit-latest.md`.
  - Latest report snapshot (`2026-02-16T01:01:59Z`): `activeOfferCount=115`, `activeCompoundCount=50`, `singleVendorCompoundCount=23`, `singleVendorOfferCount=28`.
  - Enforced exclusion rules are loaded from `config/manual-offer-exclusions.json` at vendor-job runtime and applied by exact product URL.
  - `npm run job:exclusion-enforce` is the only supported way to populate that file from approved audit entries.
- Alias triage heuristics are now expanded for noisy vendor naming:
  - Tirzepatide shorthand (`TZ`, `tirz`, `GLP-1 TZ`, `GLP2-T`, `GLP-2TZ`, `GLP1-T`, `GLP-2 (T)`, prefixed forms like `NG-TZ`/`ER-TZ`) resolves to `tirzepatide`.
  - Semaglutide shorthand (`semaglutide`, `sema`, `GLP1-S`, `GLP-1 (S)`, `GLP1`) resolves to `semaglutide`.
  - Retatrutide shorthand retains context-aware support (`RT`, `GLP-3`, prefixed forms like `ER-RT`) and single-letter dose aliases (`R ... mg`); semaglutide/tirzepatide now also support single-letter `S ... mg` / `T ... mg` aliases.
  - Single-letter GLP matching is milligram-only by design (`mg` required; `no-unit` / `mcg` forms do not auto-match).
  - `Cag`/`Cagrilinitide` resolves to `cagrilintide`.
  - `LL-37 Complex` maps to canonical `LL-37`.
  - CJC no-DAC Mod-GRF phrasing now maps to canonical CJC no-DAC (`cjc-1295-no-dac-with-ipa`).
  - Deterministic canonical mapping now covers `argireline` and `pal-tetrapeptide-7` cosmetic peptide labels.
  - Descriptor stripping now preserves canonical numeric identities while removing dosage-choice tails (for example `BPC-157 Peptide 5mg/10mg/20mg` -> `bpc 157`).
  - Storefront-noise stripping now removes `Current batch tested at ...` and `with Air Dispersal Kit` descriptor text.
  - HTML entities (for example `&#8211;`) are stripped before alias matching, fixing CJC with DAC normalization.
- Alias policy now avoids database clutter from non-peptide noise:
  - Non-trackable storefront noise and merch are ignored (not persisted as offers/variants).
  - `pre-workout` supplement aliases are now deterministically treated as non-trackable to avoid unresolved carry-over.
  - Generic `peptide` suffix and pack-count descriptor tails (for example `10 vials`) are stripped during alias normalization.
  - Cosmetic/non-product patterns (for example dissolving strips, body cream, hair-growth formulations, conditioner, eye-glow, t-shirt) are now treated as non-trackable in deterministic alias checks.
  - Aged ignored/resolved review rows and non-trackable alias memory are pruned automatically by retention settings.
- Job reliability hardening is in place:
  - Stale `running` scrape runs are auto-reconciled to `failed` after TTL.
  - Scrape runs persist heartbeat timestamps and emit lag alerts.
  - Vendor runs automatically prune aged operational noise records (`review_queue` resolved/ignored history + stale non-trackable alias memory) using retention env defaults.
- Remaining launch blockers are infrastructure setup tasks:
  - Supabase project + `DATABASE_URL`
  - Vercel project env vars
  - First DB bootstrap + ingestion runs

## Vendor onboarding status (2026-02-14)

Scope has been narrowed to:
- US-focused vendors
- Direct online storefronts only (no "contact to order")
- API-first ingestion wherever possible

### Audit tooling

- Script: `scripts/finnrick-vendor-audit.js`
- Purpose: pull Finnrick vendor names, exclude already-covered vendors, skip likely wholesale/China names heuristically, discover/evaluate websites, classify platform/API.
- Outputs:
  - `/tmp/finnrick-vendor-audit.json`
  - `/tmp/finnrick-vendor-audit.csv`

Run:

```bash
node scripts/finnrick-vendor-audit.js
```

### Verified vendor URLs and platform/API

- WooCommerce + public Store API:
  - `https://peptidology.co/`
  - `https://eternalpeptides.com/`
  - `https://www.puretestedpeptides.com/`
  - `https://verifiedpeptides.com/`
  - `https://planetpeptide.com/`
  - `https://simplepeptide.com/`
  - `https://bulkpeptidesupply.com/`
  - `https://coastalpeptides.com/`
  - `https://myoasislabs.com/` (from `oasispeptides.com`)
  - `https://peptilabresearch.com/`
  - `https://evolvebiopep.com/`
  - `https://purapeptides.com/`
  - `https://nusciencepeptides.com/`
  - `https://peptides4research.com/`
  - `https://atomiklabz.com/` (homepage can be Cloudflare-blocked, Store API still accessible)
- Custom app (no standard Woo/Shopify public endpoint):
  - `https://eliteresearchusa.com/`
- BigCommerce:
  - `https://limitlesslifenootropics.com/`
- Wix:
  - `https://www.simplyrichards.com/`

### Explicitly ignored/excluded in current scope

- `https://peptidegurus.com/` (contact-to-order)
- `https://peptidesforsale.com/` (not a storefront)
- `https://tydes.net/` (not a peptide vendor)

### Still needs corrected URL or confirmation

- Precision Peptide Co
- Amino Lair
- UWA Elite Peptides
- Amino Asylum (`https://aminoasylumllc.com/` appears to be the brand site but API/storefront behavior is inconsistent; keep as manual-check)

### Latest batch decisions (2026-02-14, late update)

Accepted in current scope (direct storefront and/or API-usable):
- `https://peptiatlas.com/` (Woo + Store API)
- `https://purerawz.co/` (Woo + Store API)
- `https://peptidecrafters.com/` (Woo + Store API)
- `https://biolongevitylabs.com/` (Woo + Store API)
- `https://lotilabs.com/` (Woo + Store API)
- `https://nexaph.com/` (Woo + Store API)
- `https://erospeptides.com/` (Woo + Store API)
- `https://www.biopepz.net/` (Wix storefront)
- `https://purepeps.com/` (Woo + Store API)
- `https://hkroids.com/` (Woo + Store API)
- `https://reta-peptide.com/` (Shopify + `products.json`)
- `https://swisschems.is/` (Woo + Store API)

Excluded:
- `https://www.next-health.com/peptide-therapy` (clinic-based)
- `https://www.platinumcryo.com/` (clinic-based)
- `https://www.supplementsbyhazel.com/` (clinic-based)
- `https://science.bio/` (site indicates permanently closed)
- `https://championpeptide.com` (domain-for-sale, not storefront)
- `https://peptidegurus.com/` (contact-to-order)
- `https://peptidesforsale.com/` (not a storefront)
- `https://tydes.net/` (not a peptide vendor)

Needs corrected URL or manual check:
- PurePeptides (`purepeptides.co.uk` fetch failed)
- Peptide Worldwide
- Amplified Amino (URL missing)
- Precision Peptide Co
- Amino Lair
- UWA Elite Peptides

### Latest user-provided decisions (2026-02-14, follow-up)

Accepted storefront candidates (to onboard/evaluate with API-first checks):
- `https://thepeptidehaven.com/`
- `https://us.injectify.is/`
- `https://purepeptidelabs.shop/` (US-based signals present: domestic U.S. shipping policy and contact location in Cedar Park, TX)
- `https://www.alphagresearch.com/`
- `https://kits4less.com/`
- `https://www.toppeptides.com/`
- `http://dragonpharmastore.com/`

Excluded by user:
- The Naughty Needle (vendor not found)
- Uther (non-US)
- M-Peptides (not a real vendor by that name)
- Zen Peptides (non-US)
- Mix Peptides (not a real vendor)

### Product update (UI)

Implemented:
- Category-first browsing via nav dropdown plus category routes:
  - `/categories`
  - `/categories/[slug]`
