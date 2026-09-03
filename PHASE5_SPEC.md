# PHASE5_SPEC — Audience Presentation

Binding contract for the Phase 5 unattended implementation. Read
CLAUDE.md's agent rules first. This spec outranks improvisation; where it
is silent, ACCESSIBILITY_PATTERNS.md governs (BINDING), then design doc
§24 (visual presentation) and §34 Phase 5. Do not modify: the design
doc, `src/engine/`, `src/session/`, `src/content/schemas.ts`, the
existing sample content (`dev-sample.json`, `jerusalem-rome.json`), or
any PHASE*_SPEC.md. If blocked, write the problem to OPEN_QUESTIONS.md
and continue with another group. KEYBOARD_COMMANDS.md stays a living
file.

Prerequisites (all true today): Phases 2-4 green, 228 tests passing, the
game boots a real UI from `src/ui/app.ts`.

## Objective

Design doc §34 Phase 5: "large-screen current-team display; stage
progress; resources; journey landmarks; task prompts; answer reveals;
Community Event progress; accessible non-color team distinctions.
Deliverable: host and audience views remain synchronized."

Concretely: the single page (OPEN_QUESTIONS open item 8's standing
assumption — one window, one page) gains an AUDIENCE VIEW region,
readable at television distance and, in a screen reader's browse mode,
readable top to bottom like a document — rendered from the same engine
state, on the same render pass, as the host controls. Synchronization is
by construction (one source of truth, one render), and tests prove it.

Phase 5 also closes the Phase 4 review findings (Group V1) — they are
presentation-layer work and small.

## Scope and non-goals

IN: the audience view, a real stylesheet, team identity badges, the
journey landmark strip, progress/resource displays, community-event and
reveal panels, reduced-motion support, the setup controls Phase 4
deferred, a playable dev-playtest content pack, and the V1 fixes.

OUT: audio (Phase 6), community/offering configurability (Phase 7),
persistence (Phase 8), production content (Phase 9), any SVG "map"
artwork beyond the landmark strip (a drawn map is Phase 9/10 polish;
the strip carries the information now).

## Architecture (new/changed files)

- `src/ui/audience.ts` — `AudienceView`: pure-ish renderer, engine
  state in, DOM out, no engine mutation, no keyboard handling.
- `src/ui/teamBadge.ts` — symbol glyph table + `renderTeamBadge()`.
- `src/ui/styles.css` — the stylesheet (imported from `main.ts`; Vite
  bundles it). Design tokens as CSS custom properties.
- `src/ui/app.ts` — mounts the audience region, calls
  `audience.render(engine)` in the same `renderCurrentScreen()` pass as
  `screens.render`, wires V1 fixes, extends the setup screen.
- `src/ui/screens.ts` — V1 fixes only (community tracker derived from
  the event log; focus after re-render).
- `src/ui/keys.ts` — V1: help rows rendered visibly via a callback.
- `scripts/make-dev-playtest.mjs` + `public/content/packs/dev-playtest.json`
  (generated, committed; see Content).
- Tests under `tests/ui/` (jsdom where DOM is touched).

## Page structure (binding)

```
<div id="app">
  <h1>The Way …</h1>              (once)
  <section aria-label="Audience view">   ← browse-mode document region
    <h2>…current team / location…>
    … audience panels (below) …
  </section>
  <section aria-label="Host controls" role="application">  ← screens.ts
  </section>
  status line, live regions, modal root (unchanged)
</div>
```

