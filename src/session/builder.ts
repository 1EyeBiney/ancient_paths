// The session deck builder (PHASE3_SPEC "How the deck works"). Produces a
// SessionDeck implementing the engine's TaskSource interface: a seeded,
// balanced, no-repeat task supply. All randomness derives from the given
// seed — never Math.random — so identical options reproduce identical
// decks (§18, §33.1's determinism principle, carried into Phase 3).

import type { ContentPack, Journey, Task } from "../content/schemas";
import { TASK_CATEGORIES } from "../content/schemas";
import type { TaskSource } from "../engine/taskSource";
import { createRng, type Rng } from "../engine/rng";
import { estimateMinutes } from "../engine/estimator";
import { totalRequiredSuccesses } from "./plan";

type TaskCategory = Task["category"];
type Difficulty = Task["difficulty"];
type JourneyEntry = Journey["entries"][number];
type StageEntry = Extract<JourneyEntry, { kind: "stage" }>;

export type DeckDifficultySetting = "gentle" | "standard" | "challenging";

export interface BuildOptions {
  journey: Journey;
  packs: ContentPack[];
  teamIds: string[];
  turnTaskLimit: number;
  seed: string;
  difficulty?: DeckDifficultySetting;
  enabledCategories?: TaskCategory[];
  excludeTaskIds?: string[];
}

export interface DeckReport {
  seed: string;
  totalTasksAvailable: number;
  totalReserved: number;
  projectedDraws: number;
  perCategoryAvailable: Record<TaskCategory, number>;
  warnings: string[];
}

export interface BuildResult {
  deck: SessionDeck;
  report: DeckReport;
}

export interface PlannedDraw {
  category: TaskCategory;
  difficulty: Difficulty;
}

/** Thrown when a journey/pack combination cannot be built into a playable deck. */
export class SessionBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionBuildError";
  }
}

// ---------------------------------------------------------------------------
// Difficulty weighting (binding table)
// ---------------------------------------------------------------------------

const DIFFICULTY_WEIGHTS: Record<DeckDifficultySetting, Record<Difficulty, number>> = {
  gentle: { easy: 50, moderate: 40, hard: 10 },
  standard: { easy: 30, moderate: 50, hard: 20 },
  challenging: { easy: 15, moderate: 45, hard: 40 },
};

// PHASE10_SPEC Group X4b: a fork route's own `difficulty` shifts the DRAW
// weights for its stages one step relative to the session setting — easy
// one step gentler, hard one step harder, moderate unchanged, clamped at
// the ends (gentle can't get gentler, challenging can't get harder).
// Before this, route.difficulty was descriptive only: every stage drew at
// the plain session weights regardless of its route, making the route with
// the FEWEST required successes always strictly dominant (same odds per
// task, fewer tasks needed) — contradicting §5.3's "forks trade off
// length, difficulty, and task type."
const SESSION_DIFFICULTY_ORDER: DeckDifficultySetting[] = ["gentle", "standard", "challenging"];

function stepSessionDifficulty(setting: DeckDifficultySetting, delta: -1 | 1): DeckDifficultySetting {
  const idx = SESSION_DIFFICULTY_ORDER.indexOf(setting);
  const next = Math.min(SESSION_DIFFICULTY_ORDER.length - 1, Math.max(0, idx + delta));
  return SESSION_DIFFICULTY_ORDER[next]!;
}

function drawDifficulty(rng: Rng, weights: Record<Difficulty, number>): Difficulty {
  const total = weights.easy + weights.moderate + weights.hard;
  let roll = rng.next() * total;
  for (const d of ["easy", "moderate", "hard"] as const) {
    roll -= weights[d];
    if (roll < 0) return d;
  }
  return "hard"; // float-edge fallback; unreachable in practice
}

// Deterministic adjacency order for the empty-bucket fallback: try the
// drawn difficulty, then its nearer neighbor, then the far one. Moderate is
// adjacent to both easy and hard; "prefer softer" is the tie-break.
function fallbackOrder(d: Difficulty): Difficulty[] {
  if (d === "easy") return ["easy", "moderate", "hard"];
  if (d === "hard") return ["hard", "moderate", "easy"];
  return ["moderate", "easy", "hard"];
}

