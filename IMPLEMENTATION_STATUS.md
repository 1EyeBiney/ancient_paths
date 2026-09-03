# Implementation Status

Tracks the design doc §34 phases. Updated 2026-09-02.

## Completed

- **Phase 6 — Audio System — DONE.** All 8 test groups (A1-A8) are green:
  61 new tests (364 project-wide), `npx tsc --noEmit` clean, `npm run
  build` clean. Built against PHASE6_SPEC.md (written 2026-09-02 after
  Fable's review of Phase 5B; the schema's audio-asset records, melody-
  as-data, and reference validation shipped with the spec). New: `src/ui/
  audio/backend.ts` (the `AudioBackend` seam — `BrowserAudioBackend` real,
  `FakeAudioBackend` for every test), `src/ui/audio/manager.ts`
  (`AudioManager`: categories, the produced-clip queue, play caps,
  pause/replay/stop/skip, fallbacks, cancellation tokens, killAll, and
  the presenter gate), `src/ui/audio/cues.ts` + `sequencer.ts` (pure,
  tested without sound). `src/ui/presenter.ts` gained an optional
  `PresenterGate` (3 methods, extending the spec's literal 2-method
  sketch to avoid re-entrant flush handling). `src/ui/app.ts` wires the
  manager for its whole lifetime, unlocks it on the Begin-journey click,
  drives every game hook (task audio autoplay, extra-clue audio, ruling/
  stage/community/celebration cues via event-log text matching — the
  engine exposes none of these as direct getters — landmark ambient,
  killAll on every real state change and on leaving play), adds the
  Space/L/X/N controls with visible buttons, and an Audio… game-menu
  dialog (four live volume inputs, wait/interrupt speech mode).
  `scripts/make-placeholder-audio.mjs` (dependency-free WAV writer) and
  an extended `scripts/make-dev-playtest.mjs` give the dev-playtest pack
  10 audio assets (6 file, 4 synthetic melody) wired onto specific tasks.
  KEYBOARD_COMMANDS.md updated. Manual browser check (Group A8, recorded
  in OPEN_QUESTIONS.md item 24) found and fixed one real bug: a live
  volume-dialog edit wasn't reaching a clip already mid-playback —
  `AudioBackend` gained `setClipGain()`, now called from
  `AudioManager.setSettings()`. No other discrepancies.
  **Review addendum (Fable, 2026-09-03, 8 more tests, 374 project-wide;
  OPEN_QUESTIONS item 25):** fixed the failsafe timer running through a
  pause (a clip paused past its slack was declared ended and could not
  be resumed); made the engine's Insight / Journey Token "replay" effect
  reachable ("hear the audio again" actions in `resourceWindow`, wired to
  `grantReplay`); `role="group"` on the transport bar; and a **Sound
  check** screen off Welcome that plays every cue and every loaded audio
  asset one at a time with the live Audio settings — the intended way to
  test sounds without random-walking the game.

