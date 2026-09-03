// Shared audio-test content: a small, fully audio-wired pack (every task
// gets a task clip, an amplified-variant clip, and clueAudio for both of
// its clues) plus a testJourney variant whose "midway" milestone has an
// ambient asset. Used by Group A6 (game hooks) and Group A7 (the
// deliverable — everything still works when audio fails outright).

import {
  contentPackSchema,
  journeySchema,
  taskSchema,
  audioAssetSchema,
  type ContentPack,
  type Task,
} from "../../../src/content/schemas";
import { testJourney } from "../../engine/fixtures";

const CATEGORIES: Task["category"][] = ["scripture-knowledge", "historical-context", "decision-strategy", "community"];
const DIFFICULTIES = ["easy", "moderate", "hard"] as const;

function makeAudioTask(category: Task["category"], difficulty: (typeof DIFFICULTIES)[number], i: number): Task {
  const id = `a6-${category}-${difficulty}-${i}`;
  return taskSchema.parse({
    id,
    schemaVersion: 1,
    packId: "a6-pack",
    category,
    title: `${id} title`,
    biblePeriods: [],
    locations: [],
    difficulty,
    prompt: `${id} prompt`,
    answer: `${id} answer`,
    acceptedAnswers: [`${id} answer`],
    hostGuidance: null,
    scriptureReferences: [],
    normalVariant: { prompt: `${id} prompt`, successValue: 1 },
    assistedVariant: {
      available: true,
      cost: { resource: "insight", amount: 1 },
      prompt: `${id} assisted`,
      successValue: 1,
    },
    amplifiedVariant: {
      available: true,
      cost: { resource: "courage", amount: 1 },
      prompt: `${id} amplified`,
      answer: `${id} answer`,
      acceptedAnswers: [`${id} answer`],
      successValue: 2,
      audioAsset: `${id}-amp-clip`,
    },
    clues: [`${id} clue 1`, `${id} clue 2`],
    teachingReveal: `${id} teaching`,
    historicalNote: null,
    audioAsset: `${id}-clip`,
    tags: ["a6-test"],
    resourceInteractions: { insight: true, provision: true, courage: true },
    clueAudio: [`${id}-clue-0`, `${id}-clue-1`],
    estimatedSeconds: 30,
  });
}

function assetsForTask(task: Task) {
  const make = (assetId: string, assetType: "task-audio" | "narration") =>
    audioAssetSchema.parse({
      assetId,
      filePath: `audio/${assetId}.wav`,
      assetType,
      transcript: `${assetId} transcript`,
      durationSeconds: 1,
      replayAllowed: true,
      fallbackText: `${assetId} fallback`,
      attribution: null,
    });
  return [
    make(`${task.id}-clip`, "task-audio"),
    make(`${task.id}-amp-clip`, "task-audio"),
    make(`${task.id}-clue-0`, "narration"),
    make(`${task.id}-clue-1`, "narration"),
  ];
}

export function buildAudioPack(): ContentPack {
  const tasks: Task[] = [];
  for (const category of CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 10; i++) tasks.push(makeAudioTask(category, difficulty, i));
    }
  }
  return contentPackSchema.parse({
    packId: "a6-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "A6 audio pack",
    description: "Test-only, obviously fake, never real content.",
    tasks,
    audioAssets: tasks.flatMap(assetsForTask),
  });
}

export const AMBIENT_ASSET_ID = "midway-ambient";
export const AMBIENT_PATH = "audio/midway-ambient.wav";

export const journeyWithAmbient = journeySchema.parse({
  ...testJourney,
  milestones: testJourney.milestones.map((m) => (m.id === "midway" ? { ...m, ambientAudioAsset: AMBIENT_ASSET_ID } : m)),
  audioAssets: [
    audioAssetSchema.parse({
      assetId: AMBIENT_ASSET_ID,
      filePath: AMBIENT_PATH,
      assetType: "ambient",
      transcript: "Midway ambience",
      durationSeconds: 5,
      replayAllowed: true,
      fallbackText: "Ambient sound would play here.",
      attribution: null,
    }),
  ],
});
