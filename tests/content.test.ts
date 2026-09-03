// Phase 1 content-validation tests (design doc §33.2). The valid samples
// must load; corrupted copies must be rejected with readable errors.

import { describe, expect, it } from "vitest";
import {
  crossValidate,
  validateContentPack,
  validateJourney,
} from "../src/content/loader";
import samplePack from "../public/content/packs/dev-sample.json";
import sampleJourney from "../public/content/journeys/jerusalem-rome.json";

function clonePack(): any {
  return structuredClone(samplePack);
}
function cloneJourney(): any {
  return structuredClone(sampleJourney);
}

describe("valid sample content", () => {
  it("accepts the development sample pack", () => {
    const result = validateContentPack(samplePack, "dev-sample.json");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tasks.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("accepts the Jerusalem-to-Rome sample journey", () => {
    const result = validateJourney(sampleJourney, "jerusalem-rome.json");
    expect(result.ok).toBe(true);
  });

  it("cross-validates journey task demands against the pack", () => {
    const pack = validateContentPack(samplePack, "pack");
    const journey = validateJourney(sampleJourney, "journey");
    expect(pack.ok && journey.ok).toBe(true);
    if (pack.ok && journey.ok) {
      expect(crossValidate(journey.data, [pack.data])).toEqual([]);
    }
  });
});

describe("pack validation rejects (§33.2)", () => {
  it("duplicate task ids", () => {
    const pack = clonePack();
    pack.tasks[1].id = pack.tasks[0].id;
    const result = validateContentPack(pack, "dup");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/Duplicate task id/);
    }
  });

  it("a missing official answer", () => {
    const pack = clonePack();
    pack.tasks[0].answer = "";
    expect(validateContentPack(pack, "no-answer").ok).toBe(false);
  });

  it("an amplified variant without the two-success value", () => {
    const pack = clonePack();
    pack.tasks[0].amplifiedVariant.successValue = 1;
    expect(validateContentPack(pack, "bad-amp").ok).toBe(false);
  });

  it("an amplified variant missing its own answer", () => {
    const pack = clonePack();
    delete pack.tasks[0].amplifiedVariant.answer;
    expect(validateContentPack(pack, "amp-no-answer").ok).toBe(false);
  });

  it("an invalid resource cost", () => {
    const pack = clonePack();
    pack.tasks[0].assistedVariant.cost = { resource: "gold", amount: 1 };
    expect(validateContentPack(pack, "bad-cost").ok).toBe(false);
  });

  it("a zero-amount resource cost", () => {
    const pack = clonePack();
    pack.tasks[0].assistedVariant.cost = { resource: "insight", amount: 0 };
    expect(validateContentPack(pack, "zero-cost").ok).toBe(false);
  });

  it("an invalid category name", () => {
    const pack = clonePack();
    pack.tasks[0].category = "sports-trivia";
    expect(validateContentPack(pack, "bad-category").ok).toBe(false);
  });

  it("a task whose packId does not match its pack", () => {
    const pack = clonePack();
    pack.tasks[0].packId = "some-other-pack";
    expect(validateContentPack(pack, "wrong-pack").ok).toBe(false);
  });

  it("multiple-choice options that do not include the answer", () => {
    const pack = clonePack();
    pack.tasks[0].assistedVariant.options = ["Silas", "Barnabas", "Timothy"];
    const result = validateContentPack(pack, "options-no-answer");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/do not include the answer/);
    }
  });

  it("fewer than two multiple-choice options", () => {
    const pack = clonePack();
    pack.tasks[0].assistedVariant.options = ["Matthias"];
    expect(validateContentPack(pack, "one-option").ok).toBe(false);
  });

  it("clueAudio arrays that are not parallel to clues", () => {
    const pack = clonePack();
    // task 0 has exactly 1 clue; a 2-entry clueAudio must be rejected.
    pack.tasks[0].clueAudio = ["some-clip", null];
    const result = validateContentPack(pack, "bad-clue-audio");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/parallel/);
    }
  });

  it("accepts a well-formed clueAudio array", () => {
    const pack = clonePack();
    pack.tasks[0].clueAudio = ["ruth-clue-1"];
    expect(validateContentPack(pack, "good-clue-audio").ok).toBe(true);
  });
});

