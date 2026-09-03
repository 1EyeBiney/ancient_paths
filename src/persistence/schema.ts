// PHASE8_SPEC Group P2 — the save schema. Everything a save needs to
// rebuild a game: the setup that built the deck, the command log since
// startGame, and a denormalized session snapshot (Welcome card + replay
// integrity check). Validated through zod so a corrupt or foreign save
// is rejected loudly at boot rather than crashing later.

import { z } from "zod";

// Bumped 1 -> 2 for PHASE10_SPEC Group X6 (SetupSnapshot gained
// avoidRecentTasks/recentGamesToRemember): the existing version-mismatch
// handling in parseSavedGame already quarantines any older-shaped save
// with a specific message, so no separate migration path is needed.
export const SAVE_SCHEMA_VERSION = 2;

const RESOURCE_TYPES = ["insight", "provision", "courage"] as const;
const resourceTypeSchema = z.enum(RESOURCE_TYPES);

const GAME_STATES = [
  "startup",
  "setup",
  "setupReview",
  "sessionGeneration",
  "ready",
  "beginTurn",
  "forkChoice",
  "taskPreview",
  "taskPresentation",
  "resourceWindow",
  "awaitingAnswer",
  "answerReveal",
  "hostRuling",
  "recoverDecision",
  "teachingReveal",
  "progressResolution",
  "surplusDecision",
  "stageCompletion",
  "landmarkIntroduction",
  "communityEvent",
  "paused",
  "gameSummary",
  "recovery",
  "error",
] as const;
const gameStateSchema = z.enum(GAME_STATES);

// ---------------------------------------------------------------------------
// Command (src/engine/engine.ts's Command union, mirrored — that file is
// open under Phase 7/8's rules but a hand-mirrored schema, not a derived
// one, is the only way zod can validate a discriminated union at runtime).
// ---------------------------------------------------------------------------

const insightEffectSchema = z.enum(["extra-clue", "eliminate-option", "replay"]);
const journeyTokenEffectSchema = z.enum(["extra-clue", "eliminate-option", "replay", "assist", "amplify"]);
const taskResultSchema = z.enum(["correct", "incorrect", "skipped"]);

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("startGame") }),
  z.object({ type: z.literal("chooseRoute"), routeId: z.string() }),
  z.object({ type: z.literal("presentTask") }),
  z.object({ type: z.literal("spendInsight"), effect: insightEffectSchema }),
  z.object({ type: z.literal("spendProvision") }),
  z.object({ type: z.literal("spendCourage") }),
  z.object({ type: z.literal("useJourneyToken"), effect: journeyTokenEffectSchema }),
  z.object({ type: z.literal("acceptAnswer") }),
  z.object({ type: z.literal("reveal") }),
  z.object({ type: z.literal("rule"), result: taskResultSchema }),
  z.object({ type: z.literal("acceptRecover") }),
  z.object({ type: z.literal("declineRecover") }),
  z.object({ type: z.literal("finishTeaching") }),
  z.object({ type: z.literal("keepSurplus"), resource: resourceTypeSchema }),
  z.object({ type: z.literal("offerSurplus") }),
  z.object({ type: z.literal("chooseGrantedResource"), teamId: z.string(), resource: resourceTypeSchema }),
  z.object({ type: z.literal("beginCommunityEvent") }),
  z.object({ type: z.literal("relayAnswer"), teamId: z.string(), correct: z.boolean() }),
  z.object({ type: z.literal("contribute"), teamId: z.string(), resource: resourceTypeSchema, amount: z.number() }),
  z.object({ type: z.literal("declineContribution"), teamId: z.string() }),
  z.object({ type: z.literal("resolveCommunityEvent") }),
  z.object({ type: z.literal("shareGrantedResource"), teamId: z.string(), toTeamId: z.string() }),
  z.object({ type: z.literal("undo") }),
]);

// ---------------------------------------------------------------------------
// PlaySession snapshot (src/engine/types.ts, mirrored — display + integrity
// check only; never fed back into the engine directly).
// ---------------------------------------------------------------------------

const teamStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  symbol: z.string(),
  currentMilestoneId: z.string(),
  currentStageId: z.string(),
  selectedRouteId: z.string().optional(),
  pendingForkId: z.string().optional(),
  stageSuccesses: z.number(),
  resources: z.record(resourceTypeSchema, z.number()),
  hasJourneyToken: z.boolean(),
  serviceScore: z.number(),
  stagesBeyondMilestone: z.number(),
});

const taskAttemptSchema = z.object({
  taskId: z.string(),
  teamId: z.string(),
  variant: z.enum(["assisted", "normal", "amplified"]),
  result: taskResultSchema,
  successesAwarded: z.number(),
  resourcesSpent: z.object({
    insight: z.number().optional(),
    provision: z.number().optional(),
    courage: z.number().optional(),
  }),
  usedJourneyToken: z.boolean(),
});

const gameEventSchema = z.object({
  timestamp: z.string(),
  text: z.string(),
});

