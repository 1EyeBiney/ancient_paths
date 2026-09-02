// Content schemas (design doc §17, §33.2). Content is data, never engine
// code. Everything loaded from a pack or journey file is validated here
// before the engine may touch it; invalid required data stops session
// creation with a useful report, while missing OPTIONAL audio degrades
// gracefully (asset checks live with the audio manager, not here).

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

export const RESOURCE_TYPES = ["insight", "provision", "courage"] as const;

export const TASK_CATEGORIES = [
  "scripture-knowledge",
  "bible-reasoning",
  "historical-context",
  "audio-listening",
  "hymn",
  "decision-strategy",
  "community",
] as const;

export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase, digits and hyphens");

const resourceCostSchema = z.object({
  resource: z.enum(RESOURCE_TYPES),
  amount: z.number().int().min(1).max(5),
});

// ---------------------------------------------------------------------------
// Task record (§17.1)
// ---------------------------------------------------------------------------

const normalVariantSchema = z.object({
  prompt: z.string().min(1),
  successValue: z.literal(1),
});

const assistedVariantSchema = z.object({
  available: z.literal(true),
  cost: resourceCostSchema,
  prompt: z.string().min(1),
  successValue: z.literal(1),
});

// Amplified forms MUST be authored (never generated) and are worth exactly
// two successes on success, zero on failure (§7.3, §8.3).
const amplifiedVariantSchema = z.object({
  available: z.literal(true),
  cost: resourceCostSchema,
  prompt: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  successValue: z.literal(2),
});

export const taskSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(1),
  packId: idSchema,
  category: z.enum(TASK_CATEGORIES),
  title: z.string().min(1),
  biblePeriods: z.array(idSchema),
  locations: z.array(idSchema),
  difficulty: z.enum(DIFFICULTIES),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  hostGuidance: z.string().nullable(),
  scriptureReferences: z.array(z.string()),
  normalVariant: normalVariantSchema,
  assistedVariant: assistedVariantSchema.nullable(),
  amplifiedVariant: amplifiedVariantSchema.nullable(),
  clues: z.array(z.string()),
  teachingReveal: z.string().min(1),
  historicalNote: z.string().nullable(),
  audioAsset: idSchema.nullable(),
  tags: z.array(z.string()),
  resourceInteractions: z.object({
    insight: z.boolean(),
    provision: z.boolean(),
    courage: z.boolean(),
  }),
  estimatedSeconds: z.number().int().min(5).max(600),
});

export type Task = z.infer<typeof taskSchema>;

// ---------------------------------------------------------------------------
// Content pack
// ---------------------------------------------------------------------------

export const contentPackSchema = z
  .object({
    packId: idSchema,
    schemaVersion: z.literal(1),
    version: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    tasks: z.array(taskSchema).min(1),
  })
  .superRefine((pack, ctx) => {
    const seen = new Set<string>();
    pack.tasks.forEach((task, index) => {
      if (seen.has(task.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "id"],
          message: `Duplicate task id "${task.id}" in pack "${pack.packId}".`,
        });
      }
      seen.add(task.id);
      if (task.packId !== pack.packId) {
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "packId"],
          message: `Task "${task.id}" declares packId "${task.packId}" but lives in pack "${pack.packId}".`,
        });
      }
    });
  });

export type ContentPack = z.infer<typeof contentPackSchema>;

// ---------------------------------------------------------------------------
// Audio asset record (§17.3)
// ---------------------------------------------------------------------------

export const audioAssetSchema = z.object({
  assetId: idSchema,
  filePath: z.string().min(1),
  assetType: z.enum([
    "narration",
    "music",
    "effect",
    "task-audio",
    "hymn",
    "ambient",
  ]),
  transcript: z.string().min(1),
  durationSeconds: z.number().positive(),
  volumeRecommendation: z.number().min(0).max(1).optional(),
  replayAllowed: z.boolean(),
  fallbackText: z.string().min(1),
  attribution: z.string().nullable(),
});

export type AudioAsset = z.infer<typeof audioAssetSchema>;

// ---------------------------------------------------------------------------
// Journey record (§17.2) — v1 shape; expected to grow through Phases 2–3.
// A journey is an ordered list of entries: plain stages and forks. A fork's
// routes each contain their own stages and rejoin by construction at the
// next entry, so "routes that do not reconnect" (§33.2) is impossible when
// a fork is followed by another entry — validated below.
// ---------------------------------------------------------------------------

