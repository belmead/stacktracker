# Stack Tracker MVP

Stack Tracker is a Next.js + Postgres application that scrapes peptide pricing, normalizes formulation/size variants, and exposes both public comparison pages and admin review workflows.

Primary docs:
- Product requirements: `PRD.md`
- Current status and restart checklist: `HANDOFF.md`

## What is implemented

- Public pages:
  - `/` homepage with floating nav, metric toggle, hero, and 5 featured cards.
  - `/categories` + `/categories/[slug]` category browsing pages.
  - `/peptides/[slug]` detail template with trend chart, formulation/size switching, and vendor pagination.
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
  - API-first discovery using WooCommerce Store API / Shopify products API when available.
  - Per-origin API discovery caching to avoid redundant Woo/Shopify probes across repeated vendor page targets.
  - Duplicate API-origin persistence short-circuit (reuse discovery payload once per vendor/source/origin in a run).
  - Standards-first extraction from embedded page data (`schema.org` JSON-LD plus Inertia `data-page` payloads) when present.
  - Alias triage strips storefront/CTA noise and price fragments before deterministic and AI matching.
  - Non-product listings and blend/stack products are auto-skipped for single-compound tracking integrity.
  - Retatrutide shorthand (for example `RT`, `GLP-3`, `NG-1 RT`) is recognized to reduce avoidable manual review.
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
```

`job:review-ai` runs AI triage on open alias review items and auto-resolves/auto-ignores clear cases.
Use `--limit=<N>` (or `REVIEW_AI_LIMIT`) for cost-controlled slices instead of scanning the full queue.
If `OPENAI_API_KEY` is missing, AI classification falls back and queue burn-down quality drops sharply.

Runtime observability:
- `job:vendors` now emits run-level, page-level, and offer-level progress logs.
- `job:review-ai` now emits queue-size progress with elapsed time, throughput, ETA, and last decision/reason context.
- Baseline full review-ai run (`2026-02-15`, pre-key fix): `580` items scanned in `420.01s` (`82.86 items/min`, `~0.72s/item`) with `resolved=64`, `ignored=0`, `leftOpen=516`.
- Queue burn-down is now complete after bounded slices plus manual adjudication:
  - `alias_match`: `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.

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
- `https://nexgenpeptides.shop/`

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
- Latest verified networked ingestion runs:
  - `npm run job:vendors` succeeded with run `ddf17efd-d5b7-48e9-abf3-4c601eea872f` (`pagesSuccess=10`, `pagesFailed=0`, `unresolvedAliases=90`, `offersUnchanged=86`).
  - `npm run job:finnrick` succeeded with run `13073ab4-1f9b-498e-8c81-5130b0c35333`.
- Latest `job:review-ai` completion (`2026-02-15`):
  - Baseline full run summary (pre-key fix): `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516`.
  - Post-key bounded slices plus final manual adjudication closed the queue.
  - Queue totals now (`alias_match`): `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.
- Alias triage heuristics are now expanded for noisy vendor naming:
  - Tirzepatide shorthand (`TZ`, `tirz`, `GLP-1 TZ`, prefixed forms like `NG-TZ`/`ER-TZ`) resolves to `tirzepatide`.
  - Retatrutide shorthand retains context-aware support (`RT`, `GLP-3`, prefixed forms like `ER-RT`).
  - `Cag`/`Cagrilinitide` resolves to `cagrilintide`.
  - `LL-37 Complex` maps to canonical `LL-37`.
  - HTML entities (for example `&#8211;`) are stripped before alias matching, fixing CJC with DAC normalization.
- Alias policy now avoids database clutter from non-peptide noise:
  - Non-trackable storefront noise and merch are ignored (not persisted as offers/variants).
  - `pre-workout` supplement aliases are now deterministically treated as non-trackable to avoid unresolved carry-over.
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
