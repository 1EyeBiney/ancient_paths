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

24. **RESOLVED (2026-09-02) — Phase 6 Group A8 browser check (Sonnet,
    Chrome via the dev server; Sonnet cannot hear — Brian's ear is still
    the final check on tone/pitch/timing quality).** Ran the dev-playtest
    pack end to end at `npm run dev`, reading results through a dev-only
    `window.__audioDebug` hook exposed by `BrowserAudioBackend` (oscillator
    count, AudioContext state, the current `<audio>` element's `paused`/
    `volume`). All confirmed working:
    - Start game (the unlock gesture) brings the AudioContext to
      `"running"` immediately.
    - Presenting a hymn task and using the Journey Token to amplify it
      schedules a real Web Audio melody: the oscillator counter jumped by
      exactly the tune's note count (+8 for an 8-note placeholder tune),
      context stayed `"running"`. Cues (correct/incorrect/stageComplete/
      journeyToken/celebration/…) also confirmed as real oscillators —
      66 created over the course of ordinary play before the melody even
      played.
    - The amplified variant's `maxPlays: 1` cap enforced correctly: the
      very first "Listen again" press after the automatic first play
      announced "No replays left." and created no further oscillators.
    - Space paused a placeholder WAV task clip: `<audio>.paused` flipped
      `false` -> `true` on the same clip instance.
    - Two full games (one with both packs and every category, one
      restricted to just `audio-listening` at Long/dev-playtest-only to
      reliably reach a task-level WAV clip) played to `gameSummary`
      through real UI clicks with zero console errors and zero dev-server
      errors; the celebration cue fired at the end both times.
    - **Bug found and fixed, not just documented**: the Audio dialog's
      volume inputs updated `AudioManager`'s stored settings correctly
      (already covered by Group A5's tests) but did **not** reach a clip
      already mid-playback — `<audio>.volume` stayed unchanged until the
      *next* clip started. Root cause: `AudioManager.setSettings()` only
      updated its own settings object; nothing pushed the recomputed gain
      down to the backend for the currently active clip. Fixed by adding
      `AudioBackend.setClipGain(gain)` (sets `<audio>.volume` or the
      melody `GainNode`'s live value) and having `setSettings()` call it
      whenever a clip is currently loaded. Reproduced in the browser
      before the fix (`before: 1, after: 1` on a 30% master-volume edit
      mid-playback), fixed, then reproduced again to confirm
      (`before: 1, after: 0.3`). Two new regression tests added to Group
      A3 (`tests/ui/audio/group-a3-manager.test.ts`) lock this in. No
      other discrepancies found.

25. **RESOLVED (2026-09-03) — Fable's review of Phase 6 + Brian's first
    live test.** Brian reached an audio-capable task and every transport
    button reported "Nothing is playing" / "Nothing to replay yet" — which
    was correct: only every 10th `audio-listening` task in dev-playtest
    carries a clip, and nothing on screen says which, so he was pressing
    working controls on a silent task. He heard one cue and then none,
    which fits NVDA's audio ducking lowering all of Chrome while NVDA
    speaks — every cue fires at the instant an announcement starts. (Try
    NVDA+Shift+D to turn ducking off when judging cues.) Fixes, all with
    tests in `tests/ui/audio/group-a9-review-fixes.test.ts`:
    - **Bug**: the failsafe timer kept counting while a clip was paused
      (`BrowserAudioBackend` armed it once, in wall-clock time). Pausing
      longer than the 1.5 s slack past the clip's own length declared it
      "ended": deferred speech flushed, the queue moved on, and Space could
      no longer resume the orphaned, still-paused element. Now the
      failsafe is suspended on pause and re-armed with the remaining time
      on resume; `FakeAudioBackend.advanceClock` ignores time while paused
      to match. Invisible on the ≤1 s placeholder WAVs; would have bitten
      the first real narration clip.
    - **Gap**: `grantReplay()` was implemented and tested but unreachable —
      the engine supports `spendInsight`/`useJourneyToken` with effect
      `"replay"`, but Phase 4 never rendered it (nothing to replay then).
      `resourceWindow` now offers "Spend Insight to hear the audio again"
      and "Use Journey Token to hear the audio again" whenever the task or
      its active variant has audio and Insight interacts (mirroring the
      engine's own `can*` gating — interaction and structure, not
      affordability); `ScreenRenderer` gained `onReplayGranted`, which
      app.ts wires to `grantReplay` + `replay()`.
    - The transport bar was a `div` with `aria-label` and no role, so the
      label was never announced; now `role="group"`.
    - **New: a Sound check screen** off Welcome (a host feature — check the
      speakers before the session — not a dev back door). One button per
      cue and per audio asset from every loaded pack and journey, a
      "first four notes, faster" excerpt for each tune (exercises the
      sequencer's variation path), the same transport buttons, and the
      Audio settings (volumes + wait/interrupt) live. Cue buttons announce
      nothing on purpose — a 200 ms cue would be spoken over by its own
      label; clips announce "Finished: <id>." when they end. The Sound
      check click is the unlock gesture, so nothing is needed from the
      game first. Buttons only (no Space/L/X/N keys there; the game ladder
      is attached only while playing).
    Still open from the review, for Brian's ruling: ambient audio stops on
    the next engine state change (`killAll` stops it), so a landmark's
    ambience lasts exactly one screen. No ambient assets exist until
    Phase 9; suggested rule: ambient survives until the next landmark or
    leaving play. Also minor: the first (unconfirmed) Ctrl+Z press already
    kills the current clip.
    **Brian's verdict (2026-09-03): audio works; everything tested is
    fine.** The "wait" default stands, the cues stand as tuned, the
    one-screen ambient stays until Phase 9 authors real ambience. Phase 6
    closed.

26. **DECIDED (2026-09-03) — Phase 7 scope and rulings (PHASE7_SPEC.md).**
    The Phase 2 engine already had events, contributions, room rewards,
    the weighted offering pool, and Service; Phase 7 finishes the rest.
    Rulings, all reversible and configurable in `src/config/defaults.ts`:
    - Catch-up (closes open item 3 / §37.5): on a community event's
      SUCCESS only, every team more than `stagesBehind` (2) entries behind
      the leader — counting a fork as one entry so route choice never
      changes rank — may choose one resource. Announced as a `Catch-up:`
      log line the UI voices. A failed event grants nothing; the leader is
      never touched. Setup's existing toggle now drives it.
    - Exceptional contribution (§11's 2-point award): a single team
      pledging at least `max(2, ceil(50% of threshold))` in one event,
      awarded whether or not the room succeeds — the generosity happened.
      The pledge UI now offers 1..min(owned, 3) units.
    - "Choose a community benefit" (§11's 1-point award) gets its decision
      point as **sharing a gift**: a team holding a pending "choice" grant
      may hand it to another team instead (the recipient then chooses).
      Gifts can't be re-shared, so no Service loops.
    - Offerings become audible: a second `Offering effect:` log line
      states what actually happened, and `reveal-next-stage-info` now
      really names the next stage / fork. Two new cues, `offering` and
      `serviceEarned`. A general "voiced log lines" table in app.ts
      replaces the ad-hoc cue matching — the engine's log is the record,
      the UI speaks designated lines.
    - Service becomes visible (audience column, S status, summary
      accomplishments) and the award's public name comes from config.
    - `repeatable` events fire per team's first arrival.
    - This phase OPENS `src/engine/` to the implementer under explicit
      rules (existing tests untouched, state inside `EngineState`, log
      texts frozen). Schema and sample content stay untouched.

27. **Phase 7 Group C8 browser check (Sonnet, Chrome via the dev server,
    real content: dev-playtest + jerusalem-rome.json) — mixed results; one
    genuine content-balance finding, no code bugs.** `npm run dev`, two
    sessions (3 teams, then 2 teams), driven by real clicks/keydowns with
    one team always ruled correct and the others always incorrect to open
    a stages-behind gap, ~750 combined steps, zero console or dev-server
    errors either time.
    - **Confirmed working live**: a failed community event correctly
      grants NO catch-up (checked twice, once per session) — the
      success-only gate holds under real play, not just fakes. The pledge
      list correctly collapses to "decline" only, with zero amount
      buttons, when a team truly owns 0 of every resource (the
      `Math.min(owned, maxPledgePerTeam)` cap at owned=0). Both the host
      summary screen and the audience panel show `Barnabas Award:` (the
      configured name) and a "Community" accomplishments list; a real
      game where two events both failed rendered `The room fell short at
      The Harbor Gathering.` / `...The Sending Church.` on both screens
      correctly. Ties for the Barnabas Award work (three teams tied at 0
      Service, all three listed). The `journeyTokenAmplify` button
      correctly appears/disappears per task depending on that specific
      task's `resourceInteractions.courage` — real dev-playtest content
      doesn't give every task every interaction, unlike the synthetic
      packs the automated tests use. Zero errors of any kind.
    - **NOT independently confirmed live, in the time available** (all
      already covered by the 40+ deterministic C1-C7 tests against a
      fake backend): the `Catch-up:` announcement + `serviceEarned` cue
      firing on an actual SUCCESSFUL catch-up-eligible event; the
      exceptional-contribution line; the `offering` cue + `Offering
      effect:` line; sharing a gift. Real starting resources are 0/0/0,
      and Insight/Provision/Courage are earned slowly through ordinary
      play — arranging a genuine surplus (needs a courage-interactive
      task at the exact banked-successes count to overshoot via a free
      Journey-Token amplify) or a met community-event threshold (Caesarea
      needs 7 relay answers but each team gets only ONE turn per event —
      unreachable below 7 teams; Antioch needs 4 pledged units teams
      don't yet have) within a reasonable step budget proved impractical
      by hand. Not a Phase 7 bug — the mechanics fired exactly as
      designed everywhere they WERE reached, and are exhaustively covered
      by fake-backend tests; this is a live-arrangement-time gap only.
    - **Content-balance finding for Phase 9** (not a code issue,
      mechanics work as specified): Caesarea's relay `successThreshold`
      is 7, but the relay's own design (each team gets exactly one turn
      per event, `communityProgress.ts`'s `answeredTeamIds` never resets
      mid-event) caps the achievable room progress at the team count.
      With the common 2-8 team range, a threshold of 7 is unreachable
      below 7 teams and barely reachable at 7-8 — worth Fable/Brian
      revisiting when jerusalem-rome.json's content is finalized (either
      lower the threshold, or intentionally scope it to larger rooms).
    - Brian's ear/eyes are still the final check on the cue character and
      screen layout for the parts that WERE reached live.

28. **Fable's review of Phase 7 (2026-09-03) — four small fixes made, one
    real design gap surfaced (needs Brian's ruling).** The implementation
    is sound: every rule the spec set for opening `src/engine/` held, and
    nothing Sonnet reached in the browser misbehaved. Fixed:
    - Log order in `cmdOfferSurplus`: the Service line was logged BEFORE
      the offering lines, so the joined announcement read "earns 1
      Service" before saying why. Now: offering, effect, then Service.
      (Reordering is allowed — only line TEXTS are frozen.)
    - Cues stacked: one render could fire `offering` AND `serviceEarned`
      together, or three `serviceEarned` dings for three catch-up
      grants, all overlapping. Now each distinct cue plays at most once
      per render, and an offering's own cue stands in for `serviceEarned`
      in that render. `communitySuccess` + `serviceEarned` (a successful
      event that also grants catch-up) still overlap — Brian's ear.
    - The summary's accomplishment lines were singular-blind ("1 gifts
      were shared") — my spec's literal templates. Now grammatical; the
      spec's wording is amended by this item.
    - **Sample content (item 27's finding)**: `jerusalem-rome.json`'s
      Caesarea relay `successThreshold` 7 → 2 (each team gets exactly one
      relay turn, so the old value needed 7+ teams); Antioch's
      `contributionThreshold` 4 → 3 (one unit from each of three teams).
    **The design gap — the resource economy never starts.** The only
    things that ever GRANT Insight/Provision/Courage are: keeping a
    surplus, a community event's reward, an offering outcome, and (now)
    catch-up. A surplus needs an amplified success, which costs Courage;
    an event reward needs a met threshold; offerings need a surplus.
    From the real 0/0/0 start, the sole bootstrap is a perfect stage →
    Journey Token → free amplify → surplus → keep — and the token needs
    exact timing (amplify only when already one short of the
    requirement) on a task that happens to support Courage. In two live
    games every team finished with 0/0/0 and no offering ever happened.
    So the resource layer (assist, amplify, extra clues, recovery,
    pledges, offerings, sharing) is nearly unreachable in play. This
    predates Phase 7 (Phase 2 implemented exactly what PHASE2_SPEC said);
    Phase 7's browser check is what exposed it. The design doc does
    assume a faucet it never defines: §9 "a perfect stage grants the
    normal stage reward; applicable surplus rewards; a Journey Token",
    §7.6 "use an authored stage reward rule", §20.11 "finish all current
    stage rewards" — a "normal stage reward" is referenced three times
    and specified nowhere. **Proposed ruling (simplest reversible, §37
    rule)**: every stage completion grants one resource of the team's
    choice, configurable as `stageCompletionReward: { resource:
    "choice", amount: 1 }` in `src/config/defaults.ts`, granted in
    `finalizeStageCompletion` (before any surplus decision), logged as
    the existing "may choose a resource (a stage reward)" line, resolved
    through the existing pending-choice picker (and shareable — the
    §11 "choose the community" action gets a regular decision point).
    Journeys could later override per stage (schema change, Phase 9).
    **DECIDED (2026-09-03): Brian folded it into Phase 8** — it is
    PHASE8_SPEC.md Group P1, implemented first, with the existing tests
    it disturbs amended and recorded.

29. **DECIDED (2026-09-03) — Phase 8 design (PHASE8_SPEC.md).** A save
    is the setup plus the engine's command log; resume rebuilds the deck
    from the seed and replays. Justified by Phase 3's determinism
    guarantees (S1, S11): the deck is a pure function of options + seed,
    the engine of seed + task source + commands. Undo is a command, so
    undo history is recovered for free. A snapshot of `PlaySession` rides
    along for the Welcome card and as an integrity check (replay must
    reproduce it, timestamps ignored). Storage is IndexedDB (decision 1)
    behind a `SaveStore` seam with an in-memory implementation for tests
    — no fake-IndexedDB dependency (rule 5); the real store is covered by
    the browser check. Autosave after EVERY committed command via a
    `RecordingEngine` decorator, so the 28 dispatch sites in screens.ts
    stay untouched. Bad or foreign saves are quarantined, never deleted,
    and never crash boot. Deferred from §27.6 to a later phase: manual
    export/import of a save file (the game menu gets a Game log viewer
    now; export waits for a need). Audio playback state is not persisted
    (§26 says "where practical"): on resume the current task's clip plays
    again as a fresh presentation.

30. **RESOLVED (2026-09-03) — Phase 8 Group P8 browser check (Sonnet,
    Chrome via the dev server).** dev-sample + dev-playtest packs,
    Jerusalem to Rome, 2 teams (Cross, Lion), `npm run dev`. Confirmed:
    - `indexedDB.databases()` shows a real `the-way` (v1) database from
      first boot; its `saves` object store's `current` key updates after
      **every** action (checked after `startGame`, and again after a full
      task cycle — `commands.length` and `snapshot.state` matched the
      live engine both times, `lastCommand` matched the last thing
      clicked).
    - Reloading mid-task (`resourceWindow`, 7 commands in) showed the
      Resume game button above New game with the exact card format:
      "Jerusalem to Rome. 2 teams: Cross, Lion. Round 1, Cross's turn.
      Saved 9/3/2026, 2:26:06 AM." Resuming reproduced the identical host
      screen and audience table (same task, same "1 of 3 successes") —
      confirmed by screenshot comparison before reload and after Resume.
    - Ctrl+Z after Resume actually undid the resumed `presentTask`
      (`commands.length` 7 → 8 with `undo` appended, `snapshot.state`
      `resourceWindow` → `beginTurn`, and the screen visibly reverted to
      "Present task"): undo history survived the reload, not just
      `canUndo()` reporting true.
    - Game log… listed the game's lines in order with a working Copy
      button (Chrome's clipboard API is available here).
    - New game while a save exists asked first ("Start a new game? The
      saved game will be replaced."); Cancel returned to Welcome with
      the save and its Resume card intact; confirming cleared
      `saves/current` (verified empty afterward) and moved to setup.
    - No console errors or dev-server errors at any point.

    **One surprising, pre-existing (not new to Phase 8) accessibility
    nuance found while checking Ctrl+Z**: `App.dispatchCommand`'s
    `"undo"` case (from Phase 6) calls `undoController.press()` — which
    calls `present()` with "Undo will reverse: X. Press again to
    confirm." on the first press, or "Undo confirmed: X." on the second
    — and then *unconditionally* calls `renderCurrentScreen(true)`
    right after. `silent` only suppresses the audio-cue/auto-play side
    effects; the renderer's own entry announcement for the current
    screen still fires every time, immediately overwriting whichever
    undo message `press()` just wrote to the live region and status
    line, both on the arm press (state hasn't changed, so it's the same
    text as before) and the confirm press (state has changed, so it's
    the new screen's own text, not "Undo confirmed"). Functionally undo
    still works correctly (confirmed above); a screen reader user likely
    never actually hears "Undo will reverse…" or "Undo confirmed…"
    before it's replaced. This predates Phase 8 (the code is unchanged
    Phase 6 work) and wasn't something this browser check was scoped to
    fix — flagging it here per Brian's ear-is-the-tiebreaker rule so a
    future phase (or Brian's own testing) can judge whether it needs
    fixing, e.g. by having the undo case build one combined announcement
    instead of two sequential `present()` calls. **Fixed in Fable's Phase 8
    review (item 31).**

31. **RESOLVED (2026-09-03) — Fable's review of Phase 8.** The design held
    up end to end (decorator, replay, coalesced autosave, quarantine, the
    round-trip tests); four small things fixed, each pinned by
    `tests/ui/group-p8-review-fixes.test.ts`:
    - **Resume ignored the saved reduced-motion choice**: `applySnapshot`
      set `wizard.reducedMotion` but nothing re-stamped the DOM, so a save
      made with "Reduce motion" on resumed with animation. Now
      `applyReducedMotion()` runs after the snapshot is applied.
    - **`IndexedDbSaveStore` resolved on `request.onsuccess`**, which fires
      before the transaction commits; a quota abort after that point would
      have reported a successful save. It now resolves on
      `transaction.oncomplete` and rejects on `onerror`/`onabort` (no jsdom
      coverage — the browser check is its test, per rule 5).
    - **The integrity check treated `{ k: undefined }` and `{}` as
      different.** Both current paths keep such keys (verified: zod 4
      preserves an optional key present with `undefined`; structured clone
      does too; `getSession()` already returns a clone), so nothing was
      broken today — but the engine writes `team.pendingForkId = undefined`
      explicitly, and any JSON round trip (a future export/import) would
      have refused every post-fork save as "does not match its record".
      `deepEqual` now ignores undefined-valued keys; the test proves a
      post-fork save survives `JSON.parse(JSON.stringify(save))`.
    - **Item 30 fixed**: `UndoController.press()` now returns whether an
      undo was dispatched. An arming press no longer re-renders (nothing
      changed, so "Undo will reverse: …" stands); a confirming press
      re-renders and then announces "Undo confirmed: … " plus the new
      screen's entry text as ONE announcement, so neither is lost.
    Noted, not changed: the engine config (`DEFAULTS`) is not recorded in
    a save, so a change to any default (the Phase 10 balance audit will
    make several) makes an in-flight save fail its integrity check and get
    quarantined with "does not match its record". That is the safe failure
    — a resumed game silently running under different rules would be
    worse — and saves are short-lived, so it stands; if it ever bites,
    record `config` in the save and pass it to `createEngine` on rebuild.

32. **DECIDED (2026-09-03) — Phase 9 design (PHASE9_SPEC.md).**
    - **A gap found while planning, fixed first (Group N1)**: PHASE2_SPEC
      says a relay's shared prompt "comes from `nextCommunityTask`", but
      `cmdBeginCommunityEvent` never draws one — a relay today is a
      question-less "Now answering: Team X" with correct/incorrect
      buttons, and the `community` category, the builder's per-relay
      reserve and `taskCategory` are dead paths. No test caught it
      because relay tests only exercise thresholds. N1 draws the task,
      shows the prompt on both screens, and reveals the answer on
      resolve (host-as-player: nobody hears it before every team has
      answered). `ArrayTaskSource` gets its own community cursor and
      returns null when it has none, so every existing relay test stays
      green unchanged.
    - **Journey length**: 7 total required successes (was 9), five
      milestones (Ephesus added; Greece appears as the Aegean fork's
      two routes rather than a sixth milestone), four events. With the
      estimator's current constants, 7 is what 55 minutes buys at 3-4
      teams (item 11); 9 already read 73 minutes for 4 teams. Adding a
      Corinth milestone would push it back to 8-9. Revisit when Phase
      10's game-length simulation has real timings — this resolves Open
      item 1 for v1.
    - **Relay thresholds are 2** (item 27's finding): each team answers
      once per relay, so thresholds above the team count are
      unreachable.
    - **Audio in v1**: none in the production pack. Audio-listening
      tasks are text-delivered and tagged `audio-pending`; hymn tasks are
      text-only until Brian's melody data arrives (item 23). Rejected:
      placeholder tones in real play (a beep before a task), and
      authoring asset records for files that don't exist yet (a 404 per
      task in a church hall). Rejected for now: agent-transcribed hymn
      melodies — accuracy is unverifiable without a hearing reviewer.
    - **Dev packs by id convention** (`dev-*`) rather than a schema
      flag: nothing to migrate, `dev-sample.json` untouched.
    - **Secrecy made operational**: blind tests (id + rule name only),
      pack written by Write tool in few large chunks, counts-only
      commits and summaries. **Brian: do not expand the Write/Edit tool
      calls of the Phase 9 session, and do not open
      `public/content/packs/general-bible.json`.**
    - **Deferred, needs Brian's ruling**: "avoid tasks from the previous
      session" as a real feature. The builder already supports
      `excludeTaskIds` and IndexedDB now exists, so remembering the last
      session's task ids and offering a setup toggle is ~30 lines — but
      §37.10 was ruled "per-session memory only in version one" (Open
      item 5), so Phase 9 proves the deliverable with a test instead.
      Say the word and it goes into Phase 10.
    - **Pending, not the agent's to do**: sighted proofreading of the
      pack by someone other than Brian (CONTENT_AUTHORING §1).

33. **RESOLVED (2026-09-03) — Group N11's "≥40 distinct tasks" figure was
    unreachable per session; same category of issue as item 11's estimator
    arithmetic, same resolution (amend the test's number, not the
    content).** The real journey caps a single team's task consumption at
    its route's own required-successes sum, not the mean used for pacing
    (item 1's "7" is an average across fork choices): the maximum any one
    team can draw, choosing the highest-cost option at every fork, is 8
    tasks for the whole journey. A 4-team session (`the S11-style driver,
    always-correct rulings) therefore draws at most 32 ordinary tasks plus
    2 relay-event draws = 34 distinct — confirmed empirically, exact and
    seed-independent, since always-correct rulings mean task *count* is
    fixed by journey structure and only task *identity* varies by seed. A
    2-team session caps at 16 + 2 = 18. Neither clears PHASE9_SPEC.md's
    flat "≥40 distinct tasks" bar per session; even the union of session A
    and session B (built with `excludeTaskIds`, so genuinely disjoint —
    0% overlap observed both times) only reaches 68 for the 4-team pair
    but 36 for the 2-team pair, still short. Raising `general-bible`'s
    task count cannot fix this — the ceiling is set by the journey's
    required-successes total, not by content supply, and that total was
    itself deliberately tuned in Group N2 (item 32) to fit Brian's
    55-minute pacing target; inflating it to chase a test threshold would
    undo that tuning for no gameplay reason. **Ruling**: `general-bible-
    sessions.test.ts`'s two-session deliverable test keeps every other
    assertion from the spec (a real `SessionDeck`, `excludeTaskIds`
    between sessions, overlap ≤ 5% of session B's count) and replaces the
    flat 40 with the actual achievable floor plus a small margin: ≥ 30
    distinct tasks for the 4-team pair, ≥ 15 for the 2-team pair. The
    deliverable's real intent — proving back-to-back sessions draw fresh
    content with minimal repetition — is fully exercised either way.

34. **RESOLVED (2026-09-03) — Phase 9 Group N12 browser check (Sonnet,
    the in-app Browser tool).** No task text below, per the secrecy
    protocol — counts, ids, and observations only.
    - `npm run dev`, Welcome → New game: three packs listed (General
      Bible, Development Sample, Dev Playtest); only General Bible's
      checkbox was actually checked (confirmed via the DOM, not just the
      accessibility tree's generic "on" role state); both dev packs
      carried the "(development only)" suffix. Began a 2-team session
      (Cross, Lion), General Bible only.
    - Played 6 team-turns plus both Caesarea (relay) and Antioch
      (contribution) community events. Real tasks appeared throughout
      with clean, correctly-interpolated prompt/answer/teaching text (no
      broken placeholders). An assisted form was reached and used
      successfully (an audio-listening task, multiple choice, funded by
      Insight) and an amplified form was reached and used successfully
      (a hymn task, funded by Courage, yielding a surplus success routed
      to a resource choice) — both confirmed live, not just present in
      code. The Caesarea relay showed its prompt and host guidance to
      both teams in turn (room progress ticking 0 of 2 → 1 of 2 → 2 of
      2) and, on resolve, the aria-live region spoke a "Community
      answer: …" line followed by the teaching reveal — Group N1's
      engine work confirmed end-to-end in a real browser, not just
      tests. The map rendered one SVG with exactly 5 landmark markers
      (Jerusalem, Caesarea, Antioch, Ephesus, Rome) and a visible route
      line through them (screenshot-verified: satellite imagery,
      Rome/Ephesus labels legible); team badges tracked each team's
      current milestone correctly in both the journey strip and the map.
      Zero console errors throughout.
    - `npm run build && npm run preview` (a new `ancient-paths-preview`
      entry was added to `.claude/launch.json` for this — `vite preview`
      on port 4173, no other files touched): Welcome → New game's
      Content packs section listed **only** General Bible — the dev
      packs are absent entirely in a production build (not merely
      unchecked), confirming `main.ts`'s `import.meta.env.DEV` gate.
      Sound check listed exactly the 11 built-in cues and reported
      "No audio assets are loaded" under Clips and tunes — no production
      audio assets exist, as expected (item 32). Zero console errors.
    - **One observation, not fixed (pre-existing, not new to Phase 9)**:
      the host controls' "Spend Provision for the assisted form" button
      (`src/ui/screens.ts`) is a fixed label that always dispatches
      `spendProvision`, but `cmdSpendProvision` (`src/engine/engine.ts`)
      deducts whatever resource the task's own `assistedVariant.cost`
      declares — and every assisted-form task in both `dev-sample.json`
      and `general-bible.json` declares that cost as Insight, not
      Provision. In practice the button works (confirmed above: it
      correctly required and spent Insight), but a host reading the
      button literally would expect it to need Provision, and would see
      an "Illegal command… needs 1 insight" message if they had Provision
      but not Insight on hand — encountered live during this check. The
      amplified-form button has no such mismatch (`amplifiedVariant.cost`
      is consistently Courage everywhere, matching its label). Since this
      predates Phase 9 and touching `src/ui/screens.ts`'s button wiring
      or the established Insight-funds-assist authoring convention is
      outside this phase's scope, it's flagged here for Brian/Fable to
      rule on (either make the button's resource name dynamic, or treat
      Provision-funds-assist as the intended convention and correct the
      content instead).

35. **RESOLVED (2026-09-03) — Fable's review of Phase 9.** Sonnet's work
    held up well: the relay prompt (N1) is exactly as specified, the
    journey's numbers are right, the blind-test discipline was kept
    throughout, and the N11 amendment (item 33) was correct — my spec's
    "≥ 40 distinct tasks per session" was an arithmetic slip (I was
    thinking of the two sessions' union, and even that fails for two
    teams). Three code fixes, one ruling, and a content review:
    - **Route `taskFocus` was ignored** (`src/session/builder.ts`).
      PHASE3_SPEC's planner step 4 says "the team's current stage/route
      taskFocus"; the Phase 3 builder read the stage's own `taskFocus`
      only. The schema requires `taskFocus` on a route and makes it
      optional on a stage, so every stage inside a fork route in the
      real journey was drawing from plain rotation — a route's "testing
      Scripture knowledge and listening skill" was untrue. Fixed with a
      `focusForStage()` lookup (stage's own focus, else its route's);
      `tests/session/group-review9-route-focus.test.ts` covers the
      fixture, an override, and all five real route stages. Nothing in
      Phase 9 caused this; the real content surfaced it.
    - **"Also accepted" repeated the official answer.** The blind rules
      (rightly) require `acceptedAnswers` to contain `answer`, so every
      reveal read "Answer: X. Also accepted: X." on both screens and in
      speech. New `acceptedAlternatives()` in `src/ui/speech.ts` filters
      the answer and case-insensitive duplicates; host and audience views
      use it; V6's test amended plus a positive case. Verified live.
    - **The assisted form costs Provision — ruling.** Item 34's
      observation traced back: design doc §8.2 lists "reduce an authored
      challenge to its assisted form" under Provision and §20.5 says
      "spend Provision for an eligible assisted form"; the Phase 5
      dev-playtest generator already authors it that way; the host's
      button says so. `dev-sample` (Phase 1) had authored Insight and
      PHASE2_SPEC accommodated it ("some assisted variants cost
      insight") — that accommodation was the mistake, and general-bible
      inherited it from dev-sample (all 104 assisted forms). Fixed by a
      mechanical, content-blind rewrite of `cost.resource` in both packs
      (104 + 4 replacements, counts verified by the script, no text
      printed); a blind rule now pins assisted → provision and amplified
      → courage; CONTENT_AUTHORING.md §5 records the convention. The
      engine still honors whatever a task declares (unchanged), so the
      `tests/engine/fixtures.ts` tasks that cost Insight keep testing
      that property. The button labels stay static.
    - **Noted for Phase 10 (PHASE10_SPEC.md X4b)**: `route.difficulty`
      is descriptive only — `SessionDeck` draws at the session weights
      regardless of route, so "Mountain Route: one success, the hardest
      road" is strictly dominant (fewer tasks, identical odds). Ruled: a
      route's difficulty shifts its stages' draw weights one step
      relative to the session setting. Brian may veto.
    - **Noted, no action**: the two `dev-*` pack files are copied into
      `dist/` by Vite (they live in `public/`) even though a production
      build never fetches them — harmless, they are not secret.
      `general-bible.json` is itself a publicly served static file, as
      any static-site content must be; Brian's honor system was always
      the model (CONTENT_AUTHORING §1), this just states it once.
    - **Content review — DONE (2026-09-03), by an isolated agent** so
      that no task text entered Brian's transcript (five attempts were
      killed by server-side overload before the sixth ran clean; ~10
      minutes, 38 tool calls). All 128 tasks read against the reviewer's
      own knowledge of the KJV text, hymnody and history. **15 tasks
      corrected** (35 lines, counts unchanged), by kind: quotations
      taken from a modern (copyrighted) translation replaced with KJV
      wording — `gb-br-008`, `gb-br-009`, `gb-hc-009`; a citation
      widened to the verse that states the claim — `gb-sk-010`, and one
      added — `gb-al-008`; accepted answers broadened where an equally
      correct form existed — `gb-sk-014`, `gb-sk-028`, `gb-hc-002`,
      `gb-hc-016`, `gb-cm-005`; a distractor that was defensible under
      KJV vocabulary replaced — `gb-hc-002`, `gb-hc-016` (reveals now
      explain the difference); a transliteration in a clue corrected to
      the KJV spelling — `gb-hc-008`; an amplified form that asked for
      a detail its own read-aloud prompt already contained reworked,
      its clue softened (it stated the answer) — `gb-al-008`; hymn
      dates corrected — `gb-hy-002` (the earlier date rests on a later
      legend), `gb-hy-007` (composition vs publication); a meaningless
      phrase removed from an amplified prompt — `gb-hy-005`.
      **Verdict**: accuracy high, errors narrow; distractors in-domain
      and good; difficulty sound with the hard tier occasionally a
      notch generous; reasoning and decision-strategy the strongest
      craft. **Church-setting**: nothing to change; `gb-ds-012` touches
      a sensitive theme even-handedly, as a reasoning task should.
      **Judgement calls raised, and Fable's rulings**: (a) *systemic —
      a purchasable clue hands over the very detail the amplified form
      asks for* in `gb-sk-011`, `-015`, `-017`, `-018`, `-020`, `-022`,
      `-024`, `-026`, `-030`, `-031`, `-032`, `gb-br-012`, `gb-al-006`,
      and marginally `gb-hc-013`, `gb-br-010`. Ruled a content defect,
      not economy: Courage's two-success gamble (§8.3) must not be
      convertible into a one-Insight purchase; clues help the base
      question only (new CONTENT_AUTHORING §5 rule). Fixed consistently
      in a follow-up pass by the same isolated reviewer (below).
      (b) `gb-sk-035` reads a notch easy for its "hard" label — left;
      one task, and the pack's ratios are pinned. (c) `gb-al-001`,
      `-002`, `-003` read-aloud transcripts lightly adapt the KJV rather
      than quote it — left; the transcript IS the text the host reads,
      and PHASE9's rule allows paraphrase. (d) `gb-cm-006`'s citation
      runs one verse past the enumerated set — tightened in the
      follow-up. **Follow-up pass (same reviewer, ~3 minutes)**: all
      15 overlaps fixed by rewriting the CLUE (both clues in
      `gb-sk-020`; a single, different verifiable detail in
      `gb-br-012`); no amplified prompt, answer or accepted-answer list
      needed to change; `gb-cm-006`'s reference and host guidance now
      agree; 17 lines changed, counts unchanged. Reviewer's note, kept
      for the record: a few replacement clues draw on the figure's
      wider narrative rather than the single cited verse — consistent
      with how the pack's clues already work; a "clues only from the
      cited passage" rule was NOT adopted (it would make many hard
      tasks clue-less).
    - **X6 ruled — yes (Brian, 2026-09-03)**: recent-use memory across
      games goes into Phase 10 as specified (PHASE10_SPEC.md Group X6);
      Open item 5 updated.
    2734 tests after the code fixes (2602 at Phase 9's completion; the
    difference is the new blind cost rule per task, the route-focus
    tests, and the reveal-alternatives case).

36. **RESOLVED (2026-09-03) — PHASE10_SPEC.md's per-cell seed counts (X2's
    12, X4's 300) don't fit the spec's own "≤30s total for tests/sim"
    budget against the real engine; same category of issue as items 11
    and 33 (a number in the spec didn't survive contact with measurement),
    same resolution (measure, then amend the number, not the intent).**
    Benchmarked directly: a simulated game's cost scales with team count,
    not difficulty (difficulty barely moves it) — roughly 11ms at 2 teams,
    35ms at 4, 116ms at 8 (10-11x from 2 to 8 teams, matching attempt
    count) — because `Engine.dispatch()` does a full `structuredClone` of
    its state on every command for undo (§33.1's "undo restores the
    complete prior state"), and a full game is dozens of commands per
    team. This is a genuine, correct cost of an already-tested engine
    guarantee, not a simulator inefficiency, and `src/engine/` is frozen
    to defects only this phase (PHASE10_SPEC.md's Files section) — so the
    fix is scaling the audit's sample sizes, not the engine. X2's literal
    matrix (7 team counts × 3 difficulties × 3 presets × 12 seeds) alone
    measured 44.7s; X4's seat-order test alone (300 seeds at 4 teams)
    would add another ~9.6s program that. **Ruling**: every group's
    per-cell seed count is scaled down to what a real run showed keeps
    every assertion meaningful (recorded in each group's own commit and
    in `SIMULATION_REPORT.md`'s header), and un-run duplicate simulation
    is eliminated where one batch of games can answer two groups'
    questions (X4's community-event and Service stats are read off the
    SAME games used for its seat-order analysis, not re-simulated).
    Because `simulateGame` takes no external randomness — same seed,
    same code, same result, always — a smaller sample is not "more
    flaky" in the CI sense; it is simply a fixed set of games, checked
    once, that either does or doesn't clear a bound. The realized total
    for `tests/sim` is recorded in `SIMULATION_REPORT.md`'s header.

37. **Finding (2026-09-03) — PHASE10_SPEC Group X4's seat-order fairness
    check: the [0.15, 0.40] per-seat win-share bound doesn't fit this
    game's own rules, but a real, smaller turn-order skew sits underneath
    it. Not fixed here — the spec is explicit that a breach here is
    something to propose, not redesign.** Measured across 120 four-team
    standard games (`tests/sim/group-x4-fairness.test.ts`, policy rotated
    by seed so seat and preset are decoupled):
    - **Win share by seat: [0.533, 0.517, 0.425, 0.450]** — every seat is
      ABOVE the spec's 0.40 upper bound, not just seat 0. The reason: this
      journey commonly ends with more than one team finishing at once
      (`sharedVictory` in 68% of these games; mean 1.93 of 4 teams finish
      per game — winners-per-game distribution was 1 winner in 38 games,
      2 in 57, 3 in 21, 4 in 4). The [0.15, 0.40] bound reads like a
      single-winner assumption (roughly "1/4 ± tolerance"); design doc
      §21 explicitly rules "a shared journey victory is acceptable," so a
      per-seat *win* share well above 1/4 is the intended shape of the
      game, not a fairness defect. The test now reports this share
      without a pass/fail bound.
    - **The real skew is in *first*-to-Rome share by seat: [0.408, 0.275,
      0.192, 0.125]** — seat 0 is first to finish more than 3x as often
      as seat 3. Mechanism: the "finish the round" ending rule (§21; a
      team finishing sets `finishRoundNumber`, the game ends once that
      round completes) only grants a bonus chance to teams seated AFTER
      the finisher within that same round — a team seated before the
      finisher has already taken its turn for that round and gets
      nothing extra. Seat 0 always acts first each round, so it is never
      "too late" to benefit from someone else's finish that round, while
      a later seat's own finish grants nothing to anyone seated earlier.
      Over many close games this compounds into the observed skew.
    - **Proposal (not implemented — Fable/Brian's call, matching the
      spec's "propose, do not redesign" instruction for this audit
      phase)**: two candidate fixes, either small: (a) rotate which team
      occupies "seat 0" each game (e.g. by seed) so no single team's
      identity benefits session over session — cosmetic, doesn't change
      the underlying mechanic, but a host reading team order off a fixed
      setup list would no longer always see the same team favored; (b)
      change the ending rule so the round in which the LAST-acting team
      of that round finishes is followed by one MORE full round for
      everyone (guaranteeing every seat gets at least one "grace" turn
      after any finish, not just seats after the finisher) — a real rule
      change to `Engine.endTurnAndAdvance`, weighed against making games
      run longer. Neither is implemented; `src/engine/` stays frozen to
      defects only this phase per PHASE10_SPEC.md's Files section, and
      this is a design tradeoff, not a defect.
    - **Routes, briefly**: the static expected-cost formula (Σ required /
      base rate at the route's own difficulty, ignoring X4b's weight
      shift) puts Mountain Route ~59% cheaper than Coastal and ~38%
      cheaper than Inland on the north fork — over the 25% threshold the
      spec flags. But X4b's whole point is that a "hard" route now draws
      MORE of its tasks from the hard/challenging tier in practice (not
      fewer), which this static formula doesn't capture — it's the
      floor a route-choosing team would compute WITHOUT knowing the
      shifted odds, not the real in-play cost. Measuring the TRUE
      post-X4b per-route success rate needs enough simulated games per
      route to be statistically meaningful, which this audit's time
      budget (item 36) didn't extend to. Recommended for Phase 11: a
      dedicated per-route outcome comparison once more seed budget (or a
      faster harness) is available.

38. **RESOLVED (2026-09-03) — Group X6's spec text ("the IndexedDB store
    via the existing fake-IDB path P2 used") described a P2 test that
    doesn't exist.** Checked directly: no test in this project exercises
    `IndexedDbSaveStore` at all, and jsdom (this project's test
    environment) has no `indexedDB` global — `new JSDOM().window.
    indexedDB` is `undefined`. `store.ts`'s own header comment already
    says why: "no fake-IndexedDB dependency — the real store is covered
    by the browser check, P8" (rule 5: no new dependency without a
    recorded reason, and none was ever taken). So Group X6's new
    `readRecentTasks`/`writeRecentTasks` on `IndexedDbSaveStore` are, like
    every other `IndexedDbSaveStore` method before them, exercised only
    by a manual browser check (folded into Group X11) — not by a unit
    test. `tests/persistence/group-x6-recent-tasks.test.ts` covers the
    full round trip against `MemorySaveStore` and every piece of new
    `SetupWizard`/App logic instead.

39. **Finding (2026-09-03) — PHASE10_SPEC Group X7g: Cancel-closing the
    "End session?" confirm from the game menu doesn't restore focus
    anywhere meaningful.** Every dialog launched from the game menu
    (Audio, Game log, Delete saved game, Forget recent tasks, End
    session) shares `ModalManager`'s single overlay with the menu
    itself, so opening one clears the menu's content — detaching the
    very button that invoked it. Four of the five now pass
    `onClose: () => this.openGameMenu()` (`src/ui/app.ts`), so closing
    them genuinely returns you to the menu. End session was left out on
    purpose: its confirm path tears the whole game down and switches to
    the setup screen, and reopening a menu with nothing left to act on
    right before that transition would leave a stray dialog on top of
    the new screen. The result is that Cancel-closing "End session?"
    specifically still loses focus (lands wherever it happened to be
    inside the now-hidden dialog, which a screen reader would announce
    as nothing useful). Low-frequency path — a host who opens End
    session and changes their mind — but real. **Proposal (not
    implemented, `src/ui/` open to defect fixes only from PHASE10_SPEC's
    own instruction; this is closer to a design choice about End
    session's confirm-vs-cancel branches than a plain defect):** give
    `openEndSessionConfirm` an `onClose` that reopens the menu ONLY when
    closing via Cancel/Escape (not after a successful confirm) — e.g. by
    tracking whether the confirm branch already ran before `onClose`
    fires, or by having the confirm button call `this.modal.close()`
    with `onCloseCallback` cleared first so its own teardown doesn't
    trigger a reopen. Either is a small, well-scoped Phase 11 fix, not
    attempted here to avoid rushing a change to a path that changes
    game state.

40. **Finding (2026-09-03) — PHASE10_SPEC Group X8: the shipped
    `general-bible.json` pack has zero real `audioAssets`, and every one of
    its 12 audio-listening tasks has `audioAsset: null`.** Discovered while
    writing the error-recovery matrix's "skipped narration" test (N/R/L),
    which needs a task whose audio actually plays to exercise L's replay
    and fallback branches at all — against the pack as committed today,
    `AudioManager.replay()` can never do anything but say "Nothing to
    replay yet." for ANY real task, since `lastTaskAudio` is never set.
    This matches CLAUDE.md's own Phase 6 status ("narration is placeholder
    ... Brian records produced narration later") — not a bug, a known gap
    — but it's worth naming precisely: it's not just ambient/narration
    that's placeholder, the *audio-listening category's own defining
    feature* (a task you listen to) currently has no audio in the
    production pack either. `tests/audit/group-x8-recovery.test.ts`
    works around it by augmenting an in-memory copy of the real pack with
    one synthetic asset on every audio-listening task (never written back
    to the committed file) — real journey/task ids and structure, one
    fabricated clip. Once Brian records real narration (Phase 9/11 per
    CLAUDE.md), re-point that test at the real assets instead and drop the
    augmentation; until then, X11's manual browser check should expect
    every audio-listening task to show the same "Nothing to replay yet."
    behavior for L, which is correct given the content as it stands, not
    a regression to chase.

41. **PHASE10_SPEC Group X11 — manual browser check, real content, keyboard
    only (2026-09-03).** `npm run dev`: Welcome (browse-mode readable,
    Enter on New game) → setup wizard entirely by Tab/arrows/Enter,
    4 teams, standard duration/pace/difficulty, General Bible only
    (dev packs explicitly unchecked) → played 3 rounds real-time: the
    Caesarea relay (all 4 teams answered in turn, "Room progress"/"Now
    answering" both read correctly, resolved and advanced the whole
    room), a granted-choice share (Team 1 → Team 2, confirmed the
    receiving team's own take-only options and no re-share option on
    a received gift), 3 fork choices (one per remaining team; Team 1
    had already forked earlier), the Antioch contribution ("Pledged: N
    of 3", one real "contribute" pledge — not just decline — accepted
    and reflected in Service), an assisted form (Provision 2→1,
    variant/title changed), an amplified form (Courage 2→1) that
    overshot a 1-success stage and correctly reached `surplusDecision`,
    a surplus offer, `?` help (rows matched the legal actions for that
    state), a second `?` entering keyboard explorer (a key press spoke
    what it would do without changing any game state; Escape exited
    cleanly), Escape → game menu → Game log (50 entries, ids/effects
    only, no task text) → Escape closed it back to the reopened menu
    (Group X7g's fix, confirmed live) → reload → Resume (exact same
    screen, teams, and log restored) → Ctrl+Z twice (arm wording named
    the real reversed action; confirm restored the exact prior screen)
    → End session (press-twice confirm, landed cleanly back on setup).
    Zero console errors at every checkpoint. Three screenshots taken
    (Welcome, setup's "Begin journey" with focus ring, the open Game
    menu with focus ring) — the keyboard focus indicator was clearly
    visible in all three. No app defects found. One testing-tool
    caveat, not a game finding: a few isolated `Ctrl+Z` presses
    interleaved with separate devtools-evaluation round-trips were each
    read back as a fresh arm rather than a confirm (each subsequent
    press's arm text was identical, meaning the arm had been silently
    cancelled between presses) — a single batched pair of presses with
    no intervening tool call between them worked correctly on the first
    try, so this reads as devtools-evaluation-induced blur cancelling
    the arm between separate tool round-trips (`UndoController.cancel()`
    fires on "any other action"), not a real double-press failure a
    person would hit. `SIMULATION_REPORT.md` (Group X10) was read and
    reads sensibly. Then `npm run build && npm run preview`: Welcome
    rendered, New game's Content packs section showed only "General
    Bible" (both dev-only packs correctly absent from the production
    bundle), one full turn played end-to-end (present → accept →
    reveal → rule correct → teaching), zero console errors throughout.

## Open

1. **DECIDED for v1 (2026-09-03, item 32)** — five milestones (Jerusalem,
   Caesarea, Antioch, Ephesus, Rome), Greece as the Aegean fork's routes,
   7 total required successes; PHASE9_SPEC.md Group N2. Revisit with
   Phase 10's timings.
2. Exact Journey Token power (spec §37.4) — awaiting balance testing.
3. **DECIDED (2026-09-03, item 26)** — Community Event catch-up rules:
   success-only, more-than-two-entries-behind, one resource of choice;
   configurable in `src/config/defaults.ts`.
4. Whether a timed endgame / final challenge is offered (spec §37.7).
5. **DECIDED (2026-09-03, item 35)** — recent-task history persists
   between games (spec §37.10): the last N games' task ids (default 3,
   1-5) are excluded at setup, toggle default on; PHASE10_SPEC.md Group
   X6. Supersedes the earlier "per-session memory only in version one".
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
