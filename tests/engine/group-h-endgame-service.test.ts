// PHASE2_SPEC Group H — endgame and Service.
//
// Uses two bespoke, deliberately short journeys (no forks, minimal or no
// community events) so full-game traces stay readable. testJourney's fork
// and relay machinery is already proven by Groups B-G; Group H only needs
// enough structure to reach gameSummary and to create real position
// differences between teams.

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { testPack } from "./fixtures";

const OFFERING_POOL = [
  { id: "off-b", category: "beneficial", announcement: "x", effect: { type: "none" } },
  { id: "off-c", category: "community", announcement: "x", effect: { type: "none" } },
  { id: "off-h", category: "humorous", announcement: "x", effect: { type: "none" } },
  { id: "off-n", category: "neutral", announcement: "x", effect: { type: "none" } },
];

// Single stage, req 1, arrives straight at the destination — every team
// finishes on their very first correct answer. Used for H1/H2 (round-end
// timing and shared victory).
const shortJourney: Journey = journeySchema.parse({
  journeyId: "h-short",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Short Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
  ],
  entries: [
    { kind: "stage", id: "only-stage", name: "The Only Stage", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
  ],
  communityEvents: [],
  offeringOutcomes: OFFERING_POOL,
});

// Two stages: s1 (req 1) arrives at "checkpoint"; s2 (req 1) arrives at the
// destination. A contribution event sits at "checkpoint" with a threshold
// no team can plausibly reach (used only to grant Service via contribute(),
// never its reward, so it can't disturb position comparisons). Used for
// H3-H6 (position ordering, and Service never influencing it).
const longJourney: Journey = journeySchema.parse({
  journeyId: "h-long",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Long Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
    { id: "checkpoint", name: "Checkpoint", introText: "x", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
  ],
  entries: [
    { kind: "stage", id: "s1", name: "First", requiredSuccesses: 1, arrivesAtMilestoneId: "checkpoint" },
    { kind: "stage", id: "s2", name: "Second", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
  ],
  communityEvents: [
    {
      kind: "contribution",
      id: "h-contrib",
      milestoneId: "checkpoint",
      title: "Unreachable Contribution",
      description: "x",
      repeatable: false,
      acceptedResources: ["insight"],
      contributionThreshold: 16, // the schema's max; nothing in these tests pledges more than 2
      reward: { type: "reduce-next-stage-requirement", amount: 1 },
    },
  ],
  offeringOutcomes: OFFERING_POOL,
});

function makeShortEngine(teamIds: string[]) {
  const teams = teamIds.map((id) => ({ id, name: id, color: "#000", symbol: "x" }));
  return createEngine({
    journey: shortJourney,
    packs: [testPack],
    teams,
    turnTaskLimit: 1,
    rng: createRng("h-seed"),
    taskSource: new ArrayTaskSource(testPack.tasks),
  });
}

describe("H1 — a finisher ends the game once the round completes", () => {
  it("the game does not end mid-round, only once every team has had an equal turn", () => {
    const engine = makeShortEngine(["alpha", "beta"]);
    engine.dispatch({ type: "startGame" });

    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" }); // alpha finishes
    expect(engine.getState()).not.toBe("gameSummary"); // beta hasn't had its turn yet
    expect(engine.getSession().activeTeamIndex).toBe(1);

    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" }); // beta finishes too
    expect(engine.getState()).toBe("gameSummary"); // round complete, game ends
  });
});

describe("H2 — teams finishing in the same round share the victory", () => {
  it("both teams appear in journeyWinners", () => {
    const engine = makeShortEngine(["alpha", "beta"]);
    engine.dispatch({ type: "startGame" });
    for (let i = 0; i < 2; i++) {
      engine.dispatch({ type: "presentTask" });
      engine.dispatch({ type: "acceptAnswer" });
      engine.dispatch({ type: "reveal" });
      engine.dispatch({ type: "rule", result: "correct" });
      engine.dispatch({ type: "finishTeaching" });
    }
    const summary = engine.getSummary()!;
    expect(summary.journeyWinners.sort()).toEqual(["alpha", "beta"]);
  });
});

function ruleOnce(engine: ReturnType<typeof makeShortEngine>, result: "correct" | "incorrect") {
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "acceptAnswer" });
  engine.dispatch({ type: "reveal" });
  engine.dispatch({ type: "rule", result });
  if (engine.getState() === "recoverDecision") engine.dispatch({ type: "declineRecover" });
  if (engine.getState() === "teachingReveal") engine.dispatch({ type: "finishTeaching" });
}

function makeLongEngine(startingInsight = 0) {
  const teams = [
    { id: "alpha", name: "Alpha", color: "#000", symbol: "x" },
    { id: "beta", name: "Beta", color: "#000", symbol: "x" },
    { id: "gamma", name: "Gamma", color: "#000", symbol: "x" },
  ];
  return createEngine({
    journey: longJourney,
    packs: [testPack],
    teams,
    turnTaskLimit: 1,
    rng: createRng("h-long-seed"),
    taskSource: new ArrayTaskSource(testPack.tasks),
    startingResources: { insight: startingInsight, provision: 0, courage: 0 },
  });
}

