# PHASE10_SPEC — Accessibility and Balance Audit

Binding contract for the Phase 10 unattended implementation (design doc
§34 Phase 10; §33 testing requirements; §35 Definition of Done; §21, §23,
§29 for the audits' subjects). Read CLAUDE.md's agent rules first. This
spec outranks improvisation; where it is silent, the design doc governs,
then ACCESSIBILITY_PATTERNS.md for anything presented, then
CONTENT_AUTHORING.md for anything that touches content.

Prerequisites (all true today): Phases 2-9 green and reviewed, 2734
tests, the site deploys on every push to `main`, the production pack
`general-bible` has 128 tasks and the real Jerusalem-to-Rome journey is
v1.0.0.

## Objective (§34 Phase 10)

"Perform: keyboard-only audit; screen-reader audit; focus audit;
game-length simulation; resource-economy analysis; fairness review;
content-repeat analysis; error-recovery testing. Deliverable: **release
candidate meeting the Definition of Done.**"

This is an AUDIT phase. It produces evidence and fixes defects; it does
not redesign the game. Every group ends in one of three kinds of output:

1. **Permanent invariants** — automated tests that stay in the suite
   (the accessibility, focus, recovery and simulation-sanity groups).
2. **A committed, Brian-readable report** — `SIMULATION_REPORT.md`,
   counts and percentages only, regenerated deterministically by a test
   so it can never drift from the code that produced it.
3. **Findings with proposals** — anything that is a *design* decision
   (tuning a constant in `src/config/defaults.ts`, changing a journey
   number, adding content) goes to OPEN_QUESTIONS.md as a proposal with
   the numbers behind it. The agent does not tune balance on its own.
   Defects (a crash, a lost focus, a missing accessible name, a wrong
   formula) it fixes directly, each with a regression test.

Brian's own NVDA pass is the screen-reader audit proper (§35 item 21);
the agent's job there is to make it cheap for him: Group X9's checklist.

## Secrecy (still binding — CONTENT_AUTHORING.md §1, PHASE9_SPEC.md)

The simulations and audits run against the real `general-bible` pack.
Every report, test message, commit message and status paragraph carries
task **ids and counts only** — never a prompt, answer, option, clue, or
teaching text. `SIMULATION_REPORT.md` contains no task text and lists no
task ids either (they add nothing to a balance report). Tests over real
content follow PHASE9_SPEC's blind rules. If unsure, treat it as secret.

## Files

Opened for this phase (plus the always-open `tests/`):
- `src/sim/` — NEW: `simulate.ts` (the driver), `policy.ts` (team
  policies and the success model), `report.ts` (report rendering).
  Ships in the repo, not in the bundle (nothing in `src/ui` or `main.ts`
  imports it; Vite tree-shakes it out).
- `tests/sim/`, `tests/audit/` — NEW test directories.
- `SIMULATION_REPORT.md`, `NVDA_CHECKLIST.md` — NEW, Brian-readable.
- `src/session/builder.ts` — Group X4b only (route difficulty shifts
  draw weights) and any sufficiency-formula defect X2 proves.
- `src/ui/*` — defect fixes surfaced by X7/X8/X11 only, each small, each
  with the failing audit test as its regression test.
- `src/engine/*` — defects only, under Phase 7's rules (every
  pre-existing engine test green unchanged; no existing log-line text
  reworded; new state inside `EngineState`).
- `src/persistence/*`, `src/ui/setup.ts`, `src/ui/app.ts` — Group X6
  (recent-use memory; Brian ruled yes).
- `package.json` scripts only (no new dependency).

Do NOT modify: the design doc, `src/content/schemas.ts`,
`public/content/**` (journey and packs — balance proposals go to
OPEN_QUESTIONS; content growth is Phase 11), `src/config/defaults.ts`
(proposals only), any PHASE*_SPEC.md, CONTENT_AUTHORING.md,
ACCESSIBILITY_PATTERNS.md, KEYBOARD_COMMANDS.md unless a binding changes
(it must not this phase). If blocked, write the problem to
OPEN_QUESTIONS.md and continue with another group.

## What already exists (build on it, do not duplicate it)

