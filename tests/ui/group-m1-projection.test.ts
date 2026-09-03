// PHASE5B_SPEC Group M1 — projection math. Pure functions, no DOM.

import { describe, expect, it } from "vitest";
import {
  project,
  viewportToViewBox,
  legStageCounts,
  teamMapPosition,
  type MapBounds,
} from "../../src/ui/mapProjection";
import { journeySchema, type Journey } from "../../src/content/schemas";
import type { TeamState } from "../../src/engine/types";

// The real shared-imagery bounds (PHASE5B_SPEC "The shared imagery set").
const MANIFEST_BOUNDS: MapBounds = { north: 46.5, south: 29, east: 42, west: 9 };
const W = 2048;
const H = 1086;

describe("M1 — project() maps corners and a known point within +/-1px", () => {
  it("the bounds' own corners land exactly on the image edges", () => {
    expect(project({ lat: 46.5, lon: 9 }, MANIFEST_BOUNDS, W, H)).toEqual({ x: 0, y: 0 });
    expect(project({ lat: 29, lon: 42 }, MANIFEST_BOUNDS, W, H)).toEqual({ x: W, y: H });
  });

  it("Jerusalem (31.7683N, 35.2137E) projects to the pinned pixel", () => {
    const p = project({ lat: 31.7683, lon: 35.2137 }, MANIFEST_BOUNDS, W, H);
    expect(p.x).toBeCloseTo(1626.84, 1);
    expect(p.y).toBeCloseTo(914.21, 1);
  });
});

describe("M1 — viewportToViewBox crops to the journey's own window", () => {
  it("the sample journey's viewport (N44/S30/E38/W11) yields the pinned sub-rectangle", () => {
    const manifest = {
      id: "mediterranean",
      bounds: MANIFEST_BOUNDS,
      width: W,
      height: H,
      styles: {
        satellite: { file: "mediterranean-satellite.jpg" },
        parchment: { file: "mediterranean-parchment.svg" },
      },
      credits: "CREDITS.md",
    };
    const box = viewportToViewBox({ north: 44, south: 30, east: 38, west: 11 }, manifest);
    expect(box.x).toBeCloseTo(124.12, 1);
    expect(box.y).toBeCloseTo(155.14, 1);
    expect(box.width).toBeCloseTo(1675.64, 1);
    expect(box.height).toBeCloseTo(868.8, 1);
  });
});

