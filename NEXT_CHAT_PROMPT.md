# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` with a clean working tree.

Start by reading:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
- `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
- `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
- `/Users/belmead/Documents/stacktracker/SECURITY.md`

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
7. Latest Finnrick run:
   - `28ce6525-14ce-4cfc-b043-83f9440944ea` (`status=success`)
   - `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`
8. Security dependency remediation + policy state:
   - remediation commit: `47fe6997ac03d1edb23914d8a4a04c60377908d1`
   - policy enforcement commit: `5d7b105f55195f48757a25fc0d0106f21ab67ca5`
   - `vitest` and `@vitest/coverage-v8` at `4.0.18`
   - npm override: `minimatch ^10.2.2`
   - policy docs/config now present:
     - `SECURITY.md`
     - `security/moderate-advisory-exceptions.json`
     - `scripts/security/enforce-moderate-advisories.mjs`
9. Current dependency vulnerability profile:
   - `npm audit --audit-level=high`: pass (`0` high/critical)
   - `npm audit --omit=dev --audit-level=moderate`: pass (`0` production vulnerabilities)
   - `npm run security:check-moderates`: pass (`moderate=9`, `tracked=9`, `missing=0`, `expired=0`)
10. Latest validated Security CI run:
    - `22239142426` ([Security CI](https://github.com/belmead/stacktracker/actions/runs/22239142426))
    - `Secret Scan (gitleaks)`: pass
    - `Dependency Vulnerability Policy Gate`: pass

Primary tasks for next chat:
1. Maintain the moderate-exception lifecycle:
   - keep owner/ticket/expiry current in `security/moderate-advisory-exceptions.json`
   - remove stale exceptions when advisories clear
   - expire or renew exceptions before `2026-05-21`
2. Optional hardening track: reduce or eliminate the `9` moderate dev-tooling advisories via lint-stack modernization (for example ESLint CLI migration / Next lint deprecation path), then re-verify policy gates.
3. If any runtime dependency or scraper/runtime code changes are introduced, run the robustness cycle:
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50`
   - `npm run job:smoke-top-compounds`
4. Do not rerun Finnrick unless onboarding scope changes or explicitly requested.
5. Update docs after any additional changes:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
   - `/Users/belmead/Documents/stacktracker/SECURITY.md`
