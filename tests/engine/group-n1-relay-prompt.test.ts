// PHASE9_SPEC Group N1 — the relay prompt. PHASE2_SPEC says a relay's
// shared prompt "comes from nextCommunityTask(taskCategory)"; this closes
// the gap where the engine never drew one. testJourney's relay ("The
// Relay Test" at "midway") draws from testPack's single "community"
// task, community-1; the contribution event ("The Contribution Test" at
// "ford") never draws anything.

import { describe, expect, it } from "vitest";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { makeEngine, presentAndComplete, taskById, testJourney, testPack, twoTeams } from "./fixtures";

function driveToRelayPending(): GameEngine {
  const engine = makeEngine();
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct"); // matthew 1/2
  presentAndComplete(engine, "correct"); // matthew 2/2 -> s1 done -> relay pending at "midway"
  expect(engine.getState()).toBe("landmarkIntroduction");
  return engine;
}

function driveToFordEvent(): GameEngine {
  const engine = makeEngine({ startingResources: { insight: 5, provision: 5, courage: 5 } });
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // matthew s1 done -> relay pending
  engine.dispatch({ type: "beginCommunityEvent" });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // mark s1 done (event already fired) -> fork
  engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // matthew
  presentAndComplete(engine, "correct"); // matthew a-stage done -> s2
  engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // mark
  presentAndComplete(engine, "correct"); // mark a-stage done -> s2
  presentAndComplete(engine, "correct"); // matthew s2 done -> "ford" -> contribution pending

  expect(engine.getState()).toBe("landmarkIntroduction");
  engine.dispatch({ type: "beginCommunityEvent" });
  expect(engine.getState()).toBe("communityEvent");
  return engine;
}

describe("N1 — beginning a relay draws its shared community task", () => {
  it("getCommunityTaskPublic() returns the task's public view, with no answer field", () => {
    const engine = driveToRelayPending();
    expect(engine.getCommunityTaskPublic()).toBeNull(); // not yet begun

    engine.dispatch({ type: "beginCommunityEvent" });
    const publicTask = engine.getCommunityTaskPublic();
    expect(publicTask).toEqual({
      id: "community-1",
      title: "Community Relay Part",
      prompt: "Name one fruit of the Spirit.",
      hostGuidance: null,
    });
    expect(publicTask && "answer" in publicTask).toBe(false);
    expect(publicTask && "acceptedAnswers" in publicTask).toBe(false);
  });
});

describe("N1 — a contribution event never draws a community task", () => {
  it("getCommunityTaskPublic() is null throughout a contribution event", () => {
    const engine = driveToFordEvent();
    expect(engine.getCommunityTaskPublic()).toBeNull();
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 });
    expect(engine.getCommunityTaskPublic()).toBeNull();
    engine.dispatch({ type: "declineContribution", teamId: "mark" });
    engine.dispatch({ type: "resolveCommunityEvent" });
    expect(engine.getCommunityTaskPublic()).toBeNull();
  });
});

describe("N1 — resolving a relay reveals the answer and teaching, in order", () => {
  it("logs 'Community answer: …' then the teaching line, right after the success/failure line", () => {
    const engine = driveToRelayPending();
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "mark", correct: true }); // meets threshold 2
    engine.dispatch({ type: "resolveCommunityEvent" });

    const texts = engine.getSession().eventLog.map((e) => e.text);
    const successIdx = texts.indexOf("The room succeeds at The Relay Test.");
    expect(successIdx).toBeGreaterThanOrEqual(0);
    // community-1's own `answer` field already ends in a period (no forced
    // trailing period is added — matches screens.ts's `Answer: ${answer}`).
    expect(texts[successIdx + 1]).toBe("Community answer: Any of the nine.");
    expect(texts[successIdx + 2]).toBe("Galatians 5 lists nine qualities.");
  });

  it("also reveals on a FAILED relay (the task was still asked)", () => {
    const engine = driveToRelayPending();
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: false });
    engine.dispatch({ type: "relayAnswer", teamId: "mark", correct: false }); // below threshold 2
    engine.dispatch({ type: "resolveCommunityEvent" });

    const texts = engine.getSession().eventLog.map((e) => e.text);
    const failIdx = texts.indexOf("The room does not meet the goal for The Relay Test.");
    expect(failIdx).toBeGreaterThanOrEqual(0);
    expect(texts[failIdx + 1]).toBe("Community answer: Any of the nine.");
    expect(texts[failIdx + 2]).toBe("Galatians 5 lists nine qualities.");
  });
});

describe("N1 — undo of beginCommunityEvent clears the drawn task", () => {
  it("getCommunityTaskPublic() reverts to null and the state reverts to landmarkIntroduction", () => {
    const engine = driveToRelayPending();
    engine.dispatch({ type: "beginCommunityEvent" });
    expect(engine.getCommunityTaskPublic()).not.toBeNull();
    expect(engine.canUndo()).toBe(true);

    engine.dispatch({ type: "undo" });
    expect(engine.getState()).toBe("landmarkIntroduction");
    expect(engine.getCommunityTaskPublic()).toBeNull();
  });
});

describe("N1 — a task source with no community-category task", () => {
  it("begins the relay with a null task and still resolves normally", () => {
    const engine = createEngine({
      journey: testJourney,
      packs: [testPack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: createRng("n1-no-community-seed"),
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    engine.dispatch({ type: "startGame" });
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct"); // matthew s1 done -> relay pending
    expect(engine.getState()).toBe("landmarkIntroduction");

    engine.dispatch({ type: "beginCommunityEvent" });
    expect(engine.getCommunityTaskPublic()).toBeNull();

    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "mark", correct: true });
    expect(() => engine.dispatch({ type: "resolveCommunityEvent" })).not.toThrow();

    const texts = engine.getSession().eventLog.map((e) => e.text);
    expect(texts.some((t) => t.startsWith("Community answer:"))).toBe(false);
  });
});

describe("N1 — ArrayTaskSource.nextCommunityTask never shifts the ordinary draw order", () => {
  it("nextTask()'s sequence is identical with and without interleaved nextCommunityTask() calls", () => {
    const plain = new ArrayTaskSource(testPack.tasks);
    const sequence = [
      plain.nextTask("t", "s"),
      plain.nextTask("t", "s"),
      plain.nextTask("t", "s"),
      plain.nextTask("t", "s"),
    ];

    const interleaved = new ArrayTaskSource(testPack.tasks);
    const first = interleaved.nextTask("t", "s");
    interleaved.nextCommunityTask("community");
    const second = interleaved.nextTask("t", "s");
    interleaved.nextCommunityTask("community");
    interleaved.nextCommunityTask("community"); // two in a row: still no effect on nextTask
    const third = interleaved.nextTask("t", "s");
    const fourth = interleaved.nextTask("t", "s");

    expect([first, second, third, fourth]).toEqual(sequence);
  });

  it("returns null (not a throw) for a category with no task", () => {
    const source = new ArrayTaskSource([taskById("sk-easy-1")]);
    expect(source.nextCommunityTask("community")).toBeNull();
  });

  it("its own community draws cycle independently of nextTask's cursor", () => {
    const source = new ArrayTaskSource(testPack.tasks);
    const communityTasks = testPack.tasks.filter((t) => t.category === "community");
    // Only one community task in testPack; every draw returns it.
    expect(source.nextCommunityTask("community")).toEqual(communityTasks[0]);
    source.nextTask("t", "s");
    source.nextTask("t", "s");
    expect(source.nextCommunityTask("community")).toEqual(communityTasks[0]);
  });
});
