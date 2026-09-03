// The headless game engine (PHASE2_SPEC.md). Pure TypeScript: no DOM, no
// audio, no timers, no fetch. All randomness flows through the injected
// Rng; all task supply flows through the injected TaskSource. Every
// mutation happens through dispatch(command); illegal commands throw and
// change nothing (enforced by snapshot-and-rollback in dispatch()).

import type { ContentPack, Journey, Task } from "../content/schemas";
import { DEFAULTS, type GameDefaults } from "../config/defaults";
import type {
  GameEvent,
  GameState,
  PlaySession,
  ResourceType,
  TaskResult,
  TaskVariantKind,
  TeamState,
} from "./types";
import type { Rng } from "./rng";
import { pickOne } from "./rng";
import type { TaskSource } from "./taskSource";
import { IllegalCommandError } from "./errors";
import { drawOfferingOutcome } from "./offering";

// ---------------------------------------------------------------------------
// Journey sub-shapes, derived from the schema's inferred type (schemas.ts is
// off-limits to modify; these are structural views into it).
// ---------------------------------------------------------------------------

type JourneyEntry = Journey["entries"][number];
type StageEntry = Extract<JourneyEntry, { kind: "stage" }>;
type ForkEntry = Extract<JourneyEntry, { kind: "fork" }>;
type CommunityEventDef = Journey["communityEvents"][number];
type RoomReward = CommunityEventDef["reward"];
type OfferingOutcomeDef = Journey["offeringOutcomes"][number];
type OfferingEffect = OfferingOutcomeDef["effect"];

// ---------------------------------------------------------------------------
// Public-facing setup and read-model types
// ---------------------------------------------------------------------------

export interface TeamSetup {
  id: string;
  name: string;
  color: string;
  symbol: string;
}

export interface EngineOptions {
  journey: Journey;
  packs: ContentPack[];
  teams: TeamSetup[];
  turnTaskLimit: number;
  rng: Rng;
  taskSource: TaskSource;
  config?: Partial<GameDefaults>;
  // Every team's opening resource pool. Real play starts every team at 0/0/0
  // (teams earn everything through play); this exists so tests can seed a
  // team with resources to spend without needing to play through several
  // stages first to earn them organically.
  startingResources?: Record<ResourceType, number>;
}

export type InsightEffectType = "extra-clue" | "eliminate-option" | "replay";
export type JourneyTokenEffectType =
  | "extra-clue"
  | "eliminate-option"
  | "replay"
  | "assist"
  | "amplify";

export interface PublicVariant {
  kind: TaskVariantKind;
  prompt: string;
  options?: string[];
  successValue: 1 | 2;
}

// The pre-reveal read view of the live task. Deliberately has NO answer /
// acceptedAnswers fields — this is what makes the host-as-player privacy
// rule (rev 1.1) enforceable and testable (Group E).
export interface PublicTask {
  id: string;
  category: Task["category"];
  difficulty: Task["difficulty"];
  title: string;
  activeVariant: PublicVariant;
  cluesRevealed: string[];
  cluesRemaining: number;
  canAssist: boolean;
  canAmplify: boolean;
  canEliminateOption: boolean;
  canExtraClue: boolean;
  isRecoveryAttempt: boolean;
}

export interface RevealedAnswer {
  answer: string;
  acceptedAnswers: string[];
  hostGuidance: string | null;
}

// The pre-reveal read view of a relay's shared community task (PHASE9_SPEC
// Group N1). No answer/acceptedAnswers — host-as-player: nobody hears the
// answer before every team has answered.
export interface CommunityTaskPublic {
  id: string;
  title: string;
  prompt: string;
  hostGuidance: string | null;
}

export interface GameSummary {
  journeyWinners: string[];
  barnabasAwardRecipients: string[];
  finalPositions: string[];
  /** Configured public name of the Service recognition (§6.3, §36). */
  serviceAwardName: string;
  /** Human-readable lines about what the room did together (§34 Phase 7). */
  communityAccomplishments: string[];
}

export interface RouteInfo {
  id: string;
  name: string;
  description: string;
  difficulty: Task["difficulty"];
  stageCount: number;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type Command =
  | { type: "startGame" }
  | { type: "chooseRoute"; routeId: string }
  | { type: "presentTask" }
  | { type: "spendInsight"; effect: InsightEffectType }
  | { type: "spendProvision" }
  | { type: "spendCourage" }
  | { type: "useJourneyToken"; effect: JourneyTokenEffectType }
  | { type: "acceptAnswer" }
  | { type: "reveal" }
  | { type: "rule"; result: TaskResult }
  | { type: "acceptRecover" }
  | { type: "declineRecover" }
  | { type: "finishTeaching" }
  | { type: "keepSurplus"; resource: ResourceType }
  | { type: "offerSurplus" }
  | { type: "chooseGrantedResource"; teamId: string; resource: ResourceType }
  | { type: "beginCommunityEvent" }
  | { type: "relayAnswer"; teamId: string; correct: boolean }
  | { type: "contribute"; teamId: string; resource: ResourceType; amount: number }
  | { type: "declineContribution"; teamId: string }
  | { type: "resolveCommunityEvent" }
  | { type: "shareGrantedResource"; teamId: string; toTeamId: string }
  | { type: "undo" };

// ---------------------------------------------------------------------------
// Internal (undo-tracked) runtime state
// ---------------------------------------------------------------------------

interface TaskInProgress {
  task: Task;
  teamId: string;
  stageId: string;
  activeVariantKind: TaskVariantKind;
  eliminatedOptions: string[];
  cluesRevealedCount: number;
  revealed: boolean;
  resourcesSpent: Partial<Record<ResourceType, number>>;
  usedJourneyToken: boolean;
  lastSuccessesAwarded: number;
  isRecoveryAttempt: boolean;
}

interface PendingChoice {
  teamId: string;
  amount: number;
  reason: string;
  // A gift (from shareGrantedResource) cannot itself be re-shared — no
  // infinite Service loops. Every other grant is shareable.
  shareable: boolean;
}

interface CommunityEventRuntime {
  eventId: string;
  roomProgress: number;
  pledgedTotal: number;
  // Contribution events only: per-team running pledge total, for the
  // exceptional-contribution Service award at resolve time.
  pledgedByTeam: Record<string, number>;
  // Relay events only (PHASE9_SPEC Group N1): the shared task drawn from
  // nextCommunityTask(), or null when the source has none for this
  // category (ArrayTaskSource in many tests). Undo-tracked for free via
  // dispatch()'s structuredClone snapshot.
  task: Task | null;
}

interface EngineState {
  session: PlaySession;
  currentTask: TaskInProgress | null;
  pendingReplacement: Task | null;
  pendingSurplus: number;
  pendingCommunityEventId: string | null;
  community: CommunityEventRuntime | null;
  pendingChoices: PendingChoice[];
  nextCommunityEventBoosted: boolean;
  stageReductions: Record<string, number>;
  pendingClueFlags: Record<string, number>;
  tasksThisTurn: number;
  turnHadFailureOrSkip: boolean;
  // Repeatable community events (journey.communityEvents[].repeatable):
  // which teams have already triggered each event id, so it fires once
  // per team's first arrival instead of once per game.
  repeatableArrivals: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export interface GameEngine {
  dispatch(command: Command): GameState;
  canUndo(): boolean;

  getState(): GameState;
  getSession(): Readonly<PlaySession>;
  getTeam(id: string): Readonly<TeamState> | undefined;
  getCurrentTaskPublic(): PublicTask | null;
  getRevealedAnswer(): RevealedAnswer | null;
  getCommunityTaskPublic(): CommunityTaskPublic | null;
  getAvailableRoutes(): RouteInfo[] | null;
  getEffectiveStageRequirement(teamId: string): number | null;
  getPendingSurplus(): number;
  getPendingChoicesForTeam(teamId: string): number;
  getPendingChoiceDetailsForTeam(teamId: string): { amount: number; reason: string; shareable: boolean }[];
  getStagesBehindLeader(teamId: string): number;
  getConfig(): Readonly<GameDefaults>;
  getSummary(): GameSummary | null;
  statusText(): string;
  allPositionsText(): string;
}

const MAX_UNDO_HISTORY = 20;

export function createEngine(options: EngineOptions): GameEngine {
  return new Engine(options);
}

class Engine implements GameEngine {
  private readonly journey: Journey;
  private readonly packs: ContentPack[];
  private readonly rng: Rng;
  private readonly taskSource: TaskSource;
  private readonly turnTaskLimit: number;
  private readonly config: GameDefaults;

