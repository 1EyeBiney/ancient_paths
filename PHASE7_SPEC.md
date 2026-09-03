# PHASE7_SPEC — Community and Offering Systems

Binding contract for the Phase 7 unattended implementation (design doc
§34 Phase 7; §7.6, §10, §11, §12, §36). Read CLAUDE.md's agent rules
first. This spec outranks improvisation; where it is silent, the design
doc governs, then ACCESSIBILITY_PATTERNS.md for anything presented.

**This phase opens `src/engine/` to the implementer** (Phases 3-6 did
not). Rules for touching it:

- Every existing engine test stays green unchanged (`tests/engine/`,
  including `full-game-smoke`). If one must change, stop and write to
  OPEN_QUESTIONS.md.
- All new runtime state lives inside `EngineState` (so the existing
  `structuredClone` undo snapshot covers it for free). No module-level
  state.
- **Existing event-log line texts are frozen.** The UI matches several
  by regex (`communityProgress.ts`, `app.ts` cues). Add new lines; never
  reword old ones.
- The engine stays presentation-free: no strings meant for the screen
  except event-log lines, which are the engine's spoken record.

Do not modify: the design doc, `src/content/schemas.ts` (nothing here
needs it — every offering effect and event shape already exists),
`dev-sample.json`, `jerusalem-rome.json`, `src/session/`, or any
PHASE*_SPEC.md. If blocked, write the problem to OPEN_QUESTIONS.md and
continue with another group.

Prerequisites (all true today): Phases 2-6 green, 374 tests, the site
deploys on every push to `main`.

## Objective (§34 Phase 7)

"Landmark-triggered events; team contributions; room-wide rewards;
catch-up configuration; surplus offerings; weighted outcome pools;
Service awards. Deliverable: **community mechanics function without
changing permanent progress unfairly.**"

Most of that list already works in the Phase 2 engine (tests F4-F8,
G1-G7, H4-H6). What this phase finishes:

1. **Catch-up** — configured, wired from setup, applied, announced.
2. **Exceptional contributions** — pledge amounts, the 2-point award.
3. **Choosing the community** — sharing a granted resource with another
   team earns Service (the one §11 action with no decision point yet).
4. **Offering outcomes surfaced** — the room hears what an offering did;
   `reveal-next-stage-info` reveals something.
5. **Service visible** — audience column, status, summary
   accomplishments, the configurable public name.
6. **Repeatable events** honored; boost and free-clue effects verified.

Permanent progress is never reduced by anything in this phase. No team
loses a turn, a stage, a success, or a resource it did not choose to
give. Read §3.4 twice.

## Configuration (§36 — `src/config/defaults.ts`)

Add, keeping everything already there:

```
catchUp: {
  enabled: true,            // setup's "Community catch-up" toggle overrides this
  stagesBehind: 2,          // eligible when MORE than this many stages behind the leader
  bonus: { resource: "choice", amount: 1 },   // resource: insight|provision|courage|"choice"
},
community: {
  exceptionalShare: 0.5,    // a single team pledging >= this share of the threshold …
  exceptionalMinimum: 2,    // … and at least this many units, is "exceptional"
  maxPledgePerTeam: 3,      // the UI offers 1..min(owned, this) per accepted resource
},
```

`EngineOptions.config` (already `Partial<GameDefaults>`) carries
overrides; app.ts passes `{ catchUp: { ...DEFAULTS.catchUp, enabled:
wizard.communityCatchup } }`. Setup's checkbox label loses "(applies
from Phase 7)".

## Engine changes (`src/engine/engine.ts`, `src/engine/types.ts`)

### Stage ordinal and "stages behind"

`stageOrdinal(team)`: the index in `journey.entries` of the entry that
contains the team's current stage (a fork's route stages map to the
fork's own index — choosing the longer route never counts as being
further along), plus 1 if the team has finished the journey. `stagesBehind
= max(0, max(ordinal over all teams) − ordinal(team))`. Eligible for
catch-up when `stagesBehind > catchUp.stagesBehind`. Expose
`getStagesBehindLeader(teamId): number` on `GameEngine` (the UI announces
it).

