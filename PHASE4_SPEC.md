# PHASE4_SPEC — The Accessible Host Interface

Binding contract for the Phase 4 unattended implementation. Read
CLAUDE.md's agent rules first. This spec outranks improvisation; where it
is silent, ACCESSIBILITY_PATTERNS.md governs (it is BINDING for all of
this phase), then the design doc (§19-§25 especially). Do not modify:
the design doc, `src/engine/`, `src/session/`, `src/content/schemas.ts`,
sample content, or any PHASE*_SPEC.md. If blocked by one of them, write
the problem to OPEN_QUESTIONS.md and continue with another group.
KEYBOARD_COMMANDS.md is a LIVING file — you must update it as bindings
land (stale key docs are an accessibility bug).

Prerequisites (all true today): Phase 2 engine green (`src/engine/`),
Phase 3 session builder green (`src/session/`), 128 tests passing.

## Objective

A complete game — setup wizard through gameSummary — operable entirely
with a keyboard and screen reader, AND entirely with a mouse, in one
browser page, against the real engine and a real SessionDeck. Text-first:
Phase 5 layers the audience visuals on this same DOM; Phase 6 adds audio.
Deliverable per design doc §34 Phase 4.

## Scope and non-goals

IN: app shell, presenter, keyboard system, setup wizard, every play-state
screen, host rulings, reveal, repeat/status/actions/positions commands,
help menu + keyboard explorer, undo, modals and focus management, game
menu.

OUT (do not build): audience visual design/map/animations (Phase 5), all
audio including the Web Audio sequencer and volume plumbing (Phase 6 —
setup COLLECTS audio settings but only stores them), community/offering
configurability beyond functional controls (Phase 7), persistence — a
page refresh loses the game in Phase 4; announce nothing about saving
(Phase 8). No service worker, no IndexedDB.

The existing boot page (index.html + src/main.ts) is REPLACED this phase
(its freeze applied to Phase 3 only). Its job — load + validate content,
report failures visually and via live region — becomes the startup
screen's content check.

## Architecture (new files; keep pure logic DOM-free)

- `src/ui/presenter.ts` — the ONE output funnel (see below).
- `src/ui/speech.ts` — pure string builders: no DOM, no engine calls;
  takes plain data in, returns `{ visual, spoken }` out.
- `src/ui/keys.ts` — key normalizer, the single keybinding table, the
  window keydown handler factory.
- `src/ui/setup.ts` — setup wizard state machine (pure core + thin DOM).
- `src/ui/screens.ts` — engine-state → screen rendering + per-state
  action table.
- `src/ui/modal.ts` — dialog manager (focus trap, return-to-invoker).
- `src/ui/app.ts` — the shell: owns UI-level states, constructs the
  engine, wires presenter/keys/screens together.
- `src/main.ts` — boots `app.ts`.
- Tests under `tests/ui/`.

The UI owns the pre-game states (`startup`, `setup`, `setupReview`,
`sessionGeneration`) and the `paused` overlay; the engine owns everything
from `ready` onward (it initializes in `"ready"`; `startGame` is legal
only there). The UI never mutates engine internals — commands go through
`dispatch()`, reads through the read API (`getState`, `getSession`,
`getCurrentTaskPublic`, `getRevealedAnswer`, `getAvailableRoutes`,
`getPendingSurplus`, `getPendingChoicesForTeam`,
`getEffectiveStageRequirement`, `getSummary`, `canUndo`).

## The presenter (ACCESSIBILITY_PATTERNS §1-§2, binding)

`present({ visual, spoken?, channel? })` is the ONLY code path that
writes the announcement area or the live region. `spoken` defaults to
`visual`. Channels: `"polite"` (default) and `"assertive"` (errors and
interruptions only). One sr-only live region per channel, exactly two
total. Rules:

- Spoken sanitizer: strip markdown/asterisks, expand "%" → "percent",
  "&" → "and"; never send raw symbols to the reader.
- Hair-space alternation: appending U+200A when pushing text identical to
  the previous push, so repeats are re-announced.
- One composed sentence per state change; no drip-feeding. Entry
  announcements = orientation + instructions + current item; subsequent
  navigation = terse current item only.
- Test buffer: the presenter records its last 50 announcements
  (`presenter.log()`) so tests assert "X was announced" headlessly.
- Idle re-prompt: if a required host action is pending and nothing has
  been announced for ~12 s, re-announce the current prompt once per idle
  period. The timer function is injectable (constructor option) so tests
  drive it manually; gate every firing on current state.

