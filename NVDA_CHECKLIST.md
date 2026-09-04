# NVDA Checklist — The Way: A Journey Through Bible Lands

PHASE10_SPEC Group X9. A numbered walkthrough for Brian to run with NVDA in
Chrome, against `npm run dev` (or the deployed build). Each step names what
to do and the announcement pattern to expect. Task content is never quoted
— `[task prompt]`, `[official answer]`, `[accepted alternatives]` stand in
for whatever the drawn task actually says. Record your findings — pass,
fail, or "felt slow/wrong" — directly in OPEN_QUESTIONS.md under a new
dated item; the specific decisions this checklist is meant to settle are
listed at the very end.

Conventions used below:
- "NVDA says: ..." — the exact or near-exact spoken announcement to expect.
  Minor NVDA-version wording differences (e.g. "clickable" vs "button")
  are not failures; a WRONG or MISSING announcement is.
- "Tab to X" means keep pressing Tab (Shift+Tab to go back) until focus
  lands on the named control — don't assume it's the very next stop.
- Every step should also work with a mouse/trackpad in parallel with NVDA
  running (dual-modality is a hard requirement, not just a nice-to-have)
  — if a step only works one way, that's a defect, not a checklist note.

---

## 1. Boot and Welcome

1.1. Open the app fresh (no prior saved game — use a private/incognito
window, or run "Delete saved game" from a previous session first). NVDA
should be in **browse mode** (its default on page load) and read the page
top-down when you press Down Arrow a few times: the app title, then
"Welcome", then a "New game" button, then "Sound check". Nothing should
require switching to focus mode to be readable.

1.2. Press Enter (or click) on "New game". This moves you into the setup
wizard. NVDA should announce the new heading and the wizard's first
control taking focus.

1.3. Go back to Welcome (reload the page). If a saved game exists, a
"Resume game" button appears ABOVE "New game", with a paragraph describing
the save (journey, team count, round/turn, saved-at time) readable in
browse mode before you ever press Enter.

## 2. The setup wizard, by keyboard only

2.1. Tab through the wizard from the top. Each section (Journey, Number of
teams, Duration, Pace, Difficulty, Map style, "Reduce motion" checkbox,
"Avoid tasks from recent games" checkbox, "Games to remember" number
field, Seed, team names) should be reachable in a sensible top-to-bottom
order, each with a clear accessible name.

2.2. The cursor lists (Journey, Number of teams, Duration, Pace,
Difficulty, Map style) are a **listbox pattern**: DOM focus stays on the
list's own container the whole time — NVDA's browse-mode cursor and the
list's own "virtually focused" row can disagree, which is expected. In
**focus mode** (NVDA switches automatically when you Tab onto the list, or
press NVDA+Space to force it), Up/Down Arrow BROWSES the options and NVDA
announces each one as you move; Enter (or a click) is what actually
CHOOSES one — the wizard's value does not change until you confirm. NVDA
should say "selected" only for the row that is currently chosen (on a
fresh setup that's "standard" for Duration/Pace/Difficulty and "2 teams";
after End session or Resume it's whatever you had), and the list should
OPEN on that row, not on the first one. Typing the first letter of an
option (e.g. "s" for "Standard") should jump to it. Confirm: arrowing
through a list is audibly distinct from arrowing through browse-mode page
text — you should hear option names, not paragraph text.

2.3. Tab to a team-name field and type a name. This is the **input
firewall**: every global game key (R, S, A, T, Enter-as-confirm, etc.)
should type literally into the field instead of triggering a game action —
except Escape, which still works even inside the field (it should NOT
type an Escape character or do nothing silently). Confirm by typing a
sentence with several of those letters in it and reading it back.

2.4. Find the estimate line near the bottom of the wizard (duration
estimate in minutes). Change Duration or Pace and confirm the line updates
and is announced. If "Avoid tasks from recent games" is checked and this
isn't your first game this session, the estimate area may also carry one
extra sentence about exclusions being relaxed — expected only when content
supply is genuinely tight, not on every game.

2.5. Tab to "Begin journey" and press Enter (or Space). This starts the
game; focus should land on the new "playing" screen's own heading.

## 3. A full turn

3.1. **Present**: the first screen after Start is `beginTurn` — NVDA
should announce the active team's name and a "Present task" button (or
Enter as the primary action). Press Enter.

