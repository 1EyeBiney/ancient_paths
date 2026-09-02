# Implementation Status

Tracks the design doc §34 phases. Updated 2026-09-02.

## Completed

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

- (nothing in flight — Phase 2 is specified and ready to implement
  against PHASE2_SPEC.md)

## Remaining

- Phase 2 — Headless game engine (state machine, turns, stages, forks,
  resources, amplified outcomes, Journey Tokens, surplus, Service,
  milestones, victory) with the §33.1 test list.
- Phase 3 — Session builder (seeded balanced decks, duration estimator).
- Phase 4 — Accessible host interface (dual modality: mouse/visual AND
  keyboard/screen reader).
- Phase 5 — Audience presentation (same single window per current plan).
- Phase 6 — Audio system.
- Phase 7 — Community and offering systems.
- Phase 8 — Persistence and recovery.
- Phase 9 — Version-one content (full General Bible pack, full journey).
- Phase 10 — Accessibility and balance audit.
