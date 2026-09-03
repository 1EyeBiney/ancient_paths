// PHASE9_SPEC Group N11 — sufficiency matrix and the two-session
// deliverable. SECRECY PROTOCOL: DeckReport/diagnostic previews carry
// counts only; task ids are safe (opaque). Never print a task's prompt,
// answer, or any other secret field.
//
// The deliverable's literal "≥40 distinct tasks per session" bar is
// unreachable for the real journey (max 34 for a 4-team session, 18 for a
// 2-team session — the ceiling is set by totalRequiredSuccesses, not pack
// size). See OPEN_QUESTIONS.md item 33 for the measurement and the ruling:
// keep every other assertion from the spec and use the actual achievable
// floor instead of the flat 40.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { recommendedTasksPerTurn } from "../../src/session/plan";
import { SetupWizard } from "../../src/ui/setup";

function loadPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(`pack failed to validate: ${result.errors.join("; ")}`);
  return result.data;
}

function loadJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(`journey failed to validate: ${result.errors.join("; ")}`);
  return result.data;
}

function makeTeams(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `team${i}`,
    name: `Team ${i}`,
    color: "#000",
    symbol: "cross",
  }));
}

describe("N11 — sufficiency: buildSessionDeck succeeds across the setup matrix", () => {
  const pack = loadPack();
  const journey = loadJourney();
  const difficulties = ["gentle", "standard", "challenging"] as const;
  const durations = ["short", "standard", "long"] as const;

  for (let teamCount = 2; teamCount <= 8; teamCount++) {
    for (const difficulty of difficulties) {
      for (const duration of durations) {
        it(`teams=${teamCount} difficulty=${difficulty} duration=${duration}: builds without SessionBuildError`, () => {
          const teamIds = makeTeams(teamCount).map((t) => t.id);
          // Duration maps to turnTaskLimit via recommendedTasksPerTurn(teamCount)
          // in the real app (src/ui/setup.ts); it does not vary by duration.
          const turnTaskLimit = recommendedTasksPerTurn(teamCount);
          expect(() =>
            buildSessionDeck({ journey, packs: [pack], teamIds, turnTaskLimit, seed: `matrix-${teamCount}-${difficulty}-${duration}`, difficulty }),
          ).not.toThrow();
        });
      }
    }
  }

  it("(4 teams, standard, standard) has no DeckReport warnings", () => {
    const teamIds = makeTeams(4).map((t) => t.id);
    const { report } = buildSessionDeck({
      journey,
      packs: [pack],
      teamIds,
      turnTaskLimit: recommendedTasksPerTurn(4),
      seed: "matrix-4-standard-standard-warnings",
      difficulty: "standard",
    });
    expect(report.warnings).toEqual([]);
  });
});

describe("N11 — the two-session deliverable", () => {
  // S11-style driver (tests/session/group-s11-engine-integration.test.ts),
  // with always-correct rulings (per spec) rather than S11's deliberate
  // single incorrect — the deliverable is about task breadth, not recovery.
  function runFullGame(seed: string, teamCount: number, excludeTaskIds: string[] = []) {
    const pack = loadPack();
    const journey = loadJourney();
    const teams = makeTeams(teamCount);
    const teamIds = teams.map((t) => t.id);
    const turnTaskLimit = recommendedTasksPerTurn(teamCount);

    const { deck } = buildSessionDeck({ journey, packs: [pack], teamIds, turnTaskLimit, seed, excludeTaskIds });
    const engine = createEngine({
      journey,
      packs: [pack],
      teams,
      turnTaskLimit,
      rng: createRng(seed),
      taskSource: deck,
    });

    engine.dispatch({ type: "startGame" });

    const communityIds: string[] = [];
    let steps = 0;
    const MAX_STEPS = 5000;

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
        // Capture before resolving: state.community (and the task it
        // holds) is cleared by cmdResolveCommunityEvent.
        const id = engine.getCommunityTaskPublic()?.id;
        if (id) communityIds.push(id);
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
        engine.dispatch({ type: "rule", result: "correct" });
        continue;
      }
      if (state === "recoverDecision") {
        // Unreachable with always-correct rulings; handled defensively.
        engine.dispatch({ type: "declineRecover" });
        continue;
      }
      if (state === "teachingReveal") {
        engine.dispatch({ type: "finishTeaching" });
        continue;
      }
      throw new Error(`Unhandled state in N11 full-game script: ${state}`);
    }

    if (steps >= MAX_STEPS) throw new Error("N11 full-game script did not terminate");
    if (engine.getState() !== "gameSummary") throw new Error("N11 full-game script did not reach gameSummary");

    const historyIds = engine.getSession().taskHistory.map((a) => a.taskId);
    const allIds = [...historyIds, ...communityIds];
    expect(engine.getSummary()).not.toBeNull();
    return allIds;
  }

  it("4 teams: session B (excluding session A's tasks) overlaps A by at most 5%, both broad", () => {
    const idsA = runFullGame("n11-deliverable-4-a", 4);
    const idsB = runFullGame("n11-deliverable-4-b", 4, idsA);

    const setA = new Set(idsA);
    const overlap = idsB.filter((id) => setA.has(id)).length;

    expect(overlap).toBeLessThanOrEqual(Math.ceil(idsB.length * 0.05));
    // Real achievable floor for 4 teams against jerusalem-rome.json is 34
    // distinct (OPEN_QUESTIONS item 33); assert with a small margin.
    expect(new Set(idsA).size).toBeGreaterThanOrEqual(30);
    expect(new Set(idsB).size).toBeGreaterThanOrEqual(30);
  });

  it("2 teams: session B (excluding session A's tasks) overlaps A by at most 5%, both broad", () => {
    const idsA = runFullGame("n11-deliverable-2-a", 2);
    const idsB = runFullGame("n11-deliverable-2-b", 2, idsA);

    const setA = new Set(idsA);
    const overlap = idsB.filter((id) => setA.has(id)).length;

    expect(overlap).toBeLessThanOrEqual(Math.ceil(idsB.length * 0.05));
    // Real achievable floor for 2 teams against jerusalem-rome.json is 18
    // distinct (OPEN_QUESTIONS item 33); assert with a small margin.
    expect(new Set(idsA).size).toBeGreaterThanOrEqual(15);
    expect(new Set(idsB).size).toBeGreaterThanOrEqual(15);
  });
});

describe("N11 — dev packs are excluded from the default enabledPackIds when general-bible is loaded", () => {
  it("only general-bible is enabled by default when all three packs are present", () => {
    const generalBible = loadPack();
    const devSample = validateContentPack(
      JSON.parse(readFileSync(resolve("public/content/packs/dev-sample.json"), "utf8")),
      "dev-sample.json",
    );
    const devPlaytest = validateContentPack(
      JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8")),
      "dev-playtest.json",
    );
    if (!devSample.ok) throw new Error(devSample.errors.join("; "));
    if (!devPlaytest.ok) throw new Error(devPlaytest.errors.join("; "));

    const journey = loadJourney();
    const wizard = new SetupWizard({
      journeys: [journey],
      packs: [generalBible, devSample.data, devPlaytest.data],
    });

    expect(wizard.enabledPackIds).toEqual(["general-bible"]);
  });
});
