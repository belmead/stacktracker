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
   - `open=0`, `in_progress=0`, `resolved=466`, `ignored=432`
3. Parse-failure queue:
   - `queue_type='parse_failure'`: `open=54`
   - reason buckets: `invalid_pricing_payload=7`, `no_offers_found=44`, `safe_mode_cloudflare_blocked=3`
4. Latest vendor run:
   - `425efba4-127e-4792-903d-8113bf45c206` (`status=partial`)
   - `pagesTotal=53`, `pagesSuccess=32`, `pagesFailed=21`
   - `offersCreated=1`, `offersUpdated=29`, `offersUnchanged=822`
   - `offersExcludedByRule=325`
   - `unresolvedAliases=0`, `aliasesSkippedByAi=376`, `aiTasksQueued=21`
   - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
5. Smoke regression (`thymosin-alpha-1 24 -> 0`) is fixed:
   - Root cause was top-`N` snapshot omission in smoke comparison, not actual offer loss.
   - Current live `thymosin-alpha-1` coverage is `27` vendors / `27` active offers.
   - Hydration fix is in both:
     - `lib/scraping/worker.ts`
     - `scripts/run-top-compounds-smoke-test.ts`
6. Parse-failure metadata backfill:
   - legacy open cloudflare-block rows were backfilled for provider/status/source completeness (`3/3` complete).
7. Latest smoke command:
   - `npm run job:smoke-top-compounds` passes (`failureCount=0`, baseline `425efba4-127e-4792-903d-8113bf45c206`)
8. Latest Finnrick run:
   - `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun unless explicitly requested)
9. Most notable new issue:
   - 20 vendor roots now emitted `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` with `no_offers_found` in the latest run:
     - `https://aminoasylumllc.com/`
     - `https://amplifypeptides.com/`
     - `https://atomiklabz.com/`
     - `https://biolongevitylabs.com/`
     - `https://www.biopepz.net/`
     - `https://coastalpeptides.com/`
     - `https://crushresearch.com/`
     - `https://dragonpharmastore.com/64-peptides`
     - `https://elitepeptides.com/`
     - `https://erospeptides.com/`
     - `https://hkroids.com/`
     - `https://kits4less.com/`
     - `https://peptidesworld.com/`
     - `https://purapeptides.com/`
     - `https://purepeptidelabs.shop/`
     - `https://purepeps.com/`
     - `https://purerawz.co/`
     - `https://simplepeptide.com/`
     - `https://thepeptidehaven.com/`
     - `https://trustedpeptide.net/`
   - `https://peptiatlas.com/` remains expected `INVALID_PRICING_PAYLOAD`.

Primary tasks for next chat:
1. Install recommended Codex skills first (via `skill-installer`):
   - list curated skills, then install:
     - `security-best-practices`
     - `security-threat-model`
     - `security-ownership-map`
     - `gh-fix-ci`
     - `playwright`
     - `doc`
   - after install, remind user to restart Codex so new skills load.
2. Investigate the 20-page `no_offers_found` regression cluster:
   - determine whether this is target URL drift, discovery source regression, anti-bot/access behavior, or HTML/API parsing regression;
   - prioritize deterministic fixes that restore prior successful coverage while preserving strict scope and no-noise policy.
3. Keep smoke reliability strict:
   - preserve the baseline-slug hydration behavior for smoke checks;
   - ensure future snapshots don’t reintroduce false zero-vendor comparisons.
4. Parse-failure queue quality:
   - keep blocked-site payload metadata complete for new rows;
   - triage reason buckets to reduce recurring `no_offers_found` noise where deterministic fixes are possible.
5. Re-run robustness cycle after fixes:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50`
   - `npm run job:smoke-top-compounds`
6. Start implementation of production security hardening (not just planning):
   - add CI secret scanning and dependency-vuln gating;
   - enforce log/event secret-redaction guarantees;
   - validate least-privilege runtime DB credential model.
7. Update docs after completion:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
