// PHASE3_SPEC Group S7 — community reserve.

import { describe, expect, it } from "vitest";
import { journeySchema, contentPackSchema, type Journey, type ContentPack } from "../../src/content/schemas";
import { buildSessionDeck, SessionBuildError } from "../../src/session/builder";
import { makeSyntheticTask } from "./factory";
import { defaultBuildOptions, bigPack } from "./fixtures";
import { TASK_CATEGORIES } from "../../src/content/schemas";

function relayJourney(eventCount: 1 | 2): Journey {
  return journeySchema.parse({
    journeyId: `s7-relay-journey-${eventCount}`,
    schemaVersion: 1,
    version: "0.0.1",
    title: "Relay Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
      { id: "mid", name: "Mid", introText: "x", ambientAudioAsset: null },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
    ],
    entries:
      eventCount === 1
        ? [{ kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" }]
        : [
            { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "mid" },
            { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
          ],
    communityEvents:
      eventCount === 1
        ? [
            {
              kind: "relay",
              id: "relay-1",
              milestoneId: "finish",
              title: "Relay 1",
              description: "x",
              repeatable: false,
              taskCategory: "community",
              successThreshold: 2,
              reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
            },
          ]
        : [
            {
              kind: "relay",
              id: "relay-1",
              milestoneId: "mid",
              title: "Relay 1",
              description: "x",
              repeatable: false,
              taskCategory: "community",
              successThreshold: 2,
              reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
            },
            {
              kind: "relay",
              id: "relay-2",
              milestoneId: "finish",
              title: "Relay 2",
              description: "x",
              repeatable: false,
              taskCategory: "community",
              successThreshold: 2,
              reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
            },
          ],
    offeringOutcomes: [
      { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
      { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
      { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
      { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
    ],
  });
}

function packWithCommunityCount(n: number): ContentPack {
  const tasks = [];
  let idx = 0;
  for (let i = 0; i < n; i++) tasks.push(makeSyntheticTask("community", "easy", idx++));
  // Adequate (not scarce) supply for every other category, so the build's
  // sufficiency check — which correctly requires enough content for real
  // gameplay across ALL categories, not just the one this test cares about
  // — passes, isolating the reserve-vs-general-pool behavior being tested.
  for (const category of TASK_CATEGORIES) {
    if (category === "community") continue;
    for (const difficulty of ["easy", "moderate", "hard"] as const) {
      for (let i = 0; i < 30; i++) tasks.push(makeSyntheticTask(category, difficulty, idx++));
    }
  }
  return contentPackSchema.parse({
    packId: "synthetic-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Community-scarce pack",
    tasks,
  });
}

describe("S7 — reserves fill at build time, 2 per event", () => {
  it("one relay event reserves exactly 2 community tasks", () => {
    const { report } = buildSessionDeck(
      defaultBuildOptions({ journey: relayJourney(1), teamIds: ["alpha", "beta"], packs: [bigPack()] }),
    );
    expect(report.totalReserved).toBe(2);
  });

  it("two relay events reserve 4 total", () => {
    const { report } = buildSessionDeck(
      defaultBuildOptions({ journey: relayJourney(2), teamIds: ["alpha", "beta"], packs: [bigPack()] }),
    );
    expect(report.totalReserved).toBe(4);
  });
});

describe("S7 — nextCommunityTask serves the reserve before the general pool", () => {
  it("the first calls come from the reserve; once it's empty, later calls draw from the general pool", () => {
    const pack = packWithCommunityCount(5); // 2 reserved, 3 left in general pool
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ journey: relayJourney(1), teamIds: ["alpha", "beta"], packs: [pack] }),
    );
    const served = new Set<string>();
    for (let i = 0; i < 5; i++) {
      served.add(deck.nextCommunityTask("community").id);
    }
    expect(served.size).toBe(5); // all distinct: reserve + general pool never overlap
    // A 6th call has nothing left anywhere and must fail loudly.
    expect(() => deck.nextCommunityTask("community")).toThrow();
  });
});

describe("S7 — an unfillable reserve fails the build with a readable error", () => {
  it("two events needing 4 community tasks against a pack with only 1 fails clearly", () => {
    const pack = packWithCommunityCount(1);
    expect(() =>
      buildSessionDeck(
        defaultBuildOptions({ journey: relayJourney(2), teamIds: ["alpha", "beta"], packs: [pack] }),
      ),
    ).toThrow(SessionBuildError);
    try {
      buildSessionDeck(
        defaultBuildOptions({ journey: relayJourney(2), teamIds: ["alpha", "beta"], packs: [pack] }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(SessionBuildError);
      expect((err as Error).message).toMatch(/community/);
    }
  });
});
