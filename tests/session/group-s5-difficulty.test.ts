// PHASE3_SPEC Group S5 — difficulty distribution.

import { describe, expect, it } from "vitest";
import { buildSessionDeck } from "../../src/session/builder";
import { contentPackSchema, type ContentPack } from "../../src/content/schemas";
import { makeSyntheticTask } from "./factory";
import { defaultBuildOptions, NO_FOCUS_STAGE } from "./fixtures";

function tallyDifficulties(deck: ReturnType<typeof buildSessionDeck>["deck"], n: number) {
  const tally = { easy: 0, moderate: 0, hard: 0 };
  for (let i = 0; i < n; i++) {
    const task = deck.nextTask("alpha", NO_FOCUS_STAGE);
    tally[task.difficulty]++;
  }
  return tally;
}

describe("S5 — difficulty draw statistically matches the configured weights", () => {
  it("standard lands near 30/50/20", () => {
    const { deck } = buildSessionDeck(defaultBuildOptions({ teamIds: ["alpha", "beta"], difficulty: "standard" }));
    const N = 900;
    const tally = tallyDifficulties(deck, N);
    expect(tally.easy / N).toBeGreaterThan(0.18);
    expect(tally.easy / N).toBeLessThan(0.42);
    expect(tally.moderate / N).toBeGreaterThan(0.38);
    expect(tally.moderate / N).toBeLessThan(0.62);
    expect(tally.hard / N).toBeGreaterThan(0.1);
    expect(tally.hard / N).toBeLessThan(0.3);
  });

  it("challenging lands near 15/45/40", () => {
    const { deck } = buildSessionDeck(defaultBuildOptions({ teamIds: ["alpha", "beta"], difficulty: "challenging" }));
    const N = 900;
    const tally = tallyDifficulties(deck, N);
    expect(tally.easy / N).toBeGreaterThan(0.05);
    expect(tally.easy / N).toBeLessThan(0.25);
    expect(tally.moderate / N).toBeGreaterThan(0.33);
    expect(tally.moderate / N).toBeLessThan(0.57);
    expect(tally.hard / N).toBeGreaterThan(0.28);
    expect(tally.hard / N).toBeLessThan(0.52);
  });
});

describe("S5 — empty-bucket fallback is deterministic", () => {
  it("a category with only hard tasks always serves hard, regardless of the drawn difficulty", () => {
    // Every other category still has a full, large spread so the build's
    // sufficiency check and other categories' rotation are unaffected;
    // only scripture-knowledge is deliberately hard-only.
    const tasks = [];
    for (let i = 0; i < 30; i++) tasks.push(makeSyntheticTask("scripture-knowledge", "hard", i));
    const categories: Array<Exclude<(typeof tasks)[number]["category"], "scripture-knowledge">> = [
      "bible-reasoning",
      "historical-context",
      "audio-listening",
      "hymn",
      "decision-strategy",
      "community",
    ];
    let idx = 1000;
    for (const category of categories) {
      for (const difficulty of ["easy", "moderate", "hard"] as const) {
        for (let i = 0; i < 60; i++) tasks.push(makeSyntheticTask(category, difficulty, idx++));
      }
    }
    const pack: ContentPack = contentPackSchema.parse({
      packId: "synthetic-pack",
      schemaVersion: 1,
      version: "0.0.1",
      title: "Hard-only SK pack",
      tasks,
    });

    const { deck } = buildSessionDeck(
      defaultBuildOptions({ packs: [pack], teamIds: ["alpha", "beta"], difficulty: "standard" }),
    );
    let skDrawsObserved = 0;
    for (let i = 0; i < 60; i++) {
      const task = deck.nextTask("alpha", NO_FOCUS_STAGE);
      if (task.category === "scripture-knowledge") {
        skDrawsObserved++;
        expect(task.difficulty).toBe("hard");
      }
    }
    // Guard against a vacuously-passing test: with 7 categories rotating,
    // 60 draws should reliably include several scripture-knowledge picks.
    expect(skDrawsObserved).toBeGreaterThan(3);
  });
});
