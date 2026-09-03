// PHASE10_SPEC Group X1 — the simulation harness. Plays one complete game
// headlessly against the REAL engine and a real SessionDeck, with
// probabilistic rulings and explicit per-team policies. Deterministic for a
// given seed. Ships in the repo but is never imported by src/ui or main.ts,
// so Vite tree-shakes it out of the production bundle.
//
// SECRECY: this file and everything downstream of it (report.ts, the sim/
// audit tests) must never print a task's prompt, answer, or any other
// secret field — only ids and counts. See CONTENT_AUTHORING.md §1 and
// PHASE10_SPEC.md's "Secrecy" section.

import type { ContentPack, Journey, Task } from "../content/schemas";
import { createEngine, type GameEngine } from "../engine/engine";
import { createRng, type Rng } from "../engine/rng";
import type { ResourceType } from "../engine/types";
import { buildSessionDeck, SessionBuildError, type DeckDifficultySetting } from "../session/builder";
import { recommendedTasksPerTurn, planSession } from "../session/plan";
import { communityProgress } from "../ui/communityProgress";
import {
  CAUTIOUS,
  computeSuccessProbability,
  DEFAULT_SUCCESS_MODEL,
  type SuccessModel,
  type TeamPolicy,
  type VariantKind,
} from "./policy";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SimulateOptions {
  journey: Journey;
  packs: ContentPack[];
  teamCount: number;
  seed: string;
  difficulty?: DeckDifficultySetting;
  turnTaskLimit?: number;
  /** One policy for every team, or an array with exactly `teamCount` entries. */
  policies?: TeamPolicy | TeamPolicy[];
  successModel?: SuccessModel;
  /** A game that doesn't finish inside this many loop steps is a defect. */
  maxSteps?: number;
}

export type GrantSource =
  | "stageReward"
  | "communityEvent"
  | "offering"
  | "surplusKept"
  | "catchUp"
  | "sharingReceived"
  | "other";

export type SpendUse = "clue" | "eliminate" | "assist" | "amplify" | "recover" | "contribute" | "offered";

export interface CommunityEventResult {
  id: string;
  kind: "relay" | "contribution";
  success: boolean;
  pledged: number;
  threshold: number;
  exceptionalAwards: number;
}

export interface TeamSimResult {
  id: string;
  seat: number;
  policy: string;
  finished: boolean;
  resourcesEnd: Record<ResourceType, number>;
  resourcesGrantedBySource: Partial<Record<GrantSource, number>>;
  resourcesSpentByUse: Partial<Record<SpendUse, number>>;
  capDiscards: number;
  serviceScore: number;
  journeyTokenEarned: boolean;
  routesChosen: string[];
  attemptsByVariant: Record<VariantKind, number>;
  recoverUses: number;
  surplusKept: number;
  surplusOffered: number;
  catchUpGrants: number;
}

