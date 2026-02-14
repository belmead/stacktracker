# Changelog

All notable changes to Stack Tracker are documented in this file.

## [Unreleased]

### Added
- Next.js App Router MVP scaffold with public pages:
  - Homepage (`/`) with floating nav, hero, top-five cards, vendor tables.
  - Peptide detail template (`/peptides/[slug]`) with trend chart, variant switching, and pagination.
- Admin surface and workflows:
  - Magic-link auth endpoints and admin pages.
  - Review queue resolution actions.
  - Featured compounds management.
  - Vendor aggressive re-scrape queue.
- Public API endpoints:
  - `GET /api/home`
  - `GET /api/compounds/:slug`
  - `GET /api/compounds/:slug/offers`
  - `GET /api/compounds/:slug/trend`
- Internal job endpoints:
  - `GET|POST /api/internal/jobs/vendors`
  - `GET|POST /api/internal/jobs/finnrick`
- Scraping and normalization pipeline:
  - Rules-first alias matching with confidence.
  - Formulation-aware parsing and metric computation.
  - Offer history/versioning behavior for unchanged vs changed records.
  - Safe-mode robots handling + AI-agent fallback task queue.
- Data model and SQL:
  - Full schema in `sql/schema.sql`.
  - Seed data in `sql/seed.sql` including initial three vendor URLs.
- Operations and tooling:
  - `npm run db:bootstrap` to apply schema + seed without direct `psql` usage.
  - Job scripts load `.env.local` via `--env-file-if-exists`.
  - Vercel cron configuration in `vercel.json`.
- Documentation:
  - Product requirements in `PRD.md`.
  - Handoff/restart instructions in `HANDOFF.md`.
  - Updated runbook in `README.md`.
  - Vendor onboarding notes for US-direct-storefront scope and platform/API verification.
- Category browsing routes:
  - `GET /categories`
  - `GET /categories/:slug`
- Vendor offering route:
  - `GET /vendors/:slug`
- Admin category management API:
  - `POST /api/admin/categories`
- Vendor audit utility script:
  - `scripts/finnrick-vendor-audit.js` for Finnrick vendor extraction, filtering, website discovery, platform detection, and API probing.
- DB maintenance script:
  - `sql/maintenance/cleanup-legacy-peptides.sql` for safe cleanup of legacy `public.peptides` table (preflight, backup, dependency checks, guarded drop).
- Category import script:
  - `scripts/import-compound-categories.ts` plus `npm run db:import-categories` for curated category upsert/mapping with multi-category support.
  - Import flow now seeds missing compounds from the curated taxonomy list before mapping.
- Regression tests for category behavior:
  - `tests/unit/category-queries.test.ts` validates active-variant guards in category DB queries.
  - `tests/unit/categories-page.test.ts` validates `/categories` metric fallback/preservation and category link rendering.

### Changed
- Floating nav category selector now routes to category pages before compound selection.
- Admin home now shows active compounds missing a primary category assignment.
- Peptide vendor-name links now route internally to vendor catalog pages, with external offer links retained.
- Added admin category editor workflow with multi-category and primary-category assignment controls.
- Vendor catalog page now shows simplified "Last updated" time in user locale with UTC fallback.
- Category import flow now seeds curated taxonomy compounds and supports split multi-category mappings (e.g., `Longevity / Mitochondrial`).
- Improved environment handling for local and production-first setup:
  - Added `DATABASE_PREPARE` toggle.
  - Documented Supabase/Vercel-first deployment path.
- Hardened parsing logic for capsule plural detection (`capsules`).
- Discovery strategy is now explicitly API-first with a documented vendor onboarding flow:
  - Prioritize WooCommerce Store API and Shopify public product feeds.
  - Restrict target list to US-facing direct storefront vendors.
  - Treat contact-to-order and non-storefront domains as excluded.
- Vendor onboarding verification log expanded with latest batch outcomes:
  - Additional Woo/Shopify/Wix storefront URLs confirmed.
  - Clinic-based, closed, and domain-for-sale providers explicitly marked excluded in docs.
  - Follow-up list documented for unresolved vendor URLs.
- Bootstrap schema now explicitly creates the one-primary-category partial unique index:
  - `compound_category_map_one_primary_per_compound`.
- Category browsing query behavior now aligns with selector behavior by requiring active variants.
- Admin category editor save workflow now catches network/fetch failures and surfaces an explicit row-level error.

### Verified
- Passing checks under Node 20:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