### Catch-up (on community-event SUCCESS only — decision, see item 26)

In `cmdResolveCommunityEvent`, after `applyRoomReward`, if
`config.catchUp.enabled`: for every eligible team,
`grantOrQueueChoice(team, bonus.resource, bonus.amount, "catch-up")` and
log `Catch-up: Team ${name} is ${n} stages behind and may choose
${amount} resource.` (or `… receives ${amount} ${resource}.` when the
bonus names a resource). A failed event grants no catch-up. The leader
is never touched.

### Pledge amounts and exceptional contributions

`cmdContribute` already accepts any amount. Add `pledgedByTeam:
Record<teamId, number>` to `CommunityEventRuntime` (contribution events
only). At resolve time (success OR failure — the generosity happened),
every team with `pledgedByTeam[id] >= max(exceptionalMinimum,
ceil(exceptionalShare × contributionThreshold))` earns
`serviceAwards.exceptionalCommunityContribution` and the log line
`Team ${name} made an exceptional contribution.` (in addition to the
per-pledge `donateResource` award already granted).

### Sharing a granted resource (§11 "voluntarily sharing an eligible reward")

New command `{ type: "shareGrantedResource"; teamId; toTeamId }`. Legal
whenever `teamId` has a pending choice (any state where
`chooseGrantedResource` is legal); `toTeamId !== teamId` and must exist.
Removes one of the sharer's pending choices and pushes a pending choice
of the same amount for `toTeamId` (reason: `a gift from Team ${name}`),
awards the sharer `serviceAwards.chooseCommunityBenefit`, logs
`Team ${name} shares its gift with Team ${other}.` The recipient
resolves it with the ordinary `chooseGrantedResource`. A gift may not be
re-shared (a pending choice carries `shareable: boolean`; gifts are
`false`) — no infinite Service loops.

### Service log line

`awardService` logs `Team ${name} earns ${amount} Service.` after
incrementing. (Every existing Service path — offer, pledge — gains this
line; existing tests assert on `serviceScore`, not the log, so they are
unaffected.)

### Offering effects surfaced

`cmdOfferSurplus` keeps its existing line and adds a second:
`Offering effect: ${summary}` with summary by effect type:

| effect | summary |
|---|---|
| grant-resource, offering-team | `Team ${name} receives ${amount} ${resource}.` / choice: `Team ${name} may choose ${amount} resource.` |
| grant-resource, every-team | `Every team receives …` / `Every team may choose …` |
| grant-resource, random-other-team | `Team ${target} receives …` / `Team ${target} may choose …` (target is the team actually drawn) |
| reveal-next-stage-info | `Team ${name}'s next stage is ${stage.name}, needing ${requiredSuccesses} successes.` / next entry is a fork: `Team ${name}'s road divides next at ${fork.name}.` / nothing after: `Team ${name} is on the final stretch.` |
| grant-clue-next-task | `Team ${target} will receive a free clue on its next task.` |
| boost-next-community-event | `The next community event's reward is strengthened.` |
| none | `No further effect.` |

`reveal-next-stage-info` thereby actually reveals something (today it
only logs "learns about its next stage").

### Repeatable events

`arriveAtMilestone`: a `repeatable: true` event triggers on EACH team's
first arrival at its milestone (track `repeatableArrivals: Record<eventId,
teamId[]>` in `EngineState`); a non-repeatable event keeps today's
once-per-game behavior. `triggeredMilestones` still receives the
milestone id on every trigger (duplicates allowed) so
`communityProgress.ts`'s `.at(-1)` lookup keeps working.

### Summary and status

`GameSummary` gains `serviceAwardName: string` (from config) and
`communityAccomplishments: string[]` — human lines derived from the log
and state, in this order, omitting empty ones: `The room succeeded at
${title}.` per success, `The room fell short at ${title}.` per failure,
`${n} surplus successes were offered.`, `${n} resources were pledged to
community events.`, `Team ${name} made an exceptional contribution.`,
`${n} gifts were shared between teams.` `statusText()` appends
`Service ${n}.` after the Journey Token sentence. `allPositionsText()`
unchanged.