Direct DOM writes for CONTENT are allowed only in screen render code, and
render code must route every user-facing message through the presenter.

## Keyboard system (ACCESSIBILITY_PATTERNS §3, §6)

One window-level keydown handler. Ladder, in order: (1) `if (e.repeat)
return`; (2) input firewall — if `event.target` is a text field,
textarea, select, or contenteditable, only Escape may act, everything
else passes through untouched; (3) native pass-through list (F5, F6,
F11, F12, Ctrl+R, Ctrl+F, Ctrl+W, Ctrl+T) always returns without
preventDefault; (4) open modal gets the key; (5) state-gated bindings;
(6) unmapped printable keys in game states answer "X does nothing here.
Press question mark for help." — silence is a bug.

ONE keybinding table in `keys.ts` (key, label, states, handler id) drives
the handler, the help menu's rows, the keyboard-explorer descriptions,
and is what KEYBOARD_COMMANDS.md documents. All must change together.

The map (updates KEYBOARD_COMMANDS.md; global keys work in every
non-editing state):

| Key | Function |
|---|---|
| R | Repeat current game prompt |
| S | Speak current game and team status (§23.3 order, see below) |
| A | Speak available actions and usable resources |
| T | Speak all team positions |
| ? | Open the help menu; pressed AGAIN while help is open: close it and enter keyboard explorer |
| H or F1 | Open the help menu (aliases; plain open/close only) |
| Enter | Confirm / advance (state-dependent primary action) |
| Escape | Back or cancel when safe; otherwise opens the game menu |
| Space | RESERVED for produced-audio pause (Phase 6); does nothing yet, says so |
| Ctrl+Z | Undo (press-twice confirm; see Undo) |
| C | Rule: correct (answerReveal state only) |
| I | Rule: incorrect (answerReveal state only) |
| K | Rule: skipped (answerReveal state only) |

Rulings are SINGLE-press (decision 4 below). Every command also has a
visible, clickable control in the current screen — dual-modality parity
is a test requirement, not a suggestion.

