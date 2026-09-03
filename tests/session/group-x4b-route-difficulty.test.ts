// PHASE10_SPEC Group X4b — a fork route's own `difficulty` now shifts its
// stages' draw weights one step relative to the session setting (OPEN_
// QUESTIONS item 35's finding: today's `route.difficulty` was descriptive
// only, so the route with fewer required successes was always strictly
// dominant — same odds per task, fewer tasks needed).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateJourney } from "../../src/content/loader";
import type { Journey } from "../../src/content/schemas";
import { buildSessionDeck } from "../../src/session/builder";
import { bigPack, defaultBuildOptions, driveManyCategories } from "./fixtures";

function loadRealJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

const realJourney = loadRealJourney();

function drawDifficultiesFor(stageId: string, difficulty: "gentle" | "standard" | "challenging", seed: string, count: number): string[] {
  const { deck } = buildSessionDeck({
    journey: realJourney,
    packs: [bigPack()],
    teamIds: ["alpha", "beta"],
    turnTaskLimit: 3,
    seed,
    difficulty,
  });
  const difficulties: string[] = [];
  for (let i = 0; i < count; i++) difficulties.push(deck.nextTask("alpha", stageId).difficulty);
  return difficulties;
}

function shareOf(difficulties: string[], target: string): number {
  return difficulties.filter((d) => d === target).length / difficulties.length;
}

describe("X4b — route difficulty shifts the draw-weight row", () => {
  it("mountain-1 (hard route) at standard skews toward the challenging row (hard share ~40% +/- 8 over 400 draws)", () => {
    const draws = drawDifficultiesFor("mountain-1", "standard", "x4b-mountain-standard", 400);
    const hardShare = shareOf(draws, "hard");
    expect(hardShare).toBeGreaterThanOrEqual(0.32);
    expect(hardShare).toBeLessThanOrEqual(0.48);
  });

  it("coastal-1 (easy route) at standard skews toward the gentle row (easy share ~50% +/- 8 over 400 draws)", () => {
    const draws = drawDifficultiesFor("coastal-1", "standard", "x4b-coastal-standard", 400);
    const easyShare = shareOf(draws, "easy");
    expect(easyShare).toBeGreaterThanOrEqual(0.42);
    expect(easyShare).toBeLessThanOrEqual(0.58);
  });

  it("asia-minor-road (a plain stage, not in any fork route) draws at the plain standard row", () => {
    const draws = drawDifficultiesFor("asia-minor-road", "standard", "x4b-plain-standard", 400);
    // Standard row: easy 30%, moderate 50%, hard 20% — a wide but real band.
    expect(shareOf(draws, "easy")).toBeGreaterThanOrEqual(0.22);
    expect(shareOf(draws, "easy")).toBeLessThanOrEqual(0.38);
    expect(shareOf(draws, "hard")).toBeGreaterThanOrEqual(0.12);
    expect(shareOf(draws, "hard")).toBeLessThanOrEqual(0.28);
  });

  it("gentle + an easy route stays gentle (clamped, can't get gentler)", () => {
    const draws = drawDifficultiesFor("coastal-1", "gentle", "x4b-coastal-gentle", 400);
    // Gentle row: easy 50%, moderate 40%, hard 10%.
    expect(shareOf(draws, "easy")).toBeGreaterThanOrEqual(0.42);
    expect(shareOf(draws, "easy")).toBeLessThanOrEqual(0.58);
  });

  it("challenging + a hard route stays challenging (clamped, can't get harder)", () => {
    const draws = drawDifficultiesFor("mountain-1", "challenging", "x4b-mountain-challenging", 400);
    // Challenging row: easy 15%, moderate 45%, hard 40%.
    expect(shareOf(draws, "hard")).toBeGreaterThanOrEqual(0.32);
    expect(shareOf(draws, "hard")).toBeLessThanOrEqual(0.48);
  });

  it("moderate routes are unaffected: inland-1 draws at the plain session row", () => {
    const draws = drawDifficultiesFor("inland-1", "standard", "x4b-inland-standard", 400);
    expect(shareOf(draws, "moderate")).toBeGreaterThanOrEqual(0.42);
    expect(shareOf(draws, "moderate")).toBeLessThanOrEqual(0.58);
  });

  it("determinism under a fixed seed still holds (S1's guarantee, unaffected by X4b)", () => {
    const a = drawDifficultiesFor("mountain-1", "standard", "x4b-determinism", 50);
    const b = drawDifficultiesFor("mountain-1", "standard", "x4b-determinism", 50);
    expect(b).toEqual(a);
  });

  it("categories still rotate normally on a route-difficulty-shifted stage (S6-style sanity check)", () => {
    const { deck } = buildSessionDeck(defaultBuildOptions({ journey: realJourney, teamIds: ["alpha", "beta"] }));
    const byTeam = driveManyCategories(deck, ["alpha"], "mountain-1", 20);
    const categories = new Set(byTeam.alpha);
    // mountain-1's route focus: bible-reasoning, historical-context.
    expect(categories).toEqual(new Set(["bible-reasoning", "historical-context"]));
  });
});
