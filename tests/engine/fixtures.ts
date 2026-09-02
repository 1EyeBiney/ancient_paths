// Shared engine-test fixtures: a small hand-built journey and task pool
// covering every variant shape the Phase 2 test groups need (options,
// assisted/amplified presence and absence, resourceInteractions gating,
// a fork, a relay event, and a contribution event). Validated through the
// real schemas at load time so a fixture mistake fails loudly here rather
// than masquerading as an engine bug.

import { contentPackSchema, journeySchema, type ContentPack, type Journey } from "../../src/content/schemas";
import { createEngine, type EngineOptions, type GameEngine, type TeamSetup } from "../../src/engine/engine";
import { createRng, type Rng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import type { TaskResult } from "../../src/engine/types";

const rawJourney = {
  journeyId: "test-path",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "The beginning.", ambientAudioAsset: null },
    { id: "midway", name: "Midway", introText: "Halfway there.", ambientAudioAsset: null },
    { id: "ford", name: "The Ford", introText: "A river crossing.", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "Journey's end.", ambientAudioAsset: null },
  ],
  entries: [
    {
      kind: "stage",
      id: "s1",
      name: "First Leg",
      requiredSuccesses: 2,
      arrivesAtMilestoneId: "midway",
      taskFocus: ["scripture-knowledge"],
    },
    {
      kind: "fork",
      id: "fork1",
      name: "The Road Divides",
      routes: [
        {
          id: "route-a",
          name: "Route A",
          description: "The easier road.",
          difficulty: "easy",
          taskFocus: ["scripture-knowledge"],
          stages: [{ kind: "stage", id: "a-stage", name: "Route A Leg", requiredSuccesses: 1 }],
        },
        {
          id: "route-b",
          name: "Route B",
          description: "The harder road.",
          difficulty: "hard",
          taskFocus: ["historical-context"],
          stages: [{ kind: "stage", id: "b-stage", name: "Route B Leg", requiredSuccesses: 1 }],
        },
      ],
    },
    {
      kind: "stage",
      id: "s2",
      name: "Second Leg",
      requiredSuccesses: 1,
      arrivesAtMilestoneId: "ford",
      taskFocus: ["historical-context"],
    },
    {
      kind: "stage",
      id: "s3",
      name: "Final Leg",
      requiredSuccesses: 2,
      arrivesAtMilestoneId: "finish",
      taskFocus: ["decision-strategy"],
    },
  ],
  communityEvents: [
    {
      kind: "relay",
      id: "relay-event",
      milestoneId: "midway",
      title: "The Relay Test",
      description: "Teams answer in turn.",
      repeatable: false,
      taskCategory: "community",
      successThreshold: 2,
      reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
    },
    {
      kind: "contribution",
      id: "contrib-event",
      milestoneId: "ford",
      title: "The Contribution Test",
      description: "Teams pledge resources.",
      repeatable: false,
      acceptedResources: ["insight", "provision", "courage"],
      contributionThreshold: 2,
      // s3's requiredSuccesses is 2; amount:2 drives the effective requirement
      // to max(1, 2-2)=0, floored to 1 — exercises the G7 floor directly.
      reward: { type: "reduce-next-stage-requirement", amount: 2 },
    },
  ],
  offeringOutcomes: [
    {
      id: "off-beneficial",
      category: "beneficial",
      announcement: "A beneficial gift returns.",
      effect: { type: "grant-resource", target: "offering-team", resource: "insight", amount: 1 },
    },
    {
      id: "off-community",
      category: "community",
      announcement: "Everyone is strengthened.",
      effect: { type: "grant-resource", target: "every-team", resource: "provision", amount: 1 },
    },
    {
      id: "off-humorous",
      category: "humorous",
      announcement: "A donkey bolts through the market.",
      effect: { type: "none" },
    },
    {
      id: "off-neutral",
      category: "neutral",
      announcement: "The gift is received quietly.",
      effect: { type: "none" },
    },
  ],
};

export const testJourney: Journey = journeySchema.parse(rawJourney);

