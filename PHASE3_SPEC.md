# PHASE3_SPEC — The Session Builder

Implementation contract for Phase 3 (design doc §18, §29, §34 Phase 3;
§19 setup math). Written for an UNATTENDED coding agent. Where this file is
more specific than the design doc, this file wins; where both are silent,
choose the simplest reversible option and record it in OPEN_QUESTIONS.md.

## Ground rules for the coding agent

1. Same discipline as Phase 2: test-first from the S-groups below, one
   group at a time; `npm test` + `npx tsc --noEmit` green before every
   commit; commit per green group; push when done; update
   IMPLEMENTATION_STATUS.md as groups complete.
2. New code lives in `src/session/`. Do NOT modify `src/engine/` (the
   builder plugs into the existing `TaskSource` interface), do NOT modify
   `src/content/schemas.ts`, sample content, the design doc, or the Phase
   specs. If genuinely blocked by one of them, record it in
   OPEN_QUESTIONS.md and continue elsewhere.
3. Content secrecy: builder output (reports, logs, test names) refers to
   tasks by id/category/difficulty only — never prompt or answer text.
4. Test content: the dev-sample pack (8 tasks) is too small for balance
   tests. Build a synthetic-task FACTORY in `tests/session/factory.ts`
   that generates schema-valid tasks programmatically (parse each through
   `taskSchema` so a factory bug fails loudly). Synthetic prompts must be
   obviously fake ("Synthetic task 17 prompt") so they can never be
   mistaken for real content.

## What Phase 3 delivers (design doc Phase 3 deliverable)

Identical seeds reproduce identical sessions, and different teams receive
reasonably balanced task mixes — via a real `TaskSource` implementation
(`SessionDeck`) that replaces `ArrayTaskSource` for real play, plus a
`planSession()` wrapper that produces the duration estimate and warnings
the setup wizard (Phase 4) will display.

## Architecture

Two files:

- `src/session/builder.ts` — `buildSessionDeck(options): BuildResult` and
  the `SessionDeck` class (implements `TaskSource` from
  `src/engine/taskSource.ts`).
- `src/session/plan.ts` — `planSession(options): SessionPlan` (pure; wraps
  `estimateMinutes` from `src/engine/estimator.ts`).

### buildSessionDeck options

```typescript
interface BuildOptions {
  journey: Journey;
  packs: ContentPack[];
  teamIds: string[];                 // 2-8, unique (validate)
  turnTaskLimit: number;             // >= 1 (validate)
  seed: string;                      // all builder randomness derives from this
  difficulty?: "gentle" | "standard" | "challenging";  // default "standard"
  enabledCategories?: TaskCategory[]; // default: all 7
  excludeTaskIds?: string[];         // recent-use avoidance (§29); may be empty
}

interface BuildResult {
  deck: SessionDeck;
  report: DeckReport;
}
```

All randomness comes from `createRng(seed + ":builder")` — never
`Math.random`, never the engine's rng. Building twice with identical
options must produce byte-identical decks (S1).

### How the deck works (binding algorithm)

The deck is not one pre-ordered list. It is:

1. **A used set** — every task id ever served (by any team, any path:
   normal, replacement, community). Nothing is served twice in a session
   (§29 "no repeat within the same game"). `excludeTaskIds` are pre-seeded
   into the used set; if that exclusion leaves any enabled category empty,
   un-exclude just enough of the oldest exclusions to proceed and add a
   warning to the report (graceful, never fatal).
2. **Per-category ordered pools** — enabled tasks grouped by category,
   each pool shuffled ONCE at build time with the seeded rng
   (Fisher-Yates). Within a pool, tasks are also bucketed by difficulty.
3. **A community reserve** — for each authored community event in the
   journey, reserve 2 tasks of its `taskCategory` (removed from general
   pools at build time). `nextCommunityTask(category)` serves from the
   reserve first, falling back to the general pool if the reserve is
   exhausted. If a reserve cannot be filled at build time, build fails
   with a readable report (a journey demanding an unservable event is
   invalid content — §33.2 spirit).
4. **A per-team category planner** — decides which category each
   `nextTask(teamId, stageId)` draw comes from:
   - Find the team's current stage/route `taskFocus` (the builder gets the
     stage id from the call; look it up in the journey exactly the way the
     engine does — reuse a small shared lookup, or duplicate the ~20-line
     walk; do NOT import engine internals).
   - If the stage has non-empty `taskFocus`: rotate round-robin through
     the focus categories (per-team cursor).
   - Otherwise: rotate through a per-team category CYCLE — a seeded
     shuffle of all enabled categories, re-shuffled each time the cycle
     is exhausted, with the constraint that the same category never
     appears 3 times consecutively in a team's overall serve history
     (streak limit 2; §18 "avoid long streaks"). Skip-and-reinsert to
     enforce it.
   - `community` is EXCLUDED from ordinary rotation (community tasks are
     for events; §13.7) unless a stage's taskFocus explicitly names it.
5. **Difficulty selection within a category** — weighted, seeded draw by
   the session difficulty setting:
   | setting | easy | moderate | hard |
   |---|---:|---:|---:|
   | gentle | 50% | 40% | 10% |
   | standard | 30% | 50% | 20% |
   | challenging | 15% | 45% | 40% |
   If the drawn difficulty's bucket is empty in that category, fall back
   to the nearest bucket (moderate ↔ easy ↔ hard adjacency: try adjacent
   first, then the far one), deterministically.
6. **Serving**: `nextTask` = planner picks category → difficulty draw →
   pop the first unused task matching; mark used. If the chosen category
   is fully exhausted, fall back to the next category in the team's cycle
   (log a report warning at build time if projected demand exceeds supply
   — see Sufficiency below). If EVERY enabled pool is exhausted, throw —
   and the sufficiency check exists precisely so this never happens in a
   validly-built session.
