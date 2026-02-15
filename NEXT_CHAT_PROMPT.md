# Next Chat Prompt

Continue from `/Users/belmead/Documents/stacktracker` on branch `codex/mvp-scaffold` at the latest commit.

Read first:
- `/Users/belmead/Documents/stacktracker/HANDOFF.md`
- `/Users/belmead/Documents/stacktracker/README.md`
- `/Users/belmead/Documents/stacktracker/PRD.md`
- `/Users/belmead/Documents/stacktracker/CHANGELOG.md`

Current state to assume:
1. Alias triage is fully burned down (`review_queue.queue_type='alias_match'`):
   - `open=0`, `in_progress=0`, `resolved=383`, `ignored=320`.
2. AI + deterministic alias handling is upgraded and active:
   - storefront noise stripping (prices + CTA text) and HTML-entity cleanup
   - non-product listing auto-ignore
   - blend/stack protection for single-compound integrity (avoid unsafe hardcoded vendor phrases)
   - retatrutide shorthand (`RT`, `GLP-3`, prefixed forms like `ER-RT`)
   - tirzepatide shorthand (`TZ`, `tirz`, `GLP-1 TZ`, prefixed forms like `NG-TZ`/`ER-TZ`)
   - cagrilintide shorthand (`Cag`, `Cagrilinitide` misspelling)
   - CJC-with-DAC malformed title cleanup (`&#8211;` case)
   - LL-37 vendor "complex" naming maps to canonical `LL-37`
3. Manual adjudication policy decisions already applied:
   - Elite branded one-off formulas were ignored (IDs below).
   - `Peak Power` was treated as vendor-exclusive noise and ignored.
   - `MK-777` is real but currently excluded until it appears cross-vendor.
   - Elite-tail ignored IDs:
     - `08fcf622-f268-492c-b9c8-dfd1572740fc`
     - `3e88f067-0b27-4d37-9908-d81643f2f25a`
     - `33621fc8-3dd4-4de2-a00a-d73a4d047ec5`
     - `ceb72c07-8f36-4d29-bf6d-dab68be4cceb`
     - `754d2bd9-93bf-4d4a-9ba3-b93544734976`
     - `b6218a16-9496-4df2-adbb-a44d79e75bef`
     - `ce97cfa1-52fb-4d15-98b2-dce886a87ff9`
     - `1921e8e4-6a4a-4afc-9ec8-ff6102edfb20`
     - `d3587ad3-487e-443f-9b49-2e70d0ce5f5f`
     - `1b1b93da-e0e7-4636-bed5-35bd18b8cf14`
     - `8378487f-2b0b-4315-ae8c-29885562da88`
     - `1478d05e-fc21-41f4-8c58-317c59e528e4`
4. Latest successful networked jobs:
   - vendors: `ddf17efd-d5b7-48e9-abf3-4c601eea872f`
   - finnrick: `13073ab4-1f9b-498e-8c81-5130b0c35333`
5. Latest category import state:
   - `npm run db:import-categories` -> `seededCompoundCount=51`, `appliedCount=51`, `unresolvedCount=0`.

Next tasks:
1. Run quality gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`
2. Run a fresh ingestion cycle:
   - `npm run job:vendors`
   - `npm run job:finnrick`
3. If new alias-review items appear, triage with bounded slices (`--limit=25`) and report only unresolved items grouped by likely reason.
4. Start the cross-vendor exclusion rule work:
   - produce a reviewable report of compounds/products that appear at only one vendor
   - keep manual confirmation before enforcing exclusion
   - do not accidentally exclude valid peptides that are just poorly named
5. Update docs with new run IDs, queue deltas, and exclusion-audit decisions.

Constraints:
- Keep focus on ingestion reliability and alias-triage quality (not UI polish).
- Preserve single-compound persistence policy; non-peptide/storefront noise and vendor-exclusive custom blends should not become tracked offers.