  private state: EngineState;
  private history: EngineState[] = [];

  constructor(options: EngineOptions) {
    if (options.teams.length < 2 || options.teams.length > 8) {
      throw new Error(`createEngine: team count must be 2-8, got ${options.teams.length}`);
    }
    const ids = new Set(options.teams.map((t) => t.id));
    if (ids.size !== options.teams.length) {
      throw new Error("createEngine: team ids must be unique");
    }
    if (options.turnTaskLimit < 1) {
      throw new Error("createEngine: turnTaskLimit must be at least 1");
    }

    this.journey = options.journey;
    this.packs = options.packs;
    this.rng = options.rng;
    this.taskSource = options.taskSource;
    this.turnTaskLimit = options.turnTaskLimit;
    this.config = { ...DEFAULTS, ...options.config };

    const firstEntry = this.journey.entries[0] as JourneyEntry;
    const startingResources = options.startingResources ?? { insight: 0, provision: 0, courage: 0 };
    const teams: TeamState[] = options.teams.map((t) => {
      const base: TeamState = {
        id: t.id,
        name: t.name,
        color: t.color,
        symbol: t.symbol,
        currentMilestoneId: this.journey.startMilestoneId,
        currentStageId: firstEntry.kind === "stage" ? firstEntry.id : "",
        stageSuccesses: 0,
        resources: { ...startingResources },
        hasJourneyToken: false,
        serviceScore: 0,
        stagesBeyondMilestone: 0,
      };
      return base;
    });
    if (firstEntry.kind === "fork") {
      for (const team of teams) team.pendingForkId = firstEntry.id;
    }

    const session: PlaySession = {
      id: `session-${this.journey.journeyId}`,
      schemaVersion: 1,
      journeyId: this.journey.journeyId,
      journeyVersion: this.journey.version,
      contentPackVersions: Object.fromEntries(this.packs.map((p) => [p.packId, p.version])),
      seed: "", // caller-controlled seed identity lives with the Rng; not tracked redundantly here
      teams,
      activeTeamIndex: 0,
      state: "ready",
      turnTaskLimit: this.turnTaskLimit,
      triggeredMilestones: [],
      taskHistory: [],
      eventLog: [],
      finishedTeamIds: [],
      roundNumber: 0,
      finishRoundNumber: null,
    };

    this.state = {
      session,
      currentTask: null,
      pendingReplacement: null,
      pendingSurplus: 0,
      pendingCommunityEventId: null,
      community: null,
      pendingChoices: [],
      nextCommunityEventBoosted: false,
      stageReductions: {},
      pendingClueFlags: {},
      tasksThisTurn: 0,
      turnHadFailureOrSkip: false,
      repeatableArrivals: {},
    };
  }

  // -- dispatch --------------------------------------------------------------

