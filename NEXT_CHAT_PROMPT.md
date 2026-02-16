# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Start by reading:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
- `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`

Current state to assume:
1. Alias triage queue is fully burned down again:
   - `open=0`, `in_progress=0`, `resolved=463`, `ignored=412`.
2. Coverage after third expansion batch:
   - active vendors: `30`
   - active vendor pages: `38`
3. Latest vendor runs:
   - latest expanded run: `9b1960c1-9db9-467e-b477-eba428770954` (`status=partial`, `pagesTotal=38`, `pagesSuccess=32`, `pagesFailed=6`, `offersCreated=347`, `offersUpdated=1`, `offersUnchanged=766`, `unresolvedAliases=69`, `aliasesSkippedByAi=543`, `aiTasksQueued=4`, `duration≈2975s`)
   - latest fully successful vendor run: `3178fe72-36db-4335-8fff-1b3fe6ec640a`
4. Latest Finnrick run remains:
   - `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun during scrape-expansion unless explicitly requested)
5. Important mapping/rules:
   - `GLP1-S` / `GLP-1 (S)` / `GLP1` => `semaglutide`
   - tirzepatide shorthand includes `GLP2-T` / `GLP-2TZ` / `GLP1-T` / `GLP-2 (T)`
   - single-letter GLP shorthand supports `R ... mg` / `S ... mg` / `T ... mg` only (`mg` required)
   - `cagrisema` is intentionally kept as a tracked canonical blend compound
   - descriptor stripping keeps canonical numeric identity (for example `BPC-157`) while removing dosage tails
   - storefront-noise stripping includes `Current batch tested at ...` and `with Air Dispersal Kit`
   - deterministic cosmetic mappings for `argireline` and `pal-tetrapeptide-7` are active
6. Known failures in latest expanded run:
   - `https://www.biopepz.net/` -> `NO_OFFERS`
   - `https://eliteresearchusa.com/products` -> `NO_OFFERS`
   - `https://peptiatlas.com/` -> `NO_OFFERS`
   - `https://simplepeptide.com/` -> `DISCOVERY_ATTEMPT_FAILED` (`woocommerce_store_api` aborted) + `NO_OFFERS`
   - `https://purerawz.co/` -> `SCRAPE_PAGE_ERROR` (`read ECONNRESET`)
   - `https://reta-peptide.com/` -> `SCRAPE_PAGE_ERROR` (`read ECONNRESET`)
7. Runtime architecture constraints to respect while improving throughput:
   - page targets already run with bounded worker parallelism
   - discovery probes are fallback-ordered per page (`Woo -> Shopify -> HTML -> Firecrawl`) by design
   - unresolved alias AI classification is still inline in scrape offer persistence path

Pick up by:
1. Stabilize third-batch scrape reliability on the six failed/zero-offer targets listed above.
2. Add runtime observability that separates:
   - network/discovery wait time per source
   - alias resolution time (deterministic vs AI)
   - DB persistence time
3. Run robustness cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50` (repeat bounded slices as needed)
4. Keep alias quality strict:
   - no storefront noise
   - no non-peptide products
   - no vendor-only custom blends unless explicitly canonicalized (`cagrisema` currently allowed)
5. Add/expand regression coverage for any new parsing or alias normalization edge cases found.
6. Update:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
