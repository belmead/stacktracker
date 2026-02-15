# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Read first:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`

Current state to assume:
1. AI triage is now operational locally because `OPENAI_API_KEY` is configured.
2. Queue movement after key activation:
   - Baseline run (pre-key fix): `itemsScanned=580`, `resolved=64`, `ignored=0`, `leftOpen=516`, `420.01s`.
   - Three post-key slices (`25` each): combined `resolved=31`, `ignored=39`, `leftOpen=5`.
   - Current queue totals (`alias_match`): `open=446`, `resolved=218`, `ignored=39`, `in_progress=0`.
3. Alias/AI behavior updates are implemented:
   - storefront noise stripping (prices + CTA text like `Add to Cart`)
   - non-product listing auto-ignore
   - blend/stack auto-skip for single-compound integrity
   - retatrutide shorthand handling (`RT`, `GLP-3`, `NG-1 RT` context)
   - richer `job:review-ai` progress logs (elapsed/rate/ETA/last reason)
4. DB noise control is implemented:
   - vendor run prunes aged `review_queue` `resolved|ignored` rows (`REVIEW_QUEUE_RETENTION_DAYS=45`)
   - vendor run prunes aged non-trackable alias memory (`NON_TRACKABLE_ALIAS_RETENTION_DAYS=120`)
5. Latest successful networked jobs:
   - vendors: `ddf17efd-d5b7-48e9-abf3-4c601eea872f`
   - finnrick: `13073ab4-1f9b-498e-8c81-5130b0c35333`

Next tasks:
1. Run quality gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
2. Continue alias queue burn-down in a cost-controlled way (single 25-item slice if tooling supports it; otherwise run full triage and report throughput + queue deltas).
3. Report only the items that remain unresolved after that run, with likely reasons grouped (e.g., true ambiguity vs missing canonical compound vs parsing noise).
4. Spot-check ignored decisions for precision (especially retatrutide shorthand and storefront-noise cases) and tighten heuristics if needed.
5. Update the four core docs again with new queue numbers/findings.

Constraints:
- Keep focus on ingestion reliability and alias-triage quality (not UI polish).
- Preserve single-compound persistence policy; non-peptide/storefront noise should not become offers/variants.
