# PHASE8_SPEC — Persistence and Recovery (plus the stage reward)

Binding contract for the Phase 8 unattended implementation (design doc
§34 Phase 8; §26, §27.6; CLAUDE.md decision 1: in-browser persistence,
IndexedDB, no backend). Read CLAUDE.md's agent rules first. This spec
outranks improvisation; where it is silent, the design doc governs, then
ACCESSIBILITY_PATTERNS.md for anything presented.

`src/engine/` is open under Phase 7's rules (every existing engine test
green — except where THIS spec explicitly amends one for Group P1; new
state inside `EngineState`; existing log-line texts frozen). Do not
modify: the design doc, `src/content/schemas.ts`, `src/session/`,
`dev-sample.json`, `jerusalem-rome.json`, or any PHASE*_SPEC.md. If
blocked, write the problem to OPEN_QUESTIONS.md and continue with
another group.

Prerequisites (all true today): Phases 2-7 green, 415 tests, the site
deploys on every push to `main`.

## Objective (§34 Phase 8)

"Automatic saves; resuming; action log; undo; versioned save data; safe
migration behavior. Deliverable: **closing the application during a
game does not lose the last completed action.**"

Undo (§26 "undo history sufficient for safe recovery") and the
human-readable event log already exist in the engine; this phase makes
them survive a closed tab, and adds one economy fix Brian ruled on
(OPEN_QUESTIONS 28 → this spec's Group P1).

## Design (decided — OPEN_QUESTIONS item 29)

**A save is the setup plus the command log; resume replays it.** Phase
3 proves a session deck is a pure function of its build options and
seed (S1), and Phase 2/3 prove the engine is deterministic given its
rng seed, task source, and command sequence (S11). So the engine's
`Command[]` since `startGame`, with the setup that built the deck, IS
the game — including undo, which is just a command. Resume rebuilds the
deck with `buildSessionDeck`, creates the engine with the same seed,
and dispatches every recorded command. No private deck state is ever
serialized, and undo history comes back for free. A denormalized copy
of `engine.getSession()` rides along in the save for the Welcome
screen's summary card and as an integrity check: after replay, the
rebuilt session must equal the saved snapshot (event-log TEXTS
compared, timestamps ignored — `log()` stamps `new Date()`).

Rejected: snapshotting `SessionDeck` internals (private pools, cycles,
used ids; a second serialization surface that could drift from the
class) and adding a fake IndexedDB test dependency (rule 5 — the store
is a seam with an in-memory implementation for tests; the real one is
covered by the browser check).

## Files

- `src/persistence/schema.ts` — `savedGameSchema` (zod) and `SavedGame`
  type; `SAVE_SCHEMA_VERSION = 1`.
- `src/persistence/store.ts` — `SaveStore` interface,
  `IndexedDbSaveStore`, `MemorySaveStore`.
- `src/persistence/recorder.ts` — `RecordingEngine` (a `GameEngine`
  decorator).
- `src/persistence/replay.ts` — `rebuildFromSave()`.
- `src/ui/setup.ts` — `SetupWizard.toSnapshot()` / `applySnapshot()`.
- `src/ui/app.ts` — autosave, Resume, New-game guard, game-log modal.
- `src/config/defaults.ts` + `src/engine/engine.ts` — Group P1.
- Tests under `tests/persistence/` (P2-P3, P6) and `tests/ui/`
  (P4-P5, P7); engine test for P1 under `tests/engine/`.

## Group P1 — the stage-completion reward (engine; do this first)

Brian's ruling on OPEN_QUESTIONS 28: the design doc's undefined "normal
stage reward" (§9, §7.6, §20.11) becomes real, or the resource layer
stays unreachable from the real 0/0/0 start.

- `DEFAULTS.stageCompletionReward = { resource: "choice" as const,
  amount: 1 }` (resource: a `ResourceType` or `"choice"`; amount 0
  disables it).
- In `finalizeStageCompletion`, BEFORE `arriveAtMilestone`/
  `stagesBeyondMilestone` and before `advanceTeamToNextEntry`, if
  `amount > 0`: `grantOrQueueChoice(team, resource, amount, "a stage
  reward")`. The existing helper already logs `Team X may choose a
  resource (a stage reward).` / `Team X receives N resource.` — no new
  line text. A "choice" queues an ordinary pending choice (shareable,
  so it is also a regular §11 sharing opportunity), resolved through
  the existing picker. Surplus decisions still happen first (they
  precede `finalizeStageCompletion` already).
- **Amending existing tests is expected and must be recorded in the
  commit**: any Phase 2/7 test that asserts a pending-choice COUNT or an
  exact resource total after a stage completes (candidates: G3/G4
  relay-reward counts, H4's resource-sum tie-break, C3's counts after
  a relay, C6/C7 harness drains) may change by exactly the reward. Each
  amended assertion gets a comment naming this group. Tests that would
  rather not see the reward may pass `config: { stageCompletionReward:
  { resource: "choice", amount: 0 } }` — but do NOT globally disable it
  in `makeEngine`/`makeApp`; the default behavior must stay under test.
- Tests (P1): every stage completion queues one choice for the
  completing team and logs the line; a perfect stage grants reward AND
  token; the reward is granted before the milestone event pauses play
  (so a team entering a community event already holds its choice);
  amount 0 grants nothing; undo of the completing `finishTeaching`
  removes it; a resource-typed reward (`resource: "insight"`) grants
  directly and respects the cap.

## Group P2 — save schema and the store seam

```
SavedGame v1 = {
  saveSchemaVersion: 1,
  savedAt: string (ISO),
  content: { journeyId, journeyVersion, packs: { [packId]: version } },
  setup: SetupSnapshot,            // every SetupWizard field (see below)
  teams: TeamSetup[],              // ids, names, colors, symbols
  turnTaskLimit: number,
  commands: Command[],             // everything dispatched since startGame, incl. "undo"
  snapshot: PlaySession,           // engine.getSession() at save time
  audio: { settings: AudioSettings, speechMode: "wait" | "interrupt" },
}
```

`SetupSnapshot` = `{ journeyId, teamCount, teamNames, duration, pace,
difficulty, enabledPackIds, enabledCategories, audio, communityCatchup,
seed, tasksPerTurnOverride, reducedMotion, mapStyle }` — one field per
`SetupWizard` public field, no more, no less (a test enumerates them).
`SetupWizard.toSnapshot()` and `applySnapshot(s)` (journey resolved by
id from the wizard's journeys; unknown id → the snapshot is invalid).

`SaveStore`:

```
interface SaveStore {
  load(): Promise<unknown | null>;      // raw, unvalidated (the schema decides)
  save(game: SavedGame): Promise<void>;
  clear(): Promise<void>;
  quarantine(raw: unknown): Promise<void>; // sets a bad save aside, never deletes it
}
```

- `MemorySaveStore` — tests; also exposes `writes: SavedGame[]` and a
  `failNextSave()` knob.
- `IndexedDbSaveStore` — database `the-way`, object store `saves`,
  key `current` for the live save and `quarantined-<ISO>` for set-aside
  ones. Opens lazily; every method resolves or rejects, never throws
  synchronously; a missing `indexedDB` global rejects with a clear
  message (the app treats that as "saving unavailable").
- Tests (P2): the schema accepts a well-formed save and rejects a
  missing field, a wrong `saveSchemaVersion`, and a command of unknown
  type; `SetupSnapshot` round-trips through `toSnapshot`/`applySnapshot`
  for every field; `MemorySaveStore` save/load/clear/quarantine.

## Group P3 — recording and replay

`RecordingEngine implements GameEngine`: wraps a real engine, forwards
every read method, and on `dispatch(command)` forwards it, and ONLY if
it did not throw, appends the command to `commands` and calls
`onCommitted(command)`. Illegal commands leave no trace. Exposes
`getCommands(): readonly Command[]`. app.ts constructs it; `screens.ts`
(28 dispatch sites) and `undo.ts` are untouched — that is why it is a
decorator.

`rebuildFromSave(save, { journeys, packs }) → { engine: GameEngine,
deck, teams, turnTaskLimit } | { error: string }`: resolves the journey
and enabled packs by id, checks `content` versions match exactly (else
error "content changed"), rebuilds via `buildSessionDeck(setup →
BuildOptions)` and `createEngine({ rng: createRng(setup.seed),
taskSource: deck, config from setup as app.ts does today })`, replays
`commands` in order (any throw → error "replay diverged at command N"),
then compares `engine.getSession()` to `snapshot` ignoring
`eventLog[].timestamp` (mismatch → error "saved game does not match its
record"). Returns a FRESH `RecordingEngine` already holding the replayed
commands, so autosave continues from there.

- Tests (P3): a recorded full game (testJourney + bigPack via the real
  builder) replays to an identical session — with an `undo` in the
  middle, and with a fork choice, an offering, a community event, and a
  share; an illegal command is not recorded; a changed pack version is
  refused; a command list with one extra bogus command is refused with
  the command index in the message; a tampered snapshot is refused.

## Group P4 — autosave (app.ts)

- After `beginJourney` succeeds and after EVERY committed command
  (`onCommitted`), build a `SavedGame` and `store.save()` it. §26's list
  of "consequential actions" is a subset of "every command"; the
  deliverable ("does not lose the last completed action") wants every
  one, and a save is a few KB.
- Saves are queued: at most one in flight; a save requested while one
  is in flight is coalesced (latest state wins). A rejected save
  announces ONCE per session, politely: "Saving is unavailable in this
  browser. Play continues, but this game cannot be resumed." and stops
  trying.
- `AppOptions.saveStore?: SaveStore` (tests inject `MemorySaveStore`;
  `main.ts` passes an `IndexedDbSaveStore`). `appHarness.makeApp`
  defaults to a `MemorySaveStore` and exposes it.
- Tests (P4): a keyboard game's every step produces exactly one save
  whose `commands.length` equals the steps so far; the save's snapshot
  equals `engine.getSession()`; a failing store announces once and never
  again; an illegal command (rejected by the engine) causes no save.

## Group P5 — resume, the New-game guard, and the game log

- **Welcome**: on boot, `store.load()` → `savedGameSchema.safeParse`.
  Valid → a **Resume game** button ABOVE New game, with a visible and
  spoken card: "{journey title}. {n} teams: {names}. Round {r}, {active
  team}'s turn. Saved {savedAt as a short local date-time}." Invalid →
  quarantine it and show/announce "A saved game could not be read and
  was set aside." Absent → today's screen.
- **Resume**: `rebuildFromSave`; error → announce it and offer New game
  (the save is quarantined, not deleted); success → apply the setup
  snapshot to the wizard, restore audio settings + speech mode, enter
  playing exactly as `beginJourney` does but with the rebuilt engine,
  then announce "Resumed." followed by the current screen's normal entry
  announcement. `AudioManager` state is not persisted: `killAll()`, and
  the resourceWindow hook treats the current task as a fresh
  presentation (its clip plays again, cap reset) — acceptable, note it.
- **New game while a save exists**: a confirm modal (modal.ts) —
  "Start a new game? The saved game will be replaced." Confirm → clear
  the store, proceed; Cancel → back to Welcome. The save is also
  replaced naturally by the first autosave of the new game.
- **Game menu** gains **Game log…** — a modal listing the last 50
  event-log lines as an ordered list (the engine's human-readable log,
  §26), newest last, with a "Copy" button using the clipboard API where
  available (silently absent otherwise). And **Delete saved game**,
  press-twice confirm like End session.
- Tests (P5): boot with a valid save shows Resume and the card text;
  Resume reaches playing at the saved state with host + audience screens
  identical to a fresh render of the rebuilt engine; boot with a corrupt
  save quarantines it and announces; New game over a save asks first and
  Cancel keeps it; Game log lists the last lines; Delete asks twice.

## Group P6 — versioning and safety

- `saveSchemaVersion` newer than known → "This saved game was made by a
  newer version" and quarantine; older than known → same path (there is
  nothing older than 1; the branch must exist).
- Nothing in the boot path may throw for any raw store content:
  `null`, a string, `{}`, an array, a save with an unknown command type,
  a save whose journey id no longer exists — each is quarantined with a
  specific message and the game boots to Welcome.
- Quarantine never deletes: the store keeps the raw value under
  `quarantined-<ISO>`; `clear()` removes only `current`.
- Tests (P6): one case per bullet above, against `MemorySaveStore`.

## Group P7 — full round trips

Two full keyboard games (U10 script) with a save-and-resume in the
middle: run to step N, take the store's latest save, construct a brand
new App over a `MemorySaveStore` seeded with it, Resume, continue to
gameSummary. Once with an `undo` before the save point, once with the
save point inside a community event. Assert: the resumed engine's
session equals the pre-resume session; every audience row and the host
heading are identical immediately after Resume; ruling cues still equal
ruling lines across the whole (spliced) game; the stage reward from P1
appears in `commands` as ordinary `chooseGrantedResource` entries.

## Group P8 — browser check (manual, by Sonnet, recorded)

`npm run dev`, dev-playtest + Jerusalem-to-Rome, 2 teams: play a few
turns, confirm via DevTools (`indexedDB.databases()` / the Application
tab) that `the-way/saves/current` updates after each action; reload
the page; confirm Welcome shows Resume with the right card; Resume and
confirm the host heading and audience table match; press Ctrl+Z after
resuming (undo history survived); open Game log…; start a New game and
confirm the guard. Record results and anything surprising in
OPEN_QUESTIONS.md.

## Definition of done

All P-groups green alongside the existing 415 (minus any P1-amended
assertions, each recorded); `npx tsc --noEmit` and `npm run build`
clean; no new dependency; KEYBOARD_COMMANDS.md unchanged (no new keys;
Resume/Game log/Delete are buttons — note them in its notes);
OPEN_QUESTIONS.md updated with the browser-check results and any
discrepancy (never silently fixed); IMPLEMENTATION_STATUS.md moves Phase
8 to Completed, styled like Phases 2-7; no forbidden files modified;
committed per green group and pushed.
