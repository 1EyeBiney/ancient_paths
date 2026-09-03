// PHASE8_SPEC Group P1 — the stage-completion reward (OPEN_QUESTIONS 28).
// finalizeStageCompletion grants DEFAULTS.stageCompletionReward before the
// milestone/community-event pause and before advancing the team, using the
// existing grantOrQueueChoice helper (no new log-line text).

import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../src/config/defaults";
import { makeEngine, presentAndComplete } from "./fixtures";

describe("P1 — the stage-completion reward", () => {
  it("queues one choice for the completing team and logs the line", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // matthew 1/2
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0);
    presentAndComplete(engine, "correct"); // matthew 2/2 -> s1 complete

    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1);
    expect(
      engine.getSession().eventLog.some((e) => e.text === "Team Matthew may choose a resource (a stage reward)."),
    ).toBe(true);
  });

  it("a perfect stage grants the reward AND a Journey Token", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // both correct -> perfect stage

    expect(engine.getTeam("matthew")!.hasJourneyToken).toBe(true);
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1);
  });

  it("is granted before the milestone event pauses play", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // s1 done -> arrives "midway" -> landmarkIntroduction

    expect(engine.getState()).toBe("landmarkIntroduction");
    // The team already holds its choice before beginCommunityEvent is even dispatched.
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1);
  });

  it("amount 0 grants nothing", () => {
    const engine = makeEngine({ config: { stageCompletionReward: { resource: "choice", amount: 0 } } });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // s1 done

    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0);
    expect(
      engine.getSession().eventLog.some((e) => e.text.includes("may choose a resource (a stage reward)")),
    ).toBe(false);
  });

  it("undo of the completing finishTeaching removes it", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct"); // matthew 1/2, not a completion
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    expect(engine.getState()).toBe("teachingReveal");
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0);

    engine.dispatch({ type: "finishTeaching" }); // completes s1 -> queues the reward
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1);
    expect(engine.canUndo()).toBe(true);

    engine.dispatch({ type: "undo" });
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0);
  });

  it("a resource-typed reward grants directly and respects the cap", () => {
    const engine = makeEngine({
      config: { stageCompletionReward: { resource: "insight", amount: 1 } },
      startingResources: { insight: DEFAULTS.resourceCap, provision: 0, courage: 0 },
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // s1 done -> insight reward, already at cap

    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0); // resource type, not "choice" -> nothing queued
    expect(engine.getTeam("matthew")!.resources.insight).toBe(DEFAULTS.resourceCap);
    expect(
      engine.getSession().eventLog.some((e) => e.text === "Team Matthew's insight is already full; 1 discarded."),
    ).toBe(true);
  });
});
