// PHASE3_SPEC Group S9 — exclusions and the sufficiency check.

import { describe, expect, it } from "vitest";
import {
  journeySchema,
  contentPackSchema,
  TASK_CATEGORIES,
  type Journey,
  type ContentPack,
} from "../../src/content/schemas";
import { buildSessionDeck, SessionBuildError } from "../../src/session/builder";
import { makeSyntheticTask } from "./factory";
import { defaultBuildOptions, bigPack } from "./fixtures";

// A minimal 1-stage journey (requiredSuccesses: 1, no community events) so
// projectedDraws is small and predictable: with 2 teams and a given
// turnTaskLimit T, successesPerTurn = T*0.65, rounds = ceil(1/that) = 1
// for any T >= 2, so projectedDraws = teamCount * 1 * turnTaskLimit.
const minimalJourney: Journey = journeySchema.parse({
  journeyId: "s9-minimal-journey",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Minimal Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
  ],
  entries: [{ kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" }],
  communityEvents: [],
  offeringOutcomes: [
    { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
    { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
    { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
    { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
  ],
});

function packWithTotalCount(n: number): ContentPack {
  const tasks = [];
  const difficulties = ["easy", "moderate", "hard"] as const;
  for (let i = 0; i < n; i++) {
    tasks.push(makeSyntheticTask(TASK_CATEGORIES[i % TASK_CATEGORIES.length]!, difficulties[i % 3]!, i));
  }
  return contentPackSchema.parse({
    packId: "synthetic-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "S9 count-controlled pack",
    tasks,
  });
}

describe("S9 — excluded task ids are never served", () => {
  it("draws never include an excluded id, across a full session", () => {
    const { deck: probe } = buildSessionDeck(defaultBuildOptions({ teamIds: ["alpha", "beta"] }));
    const excludeIds = new Set<string>();
    for (let i = 0; i < 20; i++) excludeIds.add(probe.nextTask("alpha", "s1").id);

    const { deck } = buildSessionDeck(
      defaultBuildOptions({ teamIds: ["alpha", "beta"], excludeTaskIds: [...excludeIds] }),
    );
    for (let i = 0; i < 100; i++) {
      const task = deck.nextTask("alpha", "s1");
      expect(excludeIds.has(task.id)).toBe(false);
    }
  });
});

describe("S9 — over-exclusion relaxes the oldest exclusion first, and warns", () => {
  it("excluding every task in a category un-excludes the first-listed one to keep it servable", () => {
    // Deliberately scarce: exactly 3 scripture-knowledge tasks, everything
    // else adequately stocked so only THIS category is ever at risk.
    const tasks = [
      makeSyntheticTask("scripture-knowledge", "easy", 1),
      makeSyntheticTask("scripture-knowledge", "easy", 2),
      makeSyntheticTask("scripture-knowledge", "easy", 3),
    ];
    let idx = 100;
    for (const category of TASK_CATEGORIES) {
      if (category === "scripture-knowledge") continue;
      for (const difficulty of ["easy", "moderate", "hard"] as const) {
        for (let i = 0; i < 30; i++) tasks.push(makeSyntheticTask(category, difficulty, idx++));
      }
    }
    const pack = contentPackSchema.parse({
      packId: "synthetic-pack",
      schemaVersion: 1,
      version: "0.0.1",
      title: "S9 scarce-category pack",
      tasks,
    });
    const [a, b, c] = tasks.map((t) => t.id) as [string, string, string];

    const { deck, report } = buildSessionDeck(
      defaultBuildOptions({
        packs: [pack],
        teamIds: ["alpha", "beta"],
        excludeTaskIds: [a, b, c], // oldest-first order: a is oldest
      }),
    );

    expect(report.warnings.some((w) => w.includes(a) && w.includes("scripture-knowledge"))).toBe(true);

    // "a" (the oldest exclusion) was relaxed; b and c stay excluded. The
    // team's rotation cycle is a shuffle of all 6 non-community categories
    // drawn one at a time with no repeats before a refill, so scripture-
    // knowledge is guaranteed to appear exactly once within the first 6
    // draws — and since only "a" remains in that pool, it must be "a".
    let sawA = false;
    for (let i = 0; i < 6; i++) {
      const task = deck.nextTask("alpha", "s1");
      if (task.category !== "scripture-knowledge") continue;
      expect(task.id).toBe(a);
      sawA = true;
    }
    expect(sawA).toBe(true);
  });
});

describe("S9 — the sufficiency check fails below 1.0x and warns below 1.5x projected demand", () => {
  it("fails the build with a readable error when supply is under the projected demand", () => {
    // projectedDraws = teamCount(2) * rounds(1) * turnTaskLimit(3) = 6
    const pack = packWithTotalCount(3); // well under 6
    expect(() =>
      buildSessionDeck(
        defaultBuildOptions({ journey: minimalJourney, packs: [pack], teamIds: ["alpha", "beta"], turnTaskLimit: 3 }),
      ),
    ).toThrow(SessionBuildError);
  });

  it("warns (but succeeds) when supply is between 1.0x and 1.5x projected demand", () => {
    // 1.0x = 6, 1.5x = 9 — 7 sits inside the tight-but-buildable band.
    const pack = packWithTotalCount(7);
    const { report } = buildSessionDeck(
      defaultBuildOptions({ journey: minimalJourney, packs: [pack], teamIds: ["alpha", "beta"], turnTaskLimit: 3 }),
    );
    expect(report.warnings.some((w) => /tight/i.test(w))).toBe(true);
  });

  it("no supply warning once comfortably above 1.5x projected demand", () => {
    const { report } = buildSessionDeck(
      defaultBuildOptions({
        journey: minimalJourney,
        packs: [bigPack()],
        teamIds: ["alpha", "beta"],
        turnTaskLimit: 3,
      }),
    );
    expect(report.warnings.some((w) => /tight/i.test(w))).toBe(false);
  });
});
