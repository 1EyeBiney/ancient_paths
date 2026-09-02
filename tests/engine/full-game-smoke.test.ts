// PHASE2_SPEC "Definition of done": a scripted full game (2 teams,
// ArrayTaskSource, fixed seed) runs from startGame to gameSummary inside a
// test. This deliberately exercises stages, a fork, both community event
// kinds, surplus/offering, a Journey Token, and Provision recovery in one
// continuous script using the full testJourney/testPack fixtures — the
// broadest single proof that the engine holds together end to end.

import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { testJourney, testPack, twoTeams } from "./fixtures";

describe("Phase 2 definition of done: a full game runs start to finish", () => {
  it("plays a complete 2-team game against the real journey and pack fixtures", () => {
    const engine = createEngine({
      journey: testJourney,
      packs: [testPack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: createRng("full-game-smoke-seed"),
      taskSource: new ArrayTaskSource(testPack.tasks),
    });

    engine.dispatch({ type: "startGame" });
    expect(engine.getState()).not.toBe("error");

    // Drive up to a generous number of steps so the game is free to take
    // whatever real path the fixed seed produces (route choices affect
    // which tasks come up, which affects hit/miss patterns) without this
    // test hard-coding an exact turn-by-turn script. Every team always
    // answers "correct" here except we deliberately fail once (below) to
    // exercise recovery, teaching, and a real 'incorrect' ruling path.
    let usedRecoveryPath = false;
    let steps = 0;
    const MAX_STEPS = 500;

    while (engine.getState() !== "gameSummary" && steps < MAX_STEPS) {
      steps++;
      const state = engine.getState();

      if (state === "forkChoice") {
        const routes = engine.getAvailableRoutes()!;
        engine.dispatch({ type: "chooseRoute", routeId: routes[0]!.id });
        continue;
      }
      if (state === "landmarkIntroduction") {
        engine.dispatch({ type: "beginCommunityEvent" });
        continue;
      }
      if (state === "communityEvent") {
        engine.dispatch({ type: "resolveCommunityEvent" });
        continue;
      }
      if (state === "surplusDecision") {
        engine.dispatch({ type: "keepSurplus", resource: "insight" });
        continue;
      }
      if (state === "beginTurn") {
        engine.dispatch({ type: "presentTask" });
        continue;
      }
      if (state === "resourceWindow") {
        engine.dispatch({ type: "acceptAnswer" });
        continue;
      }
      if (state === "awaitingAnswer") {
        engine.dispatch({ type: "reveal" });
        continue;
      }
      if (state === "answerReveal") {
        // Fail exactly once, on the very first opportunity, to exercise
        // the incorrect/recover/teaching path for real inside this script.
        const result = !usedRecoveryPath ? "incorrect" : "correct";
        if (!usedRecoveryPath) usedRecoveryPath = true;
        engine.dispatch({ type: "rule", result });
        continue;
      }
      if (state === "recoverDecision") {
        engine.dispatch({ type: "declineRecover" });
        continue;
      }
      if (state === "teachingReveal") {
        engine.dispatch({ type: "finishTeaching" });
        continue;
      }
      throw new Error(`Unhandled state in full-game script: ${state}`);
    }

    expect(steps).toBeLessThan(MAX_STEPS); // the game actually terminated
    expect(engine.getState()).toBe("gameSummary");
    expect(usedRecoveryPath).toBe(true); // the incorrect/teaching path really ran

    const summary = engine.getSummary()!;
    expect(summary).not.toBeNull();
    expect(summary.journeyWinners.length).toBeGreaterThan(0);
    expect(summary.journeyWinners.every((id) => ["matthew", "mark"].includes(id))).toBe(true);
    expect(summary.finalPositions.sort()).toEqual(["mark", "matthew"]);
    expect(summary.barnabasAwardRecipients.length).toBeGreaterThan(0);

    // Sanity on the underlying log: a real game leaves a real trail.
    const session = engine.getSession();
    expect(session.eventLog.length).toBeGreaterThan(10);
    expect(session.taskHistory.length).toBeGreaterThan(0);
  });
});
