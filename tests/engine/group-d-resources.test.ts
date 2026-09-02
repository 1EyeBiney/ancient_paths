// PHASE2_SPEC Group D — resources.

import { describe, expect, it } from "vitest";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import type { TaskSource } from "../../src/engine/taskSource";
import { IllegalCommandError } from "../../src/engine/errors";
import { makeEngine, taskById } from "./fixtures";

describe("D1 — resources cap at 5, overflow is discarded and logged", () => {
  it("keepSurplus does not push a resource above its cap", () => {
    const engine = makeEngine({
      startingResources: { insight: 5, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" }); // sk-easy-1, normal
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" }); // 1/2
    engine.dispatch({ type: "finishTeaching" });

    engine.dispatch({ type: "presentTask" }); // sk-easy-2
    engine.dispatch({ type: "spendCourage" }); // amplify, costs 1 courage (team had exactly 1)
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" }); // +2 -> 3/2, surplus 1
    engine.dispatch({ type: "finishTeaching" });

    expect(engine.getState()).toBe("surplusDecision");
    engine.dispatch({ type: "keepSurplus", resource: "insight" });

    expect(engine.getTeam("matthew")!.resources.insight).toBe(5); // capped, not 6
    const log = engine.getSession().eventLog.map((e) => e.text).join(" | ");
    expect(log).toMatch(/already full/);
  });
});

describe("D2 — Insight extra-clue serves clues in order and refuses when exhausted", () => {
  it("reveals clues one at a time, then throws", () => {
    const engine = makeEngine({
      startingResources: { insight: 3, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });

    expect(engine.getCurrentTaskPublic()!.cluesRevealed).toEqual([]);
    engine.dispatch({ type: "spendInsight", effect: "extra-clue" });
    expect(engine.getCurrentTaskPublic()!.cluesRevealed).toEqual([
      "He grew up in Pharaoh's household.",
    ]);
    engine.dispatch({ type: "spendInsight", effect: "extra-clue" });
    expect(engine.getCurrentTaskPublic()!.cluesRevealed).toEqual([
      "He grew up in Pharaoh's household.",
      "He parted a sea.",
    ]);
    expect(engine.getTeam("matthew")!.resources.insight).toBe(1); // spent 2 of 3

    expect(() => engine.dispatch({ type: "spendInsight", effect: "extra-clue" })).toThrow(
      IllegalCommandError,
    );
  });
});

describe("D3 — eliminate-option only works with options, and removes an incorrect one", () => {
  it("eliminates a wrong option, never the answer, and stops at two remaining", () => {
    const engine = makeEngine({
      startingResources: { insight: 5, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]), // options: Moses, Aaron, Joshua
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    expect(engine.getCurrentTaskPublic()!.activeVariant.options).toHaveLength(3);

    engine.dispatch({ type: "spendInsight", effect: "eliminate-option" });
    const afterOne = engine.getCurrentTaskPublic()!.activeVariant.options!;
    expect(afterOne).toHaveLength(2);
    expect(afterOne).toContain("Moses"); // never eliminates the answer
    expect(afterOne).not.toEqual(["Moses", "Aaron", "Joshua"]);

    expect(() => engine.dispatch({ type: "spendInsight", effect: "eliminate-option" })).toThrow(
      IllegalCommandError,
    );
  });

  it("refuses on a task with no options at all", () => {
    const engine = makeEngine({
      startingResources: { insight: 5, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-2")]), // normalVariant has no options
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    expect(engine.getCurrentTaskPublic()!.activeVariant.options).toBeUndefined();
    expect(() => engine.dispatch({ type: "spendInsight", effect: "eliminate-option" })).toThrow(
      IllegalCommandError,
    );
  });
});

describe("D4 — Provision assist switches variant and pays its authored cost", () => {
  it("switches to the assisted prompt and deducts the authored cost resource", () => {
    const engine = makeEngine({
      startingResources: { insight: 2, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("hc-moderate-1")]), // assist costs 1 insight
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    expect(engine.getCurrentTaskPublic()!.activeVariant.kind).toBe("normal");

    engine.dispatch({ type: "spendProvision" });
    const pub = engine.getCurrentTaskPublic()!;
    expect(pub.activeVariant.kind).toBe("assisted");
    expect(pub.activeVariant.prompt).toBe("Was it the Appian Way or the King's Highway?");
    expect(engine.getTeam("matthew")!.resources.insight).toBe(1); // paid 1
  });
});

describe("D5 — Courage amplify: success awards 2", () => {
  it("an amplified correct answer awards 2 successes", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "spendCourage" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    const last = engine.getSession().taskHistory.at(-1)!;
    expect(last.variant).toBe("amplified");
    expect(last.successesAwarded).toBe(2);
  });
});

describe("D6 — Courage amplify: failure awards 0", () => {
  it("an amplified incorrect answer awards 0 successes", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 1 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "spendCourage" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "incorrect" });
    const last = engine.getSession().taskHistory.at(-1)!;
    expect(last.variant).toBe("amplified");
    expect(last.successesAwarded).toBe(0);
  });
});

describe("D7 — resource spending is locked after acceptAnswer", () => {
  it("rejects every spend command once the answer is accepted", () => {
    const engine = makeEngine({
      startingResources: { insight: 5, provision: 5, courage: 5 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });

    expect(() => engine.dispatch({ type: "spendInsight", effect: "extra-clue" })).toThrow(
      IllegalCommandError,
    );
    expect(() => engine.dispatch({ type: "spendProvision" })).toThrow(IllegalCommandError);
    expect(() => engine.dispatch({ type: "spendCourage" })).toThrow(IllegalCommandError);
    expect(() => engine.dispatch({ type: "useJourneyToken", effect: "replay" })).toThrow(
      IllegalCommandError,
    );
  });
});

describe("D8 — recovery draws a same category/difficulty replacement, same turn, no extra slot", () => {
  it("swaps in a matching replacement task without spending a second task slot", () => {
    const engine = makeEngine({
      turnTaskLimit: 2,
      startingResources: { insight: 0, provision: 1, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" }); // sk-easy-1
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "incorrect" });
    expect(engine.getState()).toBe("recoverDecision");

    engine.dispatch({ type: "acceptRecover" });
    expect(engine.getTeam("matthew")!.resources.provision).toBe(0); // paid the recover cost
    const replacement = engine.getCurrentTaskPublic()!;
    expect(replacement.category).toBe("scripture-knowledge");
    expect(replacement.difficulty).toBe("easy");
    expect(replacement.isRecoveryAttempt).toBe(true);

    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" });

    // turnTaskLimit is 2; only ONE presentTask has ever been dispatched, so
    // if recovery had silently consumed a second slot, the turn would have
    // ended here instead of allowing another task this same turn.
    expect(engine.getState()).toBe("beginTurn");
    expect(engine.getSession().activeTeamIndex).toBe(0);
  });
});

describe("D9 — recovery is unavailable when unaffordable or when no replacement exists", () => {
  it("skips recoverDecision when the team cannot afford it", () => {
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "incorrect" });
    expect(engine.getState()).toBe("teachingReveal");
  });

  it("skips recoverDecision when the task source has no matching replacement", () => {
    const noReplacementSource: TaskSource = {
      nextTask: () => taskById("hc-moderate-2"),
      nextReplacement: () => null,
      nextCommunityTask: () => taskById("community-1"),
    };
    const engine = makeEngine({
      startingResources: { insight: 0, provision: 2, courage: 0 },
      taskSource: noReplacementSource,
      rng: createRng("d9-seed"),
    });
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" }); // hc-moderate-2: full interactions, affordable provision
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "incorrect" });
    expect(engine.getState()).toBe("teachingReveal"); // affordable, but no replacement available
    expect(engine.getTeam("matthew")!.resources.provision).toBe(2); // nothing was charged
  });
});
