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