## Presentation changes (`src/ui/`)

### Voiced log lines (app.ts)

app.ts already diffs `session.eventLog` per render for cues. Generalize
that into ONE table `EVENT_LOG_VOICE: { pattern: RegExp; cue?: CueId;
present?: boolean }[]`; existing cue rows keep their patterns; new rows:

| pattern | cue | present |
|---|---|---|
| `^Team .+ offers a surplus success: ` | `offering` | yes |
| `^Offering effect: ` | — | yes |
| `^Catch-up: ` | `serviceEarned` | yes |
| `^Team .+ earns \d+ Service\.$` | `serviceEarned` | yes |
| `^Team .+ shares its gift with Team ` | — | yes |
| `^Team .+ made an exceptional contribution\.$` | — | yes |
| `^Team .+ receives a free clue from an earlier gift\.$` | — | yes |

"present" means `presenter.present({ visual: line })` (polite), in log
order, AFTER the screen's own entry announcement (the screen renders
first; app.ts's hook runs after it). That is the order a host wants
anyway: what just happened, then what's next. Ruling: when two or more
voiced lines arrive in one render, join them into ONE `present()` call
separated by spaces — the presenter gate's deferred slot is latest-wins,
and nothing may be dropped.

Two new cues in `cues.ts`: `offering` (three soft rising tones, ≈ 350
ms total, gain ≤ 0.7) and `serviceEarned` (two short tones, ≈ 200 ms).
`CUE_LABELS` in app.ts gains both (TypeScript forces it); the Sound
check lists them automatically.

### Pledge amounts (screens.ts, communityEvent)

The "Pledge choice" cursor list offers, per accepted resource, `Team
${name}: contribute ${k} ${resource}` for k = 1..min(owned,
`community.maxPledgePerTeam`), then decline. Ids `contribute-${resource}-
${k}`. A team still responds once. `communityProgress.ts` already parses
amounts.

### Sharing a gift (screens.ts, wherever pending choices render)

Beside each team's existing `chooseGranted-${team}-${resource}` buttons,
one `share-${team}-${toTeam}` button per OTHER team, label `Team ${name}:
share with Team ${other}`, absent when the pending choice is itself a
gift (`shareable: false` — the engine must expose it: `getPendingChoicesForTeam`
stays a count; add `getPendingChoiceDetailsForTeam(teamId): { amount;
reason; shareable }[]`). Keyboard: Tab + Enter (they are buttons);
`appHarness.keyboardStep` already clicks `chooseGranted-…-insight` and
must keep working untouched.

### Service visible

- Audience teams table: a `Service` column (`data-col="service"`) after
  Journey Token, before Status.
- Audience game-summary panel and the host `gameSummary` screen: the
  award line uses `summary.serviceAwardName`; a "Community" list of
  `communityAccomplishments`; the spoken summary appends `${n} community
  accomplishments.` (n > 0) — the host reads the list on screen or with
  R.
- `buildStatus` (S key) already speaks `statusText()`, so Service comes
  for free; add a Group C7 assertion.

### Setup

The catch-up checkbox label becomes "Community catch-up (teams more than
two stages behind get a bonus when the room succeeds)". `beginJourney`
passes the config override. `SetupWizard.describe()`'s existing
"Community catch-up: on/off" sentence stands.

## Test list (implement in order; engine groups under tests/engine/,
UI groups under tests/ui/)