  dispatch(command: Command): GameState {
    const before = structuredClone(this.state);
    try {
      this.applyCommand(command);
    } catch (err) {
      this.state = before;
      throw err;
    }
    this.history.push(before);
    if (this.history.length > MAX_UNDO_HISTORY) this.history.shift();
    return this.state.session.state;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  private applyCommand(command: Command): void {
    switch (command.type) {
      case "startGame":
        return this.cmdStartGame();
      case "chooseRoute":
        return this.cmdChooseRoute(command.routeId);
      case "presentTask":
        return this.cmdPresentTask();
      case "spendInsight":
        return this.cmdSpendInsight(command.effect);
      case "spendProvision":
        return this.cmdSpendProvision();
      case "spendCourage":
        return this.cmdSpendCourage();
      case "useJourneyToken":
        return this.cmdUseJourneyToken(command.effect);
      case "acceptAnswer":
        return this.cmdAcceptAnswer();
      case "reveal":
        return this.cmdReveal();
      case "rule":
        return this.cmdRule(command.result);
      case "acceptRecover":
        return this.cmdAcceptRecover();
      case "declineRecover":
        return this.cmdDeclineRecover();
      case "finishTeaching":
        return this.cmdFinishTeaching();
      case "keepSurplus":
        return this.cmdKeepSurplus(command.resource);
      case "offerSurplus":
        return this.cmdOfferSurplus();
      case "chooseGrantedResource":
        return this.cmdChooseGrantedResource(command.teamId, command.resource);
      case "beginCommunityEvent":
        return this.cmdBeginCommunityEvent();
      case "relayAnswer":
        return this.cmdRelayAnswer(command.teamId, command.correct);
      case "contribute":
        return this.cmdContribute(command.teamId, command.resource, command.amount);
      case "declineContribution":
        return this.cmdDeclineContribution(command.teamId);
      case "resolveCommunityEvent":
        return this.cmdResolveCommunityEvent();
      case "shareGrantedResource":
        return this.cmdShareGrantedResource(command.teamId, command.toTeamId);
      case "undo":
        return this.cmdUndo();
    }
  }

  // -- small guards ------------------------------------------------------

  private requireState(command: string, expected: GameState): void {
    if (this.state.session.state !== expected) {
      throw new IllegalCommandError(
        command,
        `requires state "${expected}", currently "${this.state.session.state}"`,
      );
    }
  }

  private requireCurrentTask(command: string): TaskInProgress {
    if (!this.state.currentTask) {
      throw new IllegalCommandError(command, "no task is currently in progress");
    }
    return this.state.currentTask;
  }

  private currentTeam(): TeamState {
    const team = this.state.session.teams[this.state.session.activeTeamIndex];
    if (!team) throw new Error("Engine: activeTeamIndex out of range");
    return team;
  }

  private getTeamByIdOrThrow(command: string, teamId: string): TeamState {
    const team = this.state.session.teams.find((t) => t.id === teamId);
    if (!team) throw new IllegalCommandError(command, `unknown team "${teamId}"`);
    return team;
  }

  private log(text: string): void {
    const event: GameEvent = { timestamp: new Date().toISOString(), text };
    this.state.session.eventLog.push(event);
  }

  // -- resource helpers ----------------------------------------------------

  private awardResource(team: TeamState, resource: ResourceType, amount: number): void {
    const cap = this.config.resourceCap;
    const room = Math.max(0, cap - team.resources[resource]);
    const granted = Math.min(amount, room);
    team.resources[resource] += granted;
    if (granted < amount) {
      this.log(
        `Team ${team.name}'s ${resource} is already full; ${amount - granted} discarded.`,
      );
    } else {
      this.log(`Team ${team.name} receives ${granted} ${resource}.`);
    }
  }

  private deductResource(command: string, team: TeamState, resource: ResourceType, amount: number): void {
    if (team.resources[resource] < amount) {
      throw new IllegalCommandError(
        command,
        `Team ${team.name} has ${team.resources[resource]} ${resource}, needs ${amount}`,
      );
    }
    team.resources[resource] -= amount;
  }

  private awardService(team: TeamState, amount: number): void {
    team.serviceScore += amount;
    this.log(`Team ${team.name} earns ${amount} Service.`);
  }

  private queuePendingChoice(teamId: string, amount: number, reason: string, shareable = true): void {
    this.state.pendingChoices.push({ teamId, amount, reason, shareable });
  }

  private grantOrQueueChoice(
    team: TeamState,
    resource: ResourceType | "choice",
    amount: number,
    reason: string,
  ): void {
    if (resource === "choice") {
      this.queuePendingChoice(team.id, amount, reason);
      this.log(`Team ${team.name} may choose a resource (${reason}).`);
    } else {
      this.awardResource(team, resource, amount);
    }
  }

  // -- journey structure helpers -------------------------------------------

  private findStage(stageId: string): StageEntry {
    for (const entry of this.journey.entries) {
      if (entry.kind === "stage" && entry.id === stageId) return entry;
      if (entry.kind === "fork") {
        for (const route of entry.routes) {
          const stage = route.stages.find((s) => s.id === stageId);
          if (stage) return stage;
        }
      }
    }
    throw new Error(`Engine: unknown stage id "${stageId}"`);
  }

  private nextEntryAfter(stageId: string): JourneyEntry | null {
    const topIdx = this.journey.entries.findIndex((e) => e.kind === "stage" && e.id === stageId);
    if (topIdx >= 0) {
      return (this.journey.entries[topIdx + 1] as JourneyEntry | undefined) ?? null;
    }
    for (const entry of this.journey.entries) {
      if (entry.kind !== "fork") continue;
      for (const route of entry.routes) {
        const sIdx = route.stages.findIndex((s) => s.id === stageId);
        if (sIdx < 0) continue;
        if (sIdx < route.stages.length - 1) {
          return route.stages[sIdx + 1] as unknown as JourneyEntry;
        }
        const forkIdx = this.journey.entries.indexOf(entry);
        return (this.journey.entries[forkIdx + 1] as JourneyEntry | undefined) ?? null;
      }
    }
    throw new Error(`Engine: stage "${stageId}" not found in journey`);
  }

  getEffectiveStageRequirement(teamId: string): number | null {
    const team = this.state.session.teams.find((t) => t.id === teamId);
    if (!team) return null;
    const stage = this.findStage(team.currentStageId);
    const reduction = this.state.stageReductions[teamId] ?? 0;
    return Math.max(1, stage.requiredSuccesses - reduction);
  }

  // -- catch-up (§10-12, PHASE7_SPEC "Stage ordinal and 'stages behind'") ----

  /** The index of the top-level journey.entries item containing a team's
   * current stage — a fork's own index for any of its route stages (so
   * choosing the longer route never counts as "further along"), or
   * entries.length for a team that has finished the journey. */
  private stageOrdinal(team: TeamState): number {
    if (this.state.session.finishedTeamIds.includes(team.id)) {
      return this.journey.entries.length;
    }
    const stageId = team.currentStageId;
    const topIdx = this.journey.entries.findIndex((e) => e.kind === "stage" && e.id === stageId);
    if (topIdx >= 0) return topIdx;
    const forkIdx = this.journey.entries.findIndex(
      (e) => e.kind === "fork" && e.routes.some((r) => r.stages.some((s) => s.id === stageId)),
    );
    return forkIdx >= 0 ? forkIdx : 0;
  }

  getStagesBehindLeader(teamId: string): number {
    const team = this.state.session.teams.find((t) => t.id === teamId);
    if (!team) return 0;
    const maxOrdinal = Math.max(...this.state.session.teams.map((t) => this.stageOrdinal(t)));
    return Math.max(0, maxOrdinal - this.stageOrdinal(team));
  }

  /** Called on a community event's SUCCESS only (a failed event grants
   * nothing); the leader (0 stages behind) never qualifies. */
  private applyCatchUp(): void {
    if (!this.config.catchUp.enabled) return;
    const { stagesBehind, bonus } = this.config.catchUp;
    for (const team of this.state.session.teams) {
      const behind = this.getStagesBehindLeader(team.id);
      if (behind <= stagesBehind) continue;
      this.grantOrQueueChoice(team, bonus.resource, bonus.amount, "catch-up");
      if (bonus.resource === "choice") {
        this.log(`Catch-up: Team ${team.name} is ${behind} stages behind and may choose ${bonus.amount} resource.`);
      } else {
        this.log(`Catch-up: Team ${team.name} is ${behind} stages behind and receives ${bonus.amount} ${bonus.resource}.`);
      }
    }
  }

  // -- turn lifecycle --------------------------------------------------------

  private cmdStartGame(): void {
    this.requireState("startGame", "ready");
    this.state.session.roundNumber = 1;
    this.beginTeamTurn();
  }

  private beginTeamTurn(): void {
    const team = this.currentTeam();
    this.state.tasksThisTurn = 0;
    this.state.turnHadFailureOrSkip = false;
    this.log(`Team ${team.name} begins its turn.`);
    if (team.pendingForkId) {
      this.state.session.state = "forkChoice";
    } else {
      this.state.session.state = "beginTurn";
    }
  }

  getAvailableRoutes(): RouteInfo[] | null {
    if (this.state.session.state !== "forkChoice") return null;
    const team = this.currentTeam();
    const forkId = team.pendingForkId;
    const fork = this.journey.entries.find(
      (e): e is ForkEntry => e.kind === "fork" && e.id === forkId,
    );
    if (!fork) return null;
    return fork.routes.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      difficulty: r.difficulty,
      stageCount: r.stages.length,
    }));
  }

  private cmdChooseRoute(routeId: string): void {
    this.requireState("chooseRoute", "forkChoice");
    const team = this.currentTeam();
    const forkId = team.pendingForkId;
    const fork = this.journey.entries.find(
      (e): e is ForkEntry => e.kind === "fork" && e.id === forkId,
    );
    if (!fork) throw new IllegalCommandError("chooseRoute", "no fork is awaiting a choice");
    const route = fork.routes.find((r) => r.id === routeId);
    if (!route) throw new IllegalCommandError("chooseRoute", `unknown route "${routeId}"`);
    team.selectedRouteId = routeId;
    team.pendingForkId = undefined;
    const firstStage = route.stages[0];
    if (!firstStage) throw new Error("Engine: route has no stages");
    team.currentStageId = firstStage.id;
    team.stageSuccesses = 0;
    this.log(`Team ${team.name} chooses the ${route.name}.`);
    this.state.session.state = "beginTurn";
  }

