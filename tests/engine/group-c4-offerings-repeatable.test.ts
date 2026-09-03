// PHASE7_SPEC Group C4 — offering effects surfaced (the new "Offering
// effect: …" line) + repeatable community events.
//
// drawOfferingOutcome rolls a category first (rng call #1), then picks
// uniformly within that category (rng call #2, consumed even when the
// category holds only one outcome). Every custom pool below gives each
// category exactly one outcome, so only the FIRST scripted rng value
// (which category) actually matters; fixedRng repeats its last value
// forever, so a single value safely covers every remaining internal call
// (e.g. grant-resource/random-other-team's extra pickOne among "others").

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import type { Rng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import {
  testJourney,
  testPack,
  taskById,
  twoTeams,
  presentAndComplete,
  completeCurrentTask,
  fixedRng,
} from "./fixtures";

const offeringPackTasks = [taskById("sk-easy-1"), taskById("sk-easy-2")];

function journeyWithOfferings(offeringOutcomes: Journey["offeringOutcomes"]): Journey {
  return journeySchema.parse({ ...testJourney, offeringOutcomes });
}

const journeyA = journeyWithOfferings([
  {
    id: "a-beneficial",
    category: "beneficial",
    announcement: "A gift for the giver.",
    effect: { type: "grant-resource", target: "offering-team", resource: "courage", amount: 1 },
  },
  {
    id: "a-community",
    category: "community",
    announcement: "Everyone benefits.",
    effect: { type: "grant-resource", target: "every-team", resource: "provision", amount: 1 },
  },
  {
    id: "a-humorous",
    category: "humorous",
    announcement: "A stranger benefits.",
    effect: { type: "grant-resource", target: "random-other-team", resource: "insight", amount: 1 },
  },
  {
    id: "a-neutral",
    category: "neutral",
    announcement: "A quiet realization.",
    effect: { type: "reveal-next-stage-info" },
  },
]);

const journeyB = journeyWithOfferings([
  {
    id: "b-beneficial",
    category: "beneficial",
    announcement: "A hint is shared ahead.",
    effect: { type: "grant-clue-next-task", target: "offering-team" },
  },
  {
    id: "b-community",
    category: "community",
    announcement: "The room is fortified.",
    effect: { type: "boost-next-community-event" },
  },
  {
    id: "b-humorous",
    category: "humorous",
    announcement: "Untested filler.",
    effect: { type: "grant-resource", target: "offering-team", resource: "courage", amount: 1 },
  },
  {
    id: "b-neutral",
    category: "neutral",
    announcement: "Nothing much happens.",
    effect: { type: "none" },
  },
]);

/** A single stage, so nextEntryAfter is null — the "final stretch" branch. */
function makeFinalStretchJourney(): Journey {
  return journeySchema.parse({
    ...journeyA,
    entries: [{ kind: "stage", id: "y1", name: "Y1", requiredSuccesses: 2 }],
  });
}

/** Two plain stages in a row, so nextEntryAfter is a stage — the
 * "next stage is X, needing N successes" branch. */
function makeStageNextJourney(): Journey {
  return journeySchema.parse({
    ...journeyA,
    entries: [
      { kind: "stage", id: "x1", name: "X1", requiredSuccesses: 2 },
      { kind: "stage", id: "x2", name: "X2", requiredSuccesses: 1 },
    ],
  });
}

function createSurplusReady(journey: Journey, rng: Rng, startingCourage = 1): GameEngine {
  const engine = createEngine({
    journey,
    packs: [testPack],
    teams: twoTeams,
    turnTaskLimit: 3,
    rng,
    taskSource: new ArrayTaskSource(offeringPackTasks),
    startingResources: { insight: 0, provision: 0, courage: startingCourage },
  });
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct"); // 1/2
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "spendCourage" }); // amplify, costs the 1 courage
  completeCurrentTask(engine, "correct"); // +2 -> 3/2, surplus 1
  return engine;
}

function lastOfferingEffectLine(engine: GameEngine): string | undefined {
  return [...engine.getSession().eventLog].reverse().find((e) => e.text.startsWith("Offering effect: "))?.text;
}

