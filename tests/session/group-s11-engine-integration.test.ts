// PHASE3_SPEC Group S11 — engine integration: a full game driven against a
// REAL SessionDeck (not ArrayTaskSource) is deterministic under a fixed
// seed and diverges under a different one. Reuses the driving loop from
// tests/engine/full-game-smoke.test.ts against the same testJourney/
// twoTeams fixtures, swapping only the TaskSource.

import { describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import type { TaskAttempt } from "../../src/engine/types";
import { testJourney, bigPack } from "./fixtures";

const twoTeams = [
  { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
  { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
];

// Same driving script as the Phase 2 full-game smoke test: play every
// opportunity out to gameSummary, always ruling "correct" except a
// deliberate single "incorrect" on the very first opportunity (so the
// recover/teaching path really runs, same as every other game script in
// this codebase) and always declining recovery.
function runFullGame(seed: string): TaskAttempt[] {
  const pack = bigPack();
  const { deck } = buildSessionDeck({
    journey: testJourney,
    packs: [pack],
    teamIds: ["matthew", "mark"],
    turnTaskLimit: 3,
    seed,
  });

  const engine = createEngine({
    journey: testJourney,
    packs: [pack],
    teams: twoTeams,
    turnTaskLimit: 3,
    rng: createRng(seed),
    taskSource: deck,
  });

  engine.dispatch({ type: "startGame" });

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
    throw new Error(`Unhandled state in S11 full-game script: ${state}`);
  }

  if (steps >= MAX_STEPS) throw new Error("S11 full-game script did not terminate");
  if (engine.getState() !== "gameSummary") throw new Error("S11 full-game script did not reach gameSummary");

  return engine.getSession().taskHistory;
}

describe("S11 — a full game against a real SessionDeck is deterministic under a fixed seed", () => {
  it("the same seed produces an identical taskHistory across two independent runs", () => {
    const first = runFullGame("s11-integration-seed");
    const second = runFullGame("s11-integration-seed");
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("a different seed produces a different taskHistory", () => {
    const first = runFullGame("s11-integration-seed");
    const third = runFullGame("s11-a-different-seed");
    expect(third).not.toEqual(first);
  });
});
