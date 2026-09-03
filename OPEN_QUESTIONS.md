# Open Questions

Per design doc §1.10 and §37: decisions made with the "simplest reversible
option" rule are recorded here, along with genuinely unresolved questions.
Items marked DECIDED were ruled on by Brian and override the design doc.

## Decided (2026-09-02)

1. **DECIDED — Hosting**: internet-served static app on Brian's GitHub space
   (GitHub Pages). No backend. Spec's "no internet during play" amended to
   "loads from the web; offline caching is a possible later enhancement."
2. **DECIDED — Dual modality**: mouse + visual play is first-class alongside
   keyboard + screen reader (most churches won't run a screen reader).
3. **DECIDED — Host-as-player**: the host never sees/hears answers before a
   team commits aloud. Flow: answer aloud → host reveals to everyone → host
   rules. No private host channel, no secondary display. (Brian's
   preference; revisit only if it proves complicating.)
4. **DECIDED — Provision "retry" is now "recover"**: after a failure, spend
   Provision to draw a replacement task (same category and difficulty, same
   success opportunity, same turn) from the deck's reserves. Authored
   retry-variants are used where content provides them. A publicly revealed
   answer is never re-asked.
5. **DECIDED — Journey plan**: composite Pauline route for version one;
   "Paul's Voyage to Rome" (Acts 27–28, storm-flavored) reserved as the
   second journey.
6. **DECIDED — Stage counts** (working values pending playtests): Short ≈ 2,
   Standard ≈ 3–4, Long ≈ 5–6 stages; not every milestone is a stage
   boundary. The duration estimator is a first-class feature.
7. **DECIDED — Hymn rights**: public-domain (pre-1929) hymns only, with
   self-produced renditions. Narration is text-first; produced recordings
   come later.

8. **DECIDED (2026-09-02, round 2)** — Design doc amended to revision 1.1
   (host-as-player throughout §8.2/§14/§15/§20/§25). Multiple-choice options
   are structured data on task variants; Insight's eliminate-option works
   only where options exist and one option must contain the answer
   (validated). Community Events ship as exactly two data-driven shapes in
   v1: relay and contribution (see schemas + PHASE2_SPEC). Offering
   outcomes are authored data in the journey (weighted pool, every category
   present, no severe negatives; "none" carries humor). Endgame: the round
   finishes so all teams get equal turns; same-round finishers share the
   victory. Duration estimator formula per PHASE2_SPEC (constants are
   parameters; playtests tune them).

12. **DECIDED (2026-09-02, round 4)** — New content shapes: the "Voice
    Portrait" / Event Scene spoken-clue tasks are defined in
    CONTENT_AUTHORING.md §3b, with a `clueAudio` parallel array added to
    the task schema (validated same-length as `clues`; engine untouched).
    Hymn melodies are DATA (note-sequence JSON) synthesized client-side —
    variations are parameters, not files (CONTENT_AUTHORING.md §3c); the
    melody schema and sequencer land with PHASE6_SPEC. Author-known
    content: Brian chose the HONOR SYSTEM (he plays, sits out his own
    tasks); the excludeTags/setup-toggle mechanism is designed and shelved.
    ElevenLabs licensing must be confirmed before shipping any voice clip.

13. **DECIDED (2026-09-02, round 5, by the spec author — Brian may veto)**
    — PHASE4_SPEC.md rulings: ruling keys are C correct / I incorrect /
    K skipped, SINGLE-press (state-gated, undoable) — press-twice confirm
    is reserved for undo (Ctrl+Z) and ending the session early.
    Help/explorer per Brian's ruling (2026-09-02, verbatim decision, not
    vetoable spec-author choice): `?` opens the help menu (on-screen
    shortcut list, Up/Down navigable); a SECOND `?` while help is open
    closes it and enters keyboard-explorer mode (keys announce their
    in-game function, Escape exits); H/F1 remain plain open/close
    aliases; no F2 binding. Escape opens the
    game menu when there is nothing to cancel. jsdom is pre-authorized as
    a devDependency for Phase 4 DOM tests (rule 5 record: needed for
    headless keyboard/live-region testing; no runtime dependency added).
    Determinism note: `SessionDeck.previewPlan()` consumes the deck's
    seeded RNG stream, so setup previews must use a throwaway deck and
    the real deck is built fresh at session generation (binding in
    PHASE4_SPEC). Phase 4 has no persistence — a page refresh loses the
    game until Phase 8.

