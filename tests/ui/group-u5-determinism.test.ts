// PHASE4_SPEC Group U5 — determinism through the UI.

import { describe, expect, it } from "vitest";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { SetupWizard } from "../../src/ui/setup";
import { testJourney, bigPack } from "../session/fixtures";

function engineFromWizard(wizard: SetupWizard): GameEngine {
  const { deck } = buildSessionDeck(wizard.toBuildOptions());
  return createEngine({
    journey: wizard.journey!,
    packs: wizard.packs,
    teams: wizard.toTeamSetups(),
    turnTaskLimit: wizard.effectiveTasksPerTurn(),
    rng: createRng(wizard.seed),
    taskSource: deck,
  });
}

/** Drives a game to completion (or up to `limit` served tasks, whichever
 * comes first), always ruling correct — this test is about draw-sequence
 * determinism, not exercising recovery/community mechanics (covered
 * elsewhere). testJourney's real length produces well under 20 tasks for
 * a 2-team always-correct run, so `limit` is a safety cap, not a target. */
function collectServedTaskIds(engine: GameEngine, limit = 500): string[] {
  const ids: string[] = [];
  if (engine.getState() === "ready") engine.dispatch({ type: "startGame" });

  let steps = 0;
  const MAX_STEPS = 2000;
  while (ids.length < limit && engine.getState() !== "gameSummary" && steps < MAX_STEPS) {
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
      ids.push(engine.getCurrentTaskPublic()!.id);
      engine.dispatch({ type: "acceptAnswer" });
      continue;
    }
    if (state === "awaitingAnswer") {
      engine.dispatch({ type: "reveal" });
      continue;
    }
    if (state === "answerReveal") {
      engine.dispatch({ type: "rule", result: "correct" });
      continue;
    }
    if (state === "teachingReveal") {
      engine.dispatch({ type: "finishTeaching" });
      continue;
    }
    throw new Error(`U5 driving script: unhandled state "${state}"`);
  }
  if (steps >= MAX_STEPS) throw new Error("U5 driving script did not terminate");
  return ids;
}

function wizardWithSeed(seed: string): SetupWizard {
  const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
  wizard.setSeed(seed);
  return wizard;
}

describe("U5 — the same typed seed produces the same served tasks", () => {
  it("two independent setups with an identical seed match on every served task", () => {
    const engineA = engineFromWizard(wizardWithSeed("u5-same-seed"));
    const engineB = engineFromWizard(wizardWithSeed("u5-same-seed"));
    const idsA = collectServedTaskIds(engineA);
    const idsB = collectServedTaskIds(engineB);
    expect(idsA.length).toBeGreaterThanOrEqual(8); // guard against a vacuous pass
    expect(idsB).toEqual(idsA);
  });

  it("a different seed diverges", () => {
    const engineA = engineFromWizard(wizardWithSeed("u5-seed-one"));
    const engineC = engineFromWizard(wizardWithSeed("u5-seed-two"));
    const idsA = collectServedTaskIds(engineA);
    const idsC = collectServedTaskIds(engineC);
    expect(idsC).not.toEqual(idsA);
  });
});

describe("U5 — the throwaway-deck rule: previewing during setup never changes the real game", () => {
  it("a run that previews on a throwaway deck matches a run that never previews at all", () => {
    const seed = "u5-preview-rule-seed";

    // Run 1: build a THROWAWAY deck and consume some of its preview/draw
    // stream during "setup", exactly as the setup wizard's live-preview
    // screens would, then discard it and build the REAL deck fresh.
    const previewWizard = wizardWithSeed(seed);
    const throwaway = buildSessionDeck(previewWizard.toBuildOptions()).deck;
    throwaway.previewPlan("team-1", 5);
    throwaway.previewPlan("team-2", 5);
    throwaway.nextTask("team-1", "s1");
    throwaway.nextTask("team-2", "s1");
    // Discard `throwaway` entirely; build the real engine off a FRESH deck
    // from the same options/seed, per the determinism rule.
    const engineWithPreview = engineFromWizard(previewWizard);
    const idsWithPreview = collectServedTaskIds(engineWithPreview);

    // Run 2: identical seed, no preview activity at all.
    const engineNoPreview = engineFromWizard(wizardWithSeed(seed));
    const idsNoPreview = collectServedTaskIds(engineNoPreview);

    expect(idsWithPreview.length).toBeGreaterThanOrEqual(8);
    expect(idsWithPreview).toEqual(idsNoPreview);
  });
});