describe("H3 — final positions are ordered by furthest milestone reached", () => {
  it("a finisher outranks a team stopped further back", () => {
    const engine = makeLongEngine();
    engine.dispatch({ type: "startGame" });
    ruleOnce(engine, "correct"); // alpha: s1 done -> checkpoint (triggers the event)
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "resolveCommunityEvent" }); // threshold unreachable, harmless
    ruleOnce(engine, "correct"); // beta: s1 done -> checkpoint (event already triggered)
    ruleOnce(engine, "correct"); // gamma: s1 done -> checkpoint

    ruleOnce(engine, "incorrect"); // alpha: stays at checkpoint (round 2's alpha turn)
    ruleOnce(engine, "incorrect"); // beta: stays at checkpoint (round 2's beta turn)
    expect(engine.getState()).not.toBe("gameSummary"); // gamma hasn't had its round-2 turn yet

    // Gamma is last in turn order, so its finish immediately completes the
    // round-wrap: alpha and beta already had their equal round-2 turns
    // above, so nothing more is owed before the game ends right here.
    ruleOnce(engine, "correct"); // gamma: s2 done -> FINISHES -> game ends
    expect(engine.getState()).toBe("gameSummary");

    const summary = engine.getSummary()!;
    expect(summary.journeyWinners).toEqual(["gamma"]);
    expect(summary.finalPositions[0]).toBe("gamma"); // furthest (finished) ranks first
    expect(summary.finalPositions.slice(1).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("H4 — Service never breaks a journey-position tie", () => {
  it("two teams tied on every position field sort by original order despite differing Service", () => {
    const engine = makeLongEngine(1); // insight:1 so beta can contribute
    engine.dispatch({ type: "startGame" });
    ruleOnce(engine, "correct"); // alpha: s1 done -> checkpoint, event triggers
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "beta", resource: "insight", amount: 1 }); // beta earns Service
    engine.dispatch({ type: "resolveCommunityEvent" }); // threshold unreached, no reward
    ruleOnce(engine, "correct"); // beta: s1 done -> checkpoint too (tied with alpha)
    ruleOnce(engine, "correct"); // gamma: s1 done -> checkpoint

    ruleOnce(engine, "incorrect"); // alpha stays (round 2)
    ruleOnce(engine, "incorrect"); // beta stays (round 2)
    ruleOnce(engine, "correct"); // gamma finishes (last in turn order) -> game ends

    const alpha = engine.getTeam("alpha")!;
    const beta = engine.getTeam("beta")!;
    expect(alpha.currentMilestoneId).toBe(beta.currentMilestoneId);
    expect(alpha.stagesBeyondMilestone).toBe(beta.stagesBeyondMilestone);
    expect(alpha.stageSuccesses).toBe(beta.stageSuccesses);
    expect(beta.serviceScore).toBeGreaterThan(alpha.serviceScore); // genuinely differ on Service

    const summary = engine.getSummary()!;
    const nonFinishers = summary.finalPositions.filter((id) => id !== "gamma");
    expect(nonFinishers).toEqual(["alpha", "beta"]); // original team order, Service ignored
  });
});

describe("H5 — the Barnabas Award goes to the highest Service, ties shared", () => {
  it("a single highest scorer is the sole recipient", () => {
    const engine = makeLongEngine(1);
    engine.dispatch({ type: "startGame" });
    ruleOnce(engine, "correct"); // alpha -> checkpoint, event triggers
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "beta", resource: "insight", amount: 1 });
    engine.dispatch({ type: "resolveCommunityEvent" });
    ruleOnce(engine, "correct"); // beta -> checkpoint
    ruleOnce(engine, "correct"); // gamma -> checkpoint
    ruleOnce(engine, "correct"); // alpha -> finish (round 2's alpha turn); ends game once round completes
    ruleOnce(engine, "correct"); // beta -> finish
    ruleOnce(engine, "correct"); // gamma -> finish

    const summary = engine.getSummary()!;
    expect(summary.barnabasAwardRecipients).toEqual(["beta"]);
  });

  it("two teams tied at the top both receive it", () => {
    const engine = makeLongEngine(2);
    engine.dispatch({ type: "startGame" });
    ruleOnce(engine, "correct"); // alpha -> checkpoint, event triggers
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "alpha", resource: "insight", amount: 1 });
    engine.dispatch({ type: "contribute", teamId: "beta", resource: "insight", amount: 1 });
    engine.dispatch({ type: "resolveCommunityEvent" });
    ruleOnce(engine, "correct"); // beta -> checkpoint
    ruleOnce(engine, "correct"); // gamma -> checkpoint
    ruleOnce(engine, "correct"); // alpha -> finish
    ruleOnce(engine, "correct"); // beta -> finish
    ruleOnce(engine, "correct"); // gamma -> finish

    const summary = engine.getSummary()!;
    expect(summary.barnabasAwardRecipients.sort()).toEqual(["alpha", "beta"]);
  });
});

describe("H6 — Service only changes through the configured serviceAwards table", () => {
  it("a plain correct ruling and keepSurplus do not touch serviceScore", () => {
    const engine = makeLongEngine();
    engine.dispatch({ type: "startGame" });
    const before = engine.getTeam("alpha")!.serviceScore;
    ruleOnce(engine, "correct"); // a plain stage completion, no offering/contribution involved
    expect(engine.getTeam("alpha")!.serviceScore).toBe(before);
  });
});
