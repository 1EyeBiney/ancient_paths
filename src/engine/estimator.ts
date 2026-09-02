// Duration estimator (PHASE2_SPEC "Duration estimator", design doc §21,
// §19). A pure function so setup screens (Phase 4) can call it live while
// the host adjusts settings. Constants are parameters, not hard-coded —
// playtests will tune the defaults.

export interface EstimatorInput {
  teamCount: number;
  tasksPerTurn: number;
  totalRequiredSuccesses: number;
  communityEventCount: number;
  avgTaskSeconds?: number;
  turnOverheadSeconds?: number;
  successRate?: number;
  communityEventMinutes?: number;
  fixedOverheadMinutes?: number;
}

export interface EstimatorResult {
  estimatedRounds: number;
  estimatedMinutes: number;
}

export function estimateMinutes(input: EstimatorInput): EstimatorResult {
  const {
    teamCount,
    tasksPerTurn,
    totalRequiredSuccesses,
    communityEventCount,
    avgTaskSeconds = 45,
    turnOverheadSeconds = 50,
    successRate = 0.65,
    communityEventMinutes = 3,
    fixedOverheadMinutes = 5,
  } = input;

  const successesPerTurn = tasksPerTurn * successRate;
  const estimatedRounds = Math.max(1, Math.ceil(totalRequiredSuccesses / successesPerTurn));

  const minutesPerTurn = (tasksPerTurn * avgTaskSeconds + turnOverheadSeconds) / 60;
  const estimatedMinutes =
    teamCount * estimatedRounds * minutesPerTurn +
    communityEventCount * communityEventMinutes +
    fixedOverheadMinutes;

  return { estimatedRounds, estimatedMinutes };
}
