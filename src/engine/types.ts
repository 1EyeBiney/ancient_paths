// Core engine types from design doc §28. The engine itself is Phase 2 work;
// these types anchor the separation the doc demands between permanent
// progress, spendable resources, and the independent Service score.

export type ResourceType = "insight" | "provision" | "courage";

export type TaskResult = "correct" | "incorrect" | "skipped";

export type TaskVariantKind = "assisted" | "normal" | "amplified";

export interface TeamState {
  id: string;
  name: string;
  color: string;
  symbol: string;

  currentMilestoneId: string;
  currentStageId: string;
  selectedRouteId?: string;
  // Set when the team has arrived at a fork and must chooseRoute before any
  // further task can be presented; cleared once they choose.
  pendingForkId?: string;

  stageSuccesses: number;
  resources: Record<ResourceType, number>;
  hasJourneyToken: boolean;
  serviceScore: number;

  // Position bookkeeping for the §21 shortened-ending comparator: how many
  // stages this team has completed since it last arrived at a milestone.
  // Reset to 0 on arrival, incremented on each subsequent stage completion.
  stagesBeyondMilestone: number;
}

export interface TaskAttempt {
  taskId: string;
  teamId: string;
  variant: TaskVariantKind;
  result: TaskResult;
  successesAwarded: number;
  resourcesSpent: Partial<Record<ResourceType, number>>;
  usedJourneyToken: boolean;
}

// High-level application states from design doc §25. The engine will expose
// legal transitions between these; the presentation layer may only issue
// commands valid for the current state.
export type GameState =
  | "startup"
  | "setup"
  | "setupReview"
  | "sessionGeneration"
  | "ready"
  | "beginTurn"
  | "forkChoice"
  | "taskPreview"
  | "taskPresentation"
  | "resourceWindow"
  | "awaitingAnswer"
  | "answerReveal"
  | "hostRuling"
  | "recoverDecision"
  | "teachingReveal"
  | "progressResolution"
  | "surplusDecision"
  | "stageCompletion"
  | "landmarkIntroduction"
  | "communityEvent"
  | "paused"
  | "gameSummary"
  | "recovery"
  | "error";

export interface GameEvent {
  timestamp: string;
  text: string;
}

export interface PlaySession {
  id: string;
  schemaVersion: number;
  journeyId: string;
  journeyVersion: string;
  contentPackVersions: Record<string, string>;
  seed: string;

  teams: TeamState[];
  activeTeamIndex: number;
  state: GameState;
  turnTaskLimit: number;

  triggeredMilestones: string[];
  taskHistory: TaskAttempt[];
  eventLog: GameEvent[];

  // Endgame bookkeeping (§21 + the 2026-09-02 "finish the round" ruling).
  finishedTeamIds: string[];
  roundNumber: number;
  finishRoundNumber: number | null;
}
