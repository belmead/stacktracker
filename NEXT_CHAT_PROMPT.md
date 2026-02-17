# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Start by reading:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
- `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
- `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`

Current state to assume:
1. Coverage:
   - active vendors: `45`
   - active vendor pages: `53`
2. Alias queue (`queue_type='alias_match'`):
   - `open=14`, `in_progress=0`, `resolved=466`, `ignored=418`
3. Parse-failure queue remains separate:
   - `queue_type='parse_failure'`: `open=33`
4. Latest vendor run:
   - `e0a4b0fc-2063-4c38-9ac5-e01d271deaa4` (`status=failed`)
   - `pagesTotal=53`, `pagesSuccess=51`, `pagesFailed=2`
   - `offersCreated=151`, `offersUpdated=0`, `offersUnchanged=1205`
   - `offersExcludedByRule=427`
   - `unresolvedAliases=14`, `aliasesSkippedByAi=784`, `aiTasksQueued=2`
   - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=fail`
   - smoke fail detail: `thymosin-alpha-1` vendor coverage dropped `24 -> 0` (`required=16`)
5. Latest passing guardrail baseline run:
   - `973e56fa-dd68-4a26-b674-c54cebad5b19` (`status=partial`, guardrails all `pass`)
6. Latest Finnrick run:
   - `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun unless explicitly requested)
7. Single-unit offer enforcement is active:
   - deterministic exclusion for bulk/pack/kit/multi-vial offers
   - exclusions happen before alias/variant/price aggregation
   - worker emits `OFFER_EXCLUDED_SCOPE_SINGLE_UNIT`
8. Safe-mode access-block handling is generalized:
   - provider-aware classification uses `safe_mode_access_blocked`
   - Cloudflare remains tagged for compatibility (`safe_mode_cloudflare_blocked`)
9. Woo invalid-pricing handling is active:
   - `https://peptiatlas.com/` emits `INVALID_PRICING_PAYLOAD` (expected)
10. Remaining failed pages in latest run:
   - `https://kits4less.com/` -> `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`safe_mode_access_blocked`, provider `cloudflare`, `HTTP 403`)
   - `https://peptiatlas.com/` -> `INVALID_PRICING_PAYLOAD`
11. Newly onboarded vendors this pass (all page status `success`):
   - `precisionpeptideco.com`
   - `aminoasylumllc.com`
   - `elitepeptides.com`
   - `peptidesworld.com`
   - `amplifypeptides.com`
   - `peptidesupplyco.org`
   - `trustedpeptide.net`
   - `crushresearch.com`
12. Open alias-review items needing manual adjudication:
   - Amplify Peptides: `SYN-31 10mg`, `HN-24 10mg`, `SNP-8 10mg`, `PNL-3 20mg`
   - Amino Asylum: `T2 200MCG/ML`, `Prami`, `Adex`, `Stampede`, `PYRO 7MG`, `Helios`, `GAC EXTREME`
   - Crush Research: `Triple Agonist 15mg : Single`
   - Peptides World: `P-21-10Mg`, `Adipotide-FTPP 10mg`

Primary tasks for next chat:
1. Resolve reopened alias queue:
   - manually adjudicate the 14 `ai_review_cached` items (resolve vs ignore with strict peptide scope)
   - rerun `npm run job:review-ai -- --limit=50` to confirm queue closure (`open=0`)
2. Investigate smoke regression (`thymosin-alpha-1`):
   - identify whether drop is from alias mapping, exclusion filtering, extraction gaps, or canonical-name drift
   - fix deterministically and preserve strict non-noise alias policy
3. Parse-failure queue triage hardening:
   - audit `queue_type='parse_failure'` open items (`33`) by reason bucket
   - ensure blocked-site payload quality stays high (`safe_mode_access_blocked` metadata completeness)
4. Re-run robustness cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50` (repeat bounded slices only if alias queue reopens)
   - `npm run job:smoke-top-compounds`
5. Keep alias quality strict:
   - no storefront noise strings
   - no non-peptide products
   - no vendor-only blends unless explicitly canonicalized (`cagrisema` currently allowed)
6. Update docs after completion:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