const stageSchema = z.object({
  kind: z.literal("stage"),
  id: idSchema,
  name: z.string().min(1),
  requiredSuccesses: z.number().int().min(1).max(8),
  // Reaching the end of this stage arrives at this milestone, if set.
  arrivesAtMilestoneId: idSchema.optional(),
  taskFocus: z.array(z.enum(TASK_CATEGORIES)).optional(),
});

const routeSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  taskFocus: z.array(z.enum(TASK_CATEGORIES)),
  stages: z.array(stageSchema).min(1),
});

const forkSchema = z.object({
  kind: z.literal("fork"),
  id: idSchema,
  name: z.string().min(1),
  routes: z.array(routeSchema).min(2).max(3),
});

const milestoneSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  introText: z.string().min(1),
  ambientAudioAsset: idSchema.nullable(),
});

const communityEventSchema = z.object({
  id: idSchema,
  milestoneId: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  repeatable: z.boolean().default(false),
});

export const journeySchema = z
  .object({
    journeyId: idSchema,
    schemaVersion: z.literal(1),
    version: z.string().min(1),
    title: z.string().min(1),
    startMilestoneId: idSchema,
    destinationMilestoneId: idSchema,
    milestones: z.array(milestoneSchema).min(2),
    entries: z.array(z.discriminatedUnion("kind", [stageSchema, forkSchema])).min(1),
    communityEvents: z.array(communityEventSchema),
  })
  .superRefine((journey, ctx) => {
    const milestoneIds = new Set(journey.milestones.map((m) => m.id));

    if (!milestoneIds.has(journey.startMilestoneId)) {
      ctx.addIssue({
        code: "custom",
        path: ["startMilestoneId"],
        message: `Unknown start milestone "${journey.startMilestoneId}".`,
      });
    }
    if (!milestoneIds.has(journey.destinationMilestoneId)) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationMilestoneId"],
        message: `Unknown destination milestone "${journey.destinationMilestoneId}".`,
      });
    }

    // Fork routes rejoin at the entry that follows the fork; a fork as the
    // final entry would leave its routes with nowhere to reconnect.
    const last = journey.entries[journey.entries.length - 1];
    if (last && last.kind === "fork") {
      ctx.addIssue({
        code: "custom",
        path: ["entries", journey.entries.length - 1],
        message: "A fork cannot be the final journey entry: its routes would not reconnect.",
      });
    }

    // Milestone references from stages must exist; stage ids must be unique
    // across the whole journey, including stages inside fork routes.
    const stageIds = new Set<string>();
    const checkStage = (stage: z.infer<typeof stageSchema>, path: (string | number)[]) => {
      if (stageIds.has(stage.id)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Duplicate stage id "${stage.id}".`,
        });
      }
      stageIds.add(stage.id);
      if (stage.arrivesAtMilestoneId && !milestoneIds.has(stage.arrivesAtMilestoneId)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Stage "${stage.id}" arrives at unknown milestone "${stage.arrivesAtMilestoneId}".`,
        });
      }
    };
    journey.entries.forEach((entry, i) => {
      if (entry.kind === "stage") checkStage(entry, ["entries", i]);
      else {
        entry.routes.forEach((route, r) => {
          route.stages.forEach((stage, s) =>
            checkStage(stage, ["entries", i, "routes", r, "stages", s]),
          );
        });
      }
    });

    // Community events must sit on real milestones, one event per milestone.
    const eventMilestones = new Set<string>();
    journey.communityEvents.forEach((event, i) => {
      if (!milestoneIds.has(event.milestoneId)) {
        ctx.addIssue({
          code: "custom",
          path: ["communityEvents", i, "milestoneId"],
          message: `Community event "${event.id}" references unknown milestone "${event.milestoneId}".`,
        });
      }
      if (eventMilestones.has(event.milestoneId)) {
        ctx.addIssue({
          code: "custom",
          path: ["communityEvents", i, "milestoneId"],
          message: `Milestone "${event.milestoneId}" has more than one community event.`,
        });
      }
      eventMilestones.add(event.milestoneId);
    });
  });

export type Journey = z.infer<typeof journeySchema>;
