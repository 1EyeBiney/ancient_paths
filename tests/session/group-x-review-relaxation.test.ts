// Phase 10 review (Fable, 2026-09-03; OPEN_QUESTIONS item 42) — regression
// for the builder's aggregate exclusion relaxation. Real journey +
// general-bible pack (blind: ids only). Before the fix, excludeTaskIds was
// relaxed only to keep each CATEGORY servable; a session short in
// AGGREGATE (a 4-team game right after an 8-team one, with one-game
// recent-use memory) threw "insufficient content" and Begin journey
// failed for the host. X5's chain recorded that session as 0 tasks drawn.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { buildSessionDeck } from "../../src/session/builder";
import { simulateGame } from "../../src/sim/simulate";
import { CAUTIOUS } from "../../src/sim/policy";

function loadPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}
function loadJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

const pack = loadPack();
const journey = loadJourney();
const fourTeams = ["a", "b", "c", "d"];

describe("Review — aggregate exclusion relaxation", () => {
  it("a 4-team build after an 8-team game's ids are excluded relaxes (oldest first) instead of throwing", () => {
    const eight = simulateGame({ journey, packs: [pack], teamCount: 8, seed: "review-relax-8", difficulty: "standard", policies: CAUTIOUS });
    expect(eight.exhausted).toBeNull();
    expect(eight.taskIds.length).toBeGreaterThan(60); // enough to starve a 4-team session

    const { report, deck } = buildSessionDeck({
      journey,
      packs: [pack],
      teamIds: fourTeams,
      turnTaskLimit: 3,
      seed: "review-relax-4",
      excludeTaskIds: eight.taskIds,
    });
    const relaxations = report.warnings.filter((w) => w.includes("exclusion relaxed"));
    expect(relaxations.length).toBeGreaterThan(0);
    const idOf = (w: string) => /task "([^"]+)"/.exec(w)![1]!;
    // Two passes, both oldest-first: the per-category pass (keeps every
    // category servable) runs first and may pull a few ids out of overall
    // order; the aggregate pass ("projected … draws") then takes a PREFIX
    // of whatever excluded ids remain, in exclusion-list order.
    const categoryRelaxed = new Set(relaxations.filter((w) => w.includes("servable")).map(idOf));
    const aggregateRelaxed = relaxations.filter((w) => w.includes("projected")).map(idOf);
    expect(aggregateRelaxed.length).toBeGreaterThan(0);
    const uniqueExcluded = eight.taskIds.filter((id, i) => eight.taskIds.indexOf(id) === i);
    const remaining = uniqueExcluded.filter((id) => !categoryRelaxed.has(id));
    expect(aggregateRelaxed).toEqual(remaining.slice(0, aggregateRelaxed.length));
    // And only just enough: the deck exists and a real game runs on it.
    expect(deck).toBeDefined();
    const four = simulateGame({ journey, packs: [pack], teamCount: 4, seed: "review-relax-4", difficulty: "standard", policies: CAUTIOUS, excludeTaskIds: eight.taskIds });
    expect(four.exhausted).toBeNull();
    expect(four.taskIds.length).toBeGreaterThan(0);
  });

  it("the deck's last-resort pool serves a still-excluded task only once every rotation pool is empty", () => {
    const eight = simulateGame({ journey, packs: [pack], teamCount: 8, seed: "review-relax-8", difficulty: "standard", policies: CAUTIOUS });
    const { deck, report } = buildSessionDeck({
      journey,
      packs: [pack],
      teamIds: fourTeams,
      turnTaskLimit: 3,
      seed: "review-relax-lr",
      excludeTaskIds: eight.taskIds,
    });
    const excluded = new Set(eight.taskIds);
    const relaxed = new Set(report.warnings.filter((w) => w.includes("exclusion relaxed")).map((w) => /task "([^"]+)"/.exec(w)![1]!));
    const drawn: string[] = [];
    // Draw far past the pools' supply; before the review this threw
    // "every enabled category pool is exhausted" mid-game.
    for (let i = 0; i < 80; i++) drawn.push(deck.nextTask("a", "judea-road").id);
    expect(deck.getLastResortDraws()).toBeGreaterThan(0);
    // Every draw BEFORE the first last-resort one was a fresh (never-
    // excluded or relaxed) task — repeats come last, not pre-emptively.
    const firstRepeatIndex = drawn.findIndex((id) => excluded.has(id) && !relaxed.has(id));
    expect(firstRepeatIndex).toBeGreaterThan(0);
    for (const id of drawn.slice(0, firstRepeatIndex)) {
      expect(excluded.has(id) && !relaxed.has(id), `${id} repeated before the pools ran dry`).toBe(false);
    }
    expect(new Set(drawn).size, "no task is served twice within one session").toBe(drawn.length);
  });

  it("with no shortfall, nothing is relaxed (the per-category rule alone still governs)", () => {
    const two = simulateGame({ journey, packs: [pack], teamCount: 2, seed: "review-relax-2", difficulty: "standard", policies: CAUTIOUS });
    const { report } = buildSessionDeck({
      journey,
      packs: [pack],
      teamIds: fourTeams,
      turnTaskLimit: 3,
      seed: "review-relax-4b",
      excludeTaskIds: two.taskIds,
    });
    expect(report.warnings.filter((w) => w.includes("exclusion relaxed"))).toEqual([]);
  });

  it("excluding every task in the pack still builds — everything relaxes, in order", () => {
    const allIds = pack.tasks.map((t) => t.id);
    const { report } = buildSessionDeck({
      journey,
      packs: [pack],
      teamIds: fourTeams,
      turnTaskLimit: 3,
      seed: "review-relax-all",
      excludeTaskIds: allIds,
    });
    expect(report.warnings.some((w) => w.includes("exclusion relaxed"))).toBe(true);
  });
});
