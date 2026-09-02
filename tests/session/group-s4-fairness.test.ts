// PHASE3_SPEC Group S4 — fairness.

import { describe, expect, it } from "vitest";
import { build, driveManyCategories, NO_FOCUS_STAGE } from "./fixtures";
import { TASK_CATEGORIES } from "../../src/content/schemas";

function assertFairness(byTeam: Record<string, string[]>, teamIds: string[]) {
  const counts: Record<string, Record<string, number>> = {};
  for (const teamId of teamIds) {
    counts[teamId] = {};
    for (const category of TASK_CATEGORIES) counts[teamId]![category] = 0;
    for (const category of byTeam[teamId]!) counts[teamId]![category]!++;
  }
  for (const category of TASK_CATEGORIES) {
    if (category === "community") continue; // excluded from ordinary rotation
    const values = teamIds.map((t) => counts[t]![category]!);
    const spread = Math.max(...values) - Math.min(...values);
    expect(
      spread,
      `category "${category}" spread ${spread} across teams: ${JSON.stringify(values)}`,
    ).toBeLessThanOrEqual(2);
  }
}

describe("S4 — per-category serve counts stay within 2 of each other across teams", () => {
  it("holds with 2 teams over a full session", () => {
    const teamIds = ["alpha", "beta"];
    const { deck } = build({ teamIds });
    const byTeam = driveManyCategories(deck, teamIds, NO_FOCUS_STAGE, 200);
    assertFairness(byTeam, teamIds);
  });

  it("holds with 4 teams over a full session", () => {
    const teamIds = ["alpha", "beta", "gamma", "delta"];
    const { deck } = build({ teamIds });
    const byTeam = driveManyCategories(deck, teamIds, NO_FOCUS_STAGE, 200);
    assertFairness(byTeam, teamIds);
  });
});
