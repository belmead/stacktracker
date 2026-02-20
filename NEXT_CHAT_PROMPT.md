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
   - `open=22`
   - `network_filter_blocked=20`
   - `discovery_fetch_failed=1` (`https://elitepeptides.com/`)
   - `invalid_pricing_payload=1` (`https://peptiatlas.com/`)
4. Latest vendor run:
   - `99ba0dab-5eec-4836-a078-44eb46a1d835` (`status=partial`)
   - `pagesTotal=53`, `pagesSuccess=31`, `pagesFailed=22`
   - `offersCreated=16`, `offersUpdated=5`, `offersUnchanged=802`
   - `offersExcludedByRule=328`
   - `unresolvedAliases=0`, `aliasesSkippedByAi=370`, `aiTasksQueued=22`
   - quality guardrails: `invariant=pass`, `drift=pass`, `smoke=pass`
5. Event profile for latest run:
   - `NETWORK_FILTER_BLOCKED=20`
   - `DISCOVERY_FETCH_FAILED=1`
   - `DISCOVERY_ATTEMPT_FAILED=126`
   - `INVALID_PRICING_PAYLOAD=1`
6. Smoke reliability:
   - `thymosin-alpha-1` coverage is `27` vendors / `28` active offers
   - smoke script passes against baseline `99ba0dab-5eec-4836-a078-44eb46a1d835`
7. Hybrid deterministic network-filter policy now implemented:
   - parse-failure payload includes `networkFilterSignature`
   - repeated triaged identical signatures are queue-suppressed for `NETWORK_FILTER_BLOCKED_QUEUE_SUPPRESSION_DAYS` (default `14`)
   - events preserve visibility via `networkFilterSignature` + `parseFailureQueueSuppressed`
8. Security CI status:
   - workflow file exists locally at `.github/workflows/security-ci.yml`
   - local `npm audit --audit-level=high` passes (`0` vulnerabilities)
   - `gh auth status` is authenticated
   - remote `belmead/stacktracker` currently has no Actions workflows/runs, so `Security CI` run/log verification is blocked until workflow files are pushed
9. Latest Finnrick run:
   - `084b323c-6472-4554-b11f-d0aa19f0889c`
   - `vendorsTotal=45`, `vendorsMatched=28`, `ratingsUpdated=28`, `notFound=17`
   - unmatched vendors correctly remain `N/A`

Primary tasks for next chat:
1. Validate hybrid suppression behavior in live queue flow:
   - confirm repeated deterministic `network_filter_blocked` signatures stay event-visible while avoiding duplicate parse-failure queue churn after triage.
2. Investigate and remediate the single `discovery_fetch_failed` outlier (`https://elitepeptides.com/`) if deterministic cause is identified.
3. Validate GitHub Actions Security CI remotely once workflow files are available in GitHub:
   - confirm `gitleaks` + `npm audit --audit-level=high` job statuses/logs.
4. Preserve smoke hydration and parse-failure dedupe/suppression behavior while making any follow-up changes.
5. Re-run robustness cycle after any code changes:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50`
   - `npm run job:smoke-top-compounds`
6. Re-run Finnrick only if onboarding scope changes or explicitly requested.
7. Update docs after completion:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
