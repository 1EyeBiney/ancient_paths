// PHASE3_SPEC Group S10 — planSession.

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { planSession, totalRequiredSuccesses } from "../../src/session/plan";
import { testJourney } from "./fixtures";

// Reference anchor (PHASE3_SPEC "planSession", "Reference anchor" note):
// 4 teams, 3 tasks/turn (== recommendedTasksPerTurn(4)), standard pace, 2
// community events, and a journey totaling 7 required successes lands at
// ~59-60 minutes — inside the standard target's warning band. Built as its
// own bespoke journey (NOT testJourney, which totals 6) so the anchor's
// exact numbers are pinned independently of testJourney's shape.
function anchorJourney(): Journey {
  return journeySchema.parse({
    journeyId: "s10-anchor-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Anchor Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
      { id: "mid", name: "Mid", introText: "x", ambientAudioAsset: null },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
    ],
    entries: [
      { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 3, arrivesAtMilestoneId: "mid" },
      { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 4, arrivesAtMilestoneId: "finish" },
    ],
    communityEvents: [
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

describe("S10 — totalRequiredSuccesses sums stages and averages fork routes", () => {
  it("matches testJourney's known total (s1:2 + fork mean(1,1)=1 + s2:1 + s3:2 = 6)", () => {
    expect(totalRequiredSuccesses(testJourney)).toBe(6);
  });

  it("matches the anchor journey's known total (3 + 4 = 7, no fork)", () => {
    expect(totalRequiredSuccesses(anchorJourney())).toBe(7);
  });
});

describe("S10 — the reference anchor lands inside the standard band with no warning", () => {
  it("4 teams / 3 tasks-per-turn / standard pace / 2 events / 7 successes ~= 60 minutes", () => {
    const plan = planSession({
      journey: anchorJourney(),
      teamCount: 4,
      duration: "standard",
      pace: "standard",
    });
    expect(plan.recommendedTasksPerTurn).toBe(3);
    expect(plan.communityEventCount).toBe(2);
    expect(plan.totalRequiredSuccesses).toBe(7);
    expect(plan.targetMinutes).toBe(55);
    // Precise value is 60.333... (PHASE3_SPEC's own "~59 minutes" is a
    // rounding imprecision in the prose; the band check below is what's
    // actually binding).
    expect(plan.estimatedMinutes).toBeCloseTo(60.333, 2);
    expect(plan.warnings).toEqual([]);
  });
});

describe("S10 — a mismatched configuration produces the §19 warning naming both numbers", () => {
  it("the same anchor journey against a short (40-min) target warns with both numbers", () => {
    const plan = planSession({
      journey: anchorJourney(),
      teamCount: 4,
      duration: "short",
      pace: "standard",
    });
    expect(plan.targetMinutes).toBe(40);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/60/);
    expect(plan.warnings[0]).toMatch(/40-minute target/);
    expect(plan.warnings[0]).toMatch(/longer than/);
  });
});

describe("S10 — pace scales the estimate in the right direction", () => {
  it("relaxed > standard > quick, for an otherwise identical plan", () => {
    const base = { journey: anchorJourney(), teamCount: 4, duration: "standard" as const };
    const relaxed = planSession({ ...base, pace: "relaxed" });
    const standard = planSession({ ...base, pace: "standard" });
    const quick = planSession({ ...base, pace: "quick" });
    expect(relaxed.estimatedMinutes).toBeGreaterThan(standard.estimatedMinutes);
    expect(standard.estimatedMinutes).toBeGreaterThan(quick.estimatedMinutes);
  });
});