**Help menu and keyboard explorer (Brian's ruling, 2026-09-02):**

- First `?` opens the help menu: a modal listing every binding legal in
  the CURRENT state (key + function), rendered on screen as a real list
  and navigable with Up/Down arrows as a cursor list (each row announced
  tersely: "C. Rules the current answer correct."). Escape closes it
  normally. `?` is Shift+/ on US layouts — match `event.key === "?"`,
  not the physical key, so other layouts work.
- A SECOND `?` while the help menu is open closes the menu and enters
  KEYBOARD EXPLORER mode, announced as: "Keyboard explorer. Press any
  key to hear what it does here. Escape to exit." In explorer mode every
  key is described from the keybinding table (state-aware: a key not
  legal in the current state says so) and NOTHING executes; Escape is
  the only exit and is announced on entry. The input firewall still
  wins: explorer mode cannot be entered from, and never captures, a
  text field.
- H and F1 open (or close) the help menu but do NOT chain into explorer
  mode; the two-press gesture belongs to `?` alone.

Spoken status (S) reports in exactly this order (§23.3): current team;
location/route; successes earned of required (use
`getEffectiveStageRequirement`); tasks remaining this turn; Insight;
Provision; Courage; Journey Token; available actions. T summarizes each
team's position in one clause each — no internal statistics.

## App shell and startup

Semantic HTML: real headings (one h1, h2 per screen section), real
`<button>`s, real `<ul>/<ol>` lists, NO role="application" anywhere,
browse-mode readable top to bottom. Startup screen: load + validate the
dev-sample pack and journey via `src/content/loader.ts`; success enables
"New game"; failure presents each error visually and assertively. Focus
never moves as a side effect of game events; it moves only on user action
or modal open/close.

## Setup wizard (§19)

Steps, in order: journey (list of loaded journeys); team count (2-8);
team names (text entry, prefilled "Team 1"..."Team N", each team auto-
assigned a distinct preset color AND symbol from a built-in list of 8
pairs — §24 requires both); duration (short/standard/long/custom
minutes); pace (relaxed/standard/quick); difficulty
(gentle/standard/challenging); enabled packs; enabled categories
(community not listed — it is always poolable); audio settings (master,
music, effects, narration volumes 0-100 — STORED only, wired in Phase
6); community catch-up toggle (stored, used in Phase 7); seed (auto-
generated string, shown, editable).

Selection UIs are cursor lists per ACCESSIBILITY_PATTERNS §4: arrow to
move (terse announcement), first-letter type-ahead, Enter confirms with
a spoken confirmation, Escape backs up one step and re-announces where
you landed.

Live estimate: on every relevant change, call `planSession()` and present
recommended tasks/turn (host may override, 1-6), estimated minutes, and
any §19 warning verbatim from `plan.warnings`. Setup review screen reads
the ENTIRE configuration as one browse-readable list before "Begin
journey" is offered.

**Determinism rule (binding):** any deck preview during setup uses a
THROWAWAY `buildSessionDeck()` result that is discarded afterward.
`SessionDeck.previewPlan()` and all draws consume the deck's seeded RNG
stream, so the REAL deck must be built fresh — same seed — during
`sessionGeneration`, after which no preview calls touch it before
`startGame`. Engine construction: `createRng(seed)` for the engine,
the same `seed` string into `buildSessionDeck` (the S11 pattern). A
`SessionBuildError` (insufficient content) returns to setup review with
the error's message presented assertively — not a crash.

## Play screens (engine states)

`screens.ts` holds ONE declarative table: engine state → heading, prompt
builder, and action list (label + command + key). Render = look up state,
build strings via `speech.ts`, draw buttons, `present()` the entry
announcement. Never show answer text before reveal: everything on screen
pre-reveal comes from `getCurrentTaskPublic()` (which structurally lacks
answers); the reveal screen is the FIRST place `getRevealedAnswer()` is
called. States and their controls:

- **ready**: Start game.
- **beginTurn**: announce round + team ("Round 3. Team Lydia, at
  Antioch. 2 of 3 successes."), Present task.
- **forkChoice**: route cursor list from `getAvailableRoutes()` (name +
  description + stage count), Enter confirms.
- **taskPreview / taskPresentation / resourceWindow / awaitingAnswer**:
  task prompt via PublicTask; MC options lettered "A: … B: …" in one
  composed announcement (§4); R re-reads. Resource window shows only the
  LEGAL actions: spend Insight (submenu of available effects: extra
  clue / eliminate option / replay), spend Courage, use Journey Token
  (submenu of its effects), accept answer (advance to awaitingAnswer).
  Eliminate-option announces the elimination and re-reads survivors;
  display strikes through AND appends "(eliminated)" textually.
- **awaitingAnswer**: "Team answers aloud." Reveal button (Enter).
- **answerReveal**: official answer + accepted alternatives + any
  hostGuidance, shown and spoken to the whole room. Then C / I / K.
- **recoverDecision**: announce Provision cost; Accept recover / Decline.
- **teachingReveal**: teaching text; Continue.
- **surplusDecision**: `getPendingSurplus()`; keep (choose resource) or
  offer as offering; offering outcome announced from the event log.
- **stageCompletion / progressResolution**: announced via composed
  sentence; Continue.
- **landmarkIntroduction**: milestone introText; Begin community event.
- **communityEvent**: relay events proceed team-by-team in turn order —
  the current answering team is announced; correct/incorrect buttons
  (C/I keys allowed here too, same semantics) dispatch `relayAnswer`;
  contribution events show a per-team pledge list (resource + amount
  picker, or Decline) dispatching `contribute`/`declineContribution`;
  Resolve event when the engine allows it. Granted-choice rewards
  (`getPendingChoicesForTeam` > 0) surface a resource picker per team.
- **gameSummary**: winners, Barnabas Award, final positions, service
  recap — browse-readable and spoken; New game returns to setup.

Illegal commands: the engine throws `IllegalCommandError` and reverts —
catch it, present the message politely, never crash.

## Undo and error recovery (§23.7)

Ctrl+Z (and the Undo button): first press announces "Undo will reverse:
<last event log entry>. Press again to confirm."; second press within
10 s dispatches `{type:"undo"}` and announces what was undone; anything
else cancels the armed undo. Gate on `canUndo()`; when false, say so.
Ending the session early (from the game menu) is press-to-confirm too.

## Game menu and modals

Escape with nothing to cancel opens the game menu as a modal dialog:
Resume, Game status, Help, End session (confirm). Modals per
ACCESSIBILITY_PATTERNS §3: focus moves in, trapped while open, title
announced on open, focus returns to the invoker on close. Native
`alert/confirm/prompt` are BANNED. The `paused` overlay is UI-level (the
engine has no pause command) — input other than the menu is blocked
while it is open.

## Decisions made by this spec (Brian may veto; record stands otherwise)

1. Ruling keys C/I/K are single-press, state-gated, undoable — no
   press-to-confirm on rulings (kept fast; undo is one gesture away).
   Press-twice confirm is reserved for undo and ending the session.
2. (Brian's ruling, not vetoable-by-default like the rest:) `?` opens
   the help menu; a second `?` while it is open closes it and enters
   keyboard-explorer mode. H/F1 are plain open/close aliases. There is
   no F2 binding.
3. Escape doubles as the game-menu key when there is nothing to cancel.
4. jsdom is AUTHORIZED as a devDependency for DOM tests (record it in
   OPEN_QUESTIONS.md per CLAUDE.md rule 5 when added).
5. No persistence this phase; a refresh loses the game (Phase 8).
6. Setup collects audio settings but nothing consumes them until Phase 6.

## Test list (implement in order; files under tests/ui/; jsdom env)

Use `// @vitest-environment jsdom` per file (keep existing node-env tests
untouched). Keyboard tests dispatch real `KeyboardEvent`s; announcement
assertions read `presenter.log()`. Reuse the synthetic pack factory and
S11's driving approach; never quote production content (synthetic only).

Group U1 — presenter: visual and spoken both land (parity); spoken
defaults to visual; sanitizer strips markdown and expands symbols;
hair-space alternation on identical consecutive text; polite vs assertive
regions; log buffer; idle re-prompt fires via injected timer only while
an action is pending and re-arms correctly.

Group U2 — speech builders: status string follows the §23.3 order
exactly; MC prompt composes "N choices" + lettered options in one
string; entry vs navigation announcements differ; eliminate-option
re-read lists only survivors; team-positions summary is one clause per
team.

Group U3 — keyboard: `e.repeat` gate; input firewall (keys in a text
field don't fire, Escape still works); pass-through list untouched;
unmapped key speaks "does nothing here"; state gating (C in beginTurn
does not rule); first `?` opens the help menu listing only the current
state's bindings, Up/Down walk the rows with terse announcements, Escape
closes; second `?` while help is open closes it and enters keyboard
explorer (entry announcement includes the Escape exit); in explorer mode
keys are described state-aware and nothing executes, Escape exits, and a
text field is never captured; the help rows and explorer descriptions
both derive from the live keybinding table (change a binding in the
table, both follow).

Group U4 — setup wizard: full pass through every step produces a valid
BuildOptions + engine config; team names prefill and are editable; each
team gets a distinct color AND symbol; planSession is re-called on
duration/pace/team-count change and its warning is presented verbatim;
tasks-per-turn override clamps 1-6; seed auto-generates and is
overridable; review screen contains every chosen value; SessionBuildError
returns to review with the message presented, not a crash.

Group U5 — determinism through the UI: two setup runs with the same
typed seed produce engines whose first 20 served tasks match; a setup
run that uses the preview path produces the SAME game as one that skips
it (throwaway-deck rule holds).

Group U6 — ruling flow: pre-reveal DOM and announcements never contain
the answer text (assert against the synthetic answer string); reveal
shows answer + accepted alternatives + hostGuidance; C/I/K dispatch the
matching rule; I with Provision available leads to recoverDecision and
both branches work; teaching reveal shows and continues.

Group U7 — resource window: only legal actions render (can* flags and
resource counts); insight effect submenu; eliminate-option updates
display (struck + textual marker) and announces survivors; journey token
submenu; illegal command → polite message, state unchanged.

Group U8 — fork, surplus, community: route list announces and confirms;
surplus keep/offer paths; relay event walks teams in order and
relayAnswer flows; contribution pledge and decline flow;
granted-resource choice picker drains pendingChoices.

Group U9 — undo, menu, modals: press-twice undo (arm, confirm, cancel
paths) and canUndo gating; Escape opens the menu when nothing to cancel;
modal focus trap + title announcement + focus returns to invoker; end-
session confirm.

Group U10 — full game by keyboard: a complete 2-team game from the
startup screen to gameSummary driven ONLY by dispatched KeyboardEvents
(setup included), against a real SessionDeck from a synthetic pack;
reaches gameSummary; every state entered produced at least one
announcement; then the same run with a mouse-only driver (clicks only)
also reaches gameSummary — dual-modality proof.

## Definition of done

All U-groups green alongside the existing 128 tests; `npx tsc --noEmit`
and `npm run build` clean; `npm test` runs both node-env and jsdom-env
suites; KEYBOARD_COMMANDS.md updated to the final table; jsdom recorded
in OPEN_QUESTIONS.md; IMPLEMENTATION_STATUS.md moves Phase 4 to
Completed (styled like Phases 2-3, noting any spec discrepancies found
rather than silently fixing them); no forbidden files modified;
committed per green group and pushed.
