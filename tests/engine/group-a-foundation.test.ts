// PHASE2_SPEC Group A — foundation.

import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { IllegalCommandError } from "../../src/engine/errors";
import { makeEngine, testJourney, testPack, twoTeams } from "./fixtures";

describe("A1 — engine boots with valid content and 2-8 teams", () => {
  it("boots with two teams", () => {
    const engine = makeEngine();
    expect(engine.getState()).toBe("ready");
  });

  it("boots with eight teams", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      id: `team${i}`,
      name: `Team ${i}`,
      color: "#000",
      symbol: "x",
    }));
    const engine = makeEngine({ teams: eight });
    expect(engine.getState()).toBe("ready");
  });
});

describe("A2 — rejects team counts outside 2-8", () => {
  it("rejects a single team", () => {
    expect(() =>
      createEngine({
        journey: testJourney,
        packs: [testPack],
        teams: [twoTeams[0]!],
        turnTaskLimit: 3,
        rng: createRng("s"),
        taskSource: new ArrayTaskSource(testPack.tasks),
      }),
    ).toThrow();
  });

  it("rejects nine teams", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({
      id: `team${i}`,
      name: `Team ${i}`,
      color: "#000",
      symbol: "x",
    }));
    expect(() => makeEngine({ teams: nine })).toThrow();
  });
});

describe("A3 — identical seed reproduces identical rng draws", () => {
  it("two Rngs from the same seed produce the same sequence", () => {
    const a = createRng("same-seed-123");
    const b = createRng("same-seed-123");
    const drawsA = Array.from({ length: 20 }, () => a.next());
    const drawsB = Array.from({ length: 20 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it("different seeds diverge", () => {
    const a = createRng("seed-one");
    const b = createRng("seed-two");
    const drawsA = Array.from({ length: 20 }, () => a.next());
    const drawsB = Array.from({ length: 20 }, () => b.next());
    expect(drawsA).not.toEqual(drawsB);
  });
});

describe("A4 — illegal commands throw and mutate nothing", () => {
  it("throws IllegalCommandError and leaves state untouched", () => {
    const engine = makeEngine();
    const before = engine.getSession();
    expect(() => engine.dispatch({ type: "presentTask" })).toThrow(IllegalCommandError);
    expect(engine.getSession()).toEqual(before);
  });

  it("rejects rule() before reveal()", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    const before = engine.getSession();
    expect(() => engine.dispatch({ type: "rule", result: "correct" })).toThrow(IllegalCommandError);
    expect(engine.getSession()).toEqual(before);
  });
});

describe("A5 — statusText follows the §23.3 order", () => {
  it("mentions team, location, successes, tasks remaining, and resources in order", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    const text = engine.statusText();

    const teamIdx = text.indexOf("Matthew");
    const locationIdx = text.indexOf("First Leg");
    const successesIdx = text.indexOf("0 of 2 successes");
    const tasksIdx = text.indexOf("remaining this turn");
    const insightIdx = text.indexOf("Insight");
    const provisionIdx = text.indexOf("Provision");
    const courageIdx = text.indexOf("Courage");
    const tokenIdx = text.indexOf("Journey Token");

    expect(teamIdx).toBeGreaterThanOrEqual(0);
    expect(locationIdx).toBeGreaterThan(teamIdx);
    expect(successesIdx).toBeGreaterThan(locationIdx);
    expect(tasksIdx).toBeGreaterThan(successesIdx);
    expect(insightIdx).toBeGreaterThan(tasksIdx);
    expect(provisionIdx).toBeGreaterThan(insightIdx);
    expect(courageIdx).toBeGreaterThan(provisionIdx);
    expect(tokenIdx).toBeGreaterThan(courageIdx);
  });
});