// ---------------------------------------------------------------------------
// Journey structural lookup (duplicated in miniature per PHASE3_SPEC — the
// engine's equivalent walk is private; do not import engine internals).
// ---------------------------------------------------------------------------

function findStageInJourney(journey: Journey, stageId: string): StageEntry | undefined {
  for (const entry of journey.entries) {
    if (entry.kind === "stage" && entry.id === stageId) return entry;
    if (entry.kind === "fork") {
      for (const route of entry.routes) {
        const stage = route.stages.find((s) => s.id === stageId);
        if (stage) return stage;
      }
    }
  }
  return undefined;
}

/**
 * The taskFocus that governs draws for `stageId` (PHASE3_SPEC planner step
 * 4: "the team's current stage/route taskFocus"): a stage's own focus if it
 * declares one, otherwise the focus of the route that contains it. The
 * schema requires `taskFocus` on every route but makes it optional on a
 * stage, so a fork route's stages almost never carry their own — the real
 * journey's don't. Before the Phase 9 review this looked at the stage only,
 * silently giving every route stage plain rotation and making a route's
 * "testing X and Y" description untrue.
 */
function focusForStage(journey: Journey, stageId: string): TaskCategory[] | undefined {
  for (const entry of journey.entries) {
    if (entry.kind === "stage" && entry.id === stageId) return entry.taskFocus;
    if (entry.kind === "fork") {
      for (const route of entry.routes) {
        const stage = route.stages.find((s) => s.id === stageId);
        if (stage) return stage.taskFocus ?? route.taskFocus;
      }
    }
  }
  return undefined;
}

type RouteEntry = Extract<JourneyEntry, { kind: "fork" }>["routes"][number];

/** The fork route containing `stageId`, or undefined for a top-level stage
 * (PHASE10_SPEC Group X4b). */