  private cmdPresentTask(): void {
    this.requireState("presentTask", "beginTurn");
    const team = this.currentTeam();
    if (this.state.tasksThisTurn >= this.turnTaskLimit) {
      throw new IllegalCommandError("presentTask", "task limit reached for this turn");
    }
    const task = this.taskSource.nextTask(team.id, team.currentStageId);
    this.state.tasksThisTurn++;
    const ct: TaskInProgress = {
      task,
      teamId: team.id,
      stageId: team.currentStageId,
      activeVariantKind: "normal",
      eliminatedOptions: [],
      cluesRevealedCount: 0,
      revealed: false,
      resourcesSpent: {},
      usedJourneyToken: false,
      lastSuccessesAwarded: 0,
      isRecoveryAttempt: false,
    };
    const bonus = this.state.pendingClueFlags[team.id] ?? 0;
    if (bonus > 0 && task.clues.length > 0) {
      ct.cluesRevealedCount = 1;
      this.state.pendingClueFlags[team.id] = bonus - 1;
      this.log(`Team ${team.name} receives a free clue from an earlier gift.`);
    }
    this.state.currentTask = ct;
    this.state.session.state = "resourceWindow";
    this.log(`Team ${team.name} is presented a ${task.category} task.`);
  }

  // -- resource spending -----------------------------------------------------

  private activeVariant(ct: TaskInProgress) {
    if (ct.activeVariantKind === "assisted") return ct.task.assistedVariant!;
    if (ct.activeVariantKind === "amplified") return ct.task.amplifiedVariant!;
    return ct.task.normalVariant;
  }

  private isCorrectOption(ct: TaskInProgress, optionText: string): boolean {
    const v = this.activeVariant(ct);
    const pool =
      ct.activeVariantKind === "amplified" && ct.task.amplifiedVariant
        ? [ct.task.amplifiedVariant.answer, ...ct.task.amplifiedVariant.acceptedAnswers]
        : [ct.task.answer, ...ct.task.acceptedAnswers];
    void v;
    return pool.some((a) => a.toLowerCase() === optionText.toLowerCase());
  }

  private applyExtraClue(command: string, ct: TaskInProgress): void {
    if (ct.cluesRevealedCount >= ct.task.clues.length) {
      throw new IllegalCommandError(command, "no more clues for this task");
    }
    ct.cluesRevealedCount++;
  }

  private applyEliminateOption(command: string, ct: TaskInProgress): void {
    const variant = this.activeVariant(ct);
    if (!variant.options) {
      throw new IllegalCommandError(command, "this task has no multiple-choice options");
    }
    const remaining = variant.options.filter((o) => !ct.eliminatedOptions.includes(o));
    if (remaining.length <= 2) {
      throw new IllegalCommandError(command, "cannot eliminate further with only two options left");
    }
    const wrongRemaining = remaining.filter((o) => !this.isCorrectOption(ct, o));
    if (wrongRemaining.length === 0) {
      throw new IllegalCommandError(command, "no incorrect option left to eliminate");
    }
    const chosen = pickOne(this.rng, wrongRemaining);
    ct.eliminatedOptions.push(chosen);
  }

  private applyAssist(command: string, ct: TaskInProgress): { resource: ResourceType; amount: number } | null {
    if (ct.activeVariantKind !== "normal") {
      throw new IllegalCommandError(command, "the task's form has already changed");
    }
    if (!ct.task.assistedVariant) {
      throw new IllegalCommandError(command, "this task has no assisted form");
    }
    ct.activeVariantKind = "assisted";
    return ct.task.assistedVariant.cost;
  }

  private applyAmplify(command: string, ct: TaskInProgress): { resource: ResourceType; amount: number } | null {
    if (ct.activeVariantKind !== "normal") {
      throw new IllegalCommandError(command, "the task's form has already changed");
    }
    if (!ct.task.amplifiedVariant) {
      throw new IllegalCommandError(command, "this task has no amplified form");
    }
    ct.activeVariantKind = "amplified";
    return ct.task.amplifiedVariant.cost;
  }

  private recordSpend(ct: TaskInProgress, resource: ResourceType, amount: number): void {
    ct.resourcesSpent[resource] = (ct.resourcesSpent[resource] ?? 0) + amount;
  }

  private cmdSpendInsight(effect: InsightEffectType): void {
    this.requireState("spendInsight", "resourceWindow");
    const ct = this.requireCurrentTask("spendInsight");
    const team = this.currentTeam();
    if (!ct.task.resourceInteractions.insight) {
      throw new IllegalCommandError("spendInsight", "Insight does not interact with this task");
    }
    const cost = this.config.insightEffectCost;
    switch (effect) {
      case "extra-clue":
        this.applyExtraClue("spendInsight", ct);
        this.deductResource("spendInsight", team, "insight", cost);
        this.recordSpend(ct, "insight", cost);
        this.log(`Team ${team.name} spends Insight for an extra clue.`);
        return;
      case "eliminate-option":
        this.applyEliminateOption("spendInsight", ct);
        this.deductResource("spendInsight", team, "insight", cost);
        this.recordSpend(ct, "insight", cost);
        this.log(`Team ${team.name} spends Insight to eliminate an option.`);
        return;
      case "replay":
        this.deductResource("spendInsight", team, "insight", cost);
        this.recordSpend(ct, "insight", cost);
        this.log(`Team ${team.name} spends Insight to replay the task.`);
        return;
    }
  }

  private cmdSpendProvision(): void {
    this.requireState("spendProvision", "resourceWindow");
    const ct = this.requireCurrentTask("spendProvision");
    const team = this.currentTeam();
    if (!ct.task.resourceInteractions.provision) {
      throw new IllegalCommandError("spendProvision", "Provision does not interact with this task");
    }
    const cost = this.applyAssist("spendProvision", ct);
    if (cost) {
      this.deductResource("spendProvision", team, cost.resource, cost.amount);
      this.recordSpend(ct, cost.resource, cost.amount);
    }
    this.log(`Team ${team.name} spends Provision for the assisted form.`);
  }

  private cmdSpendCourage(): void {
    this.requireState("spendCourage", "resourceWindow");
    const ct = this.requireCurrentTask("spendCourage");
    const team = this.currentTeam();
    if (!ct.task.resourceInteractions.courage) {
      throw new IllegalCommandError("spendCourage", "Courage does not interact with this task");
    }
    const cost = this.applyAmplify("spendCourage", ct);
    if (cost) {
      this.deductResource("spendCourage", team, cost.resource, cost.amount);
      this.recordSpend(ct, cost.resource, cost.amount);
    }
    this.log(`Team ${team.name} spends Courage to amplify the task.`);
  }

