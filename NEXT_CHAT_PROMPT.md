# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Read first:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`

Current state to assume:
1. Vendor scrape reliability mitigations are implemented:
   - stale-run reconciler (TTL-based `running -> failed`)
   - `scrape_runs.heartbeat_at` updates + lag alerts
   - bounded vendor page concurrency (`VENDOR_SCRAPE_CONCURRENCY`, default `2`, max `3`)
2. Vendor scrape frequency is now every 24 hours in `vercel.json` (`0 0 * * *` UTC).
3. Discovery/runtime optimizations are implemented:
   - per-origin Woo/Shopify discovery cache reuse
   - duplicate API-origin persistence short-circuit
   - batched unresolved-alias alerts with timeout-bounded email send
4. Peptide page subhead now shows coverage figures:
   - `<vendors> vendors · <variations> variations`
5. Latest successful runs:
   - vendors: `ddf17efd-d5b7-48e9-abf3-4c601eea872f` (10/10 pages success, 0 failed, unresolved aliases 90)
   - finnrick: `13073ab4-1f9b-498e-8c81-5130b0c35333`
6. Quality gates pass:
   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`

Next task:
1. Run `npm run job:review-ai` to completion and record throughput (items/minute and approx sec/item) plus total resolved/ignored/remaining queue counts.
2. Compare measured AI throughput against the target budget (~1.5 sec/item) and report whether the estimate is realistic without code changes.
3. If runtime bottlenecks remain in non-AI ingestion paths, prioritize low-risk observability/perf fixes only (do not change AI decision quality logic).
4. Update `HANDOFF.md`, `README.md`, `PRD.md`, and `CHANGELOG.md` with the new run metrics and findings.

Constraints:
- Keep UI polish out of scope for now.
- Focus on ingestion reliability/performance and pre-prod operational readiness.
