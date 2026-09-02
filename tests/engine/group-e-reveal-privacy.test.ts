// PHASE2_SPEC Group E — reveal privacy (host-as-player, revision 1.1).

import { describe, expect, it } from "vitest";
import { IllegalCommandError } from "../../src/engine/errors";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { makeEngine, taskById } from "./fixtures";

describe("E1 — answer fields are unreadable before reveal", () => {
  it("getRevealedAnswer is null through resourceWindow and awaitingAnswer", () => {
    const engine = makeEngine({ taskSource: new ArrayTaskSource([taskById("sk-easy-1")]) });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    expect(engine.getRevealedAnswer()).toBeNull();

    const publicTask = engine.getCurrentTaskPublic()!;
    expect("answer" in publicTask).toBe(false);
    expect("acceptedAnswers" in publicTask).toBe(false);
    // "Moses" is legitimately visible here as one of the multiple-choice
    // OPTIONS — that's the task working correctly, not a privacy leak.
    // Multiple-choice display is separately verified with a no-options
    // task below, where the answer text has no legitimate reason to appear.

    engine.dispatch({ type: "acceptAnswer" });
    expect(engine.getRevealedAnswer()).toBeNull();
    expect(engine.getState()).toBe("awaitingAnswer");
  });

  it("the answer text never appears in the public view of a non-multiple-choice task", () => {
    const engine = makeEngine({ taskSource: new ArrayTaskSource([taskById("sk-easy-2")]) }); // answer: Noah, no options
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    const publicTask = engine.getCurrentTaskPublic()!;
    expect(publicTask.activeVariant.options).toBeUndefined();
    expect(JSON.stringify(publicTask)).not.toMatch(/Noah/);
  });
});

describe("E2 — answer fields are readable after reveal", () => {
  it("getRevealedAnswer returns the official answer once revealed", () => {
    const engine = makeEngine({ taskSource: new ArrayTaskSource([taskById("sk-easy-1")]) });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });

    const revealed = engine.getRevealedAnswer();
    expect(revealed).not.toBeNull();
    expect(revealed!.answer).toBe("Moses");
    expect(revealed!.acceptedAnswers).toEqual(["Moses"]);
  });

  it("reveals the amplified answer when the amplified variant is active", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "spendCourage" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    expect(engine.getRevealedAnswer()!.answer).toBe("Moses and Aaron");
  });
});

describe("E3 — reveal precedes ruling in the state order", () => {
  it("rejects rule() before reveal() has been dispatched", () => {
    const engine = makeEngine({ taskSource: new ArrayTaskSource([taskById("sk-easy-1")]) });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    expect(() => engine.dispatch({ type: "rule", result: "correct" })).toThrow(IllegalCommandError);

    engine.dispatch({ type: "reveal" });
    expect(engine.getState()).toBe("answerReveal");
    engine.dispatch({ type: "rule", result: "correct" }); // now legal
  });
});