  private cmdUseJourneyToken(effect: JourneyTokenEffectType): void {
    this.requireState("useJourneyToken", "resourceWindow");
    const ct = this.requireCurrentTask("useJourneyToken");
    const team = this.currentTeam();
    if (!team.hasJourneyToken) {
      throw new IllegalCommandError("useJourneyToken", "team does not hold a Journey Token");
    }
    switch (effect) {
      case "extra-clue":
        if (!ct.task.resourceInteractions.insight) {
          throw new IllegalCommandError("useJourneyToken", "Insight does not interact with this task");
        }
        this.applyExtraClue("useJourneyToken", ct);
        break;
      case "eliminate-option":
        if (!ct.task.resourceInteractions.insight) {
          throw new IllegalCommandError("useJourneyToken", "Insight does not interact with this task");
        }
        this.applyEliminateOption("useJourneyToken", ct);
        break;
      case "replay":
        if (!ct.task.resourceInteractions.insight) {
          throw new IllegalCommandError("useJourneyToken", "Insight does not interact with this task");
        }
        break;
      case "assist":
        if (!ct.task.resourceInteractions.provision) {
          throw new IllegalCommandError("useJourneyToken", "Provision does not interact with this task");
        }
        this.applyAssist("useJourneyToken", ct);
        break;
      case "amplify":
        if (!ct.task.resourceInteractions.courage) {
          throw new IllegalCommandError("useJourneyToken", "Courage does not interact with this task");
        }
        this.applyAmplify("useJourneyToken", ct);
        break;
    }
    ct.usedJourneyToken = true;
    team.hasJourneyToken = false;
    this.log(`Team ${team.name} spends its Journey Token.`);
  }

  // -- answer / reveal / ruling ----------------------------------------------

  private cmdAcceptAnswer(): void {
    this.requireState("acceptAnswer", "resourceWindow");
    this.requireCurrentTask("acceptAnswer");
    const team = this.currentTeam();
    this.log(`Team ${team.name} gives its final answer.`);
    this.state.session.state = "awaitingAnswer";
  }

  private cmdReveal(): void {
    this.requireState("reveal", "awaitingAnswer");
    const ct = this.requireCurrentTask("reveal");
    ct.revealed = true;
    this.state.session.state = "answerReveal";
    this.log("The official answer is revealed.");
  }

  private cmdRule(result: TaskResult): void {
    this.requireState("rule", "answerReveal");
    const ct = this.requireCurrentTask("rule");
    const team = this.getTeamByIdOrThrow("rule", ct.teamId);
    const variant = this.activeVariant(ct);
    const successes = result === "correct" ? variant.successValue : 0;

    this.state.session.taskHistory.push({
      taskId: ct.task.id,
      teamId: ct.teamId,
      variant: ct.activeVariantKind,
      result,
      successesAwarded: successes,
      resourcesSpent: { ...ct.resourcesSpent },
      usedJourneyToken: ct.usedJourneyToken,
    });
    this.log(`Team ${team.name}'s answer is ruled ${result}: ${successes} success(es).`);
    ct.lastSuccessesAwarded = successes;

    if (result !== "correct") this.state.turnHadFailureOrSkip = true;

    if (result === "incorrect") {
      const affordable =
        ct.task.resourceInteractions.provision &&
        team.resources.provision >= this.config.recoverCostProvision;
      if (affordable) {
        const replacement = this.taskSource.nextReplacement(ct.task.category, ct.task.difficulty);
        if (replacement) {
          this.state.pendingReplacement = replacement;
          this.state.session.state = "recoverDecision";
          return;
        }
      }
    }
    this.state.session.state = "teachingReveal";
  }

  private cmdAcceptRecover(): void {
    this.requireState("acceptRecover", "recoverDecision");
    const ct = this.requireCurrentTask("acceptRecover");
    const team = this.getTeamByIdOrThrow("acceptRecover", ct.teamId);
    const replacement = this.state.pendingReplacement;
    if (!replacement) throw new IllegalCommandError("acceptRecover", "no replacement task is available");
    this.deductResource("acceptRecover", team, "provision", this.config.recoverCostProvision);
    this.state.pendingReplacement = null;
    this.state.currentTask = {
      task: replacement,
      teamId: ct.teamId,
      stageId: ct.stageId,
      activeVariantKind: "normal",
      eliminatedOptions: [],
      cluesRevealedCount: 0,
      revealed: false,
      resourcesSpent: {},
      usedJourneyToken: false,
      lastSuccessesAwarded: 0,
      isRecoveryAttempt: true,
    };
    this.log(`Team ${team.name} spends Provision to recover with a new task.`);
    this.state.session.state = "resourceWindow";
  }

  private cmdDeclineRecover(): void {
    this.requireState("declineRecover", "recoverDecision");
    const ct = this.requireCurrentTask("declineRecover");
    const team = this.getTeamByIdOrThrow("declineRecover", ct.teamId);
    this.state.pendingReplacement = null;
    this.log(`Team ${team.name} declines to recover.`);
    this.state.session.state = "teachingReveal";
  }

  // -- teaching / progress resolution ----------------------------------------

  private cmdFinishTeaching(): void {
    this.requireState("finishTeaching", "teachingReveal");
    const ct = this.requireCurrentTask("finishTeaching");
    const team = this.getTeamByIdOrThrow("finishTeaching", ct.teamId);

    if (ct.lastSuccessesAwarded > 0) {
      team.stageSuccesses += ct.lastSuccessesAwarded;
    }

    const required = this.getEffectiveStageRequirement(team.id)!;
    this.state.currentTask = null;

    if (team.stageSuccesses >= required) {
      const surplus = team.stageSuccesses - required;
      team.stageSuccesses = required;
      const perfect = !this.state.turnHadFailureOrSkip;
      if (perfect && !team.hasJourneyToken) {
        team.hasJourneyToken = true;
        this.log(`Team ${team.name} earns a Journey Token for a perfect stage.`);
      }
      delete this.state.stageReductions[team.id];
      this.state.pendingSurplus = surplus;
      if (surplus > 0) {
        this.state.session.state = "surplusDecision";
      } else {
        this.finalizeStageCompletion(team);
      }
    } else if (this.state.tasksThisTurn < this.turnTaskLimit) {
      this.state.session.state = "beginTurn";
    } else {
      this.log(
        `Team ${team.name}'s turn ends. ${team.stageSuccesses} of ${required} successes toward the stage.`,
      );
      this.endTurnAndAdvance();
    }
  }

  private finalizeStageCompletion(team: TeamState): void {
    const { resource, amount } = this.config.stageCompletionReward;
    if (amount > 0) {
      this.grantOrQueueChoice(team, resource, amount, "a stage reward");
    }
    const stage = this.findStage(team.currentStageId);
    let eventTriggered = false;
    if (stage.arrivesAtMilestoneId) {
      eventTriggered = this.arriveAtMilestone(team, stage.arrivesAtMilestoneId);
    } else {
      team.stagesBeyondMilestone += 1;
    }
    this.advanceTeamToNextEntry(team, stage);
    if (!eventTriggered) {
      this.endTurnAndAdvance();
    }
  }