const rawPack = {
  packId: "test-pack",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Engine Test Fixtures",
  description: "Never shown to a player; engine test data only.",
  tasks: [
    {
      id: "sk-easy-1",
      schemaVersion: 1,
      packId: "test-pack",
      category: "scripture-knowledge",
      title: "SK Easy 1 (options)",
      biblePeriods: [],
      locations: [],
      difficulty: "easy",
      prompt: "Who led Israel out of Egypt?",
      answer: "Moses",
      acceptedAnswers: ["Moses"],
      hostGuidance: null,
      scriptureReferences: [],
      normalVariant: { prompt: "Who led Israel out of Egypt?", options: ["Moses", "Aaron", "Joshua"], successValue: 1 },
      assistedVariant: {
        available: true,
        cost: { resource: "insight", amount: 1 },
        prompt: "Was it Moses, Aaron, or Joshua?",
        options: ["Moses", "Aaron", "Joshua"],
        successValue: 1,
      },
      amplifiedVariant: {
        available: true,
        cost: { resource: "courage", amount: 1 },
        prompt: "Name the leader and his brother who spoke for him.",
        answer: "Moses and Aaron",
        acceptedAnswers: ["Moses and Aaron"],
        successValue: 2,
      },
      clues: ["He grew up in Pharaoh's household.", "He parted a sea."],
      teachingReveal: "Moses led Israel out of Egypt with his brother Aaron at his side.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: true, provision: true, courage: true },
      estimatedSeconds: 30,
    },
    {
      id: "sk-easy-2",
      schemaVersion: 1,
      packId: "test-pack",
      category: "scripture-knowledge",
      title: "SK Easy 2",
      biblePeriods: [],
      locations: [],
      difficulty: "easy",
      prompt: "Who built the ark?",
      answer: "Noah",
      acceptedAnswers: ["Noah"],
      hostGuidance: null,
      scriptureReferences: [],
      normalVariant: { prompt: "Who built the ark?", successValue: 1 },
      assistedVariant: {
        available: true,
        cost: { resource: "insight", amount: 1 },
        prompt: "Was it Noah, Abraham, or Isaac?",
        options: ["Noah", "Abraham", "Isaac"],
        successValue: 1,
      },
      amplifiedVariant: {
        available: true,
        cost: { resource: "courage", amount: 1 },
        prompt: "Name the ark builder and how many of his sons boarded with him.",
        answer: "Noah and three sons",
        acceptedAnswers: ["Noah and three sons", "Noah, three sons"],
        successValue: 2,
      },
      clues: ["It rained forty days and forty nights."],
      teachingReveal: "Noah built the ark at God's command and was saved with his family.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: true, provision: true, courage: true },
      estimatedSeconds: 30,
    },
    {
      id: "hc-moderate-1",
      schemaVersion: 1,
      packId: "test-pack",
      category: "historical-context",
      title: "HC Moderate 1",
      biblePeriods: [],
      locations: [],
      difficulty: "moderate",
      prompt: "What Roman road led into Rome?",
      answer: "The Appian Way",
      acceptedAnswers: ["The Appian Way", "Appian Way"],
      hostGuidance: null,
      scriptureReferences: [],
      normalVariant: { prompt: "What Roman road led into Rome?", successValue: 1 },
      assistedVariant: {
        available: true,
        cost: { resource: "insight", amount: 1 },
        prompt: "Was it the Appian Way or the King's Highway?",
        options: ["The Appian Way", "The King's Highway"],
        successValue: 1,
      },
      amplifiedVariant: null,
      clues: ["It is named for a Roman censor."],
      teachingReveal: "The Appian Way was one of Rome's most famous roads.",
      historicalNote: "Widely accepted historical background.",
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: true, provision: true, courage: false },
      estimatedSeconds: 30,
    },
    {
      id: "hc-moderate-2",
      schemaVersion: 1,
      packId: "test-pack",
      category: "historical-context",
      title: "HC Moderate 2 (no assist/amplify, full interactions)",
      biblePeriods: [],
      locations: [],
      difficulty: "moderate",
      prompt: "What sea did Paul sail across toward Rome?",
      answer: "The Mediterranean",
      acceptedAnswers: ["The Mediterranean", "The Mediterranean Sea"],
      hostGuidance: null,
      scriptureReferences: [],
      normalVariant: { prompt: "What sea did Paul sail across toward Rome?", successValue: 1 },
      assistedVariant: null,
      amplifiedVariant: null,
      clues: ["It borders three continents."],
      teachingReveal: "Paul's voyage crossed the Mediterranean Sea.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: true, provision: true, courage: true },
      estimatedSeconds: 30,
    },
    {
      id: "ds-hard-1",
      schemaVersion: 1,
      packId: "test-pack",
      category: "decision-strategy",
      title: "DS Hard 1 (no resource interactions)",
      biblePeriods: [],
      locations: [],
      difficulty: "hard",
      prompt: "State your decision and one reason for it.",
      answer: "Any clear decision with a reason.",
      acceptedAnswers: ["Any clear decision with a reason"],
      hostGuidance: "Judge the reasoning, not the choice.",
      scriptureReferences: [],
      normalVariant: { prompt: "State your decision and one reason for it.", successValue: 1 },
      assistedVariant: null,
      amplifiedVariant: null,
      clues: [],
      teachingReveal: "Reasoned decisions matter more than matching history.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: false, provision: false, courage: false },
      estimatedSeconds: 30,
    },
    {
      id: "ds-hard-2",
      schemaVersion: 1,
      packId: "test-pack",
      category: "decision-strategy",
      title: "DS Hard 2 (no resource interactions)",
      biblePeriods: [],
      locations: [],
      difficulty: "hard",
      prompt: "What would you do differently, and why?",
      answer: "Any clear decision with a reason.",
      acceptedAnswers: ["Any clear decision with a reason"],
      hostGuidance: "Judge the reasoning, not the choice.",
      scriptureReferences: [],
      normalVariant: { prompt: "What would you do differently, and why?", successValue: 1 },
      assistedVariant: null,
      amplifiedVariant: null,
      clues: [],
      teachingReveal: "Reasoned decisions matter more than matching history.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: false, provision: false, courage: false },
      estimatedSeconds: 30,
    },
    {
      id: "community-1",
      schemaVersion: 1,
      packId: "test-pack",
      category: "community",
      title: "Community Relay Part",
      biblePeriods: [],
      locations: [],
      difficulty: "easy",
      prompt: "Name one fruit of the Spirit.",
      answer: "Any of the nine.",
      acceptedAnswers: ["Any of the nine"],
      hostGuidance: null,
      scriptureReferences: [],
      normalVariant: { prompt: "Name one fruit of the Spirit.", successValue: 1 },
      assistedVariant: null,
      amplifiedVariant: null,
      clues: [],
      teachingReveal: "Galatians 5 lists nine qualities.",
      historicalNote: null,
      audioAsset: null,
      tags: ["test"],
      resourceInteractions: { insight: false, provision: false, courage: false },
      estimatedSeconds: 20,
    },
  ],
};

