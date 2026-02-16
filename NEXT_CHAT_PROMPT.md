# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Read first:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`

Current state to assume:
1. Alias triage queue is fully burned down (`review_queue.queue_type='alias_match'`):
   - `open=0`, `in_progress=0`, `resolved=384`, `ignored=333`.
2. Latest successful networked runs:
   - vendors: `3178fe72-36db-4335-8fff-1b3fe6ec640a` (`unresolvedAliases=0`)
   - finnrick: `8a108444-b26a-4f2a-94a9-347cc970a140`
3. AI reliability fixes are already live:
   - long OpenAI `reason` outputs no longer collapse into `ai_unavailable_fallback`
   - chat fallback no longer sends unsupported `temperature=0` for `gpt-5-mini`
4. Manual ignore persistence is hardened:
   - ignored alias reviews now also persist admin non-trackable alias memory
   - last 7 branded carry-over aliases were ignored and did not re-open on subsequent vendor run
5. Cross-vendor exclusion framework is present but manual-gated:
   - audit: `npm run job:exclusion-audit`
   - compile approved exclusions: `npm run job:exclusion-enforce`
   - runtime rules file: `config/manual-offer-exclusions.json`
   - currently `0` compiled rules
6. Coverage is still narrow:
   - active vendors: `3`
   - active vendor pages: `10`

Primary goal for this chat:
- Expand ingestion coverage and run robustness/stability validation across a larger vendor batch before moving to enforcement-heavy work.

Tasks:
1. Onboard a first expansion batch of **10 additional vetted storefront vendors** from README’s verified list (US/direct-storefront/API-usable only).
   - Add vendor + initial page targets in `sql/seed.sql` (and any required onboarding plumbing).
   - Prefer API-friendly Woo/Shopify storefronts first.
2. Run quality + ingestion cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:finnrick`
3. Run bounded triage if queue opens:
   - `npm run job:review-ai -- --limit=50` (repeat bounded slices as needed, not one huge pass).
4. Produce a robustness report (markdown) under `reports/` summarizing the expanded run:
   - per-vendor: offers discovered/persisted, unresolved aliases, skipped-by-AI, failures/policy blocks, discovery source
   - queue deltas before/after triage (`open/resolved/ignored`)
   - list vendors/pages with zero offers and likely reason
   - notable alias patterns requiring new heuristics
5. Add regression tests for any new parser/alias edge cases discovered during this expanded run.
6. Update docs (`HANDOFF.md`, `README.md`, `PRD.md`, `CHANGELOG.md`) with new run IDs, queue state, and robustness findings.

Constraints:
- Prioritize ingestion reliability and alias quality; no UI polish.
- Keep single-compound persistence strict.
- Do not let storefront noise, non-peptide products, or vendor-exclusive custom blends become tracked offers.
- Use full-access mode for networked commands (restricted sandbox can cause false DNS `ENOTFOUND` failures).