  private arriveAtMilestone(team: TeamState, milestoneId: string): boolean {
    const milestone = this.journey.milestones.find((m) => m.id === milestoneId);
    this.log(`Team ${team.name} has reached ${milestone?.name ?? milestoneId}.`);
    team.currentMilestoneId = milestoneId;
    team.stagesBeyondMilestone = 0;
    const event = this.journey.communityEvents.find((e) => e.milestoneId === milestoneId);
    if (!event) return false;

    if (event.repeatable) {
      const arrivals = this.state.repeatableArrivals[event.id] ?? [];
      if (arrivals.includes(team.id)) return false;
      this.state.repeatableArrivals[event.id] = [...arrivals, team.id];
    } else if (this.state.session.triggeredMilestones.includes(milestoneId)) {
      return false;
    }
    // triggeredMilestones records every trigger, including repeats — its
    // consumer (communityProgress.ts) reads only the LAST entry to find
    // the currently-active event, so duplicates are harmless.
    this.state.session.triggeredMilestones.push(milestoneId);
    this.state.pendingCommunityEventId = event.id;
    this.state.session.state = "landmarkIntroduction";
    return true;
  }

  private advanceTeamToNextEntry(team: TeamState, justCompleted: StageEntry): void {
    const next = this.nextEntryAfter(justCompleted.id);
    if (next === null) {
      if (!this.state.session.finishedTeamIds.includes(team.id)) {
        this.state.session.finishedTeamIds.push(team.id);
        this.log(`Team ${team.name} has completed the journey!`);
        if (this.state.session.finishRoundNumber === null) {
          this.state.session.finishRoundNumber = this.state.session.roundNumber;
        }
      }
      team.pendingForkId = undefined;
      return;
    }
    if (next.kind === "fork") {
      team.pendingForkId = next.id;
    } else {
      team.currentStageId = next.id;
      team.stageSuccesses = 0;
      team.pendingForkId = undefined;
    }
  }

  // -- surplus -----------------------------------------------------------

  private cmdKeepSurplus(resource: ResourceType): void {
    this.requireState("keepSurplus", "surplusDecision");
    if (this.state.pendingSurplus <= 0) {
      throw new IllegalCommandError("keepSurplus", "no surplus remaining to resolve");
    }
    const team = this.currentTeam();
    this.awardResource(team, resource, 1);
    this.state.pendingSurplus--;
    if (this.state.pendingSurplus === 0) this.finalizeStageCompletion(team);
  }

  private cmdOfferSurplus(): void {
    this.requireState("offerSurplus", "surplusDecision");
    if (this.state.pendingSurplus <= 0) {
      throw new IllegalCommandError("offerSurplus", "no surplus remaining to resolve");
    }
    const team = this.currentTeam();
    const outcome = drawOfferingOutcome(this.rng, this.config.offeringWeights, this.journey.offeringOutcomes);
    // Log order matters: the UI joins every voiced line from one render
    // into a single announcement, so the offering must be heard before
    // the Service it earned ("offers … / effect … / earns 1 Service"),
    // not the other way round.
    const summary = this.applyOfferingEffect(team, outcome);
    this.log(`Team ${team.name} offers a surplus success: ${outcome.announcement}`);
    this.log(`Offering effect: ${summary}`);
    this.awardService(team, this.config.serviceAwards.offerSurplus);
    this.state.pendingSurplus--;
    if (this.state.pendingSurplus === 0) this.finalizeStageCompletion(team);
  }

  /** Applies the outcome's mechanical effect (unchanged from before Phase
   * 7 — every existing log line here stands verbatim) and returns a
   * human summary of what actually happened, for the new "Offering
   * effect: …" log line. */
  private applyOfferingEffect(team: TeamState, outcome: OfferingOutcomeDef): string {
    const effect: OfferingEffect = outcome.effect;
    const grantSummary = (targetLabel: string, resource: ResourceType | "choice", amount: number): string =>
      resource === "choice"
        ? `${targetLabel} may choose ${amount} resource.`
        : `${targetLabel} receives ${amount} ${resource}.`;
    switch (effect.type) {
      case "grant-resource": {
        if (effect.target === "offering-team") {
          this.grantOrQueueChoice(team, effect.resource, effect.amount, "an offering");
          return grantSummary(`Team ${team.name}`, effect.resource, effect.amount);
        } else if (effect.target === "every-team") {
          for (const t of this.state.session.teams) {
            this.grantOrQueueChoice(t, effect.resource, effect.amount, "an offering");
          }
          return grantSummary("Every team", effect.resource, effect.amount);
        } else {
          const others = this.state.session.teams.filter((t) => t.id !== team.id);
          if (others.length > 0) {
            const target = pickOne(this.rng, others);
            this.grantOrQueueChoice(target, effect.resource, effect.amount, "an offering");
            return grantSummary(`Team ${target.name}`, effect.resource, effect.amount);
          }
          return "No further effect.";
        }
      }
      case "reveal-next-stage-info":
        this.log(`Team ${team.name} learns about its next stage.`);
        return this.describeNextStageFor(team);
      case "grant-clue-next-task": {
        const target =
          effect.target === "offering-team"
            ? team
            : (() => {
                const others = this.state.session.teams.filter((t) => t.id !== team.id);
                return others.length > 0 ? pickOne(this.rng, others) : team;
              })();
        this.state.pendingClueFlags[target.id] = (this.state.pendingClueFlags[target.id] ?? 0) + 1;
        return `Team ${target.name} will receive a free clue on its next task.`;
      }
      case "boost-next-community-event":
        this.state.nextCommunityEventBoosted = true;
        return "The next community event's reward is strengthened.";
      case "none":
        return "No further effect.";
    }
  }

  /** What actually comes next for a team's position — the real content
   * behind "reveal-next-stage-info" (previously only logged that the
   * team "learns about" it, without saying what). */
  private describeNextStageFor(team: TeamState): string {
    const stage = this.findStage(team.currentStageId);
    const next = this.nextEntryAfter(stage.id);
    if (next === null) return `Team ${team.name} is on the final stretch.`;
    if (next.kind === "fork") return `Team ${team.name}'s road divides next at ${next.name}.`;
    return `Team ${team.name}'s next stage is ${next.name}, needing ${next.requiredSuccesses} successes.`;
  }

  private cmdChooseGrantedResource(teamId: string, resource: ResourceType): void {
    const idx = this.state.pendingChoices.findIndex((c) => c.teamId === teamId);
    if (idx < 0) {
      throw new IllegalCommandError("chooseGrantedResource", `no pending choice for team "${teamId}"`);
    }
    const choice = this.state.pendingChoices[idx]!;
    this.state.pendingChoices.splice(idx, 1);
    const team = this.getTeamByIdOrThrow("chooseGrantedResource", teamId);
    this.awardResource(team, resource, choice.amount);
  }

  // -- milestones & community events -----------------------------------------

  private cmdBeginCommunityEvent(): void {
    this.requireState("beginCommunityEvent", "landmarkIntroduction");
    const eventId = this.state.pendingCommunityEventId;
    if (!eventId) throw new IllegalCommandError("beginCommunityEvent", "no community event is pending");
    const event = this.journey.communityEvents.find((e) => e.id === eventId);
    const task = event?.kind === "relay" ? this.taskSource.nextCommunityTask(event.taskCategory) : null;
    this.state.community = { eventId, roomProgress: 0, pledgedTotal: 0, pledgedByTeam: {}, task };
    this.state.pendingCommunityEventId = null;
    this.state.session.state = "communityEvent";
    this.log(`The room begins ${event?.title ?? eventId}.`);
  }