export interface SimResult {
  seed: string;
  teamCount: number;
  difficulty: DeckDifficultySetting;
  turnTaskLimit: number;
  policies: string[];
  rounds: number;
  turns: number;
  attempts: number;
  steps: number;
  taskIds: string[];
  distinctTasks: number;
  illegalCommands: number;
  exhausted: { round: number; message: string } | null;
  winners: string[];
  finalPositions: string[];
  sharedVictory: boolean;
  teams: TeamSimResult[];
  communityEvents: CommunityEventResult[];
  variantAttempts: Record<VariantKind, number>;
  modeledMinutes: number;
  plannedMinutes: number;
  plannedRounds: number;
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const RESOURCE_ORDER: ResourceType[] = ["insight", "provision", "courage"];

function leastHeldResource(resources: Record<ResourceType, number>): ResourceType {
  let best = RESOURCE_ORDER[0]!;
  for (const r of RESOURCE_ORDER) if (resources[r] < resources[best]) best = r;
  return best;
}

function mostHeldEligibleResource(
  resources: Record<ResourceType, number>,
  eligible: readonly ResourceType[],
): ResourceType | null {
  let best: ResourceType | null = null;
  for (const r of RESOURCE_ORDER) {
    if (!eligible.includes(r)) continue;
    if (resources[r] <= 0) continue;
    if (best === null || resources[r] > resources[best]) best = r;
  }
  return best;
}

type JourneyEntry = Journey["entries"][number];
type RouteDef = Extract<JourneyEntry, { kind: "fork" }>["routes"][number];

function findRouteInJourney(journey: Journey, routeId: string): RouteDef | undefined {
  for (const entry of journey.entries) {
    if (entry.kind !== "fork") continue;
    const route = entry.routes.find((r) => r.id === routeId);
    if (route) return route;
  }
  return undefined;
}

function bump<K extends string>(rec: Partial<Record<K, number>>, key: K, amount = 1): void {
  rec[key] = (rec[key] ?? 0) + amount;
}

function emptyTeamResult(id: string, seat: number, policyName: string): TeamSimResult {
  return {
    id,
    seat,
    policy: policyName,
    finished: false,
    resourcesEnd: { insight: 0, provision: 0, courage: 0 },
    resourcesGrantedBySource: {},
    resourcesSpentByUse: {},
    capDiscards: 0,
    serviceScore: 0,
    journeyTokenEarned: false,
    routesChosen: [],
    attemptsByVariant: { normal: 0, assisted: 0, amplified: 0 },
    recoverUses: 0,
    surplusKept: 0,
    surplusOffered: 0,
    catchUpGrants: 0,
  };
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

export function simulateGame(options: SimulateOptions): SimResult {
  const { journey, packs, teamCount, seed } = options;
  if (teamCount < 2 || teamCount > 8) {
    throw new Error(`simulateGame: teamCount must be 2-8, got ${teamCount}`);
  }
  const difficulty = options.difficulty ?? "standard";
  const turnTaskLimit = options.turnTaskLimit ?? recommendedTasksPerTurn(teamCount);
  const maxSteps = options.maxSteps ?? 20000;
  const model = options.successModel ?? DEFAULT_SUCCESS_MODEL;

  const teams = Array.from({ length: teamCount }, (_, i) => ({
    id: `sim-t${i}`,
    name: `Team ${i}`,
    color: "#000000",
    symbol: "cross",
  }));

  const singlePolicy = Array.isArray(options.policies) ? null : (options.policies ?? CAUTIOUS);
  const policyList: TeamPolicy[] = Array.isArray(options.policies)
    ? options.policies
    : Array.from({ length: teamCount }, () => singlePolicy!);
  if (policyList.length !== teamCount) {
    throw new Error(`simulateGame: policies has ${policyList.length} entries, teamCount is ${teamCount}`);
  }
  const policyByTeamId = new Map(teams.map((t, i) => [t.id, policyList[i]!]));

  const tasksById = new Map<string, Task>();
  for (const pack of packs) for (const task of pack.tasks) tasksById.set(task.id, task);

  const simRng: Rng = createRng(`${seed}:sim`);

  interface TeamRuntime {
    windowResolved: "cautious" | "bold" | null;
    surplusNextIsOffer: boolean;
    shareNext: boolean;
    result: TeamSimResult;
  }
  const runtime = new Map<string, TeamRuntime>();
  teams.forEach((t, i) => {
    runtime.set(t.id, {
      windowResolved: null,
      surplusNextIsOffer: true,
      shareNext: true,
      result: emptyTeamResult(t.id, i, policyByTeamId.get(t.id)!.name),
    });
  });

  const taskIds: string[] = [];
  let illegalCommands = 0;
  let attemptsCount = 0;
  let turnsCount = 0;
  let estimatedSecondsSum = 0;
  const communityEventResults: CommunityEventResult[] = [];
  const variantAttempts: Record<VariantKind, number> = { normal: 0, assisted: 0, amplified: 0 };

  const resolveGrantSource = (reason: string): GrantSource => {
    if (reason === "a stage reward") return "stageReward";
    if (reason === "a community event") return "communityEvent";
    if (reason === "an offering") return "offering";
    if (reason === "catch-up") return "catchUp";
    if (reason.startsWith("a gift from ")) return "sharingReceived";
    return "other";
  };

  const resolveWindow = (policy: TeamPolicy, rt: TeamRuntime): "passive" | "cautious" | "bold" => {
    if (policy.window !== "mixed") return policy.window;
    if (rt.windowResolved === null) rt.windowResolved = simRng.next() < 0.5 ? "cautious" : "bold";
    return rt.windowResolved;
  };

  const resolvePendingChoices = (engine: GameEngine): void => {
    for (const t of teams) {
      const rt = runtime.get(t.id)!;
      const policy = policyByTeamId.get(t.id)!;
      let guard = 0;
      while (engine.getPendingChoicesForTeam(t.id) > 0 && guard < 20) {
        guard++;
        const details = engine.getPendingChoiceDetailsForTeam(t.id)[0]!;
        if (policy.grantedChoice === "sharer" && details.shareable && rt.shareNext) {
          rt.shareNext = false;
          const others = teams.filter((o) => o.id !== t.id);
          let target = others[0]!;
          for (const cand of others) {
            if (engine.getStagesBehindLeader(cand.id) > engine.getStagesBehindLeader(target.id)) target = cand;
          }
          try {
            engine.dispatch({ type: "shareGrantedResource", teamId: t.id, toTeamId: target.id });
          } catch {
            illegalCommands++;
            break;
          }
          continue;
        }
        if (policy.grantedChoice === "sharer" && details.shareable) rt.shareNext = true;
        const team = engine.getTeam(t.id)!;
        const resource = leastHeldResource(team.resources);
        try {
          engine.dispatch({ type: "chooseGrantedResource", teamId: t.id, resource });
          bump(rt.result.resourcesGrantedBySource, resolveGrantSource(details.reason), details.amount);
        } catch {
          illegalCommands++;
          break;
        }
      }
    }
  };

  const applyResourceWindow = (engine: GameEngine, teamId: string): { clueUsed: boolean; variantKind: VariantKind } => {
    const policy = policyByTeamId.get(teamId)!;
    const rt = runtime.get(teamId)!;
    const config = engine.getConfig();
    let clueUsed = false;

    const before = engine.getCurrentTaskPublic()!;
    const task = tasksById.get(before.id)!;

    if (policy.journeyToken === "useOnHard") {
      const team = engine.getTeam(teamId)!;
      if (team.hasJourneyToken && before.difficulty === "hard" && before.canExtraClue) {
        try {
          engine.dispatch({ type: "useJourneyToken", effect: "extra-clue" });
          clueUsed = true;
        } catch {
          illegalCommands++;
        }
      }
    }

    const window = resolveWindow(policy, rt);

    if (window === "bold") {
      const pt = engine.getCurrentTaskPublic()!;
      if (pt.canAmplify && task.amplifiedVariant) {
        const cost = task.amplifiedVariant.cost;
        const team = engine.getTeam(teamId)!;
        if (team.resources[cost.resource] >= cost.amount) {
          try {
            engine.dispatch({ type: "spendCourage" });
            bump(rt.result.resourcesSpentByUse, "amplify", cost.amount);
          } catch {
            illegalCommands++;
          }
        }
      }
    }

    if (window === "cautious" || window === "bold") {
      let pt = engine.getCurrentTaskPublic()!;
      if (pt.activeVariant.kind === "normal") {
        if (pt.difficulty === "hard" && !clueUsed && pt.canExtraClue) {
          const team = engine.getTeam(teamId)!;
          if (team.resources.insight >= config.insightEffectCost) {
            try {
              engine.dispatch({ type: "spendInsight", effect: "extra-clue" });
              bump(rt.result.resourcesSpentByUse, "clue", config.insightEffectCost);
              clueUsed = true;
            } catch {
              illegalCommands++;
            }
          }
        }
        pt = engine.getCurrentTaskPublic()!;
        if (pt.difficulty === "hard" && pt.canAssist && task.assistedVariant) {
          const cost = task.assistedVariant.cost;
          const team = engine.getTeam(teamId)!;
          if (team.resources[cost.resource] >= cost.amount) {
            try {
              engine.dispatch({ type: "spendProvision" });
              bump(rt.result.resourcesSpentByUse, "assist", cost.amount);
            } catch {
              illegalCommands++;
            }
          }
        }
      }
    }

    const final = engine.getCurrentTaskPublic()!;
    // A clue may already have been showing (a free clue from an earlier
    // gift, PHASE9's grant-clue-next-task offering) even if this attempt's
    // own spending didn't add one — the success model's "an extra clue
    // revealed this attempt" bonus applies either way.
    if (final.cluesRevealed.length > 0) clueUsed = true;

    engine.dispatch({ type: "acceptAnswer" });
    return { clueUsed, variantKind: final.activeVariant.kind };
  };

  const cheapestRouteId = (routes: { id: string; difficulty: Task["difficulty"] }[]): string => {
    let bestId = routes[0]!.id;
    let bestCost = Infinity;
    for (const r of routes) {
      const route = findRouteInJourney(journey, r.id);
      const total = route ? route.stages.reduce((s, st) => s + st.requiredSuccesses, 0) : 1;
      const cost = total / model.base[r.difficulty];
      if (cost < bestCost) {
        bestCost = cost;
        bestId = r.id;
      }
    }
    return bestId;
  };

  let exhausted: { round: number; message: string } | null = null;
  let steps = 0;
  let engine: GameEngine | null = null;

  try {
    const { deck } = buildSessionDeck({
      journey,
      packs,
      teamIds: teams.map((t) => t.id),
      turnTaskLimit,
      seed,
      difficulty,
    });
    engine = createEngine({
      journey,
      packs,
      teams,
      turnTaskLimit,
      rng: createRng(seed),
      taskSource: deck,
    });

    engine.dispatch({ type: "startGame" });
    turnsCount++; // the very first turn

    while (engine.getState() !== "gameSummary") {
      steps++;
      if (steps > maxSteps) {
        throw new Error(`simulateGame: exceeded maxSteps (${maxSteps}), stuck in state "${engine.getState()}"`);
      }
      resolvePendingChoices(engine);
      const state = engine.getState();

      if (state === "forkChoice") {
        const session = engine.getSession();
        const teamId = session.teams[session.activeTeamIndex]!.id;
        const policy = policyByTeamId.get(teamId)!;
        const routes = engine.getAvailableRoutes()!;
        let routeId: string;
        if (policy.route === "first") routeId = routes[0]!.id;
        else if (policy.route === "cheapest") routeId = cheapestRouteId(routes);
        else routeId = routes[Math.floor(simRng.next() * routes.length)]!.id;
        engine.dispatch({ type: "chooseRoute", routeId });
        runtime.get(teamId)!.result.routesChosen.push(routeId);
        continue;
      }

      if (state === "beginTurn") {
        engine.dispatch({ type: "presentTask" });
        continue;
      }

      if (state === "resourceWindow") {
        const session = engine.getSession();
        const teamId = session.teams[session.activeTeamIndex]!.id;
        const before = engine.getCurrentTaskPublic()!;
        estimatedSecondsSum += tasksById.get(before.id)?.estimatedSeconds ?? 45;
        taskIds.push(before.id);
        applyResourceWindow(engine, teamId);
        continue;
      }

      if (state === "awaitingAnswer") {
        engine.dispatch({ type: "reveal" });
        continue;
      }

      if (state === "answerReveal") {
        const session = engine.getSession();
        const teamId = session.teams[session.activeTeamIndex]!.id;
        const pt = engine.getCurrentTaskPublic()!;
        const clueUsed = pt.cluesRevealed.length > 0;
        const probability = computeSuccessProbability(model, pt.difficulty, pt.activeVariant.kind, clueUsed, false);
        const skipRoll = simRng.next();
        const result = skipRoll < model.skipChance ? "skipped" : simRng.next() < probability ? "correct" : "incorrect";
        engine.dispatch({ type: "rule", result });
        attemptsCount++;
        const rt = runtime.get(teamId)!;
        bump(rt.result.attemptsByVariant, pt.activeVariant.kind);
        bump(variantAttempts, pt.activeVariant.kind);
        continue;
      }

      if (state === "recoverDecision") {
        const session = engine.getSession();
        const teamId = session.teams[session.activeTeamIndex]!.id;
        const policy = policyByTeamId.get(teamId)!;
        if (policy.recover === "always") {
          const config = engine.getConfig();
          engine.dispatch({ type: "acceptRecover" });
          const rt = runtime.get(teamId)!;
          rt.result.recoverUses++;
          bump(rt.result.resourcesSpentByUse, "recover", config.recoverCostProvision);
          // The replacement task's id and estimatedSeconds are recorded by
          // the ordinary "resourceWindow" branch on the next loop
          // iteration (acceptRecover lands back in resourceWindow with a
          // new currentTask) — pushing here too would double-count it.
        } else {
          engine.dispatch({ type: "declineRecover" });
        }
        continue;
      }

      if (state === "teachingReveal") {
        engine.dispatch({ type: "finishTeaching" });
        if (engine.getState() === "beginTurn" || engine.getState() === "forkChoice") turnsCount++;
        continue;
      }

      if (state === "surplusDecision") {
        const session = engine.getSession();
        const teamId = session.teams[session.activeTeamIndex]!.id;
        const policy = policyByTeamId.get(teamId)!;
        const rt = runtime.get(teamId)!;
        let offer: boolean;
        if (policy.surplus === "offer") offer = true;
        else if (policy.surplus === "keepLeast") offer = false;
        else {
          offer = rt.surplusNextIsOffer;
          rt.surplusNextIsOffer = !rt.surplusNextIsOffer;
        }
        if (offer) {
          engine.dispatch({ type: "offerSurplus" });
          rt.result.surplusOffered++;
          bump(rt.result.resourcesSpentByUse, "offered");
        } else {
          const team = engine.getTeam(teamId)!;
          const resource = leastHeldResource(team.resources);
          engine.dispatch({ type: "keepSurplus", resource });
          rt.result.surplusKept++;
          bump(rt.result.resourcesGrantedBySource, "surplusKept");
        }
        if (engine.getState() === "beginTurn" || engine.getState() === "forkChoice") turnsCount++;
        continue;
      }

      if (state === "landmarkIntroduction") {
        engine.dispatch({ type: "beginCommunityEvent" });
        const communityTask = engine.getCommunityTaskPublic();
        if (communityTask) taskIds.push(communityTask.id);
        continue;
      }

      if (state === "communityEvent") {
        const eventId = journey.communityEvents.find(
          (e) => e.milestoneId === engine!.getSession().triggeredMilestones.at(-1),
        )?.id;
        const event = journey.communityEvents.find((e) => e.id === eventId);
        if (!event) throw new Error("simulateGame: active community event not found in journey");

        if (event.kind === "relay") {
          const progress = communityProgress(engine, journey)!;
          const communityTask = engine.getCommunityTaskPublic();
          const taskDifficulty = communityTask ? tasksById.get(communityTask.id)?.difficulty ?? "moderate" : "moderate";
          const probability = model.base[taskDifficulty];
          for (const t of teams) {
            if (progress.answeredTeamIds.includes(t.id)) continue;
            const correct = simRng.next() < probability;
            engine.dispatch({ type: "relayAnswer", teamId: t.id, correct });
          }
        } else {
          let pledgedTotal = communityProgress(engine, journey)!.pledgedTotal;
          for (const t of teams) {
            const policy = policyByTeamId.get(t.id)!;
            const rt = runtime.get(t.id)!;
            if (policy.contribution === "hoarder") {
              engine.dispatch({ type: "declineContribution", teamId: t.id });
              continue;
            }
            const team = engine.getTeam(t.id)!;
            const remaining = Math.max(0, event.contributionThreshold - pledgedTotal);
            const resource = mostHeldEligibleResource(team.resources, event.acceptedResources);
            const config = engine.getConfig();
            const amount = resource
              ? Math.min(team.resources[resource], remaining, config.community.maxPledgePerTeam)
              : 0;
            if (resource && amount >= 1) {
              engine.dispatch({ type: "contribute", teamId: t.id, resource, amount });
              bump(rt.result.resourcesSpentByUse, "contribute", amount);
              pledgedTotal += amount;
            } else {
              engine.dispatch({ type: "declineContribution", teamId: t.id });
            }
          }
        }

        const community = communityProgress(engine, journey)!;
        engine.dispatch({ type: "resolveCommunityEvent" });
        const successNow =
          event.kind === "relay" ? community.roomProgress >= event.successThreshold : community.pledgedTotal >= event.contributionThreshold;
        communityEventResults.push({
          id: event.id,
          kind: event.kind,
          success: successNow,
          pledged: event.kind === "contribution" ? community.pledgedTotal : 0,
          threshold: event.kind === "relay" ? event.successThreshold : event.contributionThreshold,
          exceptionalAwards: 0, // filled from the final log below
        });
        if (engine.getState() === "beginTurn" || engine.getState() === "forkChoice") turnsCount++;
        continue;
      }

      throw new Error(`simulateGame: unhandled state "${state}"`);
    }
  } catch (err) {
    if (err instanceof SessionBuildError) {
      const round = engine ? engine.getSession().roundNumber : 0;
      exhausted = { round, message: err.message };
    } else {
      throw err;
    }
  }

  // -- final pass over the event log for counters that are simplest to
  // derive after the fact, rather than instrumented at every dispatch site --
  const idByName = new Map(teams.map((t) => [t.name, t.id]));
  let milestoneArrivals = 0;
  if (engine) {
    const log = engine.getSession().eventLog;
    for (const entry of log) {
      if (/^Team .+ has reached .+\.$/.test(entry.text)) milestoneArrivals++;

      let m = /^Team (.+)'s \w+ is already full; \d+ discarded\.$/.exec(entry.text);
      if (m) {
        const id = idByName.get(m[1]!);
        if (id) runtime.get(id)!.result.capDiscards++;
      }

      m = /^Team (.+) earns a Journey Token for a perfect stage\.$/.exec(entry.text);
      if (m) {
        const id = idByName.get(m[1]!);
        if (id) runtime.get(id)!.result.journeyTokenEarned = true;
      }

      m = /^Catch-up: Team (.+) is \d+ stages behind/.exec(entry.text);
      if (m) {
        const id = idByName.get(m[1]!);
        if (id) runtime.get(id)!.result.catchUpGrants++;
      }

      m = /^Team (.+) made an exceptional contribution\.$/.exec(entry.text);
      if (m) {
        const last = communityEventResults[communityEventResults.length - 1];
        // Attribute to the most recently resolved event; exceptional-
        // contribution lines are logged inside cmdResolveCommunityEvent,
        // immediately before the next event's own "begins" line, so the
        // last-pushed result is always the correct target.
        if (last) last.exceptionalAwards++;
      }
    }
  }

  const teamResults: TeamSimResult[] = teams.map((t) => {
    const rt = runtime.get(t.id)!;
    if (engine) {
      const team = engine.getTeam(t.id)!;
      rt.result.resourcesEnd = { ...team.resources };
      rt.result.serviceScore = team.serviceScore;
      rt.result.finished = engine.getSummary()?.journeyWinners.includes(t.id) ?? false;
    }
    return rt.result;
  });

  const summary = engine?.getSummary() ?? null;
  const modeledSeconds =
    estimatedSecondsSum +
    turnsCount * 50 +
    attemptsCount * 15 +
    milestoneArrivals * 25 +
    communityEventResults.length * 180 +
    300;

  const plan = planSession({ journey, teamCount, duration: "standard", pace: "standard" });

  return {
    seed,
    teamCount,
    difficulty,
    turnTaskLimit,
    policies: policyList.map((p) => p.name),
    rounds: engine ? engine.getSession().roundNumber : 0,
    turns: turnsCount,
    attempts: attemptsCount,
    steps,
    taskIds,
    distinctTasks: new Set(taskIds).size,
    illegalCommands,
    exhausted,
    winners: summary?.journeyWinners ?? [],
    finalPositions: summary?.finalPositions ?? [],
    sharedVictory: (summary?.journeyWinners.length ?? 0) > 1,
    teams: teamResults,
    communityEvents: communityEventResults,
    variantAttempts,
    modeledMinutes: modeledSeconds / 60,
    plannedMinutes: plan.estimatedMinutes,
    plannedRounds: plan.estimatedRounds,
  };
}
