// PHASE2_SPEC Group I — undo and the event log, plus the duration estimator.

import { describe, expect, it } from "vitest";
import { estimateMinutes } from "../../src/engine/estimator";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { makeEngine, taskById } from "./fixtures";

describe("I1 — undo restores the complete prior state", () => {
  it("undo after any command reverts the session to exactly its prior snapshot", () => {
    const engine = makeEngine({
      startingResources: { insight: 3, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    const before = engine.getSession();

    engine.dispatch({ type: "spendInsight", effect: "extra-clue" });
    expect(engine.getSession()).not.toEqual(before); // sanity: something really changed

    expect(engine.canUndo()).toBe(true);
    engine.dispatch({ type: "undo" });
    expect(engine.getSession()).toEqual(before);
    expect(engine.getTeam("matthew")!.resources.insight).toBe(3); // spend was fully reverted
  });
});

describe("I2 — undo recovers from a wrong host ruling", () => {
  it("undoing an accidental 'incorrect' ruling restores the pre-ruling state", () => {
    const engine = makeEngine({ taskSource: new ArrayTaskSource([taskById("sk-easy-1")]) });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    const beforeRuling = engine.getSession();

    engine.dispatch({ type: "rule", result: "incorrect" }); // host meant to press correct
    expect(engine.getSession().taskHistory).toHaveLength(1);

    engine.dispatch({ type: "undo" });
    expect(engine.getSession()).toEqual(beforeRuling);
    expect(engine.getSession().taskHistory).toHaveLength(0);
    expect(engine.getState()).toBe("answerReveal"); // free to rule again

    engine.dispatch({ type: "rule", result: "correct" }); // the correction
    expect(engine.getSession().taskHistory.at(-1)!.result).toBe("correct");
  });
});

describe("I3 — every consequential command appends a readable event", () => {
  it("the log grows with a human-readable line for each command in a normal sequence", () => {
    const engine = makeEngine({
      startingResources: { insight: 2, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    let count = engine.getSession().eventLog.length;
    const grew = () => {
      const now = engine.getSession().eventLog.length;
      const didGrow = now > count;
      count = now;
      return didGrow;
    };

    engine.dispatch({ type: "startGame" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "presentTask" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "spendInsight", effect: "extra-clue" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "acceptAnswer" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "reveal" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "rule", result: "correct" });
    expect(grew()).toBe(true);
    engine.dispatch({ type: "finishTeaching" });

    for (const event of engine.getSession().eventLog) {
      expect(event.text.length).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("string");
    }
  });
});

describe("I4 — the duration estimator", () => {
  it("computes rounds and minutes per its documented formula", () => {
    // The worked example from PHASE2_SPEC.md: 4 teams, 3 tasks/turn, 9
    // required successes, 2 community events, using the formula's own
    // literal default constants (avgTaskSeconds 45, turnOverheadSeconds 50,
    // successRate 0.65, communityEventMinutes 3, fixedOverheadMinutes 5).
    //
    // KNOWN SPEC DISCREPANCY (recorded in OPEN_QUESTIONS.md): the spec
    // claims this example lands at "50-60 min," but the formula it
    // specifies, run against its own stated defaults, actually computes
    // ~72.7 minutes. That gap comes from turnOverheadSeconds=50s, not from
    // this implementation — reducing it to roughly 5-15s (with these same
    // inputs) is what would land the example in the claimed range. Per
    // CLAUDE.md's rule not to silently alter a spec value, this test
    // verifies the formula is implemented correctly (i.e., matches what it
    // actually specifies), not the unreachable 50-60 min claim.
    const result = estimateMinutes({
      teamCount: 4,
      tasksPerTurn: 3,
      totalRequiredSuccesses: 9,
      communityEventCount: 2,
    });
    expect(result.estimatedRounds).toBe(5); // ceil(9 / (3*0.65)) = ceil(4.615) = 5
    expect(result.estimatedMinutes).toBeCloseTo(72.67, 1);
  });

  it("is monotonic: more required successes never decreases the estimate", () => {
    const base = estimateMinutes({
      teamCount: 4,
      tasksPerTurn: 3,
      totalRequiredSuccesses: 6,
      communityEventCount: 1,
    });
    const more = estimateMinutes({
      teamCount: 4,
      tasksPerTurn: 3,
      totalRequiredSuccesses: 12,
      communityEventCount: 1,
    });
    expect(more.estimatedMinutes).toBeGreaterThan(base.estimatedMinutes);
  });

  it("respects overridden constants", () => {
    const result = estimateMinutes({
      teamCount: 2,
      tasksPerTurn: 4,
      totalRequiredSuccesses: 4,
      communityEventCount: 0,
      avgTaskSeconds: 30,
      turnOverheadSeconds: 10,
      successRate: 1,
      fixedOverheadMinutes: 0,
    });
    // successesPerTurn=4, rounds=ceil(4/4)=1; minutesPerTurn=(4*30+10)/60=130/60
    // minutes = 2*1*(130/60) = 4.333
    expect(result.estimatedRounds).toBe(1);
    expect(result.estimatedMinutes).toBeCloseTo(4.333, 2);
  });
});