  private currentEvent(): CommunityEventDef {
    const id = this.state.community?.eventId;
    const event = this.journey.communityEvents.find((e) => e.id === id);
    if (!event) throw new Error("Engine: no active community event");
    return event;
  }

  private cmdRelayAnswer(teamId: string, correct: boolean): void {
    this.requireState("relayAnswer", "communityEvent");
    const event = this.currentEvent();
    if (event.kind !== "relay") {
      throw new IllegalCommandError("relayAnswer", "the active community event is not a relay");
    }
    this.getTeamByIdOrThrow("relayAnswer", teamId);
    if (correct) this.state.community!.roomProgress++;
    this.log(`Team ${this.getTeamByIdOrThrow("relayAnswer", teamId).name} answers for the room: ${correct ? "correct" : "incorrect"}.`);
  }

  private cmdContribute(teamId: string, resource: ResourceType, amount: number): void {
    this.requireState("contribute", "communityEvent");
    const event = this.currentEvent();
    if (event.kind !== "contribution") {
      throw new IllegalCommandError("contribute", "the active community event is not a contribution");
    }
    if (amount < 1) throw new IllegalCommandError("contribute", "amount must be at least 1");
    if (!event.acceptedResources.includes(resource)) {
      throw new IllegalCommandError("contribute", `this event does not accept ${resource}`);
    }
    const team = this.getTeamByIdOrThrow("contribute", teamId);
    this.deductResource("contribute", team, resource, amount);
    this.state.community!.pledgedTotal += amount;
    this.state.community!.pledgedByTeam[teamId] = (this.state.community!.pledgedByTeam[teamId] ?? 0) + amount;
    this.awardService(team, this.config.serviceAwards.donateResource);
    this.log(`Team ${team.name} contributes ${amount} ${resource}.`);
  }

  private cmdDeclineContribution(teamId: string): void {
    this.requireState("declineContribution", "communityEvent");
    const team = this.getTeamByIdOrThrow("declineContribution", teamId);
    this.log(`Team ${team.name} declines to contribute.`);
  }

  private cmdResolveCommunityEvent(): void {
    this.requireState("resolveCommunityEvent", "communityEvent");
    const event = this.currentEvent();
    const community = this.state.community!;
    const success =
      event.kind === "relay"
        ? community.roomProgress >= event.successThreshold
        : community.pledgedTotal >= event.contributionThreshold;

    if (success) {
      this.applyRoomReward(event.reward);
      this.log(`The room succeeds at ${event.title}.`);
      this.applyCatchUp();
    } else {
      this.log(`The room does not meet the goal for ${event.title}.`);
    }

    if (event.kind === "relay" && community.task) {
      // No forced trailing period: `answer` is authored as a complete,
      // punctuated phrase (matches screens.ts's own `Answer: ${answer}`).
      this.log(`Community answer: ${community.task.answer}`);
      this.log(community.task.teachingReveal);
    }

    // Exceptional contributions (success OR failure — the generosity
    // happened regardless of whether the room met its goal).
    if (event.kind === "contribution") {
      const exceptionalThreshold = Math.max(
        this.config.community.exceptionalMinimum,
        Math.ceil(this.config.community.exceptionalShare * event.contributionThreshold),
      );
      for (const [teamId, pledged] of Object.entries(community.pledgedByTeam)) {
        if (pledged < exceptionalThreshold) continue;
        const team = this.getTeamByIdOrThrow("resolveCommunityEvent", teamId);
        this.awardService(team, this.config.serviceAwards.exceptionalCommunityContribution);
        this.log(`Team ${team.name} made an exceptional contribution.`);
      }
    }

    this.state.nextCommunityEventBoosted = false;
    this.state.community = null;
    this.endTurnAndAdvance();
  }

  // -- sharing a granted resource (§11 "voluntarily sharing an eligible reward") --

  private cmdShareGrantedResource(teamId: string, toTeamId: string): void {
    if (teamId === toTeamId) {
      throw new IllegalCommandError("shareGrantedResource", "cannot share a gift with yourself");
    }
    const team = this.getTeamByIdOrThrow("shareGrantedResource", teamId);
    const toTeam = this.getTeamByIdOrThrow("shareGrantedResource", toTeamId);
    const idx = this.state.pendingChoices.findIndex((c) => c.teamId === teamId && c.shareable);
    if (idx < 0) {
      throw new IllegalCommandError("shareGrantedResource", `no shareable pending choice for team "${teamId}"`);
    }
    const choice = this.state.pendingChoices[idx]!;
    this.state.pendingChoices.splice(idx, 1);
    this.queuePendingChoice(toTeamId, choice.amount, `a gift from Team ${team.name}`, false);
    this.awardService(team, this.config.serviceAwards.chooseCommunityBenefit);
    this.log(`Team ${team.name} shares its gift with Team ${toTeam.name}.`);
  }

  private applyRoomReward(reward: RoomReward): void {
    const boosted = this.state.nextCommunityEventBoosted;
    if (reward.type === "grant-resource-every-team") {
      const amount = boosted ? reward.amount + 1 : reward.amount;
      for (const t of this.state.session.teams) {
        this.grantOrQueueChoice(t, reward.resource, amount, "a community event");
      }
    } else if (reward.type === "reduce-next-stage-requirement") {
      const amount = boosted ? reward.amount + 1 : reward.amount;
      for (const t of this.state.session.teams) {
        this.state.stageReductions[t.id] = (this.state.stageReductions[t.id] ?? 0) + amount;
      }
    }
  }

  // -- endgame -----------------------------------------------------------

  private endTurnAndAdvance(): void {
    this.state.currentTask = null;
    const teamCount = this.state.session.teams.length;
    this.state.session.activeTeamIndex = (this.state.session.activeTeamIndex + 1) % teamCount;
    if (this.state.session.activeTeamIndex === 0) {
      this.state.session.roundNumber++;
    }
    const finishRound = this.state.session.finishRoundNumber;
    if (finishRound !== null && this.state.session.roundNumber > finishRound) {
      this.state.session.state = "gameSummary";
      this.log("The game has ended.");
      return;
    }
    this.beginTeamTurn();
  }

  private compareTeamPositions = (a: TeamState, b: TeamState): number => {
    const milestoneIndex = (t: TeamState) =>
      this.journey.milestones.findIndex((m) => m.id === t.currentMilestoneId);
    const mi = milestoneIndex(b) - milestoneIndex(a);
    if (mi !== 0) return mi;
    if (a.stagesBeyondMilestone !== b.stagesBeyondMilestone) {
      return b.stagesBeyondMilestone - a.stagesBeyondMilestone;
    }
    if (a.stageSuccesses !== b.stageSuccesses) return b.stageSuccesses - a.stageSuccesses;
    const sum = (t: TeamState) => t.resources.insight + t.resources.provision + t.resources.courage;
    return sum(b) - sum(a);
  };

  getPendingSurplus(): number {
    return this.state.pendingSurplus;
  }

  /** Count of outstanding "choice" resource grants awaiting chooseGrantedResource for this team. */
  getPendingChoicesForTeam(teamId: string): number {
    return this.state.pendingChoices.filter((c) => c.teamId === teamId).length;
  }