- **Phase 5B — The Map — DONE.** All 6 test groups (M1-M6) are green: 41
  tests total (297 project-wide), `npx tsc --noEmit` clean, `npm run
  build` clean (map assets copied into `dist/`). New: `src/ui/
  mapProjection.ts` (pure equirectangular projection + zod manifest
  schema), `src/ui/mapView.ts` (the aria-hidden map panel), `scripts/
  make-map.mjs` (dependency-free asset pipeline) and its committed
  output `public/map/` (manifest, satellite JPEG, parchment SVG,
  CREDITS.md). See PHASE5B_SPEC.md for the contract.
  - One shared imagery set (eastern Mediterranean) fetched live: NASA
    Blue Marble via a single GIBS WMS request (308KB, well under the
    700KB budget, no image tooling needed) and Natural Earth coastlines
    clipped/simplified/projected in pure JS into a parchment SVG (17.7KB
    vs. a 400KB budget). Both fetches succeeded; the offline-placeholder
    fallback path exists but was never exercised.
  - The map panel is `aria-hidden`; its accessible twin is the Phase 5
    landmark strip beneath it plus `allPositionsText`. Route drawn
    through the milestones with halo-labeled landmarks; team badges
    positioned by `teamMapPosition()` (percentage of the journey's own
    viewport window, interpolating toward the next milestone while
    `stagesBeyondMilestone > 0`, capped at 0.9, fanned when co-located)
    and moved by a CSS `left`/`top` transition gated behind
    `[data-reduced-motion="false"]` — the same pattern as Phase 5's
    panel animation, verified live in both states (an instant jump vs. a
    real 0.25s glide, confirmed via `getComputedStyle`, not just CSS
    text).
  - Setup gained a Map style choice (satellite/parchment/none, default
    satellite) reaching `SetupWizard.mapStyle` and the review lines.
    Group M4 drives a complete keyboard game against the REAL
    `jerusalem-rome.json` + dev-playtest and asserts every marker's
    position against `teamMapPosition()` after every step.
  - Manual browser check passed; one clarity fix made on sight (not a
    functional bug): `mapView.ts`'s SVG landmark groups and `audience.ts`'s
    strip items both used the class `landmark`, so an unscoped
    `.landmark` query silently matched both — renamed to `map-landmark`.
    Full results in OPEN_QUESTIONS item 21.
  - No changes to `src/engine/`, `src/session/`, `dev-sample.json`, or
    any spec file. The schema's `milestone.coordinates` /
    `journey.map.viewport` additions were made by Fable with the spec,
    ahead of this implementation pass.

