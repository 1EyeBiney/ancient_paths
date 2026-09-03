// PHASE9_SPEC Group N2 — the v1.0.0 Jerusalem-to-Rome journey. Public
// content: no secrecy constraints (only tasks are secret, per the spec's
// SECRECY PROTOCOL rule 6).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateJourney } from "../../src/content/loader";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { totalRequiredSuccesses, planSession } from "../../src/session/plan";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { testJourney, testPack, twoTeams, presentAndComplete } from "../engine/fixtures";

function loadJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(`journey failed to validate: ${result.errors.join("; ")}`);
  return result.data;
}

describe("N2 — the real journey validates and has the agreed shape", () => {
  const journey = loadJourney();

  it("validates against the schema", () => {
    expect(validateJourney(JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8")), "x").ok).toBe(
      true,
    );
  });

  it("totalRequiredSuccesses is 7", () => {
    expect(totalRequiredSuccesses(journey)).toBe(7);
  });

  it("planSession gives no warning at (3 teams, standard, standard) and (2 teams, short, standard)", () => {
    const a = planSession({ journey, teamCount: 3, duration: "standard", pace: "standard" });
    expect(a.warnings).toEqual([]);
    const b = planSession({ journey, teamCount: 2, duration: "short", pace: "standard" });
    expect(b.warnings).toEqual([]);
  });

  it("estimatedMinutes is at most 70 at (4 teams, standard, standard)", () => {
    const plan = planSession({ journey, teamCount: 4, duration: "standard", pace: "standard" });
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(70);
  });

  it("every milestone has coordinates inside the journey's map viewport", () => {
    const { viewport } = journey.map!;
    for (const m of journey.milestones) {
      expect(m.coordinates, `milestone ${m.id} has coordinates`).toBeDefined();
      const { lat, lon } = m.coordinates!;
      expect(lat).toBeLessThanOrEqual(viewport.north);
      expect(lat).toBeGreaterThanOrEqual(viewport.south);
      expect(lon).toBeLessThanOrEqual(viewport.east);
      expect(lon).toBeGreaterThanOrEqual(viewport.west);
    }
  });

  it("every relay's successThreshold is at most 2 (reachable by every 2-8 team room)", () => {
    for (const event of journey.communityEvents) {
      if (event.kind === "relay") expect(event.successThreshold).toBeLessThanOrEqual(2);
    }
  });

  it("has 4 community events and 20 offering outcomes, each offering category with at least 3", () => {
    expect(journey.communityEvents).toHaveLength(4);
    expect(journey.offeringOutcomes).toHaveLength(20);
    const byCategory = new Map<string, number>();
    for (const o of journey.offeringOutcomes) byCategory.set(o.category, (byCategory.get(o.category) ?? 0) + 1);
    for (const category of ["beneficial", "community", "humorous", "neutral"]) {
      expect(byCategory.get(category) ?? 0, `offering category "${category}"`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("N2 — a community event at the destination milestone", () => {
  it("fires on the first arrival, and the arriving team is still marked finished after it resolves", () => {
    const finishEvent = {
      kind: "relay" as const,
      id: "finish-event",
      milestoneId: "finish",
      title: "The Journey's End",
      description: "A closing gathering at the destination.",
      repeatable: false,
      taskCategory: "community" as const,
      successThreshold: 1,
      reward: { type: "grant-resource-every-team" as const, resource: "choice" as const, amount: 1 },
    };
    const journey = journeySchema.parse({
      ...testJourney,
      communityEvents: [...testJourney.communityEvents, finishEvent],
    });
    const engine = createEngine({
      journey,
      packs: [testPack],
      teams: twoTeams,
      turnTaskLimit: 5,
      rng: createRng("n2-finish-event-seed"),
      taskSource: new ArrayTaskSource(testPack.tasks),
    });
    engine.dispatch({ type: "startGame" });

    // matthew: s1 -> "midway" relay pending, meet threshold 2, resolve.
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

    // mark: s1 -> "midway" (already triggered) -> fork; matthew's turn again.
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct");

    // Both teams take route-a through the fork to s2.
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // matthew
    presentAndComplete(engine, "correct"); // matthew a-stage done -> s2
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // mark
    presentAndComplete(engine, "correct"); // mark a-stage done -> s2

    // matthew: s2 -> "ford" contribution pending; decline and resolve (fails, harmless).
    presentAndComplete(engine, "correct");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "declineContribution", teamId: "matthew" });
    engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

    // mark: s2 -> "ford" (already triggered) -> matthew's turn.
    presentAndComplete(engine, "correct");

    // matthew: s3 (req 2) -> "finish" -> the new destination event pending.
    presentAndComplete(engine, "correct");
    presentAndComplete(engine, "correct");
    expect(engine.getState()).toBe("landmarkIntroduction");
    // Marked finished BEFORE the event even begins (advanceTeamToNextEntry
    // runs inside the same finishTeaching dispatch that triggered arrival).
    expect(engine.getSession().finishedTeamIds).toContain("matthew");

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true }); // meets threshold 1
    engine.dispatch({ type: "resolveCommunityEvent" });

    expect(engine.getSession().finishedTeamIds).toContain("matthew");
  });
});
