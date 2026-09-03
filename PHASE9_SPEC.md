# PHASE9_SPEC — Version-One Content (and the relay prompt)

Binding contract for the Phase 9 unattended implementation (design doc
§34 Phase 9; §13 task categories; §17 records; §30.1 minimum content;
CONTENT_AUTHORING.md, which binds ALL content work). Read CLAUDE.md's
agent rules first. This spec outranks improvisation; where it is silent,
the design doc governs, then CONTENT_AUTHORING.md for anything authored,
then ACCESSIBILITY_PATTERNS.md for anything presented.

Prerequisites (all true today): Phases 2-8 green, 460 tests, the site
deploys on every push to `main`.

## Objective (§34 Phase 9)

"Author and validate: Jerusalem-to-Rome journey; landmark introductions;
General Bible task pack; Community Events; offering outcomes;
placeholder or final audio references. Deliverable: **at least two full
test sessions can be played with minimal content repetition.**"

Plus one engine gap this spec closes first (Group N1): PHASE2_SPEC
("Milestones & Community Events") says a relay's shared prompt "comes
from `nextCommunityTask(taskCategory)`", but `cmdBeginCommunityEvent`
never draws one. Today a relay is a question-less screen ("Now
answering: Team X" with correct/incorrect buttons); the `community`
task category, the builder's per-relay reserve, `taskCategory` on the
event definition, and `nextCommunityTask` are all dead paths. Real
community tasks are worthless until a relay actually asks them.

## THE SECRECY PROTOCOL (binding, read twice)

Brian plays this game. CONTENT_AUTHORING.md §1 governs; this spec makes
it operational for an unattended session whose transcript Brian reads:

1. **Never put production task text anywhere Brian reads.** Not in chat
   output, not in your final summary, not in commit messages, not in
   IMPLEMENTATION_STATUS.md, OPEN_QUESTIONS.md, CLAUDE.md, this spec, or
   any test's source. Refer to production tasks by id and by category
   counts only ("40 scripture-knowledge tasks authored, 14 hard").
2. **Write the pack with the Write/Edit tools directly to
   `public/content/packs/general-bible.json`**, in as few, large chunks
   as practical. Never `cat`, `head`, `grep -n` with output, `node -e
   console.log(...)`, or otherwise print pack contents into Bash output.
   (Brian has been asked not to expand the Write tool calls of this
   session; the fewer there are, the easier that is.)
3. **Tests over production content are blind.** Every assertion is of
   the form `expect(ok, \`task ${task.id}: <rule name>\`).toBe(true)` —
   an id and a rule name, nothing else in the message. Never
   `toEqual`/`toContain`/`toMatch` against a task's `prompt`, `answer`,
   `acceptedAnswers`, `clues`, `teachingReveal`, `historicalNote`,
   `hostGuidance`, variant prompts, or `options`; never snapshot a task;
   never `console.log` one. A failing test must be diagnosable from the
   id alone (you then open the file yourself, silently, and fix it).
4. **The diagnostic deck preview and any deck report are spoiler-bearing
   only if they carry text**; `DeckReport` carries counts only and may be
   asserted on. Task ids are safe (they are opaque: `gb-sk-017`).
5. **The `dev-sample` pack is the only pack Brian reads.** Do not reuse
   any of its tasks, prompts, or answers in `general-bible`.
6. **A journey file is NOT secret.** Milestone introductions, route
   descriptions, event titles/descriptions, and offering announcements
   are all read aloud to the whole room; they may be quoted, discussed,
   and committed normally. Only TASKS are secret.

If you are ever unsure whether something is secret, treat it as secret.

## Files

Opened for this phase (in addition to the always-open `tests/`):
- `public/content/journeys/jerusalem-rome.json` — the v1 journey (it was
  Phase 1's sample; from this phase on it is production content and the
  "never modify sample content" rule no longer covers it).
- `public/content/packs/general-bible.json` — NEW; the production pack.
- `src/engine/engine.ts`, `src/engine/taskSource.ts` — Group N1 only,
  under Phase 7's rules (every pre-existing engine test green; new state
  inside `EngineState`; existing log-line texts frozen, new lines may be
  added).
- `src/ui/screens.ts`, `src/ui/audience.ts`, `src/ui/app.ts`,
  `src/ui/setup.ts`, `src/main.ts` — Groups N1 and N3 only.
