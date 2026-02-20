# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` with the current working tree changes intact.

Start by reading:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
- `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
- `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`

Current verified state:
1. Coverage:
   - active vendors: `45`
   - active vendor pages: `53`
2. Alias queue (`queue_type='alias_match'`):
   - `open=0`, `in_progress=0`, `resolved=466`, `ignored=432`
3. Parse-failure queue (`queue_type='parse_failure'`):
   - `open=21`
   - `network_filter_blocked=20`
   - `invalid_pricing_payload=1` (`https://peptiatlas.com/`)
   - `discovery_fetch_failed=0`
4. Latest full vendor run:
   - `89043ac0-e797-49c2-9755-7f928a203c6a` (`status=partial`)
   - `pagesTotal=53`, `pagesSuccess=31`, `pagesFailed=22`
   - `offersCreated=0`, `offersUpdated=0`, `offersUnchanged=823`
   - `offersExcludedByRule=328`
   - `unresolvedAliases=0`, `aliasesSkippedByAi=370`, `aiTasksQueued=22`
   - guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
5. Latest scoped suppression-validation run:
   - `c1f47324-133c-4ff5-826f-a98f82392fa4` (`vendor-scoped`, `status=partial`)
   - deterministic blocked event kept visibility and set `parseFailureQueueSuppressed=true`
   - no replacement open parse-failure row created for `https://aminoasylumllc.com/`
6. Latest smoke baseline:
   - `89043ac0-e797-49c2-9755-7f928a203c6a` (`job:smoke-top-compounds` passed)
7. `thymosin-alpha-1` coverage:
   - `27` vendors / `28` active offers
8. Latest Finnrick run:
   - `28ce6525-14ce-4cfc-b043-83f9440944ea` (`status=success`)
   - `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`
   - ratings use Finnrick `Ratings range` labels (`A`, `A to C`, `N/A`) end-to-end
9. Security dependency remediation (completed):
   - commit `47fe6997ac03d1edb23914d8a4a04c60377908d1`
   - updated `vitest` + `@vitest/coverage-v8` to `4.0.18`
   - added npm override `minimatch: ^10.2.2`
   - runtime ingestion code unchanged
10. Security CI remote validation:
    - workflow run `22238481016` ([Security CI](https://github.com/belmead/stacktracker/actions/runs/22238481016))
    - `Secret Scan (gitleaks)`: pass
    - `Dependency Vulnerability Gate`: pass (`npm audit --audit-level=high`)
    - current audit profile: `0` high/critical, `9` moderate (ESLint/AJV chain)
11. Local verification after remediation:
    - `npm run typecheck`: pass
    - `npm run lint`: pass
    - `npm run test`: pass (`80` tests)
    - `npm audit --audit-level=high`: pass

Primary tasks for next chat:
1. Decide whether to keep the current moderate-only advisory baseline or pursue a deeper lint-stack migration (for example ESLint CLI/Next 16 track) to reduce moderate advisories.
2. If any runtime dependency or scraper/runtime code changes are introduced, run the robustness cycle:
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50`
   - `npm run job:smoke-top-compounds`
3. Preserve smoke hydration and parse-failure dedupe/suppression behavior.
4. Do not rerun Finnrick unless onboarding scope changes or explicitly requested.
5. Update docs after any additional changes:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
