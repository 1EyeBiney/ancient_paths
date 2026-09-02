// PHASE3_SPEC Group S3 — streak limit (no-focus stages).

import { describe, expect, it } from "vitest";
import { build, driveManyCategories, NO_FOCUS_STAGE } from "./fixtures";

describe("S3 — no category appears 3 times consecutively in a team's history", () => {
  it("holds over 300 non-focus draws per team", () => {
    const { deck } = build({ teamIds: ["alpha", "beta"] });
    const byTeam = driveManyCategories(deck, ["alpha", "beta"], NO_FOCUS_STAGE, 300);

    for (const [teamId, categories] of Object.entries(byTeam)) {
      for (let i = 2; i < categories.length; i++) {
        const streaked =
          categories[i] === categories[i - 1] && categories[i] === categories[i - 2];
        expect(streaked, `team ${teamId} streaked at index ${i}: ${categories.slice(i - 2, i + 1).join(",")}`).toBe(false);
      }
    }
  });
});
