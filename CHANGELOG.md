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
- Vendor audit utility script:
  - `scripts/finnrick-vendor-audit.js` for Finnrick vendor extraction, filtering, website discovery, platform detection, and API probing.

### Changed
- Improved environment handling for local and production-first setup:
  - Added `DATABASE_PREPARE` toggle.
  - Documented Supabase/Vercel-first deployment path.
- Hardened parsing logic for capsule plural detection (`capsules`).
- Discovery strategy is now explicitly API-first with a documented vendor onboarding flow:
  - Prioritize WooCommerce Store API and Shopify public product feeds.
  - Restrict target list to US-facing direct storefront vendors.
  - Treat contact-to-order and non-storefront domains as excluded.

### Verified
- Passing checks under Node 20:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
