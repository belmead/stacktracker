# Stack Tracker Handoff Note

## Snapshot
- Date: 2026-02-14
- Project path: `/Users/belmead/Documents/stacktracker`
- Environment: Supabase connection working; local Postgres is not used.
- App status: `npm run db:bootstrap` and ingestion jobs are operational.
- Most recent vendor run: `ddf3aedb-8af1-43a4-a6a8-ef3a0716c75c` (`pagesTotal=10`, `pagesSuccess=9`, `pagesFailed=1`).
- Quality gates currently passing: `npm run typecheck`, `npm run lint`, `npm run test`.

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
- One vendor target still fails with `no_data`: `Elite Research USA` root page.
- `unresolvedAliases` remains high; review queue is active and expected.
- Category taxonomy mappings are now complete for curated set (`48/48` imported), but many newly seeded compounds are placeholders until scrape discovery creates active variants/offers.

## Open Risks / Remaining Work
- AI-first compound classification now drives match/skip/review decisions; quality depends on `OPENAI_API_KEY` + model behavior.
- One vendor extraction target (`eliteresearchusa.com`) needs better page targeting or fallback strategy.
- Email delivery depends on Resend sender/domain verification; local server-log fallback is available.
- Some non-BPC compound alias quality still needs curation because unresolved volume is high.
- Firecrawl fallback is optional and currently disabled unless `FIRECRAWL_API_KEY` is set.
- Newly seeded compounds may not yet appear in public selectors until they have active variants/offers (current selector filter requires variant presence).

## Immediate Next Steps
1. Re-run ingestion to increase active variant/offer coverage:
   - `npm run job:vendors`
   - `npm run job:finnrick`
   - `npm run job:review-ai`
2. Improve extraction coverage for `eliteresearchusa.com` (current known weak target) by adding/validating deeper catalog targets.
3. Re-check public category UX after ingestion:
   - `/categories`
   - `/categories/[slug]`
   - confirm only variant-backed compounds appear and counts are sensible.
4. Continue vendor onboarding from unresolved URL queue:
   - Precision Peptide Co
   - Amino Lair
   - UWA Elite Peptides
   - Peptide Worldwide
   - Amplified Amino
5. Triage review queue ambiguities after AI pass (focus on true blend/alias ambiguity, ignore CTA/noise).

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
- Expect only partial vendor coverage until Elite Research target extraction is improved.

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
1. Vendor catalog pages exist at /vendors/[slug] with local-time last-updated label.
2. Admin category editor exists at /admin/categories backed by POST /api/admin/categories.
3. Category browsing exists at /categories and /categories/[slug] and now only includes compounds with active variants.
4. DB bootstrap schema includes one-primary-category partial unique index on compound_category_map.
5. Category consistency is verified (48/48 compounds mapped with one primary each).
6. Regression tests exist for category query guards and categories page behavior.

Pick up by:
1. Running ingestion jobs and summarizing coverage deltas:
   - npm run job:vendors
   - npm run job:finnrick
   - npm run job:review-ai
2. Prioritizing next highest-impact fixes from resulting gaps.
3. Implementing the fixes and updating docs/tests as needed.
```