- Full-game drivers: `tests/engine/full-game-smoke.test.ts`,
  `tests/session/group-s11-engine-integration.test.ts` (real
  `SessionDeck`), `tests/content/general-bible-sessions.test.ts` (real
  content, always-correct rulings), `tests/ui/group-u10-full-game.test.ts`
  (keyboard-only AND mouse-only complete games through the App),
  `tests/ui/group-v8-setup-and-playtest.test.ts` (App game against the
  real journey with the dev-playtest pack).
- Presenter buffer (`ACCESSIBILITY_PATTERNS §7`): `Presenter` records its
  announcements; `tests/ui/harness.ts` and `appHarness.ts` expose them.
- Modal focus tests: `tests/ui/group-u9-undo-menu-modals.test.ts`.
- Undo/log: `tests/engine/group-i-undo-log.test.ts`; save/resume/undo:
  `tests/persistence/group-p7-round-trips.test.ts`, `group-p8-review-fixes`.
- Estimator: `src/engine/estimator.ts` (`estimateMinutes`), planner:
  `src/session/plan.ts` (`planSession`, `recommendedTasksPerTurn`,
  `totalRequiredSuccesses`). Constants are parameters; OPEN_QUESTIONS 11.
- Deck: `src/session/builder.ts` (`buildSessionDeck`, `SessionDeck`,
  `DeckReport`, `excludeTaskIds` with oldest-first relaxation).
- Engine read API (`GameEngine` in `src/engine/engine.ts`): `getState`,
  `getSession` (deep clone — call sparingly in hot loops), `getTeam`,
  `getCurrentTaskPublic` (`canAssist/canAmplify/canExtraClue/
  canEliminateOption`), `getRevealedAnswer`, `getCommunityTaskPublic`,
  `getAvailableRoutes`, `getEffectiveStageRequirement`,
  `getPendingSurplus`, `getPendingChoicesForTeam`,
  `getPendingChoiceDetailsForTeam`, `getStagesBehindLeader`, `getConfig`,
  `getSummary`, `statusText`, `allPositionsText`. `chooseGrantedResource`
  has no state gate (a pending choice can be resolved at any time).
- `src/ui/communityProgress.ts` (`communityProgress(engine, journey)`:
  `roomProgress`, `answeredTeamIds`, pledge totals) — DOM-free; the
  simulator may import it rather than re-derive it.
- Engine facts the simulator must respect: a team's turn ends when its
  stage completes (§7.5 — no chaining stages in one turn); a relay event
  draws one shared community task; events are non-repeatable in the real
  journey; the game ends by the "finish the round" rule (a team reaching
  Rome sets `finishRoundNumber`; the round completes; `gameSummary`);
  `journeyWinners` = every team that finished; `finalPositions` uses the
  §21 comparator (`compareTeamPositions`).

## Group X1 — the simulation harness (`src/sim/`)

`simulateGame(options): SimResult` plays one complete game headlessly
against the real engine and a real `SessionDeck`, with probabilistic
rulings and explicit team policies. Deterministic for a given seed.

Options: `journey`, `packs`, `teamCount` (2-8), `seed`, `difficulty`
(`gentle|standard|challenging`, default standard), `turnTaskLimit`
(default `recommendedTasksPerTurn(teamCount)`), `policies` (one
`TeamPolicy` per team, or one for all), `successModel` (below),
`maxSteps` (default 20 000 — a game that doesn't finish is a defect,
report `steps` and throw a descriptive error naming the state it stuck
in).

Randomness: `createRng(`${seed}:sim`)` for every probabilistic decision
the simulator makes — separate from the engine's rng
(`createRng(seed)`) and the deck's (`${seed}:builder`), so the sim's
choices never perturb the engine's own draws.

Success model (`policy.ts`, all numbers are parameters with these
defaults; record them at the top of the report):

| difficulty | base P(correct) |
|---|---:|
| easy | 0.85 |
| moderate | 0.65 |
| hard | 0.45 |