14. **Found during Phase 4 Group U3, NOT silently patched.** The
    `GameState` type (`src/engine/types.ts`) declares `taskPreview`,
    `taskPresentation`, `progressResolution`, `stageCompletion`, and
    `hostRuling` — part of design doc §25's full suggested state list —
    but a full read of every `session.state = "..."` assignment in
    `src/engine/engine.ts` (Phase 2) shows the real dispatch logic never
    enters any of them: `presentTask` goes straight from `beginTurn` to
    `resourceWindow`, and progress/stage-completion bookkeeping happens
    inline within other transitions rather than as its own observable
    state. The 12 states the engine actually reaches are: `ready`,
    `beginTurn`, `forkChoice`, `resourceWindow`, `awaitingAnswer`,
    `answerReveal`, `recoverDecision`, `teachingReveal`,
    `surplusDecision`, `landmarkIntroduction`, `communityEvent`,
    `gameSummary`. `src/ui/keys.ts`'s `ENGINE_PLAY_STATES` constant (and
    every "global" keybinding's legality) is built from this reachable
    set, not the full type union — documented there and in
    KEYBOARD_COMMANDS.md rather than fixed, per the rule not to modify
    `src/engine/`. `src/ui/screens.ts` should follow the same reachable
    set when it's built. Not a bug to fix, just a real gap between the
    type's aspirational completeness and what Phase 2 actually built;
    revisit only if a later phase needs one of the five unused states.

15. **Found while building `src/ui/screens.ts`, worked around without
    touching `src/engine/`.** Two public-read-API gaps for Phase 4:
    (a) during `teachingReveal`, nothing in `PublicTask`/`RevealedAnswer`
    exposes the task's actual `teachingReveal` (or `historicalNote`)
    text — worked around by having the UI look the task up by id (still
    valid at that point; `currentTask` isn't cleared until
    `finishTeaching`) in its OWN copy of the loaded content pack, which is
    not privacy-sensitive since teaching text is always shown AFTER the
    reveal. (b) there is no getter for a community event's live
    `roomProgress`/`pledgedTotal` — `screens.ts` tracks these itself,
    incremented only by commands the renderer itself dispatches
    (`relayAnswer`/`contribute`), so the local count can never drift from
    the engine's own private one. Neither is a functional bug — both
    produce a fully correct UI — but a future Phase 2 revision could add
    `getTeachingText()`/`getCommunityEventProgress()`-style getters to
    remove the workarounds if it's ever touched again.