// A bespoke journey mirroring testJourney's structure (stage -> fork ->
// stage -> stage) but WITH map coordinates, since testJourney itself
// predates the map and has none. Round-number coordinates and a viewport
// that exactly bounds them, so percentage math is hand-checkable.
function mappedTestJourney(): Journey {
  return journeySchema.parse({
    journeyId: "m1-mapped-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Mapped Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    map: { viewport: { north: 40, south: 30, east: 25, west: 10 } },
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null, coordinates: { lat: 30, lon: 10 } },
      { id: "midway", name: "Midway", introText: "x", ambientAudioAsset: null, coordinates: { lat: 33, lon: 15 } },
      { id: "ford", name: "Ford", introText: "x", ambientAudioAsset: null, coordinates: { lat: 36, lon: 20 } },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null, coordinates: { lat: 40, lon: 25 } },
    ],
    entries: [
      { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 2, arrivesAtMilestoneId: "midway" },
      {
        kind: "fork",
        id: "fork1",
        name: "Fork",
        routes: [
          {
            id: "route-a",
            name: "Route A",
            description: "x",
            difficulty: "easy",
            taskFocus: [],
            stages: [{ kind: "stage", id: "a-stage", name: "A Leg", requiredSuccesses: 1 }],
          },
          {
            id: "route-b",
            name: "Route B",
            description: "x",
            difficulty: "hard",
            taskFocus: [],
            stages: [{ kind: "stage", id: "b-stage", name: "B Leg", requiredSuccesses: 1 }],
          },
        ],
      },
      { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 1, arrivesAtMilestoneId: "ford" },
      { kind: "stage", id: "s3", name: "S3", requiredSuccesses: 2, arrivesAtMilestoneId: "finish" },
    ],
    communityEvents: [],
    offeringOutcomes: [
      { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
      { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
      { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
      { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
    ],
  });
}

describe("M1 — legStageCounts matches the journey's structure", () => {
  it("start->midway: 0 (s1 itself is the first entry, nothing precedes it)", () => {
    const counts = legStageCounts(mappedTestJourney());
    expect(counts.get("start")).toBe(0);
  });

  it("midway->ford: 1 (the fork sits between s1 and s2, however many routes it has)", () => {
    const counts = legStageCounts(mappedTestJourney());
    expect(counts.get("midway")).toBe(1);
  });

  it("ford->finish: 0 (s2 and s3 are adjacent top-level entries)", () => {
    const counts = legStageCounts(mappedTestJourney());
    expect(counts.get("ford")).toBe(0);
  });

  it("has no entry for the final milestone (no leg leads onward from it)", () => {
    const counts = legStageCounts(mappedTestJourney());
    expect(counts.has("finish")).toBe(false);
  });
});

function team(overrides: Partial<TeamState> = {}): TeamState {
  return {
    id: "team-1",
    name: "Alpha",
    color: "#c00",
    symbol: "cross",
    currentMilestoneId: "start",
    currentStageId: "s1",
    stageSuccesses: 0,
    resources: { insight: 0, provision: 0, courage: 0 },
    hasJourneyToken: false,
    serviceScore: 0,
    stagesBeyondMilestone: 0,
    ...overrides,
  };
}

describe("M1 — teamMapPosition", () => {
  it("places a team exactly at its milestone's percentage when not traveling beyond", () => {
    const journey = mappedTestJourney();
    const t = team({ currentMilestoneId: "midway" });
    const pos = teamMapPosition(t, journey, [t])!;
    // viewport N40/S30/E25/W10; midway = lat33,lon15
    expect(pos.xPercent).toBeCloseTo(((15 - 10) / (25 - 10)) * 100, 5);
    expect(pos.yPercent).toBeCloseTo(((40 - 33) / (40 - 30)) * 100, 5);
  });

  it("interpolates toward the next milestone while stagesBeyondMilestone > 0", () => {
    const journey = mappedTestJourney();
    // midway -> ford leg count is 1, so stagesBeyondMilestone=1 means fraction min(0.9, 1/1)=0.9
    const t = team({ currentMilestoneId: "midway", stagesBeyondMilestone: 1 });
    const pos = teamMapPosition(t, journey, [t])!;
    const fraction = 0.9;
    const expectedLat = 33 + (36 - 33) * fraction;
    const expectedLon = 15 + (20 - 15) * fraction;
    expect(pos.xPercent).toBeCloseTo(((expectedLon - 10) / (25 - 10)) * 100, 5);
    expect(pos.yPercent).toBeCloseTo(((40 - expectedLat) / (40 - 30)) * 100, 5);
  });

  it("caps interpolation at 0.9 even with an enormous stagesBeyondMilestone", () => {
    const journey = mappedTestJourney();
    const capped = team({ currentMilestoneId: "midway", stagesBeyondMilestone: 999 });
    const posCapped = teamMapPosition(capped, journey, [capped])!;
    const at09 = team({ currentMilestoneId: "midway", stagesBeyondMilestone: 1 }); // leg count 1 -> already 0.9
    const pos09 = teamMapPosition(at09, journey, [at09])!;
    expect(posCapped.xPercent).toBeCloseTo(pos09.xPercent, 5);
    expect(posCapped.yPercent).toBeCloseTo(pos09.yPercent, 5);
  });

  it("fans co-located teams by a small offset, in team-array order", () => {
    const journey = mappedTestJourney();
    const teamA = team({ id: "team-1", currentMilestoneId: "start" });
    const teamB = team({ id: "team-2", currentMilestoneId: "start" });
    const teams = [teamA, teamB];
    const posA = teamMapPosition(teamA, journey, teams)!;
    const posB = teamMapPosition(teamB, journey, teams)!;
    expect(posA).not.toEqual(posB);
    expect(posB.xPercent).toBeGreaterThan(posA.xPercent);
    expect(posB.yPercent).toBeGreaterThan(posA.yPercent);
  });

  it("teams NOT co-located are never fanned relative to each other", () => {
    const journey = mappedTestJourney();
    const teamA = team({ id: "team-1", currentMilestoneId: "start" });
    const teamB = team({ id: "team-2", currentMilestoneId: "midway" });
    const teams = [teamA, teamB];
    const posA = teamMapPosition(teamA, journey, teams)!;
    expect(posA.xPercent).toBeCloseTo(((10 - 10) / (25 - 10)) * 100, 5); // unfanned (index 0)
  });

  it("returns null for a journey with no map", () => {
    const journey = mappedTestJourney() as Journey & { map?: unknown };
    const noMap = { ...journey, map: undefined } as Journey;
    const t = team();
    expect(teamMapPosition(t, noMap, [t])).toBeNull();
  });
});
