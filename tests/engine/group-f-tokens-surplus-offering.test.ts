// PHASE2_SPEC Group F — Journey Tokens, surplus, offering.

import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../src/config/defaults";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { createRng } from "../../src/engine/rng";
import { drawOfferingOutcome } from "../../src/engine/offering";
import {
  advanceBothTeamsToFork,
  completeCurrentTask,
  fixedRng,
  makeEngine,
  presentAndComplete,
  taskById,
  testJourney,
} from "./fixtures";

describe("F1 — a perfect stage grants a Journey Token", () => {
  it("two correct answers with no failure grants the token", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct");
    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(true);
  });

  it("a stage completed after a failure is NOT perfect and grants no token", () => {
    const engine = makeEngine({ turnTaskLimit: 3 });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "incorrect"); // 0/2, turn continues (limit 3)
    presentAndComplete(engine, "correct"); // 1/2
    presentAndComplete(engine, "correct"); // 2/2, but the earlier failure disqualifies "perfect"
    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(false);
  });
});

describe("F2 — a team never holds more than one Journey Token", () => {
  it("a second perfect stage does not grant a second token or re-log it", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine); // Matthew's s1 was perfect -> token already held
    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(true);

    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    presentAndComplete(engine, "correct"); // a-stage req=1, perfect again

    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(true); // still just true, not double
    // Mark also completes s1 perfectly inside advanceBothTeamsToFork and
    // legitimately earns his own token — filter to Matthew's log lines only.
    const matthewTokenLogs = engine
      .getSession()
      .eventLog.filter((e) => e.text.includes("Matthew") && e.text.includes("earns a Journey Token"));
    expect(matthewTokenLogs).toHaveLength(1);
  });
});

describe("F3 — the Journey Token performs one eligible effect free of cost", () => {
  it("useJourneyToken reveals a clue without spending Insight", () => {
    const engine = makeEngine({
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    advanceBothTeamsToFork(engine);
    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(true);
    expect(engine.getTeam("matthew")!.resources.insight).toBe(0);

    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "useJourneyToken", effect: "extra-clue" });

    expect(engine.getCurrentTaskPublic()!.cluesRevealed.length).toBe(1);
    expect(engine.getTeam("matthew")!.resources.insight).toBe(0); // free
    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(false); // consumed
  });
});

function createSurplusReady(startingCourage = 1) {
  const engine = makeEngine({
    startingResources: { insight: 0, provision: 0, courage: startingCourage },
    turnTaskLimit: 3,
    taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
  });
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct"); // 1/2
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "spendCourage" }); // amplify, costs the 1 courage
  completeCurrentTask(engine, "correct"); // +2 -> 3/2, surplus 1
  return engine;
}

describe("F4 — surplus is counted correctly", () => {
  it("overshooting the requirement by 1 leaves exactly 1 pending surplus", () => {
    const engine = createSurplusReady();
    expect(engine.getState()).toBe("surplusDecision");
    expect(engine.getPendingSurplus()).toBe(1);
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(2); // clamped to the requirement
  });
});

describe("F5 — keepSurplus grants the team's chosen resource", () => {
  it("awards exactly the resource the team asked for", () => {
    const engine = createSurplusReady();
    expect(engine.getTeam("matthew")!.resources.provision).toBe(0);
    engine.dispatch({ type: "keepSurplus", resource: "provision" });
    expect(engine.getTeam("matthew")!.resources.provision).toBe(1);
    expect(engine.getPendingSurplus()).toBe(0);
  });
});

describe("F6 — offering a surplus always earns Service", () => {
  it("Service increases by the configured award regardless of the outcome drawn", () => {
    const engine = createSurplusReady();
    const before = engine.getTeam("matthew")!.serviceScore;
    engine.dispatch({ type: "offerSurplus" });
    const after = engine.getTeam("matthew")!.serviceScore;
    expect(after - before).toBe(DEFAULTS.serviceAwards.offerSurplus);
  });
});

describe("F7 — the offering draw respects its weights and every category is reachable", () => {
  it("empirical distribution over many draws roughly matches the configured weights", () => {
    const rng = createRng("offering-distribution-seed");
    const tally = { beneficial: 0, community: 0, humorous: 0, neutral: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const outcome = drawOfferingOutcome(rng, DEFAULTS.offeringWeights, testJourney.offeringOutcomes);
      tally[outcome.category]++;
    }
    // Every category must be reachable at all.
    expect(tally.beneficial).toBeGreaterThan(0);
    expect(tally.community).toBeGreaterThan(0);
    expect(tally.humorous).toBeGreaterThan(0);
    expect(tally.neutral).toBeGreaterThan(0);

    // Generous tolerances around the 60/20/15/5 configured split — this is
    // a statistical check, not an exact one; it should never be flaky at
    // N=4000 with these bands.
    expect(tally.beneficial / N).toBeGreaterThan(0.45);
    expect(tally.beneficial / N).toBeLessThan(0.75);
    expect(tally.community / N).toBeGreaterThan(0.1);
    expect(tally.community / N).toBeLessThan(0.3);
    expect(tally.humorous / N).toBeGreaterThan(0.05);
    expect(tally.humorous / N).toBeLessThan(0.25);
    expect(tally.neutral / N).toBeGreaterThan(0.01);
    expect(tally.neutral / N).toBeLessThan(0.15);
  });
});

describe("F8 — offering effects apply per spec and never remove progress", () => {
  it("a beneficial draw grants the offering team its resource", () => {
    // roll=0.1*100=10 -> beneficial band [0,60); second draw selects the
    // (only) beneficial outcome in the pool via pickOne.
    const rigged = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
      rng: fixedRng([0.1, 0.1]),
    });
    rigged.dispatch({ type: "startGame" });
    presentAndComplete(rigged, "correct");
    rigged.dispatch({ type: "presentTask" });
    rigged.dispatch({ type: "spendCourage" });
    completeCurrentTask(rigged, "correct");
    expect(rigged.getPendingSurplus()).toBe(1);

    const stageSuccessesBefore = rigged.getTeam("matthew")!.stageSuccesses;
    rigged.dispatch({ type: "offerSurplus" });
    expect(rigged.getTeam("matthew")!.resources.insight).toBe(1); // off-beneficial: +1 insight
    expect(rigged.getTeam("matthew")!.stageSuccesses).toBe(stageSuccessesBefore); // progress untouched
  });

  it("a community draw grants the resource to every team", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
      // roll=0.7*100=70 -> community band [60,80).
      rng: fixedRng([0.7, 0.1]),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "spendCourage" });
    completeCurrentTask(engine, "correct");

    engine.dispatch({ type: "offerSurplus" });
    expect(engine.getTeam("matthew")!.resources.provision).toBe(1); // off-community: every team +1 provision
    expect(engine.getTeam("mark")!.resources.provision).toBe(1);
  });

  it("a humorous or neutral draw still grants Service with no material effect", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
      // roll=0.85*100=85 -> humorous band [80,95).
      rng: fixedRng([0.85, 0.1]),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "spendCourage" });
    completeCurrentTask(engine, "correct");

    const before = engine.getTeam("matthew")!;
    const beforeResources = { ...before.resources };
    const beforeStageSuccesses = before.stageSuccesses;
    engine.dispatch({ type: "offerSurplus" });
    const after = engine.getTeam("matthew")!;

    expect(after.resources).toEqual(beforeResources); // "none" effect: no material change
    expect(after.stageSuccesses).toBe(beforeStageSuccesses); // progress never removed
    expect(after.serviceScore).toBe(before.serviceScore + DEFAULTS.serviceAwards.offerSurplus);
  });
});
