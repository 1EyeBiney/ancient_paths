// PHASE3_SPEC Group S1 — determinism.

import { describe, expect, it } from "vitest";
import { build, driveMany, NO_FOCUS_STAGE } from "./fixtures";

describe("S1 — identical seeds reproduce identical decks", () => {
  it("the same options + same seed serve the exact same task sequence", () => {
    const a = build({ seed: "seed-alpha" });
    const b = build({ seed: "seed-alpha" });

    const seqA = driveMany(a.deck, ["alpha", "beta"], NO_FOCUS_STAGE, 30);
    const seqB = driveMany(b.deck, ["alpha", "beta"], NO_FOCUS_STAGE, 30);
    expect(seqA).toEqual(seqB);

    // Also exercise replacements and community draws in the identical sequence.
    const repA = [
      a.deck.nextReplacement("scripture-knowledge", "moderate")?.id,
      a.deck.nextCommunityTask("community")?.id,
    ];
    const repB = [
      b.deck.nextReplacement("scripture-knowledge", "moderate")?.id,
      b.deck.nextCommunityTask("community")?.id,
    ];
    expect(repA).toEqual(repB);
  });

  it("different seeds diverge", () => {
    const a = build({ seed: "seed-alpha" });
    const b = build({ seed: "seed-bravo" });
    const seqA = driveMany(a.deck, ["alpha", "beta"], NO_FOCUS_STAGE, 30);
    const seqB = driveMany(b.deck, ["alpha", "beta"], NO_FOCUS_STAGE, 30);
    expect(seqA).not.toEqual(seqB);
  });

  it("the report is identical for identical inputs", () => {
    const a = build({ seed: "seed-report" });
    const b = build({ seed: "seed-report" });
    expect(a.report).toEqual(b.report);
  });
});
