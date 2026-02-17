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
   - active vendors: `37`
   - active vendor pages: `45`
2. Alias queue is clean (`queue_type='alias_match'`):
   - `open=0`, `in_progress=0`, `resolved=466`, `ignored=418`
3. Parse-failure queue remains separate:
   - `queue_type='parse_failure'`: `open=27`
4. Latest full vendor run:
   - `96ade0dc-cd5d-47aa-859d-064fe416eec6` (`status=partial`)
   - `pagesTotal=45`, `pagesSuccess=41`, `pagesFailed=4`
   - `offersCreated=0`, `offersUpdated=141`, `offersUnchanged=1206`
   - `unresolvedAliases=0`, `aliasesSkippedByAi=774`
   - quality guardrails: invariant/drift/smoke all `pass`
5. Latest Finnrick run:
   - `5233e9be-24fb-42ba-9084-2e8dde507589` (do not rerun unless explicitly requested)
6. Woo invalid-pricing handling is active:
   - PeptiAtlas emits `INVALID_PRICING_PAYLOAD` with detailed diagnostics (not generic `NO_OFFERS`)
7. Woo sale-price parsing fix is active:
   - Eros `S 20MG` now persists as `$95.99` (`9599` cents) via `price_html` sale extraction
8. CJC naming cleanup is active:
   - canonical `cjc-1295-with-dac-and-ipa` displays as `CJC-1295 with DAC` (legacy alias mapping preserved)
9. Remaining failed pages in latest run:
   - `https://www.alphagresearch.com/` -> `NO_OFFERS` (storefront products are on `/shop-1`)
   - `https://dragonpharmastore.com/` -> `NO_OFFERS` (site has products; current root-target extraction gap)
   - `https://kits4less.com/` -> `NO_OFFERS` + `DISCOVERY_ATTEMPT_FAILED` (`HTTP 403`, Cloudflare)
   - `https://peptiatlas.com/` -> `INVALID_PRICING_PAYLOAD` (expected)
10. Product-scope direction:
   - bulk-pack handling should be deferred to v2
   - MVP should focus on single-unit/single-vial offers only

Primary tasks for next chat:
1. Enforce single-unit offer policy at ingestion:
   - add deterministic exclusion for bulk/pack/kit/multi-vial offers
   - ensure these are excluded before variant/price aggregation for public views
   - add regression tests for single-vial-only filtering path
2. Fix `NO_OFFERS` gaps for real storefronts:
   - Alpha G Research: retarget seeded page to a parseable storefront path (`/shop-1`)
   - Dragon Pharma Store: add extraction support for current PrestaShop-style listing structure (or retarget to parseable category endpoint)
   - Kits4Less: document/handle Cloudflare 403 behavior explicitly (safe-mode limitation, retry posture, and event payload quality)
3. Re-run robustness cycle:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
   - `npm run job:vendors`
   - `npm run job:review-ai -- --limit=50` (repeat bounded slices only if alias queue reopens)
   - `npm run job:smoke-top-compounds`
4. Keep alias quality strict:
   - no storefront noise strings
   - no non-peptide products
   - no vendor-only blends unless explicitly canonicalized (`cagrisema` currently allowed)
5. Update docs after completion:
   - `/Users/belmead/Documents/stacktracker/reports/robustness/expanded-vendor-robustness-2026-02-16.md`
   - `/Users/belmead/Documents/stacktracker/HANDOFF.md`
   - `/Users/belmead/Documents/stacktracker/README.md`
   - `/Users/belmead/Documents/stacktracker/PRD.md`
   - `/Users/belmead/Documents/stacktracker/CHANGELOG.md`
   - `/Users/belmead/Documents/stacktracker/NEXT_CHAT_PROMPT.md`