**Decision 1 (Brian's NVDA test decides):** the HOST CONTROLS region
gets `role="application"` (scoped — NOT on body; ACCESSIBILITY_PATTERNS
§3 forbids the full-page trap, not a scoped island). Reason: NVDA's
browse mode intercepts single letters (R/S/A/T/H/C/I/K) for quick
navigation and never delivers them to the page; a scoped application
region lets the game hotkeys work while focus is inside the controls,
while the audience view remains an ordinary document that browse mode
reads freely. If Brian's ear says otherwise, drop the role and rely on
NVDA+Space focus-mode toggling — record the outcome in OPEN_QUESTIONS.

Audience view order (top to bottom, each its own `<section>` with an
`<h3>`): Now playing (team badge, round, location, stage progress) →
Task (prompt, lettered choices, revealed clues; the reveal panel replaces
the choices after `reveal`) → Teams (table: badge, milestone, Insight,
Provision, Courage, Journey Token) → Journey (landmark strip) →
Community event (only while one is active) → Game summary (only at
gameSummary; replaces the Task panel).

## Audience panels

- **Now playing**: `Round N. Team X, at <milestone>. <stage name>: s of
  r successes.` plus a `role="progressbar"` (`aria-valuenow=s`,
  `aria-valuemax=r`, `aria-valuetext="s of r successes"`) with the same
  numbers as visible text. Uses `getEffectiveStageRequirement`.
- **Task**: shown from `resourceWindow` THROUGH `answerReveal` and
  `teachingReveal` — the audience must keep seeing the prompt while a
  team answers aloud (Phase 4's host screen drops it at awaitingAnswer;
  the audience view must not). Lettered choices come from
  `getCurrentTaskPublic()` only; the official answer appears ONLY once
  `getRevealedAnswer()` is non-null (§24 "do not display the official
  answer until the host reveals it") — structurally the same guarantee
  Phase 4 tested. Eliminated options are not re-shown (the engine already
  filters them); revealed clues are listed.
- **Teams**: one row per team, in turn order; the active team's row is
  marked with text ("now playing") AND a class, never color alone.
  Journey Token shown as text ("Token" / "—") plus an icon glyph.
- **Journey**: milestones in journey order as an ordered list; under each,
  the badges of teams currently AT it; a team `stagesBeyondMilestone > 0`
  is shown under its last milestone with the suffix "traveling on" (the
  engine's `allPositionsText()` is the spoken equivalent; the strip is
  the visual one — same facts).
- **Community event**: title, description, and progress: relay
  `p of threshold correct`; contribution `pledged of threshold`. Progress
  is DERIVED from `getSession().eventLog` (count "answers for the room:
  correct" / "contributes N <resource>" entries since the event's "The
  room begins" entry) — not from a UI counter — so it survives undo.
  Same rule applies to screens.ts's tracker (V1).
- **Game summary**: winners, Barnabas Award, final positions as a
  leaderboard list with badges.

## Team identity (§24)

`teamBadge.ts` maps the 8 preset symbol ids (cross, lion, dove, anchor,
star, shield, olive-branch, crown) to a Unicode glyph AND a spoken name;
a badge renders glyph + name with the team color as a CSS custom property
(`--team-color`) on the badge, foreground chosen by a luminance check so
text stays readable on any preset. `aria-label="Team X, lion"` — the
color is never the only distinction, and the glyph never the only
distinction either (the name is always present). Unknown symbol ids fall
back to a generic glyph, never blank.

## Visual design (TV distance)

`styles.css` owns all presentation: tokens for ink/paper/accent and the
existing light/dark scheme (`prefers-color-scheme`), a large-type scale
for the audience region (base ≥ 1.5rem, headings larger, badges ≥ 2rem),
generous spacing, high-contrast defaults (text on paper ≥ 7:1 target),
`.sr-only` retained. The host controls region may be visually quieter
(smaller type) — it's for the host at arm's length. Layout: audience view
above host controls on narrow screens; side by side (audience ≥ 60%
width) at ≥ 1100px. No CSS framework (no new dependency).

**Reduced motion**: honor `prefers-reduced-motion: reduce` AND a setup
toggle ("Reduce motion", default follows the media query). The effective
value is stamped as `data-reduced-motion="true|false"` on `#app`; the
only animations in this phase are short (≤ 300 ms) opacity/transform
transitions on panel changes, all under `[data-reduced-motion="false"]`
selectors, and none ever delay input (§24).

## Setup completeness (Phase 4's deferred controls)

Add to the setup screen, all keyboard AND mouse operable: enabled packs
(checkbox per loaded pack), enabled categories (checkbox per the 6
non-community categories), audio settings (four number inputs 0-100,
stored only), community catch-up (checkbox), duration "custom minutes"
(number input 15-180, enabled when the custom row is chosen), tasks-per-
turn override (number input 1-6, blank = recommended), reduced motion
(checkbox). Checkboxes get the same Enter/Space activation bridge the
buttons have (jsdom doesn't simulate native toggling; real browsers do
both). Every value must flow into `SetupWizard` and out through
`toBuildOptions()`/the App.

## Content: a playable dev pack (Decision 2, Brian may veto)

`dev-sample.json` (8 tasks) cannot pass the sufficiency check for the
real journey, so Brian can't play the browser build. Add
`scripts/make-dev-playtest.mjs` (Node, no dependencies) that writes
`public/content/packs/dev-playtest.json`: 20 tasks per (category ×
difficulty) = 420 tasks, prompts of the form "Dev playtest task N
(placeholder — never real content)", answers "Placeholder answer N",
about a third with 4 lettered options (one matching the answer, per the
schema rule), a third with 2 clues, some with assisted/amplified variants
and mixed `resourceInteractions`, so every host path is reachable in
play. Its `description` states it never ships. `main.ts` loads both
packs; setup lists both with dev-playtest enabled. This is the ONLY
content file Phase 5 may create; `dev-sample.json` is untouched. Do not
hand-write prompts — they are generated, obviously fake, and therefore
safe under the content-secrecy rule.

## Group V1 — Phase 4 review fixes (do first)

Found by Fable reviewing Phase 4 (OPEN_QUESTIONS item 16):

1. **Idle re-prompt is never wired.** `Presenter.setIdleWatcher()` is
   tested (U1) but `App` never calls it. Wire it: while playing, the
   watcher returns the current screen's entry prompt when a host action
   is pending (`lastRender.actions.length > 0`), null otherwise; cleared
   on leaving play. Make the presenter's timer injectable through
   `AppOptions` so a test drives it.
2. **The help menu has no visible list.** `KeyboardController` announces
   rows but nothing renders them — Brian's ruling says "displayed on the
   screen", and ACCESSIBILITY_PATTERNS §1 requires parity. Add an
   `onHelpChange(rows, cursor | null)` callback to
   `KeyboardControllerOptions`; App renders the rows as a `<ul>` inside
   the modal root (role="listbox"-style, `aria-activedescendant` tracks
   the cursor) and removes it on close/explorer entry.
3. **Focus falls to `<body>` after every host action** because the
   screen container is wiped and rebuilt. After a re-render triggered by
   a host action, move focus to the new screen's `<h2>` (given
   `tabindex="-1"`). This is a response to the user's own action, so it
   is consistent with "focus moves only when the user acts". Never do it
   on renders that were not user-initiated (there are none today; keep
   it that way).
4. **Community-event tracking drifts under undo.** `screens.ts` counts
   room progress and answered/pledged teams in a local object that
   `undo` cannot see. Derive both from `getSession().eventLog` instead
   (rule in "Community event" above) and delete the local tracker.
5. Minor: `App` never calls `presenter.dispose()` on its own; add
   `dispose()` to the test harness teardown pattern so jsdom runs don't
   accumulate intervals (already harmless; keep it tidy).

## Test list (implement in order; files under tests/ui/)

Group V1 — review fixes: idle re-prompt fires via the injected timer
only while an action is pending and stops when none is; the help menu's
rows appear in the DOM on `?`, track Up/Down, and disappear on Escape
and on the second `?`; focus is on the new screen heading after a
keyboard-dispatched action and after a mouse click; a relay event's
progress reads correctly after `relayAnswer` then `undo` then a
different `relayAnswer` (event-log derivation).

Group V2 — audience synchronization: drive the U10 keyboard script
(reuse it) and, after EVERY iteration, assert the audience view's
current-team name, milestone name, `s of r` text, and each team's three
resource numbers equal the engine's; the answer text never appears in
the audience region before `getRevealedAnswer()` is non-null and always
appears after; the task prompt is present in `awaitingAnswer` and
`answerReveal`.

Group V3 — team identity: 8 presets → 8 distinct glyphs; a badge's
`aria-label` contains the name and symbol word and never a color value;
foreground/background contrast of every preset badge ≥ 4.5:1 by the
luminance formula used in `teamBadge.ts`; an unknown symbol id renders
the fallback glyph, never an empty badge.

Group V4 — journey strip: milestones render in journey order; a team
appears under its `currentMilestoneId`; after a stage completion that
does not arrive at a milestone, the team shows "traveling on"; the strip
lists the same teams `allPositionsText()` names.

Group V5 — progress and resources: progressbar attributes match visible
text and the engine after several successes; the Teams table marks the
active row textually; a Journey Token appears as text once earned
(reuse U7's earn-through-play approach).

Group V6 — community, reveal, summary panels: relay progress `p of t`
updates per answer; contribution pledged total updates per pledge; the
reveal panel shows answer + accepted + guidance only after reveal; the
summary leaderboard lists winners, award, positions at gameSummary.

Group V7 — reduced motion and tokens: `data-reduced-motion` follows the
media query by default (mock `matchMedia`), the setup toggle overrides
it both ways, and no animated class is applied while it is true;
`styles.css` is imported by `main.ts` (a test reads the file and checks
the token names exist — keeps the stylesheet honest).

Group V8 — setup completeness and the dev-playtest pack: every new
control is keyboard-operable (Space/Enter) and its value reaches
`toBuildOptions()`/`App` (packs, categories, custom minutes, tasks-per-
turn clamp, catch-up, audio, reduced motion); the generator script is
deterministic and `dev-playtest.json` validates through
`contentPackSchema`; a full App game against dev-playtest + the real
`jerusalem-rome.json` (loaded via `validateJourney` from the file, not
testJourney) reaches gameSummary with the audience view synchronized at
every step (reuse V2's assertion helper).

## Definition of done

All V-groups green alongside the existing 228 tests; `npx tsc --noEmit`
and `npm run build` clean; `styles.css` bundled; `dev-playtest.json`
committed with its generator; KEYBOARD_COMMANDS.md unchanged unless a
binding changes; OPEN_QUESTIONS.md updated with any discrepancy found
(never silently fixed) and with the results of the manual browser check
Sonnet performs before finishing (startup → setup → several turns →
reveal → community event, against dev-playtest); IMPLEMENTATION_STATUS.md
moves Phase 5 to Completed, styled like Phases 2-4; no forbidden files
modified; committed per green group and pushed. Brian's own NVDA pass is
the final word on Decision 1 and on the visual scale.
