# Stack Tracker Handoff Note

## Snapshot
- Date: 2026-02-14
- Project path: `/Users/belmead/Documents/stacktracker`
- Environment: Supabase connection working; local Postgres is not used.
- App status: `npm run db:bootstrap` and ingestion jobs are operational.
- Most recent vendor run: `ddf3aedb-8af1-43a4-a6a8-ef3a0716c75c` (`pagesTotal=10`, `pagesSuccess=9`, `pagesFailed=1`).
- Quality gates currently passing: `npm run typecheck`, `npm run lint`, `npm run test`.

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

## Current Data Reality (Important)
- `bpc-157` is no longer empty after the latest expanded scrape.
- Active BPC listings now include pure BPC products from at least 2 vendors.
- Blended BPC entries (for example BPC + TB500 blends) are now inactive for `bpc-157`.
- One vendor target still fails with `no_data`: `Elite Research USA` root page.
- `unresolvedAliases` remains high; review queue is active and expected.

## Open Risks / Remaining Work
- AI-first compound classification now drives match/skip/review decisions; quality depends on `OPENAI_API_KEY` + model behavior.
- One vendor extraction target (`eliteresearchusa.com`) needs better page targeting or fallback strategy.
- Email delivery depends on Resend sender/domain verification; local server-log fallback is available.
- Some non-BPC compound alias quality still needs curation because unresolved volume is high.
- Firecrawl fallback is optional and currently disabled unless `FIRECRAWL_API_KEY` is set.

## Immediate Next Steps
1. Start app on a known free port:
   - `npm run dev -- -p 3001` (or another free port)
2. Re-run ingestion once after pull/restart:
   - `npm run job:vendors`
   - `npm run job:finnrick`
   - `npm run job:review-ai`
3. Confirm BPC detail page behavior and admin auth flow (checklist below).
4. Set `OPENAI_API_KEY` in `.env.local` and verify alias decisions move from review to AI match/skip outcomes.
5. Triage only true ambiguities in review queue (blends/uncertain cases), not CTA noise.

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
Share this file plus `PRD.md`, then include:
- Current dev port in use.
- Whether latest `job:vendors` and `job:finnrick` were run after pulling code.
- Whether `/peptides/bpc-157` currently shows active non-blend offers.
- Whether admin local magic-link log appears in terminal.
