// PHASE2_SPEC Group B — turns/stages.

import { describe, expect, it } from "vitest";
import { completeCurrentTask, makeEngine, presentAndComplete } from "./fixtures";

describe("B1 — successes persist across turns", () => {
  it("a success banked in one turn is still there at the start of a later turn", () => {
    const engine = makeEngine({ turnTaskLimit: 1 });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // Matthew: 1 success, turn ends (limit reached, stage not done)
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1);
    expect(engine.getState()).toBe("beginTurn"); // Mark's turn now
    expect(engine.getSession().activeTeamIndex).toBe(1);

    presentAndComplete(engine, "correct"); // Mark's turn happens
    expect(engine.getSession().activeTeamIndex).toBe(0); // back to Matthew, round 2
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1); // still persisted
  });
});

describe("B2 — failure never erases prior successes", () => {
  it("an incorrect task after a correct one leaves the banked success intact", () => {
    const engine = makeEngine({ turnTaskLimit: 2 });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // 1/2, stays in Matthew's turn
    expect(engine.getState()).toBe("beginTurn");
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1);

    presentAndComplete(engine, "incorrect"); // task limit now reached; stage still 1/2
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1);
    expect(engine.getSession().activeTeamIndex).toBe(1); // turn ended, Mark is up
  });
});

describe("B3 — stage completes mid-turn and the turn ends immediately", () => {
  it("reaching the required successes ends the turn even with task slots left", () => {
    const engine = makeEngine({ turnTaskLimit: 3 }); // plenty of slots left after 2 tasks
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // 1/2
    expect(engine.getState()).toBe("beginTurn");
    presentAndComplete(engine, "correct"); // 2/2 -> stage complete -> arrives at "midway" -> event pending

    // Only 2 of 3 available task slots were used, yet the stage's completion
    // routed us straight into the milestone/event flow, not back to a third
    // presentTask this same turn.
    expect(engine.getState()).toBe("landmarkIntroduction");
    expect(engine.getSession().activeTeamIndex).toBe(0); // still nominally Matthew's turn, mid-event
  });
});

describe("B4 — no chaining stages within one turn", () => {
  it("a team that finishes a stage does not begin the next one before its turn ends", () => {
    const engine = makeEngine({ turnTaskLimit: 5 });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // s1 complete -> landmarkIntroduction (event pending)

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "resolveCommunityEvent" }); // room doesn't meet threshold; harmless either way

    // Turn order has now advanced to Mark; Matthew was moved to the fork
    // but never got to choose a route or attempt fork.stage tasks.
    expect(engine.getSession().activeTeamIndex).toBe(1);
    expect(engine.getTeam("matthew")!.pendingForkId).toBe("fork1");
  });
});

describe("B5 — turn ends at the task limit with progress preserved", () => {
  it("hitting the per-turn task limit ends the turn without losing partial progress", () => {
    const engine = makeEngine({ turnTaskLimit: 1 });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1);
    expect(engine.getSession().activeTeamIndex).toBe(1); // turn ended, not stuck
  });
});

describe("B6 — a declined (skipped) task is recorded as a failure", () => {
  it("skipped awards zero successes and does not offer recovery", () => {
    const engine = makeEngine({ turnTaskLimit: 1 });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "skipped" });
    expect(engine.getState()).toBe("teachingReveal"); // never recoverDecision
    engine.dispatch({ type: "finishTeaching" });
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(0);
    const last = engine.getSession().taskHistory.at(-1)!;
    expect(last.result).toBe("skipped");
    expect(last.successesAwarded).toBe(0);
  });
});

describe("B7 — a normal success is worth exactly one stage success", () => {
  it("ruling a normal-variant task correct awards 1 success", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    completeCurrentTask(engine, "correct");
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(1);
    const last = engine.getSession().taskHistory.at(-1)!;
    expect(last.successesAwarded).toBe(1);
    expect(last.variant).toBe("normal");
  });
});