- `scripts/make-dev-playtest.mjs` — only if a regeneration is needed.

Do NOT modify: the design doc, `src/content/schemas.ts` (no schema
change is needed this phase — see Group N3's id convention),
`dev-sample.json` (Brian's readable pack), `src/session/`, any
PHASE*_SPEC.md, CONTENT_AUTHORING.md. If blocked, write the problem to
OPEN_QUESTIONS.md (without content text) and continue with another
group.

## Group N1 — the relay prompt (engine + UI; do this first)

A relay event asks the room ONE shared community task. The engine draws
it, the host screen and audience view show it, the host rules each
team's part by the task's `hostGuidance`, and the answer is revealed to
everyone when the event resolves (host-as-player: nobody hears the
answer before every team has answered).

- `TaskSource.nextCommunityTask(category)` becomes `Task | null`.
  `SessionDeck` (unchanged, `src/session/` is frozen) still returns a
  `Task` or throws `SessionBuildError` — that already satisfies the wider
  type. `ArrayTaskSource.nextCommunityTask` returns `null` when it has no
  task of that category instead of throwing, and uses its OWN cursor so
  that drawing a community task never shifts the ordinary `nextTask`
  sequence — this is what keeps every existing ArrayTaskSource-based
  relay test (C1, C2, C4, C5, G, U8, V6) green unchanged.
- `CommunityEventRuntime` gains `task: Task | null`. In
  `cmdBeginCommunityEvent`, for a `relay` event only, draw
  `this.taskSource.nextCommunityTask(event.taskCategory)` and store it.
  No new log line on begin (the existing "The room begins X." stays).
- New read method on `GameEngine` (and `RecordingEngine` forwards it):
  `getCommunityTaskPublic(): { id: string; title: string; prompt: string;
  hostGuidance: string | null } | null` — the `normalVariant.prompt`,
  never the answer, never accepted answers. Non-null only while a relay
  event with a task is active.
- In `cmdResolveCommunityEvent`, for a relay with a task, log AFTER the
  success/failure line: `Community answer: ${task.answer}.` then
  `${task.teachingReveal}` as its own line (existing lines untouched;
  these are new texts). app.ts's `EVENT_LOG_VOICE` gains
  `{ pattern: /^Community answer: /, present: true }` so the reveal is
  spoken; the teaching line is NOT voiced (the host reads it from the
  Game log or the screen if wanted — keep the moment short).
- `screens.ts` `renderCommunityEvent`, relay branch: after the event
  description, render `<p data-community-prompt>` with the prompt and,
  if present, `<p data-community-guidance>Host guidance: …</p>`; the
  entry announcement becomes `${heading}. ${prompt} Room progress N of
  M. Now answering: Team X.` (prompt first — it IS the task). When no
  task was drawn (ArrayTaskSource returned null) render exactly what
  renders today.
- `audience.ts` `renderCommunity`: add the prompt (`data="community-
  prompt"`) under the description when present. Never the guidance
  (it can hint at judging), never the answer.
- Tests (N1, engine — `tests/engine/group-n1-relay-prompt.test.ts`,
  testJourney + testPack, whose `community-1` is the drawable task):
  beginning the relay draws it and `getCommunityTaskPublic()` has no
  `answer` key; a contribution event draws nothing; resolve logs the two
  new lines in order after the success/failure line; undo of
  `beginCommunityEvent` clears it; a source with no community task
  (ArrayTaskSource of sk tasks only) begins the relay with `null` and
  still resolves; `ArrayTaskSource`'s ordinary draw order is identical
  with and without an interleaved `nextCommunityTask` call; a full
  S11-style game against a real `SessionDeck` still replays identically
  (the drawn task is part of the deterministic record — extend
  `tests/persistence/group-p3-recording-replay.test.ts`'s driver to
  assert `getCommunityTaskPublic()?.id` matches after replay).
- Tests (N1, UI — `tests/ui/group-n1-relay-prompt-ui.test.ts`, the
  appHarness's synthetic pack): the relay screen shows the prompt and
  the audience panel shows it; the reveal line is presented on resolve;
  the audience never shows the answer before resolve (search the
  audience HTML for the synthetic answer string — synthetic content is
  not secret).

## Group N2 — the journey (public content)

Author the full v1 `jerusalem-rome.json` (`version` → `"1.0.0"`; every
existing save quarantines on the version change, which is correct).

Shape (decided; the numbers are the default — the planSession
assertions below are what binds, and you may move successes between
stages/routes to satisfy them):

| Entry | Kind | Successes | Arrives at | Event |
|---|---|---|---|---|
| The Road from Jerusalem | stage | 2 | Caesarea | relay, threshold 2 |
| The Road North Divides | fork: Coastal (easy, 3) / Inland (moderate, 2) / Mountain (hard, 1) | mean 2 | Antioch | contribution, threshold 3 |
| Across Asia Minor | stage | 1 | Ephesus | relay, threshold 2 |
| The Aegean Crossing | fork: By Sea to Corinth (easy, 1) / Overland through Macedonia (hard, 1) | mean 1 | — | — |
| The Appian Way | stage | 1 | Rome | contribution, threshold 4 |

`totalRequiredSuccesses` = 7. Why 7 and not the old 9: with the
estimator's current (unvalidated, Phase 10 tunes it) constants, 7 is
what a Standard 55-minute session buys at 3-4 teams (OPEN_QUESTIONS
item 11); 9 already estimates at 73 minutes for 4 teams. Why relay
thresholds of 2: each team answers exactly once per relay
(communityProgress.ts), so a threshold above the team count is
unreachable (item 27); 2 is reachable by every room from 2 teams up.

- Five milestones with coordinates inside the existing viewport:
  Jerusalem 31.7683/35.2137, Caesarea 32.4995/34.8919, Antioch
  36.2021/36.1604, Ephesus 37.9411/27.3419, Rome 41.9028/12.4964.
  `ambientAudioAsset: null` everywhere (real ambience waits for
  produced audio). Each `introText` 2-3 spoken sentences: where we are,
  why it matters to the gospel's road to Rome; read aloud, so no
  visual references.
- Route descriptions state the success count and the flavor, as the
  current file does; `taskFocus` per route/stage draws on the pack's
  categories so that every stage's focus is served (the final stage:
  `historical-context`, `hymn`, `decision-strategy`, as today).
- Four community events, one per non-start milestone, kinds/thresholds
  as in the table; titles and descriptions are yours; every relay's
  `taskCategory` is `"community"`. Rome's event fires when the FIRST
  team arrives — a closing gathering the whole room joins while others
  are still travelling.
- Twenty offering outcomes (§30.1): across the four categories with
  every effect type the schema supports represented at least twice,
  `none` only in humorous/neutral, and no severe negatives (there are
  none in the schema anyway). Announcements are one or two spoken
  sentences; vary them — the same effect may return with different
  words.
- Tests (N2 — `tests/content/jerusalem-rome.test.ts`; also amend
  `tests/content.test.ts` where it hard-codes the old entry ids
  `westward-voyage`, `entries[1].routes[...]`, and the map tests
  M4/M5/V4/V8 if they assume four landmarks — record each amendment):
  `validateJourney` ok; `totalRequiredSuccesses` is 7; `planSession`
  gives no warning for (3 teams, standard, standard) and (2 teams,
  short, standard), and `estimatedMinutes ≤ 70` for (4 teams, standard,
  standard); every milestone has coordinates inside the viewport; every
  relay threshold ≤ 2; 4 events, 20 offerings, each offering category
  ≥ 3; an engine test that a community event at the DESTINATION
  milestone fires on the first arrival and the arriving team is still
  marked finished after it resolves (testJourney variant with an event
  at "finish").

## Group N3 — the production pack's scaffolding and the dev packs

- Pack id `general-bible`, `version` `"1.0.0"`, title "General Bible",
  a description that says it is version-one content. No `audioAssets`
  in v1 (see N8/N9).
- **Dev packs by convention, no schema change**: a pack whose id starts
  with `dev-` is development-only. `main.ts` loads
  `content/packs/general-bible.json` always and the two `dev-*` packs
  only when `import.meta.env.DEV`. `SetupWizard`'s default
  `enabledPackIds` excludes `dev-*` packs whenever at least one non-dev
  pack is loaded (so `npm run dev` offers all three with only
  `general-bible` checked; tests that construct a wizard from dev packs
  alone are unchanged). The setup checkbox label for a dev pack gets a
  " (development only)" suffix.
- Task id convention: `gb-<cat>-NNN` with `<cat>` in `sk`, `br`, `hc`,
  `al`, `hy`, `ds`, `cm`; zero-padded, unique. `tags` lowercase; every
  task carries `"general-bible"` plus 1-3 topical tags (e.g.
  `"apostles"`, `"travel"`). Vocabularies (a test enforces membership;
  extend the list in the test only if a task genuinely needs it):
  `biblePeriods` ∈ { creation-patriarchs, exodus-wilderness,
  conquest-judges, united-kingdom, divided-kingdom-exile,
  return-second-temple, life-of-jesus, early-church, pauline-journeys };
  `locations` ∈ { jerusalem, judea, samaria, galilee, caesarea, antioch,
  asia-minor, ephesus, greece, corinth, philippi, macedonia, rome, egypt,
  babylon, sinai, damascus, cyprus, malta, patmos, nazareth, bethlehem }.
- `tests/content/general-bible.test.ts` is created in this group with
  the blind rules below and per-category count assertions that grow as
  N4-N10 land (add each category's count line in that category's
  commit — never commit a count the pack doesn't yet meet; rule 2).

Blind rules (every one is a boolean per task, message = id + rule):
- schema-valid pack (`validateContentPack` ok, `crossValidate` with the
  journey empty);
- `acceptedAnswers` includes `answer` case-insensitively;
- `prompt` ≤ 280 chars and does not contain `answer` case-insensitively
  when `answer.length ≥ 4`; same for every clue and every variant
  prompt against that variant's answer;
- multiple-choice options: 3-4, exactly ONE matches the answer pool
  (schema checks "at least one"; you check "not two");
- `resourceInteractions.insight` ⇒ (clues ≥ 1 or options present);
  `.provision` ⇒ `assistedVariant` present; `.courage` ⇒
  `amplifiedVariant` present;
- `hard` ⇒ clues ≥ 1; `estimatedSeconds` 30-90; `teachingReveal` 40-400
  chars;
- SK/BR/HC/DS: `scriptureReferences` ≥ 1 (HC may cite a note-only
  source instead: then `historicalNote` non-null); HC: `historicalNote`
  non-null and begins with one of `Stated in Scripture:`, `Widely
  accepted background:`, `Disputed:`;
- DS: `hostGuidance` non-null;
- hymn: `teachingReveal` contains a four-digit year in 1500-1928 (the
  public-domain proof);
- audio-listening: `audioAsset === null` and tag `audio-pending`;
- community: `assistedVariant`/`amplifiedVariant` null, all
  `resourceInteractions` false, `hostGuidance` non-null;
- ids unique and matching the convention; `biblePeriods`/`locations`
  from the vocabularies; every task tagged `general-bible`;
- pack-wide: ≥ 30% easy, ≤ 30% hard; ≥ 60% of non-community tasks have
  an assisted form; ≥ 40% an amplified form; no two tasks share
  (`category`, `answer.toLowerCase()`) — assert on ids only.

## Groups N4-N10 — authoring, one category per commit

Targets (above §30.1's floor, so two 4-team sessions can each draw
~48 tasks with room to spare; sufficiency and two-session tests in
N11 are the check): N4 scripture-knowledge **40**; N5 bible-reasoning
**20**; N6 historical-context **20**; N7 decision-strategy **12**;
N8 hymn **12**; N9 audio-listening **12**; N10 community **12**. Total
128. Difficulty per category: at least 3 easy, 3 moderate, 3 hard;
overall ≥ 30% easy.

Authoring rules (binding; CONTENT_AUTHORING.md §2-§4 apply too):
- **Accuracy over cleverness.** Every SK/BR answer must be verifiable
  from the cited reference; prefer well-attested facts; no genealogies,
  no counts, no dates unless famous; when in doubt, make it easier or
  drop it. Scripture is quoted only from the KJV (public domain) or
  paraphrased. After finishing a category, re-read every task against
  its reference before committing.
- **Difficulty**: easy = most churchgoers know it; moderate = a regular
  reader knows it; hard = a specific detail a careful reader knows,
  always with a clue. Distractors in options are plausible and from the
  same domain (people with people, places with places).
- **Variants**: an assisted form is multiple choice (3-4 options, the
  existing `cost` pattern: insight for assisted, courage for amplified,
  amount 1); an amplified form asks for more ("both names", "and
  where", "the exact phrase"), never a different question.
- **Spoken-first**: every prompt reads aloud cleanly (no "see below",
  no lists longer than four items, no reliance on spelling); every
  `teachingReveal` states the answer plainly in its first sentence.
- **Neutral and kind** (§13.6, §32): no denominational positions as
  "correct answers", no politics, no health claims, nothing that
  judges anyone's faith; DS tasks present a situation (from Scripture
  or plausible ancient travel), `answer` is the model reasoning,
  `hostGuidance` says "Judge the reasoning, not the choice." or the
  task's own judging rule.
- **Historical context** (§13.3): every claim's status in
  `historicalNote` with the required prefix; teaching reveals concise.
- **Hymns (N8)**: text-only in v1 — lyric completion, "which hymn has
  this line", author/occasion, "which Psalm inspired it" — words and
  music pre-1929; `teachingReveal` names the hymn, author and year.
  Melody-identification tasks arrive when Brian delivers note data
  (OPEN_QUESTIONS 23); do not author melodies.
- **Audio-listening (N9)**: text-delivered in v1 (§30.1 "if final audio
  is unavailable, use transcripts… preserving the interfaces"): the
  prompt IS the transcript of the scene/sequence the host reads aloud;
  `audioAsset: null`; tag `audio-pending` so they can be recorded later.
  Four of the twelve in the Voice Portrait shape (CONTENT_AUTHORING
  §3b): first-person progressive clues in `clues` (3-4 of them), the
  prompt is the first clue, difficulty hard, amplified = answer after
  the first clue only, assisted = multiple choice.
- **Community (N10)**: open-list prompts for a relay ("Name one of the
  …") where each team supplies one part; `answer` lists the reference
  set; `acceptedAnswers` the same; `hostGuidance` states the judging
  rule ("any of the twelve; no repeats") WITHOUT listing them; easy or
  moderate; no variants; a `teachingReveal` that gives the whole set.
- Commit per category with counts only in the message, e.g.
  "PHASE9 N4: 40 scripture-knowledge tasks (16 easy, 16 moderate, 8
  hard)". Update the count assertion in the same commit.

## Group N11 — sufficiency and the two-session deliverable

- `tests/content/general-bible-sessions.test.ts`:
  - `buildSessionDeck` succeeds with `general-bible` alone against the
    journey for every (teams 2-8) × (gentle/standard/challenging) ×
    (short/standard/long → turnTaskLimit via `recommendedTasksPerTurn`)
    — no `SessionBuildError`, and the `DeckReport.warnings` for the
    (4, standard, standard) case is empty.
  - The deliverable: play session A (4 teams, standard, the S11-style
    driver, always-correct rulings, a fixed seed) to `gameSummary`
    against a real `SessionDeck`; collect the ids in `taskHistory` plus
    every relay's `getCommunityTaskPublic()?.id`; build session B with a
    different seed and `excludeTaskIds` = those ids; play it to
    `gameSummary`; assert the overlap between B's ids and A's ids is at
    most 5% of B's count, and that both sessions used ≥ 40 distinct
    tasks. Repeat once for 2 teams. (Assert on counts and ids only.)
  - `dev-*` packs are excluded from the default `enabledPackIds` when
    `general-bible` is loaded (SetupWizard unit test with all three).

## Group N12 — browser check (manual, by Sonnet, recorded — no quotes)

`npm run dev`: confirm setup lists three packs with only General Bible
checked and "(development only)" on the other two; play 2 teams,
General Bible only, ~6 turns: confirm real tasks present with clean
speech, an assisted and an amplified form appear on at least one task,
the relay at Caesarea shows a prompt and reveals an answer on resolve,
the map shows five landmarks with the route through them; then `npm
run build && npm run preview`: Welcome → New game shows ONLY General
Bible; Sound check lists only the cues (no production assets exist);
zero console errors. Write the results to OPEN_QUESTIONS.md as counts,
ids, and observations — **no task text, not even a paraphrase**.

## Definition of done

All N-groups green alongside the existing 460 (amended tests recorded);
`npx tsc --noEmit` and `npm run build` clean; no new dependency; no
forbidden file modified; the pack meets every count in N4-N10 and every
blind rule in N3; OPEN_QUESTIONS.md updated (browser check, any content
decision you had to make — counts and ids only); IMPLEMENTATION_STATUS.md
moves Phase 9 to Completed, styled like Phases 2-8 and containing NO
task text; committed per green group and pushed. Your final message to
Brian: counts, ids of anything you're unsure about, and nothing else
from the pack.