export const testPack: ContentPack = contentPackSchema.parse(rawPack);

export function taskById(id: string) {
  const task = testPack.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`fixtures: no task "${id}"`);
  return task;
}

export const twoTeams: TeamSetup[] = [
  { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
  { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
];

export function makeEngine(overrides: Partial<EngineOptions> = {}): GameEngine {
  return createEngine({
    journey: testJourney,
    packs: [testPack],
    teams: twoTeams,
    turnTaskLimit: 3,
    rng: createRng("fixture-seed"),
    taskSource: new ArrayTaskSource(testPack.tasks),
    ...overrides,
  });
}

/**
 * Drives the CURRENT in-progress task from resourceWindow through to
 * whatever resting state follows a ruling: acceptAnswer -> reveal -> rule,
 * declining recovery by default (matching most tests, which aren't
 * exercising the recovery path itself) and running finishTeaching if the
 * ruling lands directly at teachingReveal. Group D tests that need to
 * ACCEPT recovery drive the sequence manually instead of using this helper.
 */
export function completeCurrentTask(engine: GameEngine, result: TaskResult): void {
  engine.dispatch({ type: "acceptAnswer" });
  engine.dispatch({ type: "reveal" });
  engine.dispatch({ type: "rule", result });
  if (engine.getState() === "recoverDecision") {
    engine.dispatch({ type: "declineRecover" });
  }
  if (engine.getState() === "teachingReveal") {
    engine.dispatch({ type: "finishTeaching" });
  }
}

/** presentTask() followed by completeCurrentTask(). */
export function presentAndComplete(engine: GameEngine, result: TaskResult): void {
  engine.dispatch({ type: "presentTask" });
  completeCurrentTask(engine, result);
}

/**
 * Drives both teams through s1 (and its community event) so Matthew lands
 * on his SECOND turn sitting in forkChoice. Shared by Group C and Group F,
 * which both need a team actually standing at the fork.
 */
export function advanceBothTeamsToFork(engine: GameEngine): void {
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // Matthew: s1 done -> landmarkIntroduction
  engine.dispatch({ type: "beginCommunityEvent" });
  engine.dispatch({ type: "resolveCommunityEvent" }); // ends Matthew's turn -> Mark's turn

  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // Mark: s1 done, event already triggered, turn ends -> Matthew's turn
}

/**
 * A test double for Rng that returns a scripted sequence of values instead
 * of a real pseudo-random stream — gives tests exact control over which
 * branch a weighted draw (e.g. the offering pool) takes. Repeats the last
 * value if asked for more draws than were scripted.
 */
export function fixedRng(values: number[]): Rng {
  let i = 0;
  return {
    next: () => {
      const v = values[Math.min(i, values.length - 1)]!;
      i++;
      return v;
    },
  };
}