16. **Phase 4 review (Fable, 2026-09-02) — findings, all folded into
    PHASE5_SPEC Group V1 rather than patched out of band.** (a) The idle
    re-prompt is never wired: `Presenter.setIdleWatcher()` exists and is
    unit-tested, but `App` never calls it. (b) The help menu has no
    visible list — `KeyboardController` announces rows but nothing renders
    them, contrary to Brian's "displayed on the screen" ruling and the
    parity principle. (c) Focus falls to `<body>` after every host action
    because the screen container is wiped and rebuilt; Phase 5 moves it
    to the new screen heading (a response to the user's own action).
    (d) `screens.ts` tracks community-event progress in a local object
    that `undo` cannot revert; Phase 5 derives it from the event log.
    Also noted, not for Phase 5: Phase 2's `dispatch()` pushes the
    pre-undo snapshot onto history even for an `undo` command, so a
    second Ctrl+Z after an undo acts as a redo — accepted Phase 2
    behavior, but worth a deliberate ruling before Phase 8's action log.
    Two design decisions in PHASE5_SPEC for Brian's veto: the host-
    controls region gets a SCOPED `role="application"` (NVDA browse mode
    swallows single-letter hotkeys; the audience view stays a document);
    and a generated, obviously-fake `dev-playtest` pack (420 tasks) is
    added so the browser build is actually playable — `dev-sample`'s 8
    tasks cannot pass the sufficiency check for the real journey.

17. **DECIDED (2026-09-02) — the map.** Spec'd as PHASE5B_SPEC.md (Fable
    added `milestone.coordinates` + `journey.map.viewport` to the schema
    and authored the sample journey's coordinates with it). Brian chose Tiers 2 AND 3 with
    a host-selectable background (satellite imagery or period/parchment
    style), built as its own phase after Phase 5. Requirements added by
    the ruling: the map must serve MORE THAN ONE journey (further Pauline
    trips and "Paul's Voyage to Rome" are coming), so the imagery covers
    the whole eastern Mediterranean / Near East once and each journey
    declares its own viewport (bounding box) plus per-milestone
    latitude/longitude — never a per-journey hand-cropped picture.
    Hardware baseline: an "average" laptop must run it; the test fleet is
    Brian's two ~6-year-old laptops (target) and his Dell Inspiron 16
    Plus 7630 (i7-13700H, 32 GB, Iris Xe — the strong case; see
    C:\nbs\sysinfo.txt). Static image + SVG animation fits that budget;
    the Tier 1 live globe stays a stretch goal. Original vision, kept for
    the record: Brian wants the
    audience screen to feel like a game, not decorated text: ideally a
    photorealistic satellite-style map of the region with each team's
    route animating as it progresses; failing that, a period/"ancient"
    or 1980s-classroom style map illustrated with progress. Fable's
    assessment: (Tier 1) a live 3D globe (CesiumJS-class) is real but
    depends on streamed imagery tiles, API keys, licensing, and heavy
    WebGL — not something to trust on a church laptop mid-game; stretch
    goal only. (Tier 2, RECOMMENDED) NASA Blue Marble imagery (public
    domain) cropped once by a script into a shipped web image, with an
    SVG overlay drawing the route and gliding team badges between
    landmarks (reduced motion → jump). No servers, no keys, runs on any
    laptop. (Tier 3) the same overlay over a parchment/Natural Earth
    (public domain) rendering — swappable background, could be a setup
    choice. Needs: latitude/longitude per milestone in the journey schema
    (Fable to spec — schema change), an imagery-prep script, and a map
    component. Plan: its own phase spec ("the map") immediately after
    Phase 5, before audio; the Phase 5 landmark strip remains the
    information/text equivalent, the map is the sighted layer per the
    parity principle. Confirm the actual Sunday hardware (laptop age,
    TV vs projector) before committing to animation ambition.

18. **Dependency record (CLAUDE.md rule 5), Phase 5:** `@types/node`
    added as a devDependency (test-only; `tsconfig` `types` gains
    `"node"`). Reason: Group V7/V8 tests read `styles.css`,
    `dev-playtest.json`, and the real `jerusalem-rome.json` from disk to
    keep the stylesheet and the generated pack honest, which needs
    `node:fs`/`node:path` typings. No runtime dependency added; the
    generator script itself is dependency-free.

19. **Phase 5 manual browser check (2026-09-02) — results and one
    deliberate deviation.** Startup → setup → three tasks → reveal →
    stage completion (Journey Token earned, strip marker moved to
    Caesarea) → relay community event → resolve → next team's turn, all
    against dev-playtest + the real `jerusalem-rome.json`, with the
    audience view and host screens in step at every point and no console
    errors. Findings: (a) DEVIATION from PHASE4_SPEC's "prefilled Team 1…
    Team N": the engine phrases everything as "Team ${name}", so default
    names produced "Team Team 1" on screen and in speech. Defaults are
    now the preset symbol words ("Cross", "Lion", "Dove", …), matching
    each team's badge; a host can still type anything. Brian may veto.
    (b) Content note for Phase 9, not fixable here (sample content is
    off-limits): the sample journey's Caesarea relay has
    `successThreshold: 7`, unreachable when 2 teams each answer once per
    pass — the room simply fails and play continues; authoring should
    size thresholds to team count or make relays multi-pass. (c) Tooling
    note: the desktop Browser pane's key action sends `key: ""` for
    "Return" (works for "Enter"); not an app bug — real keyboards send
    "Enter", which is what the jsdom suites exercise.

20. **Brian's Phase 5 NVDA verdict (2026-09-02): Decision 1 CONFIRMED.**
    R/S/C/I and the `?` help menu worked under NVDA on the live site; one
    team was played through the second stage. The scoped
    `role="application"` on the host-controls region stays. Noted for a
    later tweak, not now: the game keys only fire while focus is INSIDE
    that region (by design — browse mode keeps the audience view
    readable), so after reading the audience view Brian had to move focus
    back down before some keys worked. Candidate tweak for Phase 10's
    accessibility audit: a landmark/hotkey that jumps focus to the host
    controls, or announcing "press Tab to return to the controls" when a
    game key is pressed outside the region. Default team names
    ("Team Cross" / "Team Lion") — no objection raised; stands unless
    Brian says otherwise.

21. **Phase 5B (the map) manual browser check (2026-09-02) — passed, one
    small clarity fix made along the way.** Against the real
    `jerusalem-rome.json` + dev-playtest, satellite style: the real Blue
    Marble crop renders correctly (Rome and the Italian coastline
    recognizable), route line and halo-labeled landmarks in place, two
    team badges fanned at Jerusalem. Played a full stage (3 correct
    answers) to Caesarea; on arrival, the marker's `--x`/`--y` updated to
    Caesarea's coordinates and the landmark/community-event screens
    triggered correctly (Journey Token earned for the perfect stage,
    "The Harbor Gathering" relay pending) — matches the Phase 5 check's
    findings, same content, still correct. Confirmed BOTH motion states
    live via `getComputedStyle`: this sandboxed browser's own
    `prefers-reduced-motion` reports `true` by default, and under that
    the marker's `transition-duration` is genuinely `0s` (an instant
    jump, not just an unused CSS property); switching the setup "Reduce
    motion" checkbox off flips `transition-duration` to `0.25s` on
    `left`/`top`, confirming the glide is real. Switched Map style to
    parchment mid-check: the warmer route/halo colors and the Natural-
    Earth coastline render correctly, no console errors either style.
    One thing WORTH NOTING for future debugging (not a functional bug,
    fixed on sight): `mapView.ts`'s SVG landmark groups and
    `audience.ts`'s strip `<li>` items both used the class `landmark`:
    an unscoped `document.querySelectorAll(".landmark")` — exactly the
    kind of ad-hoc query someone debugging live would reach for —
    silently returns both (8 elements, looking like duplication when it
    is not). Renamed the map's own class to `map-landmark` and updated
    its one test reference; `.landmark-strip .landmark` /
    `.map-overlay .map-landmark` are now unambiguous. No other issues
    found.

