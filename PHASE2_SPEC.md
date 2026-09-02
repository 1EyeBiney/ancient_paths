# PHASE2_SPEC — The Headless Game Engine

This is the implementation contract for Phase 2 (design doc §34, §27.1,
§33.1). It is written so a coding agent can work UNATTENDED. Where this file
is more specific than the design doc, this file wins; where it is silent,
the design doc (revision 1.1) wins; where both are silent, choose the
simplest reversible option and record it in OPEN_QUESTIONS.md.

## Ground rules for the coding agent

1. Work test-first from the test list below. Implement one group at a time;
   run `npm test` and `npx tsc --noEmit`; commit with a descriptive message
   when green; then continue. Never proceed past failing tests.
2. The engine lives in `src/engine/`. It is PURE TypeScript: no DOM, no
   audio, no timers, no fetch, no randomness except through an injected
   seeded RNG. Content arrives as already-validated `ContentPack` /
   `Journey` objects from `src/content/schemas.ts`.
3. Do not modify `src/content/schemas.ts`, the sample content, or the
   design doc. If a schema change seems necessary, STOP, record the need in
   OPEN_QUESTIONS.md, and work on something else.
4. Do not implement UI, audio, session-deck balancing (Phase 3), or
   persistence (Phase 8). The engine exposes data; others consume it.
5. Update IMPLEMENTATION_STATUS.md as groups complete.

## Architecture

- `src/engine/engine.ts` exports `createEngine(options)` returning a
  `GameEngine`. Options: `{ journey: Journey, packs: ContentPack[],
  teams: TeamSetup[], turnTaskLimit: number, rng: Rng, config?: Partial<GameDefaults> }`.
- `TeamSetup = { id, name, color, symbol }`. 2–8 teams (validate).
- `Rng` is an injected interface `{ next(): number }` (0 ≤ n < 1),
  implemented by a small seeded generator in `src/engine/rng.ts`
  (mulberry32 or xorshift; seed string → hash). Identical seeds must
  reproduce identical draws (§18, §33.1).
- The engine is a state machine over `GameState` (src/engine/types.ts —
  order: awaitingAnswer → answerReveal → hostRuling → recoverDecision →
  teachingReveal → …). Every mutation happens through `dispatch(command)`.
  Invalid commands for the current state throw `IllegalCommandError` and
  change nothing.
- Every consequential dispatch appends a human-readable `GameEvent` to the
  session's `eventLog` (§26 examples show the voice to use).
- Task supply: Phase 3 owns balancing. For Phase 2, the engine takes a
  simple injected `TaskSource` interface: `{ nextTask(teamId, stage):
  Task, nextReplacement(category, difficulty): Task | null,
  nextCommunityTask(category): Task }`. Provide a naive implementation for
  tests (`ArrayTaskSource`) that serves tasks in order. The real one
  arrives in Phase 3 behind the same interface.