3.2. **Resource window**: `[task prompt]` is announced (visually and
spoken/placeholder-narrated), along with the task's category and
difficulty context, an "Accept" (confirm) control, and — depending on the
task — Assist/Amplify/Extra-clue buttons. Tab through them; each has a
clear label naming the resource and cost (e.g. "Spend Provision for the
assisted form").

3.3. Press Enter/click Accept with no spend. This moves to
`awaitingAnswer` — the room states its answer aloud (not typed into the
app); NVDA has nothing new to read here except the state's own prompt.

3.4. Press Enter to **reveal**: `answerReveal` announces `[official
answer]` and `[accepted alternatives]` to everyone at once (the
host-as-player rule — nobody hears it early). Press C (correct) or I
(incorrect) to **rule** it. Confirm the ruling is a single keypress, not a
press-twice confirm (that's reserved for Ctrl+Z and ending a session).

3.5. If the task carries a **teaching** note, `teachingReveal` shows it
next with a "Continue" action (Enter). Confirm NVDA reads the teaching
text before you advance, not after.

## 4. Assisted and amplified forms

4.1. On a `resourceWindow` where "Spend Provision for the assisted form"
is present AND your team has enough Provision (0 at game start — you may
need to play a few turns first, or use "Spend Insight for an extra clue"
first if that's free), activate it. Confirm the prompt visibly/audibly
changes to the assisted variant and the button set updates (the
assist/amplify buttons should no longer both be offered — a task's form
can only change once).

4.2. Same for "Spend Courage to amplify the task" — confirm the amplified
variant is announced, and that a correct ruling on an amplified task is
described as worth two successes (via S — see §8 below — or the reveal
line itself).

## 5. A fork

5.1. When `forkChoice` is reached, NVDA should announce the available
routes as a list (a cursor list, same listbox pattern as §2.2) — arrow
through them, confirm each route's name (and any difficulty framing) is
read, then Enter to choose. Confirm the chosen route is reflected in the
next `beginTurn`'s context (which milestone/stage you're headed toward).

## 6. A relay and a contribution (community events)

6.1. At a **relay** landmark, `communityEvent` announces the shared
prompt (`[task prompt]`), then as each team answers in turn, "Now
answering: Team X." should be read before that team's ruling. After every
team has gone, the reveal announces `[official answer]` once, to the
whole room (never per-team). Confirm the room's cumulative progress
("Room progress N of M") is read somewhere in this flow.

6.2. At a **contribution** landmark, a pledge list appears: one
"contribute N {resource}" row per unit up to what the team owns (capped),
plus a "decline" row — arrow through it exactly like the fork's route
list, confirm each amount is individually announced, and pick one.

## 7. A granted choice and a share

7.1. When a team is granted a "choose a resource" reward, buttons like
"Team X: take Insight" / "take Provision" / "take Courage" should be
Tab-reachable and individually labeled — pick one and confirm the
resource total updates (via S, §8).

7.2. If another team is holding a **received** grant to choose from, and
your team just chose one FIRST, a "Team X: share with Team Y" row should
appear for every other team (this is the only cross-team share path — a
gift that was itself shared can't be re-shared; confirm no share option
appears on an already-shared grant).

## 8. Surplus keep/offer, the offering announcement, and the Journey Token

8.1. When a team's success count overshoots what a stage needed,
`surplusDecision` offers a small cursor list: keep the surplus (rolls
toward the next stage) or offer it to the room (a community pool). Arrow
through both, confirm each option explains its effect in plain words
before you commit.

8.2. If you choose "offer", listen for an "Offering made" cue and an
"Offering effect: ..." spoken line naming what the surplus actually did
(not a generic "an offering happened").

8.3. A perfect stage (every success first-try, no assist/amplify/recover)
should earn a **Journey Token** — listen for "Journey Token earned" and
confirm S (status, §9) subsequently mentions the team holds one. Spend it
from a resource window via one of the "Use Journey Token to ..." actions
(hear again / extra clue / eliminate option / assisted form / amplify) —
confirm it's usable exactly once and then gone.

## 9. S / A / T / R in five different states

Pick five DIFFERENT states across a game (e.g. `beginTurn`,
`resourceWindow`, `awaitingAnswer`, `answerReveal`, `communityEvent`) and
in each one, press:
- **R** — repeats the last thing said, verbatim. Confirm nothing else on
  screen changes.
- **S** — speaks current game/team status: team name, and in a
  task-bearing state, the word "successes" should appear somewhere in it.
- **A** — speaks available actions and usable resources for right now —
  confirm it lists ONLY things you can actually do in this state (no
  stale actions from a previous screen).
- **T** — speaks every team's position (milestone/stage) — confirm it
  names every team once, not just the active one.
None of the four should change game state or advance anything — you
should be able to press all four back-to-back in any state and still be
exactly where you started.

## 10. Help, explorer, and an unmapped key

10.1. Press **?** in any play state: a "Help menu" opens — "Up and down
to browse, question mark or escape to close." Arrow through it; every row
should be a shortcut that's actually legal RIGHT NOW (not a full static
list — it changes state to state).

10.2. With help still open, press **?** again: "Keyboard explorer. Press
any key to hear what it does here. Escape to exit." — press a few keys
(letters, arrows) and confirm each one SPEAKS what it would do without
actually DOING it (no game state changes while exploring). Escape exits
explorer and returns you to normal play.

10.3. Press an unmapped key (e.g. "Q", or a digit not used anywhere) in a
normal play state — the app itself answers (the project's "silence is a
bug" rule): NVDA says "Q does nothing here. Press question mark for
help." Confirm it's the app's sentence you hear, not just NVDA's own key
echo, and that nothing on screen changed. (Browser-owned keys — F5, F6,
F11, Ctrl+R/F/W/T — are deliberately left to the browser and get no such
message.)

## 11. Escape → game menu → Game log → Copy

11.1. Press **Escape** in a play state with nothing to cancel: the game
menu opens — "Game menu" announced as a dialog, with Resume, Game status,
Audio…, Game log…, Delete saved game, Forget recent tasks, and End
session. Tab through it; confirm Tab from the last control wraps to the
first (and Shift+Tab from the first wraps to the last) — it should never
be possible to Tab yourself OUT of an open dialog onto the page behind it.

11.2. Activate "Game log…": a dialog with an ordered list of the last 50
event-log lines (ids/effects, never task text) and, if your browser
supports clipboard access, a "Copy" button. Press it and confirm a
confirmation is announced. Close with Escape — the game menu should
reopen (not vanish entirely) since Game log is launched FROM the menu.

11.3. From the reopened menu, activate "Audio…" — confirm its own
settings (master/music/effects/narration volumes, speech-mode choice) are
Tab-reachable and each has a clear label. Escape closes it and — same as
Game log — the menu reopens.

## 12. Ctrl+Z arm/confirm wording

12.1. Make any reversible move (a ruling, a route choice, a resource
spend). Press **Ctrl+Z** once: NVDA should say something in the shape
"Undo will reverse: [plain-English description of the action]. Press
again to confirm." — confirm the description actually names what you
did (not a generic "an action"), and that pressing any OTHER key first
cancels the arm ("Undo cancelled.") rather than silently expiring.

12.2. Press Ctrl+Z again within a few seconds: "Undo confirmed: [same
description]" should be announced, immediately followed by (or merged
into) the announcement for whatever screen you're back on — confirm you
don't hear a stale "Undo confirmed" message get silently overwritten
before you could hear it (this was a real Phase 8 fix — the confirm text
and the new screen's own announcement should arrive together, not race).

12.3. Try Ctrl+Z with nothing to undo (right at the very start of a fresh
game, before any action): "Nothing to undo." — confirm no error, no
silent failure.

## 13. Reload → Resume → Ctrl+Z

13.1. Mid-game, reload the browser tab (or close and reopen it). Welcome
should show "Resume game" with a description of exactly where you left
off (round, turn, team, saved-at time).

13.2. Activate Resume: confirm you land back on the SAME screen/state you
left, with the same team resources and same event log (read a few S/T
lines to spot-check). Your reduced-motion choice (if you set one) should
also have carried over.

13.3. Press Ctrl+Z once (real, post-reload undo): confirm arm/confirm
wording is identical to §12, and that the action actually reverses
correctly — this proves undo survives a reload, not just a fresh
in-memory game.

## 14. End session

14.1. From the game menu, activate "End session": a press-twice confirm
dialog appears ("End session?" with Confirm/Cancel). Cancel it first and
confirm you're returned to the game menu unharmed. Reopen it and this
time Confirm: the game ends, autosaving stops for the rest of this
session, and you land back on the setup screen. (Note: closing THIS
particular dialog via Escape does not currently return you to the menu
the way Game log/Audio do — that's a known, recorded gap, not something
to re-report.)

## 15. Sound check

15.1. From Welcome, activate "Sound check". NVDA announces "Sound check.
Tab to a cue or clip and press Enter to play it." Tab through EVERY row —
each of the twelve cues (Correct answer, Incorrect answer, Skipped
answer, Stage complete, Journey Token earned, Community event succeeded,
Community event fell short, Arrival, Celebration, Menu opened, Offering
made, Service earned) plus any loaded narration/hymn clips should have
its own clearly labeled button.

15.2. Press Enter on a cue: confirm you hear it. While a longer clip is
playing, press **Space** (pause/resume), **X** (stop), and **N** (skip —
only meaningful for narration, not short cues) — confirm each visibly
and/or audibly changes the transport state, using the SAME buttons/keys
as in real play (this screen deliberately reuses the play-mode transport,
not a separate mechanism).

## 16. Reduced motion on the map

16.1. This step needs a SIGHTED helper watching the screen, since it's a
visual-only distinction. With "Reduce motion" OFF in setup, advance a
team's badge on the map (any milestone/stage change) and confirm the
helper sees it glide/animate along the route. With "Reduce motion" ON,
repeat and confirm the helper sees it JUMP directly to the new position
with no animation. NVDA's own announcements should be identical either
way — this is a purely visual difference.

## 17. The audience region, read in browse mode

17.1. With NVDA in browse mode (not inside the host controls), navigate
to the audience section of the page. It should be readable as ordinary
page content — team table (name, location, Insight, Provision, Courage,
Journey Token, Service, Status), current prompt/reveal area, progress —
WITHOUT needing to enter any special mode and without exposing host-only
controls (rulings, spend buttons, undo) in that region at all. Confirm a
screen reader user parked on the audience view the whole game could
follow along by ear without ever touching the host controls.

---

## Decisions to record in OPEN_QUESTIONS.md after this pass

Write these as a new dated OPEN_QUESTIONS item (or several), one line
each, with your verdict and — where relevant — what changed your mind:

1. **Keep or drop `role="application"` on the host region** (Phase 5
   Decision 1) — did it help or fight NVDA's browse/focus-mode switching
   during real play?
2. **The visual scale** — with your sighted helper, is on-screen text/UI
   sized reasonably for a shared/projected display?
3. **"Team Lion"-style symbol default names** (OPEN_QUESTIONS item 19) —
   did hearing "Team Lion" (etc.) throughout a real game feel natural, or
   should defaults change?
4. **3-4 announcements per action** (X7e's measured maximum) — did any
   single action feel like it was reading too much at you before you
   could act?
5. **Anything that felt slow** — any specific step above where you found
   yourself waiting on speech before you could act, or wanting a shorter
   phrasing.