describe("C4 — offering effect summaries", () => {
  it("grant-resource / offering-team", () => {
    const engine = createSurplusReady(journeyA, fixedRng([0.1]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Matthew receives 1 courage.");
  });

  it("grant-resource / every-team", () => {
    const engine = createSurplusReady(journeyA, fixedRng([0.7]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Every team receives 1 provision.");
  });

  it("grant-resource / random-other-team", () => {
    const engine = createSurplusReady(journeyA, fixedRng([0.85]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Mark receives 1 insight.");
  });

  it("reveal-next-stage-info: the fork variant (team sits on s1, next entry is fork1)", () => {
    const engine = createSurplusReady(journeyA, fixedRng([0.97]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Matthew's road divides next at The Road Divides.");
    // the existing (frozen) line is untouched:
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew learns about its next stage.")).toBe(true);
  });

  it("reveal-next-stage-info: the plain-stage variant", () => {
    const engine = createSurplusReady(makeStageNextJourney(), fixedRng([0.97]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Matthew's next stage is X2, needing 1 successes.");
  });

  it("reveal-next-stage-info: the final-stretch variant (no next entry)", () => {
    const engine = createSurplusReady(makeFinalStretchJourney(), fixedRng([0.97]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Matthew is on the final stretch.");
  });

  it("grant-clue-next-task: reveals clue 1 on the target's next task and logs the free-clue line", () => {
    const engine = createSurplusReady(journeyB, fixedRng([0.1]));
    engine.dispatch({ type: "offerSurplus" }); // s1 done (3 successes clamped to 2, surplus consumed) -> midway, relay pending
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: Team Matthew will receive a free clue on its next task.");

    // Resolve the relay so play can continue and matthew gets a fresh task.
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn
    // mark's turn: turnTaskLimit is 3, so it takes 3 no-progress tasks to end it.
    presentAndComplete(engine, "incorrect");
    presentAndComplete(engine, "incorrect");
    presentAndComplete(engine, "incorrect");
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // matthew: fork -> route-a
    engine.dispatch({ type: "presentTask" });

    expect(engine.getCurrentTaskPublic()!.cluesRevealed.length).toBe(1);
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew receives a free clue from an earlier gift.")).toBe(
      true,
    );
  });

  it("boost-next-community-event: raises the very next room reward by 1, then clears", () => {
    const engine = createSurplusReady(journeyB, fixedRng([0.7]));
    engine.dispatch({ type: "offerSurplus" }); // boosts, then s1 completes -> midway relay pending
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: The next community event's reward is strengthened.");

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // relay-event reward: grant-resource-every-team/choice/1 -> boosted to 2

    // Group P1: matthew also holds an unrelated stage-reward choice (amount 1)
    // queued when s1 completed — filter to the boosted community-event one.
    const choice = engine.getPendingChoiceDetailsForTeam("matthew").find((c) => c.reason === "a community event");
    expect(choice?.amount).toBe(2);
  });

  it("none: 'No further effect.'", () => {
    const engine = createSurplusReady(journeyB, fixedRng([0.97]));
    engine.dispatch({ type: "offerSurplus" });
    expect(lastOfferingEffectLine(engine)).toBe("Offering effect: No further effect.");
  });

  it("awardService logs the Service line on the offerSurplus path (F6)", () => {
    const engine = createSurplusReady(journeyA, fixedRng([0.1]));
    engine.dispatch({ type: "offerSurplus" });
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew earns 1 Service.")).toBe(true);
  });
});

describe("C4 — repeatable community events", () => {
  it("a repeatable relay fires again for the second team to arrive; a non-repeatable one does not (G1 unchanged)", () => {
    const repeatableJourney = journeySchema.parse({
      ...testJourney,
      communityEvents: testJourney.communityEvents.map((e) =>
        e.id === "relay-event" ? { ...e, repeatable: true } : e,
      ),
    });
    const engine = createEngine({
      journey: repeatableJourney,
      packs: [testPack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: fixedRng([0.5]),
      taskSource: new ArrayTaskSource(testPack.tasks),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // matthew s1 done -> relay triggers
    expect(engine.getState()).toBe("landmarkIntroduction");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // mark s1 done -> repeatable relay fires AGAIN
    expect(engine.getState()).toBe("landmarkIntroduction");
    engine.dispatch({ type: "beginCommunityEvent" });
    expect(
      engine.getSession().eventLog.filter((e) => e.text === "The room begins The Relay Test.").length,
    ).toBe(2);
  });

  it("without repeatable, a second arrival triggers no event (the original G1 behavior)", () => {
    const engine = createEngine({
      journey: testJourney,
      packs: [testPack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: fixedRng([0.5]),
      taskSource: new ArrayTaskSource(testPack.tasks),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // matthew s1 done -> relay triggers
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // mark s1 done -> no re-trigger
    expect(engine.getState()).not.toBe("landmarkIntroduction");
    expect(
      engine.getSession().eventLog.filter((e) => e.text === "The room begins The Relay Test.").length,
    ).toBe(1);
  });
});
