// PHASE2_SPEC Group C — forks.

import { describe, expect, it } from "vitest";
import { IllegalCommandError } from "../../src/engine/errors";
import { advanceBothTeamsToFork as advanceBothTeamsToForkShared, makeEngine, presentAndComplete } from "./fixtures";
import type { GameEngine } from "../../src/engine/engine";

// Local wrapper adds the state assertions this file relies on before every use.
function advanceBothTeamsToFork(engine: GameEngine): void {
  advanceBothTeamsToForkShared(engine);
  expect(engine.getState()).toBe("forkChoice");
  expect(engine.getSession().activeTeamIndex).toBe(0); // Matthew
}

describe("C1 — route info is readable before choosing", () => {
  it("lists both routes with name, description, and difficulty", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine);
    const routes = engine.getAvailableRoutes();
    expect(routes).not.toBeNull();
    expect(routes!.map((r) => r.id).sort()).toEqual(["route-a", "route-b"]);
    const a = routes!.find((r) => r.id === "route-a")!;
    expect(a.name).toBe("Route A");
    expect(a.description).toMatch(/easier/i);
    expect(a.difficulty).toBe("easy");
  });

  it("returns null outside forkChoice", () => {
    const engine = makeEngine();
    engine.dispatch({ type: "startGame" });
    expect(engine.getAvailableRoutes()).toBeNull();
  });
});

describe("C2 — a chosen route locks until the stage completes", () => {
  it("rejects a second chooseRoute once one has been made", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine);
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    expect(engine.getTeam("matthew")!.selectedRouteId).toBe("route-a");
    expect(() => engine.dispatch({ type: "chooseRoute", routeId: "route-b" })).toThrow(
      IllegalCommandError,
    );
    // still locked to the original choice
    expect(engine.getTeam("matthew")!.selectedRouteId).toBe("route-a");
  });
});

describe("C3 — different teams may choose independently", () => {
  it("Matthew and Mark can pick different routes at the same fork", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine);

    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    presentAndComplete(engine, "correct"); // a-stage requires 1; completes, turn ends -> Mark

    expect(engine.getSession().activeTeamIndex).toBe(1);
    expect(engine.getState()).toBe("forkChoice");

    engine.dispatch({ type: "chooseRoute", routeId: "route-b" });
    presentAndComplete(engine, "correct"); // b-stage requires 1; completes

    expect(engine.getTeam("matthew")!.selectedRouteId).toBe("route-a");
    expect(engine.getTeam("mark")!.selectedRouteId).toBe("route-b");
  });
});

describe("C4 — routes rejoin at the entry following the fork", () => {
  it("both routes land the team on stage s2", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine);

    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    presentAndComplete(engine, "correct");
    expect(engine.getTeam("matthew")!.currentStageId).toBe("s2");

    engine.dispatch({ type: "chooseRoute", routeId: "route-b" });
    presentAndComplete(engine, "correct");
    expect(engine.getTeam("mark")!.currentStageId).toBe("s2");
  });
});
