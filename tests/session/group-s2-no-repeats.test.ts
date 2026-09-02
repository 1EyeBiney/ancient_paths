// PHASE3_SPEC Group S2 — no repeats.

import { describe, expect, it } from "vitest";
import { build, NO_FOCUS_STAGE } from "./fixtures";

describe("S2 — no task is ever served twice in a session", () => {
  it("across hundreds of normal draws, replacements, and community draws, every id is unique", () => {
    const { deck } = build({ teamIds: ["alpha", "beta", "gamma"] });
    const servedIds: string[] = [];

    for (let round = 0; round < 150; round++) {
      for (const teamId of ["alpha", "beta", "gamma"]) {
        servedIds.push(deck.nextTask(teamId, NO_FOCUS_STAGE).id);
      }
    }
    for (let i = 0; i < 40; i++) {
      const task = deck.nextReplacement("scripture-knowledge", "moderate");
      if (task) servedIds.push(task.id);
    }
    for (let i = 0; i < 20; i++) {
      servedIds.push(deck.nextCommunityTask("community").id);
    }

    expect(servedIds.length).toBeGreaterThan(400);
    expect(new Set(servedIds).size).toBe(servedIds.length);
  });
});
