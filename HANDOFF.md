# Stack Tracker Handoff Note

## Snapshot
- Date: 2026-02-13
- Project path: `/Users/belmead/Documents/stacktracker`
- Status: MVP scaffold complete; waiting on Supabase + Vercel environment wiring before first real ingestion cycle.

## What is done
- Implemented core app structure (public pages, admin pages, APIs, jobs, DB layer, scraping pipeline).
- Added schema + seed SQL (`sql/schema.sql`, `sql/seed.sql`).
- Added DB bootstrap script (`npm run db:bootstrap`) so `psql` is not required.
- Added script-level env loading (`--env-file-if-exists=.env.local`) for jobs/bootstrap.
- Added AI-agent fallback task model + workflow for blocked/no-data scrape cases.
- Added compliance gate, SEO routes, and base observability tables.
- Added tests for metric normalization, request parsing, and product-name parsing.
- Cleaned TypeScript + lint issues and verified checks passing under Node 20.

## Verified commands (Node 20)
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test` ✅

## Current blockers
- No reachable Postgres instance configured for this environment yet.
- `DATABASE_URL` in local env points to `127.0.0.1:5432` but DB is not running there.
- Production sender domain/email still pending (acceptable for now if using dev magic-link fallback).

## Recommended next steps
1. Create Supabase project and copy connection string.
2. Configure Vercel project + environment variables.
3. Sync same env vars into local `.env.local`.
4. Run:
   - `npm run db:bootstrap`
   - `npm run job:vendors`
   - `npm run job:finnrick`
5. Validate:
   - `/`
   - `/peptides/[slug]`
   - `/admin/login`
   - `/admin/review`
   - `/admin/featured`
   - `/admin/vendors`

## Required env vars for first real run
- `DATABASE_URL`
- `DATABASE_SSL_MODE` (`require` for Supabase)
- `DATABASE_PREPARE=false`
- `ADMIN_EMAIL`
- `ADMIN_AUTH_SECRET`
- `CRON_SECRET`
- `ALERT_TO_EMAIL`

Optional / next:
- `RESEND_API_KEY`
- `ALERT_FROM_EMAIL` (after domain verification)

## Design notes to preserve
- Keep frontend minimal until data flows are validated.
- CSS tokens are intentionally centralized for rapid UI iteration.
- Geist Pixel is planned for later visual pass (not applied yet by design).

## If starting a new thread
Share this file plus `PRD.md`, and state:
- whether Supabase/Vercel are now configured,
- the current `DATABASE_URL` target (local vs Supabase),
- whether first ingestion jobs have been executed.