22. **PHASE6_SPEC (2026-09-02) — decisions by the spec author, Brian
    may veto.** Phase 5B reviewed: clean (M1-M6, 297 tests, browser-
    checked; nothing to carry forward). Audio groundwork Fable made with
    the spec: `audioAssetSchema` now takes exactly one source (`filePath`
    OR `melody` note data — CONTENT_AUTHORING §3c's shape, finalized);
    packs and journeys gain `audioAssets` arrays; every audio reference
    (task/variant `audioAsset`, `clueAudio[i]`, milestone
    `ambientAudioAsset`) must resolve within its own pack/journey (6 new
    content tests). Found: the engine does NOT enforce `maxPlays`
    (CONTENT_AUTHORING says it does) — it only logs the Insight replay
    spend; play caps are therefore the audio manager's job (UI-side),
    not an engine change. Decisions: new keys **L** replay task audio,
    **X** stop clip, **N** skip optional narration (Space stays pause/
    resume); interface-speech behavior defaults to **wait** (polite
    announcements defer until the clip ends, assertive interrupts), with
    "interrupt" selectable in a new game-menu Audio dialog; placeholder
    audio is synthetic WAV tones plus synthetic scale/arpeggio "tunes" in
    dev-playtest — no real voices, no ElevenLabs (item 12's licensing
    question still stands), no real hymn melodies (Brian authors those).

23. **RESOLVED (2026-09-02) — ElevenLabs rights; melody authoring
    plan.** Brian holds an ElevenLabs subscription, so clips he generates
    carry usage rights for publication: Voice Portrait / Event Scene
    clips may use real ElevenLabs voices (item 12's licensing caveat is
    closed). Author-known-content rule unchanged: he sits out tasks whose
    clips he recorded (honor system, item 12). Melodies: "authoring"
    means producing the note-data JSON (`melodySchema`), not recordings.
    Agreed approach: Fable drafts note data for well-known public-domain
    hymn tunes (New Britain, Old Hundredth, Hyfrydol, …) as production
    content under the secrecy rules; Brian verifies by EAR in the running
    game and corrections follow. A MIDI→melody converter script is
    available on request if he prefers exporting from his own tools.
    Placeholder tunes in dev-playtest stay synthetic regardless.

## Open

1. Final milestone list and exact stage layout for the composite journey
   (current sample uses Jerusalem → Caesarea → Antioch → Rome; Asia Minor
   and Greece milestones to be added when the journey is authored fully).
2. Exact Journey Token power (spec §37.4) — awaiting balance testing.
3. Community Event catch-up reward rules (spec §37.5) — configurable;
   defaults to be set during Phase 7.
4. Whether a timed endgame / final challenge is offered (spec §37.7).
5. Whether recent-task history persists between games automatically
   (spec §37.10) — deferred; per-session memory only in version one.
6. Final keyboard map after accessibility testing (spec §37.12) — the
   proposal in KEYBOARD_COMMANDS.md is a starting point.
7. How team answer entry works in detail for host-as-player mode when the
   host's own team answers (self-ruling relies on the room as referee —
   confirm in playtesting that this feels fair).
