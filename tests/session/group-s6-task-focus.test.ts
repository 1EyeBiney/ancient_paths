// PHASE3_SPEC Group S6 — taskFocus.

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { buildSessionDeck } from "../../src/session/builder";
import { defaultBuildOptions, NO_FOCUS_STAGE } from "./fixtures";

// testJourney's stages each focus exactly one category, which can't
// exercise ROTATION among focus categories. A minimal bespoke journey with
// a two-category taskFocus stage (one of them "community", to also prove
// the explicit-opt-in path) fills that gap.
const focusJourney: Journey = journeySchema.parse({
  journeyId: "s6-focus-journey",
  schemaVersion: 1,
  version: "0.0.1",
  title: "Focus Test Path",
  startMilestoneId: "start",
  destinationMilestoneId: "finish",
  milestones: [
    { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
    { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
  ],
  entries: [
    {
      kind: "stage",
      id: "focus-stage",
      name: "Focus Stage",
      requiredSuccesses: 1,
      arrivesAtMilestoneId: "finish",
      taskFocus: ["scripture-knowledge", "community"],
    },
  ],
  communityEvents: [],
  offeringOutcomes: [
    { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
    { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
    { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
    { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
  ],
});

describe("S6 — draws in a taskFocus stage come only from the focus categories", () => {
  it("rotates round-robin between the two focus categories, including community explicitly", () => {
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ journey: focusJourney, teamIds: ["alpha", "beta"] }),
    );
    const categories: string[] = [];
    for (let i = 0; i < 40; i++) {
      categories.push(deck.nextTask("alpha", "focus-stage").category);
    }
    expect(new Set(categories)).toEqual(new Set(["scripture-knowledge", "community"]));
    // Round-robin: alternates, never drifting to any other category.
    for (let i = 1; i < categories.length; i++) {
      expect(categories[i]).not.toBe(categories[i - 1]);
    }
  });
});

describe("S6 — community never appears in ordinary (non-focus) rotation", () => {
  it("over 300 non-focus draws, community is never served", () => {
    const { deck } = buildSessionDeck(defaultBuildOptions({ teamIds: ["alpha", "beta"] }));
    for (let i = 0; i < 300; i++) {
      const task = deck.nextTask("alpha", NO_FOCUS_STAGE);
      expect(task.category).not.toBe("community");
    }
  });
});
