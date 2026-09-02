// Synthetic task factory (PHASE3_SPEC ground rule 4). The dev-sample pack
// (8 tasks) is far too small for statistical balance tests, so this
// generates schema-valid tasks programmatically — each one parsed through
// taskSchema, so a factory mistake fails loudly here rather than
// masquerading as a builder bug. Prompts are obviously fake and can never
// be mistaken for real content.

import {
  contentPackSchema,
  taskSchema,
  DIFFICULTIES,
  TASK_CATEGORIES,
  type ContentPack,
  type Task,
} from "../../src/content/schemas";

export function makeSyntheticTask(
  category: Task["category"],
  difficulty: Task["difficulty"],
  index: number,
): Task {
  const raw = {
    id: `synthetic-${category}-${difficulty}-${index}`,
    schemaVersion: 1,
    packId: "synthetic-pack",
    category,
    title: `Synthetic ${category} ${difficulty} #${index}`,
    biblePeriods: [],
    locations: [],
    difficulty,
    prompt: `Synthetic task ${index} prompt (obviously fake, never real content).`,
    answer: `Synthetic answer ${index}`,
    acceptedAnswers: [`Synthetic answer ${index}`],
    hostGuidance: null,
    scriptureReferences: [],
    normalVariant: {
      prompt: `Synthetic task ${index} prompt (obviously fake, never real content).`,
      successValue: 1,
    },
    assistedVariant: null,
    amplifiedVariant: null,
    clues: [],
    teachingReveal: `Synthetic teaching reveal ${index}.`,
    historicalNote: null,
    audioAsset: null,
    tags: ["synthetic"],
    resourceInteractions: { insight: false, provision: false, courage: false },
    estimatedSeconds: 30,
  };
  return taskSchema.parse(raw);
}

/**
 * A full synthetic pack: `countPerCell` tasks for every (category,
 * difficulty) cell in `categories` × the three difficulties. Default
 * categories = all seven, giving 21 × countPerCell tasks total.
 */
export function makeSyntheticPack(
  countPerCell: number,
  categories: readonly Task["category"][] = TASK_CATEGORIES,
): ContentPack {
  const tasks: Task[] = [];
  let index = 0;
  for (const category of categories) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < countPerCell; i++) {
        tasks.push(makeSyntheticTask(category, difficulty, index++));
      }
    }
  }
  return contentPackSchema.parse({
    packId: "synthetic-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Synthetic Test Pack",
    description: "Programmatically generated for tests. Never real content.",
    tasks,
  });
}