- Undo: `dispatch` returns the new state; the engine keeps an internal
  bounded history (last 20 snapshots via structuredClone) and exposes
  `undo()` restoring the complete prior snapshot (§33.1: "undo restores the
  complete prior state"). `canUndo()` reports availability. Non-reversible
  boundaries (none in Phase 2) would clear history.

## Commands (dispatch API)

Setup/flow: `startGame`, `beginTurn`, `chooseRoute(routeId)`,
`presentTask`, `spendInsight(effect)`, `spendProvision(effect)`,
`spendCourage()` (amplify), `useJourneyToken(effect)`, `acceptAnswer`,
`reveal`, `rule(result: "correct" | "incorrect" | "skipped")`,
`acceptRecover` / `declineRecover`, `finishTeaching`, `keepSurplus(resource)`,
`offerSurplus`, `beginCommunityEvent`, `relayAnswer(teamId, correct)`,
`contribute(teamId, resource, amount)` / `declineContribution(teamId)`,
`resolveCommunityEvent`, `endTurn` (engine-driven, exposed for tests),
`undo`.

Read API: `getState()`, `getSession()` (deep-readonly PlaySession),
`getTeam(id)`, `statusText()` (the §23.3 ordered spoken status string),
`allPositionsText()` (§5.2 landmark-first phrasing).

## Rule details (binding)

### Turns and tasks
- Turn order is fixed team order, round-robin. A turn presents up to
  `turnTaskLimit` tasks, one at a time, linear (§7.2). Declining = skipped
  = failed, no replacement unless Provision recovery is used.
- Task flow states: taskPreview → taskPresentation → resourceWindow →
  awaitingAnswer → answerReveal → hostRuling → (recoverDecision if
  incorrect + affordable) → teachingReveal → progressResolution.
- HOST-AS-PLAYER (rev 1.1): the engine never exposes `answer` /
  `acceptedAnswers` for the live task before the `reveal` command — enforce
  via the read API returning a `PublicTask` view (no answer fields) until
  reveal. This is testable and non-negotiable.

### Resources (§8)
- Cap 5 each (config). Awards beyond cap: excess offered to another
  eligible resource when the award rule allows choice, else discarded;
  event log records it (§8 intro).
- Insight effects in Phase 2: `extra-clue` (serves next unused entry of
  task.clues; illegal if none), `eliminate-option` (only when the active
  variant has `options`; removes one incorrect option via rng), `replay`
  (no state change beyond logging — presentation replays).
- Provision effects: `assist` (switch to assistedVariant before answer;
  pays its authored cost — note the cost's resource field governs, some
  assisted variants cost insight), `recover` (after incorrect ruling:
  draws `nextReplacement(category, difficulty)`; if the source returns
  null, recovery is not offered). Recovery task replaces the failed task
  within the same turn and does NOT consume an additional task slot.
- Courage: `spendCourage` switches to amplifiedVariant (must exist), pays
  cost, success then awards 2, failure 0 (§8.3).
- Timing (§8.4): insight/provision-assist/courage/journey-token only in
  resourceWindow; recover only in recoverDecision. After `acceptAnswer`,
  spending is locked.

### Journey Token (§9)
- Awarded on perfect stage completion (definition §9) if not already held;
  max 1. `useJourneyToken(effect)` performs one eligible normal resource
  effect without cost, in resourceWindow only. Cannot exceed the task's
  declared max success value; cannot convert to Service.

### Stage completion, surplus, perfect (§7.5–7.6, §9)
- On reaching requiredSuccesses mid-turn: stage completes immediately,
  remaining pending successes from that turn become surplus, team does not
  start the next stage this turn, turn ends after surplus + rewards.
- Each surplus: `keepSurplus(resource)` (team chooses, default rule §7.6)
  or `offerSurplus` → draw from journey.offeringOutcomes weighted by
  config.offeringWeights over categories, apply effect, award
  serviceAwards.offerSurplus Service ALWAYS (§10).
- Offering effects implemented: grant-resource (targets per schema;
  "choice" grants a pending choice the offering/receiving team resolves via
  `keepSurplus`-style command `chooseGrantedResource(teamId, resource)`),
  reveal-next-stage-info (log + flag), grant-clue-next-task (flag on
  target team consumed by next task's resourceWindow as a free clue),
  boost-next-community-event (flag consumed by next event: reward amount +1
  where amount exists), none.

### Forks (§5.3)
- Entering a fork stage: state forkChoice; `chooseRoute` locks the route
  for that team until its route stages complete; different teams may pick
  different routes; route info is fully readable before choice (§3.6).

### Milestones & Community Events (§12)
- First team completing a stage with `arrivesAtMilestoneId` triggers that
  milestone's event (if authored and untriggered): finish stage rewards
  first, then state landmarkIntroduction → communityEvent; ordinary turn
  position saved and restored after resolution. Milestones trigger once.
- RELAY: room needs `successThreshold` correct parts; each team in order
  contributes via `relayAnswer(teamId, correct)` (host rules each part;
  the shared prompt comes from `nextCommunityTask(taskCategory)`). Reward
  on success: apply roomReward. Exceptional-contribution Service is Phase 7.
- CONTRIBUTION: each team in order pledges via `contribute` (validating
  the team owns the resource; each pledge earns
  serviceAwards.donateResource) or declines. Threshold met → roomReward.
  Contributions never refund.
- roomReward: grant-resource-every-team (choice handled per team like
  granted-choice above); reduce-next-stage-requirement (each team's NEXT
  stage requirement −amount, min 1, one-shot flag).
- Catch-up config is Phase 7; leave a hook, no behavior.

### Endgame (§21 + ruling 2026-09-02)
- A team completing the final stage (arriving at destinationMilestoneId)
  is a finisher. THE ROUND FINISHES: remaining teams in the round still
  take their turns (equal turn counts); any team finishing in that same
  round shares the victory. Then state gameSummary.
- Summary data: journey winner(s); Barnabas Award = highest serviceScore,
  ties shared, NEVER broken by journey position (§11); final positions
  ordered by §21 rules (furthest landmark, stages beyond, successes,
  remaining resources; Service never used).

### Service (§11)
- serviceScore adjustments only through the configured serviceAwards table.
  Service never affects position, victory, or ties for victory.

## Duration estimator (Phase 2 utility, used by setup later)

`src/engine/estimator.ts`:
`estimateMinutes({ teamCount, tasksPerTurn, avgTaskSeconds = 45, turnOverheadSeconds = 50, totalRequiredSuccesses, successRate = 0.65, communityEventCount, communityEventMinutes = 3, fixedOverheadMinutes = 5 })`
→ rounds ≈ ceil(totalRequiredSuccesses / (tasksPerTurn × successRate));
minutes ≈ teamCount × rounds × (tasksPerTurn × avgTaskSeconds +
turnOverheadSeconds) / 60 + communityEventCount × communityEventMinutes +
fixedOverheadMinutes. Pure function. Constants are parameters — playtests
will tune them.

> **Correction (2026-09-02, spec author):** this section's original worked
> example claimed 4 teams / 3 tasks / 9 successes / 2 events ≈ "50–60 min."
> That was an arithmetic error in the spec, caught during implementation:
> the formula as written correctly computes ~72.7 minutes for those inputs.
> The formula and constants STAND as implemented; the design consequence
> lands on journey authoring instead — a Standard 4-team, 55-minute game
> supports roughly 7 total required successes, not 9. See PHASE3_SPEC.md
> §Duration targets and OPEN_QUESTIONS item 11 (resolved).

## Task-handling specifics (defaults, veto-able by Brian)

- Answers are spoken aloud in the room; the engine never stores the team's
  answer text. `acceptAnswer` is a host keypress, nothing typed.
- `eliminate-option` removes exactly one incorrect option per use and may
  be used repeatedly while >2 options remain.
- Audio/listening tasks with `audioAsset: null` are served like any task;
  their prompts carry the material (transcript-style). Asset playback is
  Phase 6.
- decision-strategy tasks are ruled like any other (correct = reasoned
  answer per hostGuidance); the engine does not special-case them.
- estimatedSeconds feeds the estimator only; no per-task timers in v1.

## Test list (§33.1 expanded — implement in this order)

Group A — foundation: A1 engine boots with valid content and 2–8 teams;
A2 rejects <2 or >8 teams; A3 identical seed → identical rng draws;
A4 illegal command throws and mutates nothing; A5 statusText follows the
§23.3 order.

Group B — turns/stages: B1 successes persist across turns; B2 failure
never erases successes; B3 stage completes mid-turn and turn ends;
B4 no chaining stages in one turn; B5 turn ends at task limit with
progress preserved; B6 declined task = failed; B7 normal success = 1.

Group C — forks: C1 route info readable before choice; C2 route locks
until stage completion; C3 teams choose independently; C4 rejoin at the
entry after the fork.

Group D — resources: D1 caps at 5 with overflow handling logged;
D2 insight extra-clue serves clues in order and refuses when exhausted;
D3 eliminate-option only with options, removes an incorrect one;
D4 provision assist switches variant and pays authored cost; D5 courage
amplify success = 2; D6 amplify failure = 0; D7 spending locked after
acceptAnswer; D8 recovery draws same category/difficulty, same turn, no
extra slot; D9 recovery unavailable when source empty or unaffordable.

Group E — reveal privacy: E1 answer fields unreadable before reveal;
E2 readable after reveal; E3 reveal precedes ruling in the state order.

Group F — tokens/surplus/offering: F1 perfect stage grants token; F2 max
one token; F3 token performs an eligible effect free; F4 surplus counted
correctly; F5 keepSurplus grants chosen resource; F6 offerSurplus always
earns Service; F7 offering draw respects weights (statistical over seeds)
and every category drawable; F8 offering effects apply per spec and never
remove progress.

Group G — milestones/events: G1 milestone triggers once, first arrival
only; G2 turn order preserved around events; G3 relay success threshold →
roomReward; G4 relay failure → no reward, no penalty; G5 contribution
pledges validate ownership, earn Service, never refund; G6 threshold met →
reward; G7 reduce-next-stage floors at 1.

Group H — endgame/service: H1 finisher ends game after the round
completes; H2 same-round finishers share victory; H3 positions ordered per
§21; H4 Service never breaks a journey tie; H5 Barnabas = top Service,
ties shared; H6 Service adjustments only via serviceAwards values.

Group I — undo/log: I1 undo restores complete prior state (deep equal);
I2 undo after wrong ruling; I3 every consequential command logs a
readable event; I4 estimator worked example lands in 50–60 min.

## Definition of done (Phase 2)

All groups implemented and green; `npx tsc --noEmit` clean; no schema or
content changes; IMPLEMENTATION_STATUS.md updated; a scripted full game
(2 teams, ArrayTaskSource, fixed seed) runs from startGame to gameSummary
inside a test.
