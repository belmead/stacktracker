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
   - `open=0`, `in_progress=0`, `resolved=440`, `ignored=366`.
2. Coverage after second expansion batch:
   - active vendors: `18`
   - active vendor pages: `26`
3. Latest vendor runs:
   - latest expanded run: `37c41def-d773-4d16-9556-4d45d5902a3f` (`status=partial`, `pagesTotal=26`, `pagesSuccess=25`, `pagesFailed=1`, `offersCreated=274`, `offersUpdated=1`, `offersUnchanged=537`, `unresolvedAliases=16`, `aliasesSkippedByAi=339`, `aiTasksQueued=1`)
   - latest fully successful vendor run: `3178fe72-36db-4335-8fff-1b3fe6ec640a`
4. Latest Finnrick run remains:
   - `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun during scrape-expansion unless explicitly requested)
5. Important mapping/rules:
   - `GLP1-S` / `GLP-1 (S)` / `GLP1` => `semaglutide`
   - tirzepatide shorthand includes `GLP2-T` / `GLP-2TZ` / `GLP1-T` / `GLP-2 (T)`
   - `cagrisema` is intentionally kept as a tracked canonical blend compound
   - descriptor stripping keeps canonical numeric identity (for example `BPC-157`) while removing dosage tails
   - storefront-noise stripping includes `Current batch tested at ...` and `with Air Dispersal Kit`
   - deterministic cosmetic mappings for `argireline` and `pal-tetrapeptide-7` are active
6. Known failure in expanded run:
   - `https://eliteresearchusa.com/products` still reports `NO_OFFERS` under safe-mode extraction.

Pick up by:
1. Onboard the next vetted vendor batch in `/Users/belmead/Documents/stacktracker/sql/seed.sql` from README’s verified storefront list (US/direct storefront/API-usable only).
2. Run robustness cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50` (repeat as needed)
3. Keep alias quality strict:
   - no storefront noise
   - no non-peptide products
   - no vendor-only custom blends unless explicitly canonicalized (`cagrisema` currently allowed)
4. Add/expand regression coverage for any new parsing or alias normalization edge cases found.
5. Update:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