const playSessionSchema = z.object({
  id: z.string(),
  schemaVersion: z.number(),
  journeyId: z.string(),
  journeyVersion: z.string(),
  contentPackVersions: z.record(z.string(), z.string()),
  seed: z.string(),
  teams: z.array(teamStateSchema),
  activeTeamIndex: z.number(),
  state: gameStateSchema,
  turnTaskLimit: z.number(),
  triggeredMilestones: z.array(z.string()),
  taskHistory: z.array(taskAttemptSchema),
  eventLog: z.array(gameEventSchema),
  finishedTeamIds: z.array(z.string()),
  roundNumber: z.number(),
  finishRoundNumber: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// Setup snapshot (src/ui/setup.ts's SetupWizard public fields, mirrored —
// exactly one field per wizard field, per PHASE8_SPEC.md Group P2).
// ---------------------------------------------------------------------------

const sessionDurationSchema = z.union([
  z.enum(["short", "standard", "long"]),
  z.object({ customMinutes: z.number() }),
]);

const audioSettingsSchema = z.object({
  master: z.number(),
  music: z.number(),
  effects: z.number(),
  narration: z.number(),
});

export const setupSnapshotSchema = z.object({
  journeyId: z.string(),
  teamCount: z.number(),
  teamNames: z.array(z.string()),
  duration: sessionDurationSchema,
  pace: z.enum(["relaxed", "standard", "quick"]),
  difficulty: z.enum(["gentle", "standard", "challenging"]),
  enabledPackIds: z.array(z.string()),
  enabledCategories: z.array(
    z.enum(["scripture-knowledge", "bible-reasoning", "historical-context", "audio-listening", "hymn", "decision-strategy"]),
  ),
  audio: audioSettingsSchema,
  communityCatchup: z.boolean(),
  seed: z.string(),
  tasksPerTurnOverride: z.number().nullable(),
  reducedMotion: z.boolean().nullable(),
  mapStyle: z.enum(["satellite", "parchment", "none"]),
  // PHASE10_SPEC Group X6.
  avoidRecentTasks: z.boolean(),
  recentGamesToRemember: z.number(),
});

const teamSetupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  symbol: z.string(),
});

// ---------------------------------------------------------------------------
// SavedGame v1
// ---------------------------------------------------------------------------

export const savedGameSchema = z.object({
  saveSchemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  savedAt: z.string(),
  content: z.object({
    journeyId: z.string(),
    journeyVersion: z.string(),
    packs: z.record(z.string(), z.string()),
  }),
  setup: setupSnapshotSchema,
  teams: z.array(teamSetupSchema),
  turnTaskLimit: z.number(),
  commands: z.array(commandSchema),
  snapshot: playSessionSchema,
  audio: z.object({
    settings: audioSettingsSchema,
    speechMode: z.enum(["wait", "interrupt"]),
  }),
});

export type SavedGame = z.infer<typeof savedGameSchema>;
export type SetupSnapshot = z.infer<typeof setupSnapshotSchema>;

export type SaveParseResult = { ok: true; game: SavedGame } | { ok: false; reason: string };

/**
 * Validates a raw store value into a SavedGame, with a specific message for
 * a schema-version mismatch (Group P6: newer AND older than known both take
 * this path, even though nothing older than v1 exists yet) rather than
 * zod's generic "invalid literal" error.
 */
// ---------------------------------------------------------------------------
// Recent tasks (PHASE10_SPEC Group X6). Kept as its own record, separate
// from SavedGame — it survives "Delete saved game" and outlives any one
// session (up to 5 remembered games), so a version mismatch here is
// silently ignored and overwritten rather than quarantined like a save.
// ---------------------------------------------------------------------------

export const RECENT_TASKS_SCHEMA_VERSION = 1;

const recentSessionSchema = z.object({
  endedAt: z.string(),
  journeyId: z.string(),
  taskIds: z.array(z.string()),
});

export const recentTasksSchema = z.object({
  schemaVersion: z.literal(RECENT_TASKS_SCHEMA_VERSION),
  sessions: z.array(recentSessionSchema),
});

export type RecentSession = z.infer<typeof recentSessionSchema>;
export type RecentTasks = z.infer<typeof recentTasksSchema>;

/** A corrupt or foreign record is never fatal here (unlike a save): it is
 * simply treated as "nothing remembered yet" and overwritten the next time
 * a session's ids are recorded. */
export function parseRecentTasks(raw: unknown): RecentTasks | null {
  const result = recentTasksSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseSavedGame(raw: unknown): SaveParseResult {
  if (raw !== null && typeof raw === "object" && "saveSchemaVersion" in raw) {
    const v = (raw as { saveSchemaVersion: unknown }).saveSchemaVersion;
    if (typeof v === "number" && v !== SAVE_SCHEMA_VERSION) {
      const message =
        v > SAVE_SCHEMA_VERSION
          ? "This saved game was made by a newer version of the game."
          : "This saved game was made by an older, unsupported version of the game.";
      return { ok: false, reason: message };
    }
  }
  const result = savedGameSchema.safeParse(raw);
  if (result.success) return { ok: true, game: result.data };
  return { ok: false, reason: "A saved game could not be read and was set aside." };
}