Active-variant factor: assisted ×1.25 (capped at 0.95), amplified ×0.80;
an extra clue revealed this attempt adds +0.10 (once); an eliminated
option adds +0.10 (once); a Journey-Token-funded effect counts the same
as the paid one. Skipped rulings: 2% of attempts regardless. A relay
answer uses the community task's own difficulty base. The weighted
standard mix (30/50/20) gives an effective 0.67 — the estimator's 0.65
is close; the report states both.

Team policies (`TeamPolicy`, each field a small enum so the report can
name them):
- `route`: `first` (routes[0], the S11 convention) | `cheapest`
  (minimize Σ over the route's stages of `requiredSuccesses / P(correct)`
  using the route's `difficulty` as the base — after X4b that is also the
  difficulty its tasks actually draw at) | `random` (seeded).
- `window` (resource window): `passive` (never spends) | `cautious`
  (extra clue when the task is hard and Insight ≥ 1; assisted form when
  the task is hard, `canAssist`, and the team can pay the task's authored
  cost; never amplifies) | `bold` (amplified form whenever `canAmplify`
  and Courage ≥ its cost; otherwise as cautious) | `mixed` (a seeded
  per-team pick between cautious and bold at game start).
- `recover`: `always` (accept when Provision ≥ `recoverCostProvision`) |
  `never`.
- `surplus`: `keepLeast` (keep as the resource the team holds least of,
  ties → Insight, Provision, Courage) | `offer` (always offer) |
  `alternate` (offer every second surplus).
- `contribution`: `generous` (pledge up to min(owned, remaining to
  threshold, `maxPledgePerTeam`) from the resource it holds most of) |
  `hoarder` (decline).
- `grantedChoice`: `least` (take the least-held resource; never share) |
  `sharer` (share every second grant with the team furthest behind).
- `journeyToken`: `useOnHard` (spend the token for an extra clue on a
  hard task when held and `canExtraClue`) | `hold`.

Named presets exported from `policy.ts`: `PASSIVE`, `CAUTIOUS`, `BOLD`,
`GENEROUS` (cautious + offer + generous + sharer), `HOARDER` (bold +
keepLeast + hoarder + least). The report names presets, never raw
objects.

Driver (extend the S11 loop; every optional command is preceded by the
eligibility check that makes it legal, so an `IllegalCommandError` is a
simulator bug — count them in `illegalCommands` and assert 0):
- At the top of every iteration resolve every team's pending granted
  choices (`getPendingChoicesForTeam` > 0 → `chooseGrantedResource` or
  `shareGrantedResource` per `grantedChoice`).
- `forkChoice` → per `route`. `beginTurn` → `presentTask`.
- `resourceWindow` → per `window` and `journeyToken`, then
  `acceptAnswer`. Affordability is checked against the task's authored
  cost (the sim has the packs; `tasksById.get(publicTask.id)`).
- `awaitingAnswer` → `reveal`. `answerReveal` → `rule` with the success
  model (`correct`/`incorrect`/`skipped`).
- `recoverDecision` → per `recover`. `teachingReveal` → `finishTeaching`.
- `surplusDecision` → per `surplus`, one success at a time.
- `landmarkIntroduction` → `beginCommunityEvent`. `communityEvent`:
  relay → `relayAnswer` for each team not yet in `answeredTeamIds`, with
  the success model, then `resolveCommunityEvent`; contribution →
  `contribute`/`declineContribution` per team per `contribution`, then
  resolve.
- Stop at `gameSummary`.

Timing model (structural, not empirical — Brian's playtest calibrates
the constants later): `modeledSeconds` = Σ over attempts of the ACTIVE
variant's task `estimatedSeconds` + `turnOverheadSeconds` (50) per turn
+ `teachingRevealTargetSeconds` (15) per ruling + 
`locationIntroductionTargetSeconds` (25) per milestone arrival (per
team) + 180 s per community event + 300 s fixed. Report
`modeledMinutes` beside `planSession(...).estimatedMinutes` and
`estimatedRounds` beside actual rounds.