Group C1 — catch-up (engine): `stageOrdinal` on testJourney (a team on
`a-stage` or `b-stage` has the fork's ordinal; a finisher is +1);
`getStagesBehindLeader`; with three teams and the leader two forks
ahead… simplest: seed positions by playing (use fixtures'
`advanceBothTeamsToFork`-style helpers) so one team is 3 entries behind,
then a relay success grants that team, and only that team, a pending
choice with the `catch-up` reason and logs the `Catch-up:` line;
`enabled: false` grants nothing; a failed event grants nothing; the
leader never receives catch-up; `stagesBehind` boundary is strict (`>`).

Group C2 — pledges (engine): a pledge of 2 deducts 2 and adds 2;
`pledgedByTeam` sums repeated pledges; at resolve, a team at or above
`max(2, ceil(0.5 × threshold))` earns +2 Service and the log line, a
team below does not; the award happens on failure too; per-pledge
`donateResource` still applies (so a 2-unit exceptional pledge nets 3
Service).

Group C3 — sharing (engine): `shareGrantedResource` moves the pending
choice, awards `chooseCommunityBenefit` to the sharer, logs; the
recipient's `chooseGrantedResource` then grants normally; sharing with
yourself, a nonexistent team, or with no pending choice is
`IllegalCommandError`; a received gift cannot be re-shared; `undo`
reverts a share completely (Service, both queues, log).

Group C4 — offerings surfaced + repeatable (engine): each of the seven
effect summaries appears verbatim after its outcome (use `fixedRng` to
force each outcome); `reveal-next-stage-info` names the real next stage
/ fork / final stretch for the offering team's position; a repeatable
relay fires for Matthew AND Mark, a non-repeatable one only for the
first (G1 unchanged); `boost-next-community-event` raises the next
event's `grant-resource-every-team` amount by 1 and the flag clears
after; `grant-clue-next-task` reveals clue 1 on the target's next task
and logs the free-clue line; `awardService` logs the Service line on
every existing path (F6, G5 scenarios).

Group C5 — summary and status (engine): `communityAccomplishments`
lines in order for a played game with one success, one failure, two
offerings, three pledged units, one exceptional contribution, one gift;
empty list when nothing communal happened; `serviceAwardName` comes from
config; `statusText()` ends with `Service n.`; H4 (Service never breaks
a tie) and H6 (Service only via the awards table) re-run untouched.

Group C6 — presentation (App + fake backend, testJourney + the Phase 6
audio fixtures or bigPack): a relay success with catch-up on voices the
`Catch-up:` line and plays `serviceEarned`; an offering voices both
lines (one `present()` call) and plays `offering`; the pledge list
offers 1..3 per resource when the team owns 3 and only 1..1 when it
owns 1; a share button per other team appears beside a pending choice
and clicking it moves the gift (recipient's buttons appear, sharer's
vanish); gift buttons don't offer re-sharing; the audience Service
column tracks `serviceScore` after every render; the setup checkbox off
→ engine config `catchUp.enabled === false` (spy or a getter on the
harness); Sound check lists the two new cues.

Group C7 — full games (the U10 keyboard script plus a mouse variant):
catch-up on and off, both to `gameSummary`; the summary screen and
audience panel show `serviceAwardName` and the accomplishments list;
every voiced line in the log appears in the presenter log (capture
`present` unbounded, as Group A7 did); ruling cues still equal ruling
lines; no permanent-progress field (`currentMilestoneId`,
`stagesBeyondMilestone`, `stageSuccesses`, `finishedTeamIds`) ever
decreases across the game except through `undo` (assert per step).

Group C8 — browser check (manual, by Sonnet, recorded in OPEN_QUESTIONS):
`npm run dev`, dev-playtest + Jerusalem-to-Rome, 3 teams: reach the
Caesarea relay, resolve it with catch-up on and confirm the `Catch-up:`
announcement and the audience Service column; reach Antioch, pledge 2
of one resource, confirm the exceptional line; make an offering and
confirm both lines are spoken and the `offering` cue reaches the
backend; share a gift and confirm the recipient's choice appears.
Sonnet cannot hear; Brian's ear is the final check.

## Definition of done

All C-groups green alongside the existing 374; `npx tsc --noEmit` and
`npm run build` clean; KEYBOARD_COMMANDS.md unchanged (no new keys) but
its notes mention the share/pledge buttons; OPEN_QUESTIONS.md updated
with the browser-check results and any discrepancy (never silently
fixed); IMPLEMENTATION_STATUS.md moves Phase 7 to Completed, styled like
Phases 2-6; no forbidden files modified; committed per green group and
pushed.