describe("journey validation rejects (§33.2)", () => {
  it("a fork as the final entry (routes that do not reconnect)", () => {
    const journey = cloneJourney();
    journey.entries = journey.entries.filter((e: any) => e.kind !== "stage" || e.id !== "westward-voyage");
    const result = validateJourney(journey, "fork-last");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/would not reconnect/);
    }
  });

  it("a stage arriving at an unknown milestone", () => {
    const journey = cloneJourney();
    journey.entries[0].arrivesAtMilestoneId = "atlantis";
    expect(validateJourney(journey, "bad-milestone").ok).toBe(false);
  });

  it("duplicate stage ids across fork routes", () => {
    const journey = cloneJourney();
    journey.entries[1].routes[1].stages[0].id = journey.entries[1].routes[0].stages[0].id;
    expect(validateJourney(journey, "dup-stage").ok).toBe(false);
  });

  it("a community event on an unknown milestone", () => {
    const journey = cloneJourney();
    journey.communityEvents[0].milestoneId = "atlantis";
    expect(validateJourney(journey, "bad-event").ok).toBe(false);
  });

  it("an unknown start milestone", () => {
    const journey = cloneJourney();
    journey.startMilestoneId = "eden";
    expect(validateJourney(journey, "bad-start").ok).toBe(false);
  });

  // Map layer (PHASE5B_SPEC, decision 9): coordinates are optional per
  // milestone, but a journey that declares a map must place every
  // milestone, inside its own viewport.
  it("a journey with a map but a milestone missing coordinates", () => {
    const journey = cloneJourney();
    delete journey.milestones[1].coordinates;
    const result = validateJourney(journey, "map-no-coords");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/needs coordinates/);
  });

  it("a milestone outside the journey's map viewport", () => {
    const journey = cloneJourney();
    journey.milestones[0].coordinates = { lat: 51.5, lon: -0.12 }; // London
    const result = validateJourney(journey, "map-outside");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/outside the journey's map viewport/);
  });

  it("an inverted map viewport", () => {
    const journey = cloneJourney();
    journey.map.viewport = { north: 30, south: 44, east: 38, west: 11 };
    expect(validateJourney(journey, "map-inverted").ok).toBe(false);
  });

  it("still accepts a journey with no map and no coordinates at all", () => {
    const journey = cloneJourney();
    delete journey.map;
    for (const m of journey.milestones) delete m.coordinates;
    expect(validateJourney(journey, "no-map").ok).toBe(true);
  });

  it("a fork with only one route", () => {
    const journey = cloneJourney();
    journey.entries[1].routes = [journey.entries[1].routes[0]];
    expect(validateJourney(journey, "one-route").ok).toBe(false);
  });

  it("an offering pool missing a weight category", () => {
    const journey = cloneJourney();
    journey.offeringOutcomes = journey.offeringOutcomes.filter(
      (o: any) => o.category !== "humorous",
    );
    const result = validateJourney(journey, "no-humor");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/humorous/);
    }
  });

  it("a community event with an unknown kind", () => {
    const journey = cloneJourney();
    journey.communityEvents[0].kind = "karaoke";
    expect(validateJourney(journey, "bad-kind").ok).toBe(false);
  });

  it("a contribution event with a zero threshold", () => {
    const journey = cloneJourney();
    journey.communityEvents[1].contributionThreshold = 0;
    expect(validateJourney(journey, "zero-threshold").ok).toBe(false);
  });

  it("an offering outcome with an unsupported effect type", () => {
    const journey = cloneJourney();
    journey.offeringOutcomes[0].effect = { type: "steal-resources" };
    expect(validateJourney(journey, "bad-effect").ok).toBe(false);
  });
});

describe("cross-validation", () => {
  it("reports a journey demanding a category no pack provides", () => {
    const pack = validateContentPack(samplePack, "pack");
    const journey = cloneJourney();
    journey.entries[0].taskFocus = ["community"];
    const parsed = validateJourney(journey, "journey");
    expect(pack.ok && parsed.ok).toBe(true);
    if (pack.ok && parsed.ok) {
      const slim = {
        ...pack.data,
        tasks: pack.data.tasks.filter((t) => t.category !== "community"),
      };
      const problems = crossValidate(parsed.data, [slim]);
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.join(" ")).toMatch(/community/);
    }
  });
});