8. Whether the audience display and host controls are one page (current
   assumption: yes, one window, one page) — revisit if playtests want a
   projector-only view without visible controls.
9. **DECIDED (2026-09-02, round 3)**: display/speech parity principle and
   presentation patterns captured in ACCESSIBILITY_PATTERNS.md (distilled
   from Brian's kc/ag/football projects; The Way stays browse-mode
   friendly, no role=application trap, one presenter API feeding both
   channels). Dev-vs-production content policy + hymn/audio task model in
   CONTENT_AUTHORING.md; sample pack renamed `dev-sample` and marked
   never-ships; schema gained variant-level audioAsset + maxPlays.
10. Task-handling defaults set in PHASE2_SPEC pending Brian's veto: answers
   are never typed (spoken aloud; engine stores no answer text);
   eliminate-option is repeatable while more than two options remain;
   decision-strategy tasks are ruled like any other task via hostGuidance;
   no per-task timers in v1.
11. **RESOLVED (2026-09-02, by the spec author — it was the spec's own
    arithmetic error).** The formula and its constants stand exactly as
    implemented; the worked example's "50-60 min" claim was wrong and has
    been corrected in PHASE2_SPEC.md to the true ~72.7 min. The design
    consequence moves to journey authoring: with these constants, a
    Standard 4-team 55-minute game supports ≈7 total required successes
    (not 9). Decision 6's working stage guidance is superseded by
    PHASE3_SPEC.md's Duration-targets table. Constants remain playtest-
    tunable parameters. Original finding, kept for the record:
    PHASE2_SPEC.md's duration estimator, run exactly as specified against
    its own worked example (4 teams, 3 tasks/turn, 9 required successes,
    2 community events, and the formula's own literal default constants),
    computes ~72.7 minutes — not the "50-60 min" the spec claims for that
    same example. `turnOverheadSeconds = 50s` is the constant responsible;
    holding everything else fixed, a value around 5-15s would land the
    example in the claimed range. The Phase 2 implementation
    (`src/engine/estimator.ts`) follows the formula literally and is
    tested against its actual output (see `tests/engine/group-i-undo-log.test.ts`),
    not the unreachable range — per the rule not to silently alter a spec
    value. Needs a decision: adjust `turnOverheadSeconds` (or another
    constant), or accept a longer real-world estimate and adjust the
    Short/Standard/Long stage-count targets in decision 6 above instead.
    Either way, revisit once real playtesting gives actual per-task and
    per-turn timings.