`SimResult` (all plain data): `seed`, `teamCount`, `difficulty`,
`turnTaskLimit`, `policies` (preset names), `rounds`, `turns`,
`attempts`, `steps`, `taskIds` (in draw order, community draws
included), `distinctTasks`, `illegalCommands`, `exhausted` (`null` or
`{ round, message }` when the deck threw `SessionBuildError` mid-game —
caught, the game recorded as unfinished), `winners`, `finalPositions`,
`sharedVictory` (winners.length > 1), per-team `{ id, seat, policy,
finished, resourcesEnd, resourcesGrantedBySource, resourcesSpentByUse,
capDiscards, serviceScore, journeyTokenEarned, routesChosen,
attemptsByVariant, recoverUses, surplusKept, surplusOffered,
catchUpGrants }`, `communityEvents[]` (`{ id, kind, success, pledged,
threshold, exceptionalAwards }`), `variantAttempts` (normal/assisted/
amplified totals), `modeledMinutes`, `plannedMinutes`, `plannedRounds`.
Derive counters from the event log by matching the engine's EXISTING
log lines (catch-up grants, cap discards, Service awards, exceptional
contributions); if a wording differs from what you expect, adapt the
regex — never change the log text.

Tests (`tests/sim/group-x1-harness.test.ts`, real journey +
general-bible unless stated):
- same seed → identical `SimResult` (deep equal); different seed →
  different `taskIds`.
- every preset × {2, 4, 8} teams × standard reaches `gameSummary` with
  `illegalCommands === 0`, `exhausted === null`, `attempts ===
  taskHistory.length`, `distinctTasks === taskIds.length` (no repeat in a
  session), and `winners.length ≥ 1`.
- `PASSIVE` never spends (all `resourcesSpentByUse` zero); `BOLD` at 4
  teams standard records ≥ 1 amplified attempt in at least 90 of 100
  seeds — if it does not, Courage is unobtainable or unspendable in
  practice and that is a Phase 8/9 economy defect to report (see X3),
  not a test to loosen.
- the engine's `getSummary()` at the end equals the `SimResult`'s
  winners/finalPositions.
- runtime budget: the whole `tests/sim` directory ≤ 30 s on the dev
  laptop (`vitest` reports duration); cap seed counts to fit.

## Group X2 — game length and sufficiency under realistic play

`tests/sim/group-x2-length.test.ts`. Matrix: teams 2-8 × difficulty
{gentle, standard, challenging} × presets {CAUTIOUS, BOLD, PASSIVE} × 12
seeds (duration is not an axis: it changes only the estimate, never the
deck or the engine). For each cell record median/min/max `rounds`,
`attempts`, `distinctTasks`, `modeledMinutes`, `plannedMinutes`,
`plannedRounds`, `exhausted` count, `sharedVictory` rate.

Assertions:
- No `exhausted` game at any team count at **standard** (§35 item 4:
  "two to eight teams can complete the journey"), nor at gentle.
  Challenging at 7-8 teams may exhaust; if it does, that is a Phase 11
  content-growth finding (record the shortfall category and the round),
  not a failure — BUT `buildSessionDeck` must then have WARNED at build
  time ("Content supply is tight") for that cell. A game that exhausts
  after a build that neither warned nor threw is a sufficiency-formula
  defect: fix the formula (`projectedDraws` should allow for failures
  and recoveries — e.g. divide by an effective success rate and add a
  replacement allowance) so the warning fires, and record the change.
- median `rounds` within [0.5×, 2.0×] of `plannedRounds` at standard for
  every team count (a sanity envelope, not a calibration claim).
- `modeledMinutes` vs `plannedMinutes` per cell go in the report; where
  they disagree by more than 25% at 3-4 teams standard, write a
  proposal in OPEN_QUESTIONS naming which estimator constant would
  reconcile them (do not change `estimator.ts` defaults — item 11's
  ruling: constants wait for real timings).