7. **Replacements**: `nextReplacement(category, difficulty)` pops the
   first unused task matching category+difficulty exactly; if none, try
   adjacent difficulties in the same category; if still none, return null
   (the engine already treats null as "recovery not offered").

### Fairness targets (validated by tests, achieved by construction)

Over a full simulated session, for each category, the per-team serve
counts must differ by at most 2 between any two teams (S4). The
round-robin planner achieves this naturally; the test pins it.

### Sufficiency check (build-time)

Estimate total draws ≈ `teamIds.length × estimatedRounds × turnTaskLimit`
(rounds from `estimateMinutes` with the journey's total required
successes). Require enabled, non-reserved supply ≥ 1.5 × that estimate;
below 1.5× add a report warning, below 1.0× fail the build with a
readable error naming the shortfall per category. (§18 "extra tasks for
replacements and retries", §29 "a session uses only a portion".)

### DeckReport

```typescript
interface DeckReport {
  seed: string;
  totalTasksAvailable: number;
  totalReserved: number;
  projectedDraws: number;
  perCategoryAvailable: Record<TaskCategory, number>;
  warnings: string[];        // readable, id/category-level only
}
```

Plus a diagnostic method on the deck for §29's preview:
`deck.previewPlan(teamId, count)` returns the next `count`
category/difficulty pairs that WOULD be served (without marking anything
used) — spoiler-safe (no task ids, no prompts).

## planSession (src/session/plan.ts)

```typescript
interface PlanOptions {
  journey: Journey;
  teamCount: number;
  duration: "short" | "standard" | "long" | { customMinutes: number };
  pace: "relaxed" | "standard" | "quick";   // scales avgTaskSeconds
}

interface SessionPlan {
  targetMinutes: number;
  estimatedMinutes: number;
  estimatedRounds: number;
  recommendedTasksPerTurn: number;
  totalRequiredSuccesses: number;
  communityEventCount: number;
  warnings: string[];
}
```

Binding numbers:

- **Duration targets**: short 40, standard 55, long 75 minutes; custom as
  given (validate 15–180).
- **Pace** scales `avgTaskSeconds`: relaxed 55, standard 45, quick 35.
  (`turnOverheadSeconds` stays 50 — the corrected constant set; playtests
  may tune later.)
- **recommendedTasksPerTurn** from §36 `tasksPerTurn` by team count
  (2 → 4; 3–5 → 3; 6–8 → 2).
- **totalRequiredSuccesses** from the journey: sum every top-level
  stage's `requiredSuccesses`; for each fork add the MEAN of its routes'
  total requirements, rounded to nearest (a team picks one route, so the
  expected cost is the average, not the sum).
- **Warning rule** (§19 "warn when settings are unlikely to fit"): warn
  when `|estimatedMinutes − targetMinutes| > 0.2 × targetMinutes`, with a
  message that names both numbers and the direction ("about 73 minutes,
  which is longer than the 55-minute target").

Reference anchor (from the corrected estimator math): 4 teams, 3
tasks/turn, standard pace, 2 events, and a journey totaling **7 required
successes** → ~59 minutes: inside the standard target's warning band.
Test S10 pins this anchor.

## Test list (implement in order; files under tests/session/)

Group S1 — determinism: identical BuildOptions (same seed) produce
identical decks — prove by driving two decks through an identical long
call sequence and comparing every served task id; different seeds diverge;
the report is identical for identical inputs.

Group S2 — no repeats: over a fully-drained simulated session (hundreds of
draws across all teams, plus replacements and community draws), no task id
is ever served twice.

Group S3 — streak limit: in every team's serve history (no-focus stages),
no category appears 3 times consecutively.

Group S4 — fairness: with 2 and with 4 teams over a full session, per-
category serve counts differ by ≤2 between any two teams.

Group S5 — difficulty distribution: statistical over a large synthetic
pool (≥600 draws, generous bands like Phase 2's F7): standard lands near
30/50/20, challenging near 15/45/40; empty-bucket fallback picks the
adjacent difficulty deterministically.

Group S6 — taskFocus: draws during a stage with taskFocus come only from
the focus categories (while supply lasts) and rotate among them;
`community` never appears in ordinary rotation without explicit focus.

Group S7 — community reserve: reserves fill at build time (2 per event);
nextCommunityTask serves reserved tasks first; an unfillable reserve fails
the build with a readable per-category error.

Group S8 — replacements: exact category+difficulty match preferred,
adjacent-difficulty fallback works, used tasks are never re-served, null
when the category is exhausted.

Group S9 — exclusions: excludeTaskIds are never served; over-exclusion
that would empty a category un-excludes just enough (oldest first) and
warns; the sufficiency check fails the build below 1.0× projected demand
and warns below 1.5×.

Group S10 — planSession: totalRequiredSuccesses sums stages and averages
fork routes correctly against testJourney's known numbers; the ~59-minute
anchor (4 teams / 3 tasks / standard pace / 2 events / 7 successes) lands
inside the standard band with no warning; a mismatched configuration
produces the §19 warning naming both numbers; pace scales the estimate in
the right direction.

Group S11 — engine integration: a full 2-team game (reuse the
full-game-smoke driving loop) runs start → gameSummary against a REAL
SessionDeck built from a synthetic pack, twice with the same seed,
producing identical taskHistory both times; and once with a different
seed, producing a different taskHistory.

## Definition of done (Phase 3)

All S-groups green; tsc and build clean; no engine/schema/content/spec
changes; IMPLEMENTATION_STATUS.md updated (move Phase 3 to Completed with
the same style of notes as Phase 2's entry); everything committed and
pushed. The boot page does NOT change in this phase.