  getPendingChoiceDetailsForTeam(teamId: string): { amount: number; reason: string; shareable: boolean }[] {
    return this.state.pendingChoices
      .filter((c) => c.teamId === teamId)
      .map((c) => ({ amount: c.amount, reason: c.reason, shareable: c.shareable }));
  }

  getConfig(): Readonly<GameDefaults> {
    return this.config;
  }

  /** Human lines about what the room did together (§34 Phase 7), derived
   * from the event log so undo naturally keeps them accurate. Omits any
   * category that never happened. */
  private buildCommunityAccomplishments(): string[] {
    const log = this.state.session.eventLog;
    const lines: string[] = [];

    for (const entry of log) {
      const m = /^The room succeeds at (.+)\.$/.exec(entry.text);
      if (m) lines.push(`The room succeeded at ${m[1]}.`);
    }
    for (const entry of log) {
      const m = /^The room does not meet the goal for (.+)\.$/.exec(entry.text);
      if (m) lines.push(`The room fell short at ${m[1]}.`);
    }

    // These are read aloud at the end of the game, so they are grammatical
    // (PHASE7_SPEC's literal templates were singular-blind; OPEN_QUESTIONS 28).
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

    const offerCount = log.filter((e) => /^Team .+ offers a surplus success: /.test(e.text)).length;
    if (offerCount > 0) {
      lines.push(`${offerCount} surplus ${plural(offerCount, "success was", "successes were")} offered.`);
    }

    const pledgedTotal = log.reduce((sum, e) => {
      const m = /^Team .+ contributes (\d+) (?:insight|provision|courage)\.$/.exec(e.text);
      return m ? sum + Number(m[1]) : sum;
    }, 0);
    if (pledgedTotal > 0) {
      lines.push(`${pledgedTotal} ${plural(pledgedTotal, "resource was", "resources were")} pledged to community events.`);
    }

    for (const entry of log) {
      if (/^Team .+ made an exceptional contribution\.$/.test(entry.text)) lines.push(entry.text);
    }

    const shareCount = log.filter((e) => /^Team .+ shares its gift with Team /.test(e.text)).length;
    if (shareCount > 0) lines.push(`${shareCount} ${plural(shareCount, "gift was", "gifts were")} shared between teams.`);

    return lines;
  }

  getSummary(): GameSummary | null {
    if (this.state.session.state !== "gameSummary") return null;
    const teams = this.state.session.teams;
    const maxService = Math.max(...teams.map((t) => t.serviceScore));
    const barnabasAwardRecipients = teams
      .filter((t) => t.serviceScore === maxService)
      .map((t) => t.id);
    const finalPositions = [...teams].sort(this.compareTeamPositions).map((t) => t.id);
    return {
      journeyWinners: [...this.state.session.finishedTeamIds],
      barnabasAwardRecipients,
      finalPositions,
      serviceAwardName: this.config.serviceAwardPublicName,
      communityAccomplishments: this.buildCommunityAccomplishments(),
    };
  }

  // -- undo -----------------------------------------------------------

  private cmdUndo(): void {
    if (this.history.length === 0) {
      throw new IllegalCommandError("undo", "nothing to undo");
    }
    this.state = this.history.pop()!;
  }

  // -- read API -----------------------------------------------------------

  getState(): GameState {
    return this.state.session.state;
  }

  getSession(): Readonly<PlaySession> {
    return structuredClone(this.state.session);
  }

  getTeam(id: string): Readonly<TeamState> | undefined {
    const team = this.state.session.teams.find((t) => t.id === id);
    return team ? structuredClone(team) : undefined;
  }

  getCurrentTaskPublic(): PublicTask | null {
    const ct = this.state.currentTask;
    if (!ct) return null;
    const v = this.activeVariant(ct);
    return {
      id: ct.task.id,
      category: ct.task.category,
      difficulty: ct.task.difficulty,
      title: ct.task.title,
      activeVariant: {
        kind: ct.activeVariantKind,
        prompt: v.prompt,
        options: v.options?.filter((o) => !ct.eliminatedOptions.includes(o)),
        successValue: v.successValue,
      },
      cluesRevealed: ct.task.clues.slice(0, ct.cluesRevealedCount),
      cluesRemaining: ct.task.clues.length - ct.cluesRevealedCount,
      canAssist:
        ct.activeVariantKind === "normal" &&
        !!ct.task.assistedVariant &&
        ct.task.resourceInteractions.provision,
      canAmplify:
        ct.activeVariantKind === "normal" &&
        !!ct.task.amplifiedVariant &&
        ct.task.resourceInteractions.courage,
      canEliminateOption:
        !!v.options &&
        v.options.length - ct.eliminatedOptions.length > 2 &&
        ct.task.resourceInteractions.insight,
      canExtraClue: ct.cluesRevealedCount < ct.task.clues.length && ct.task.resourceInteractions.insight,
      isRecoveryAttempt: ct.isRecoveryAttempt,
    };
  }

  getRevealedAnswer(): RevealedAnswer | null {
    const ct = this.state.currentTask;
    if (!ct || !ct.revealed) return null;
    if (ct.activeVariantKind === "amplified" && ct.task.amplifiedVariant) {
      return {
        answer: ct.task.amplifiedVariant.answer,
        acceptedAnswers: ct.task.amplifiedVariant.acceptedAnswers,
        hostGuidance: ct.task.hostGuidance,
      };
    }
    return {
      answer: ct.task.answer,
      acceptedAnswers: ct.task.acceptedAnswers,
      hostGuidance: ct.task.hostGuidance,
    };
  }

  getCommunityTaskPublic(): CommunityTaskPublic | null {
    const task = this.state.community?.task;
    if (!task) return null;
    return {
      id: task.id,
      title: task.title,
      prompt: task.normalVariant.prompt,
      hostGuidance: task.hostGuidance,
    };
  }

  statusText(): string {
    const team = this.currentTeam();
    const stage = this.findStage(team.currentStageId);
    const required = this.getEffectiveStageRequirement(team.id) ?? stage.requiredSuccesses;
    const tasksRemaining = Math.max(0, this.turnTaskLimit - this.state.tasksThisTurn);
    const parts = [
      `Team ${team.name}.`,
      `Currently on ${stage.name}.`,
      `${team.stageSuccesses} of ${required} successes.`,
      `${tasksRemaining} task${tasksRemaining === 1 ? "" : "s"} remaining this turn.`,
      `Insight ${team.resources.insight}.`,
      `Provision ${team.resources.provision}.`,
      `Courage ${team.resources.courage}.`,
      team.hasJourneyToken ? "Holding a Journey Token." : "No Journey Token.",
      `Service ${team.serviceScore}.`,
    ];
    return parts.join(" ");
  }

  allPositionsText(): string {
    const lines = this.state.session.teams.map((team) => {
      const milestone = this.journey.milestones.find((m) => m.id === team.currentMilestoneId);
      const name = milestone?.name ?? team.currentMilestoneId;
      if (team.stagesBeyondMilestone === 0) {
        return `Team ${team.name} has reached ${name}.`;
      }
      return `Team ${team.name} is traveling beyond ${name}.`;
    });
    return lines.join(" ");
  }
}
