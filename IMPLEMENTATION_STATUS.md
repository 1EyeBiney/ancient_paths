# Implementation Status

Tracks the design doc §34 phases. Updated 2026-09-02.

## Completed

- **Phase 2 — Headless Game Engine — DONE.** All 9 test groups (A-I) plus
  the "definition of done" full-game smoke test are green: 94 tests total,
  `npx tsc --noEmit` clean, `npm run build` clean. Engine lives in
  `src/engine/` (engine.ts, types.ts, rng.ts, errors.ts, taskSource.ts,
  estimator.ts, offering.ts). See PHASE2_SPEC.md for the full contract this
  was built against, and the group-by-group notes below (kept for
  traceability) for what each test group actually covers.
  - `tests/engine/full-game-smoke.test.ts` plays a complete 2-team game
    against the real testJourney/testPack fixtures — stages, a fork, both
    community event kinds, surplus/offering, a Journey Token, and Provision
    recovery — start to gameSummary, in one continuous script driven
    reactively off `getState()` rather than a hard-coded turn count.
  - Known spec discrepancy, NOT silently fixed: PHASE2_SPEC's estimator
    worked example (4 teams, 3 tasks, 9 successes, 2 events) computes
    ~72.7 min under the formula exactly as specified, not the claimed
    50-60 min; `turnOverheadSeconds=50s` is the constant driving the gap
    (dropping it to roughly 5-15s would land the example in range). See
    OPEN_QUESTIONS.md. The engine implements the formula literally; Group I's
    test asserts the actual ~72.7 min output, not the unreachable range.
  - Test-ergonomics additions to the engine beyond PHASE2_SPEC's literal
    text (all additive, none change real-game defaults):
    `EngineOptions.startingResources` (real play still starts every team at
    0/0/0), `getPendingSurplus()`, `getPendingChoicesForTeam()`, and
    `getEffectiveStageRequirement()` on the read API.
  - `TeamState.pendingForkId` and 4 endgame/position fields
    (`stagesBeyondMilestone`, `finishedTeamIds`, `roundNumber`,
    `finishRoundNumber`) were added to `src/engine/types.ts`; two flat
    costs the design doc leaves unspecified (`insightEffectCost`,
    `recoverCostProvision`) were added to `src/config/defaults.ts`. No
    changes were made to `src/content/schemas.ts`, sample content, or the
    design doc during Phase 2.

- **Phase 1 — Project Foundation**
  - TypeScript + Vite + Vitest + Zod project scaffold (static build,
    `base: "./"` for GitHub Pages).
  - Configurable defaults (§36) in `src/config/defaults.ts`.
  - Core engine types (§28) and application states (§25) in
    `src/engine/types.ts` (states include `recoverDecision` per the
    host-as-player amendment).
  - Content schemas (§17) with §33.2 validation rules in
    `src/content/schemas.ts`; loader + cross-validation in
    `src/content/loader.ts`.
  - Sample content: `public/content/packs/general-bible.json` (8 tasks,
    one per category, including assisted/amplified variants) and
    `public/content/journeys/jerusalem-rome.json` (4 milestones,
    3-route fork, 2 community events).
  - Boot page (`index.html` + `src/main.ts`) that loads, validates, and
    reports content visually and via a live region.
  - Test suite: `tests/content.test.ts` — 18 tests covering valid loads
    and §33.2 rejections. All passing.

- **Design finalization for Phase 2 (2026-09-02)**: design doc amended to
  revision 1.1 (host-as-player; recover replaces retry; reveal precedes
  ruling). Schemas extended: variant `options` arrays (with answer-present
  validation), community events as relay/contribution discriminated union
  with room rewards, journey `offeringOutcomes` weighted pool (all four
  categories required). Sample journey/pack updated; 24 tests passing.
  PHASE2_SPEC.md written as the unattended-implementation contract.

## Active

- (nothing in flight — Phase 2 complete; Phase 3 not yet started)
  - Known spec discrepancy found and NOT silently fixed: PHASE2_SPEC's
    estimator worked example (4 teams, 3 tasks, 9 successes, 2 events)
    computes ~72.7 min under the formula as literally specified, not the
    claimed 50-60 min. See OPEN_QUESTIONS.md.

## Remaining

- Phase 3 — Session builder (seeded balanced decks; the duration estimator
  itself already exists in `src/engine/estimator.ts` from Phase 2 — Phase 3
  wires it into real setup-time deck generation and replaces
  `ArrayTaskSource` with a real balanced `TaskSource` implementation behind
  the same interface).
- Phase 4 — Accessible host interface (dual modality: mouse/visual AND
  keyboard/screen reader).
- Phase 5 — Audience presentation (same single window per current plan).
- Phase 6 — Audio system.
- Phase 7 — Community and offering systems.
- Phase 8 — Persistence and recovery.
- Phase 9 — Version-one content (full General Bible pack, full journey).
- Phase 10 — Accessibility and balance audit.
