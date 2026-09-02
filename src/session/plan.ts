// planSession (PHASE3_SPEC "planSession"). Pure function wrapping the
// Phase 2 estimator with real setup-time numbers: duration targets, pace,
// the recommended tasks-per-turn table (§36), and the journey's total
// required successes (summing stages, averaging fork routes — a team only
// ever travels one route, so the EXPECTED cost is the mean, not the sum).

import type { Journey } from "../content/schemas";
import { estimateMinutes } from "../engine/estimator";

export type SessionDuration = "short" | "standard" | "long" | { customMinutes: number };
export type SessionPace = "relaxed" | "standard" | "quick";

export interface PlanOptions {
  journey: Journey;
  teamCount: number;
  duration: SessionDuration;
  pace: SessionPace;
}

export interface SessionPlan {
  targetMinutes: number;
  estimatedMinutes: number;
  estimatedRounds: number;
  recommendedTasksPerTurn: number;
  totalRequiredSuccesses: number;
  communityEventCount: number;
  warnings: string[];
}

const DURATION_TARGET_MINUTES: Record<"short" | "standard" | "long", number> = {
  short: 40,
  standard: 55,
  long: 75,
};

// Scales avgTaskSeconds; turnOverheadSeconds stays at the estimator's
// corrected default (50s) — see OPEN_QUESTIONS item 11.
const PACE_AVG_TASK_SECONDS: Record<SessionPace, number> = {
  relaxed: 55,
  standard: 45,
  quick: 35,
};

// §36 tasksPerTurn, by team count.
export function recommendedTasksPerTurn(teamCount: number): number {
  if (teamCount <= 2) return 4;
  if (teamCount <= 5) return 3;
  return 2;
}

/**
 * Sums every top-level stage's requiredSuccesses; for a fork, adds the
 * MEAN of its routes' total requirements (a route's total = the sum of
 * requiredSuccesses across that route's own stages), rounded to nearest.
 * A team commits to exactly one route, so the expected journey cost is the
 * average across the choices available to them, not the sum of all of them.
 */
export function totalRequiredSuccesses(journey: Journey): number {
  let total = 0;
  for (const entry of journey.entries) {
    if (entry.kind === "stage") {
      total += entry.requiredSuccesses;
      continue;
    }
    const routeTotals = entry.routes.map((route) =>
      route.stages.reduce((sum, stage) => sum + stage.requiredSuccesses, 0),
    );
    const mean = routeTotals.reduce((a, b) => a + b, 0) / routeTotals.length;
    total += Math.round(mean);
  }
  return total;
}

export function planSession(options: PlanOptions): SessionPlan {
  const { journey, teamCount, duration, pace } = options;

  let targetMinutes: number;
  if (typeof duration === "string") {
    targetMinutes = DURATION_TARGET_MINUTES[duration];
  } else {
    if (duration.customMinutes < 15 || duration.customMinutes > 180) {
      throw new Error(
        `planSession: customMinutes must be between 15 and 180, got ${duration.customMinutes}`,
      );
    }
    targetMinutes = duration.customMinutes;
  }

  const tasksPerTurn = recommendedTasksPerTurn(teamCount);
  const total = totalRequiredSuccesses(journey);
  const communityEventCount = journey.communityEvents.length;

  const { estimatedRounds, estimatedMinutes } = estimateMinutes({
    teamCount,
    tasksPerTurn,
    totalRequiredSuccesses: total,
    communityEventCount,
    avgTaskSeconds: PACE_AVG_TASK_SECONDS[pace],
  });

  const warnings: string[] = [];
  const band = 0.2 * targetMinutes;
  if (Math.abs(estimatedMinutes - targetMinutes) > band) {
    const direction = estimatedMinutes > targetMinutes ? "longer than" : "shorter than";
    warnings.push(
      `This setup is estimated at about ${Math.round(estimatedMinutes)} minutes, ` +
        `which is ${direction} the ${targetMinutes}-minute target.`,
    );
  }

  return {
    targetMinutes,
    estimatedMinutes,
    estimatedRounds,
    recommendedTasksPerTurn: tasksPerTurn,
    totalRequiredSuccesses: total,
    communityEventCount,
    warnings,
  };
}
