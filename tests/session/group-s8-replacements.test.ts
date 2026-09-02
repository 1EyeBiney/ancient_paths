// PHASE3_SPEC Group S8 — replacements.

import { describe, expect, it } from "vitest";
import { contentPackSchema, type ContentPack } from "../../src/content/schemas";
import { buildSessionDeck } from "../../src/session/builder";
import { makeSyntheticTask } from "./factory";
import { defaultBuildOptions } from "./fixtures";

// A pack shaped for precise control: "scripture-knowledge" has ONLY easy
// and hard tasks (moderate deliberately empty, to force the adjacency
// fallback), and every other category has a small but complete spread
// across all three difficulties (kept adequate for the sufficiency check).
function s8Pack(): ContentPack {
  const tasks = [];
  let idx = 0;
  for (let i = 0; i < 4; i++) tasks.push(makeSyntheticTask("scripture-knowledge", "easy", idx++));
  for (let i = 0; i < 4; i++) tasks.push(makeSyntheticTask("scripture-knowledge", "hard", idx++));
  const others = [
    "bible-reasoning",
    "historical-context",
    "audio-listening",
    "hymn",
    "decision-strategy",
    "community",
  ] as const;
  for (const category of others) {
    for (const difficulty of ["easy", "moderate", "hard"] as const) {
      for (let i = 0; i < 30; i++) tasks.push(makeSyntheticTask(category, difficulty, idx++));
    }
  }
  return contentPackSchema.parse({
    packId: "synthetic-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "S8 replacement-fallback pack",
    tasks,
  });
}

describe("S8 — exact category+difficulty match is preferred", () => {
  it("an exact match is returned when the bucket has supply", () => {
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ packs: [s8Pack()], teamIds: ["alpha", "beta"] }),
    );
    const task = deck.nextReplacement("scripture-knowledge", "easy");
    expect(task).not.toBeNull();
    expect(task!.category).toBe("scripture-knowledge");
    expect(task!.difficulty).toBe("easy");
  });
});

describe("S8 — adjacent-difficulty fallback works when the exact bucket is empty", () => {
  it("requesting moderate (empty) falls back per the documented adjacency order", () => {
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ packs: [s8Pack()], teamIds: ["alpha", "beta"] }),
    );
    // scripture-knowledge has NO moderate tasks; fallbackOrder("moderate")
    // = [moderate, easy, hard] — easy is tried before hard.
    const task = deck.nextReplacement("scripture-knowledge", "moderate");
    expect(task).not.toBeNull();
    expect(task!.category).toBe("scripture-knowledge");
    expect(task!.difficulty).toBe("easy");
  });
});

describe("S8 — used tasks are never re-served as a replacement", () => {
  it("draining a small category never repeats an id", () => {
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ packs: [s8Pack()], teamIds: ["alpha", "beta"] }),
    );
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const task = deck.nextReplacement("scripture-knowledge", "easy");
      expect(task).not.toBeNull();
      expect(seen.has(task!.id)).toBe(false);
      seen.add(task!.id);
    }
    expect(seen.size).toBe(8); // all 4 easy + all 4 hard scripture-knowledge tasks, no repeats
  });
});

describe("S8 — returns null once the category is fully exhausted", () => {
  it("a 9th replacement request for a fully-drained category returns null", () => {
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ packs: [s8Pack()], teamIds: ["alpha", "beta"] }),
    );
    for (let i = 0; i < 8; i++) {
      expect(deck.nextReplacement("scripture-knowledge", "easy")).not.toBeNull();
    }
    expect(deck.nextReplacement("scripture-knowledge", "easy")).toBeNull();
    expect(deck.nextReplacement("scripture-knowledge", "hard")).toBeNull();
  });
});
