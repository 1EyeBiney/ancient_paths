// PHASE7_SPEC Group C3 — sharing a granted resource (§11 "voluntarily
// sharing an eligible reward"). testJourney's relay-event reward is
// grant-resource-every-team / choice / 1, the simplest way to put a
// shareable pending choice in front of every team without touching
// surplus mechanics.

import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../src/config/defaults";
import { makeEngine, presentAndComplete } from "./fixtures";
import type { GameEngine } from "../../src/engine/engine";
import { IllegalCommandError } from "../../src/engine/errors";

function driveToRelayReward(): GameEngine {
  const engine = makeEngine();
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // matthew 2/2 -> s1 done -> relay event
  engine.dispatch({ type: "beginCommunityEvent" });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "resolveCommunityEvent" }); // success -> every team gets a pending "choice"
  return engine;
}

describe("C3 — sharing a granted resource", () => {
  it("moves the pending choice, awards the sharer Service, and logs the gift", () => {
    const engine = driveToRelayReward();
    // Group P1: matthew's s1 completion also queued a stage-reward choice,
    // so matthew holds 2 (stage reward + relay reward) before sharing one away.
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(2);
    expect(engine.getPendingChoicesForTeam("mark")).toBe(1);
    const serviceBefore = engine.getTeam("matthew")!.serviceScore;

    engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "mark" });

    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1); // Group P1: one choice remains (the stage reward)
    expect(engine.getPendingChoicesForTeam("mark")).toBe(2); // mark's own + matthew's gift
    expect(engine.getTeam("matthew")!.serviceScore - serviceBefore).toBe(DEFAULTS.serviceAwards.chooseCommunityBenefit);
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew shares its gift with Team Mark.")).toBe(true);
  });

  it("the recipient resolves both pending choices normally via chooseGrantedResource", () => {
    const engine = driveToRelayReward();
    engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "mark" });
    const before = engine.getTeam("mark")!.resources.insight;
    engine.dispatch({ type: "chooseGrantedResource", teamId: "mark", resource: "insight" });
    engine.dispatch({ type: "chooseGrantedResource", teamId: "mark", resource: "provision" });
    expect(engine.getTeam("mark")!.resources.insight).toBe(before + 1);
    expect(engine.getTeam("mark")!.resources.provision).toBe(1);
    expect(engine.getPendingChoicesForTeam("mark")).toBe(0);
  });

  it("rejects sharing with yourself", () => {
    const engine = driveToRelayReward();
    expect(() => engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "matthew" })).toThrow(
      IllegalCommandError,
    );
  });

  it("rejects sharing with a nonexistent team", () => {
    const engine = driveToRelayReward();
    expect(() => engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "nobody" })).toThrow(
      IllegalCommandError,
    );
  });

  it("rejects sharing when the sender has no pending choice", () => {
    const engine = driveToRelayReward();
    // Group P1: matthew now holds 2 choices (stage reward + relay reward) — resolve both.
    engine.dispatch({ type: "chooseGrantedResource", teamId: "matthew", resource: "insight" });
    engine.dispatch({ type: "chooseGrantedResource", teamId: "matthew", resource: "provision" });
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(0);
    expect(() => engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "mark" })).toThrow(
      IllegalCommandError,
    );
  });

  it("a received gift cannot itself be re-shared", () => {
    const engine = driveToRelayReward();
    engine.dispatch({ type: "chooseGrantedResource", teamId: "mark", resource: "provision" }); // clears mark's own choice
    expect(engine.getPendingChoicesForTeam("mark")).toBe(0);
    engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "mark" }); // mark now holds only a gift
    expect(engine.getPendingChoicesForTeam("mark")).toBe(1);
    expect(() => engine.dispatch({ type: "shareGrantedResource", teamId: "mark", toTeamId: "matthew" })).toThrow(
      IllegalCommandError,
    );
  });

  it("undo reverts a share completely: Service, both queues, and the log", () => {
    const engine = driveToRelayReward();
    const serviceBefore = engine.getTeam("matthew")!.serviceScore;
    const logLengthBefore = engine.getSession().eventLog.length;

    engine.dispatch({ type: "shareGrantedResource", teamId: "matthew", toTeamId: "mark" });
    expect(engine.canUndo()).toBe(true);
    engine.dispatch({ type: "undo" });

    // Group P1: matthew holds 2 choices (stage reward + relay reward) before sharing.
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(2);
    expect(engine.getPendingChoicesForTeam("mark")).toBe(1);
    expect(engine.getTeam("matthew")!.serviceScore).toBe(serviceBefore);
    expect(engine.getSession().eventLog).toHaveLength(logLengthBefore);
  });
});