- **Phase 5 — Audience Presentation — DONE.** All 8 test groups (V1-V8)
  are green: 34 tests total (262 project-wide), `npx tsc --noEmit`
  clean, `npm run build` clean (stylesheet bundled). New in `src/ui/`:
  audience.ts, teamBadge.ts, communityProgress.ts, styles.css; plus
  `scripts/make-dev-playtest.mjs` → `public/content/packs/dev-playtest.json`.
  See PHASE5_SPEC.md for the contract.
  - Group V1 closed the four Phase 4 review findings (OPEN_QUESTIONS
    item 16): idle re-prompt wired, help menu rendered visibly, focus to
    the new screen heading after each host action, community progress
    derived from the event log (undo-safe; the UI counter is gone).
  - The page now has one h1, an "Audience view" document region, and a
    SCOPED `role="application"` "Host controls" region (Decision 1 —
    Brian's NVDA pass decides whether it stays). `AudienceView` renders
    on the same pass as the host screens: Now playing (badge, round,
    location, stage progressbar), Task (prompt persists through
    awaitingAnswer/reveal; answer only after reveal), Teams table,
    Journey landmark strip, Community event progress, Game summary.
    Group V2 asserts audience == engine after EVERY step of a full game;
    V8 repeats that against the REAL Jerusalem-to-Rome journey.
  - Team badges: glyph + name + color, accessible name "Team X, lion";
    one preset color was darkened to pass 4.5:1 (V3). Reduced motion:
    setup toggle else `prefers-reduced-motion`, stamped on `#app`; the
    stylesheet's only animation is gated behind it (V7).
  - Setup screen gained every control Phase 4 deferred (V8). The
    dev-playtest pack (420 placeholder tasks, never ships) makes the
    browser build playable; the manual browser check passed (details and
    findings in OPEN_QUESTIONS item 19, including the deliberate
    default-team-name deviation and a Phase 9 content note).
  - `@types/node` added dev-only (OPEN_QUESTIONS item 18). No changes to
    `src/engine/`, `src/session/`, `src/content/schemas.ts`, existing
    sample content, or any spec file.

- **Phase 4 — Accessible Host Interface — DONE.** All 10 test groups
  (U1-U10) are green: 100 tests total (on top of Phase 2+3's 128, for 228
  project-wide), `npx tsc --noEmit` clean, `npm run build` clean. Lives in
  `src/ui/` (presenter.ts, speech.ts,
  keys.ts, cursorList.ts, setup.ts, screens.ts, modal.ts, undo.ts,
  app.ts); `src/main.ts` and `index.html` were rewritten to boot it,
  replacing the Phase 1 boot page. See PHASE4_SPEC.md for the full
  contract this was built against.
  - `Presenter` is the single funnel for the sighted status line and both
    live regions (visual/spoken parity is structural, not conventional);
    `KeyboardController` implements the full ladder (repeat gate, input
    firewall, native pass-through, state-gated dispatch) plus Brian's
    help-menu/keyboard-explorer gesture (`?` opens a help menu listing
    only the current state's legal bindings; a second `?` while it's open
    closes it and enters an explorer where every key describes its
    in-game function without executing anything).
  - `SetupWizard` (pure logic) + `App`'s single-page setup screen cover
    journey/team-count/team-names/duration/pace/difficulty/seed as real
    interactive controls; enabled packs/categories, audio settings, and
    community catch-up stay at sensible defaults this phase (covered by
    Group U4's unit tests) — a deliberate, noted scope trim for Phase 5's
    visual pass, not a hidden gap.
  - `ScreenRenderer` covers all 12 states the Phase 2 engine actually
    reaches (see OPEN_QUESTIONS item 14 for the 5 declared-but-unused
    `GameState` members it deliberately doesn't build screens for).
    `CursorList` is the one reusable accessible selection widget (arrow
    to move, first-letter type-ahead, Enter confirms, rows also
    clickable) — used by the setup screen, forkChoice's route list, and
    (after a real bug was found — see below) recoverDecision,
    surplusDecision, and a contribution event's pledge choices, none of
    which had any keyboard path before that fix.
  - `tests/ui/group-u10-full-game.test.ts` drives a complete 2-team game
    from the startup screen through real setup to `gameSummary`, once
    using only dispatched `KeyboardEvent`s and once using only
    `.click()`, verifying every state actually entered produced at least
    one announcement — the dual-modality proof.
  - Three real bugs found and fixed while building Group U10 (not
    silently worked around in tests): mouse-clicked actions bypassed the
    illegal-command error handling keyboard-dispatched ones got (fixed by
    centralizing into one `runActionSafely()`); a contribution community
    event's screen looped back to team-1 forever once every team had
    already responded, instead of stopping; recoverDecision,
    surplusDecision, and contribution pledges had no keyboard path at all
    (see above).
  - Two engine-API gaps found and worked around without touching
    `src/engine/` (OPEN_QUESTIONS item 15): `teachingReveal`'s text isn't
    in the public read API (worked around via the UI's own loaded
    content pack, looked up by task id, safe since teaching text only
    ever shows post-reveal); there's no getter for a community event's
    live room progress, so the UI tracks it locally from commands it
    dispatches itself.
  - Manually smoke-tested in a real browser against the actual
    dev-sample content: the startup screen, setup wizard, and
    `SessionBuildError` handling all work correctly live. Starting a
    real game against the 8-task dev-sample pack correctly fails the
    sufficiency check (presented politely, not a crash) — expected, since
    dev-sample is deliberately minimal (CONTENT_AUTHORING.md); a
    production pack (Phase 9) will have enough content to actually play
    a full game in the browser.
  - No changes were made to `src/engine/`, `src/session/`,
    `src/content/schemas.ts`, sample content, or any spec file during
    Phase 4. jsdom was added as a devDependency (test-only).

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

(none — Phase 6 complete; Phase 7 not yet planned)

## Remaining

- Phase 7 — Community and offering systems.
- Phase 8 — Persistence and recovery.
- Phase 9 — Version-one content (full General Bible pack, full journey).
- Phase 10 — Accessibility and balance audit.