function routeForStage(journey: Journey, stageId: string): RouteEntry | undefined {
  for (const entry of journey.entries) {
    if (entry.kind !== "fork") continue;
    for (const route of entry.routes) {
      if (route.stages.some((s) => s.id === stageId)) return route;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Seeded Fisher-Yates
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Per-team rotation state
// ---------------------------------------------------------------------------

interface TeamDeckState {
  cycle: TaskCategory[]; // seeded-shuffle queue for non-focus rotation
  focusCursor: number; // monotonic round-robin index into whatever taskFocus is current
  categoryHistory: TaskCategory[]; // every category ever served to this team via nextTask
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

export class SessionDeck implements TaskSource {
  private readonly pools: Record<TaskCategory, Record<Difficulty, Task[]>>;
  private readonly communityReserve: Record<TaskCategory, Task[]>;
  private readonly usedIds = new Set<string>();
  private readonly teams = new Map<string, TeamDeckState>();
  private readonly rotationCategories: TaskCategory[]; // enabled, excluding "community"

  constructor(
    private readonly journey: Journey,
    pools: Record<TaskCategory, Record<Difficulty, Task[]>>,
    communityReserve: Record<TaskCategory, Task[]>,
    enabledCategories: TaskCategory[],
    private readonly rng: Rng,
    private readonly weights: Record<Difficulty, number>,
    private readonly difficultySetting: DeckDifficultySetting,
  ) {
    this.pools = pools;
    this.communityReserve = communityReserve;
    this.rotationCategories = enabledCategories.filter((c) => c !== "community");
  }

  /** The draw-weight row for a stage (Group X4b): the route's difficulty
   * shifts the session row one step; a top-level stage or a `moderate`
   * route uses the plain session row. */
  private weightsForStage(stageId: string): Record<Difficulty, number> {
    const route = routeForStage(this.journey, stageId);
    if (!route || route.difficulty === "moderate") return this.weights;
    const delta = route.difficulty === "easy" ? -1 : 1;
    return DIFFICULTY_WEIGHTS[stepSessionDifficulty(this.difficultySetting, delta)];
  }

  // -- TaskSource ------------------------------------------------------

  nextTask(teamId: string, stageId: string): Task {
    const team = this.teamState(teamId);
    const focus = focusForStage(this.journey, stageId);

    let category: TaskCategory | null = null;
    if (focus && focus.length > 0) {
      for (let i = 0; i < focus.length; i++) {
        const idx = (team.focusCursor + i) % focus.length;
        const candidate = focus[idx]!;
        if (this.poolHasAny(candidate)) {
          category = candidate;
          team.focusCursor = idx + 1;
          break;
        }
      }
      // every focus category exhausted: fall through to the general cycle
    }
    if (category === null) {
      category = this.pickFromCycle(team);
    }

    // nextReplacement() (recover) is unaffected: it draws by the ORIGINAL
    // attempt's already-fixed category+difficulty via fallbackOrder, not
    // a fresh weighted roll, so route-shifted weights only matter here.
    const task = this.popFromCategory(category, this.weightsForStage(stageId));
    if (!task) {
      throw new SessionBuildError(
        `SessionDeck.nextTask: category "${category}" is exhausted and no fallback category had supply.`,
      );
    }
    team.categoryHistory.push(category);
    return task;
  }

  nextReplacement(category: TaskCategory, difficulty: Difficulty): Task | null {
    for (const d of fallbackOrder(difficulty)) {
      const bucket = this.pools[category][d];
      const task = bucket.pop();
      if (task) {
        this.usedIds.add(task.id);
        return task;
      }
    }
    return null;
  }

  nextCommunityTask(category: TaskCategory): Task {
    const reserve = this.communityReserve[category];
    const fromReserve = reserve?.pop();
    if (fromReserve) {
      this.usedIds.add(fromReserve.id);
      return fromReserve;
    }
    const fallback = this.popFromCategory(category);
    if (!fallback) {
      throw new SessionBuildError(
        `SessionDeck.nextCommunityTask: no tasks remain for category "${category}".`,
      );
    }
    return fallback;
  }

  // -- diagnostics (spoiler-safe: category/difficulty only, never ids/text) --

  /**
   * Previews the next `count` category/difficulty pairs that WOULD be
   * served to this team without marking anything used — a dry-run preview
   * for setup screens (§29), safe because it reveals no task identity.
   */
  previewPlan(teamId: string, count: number): PlannedDraw[] {
    // Operate on a scratch clone of just this team's rotation state and the
    // pool SIZES (not contents) so the preview cannot consume real tasks.
    const original = this.teamState(teamId);
    const scratch: TeamDeckState = {
      cycle: original.cycle.slice(),
      focusCursor: original.focusCursor,
      categoryHistory: original.categoryHistory.slice(),
    };
    const sizesRemaining: Record<TaskCategory, number> = this.poolSizeSnapshot();
    const draws: PlannedDraw[] = [];
    for (let i = 0; i < count; i++) {
      const category = this.pickFromCycleScratch(scratch, sizesRemaining);
      if (category === null) break; // nothing left to preview
      const difficulty = drawDifficulty(this.rng, this.weights);
      draws.push({ category, difficulty });
      scratch.categoryHistory.push(category);
      if (sizesRemaining[category] > 0) sizesRemaining[category]--;
    }
    return draws;
  }

  // -- internals -----------------------------------------------------

  private teamState(teamId: string): TeamDeckState {
    let team = this.teams.get(teamId);
    if (!team) {
      team = { cycle: [], focusCursor: 0, categoryHistory: [] };
      this.teams.set(teamId, team);
    }
    return team;
  }

  private poolHasAny(category: TaskCategory): boolean {
    const byDifficulty = this.pools[category];
    return byDifficulty.easy.length + byDifficulty.moderate.length + byDifficulty.hard.length > 0;
  }

  private poolSizeSnapshot(): Record<TaskCategory, number> {
    const snapshot = {} as Record<TaskCategory, number>;
    for (const category of TASK_CATEGORIES) {
      const p = this.pools[category];
      snapshot[category] = p.easy.length + p.moderate.length + p.hard.length;
    }
    return snapshot;
  }

  private popFromCategory(category: TaskCategory, weights: Record<Difficulty, number> = this.weights): Task | null {
    if (!this.poolHasAny(category)) return null;
    const drawn = drawDifficulty(this.rng, weights);
    for (const d of fallbackOrder(drawn)) {
      const bucket = this.pools[category][d];
      const task = bucket.pop();
      if (task) {
        this.usedIds.add(task.id);
        return task;
      }
    }
    return null;
  }

  private refillCycle(team: TeamDeckState): void {
    team.cycle = shuffle(this.rotationCategories, this.rng);
  }

  /** Would serving `candidate` next make this team's last 3 draws identical? */
  private wouldStreak(history: TaskCategory[], candidate: TaskCategory): boolean {
    const n = history.length;
    return n >= 2 && history[n - 1] === candidate && history[n - 2] === candidate;
  }

  private pickFromCycle(team: TeamDeckState): TaskCategory {
    if (this.rotationCategories.length === 0) {
      throw new SessionBuildError("SessionDeck: no enabled (non-community) categories to draw from.");
    }
    const maxAttempts = this.rotationCategories.length * 2 + 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (team.cycle.length === 0) this.refillCycle(team);
      const candidate = team.cycle.shift()!;
      if (!this.poolHasAny(candidate)) continue; // exhausted; drop for this lap
      if (this.wouldStreak(team.categoryHistory, candidate) && this.rotationCategories.length > 1) {
        team.cycle.push(candidate); // reinsert at the back, try the next
        continue;
      }
      return candidate;
    }
    const anyWithSupply = this.rotationCategories.find((c) => this.poolHasAny(c));
    if (anyWithSupply) return anyWithSupply;
    throw new SessionBuildError("SessionDeck: every enabled category pool is exhausted.");
  }

  // Preview-only variant of pickFromCycle operating on scratch state and a
  // remaining-count snapshot instead of the real pools, so previewing never
  // consumes a task.
  private pickFromCycleScratch(
    scratch: TeamDeckState,
    sizesRemaining: Record<TaskCategory, number>,
  ): TaskCategory | null {
    if (this.rotationCategories.length === 0) return null;
    const maxAttempts = this.rotationCategories.length * 2 + 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (scratch.cycle.length === 0) scratch.cycle = shuffle(this.rotationCategories, this.rng);
      const candidate = scratch.cycle.shift()!;
      if (sizesRemaining[candidate] <= 0) continue;
      if (this.wouldStreak(scratch.categoryHistory, candidate) && this.rotationCategories.length > 1) {
        scratch.cycle.push(candidate);
        continue;
      }
      return candidate;
    }
    return this.rotationCategories.find((c) => sizesRemaining[c] > 0) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function emptyByDifficulty(): Record<Difficulty, Task[]> {
  return { easy: [], moderate: [], hard: [] };
}

export function buildSessionDeck(options: BuildOptions): BuildResult {
  const { journey, packs, teamIds, turnTaskLimit, seed } = options;
  const difficultySetting = options.difficulty ?? "standard";
  const enabledCategories = options.enabledCategories ?? [...TASK_CATEGORIES];
  const excludeTaskIds = options.excludeTaskIds ?? [];

  if (teamIds.length < 2 || teamIds.length > 8) {
    throw new Error(`buildSessionDeck: team count must be 2-8, got ${teamIds.length}`);
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error("buildSessionDeck: teamIds must be unique");
  }
  if (turnTaskLimit < 1) {
    throw new Error("buildSessionDeck: turnTaskLimit must be at least 1");
  }

  const rng = createRng(`${seed}:builder`);
  const warnings: string[] = [];

  // Community tasks are always poolable (events must remain fulfillable
  // regardless of the enabledCategories setup toggle); everything else is
  // gated by enabledCategories.
  const poolableCategories = new Set<TaskCategory>([...enabledCategories, "community"]);
  const allTasks = packs.flatMap((p) => p.tasks).filter((t) => poolableCategories.has(t.category));
  const byId = new Map(allTasks.map((t) => [t.id, t]));

  // Graceful exclusion: excludeTaskIds are treated as "used" up front, but
  // never at the cost of making an enabled category entirely unservable —
  // relax the OLDEST exclusions in that category (excludeTaskIds order is
  // taken as oldest-first) just enough to leave at least one task.
  const excludedSet = new Set(excludeTaskIds.filter((id) => byId.has(id)));
  for (const category of enabledCategories) {
    const inCategory = allTasks.filter((t) => t.category === category);
    if (inCategory.length === 0) continue; // no content at all; sufficiency check reports this
    const stillAvailable = inCategory.some((t) => !excludedSet.has(t.id));
    if (stillAvailable) continue;
    const oldestExcludedInCategory = excludeTaskIds.filter((id) =>
      inCategory.some((t) => t.id === id),
    );
    for (const id of oldestExcludedInCategory) {
      excludedSet.delete(id);
      warnings.push(
        `Recent-use exclusion relaxed for task "${id}" to keep category "${category}" servable.`,
      );
      if (inCategory.some((t) => !excludedSet.has(t.id))) break;
    }
  }

  const usableTasks = allTasks.filter((t) => !excludedSet.has(t.id));

  // Build seeded, shuffled per-category/difficulty pools.
  const pools = {} as Record<TaskCategory, Record<Difficulty, Task[]>>;
  for (const category of TASK_CATEGORIES) pools[category] = emptyByDifficulty();
  for (const task of shuffle(usableTasks, rng)) {
    pools[task.category][task.difficulty].push(task);
  }

  // Carve out community reserves (2 per authored event) BEFORE reporting
  // availability, so the general-supply numbers reflect what's left for
  // ordinary rotation.
  const communityReserve: Record<TaskCategory, Task[]> = {} as Record<TaskCategory, Task[]>;
  for (const category of TASK_CATEGORIES) communityReserve[category] = [];
  // Only relay events draw from the deck (via nextCommunityTask, per
  // PHASE2_SPEC's rule details); contribution events pledge resources and
  // never call nextCommunityTask, so they need no reserve.
  const reservesNeeded = new Map<TaskCategory, number>();
  for (const event of journey.communityEvents) {
    if (event.kind !== "relay") continue;
    reservesNeeded.set(event.taskCategory, (reservesNeeded.get(event.taskCategory) ?? 0) + 2);
  }
  for (const [category, needed] of reservesNeeded) {
    for (let i = 0; i < needed; i++) {
      const bucket = pools[category];
      const task = bucket.easy.pop() ?? bucket.moderate.pop() ?? bucket.hard.pop();
      if (!task) {
        throw new SessionBuildError(
          `buildSessionDeck: cannot reserve enough "${category}" tasks for a community event ` +
            `(needed ${needed}, content pack(s) do not supply enough).`,
        );
      }
      communityReserve[category].push(task);
    }
  }

  // Sufficiency check.
  const total = totalRequiredSuccesses(journey);
  const { estimatedRounds } = estimateMinutes({
    teamCount: teamIds.length,
    tasksPerTurn: turnTaskLimit,
    totalRequiredSuccesses: total,
    communityEventCount: journey.communityEvents.length,
  });
  const projectedDraws = teamIds.length * estimatedRounds * turnTaskLimit;

  const perCategoryAvailable = {} as Record<TaskCategory, number>;
  let totalAvailable = 0;
  for (const category of TASK_CATEGORIES) {
    const p = pools[category];
    const n = p.easy.length + p.moderate.length + p.hard.length;
    perCategoryAvailable[category] = n;
    totalAvailable += n;
  }

  if (totalAvailable < projectedDraws) {
    const shortfalls = enabledCategories
      .map((c) => `${c}: ${perCategoryAvailable[c]}`)
      .join(", ");
    throw new SessionBuildError(
      `buildSessionDeck: insufficient content. Projected ${projectedDraws} draws across the ` +
        `session, but only ${totalAvailable} tasks are available after reserving community ` +
        `events (per category: ${shortfalls}).`,
    );
  }
  if (totalAvailable < 1.5 * projectedDraws) {
    warnings.push(
      `Content supply is tight: ${totalAvailable} tasks available for an estimated ` +
        `${projectedDraws} draws this session. Consider enabling more categories or adding content.`,
    );
  }

  const totalReserved = Object.values(communityReserve).reduce((sum, arr) => sum + arr.length, 0);

  const deck = new SessionDeck(
    journey,
    pools,
    communityReserve,
    enabledCategories,
    rng,
    DIFFICULTY_WEIGHTS[difficultySetting],
    difficultySetting,
  );

  const report: DeckReport = {
    seed,
    totalTasksAvailable: totalAvailable,
    totalReserved,
    projectedDraws,
    perCategoryAvailable,
    warnings,
  };

  return { deck, report };
}
