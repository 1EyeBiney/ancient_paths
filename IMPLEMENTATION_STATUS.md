# Implementation Status

Tracks the design doc §34 phases. Updated 2026-09-02.

## Completed

- **Phase 3 — Session Builder — DONE.** All 11 test groups (S1-S11) are
  green: 34 tests total (on top of Phase 2's 94, for 128 project-wide),
  `npx tsc --noEmit` clean, `npm run build` clean. Lives in `src/session/`
  (builder.ts — `buildSessionDeck()`/`SessionDeck`; plan.ts —
  `planSession()`/`totalRequiredSuccesses()`). See PHASE3_SPEC.md for the
  full contract this was built against.
  - `SessionDeck implements TaskSource`, dropping in as a real replacement
    for `ArrayTaskSource`: seeded per-team category rotation (streak-limit
    2, fairness within ±2 per category, excluding "community"),
    focus-stage round-robin with fallthrough to ordinary rotation,
    difficulty-weighted draws (gentle/standard/challenging) with a
    deterministic adjacency fallback for empty buckets, a community-event
    reserve carved out only from relay events (contribution events never
    draw from the deck), graceful oldest-first exclusion relaxation when
    over-exclusion would empty a category, and a two-tier (fail below
    1.0x / warn below 1.5x projected demand) sufficiency check.
  - `planSession()` wraps Phase 2's `estimateMinutes` with duration
    targets (short/standard/long/custom), pace (relaxed/standard/quick,
    scaling avgTaskSeconds), and the §36 tasksPerTurn-by-team-count table;
    `totalRequiredSuccesses()` sums top-level stages and averages fork
    routes (a team only ever travels one route, so expected cost is the
    mean, not the sum).
  - `tests/session/group-s11-engine-integration.test.ts` proves the deck
    slots into the real Phase 2 engine end to end: a full 2-team game
    (reusing the Phase 2 full-game-smoke driving script) against a real
    `SessionDeck` reaches gameSummary with a `taskHistory` that's
    identical across two runs of the same seed and diverges across a
    changed one.
  - Minor prose-precision note, not a blocking bug: PHASE3_SPEC's own
    "~59 minutes" reference anchor computes to 60.333... min under the
    formula exactly as specified; the actual binding requirement (landing
    inside the standard target's no-warning band) holds regardless —
    pinned exactly in `tests/session/group-s10-plan-session.test.ts`.
  - No bugs were found in `src/session/` during test-writing — every
    test-group failure along the way traced back to test setup, never the
    implementation. No changes were made to `src/engine/`,
    `src/content/schemas.ts`, sample content, or any spec file during
    Phase 3.

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

- Phase 4 — Accessible host interface: PHASE4_SPEC.md written
  (2026-09-02) and ready for unattended implementation; test groups
  U1-U10; ACCESSIBILITY_PATTERNS.md binds; jsdom pre-authorized for DOM
  tests. Implementation not yet started.
  - Known spec discrepancy found and NOT silently fixed: PHASE2_SPEC's
    estimator worked example (4 teams, 3 tasks, 9 successes, 2 events)
    computes ~72.7 min under the formula as literally specified, not the
    claimed 50-60 min. See OPEN_QUESTIONS.md (item 11, RESOLVED — the
    formula and constants stand as implemented; the design consequence
    moves to journey authoring, not the estimator).

## Remaining

- Phase 4 — Accessible host interface (dual modality: mouse/visual AND
  keyboard/screen reader).
- Phase 5 — Audience presentation (same single window per current plan).
- Phase 6 — Audio system.
- Phase 7 — Community and offering systems.
- Phase 8 — Persistence and recovery.
- Phase 9 — Version-one content (full General Bible pack, full journey).
- Phase 10 — Accessibility and balance audit.