- Report the shared-victory rate by team count (the finish-the-round
  rule's effect).

## Group X3 — resource economy

`tests/sim/group-x3-economy.test.ts`: 4 teams standard, presets
{CAUTIOUS, BOLD, GENEROUS, HOARDER}, 40 seeds each; also 2 and 8 teams
with BOLD, 20 seeds. Record per preset: resources granted by source
(stage reward, relay reward, contribution reward, offering, surplus
kept, catch-up, sharing received), spent by use (clue, eliminate,
assist, amplify, recover, contribute, offered), mean holdings sampled
at each round start, cap-5 discards, share of attempts that were
assisted / amplified / clue-assisted, recover uses, Journey Tokens
earned, teams that ended with zero spending, teams that ended at cap.

Assertions (economy defects if violated; otherwise report):
- BOLD: amplified attempts ≥ 1 in ≥ 90% of games; CAUTIOUS: assisted
  attempts ≥ 1 in ≥ 60% of games (the faucet from Phase 8 P1 must make
  the variants reachable — that was its whole point).
- No preset ends with every team at the cap in more than 10% of games
  (flooding); no preset has a cap discard in more than 25% of games.
- Journey Token earned at least once in ≥ 30% of BOLD games (§9 is
  reachable) — report-only if violated, with a note.
Everything else is report + proposals (e.g. whether
`stageCompletionReward.amount` or `offeringWeights` want tuning).

## Group X4 — fairness

`tests/sim/group-x4-fairness.test.ts`:
- **Seat order**: 4 teams standard, 300 seeds, policies assigned by
  rotating the preset list by seed so seat and policy are independent.
  Win share per seat (a team "wins" if it is in `winners`); assert every
  seat's share is within [0.15, 0.40] — a breach is a turn-order defect
  to report with numbers (the finish-the-round rule exists to prevent
  it; if it fails, propose, do not redesign). Also report first-to-Rome
  share per seat.
- **Routes**: for every fork route, expected cost = Σ required /
  P(correct at the route's difficulty); the share of games (by
  `cheapest` and by `random` policies) choosing each route; and the
  finish position of teams by route chosen. Report; if after X4b a route
  is still cheaper than every alternative by more than 25% in expected
  cost, propose journey numbers in OPEN_QUESTIONS (do not edit the
  journey).
- **Catch-up**: trigger frequency by team count 2-8 (expected: near
  zero at 2 teams — "more than two entries behind" barely exists).
- **Community events**: relay success rate per event; contribution goal
  met rate; mean pledged; exceptional-award frequency; by preset.
- **Service**: distribution of end-of-game Service by preset;
  Barnabas-tie frequency; report that `HOARDER` earns ~0 and `GENEROUS`
  earns most (if it doesn't, Service accounting is a defect).

### X4b — route difficulty shifts draw weights (builder change, decided)

Today `route.difficulty` is descriptive only: `SessionDeck` draws every
stage at the SESSION difficulty weights, so "Mountain Route — one
success, the hardest road" is strictly dominant (fewer tasks, identical
odds). §5.3 promises forks that trade off "length, difficulty, and task
type"; make difficulty real: for a stage inside a fork route, shift the
weight row ONE step relative to the session setting — route `easy` →
one step gentler (gentle stays gentle), `hard` → one step harder
(challenging stays challenging), `moderate` → unchanged. Implement in
`popFromCategory`/`nextTask` via the same `focusForStage`-style lookup
(a `weightsForStage(stageId)` helper); `nextReplacement` uses the
same row for the current stage (pass the stage id, or store the current
stage's row when `nextTask` runs). `previewPlan` is unaffected (it has
no stage context). Tests (`tests/session/group-x4b-route-difficulty.test.ts`):
draws in `mountain-1` at a standard session skew to the challenging
row (hard share ≈ 40% ± 8 over 400 draws with `bigPack()`), `coastal-1`
to the gentle row, `asia-minor-road` unchanged; gentle + easy route
stays gentle; challenging + hard route stays challenging;
determinism under a fixed seed still holds (S1's test unchanged). Then
re-run X4's route analysis and record before/after in the report. Brian
may veto this change (OPEN_QUESTIONS item 35 records the ruling).

## Group X5 — content-repeat analysis

`tests/sim/group-x5-repeats.test.ts`. Chain consecutive sessions (4
teams standard CAUTIOUS, then 2 teams, then 8 teams) where each build
passes `excludeTaskIds` = the ids drawn by (a) the previous session only
and (b) the previous three sessions (oldest first — the builder relaxes
oldest-first). Record: sessions until the first relaxation warning,
sessions until a task actually repeats, which category relaxes first
and after how many sessions (community's reserve of 2 per relay is
carved out per build, so it exhausts on a different schedule from the
rotation categories), and the number of distinct tasks used across 1, 2,
3, 4 sessions. Assert: with one-session memory at 4 teams, sessions 1-3
have zero repeats (128 tasks vs ~34 per session). Everything else is
report → Phase 11 content-growth targets per category.

## Group X6 — recent-use memory (DECIDED: yes — Brian, 2026-09-03)

§29: "avoid tasks used in the last specified number of games." Open
item 5 had ruled "per-session memory only in version one"; item 32
offered it for Phase 10 and Brian said yes (OPEN_QUESTIONS item 35).
Everything it needs exists (`excludeTaskIds`, IndexedDB, the game's
task ids). Implement it as specified below.

- `SaveStore` gains `readRecentTasks(): Promise<RecentTasks | null>` and
  `writeRecentTasks(r: RecentTasks): Promise<void>`; `RecentTasks =
  { schemaVersion: 1, sessions: { endedAt: string; journeyId: string;
  taskIds: string[] }[] }` (max 5 sessions kept, oldest dropped).
  `MemorySaveStore` and `IndexedDbSaveStore` both implement it (same
  `saves` object store, key `recent-tasks`; zod-validated on read, a
  corrupt record is ignored and overwritten, never fatal).
- Recording: when a game reaches `gameSummary`, and when a game with
  ≥ 10 attempts is ended early via End session, `App` appends that
  session's ids (`taskHistory` ids plus every relay's drawn community
  task id — collect the latter as they occur, the way N11's test does).
- Setup: "Avoid tasks from recent games" checkbox (default ON) and a
  "Games to remember (1-5)" number field (default 3), both persisted in
  the `SetupSnapshot` (schema bump handled the Phase 8 way). When on,
  `attemptSessionGeneration` passes the union of the remembered
  sessions' ids, oldest session first, as `excludeTaskIds`. If the
  `DeckReport` contains a relaxation warning, the setup estimate line
  appends one plain sentence ("Some tasks from recent games may return:
  the pack is running low for one category.") — no category names of
  tasks, no ids; the warning itself is not spoken twice.
- Welcome's game menu gains "Forget recent tasks" (press-twice, like
  Delete saved game); "Delete saved game" does NOT clear it.
- Tests: store round-trip (memory store) and the IndexedDB store via the
  existing fake-IDB path P2 used; setup passes the right union in the
  right order; relaxation sentence appears exactly when the report
  warns; Forget clears; Delete saved game leaves it; the record holds
  ids only (assert no value longer than 40 chars — an id, never text);
  a full App game records its ids at summary.

## Group X7 — accessibility audit (automated, `tests/audit/`)

All against the REAL journey and `general-bible` (blind: ids only in
messages), through the App harness, one keyboard-only run and one
mouse-only run, unless a check is state-independent.

- **X7a Names and structure** (`group-x7a-names.test.ts`): after every
  render during a full game: every `button`, `input`, `select`,
  `[role=option]`, `[role=listbox]`, `[role=dialog]` has a non-empty
  accessible name (text content, `aria-label`, `aria-labelledby`, or a
  `<label for>`); no element has a positive `tabindex`; no action button
  has `tabindex="-1"`; no duplicate `id`s in the document; exactly one
  `aria-live="polite"` and at most one `aria-live="assertive"` region;
  every `svg` and `img` is `aria-hidden="true"` or has an accessible
  name; every screen has exactly one `h2` in the host region; the host
  region is the only element with `role="application"` (Phase 5
  Decision 1's scope — Brian decides in X9 whether it stays at all).
- **X7b Status everywhere** (`group-x7b-status.test.ts`): drive a game
  until each of the 12 reachable states has been entered at least once
  (record which); in each, press R, S, A, T: each produces a non-empty
  announcement; none changes `getState()` or the `getSession()` snapshot
  (§33.3 "repeat does not change state"); S contains the current team's
  name and, in a task state, "successes"; A lists at least one action.
  Also `?` opens help with ≥ 1 row in every state, and Escape closes it.
- **X7c Focus** (`group-x7c-focus.test.ts`): after every user action
  (each keyboard dispatch and each click), `document.activeElement` is
  inside the host region or an open modal and is never `body`/`null`;
  after each modal closes it is the invoking control; after an undo
  confirm it is inside the host region. Any breach is a defect to fix in
  `src/ui` (the usual fix: after a re-render, focus the primary action or
  the screen container — never a game-event side effect elsewhere).
- **X7d Speech hygiene** (`group-x7d-speech.test.ts`): over a full game,
  every presenter push and every visible host-region text contains none
  of `* _ # | < > \`` , no double spaces, none of "undefined", "null",
  "NaN", "[object", "Team Team"; numbers followed by a resource name are
  singular/plural correct where the engine pluralizes (Phase 7 fixed
  plurals — re-assert on the strings that appear).
- **X7e No flooding** (`group-x7e-flood.test.ts`): per user action the
  polite buffer grows by at most 4 entries; record the maximum and the
  action that caused it in the report's accessibility section (Brian's
  ear rules on whether 3-4 is too many; the test only stops runaway
  loops).
- **X7f Complete games on real content** (`group-x7f-real-games.test.ts`):
  extend U10's keyboard-only and mouse-only drivers to the real journey
  and `general-bible` (blind); both reach `gameSummary`; the summary
  panel names ≥ 1 winner and the Service award; zero presenter errors.
- **X7g Modals** (`group-x7g-modals.test.ts`): every modal (game menu,
  help, End session, Delete saved game, Audio…, New-game guard, Game
  log, Forget recent tasks if X6): Tab from the last control wraps to
  the first (and Shift+Tab the reverse), Escape closes, title announced
  on open, focus returns to the invoker on close.
- Every defect found is fixed in `src/ui` in its own commit with the
  audit test as the regression; the report lists what was found and
  fixed (counts).

## Group X8 — error-recovery matrix (§23.7)

`tests/audit/group-x8-recovery.test.ts`, App harness, real content. For
each of the five mistakes a blind host can make — chose the wrong route;
marked the wrong ruling; spent the wrong resource; advanced too early
(Continue on a teaching reveal, or Present task before the room was
ready); skipped narration — perform it, then recover:
- for the first four: Ctrl+Z (arm) announces what will be reversed and
  names the action in plain words; Ctrl+Z (confirm) restores the exact
  prior `getSession()` snapshot (deep-equal ignoring `eventLog`
  timestamps) and the prior screen heading; a mistake made, saved
  (autosave), reloaded via `rebuildFromSave` on a `MemorySaveStore`, and
  THEN undone still restores (Phase 8 proved one case; matrix all four);
- for skipped narration: N then R repeats the prompt; L replays task
  audio when a clip exists (fake backend) and announces the fallback
  when it doesn't.
Also: the game log after each recovery contains the undo line and the
reversed action (ids only where a task is involved).

## Group X9 — the NVDA checklist (manual, Brian's; the agent writes it)

`NVDA_CHECKLIST.md`: a numbered walkthrough a blind host performs with
NVDA in Chrome, each step with the exact expected announcement pattern
(use "[task prompt]" / "[official answer]" placeholders — never real
task text), covering: boot and Welcome (browse mode reads the page;
Enter on New game); the setup wizard by keyboard (browse vs focus mode
in the cursor lists, the input firewall in team-name fields, the
estimate line); Start game; a full turn (present, resource window
buttons, accept, reveal, rule, teaching); an assisted and an amplified
form; a fork; a relay (prompt, "Now answering", reveal) and a
contribution (pledge rows); a granted choice and a share; surplus
keep/offer and the offering announcement; the Journey Token; S/A/T/R in
five different states; `?` help, second `?` explorer, an unmapped key;
Escape → game menu → Game log → Copy; Ctrl+Z arm/confirm wording (the
Phase 8 review fix); reload → Resume → Ctrl+Z; End session; Sound check
(every cue by Tab+Enter; Space/X/N while a cue plays); reduced motion
on the map (a sighted helper confirms badges jump); the audience
region read in browse mode without hearing controls. Decisions Brian
records in OPEN_QUESTIONS: keep/drop `role="application"` on the host
region (Phase 5 Decision 1); the visual scale (sighted helper); "Team
Lion" symbol names (OPEN_QUESTIONS 19); whether 3-4 announcements per
action (X7e's maximum) is too many; anything that felt slow.

## Group X10 — the simulation report

`tests/sim/group-x10-report.test.ts` renders `SIMULATION_REPORT.md`
from X2-X5's results (fixed seed lists, so the content is
deterministic) via `src/sim/report.ts`, then compares it with the
committed file. If they differ, it WRITES the regenerated file and
FAILS with "SIMULATION_REPORT.md regenerated — review it, then commit";
the next run passes. (Same idea as the dev-playtest generator's
"committed file matches the generator" test, without a second script.)
The report: a dated header naming the success-model constants and
presets; one table per group (X2 length matrix, X3 economy, X4 seat
shares / routes before-and-after X4b / catch-up / events / Service, X5
repeats); a "Findings" list (counts and percentages) and a "Proposals"
list that mirrors the OPEN_QUESTIONS entries. No task text, no task
ids. Keep total `tests/sim` runtime ≤ 30 s: the report's seed counts
may be smaller than the groups' own if needed (say so in the header).

## Group X11 — browser check (manual by Sonnet, recorded — ids/counts only)

`npm run dev`, real content, **keyboard only** (no mouse at all — the
in-app Browser tool's `key` actions): Welcome → New game → complete the
setup wizard by Tab/arrows/Enter (including X6's controls if built) →
play to at least Antioch with at least one assisted form, one amplified
form, one fork, the Caesarea relay, the Antioch contribution, one
granted-choice share, one surplus offer → `?` help → second `?`
explorer → Escape menu → Game log → reload → Resume → Ctrl+Z twice →
End session. Confirm the focus indicator is visible at every step
(screenshot at three points), zero console errors, and that
`SIMULATION_REPORT.md` reads sensibly (open it in the browser via the
dev server is not required — read the file). Then `npm run build &&
npm run preview`: Welcome renders, New game shows only General Bible,
one turn plays, zero console errors. Record in OPEN_QUESTIONS as
counts, ids and observations — no task text.

## Decisions made in this spec (Fable, 2026-09-03; Brian may veto any)

1. **Route difficulty is real** (X4b): a fork route's `difficulty`
   shifts its stages' draw weights one step relative to the session
   setting. Today it does nothing, which makes the shortest route
   strictly dominant.
2. **Balance numbers are proposals, not agent edits**: `defaults.ts`,
   the journey and the packs are frozen this phase; the report and
   OPEN_QUESTIONS carry the numbers; Fable/Brian decide.
3. **The success model is a documented parameter set** (0.85/0.65/0.45
   and the variant factors), not a claim about real players; Brian's
   playtest timings (§35 item 22) calibrate `estimator.ts` later.
4. **No timed endgame in v1** (Open item 4 → Phase 11 backlog): End
   session and the §21 comparator already exist; a timer is UI surface
   with no playtest evidence behind it yet.
5. **X6 recent-use memory — Brian ruled yes (2026-09-03).** Open item
   5 had said per-session memory only; §29 says "future versions should
   optionally maintain" it, and it costs ~30 lines now that IndexedDB
   and `excludeTaskIds` exist. Supersedes Open item 5.
6. **The report is a committed artifact checked by a test**, so the
   numbers Brian reads are always the numbers the code produces.

## Definition of done

All X-groups green alongside the existing 2734 (amended tests
recorded); `npx tsc --noEmit` and `npm run build` clean; no new
dependency; no frozen file modified; `SIMULATION_REPORT.md` and
`NVDA_CHECKLIST.md` committed; every defect the audits found is fixed
with a regression test or recorded in OPEN_QUESTIONS with a reason;
every balance finding is in OPEN_QUESTIONS as a proposal with numbers;
IMPLEMENTATION_STATUS.md moves Phase 10 to Completed and adds a **§35
Definition of Done table** — the 22 items, each with "proven by: <test
file / report section / Brian's pass pending>" (items 21 and 22 are
Brian's: mark them pending his NVDA pass and his timed playtest);
committed per green group and pushed. Your final message to Brian:
counts, the findings list, the proposals list, and which §35 items wait
on him.
