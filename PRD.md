# Stack Tracker PRD (MVP)

## 1. Summary
Stack Tracker is a web platform for normalized peptide pricing intelligence. It scrapes vendor product data, standardizes units/formulations, stores historical pricing, and presents comparison/trend views to end users.

MVP goals:
- Aggregate vendor prices every 6 hours.
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
- Schedule: every 6 hours.
- Inputs captured:
  - Last scrape timestamp
  - Product price
  - Product size/strength
  - Calculated normalized unit metrics
- Change behavior:
  - If offer is unchanged: update `last_scraped_at` / `last_seen_at`, do not append duplicate historical point.
  - If changed: append new historical record and close previous effective window.

### Finnrick scraping
- Schedule: every 24 hours.
- Output:
  - Vendor rating if matched.
  - `N/A` rating when vendor not found.

### Smart matching
- Rules-first alias matching with confidence.
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
- SEO support via sitemap + robots routes.
- Structured scrape event logging and run summaries.

## 9. Operational Defaults
- Currency: USD.
- Timezone display: user local timezone (DB stored in UTC).
- History retention target: 24 months full detail.
- Top-five source default: auto-selection until manual pinning.
- UI stage: minimal wireframe with tokenized styles.
- Typography note: reserve slot for future Geist Pixel application in polish phase.

## 10. Current Implementation Status (as of 2026-02-14)
- MVP scaffold implemented across app, API, schema, jobs, admin, and tests.
- Code quality gates are passing under Node 20.
- Vendor catalog route (`/vendors/[slug]`) and admin category editor are implemented.
- Category taxonomy importer is implemented and currently applies `48/48` curated assignments with multi-category support.
- Supabase schema drift cleanup has removed legacy unused tables from earlier iterations.
- Remaining prerequisite for first full ingestion cycle is infrastructure:
  - Working Postgres endpoint (Supabase recommended).
  - Project env vars populated in Vercel and local `.env.local`.
  - Initial `db:bootstrap` execution against target database.
