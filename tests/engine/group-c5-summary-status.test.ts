// PHASE7_SPEC Group C5 — communityAccomplishments, serviceAwardName, and
// statusText()'s new "Service n." sentence. A bespoke 3-stage journey
// (req 1 each, no forks) so a full game reaches gameSummary quickly:
// s1 -> "midway" (relay, threshold 1, succeeds), s2 -> "ford"
// (contribution, threshold 6, fails but one team pledges exceptionally),
// s3 -> "finish" (plain).

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { DEFAULTS } from "../../src/config/defaults";
import { testPack, taskById, completeCurrentTask, presentAndComplete } from "./fixtures";

// sk-easy-1/2 both have every resourceInteraction true and an amplified
// variant — needed since every stage here amplifies for a surplus.
const AMPLIFIABLE_TASKS = [taskById("sk-easy-1"), taskById("sk-easy-2")];

const OFFERING_POOL = [
  { id: "off-b", category: "beneficial" as const, announcement: "x", effect: { type: "none" as const } },
  { id: "off-c", category: "community" as const, announcement: "x", effect: { type: "none" as const } },
  { id: "off-h", category: "humorous" as const, announcement: "x", effect: { type: "none" as const } },
  { id: "off-n", category: "neutral" as const, announcement: "x", effect: { type: "none" as const } },
];

const journey: Journey = journeySchema.parse({
  journeyId: "c5-journey",
  schemaVersion: 1,
  version: "0.0.1",
  title: "C5 Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
    { id: "midway", name: "Midway", introText: "x", ambientAudioAsset: null },
    { id: "ford", name: "Ford", introText: "x", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
  ],
  entries: [
    { kind: "stage", id: "s1", name: "First", requiredSuccesses: 1, arrivesAtMilestoneId: "midway" },
    { kind: "stage", id: "s2", name: "Second", requiredSuccesses: 1, arrivesAtMilestoneId: "ford" },
    { kind: "stage", id: "s3", name: "Third", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
  ],
  communityEvents: [
    {
      kind: "relay",
      id: "c5-relay",
      milestoneId: "midway",
      title: "The Midway Relay",
      description: "x",
      repeatable: false,
      taskCategory: "community",
      successThreshold: 1,
      reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
    },
    {
      kind: "contribution",
      id: "c5-contrib",
      milestoneId: "ford",
      title: "The Ford Contribution",
      description: "x",
      repeatable: false,
      acceptedResources: ["insight", "provision", "courage"],
      contributionThreshold: 6,
      reward: { type: "reduce-next-stage-requirement", amount: 1 },
    },
  ],
  offeringOutcomes: OFFERING_POOL,
});

function makeGameEngine(): GameEngine {
  return createEngine({
    journey,
    packs: [testPack],
    teams: [
      { id: "alpha", name: "Alpha", color: "#000", symbol: "x" },
      { id: "beta", name: "Beta", color: "#000", symbol: "y" },
    ],
    turnTaskLimit: 5,
    rng: createRng("c5-seed"),
    taskSource: new ArrayTaskSource(AMPLIFIABLE_TASKS),
    startingResources: { insight: 5, provision: 5, courage: 5 },
  });
}

/** alpha: amplify (successValue 2 on a req-1 stage -> 1 surplus), offer
 * it, letting the outcome (always "none") land regardless of draw. */
function amplifyAndOffer(engine: GameEngine): void {
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "spendCourage" });
  completeCurrentTask(engine, "correct");
  expect(engine.getState()).toBe("surplusDecision");
  engine.dispatch({ type: "offerSurplus" });
}

describe("C5 — a full game's community accomplishments", () => {
  it("lists what the room did together, in order, and omits nothing that happened", () => {
    const engine = makeGameEngine();
    engine.dispatch({ type: "startGame" });

    // alpha: s1 with an offering, arrives "midway" -> relay pending.
    amplifyAndOffer(engine);
    expect(engine.getState()).toBe("landmarkIntroduction");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "alpha", correct: true }); // threshold 1 -> success
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> beta's turn

    // beta: s1, arrives "midway" too (already triggered, no new event).
    presentAndComplete(engine, "correct");
    expect(engine.getState()).not.toBe("landmarkIntroduction");

    // Share the gift: alpha got a pending choice from the relay reward.
    engine.dispatch({ type: "shareGrantedResource", teamId: "alpha", toTeamId: "beta" });

    // alpha: s2 with a second offering, arrives "ford" -> contribution pending.
    amplifyAndOffer(engine);
    expect(engine.getState()).toBe("landmarkIntroduction");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "alpha", resource: "insight", amount: 3 }); // exceptional (>= 3), total 3 < 6
    engine.dispatch({ type: "declineContribution", teamId: "beta" });
    engine.dispatch({ type: "resolveCommunityEvent" }); // fails -> beta's turn

    // beta: s2, arrives "ford" too (already triggered).
    presentAndComplete(engine, "correct");

    // s3 for both — plain completions to reach gameSummary.
    presentAndComplete(engine, "correct"); // alpha
    presentAndComplete(engine, "correct"); // beta
    expect(engine.getState()).toBe("gameSummary");

    const summary = engine.getSummary()!;
    expect(summary.serviceAwardName).toBe(DEFAULTS.serviceAwardPublicName);
    expect(summary.communityAccomplishments).toEqual([
      "The room succeeded at The Midway Relay.",
      "The room fell short at The Ford Contribution.",
      "2 surplus successes were offered.",
      "3 resources were pledged to community events.",
      "Team Alpha made an exceptional contribution.",
      "1 gifts were shared between teams.",
    ]);
  });

  it("is empty when nothing communal happened", () => {
    const plainJourney: Journey = journeySchema.parse({
      ...journey,
      entries: [{ kind: "stage", id: "solo", name: "Solo", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" }],
      communityEvents: [],
    });
    const engine = createEngine({
      journey: plainJourney,
      packs: [testPack],
      teams: [
        { id: "alpha", name: "Alpha", color: "#000", symbol: "x" },
        { id: "beta", name: "Beta", color: "#000", symbol: "y" },
      ],
      turnTaskLimit: 1,
      rng: createRng("c5-empty-seed"),
      taskSource: new ArrayTaskSource(testPack.tasks),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // alpha finishes
    presentAndComplete(engine, "correct"); // beta finishes
    expect(engine.getState()).toBe("gameSummary");
    expect(engine.getSummary()!.communityAccomplishments).toEqual([]);
  });
});

describe("C5 — statusText", () => {
  it("ends with 'Service n.' after the Journey Token sentence", () => {
    const engine = makeGameEngine();
    engine.dispatch({ type: "startGame" });
    expect(engine.statusText().endsWith("No Journey Token. Service 0.")).toBe(true);

    amplifyAndOffer(engine); // arrives at landmarkIntroduction, still alpha's "turn" conceptually
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "alpha", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // alpha earned Service from offerSurplus
    // it's now beta's turn; alpha's Service is nonzero but statusText reports the ACTIVE team
    presentAndComplete(engine, "correct"); // beta's s1 -> back to alpha's turn
    expect(engine.statusText()).toMatch(/Service \d+\.$/);
    expect(engine.statusText().endsWith("Service 0.")).toBe(false); // alpha earned at least 1
  });
});
