// @vitest-environment jsdom
// PHASE5B_SPEC Group M3 — MapView rendering.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { MapView } from "../../src/ui/mapView";
import { mapManifestSchema, teamMapPosition, type MapManifest } from "../../src/ui/mapProjection";
import type { TeamState } from "../../src/engine/types";

const manifest: MapManifest = mapManifestSchema.parse(
  JSON.parse(readFileSync(resolve("public/map/mediterranean.json"), "utf8")),
);

function mappedJourney(): Journey {
  return journeySchema.parse({
    journeyId: "m3-mapped-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Mapped Test Path",
    startMilestoneId: "jerusalem",
    destinationMilestoneId: "rome",
    map: { viewport: { north: 44, south: 30, east: 38, west: 11 } },
    milestones: [
      { id: "jerusalem", name: "Jerusalem", introText: "x", ambientAudioAsset: null, coordinates: { lat: 31.7683, lon: 35.2137 } },
      { id: "caesarea", name: "Caesarea", introText: "x", ambientAudioAsset: null, coordinates: { lat: 32.4995, lon: 34.8919 } },
      { id: "antioch", name: "Antioch", introText: "x", ambientAudioAsset: null, coordinates: { lat: 36.2021, lon: 36.1604 } },
      { id: "rome", name: "Rome", introText: "x", ambientAudioAsset: null, coordinates: { lat: 41.9028, lon: 12.4964 } },
    ],
    entries: [
      { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "caesarea" },
      { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 1, arrivesAtMilestoneId: "antioch" },
      { kind: "stage", id: "s3", name: "S3", requiredSuccesses: 1, arrivesAtMilestoneId: "rome" },
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

function unmappedJourney(): Journey {
  const j = mappedJourney() as unknown as Record<string, unknown>;
  const { map: _map, ...rest } = j;
  const milestones = (rest.milestones as Array<Record<string, unknown>>).map(({ coordinates: _c, ...m }) => m);
  return journeySchema.parse({ ...rest, milestones });
}

function team(overrides: Partial<TeamState> = {}): TeamState {
  return {
    id: "team-1",
    name: "Alpha",
    color: "#c00",
    symbol: "cross",
    currentMilestoneId: "jerusalem",
    currentStageId: "s1",
    stageSuccesses: 0,
    resources: { insight: 0, provision: 0, courage: 0 },
    hasJourneyToken: false,
    serviceScore: 0,
    stagesBeyondMilestone: 0,
    ...overrides,
  };
}

describe("M3 — the map is aria-hidden", () => {
  it("has aria-hidden='true' on the root .map element", () => {
    const container = document.createElement("div");
    new MapView({ journey: mappedJourney(), manifest }).render(container, [team()], "satellite");
    const mapEl = container.querySelector(".map")!;
    expect(mapEl.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("M3 — one landmark group per milestone, in journey order", () => {
  it("matches journey.milestones order exactly", () => {
    const journey = mappedJourney();
    const container = document.createElement("div");
    new MapView({ journey, manifest }).render(container, [team()], "satellite");
    const groups = Array.from(container.querySelectorAll(".landmark"));
    expect(groups.map((g) => (g as HTMLElement).dataset.milestoneId)).toEqual(
      journey.milestones.map((m) => m.id),
    );
  });
});

describe("M3 — the route path has one point per milestone", () => {
  it("an 'M' or 'L' command count equal to the milestone count", () => {
    const journey = mappedJourney();
    const container = document.createElement("div");
    new MapView({ journey, manifest }).render(container, [team()], "satellite");
    const d = container.querySelector(".route")!.getAttribute("d")!;
    const commands = d.match(/[ML]/g) ?? [];
    expect(commands).toHaveLength(journey.milestones.length);
  });
});

describe("M3 — one marker per team, positioned by teamMapPosition", () => {
  it("marker count matches team count, and --x/--y equal the computed percentages", () => {
    const journey = mappedJourney();
    const teams = [team({ id: "team-1" }), team({ id: "team-2", currentMilestoneId: "caesarea" })];
    const container = document.createElement("div");
    new MapView({ journey, manifest }).render(container, teams, "satellite");
    const markers = Array.from(container.querySelectorAll<HTMLElement>(".map-marker"));
    expect(markers).toHaveLength(2);
    for (const marker of markers) {
      const t = teams.find((x) => x.id === marker.dataset.teamId)!;
      const expected = teamMapPosition(t, journey, teams)!;
      expect(marker.style.getPropertyValue("--x")).toBe(`${expected.xPercent}%`);
      expect(marker.style.getPropertyValue("--y")).toBe(`${expected.yPercent}%`);
    }
  });
});

describe("M3 — a journey without map renders no .map at all", () => {
  it("nothing is rendered, and the caller's strip is unaffected", () => {
    const journey = unmappedJourney();
    const container = document.createElement("div");
    new MapView({ journey, manifest }).render(container, [team()], "satellite");
    expect(container.querySelector(".map")).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});

describe("M3 — style 'none' renders no .map", () => {
  it("even for a mapped journey with a real manifest", () => {
    const container = document.createElement("div");
    new MapView({ journey: mappedJourney(), manifest }).render(container, [team()], "none");
    expect(container.querySelector(".map")).toBeNull();
  });
});

describe("M3 — a missing manifest renders no .map (no error)", () => {
  it("null manifest is treated the same as 'none'", () => {
    const container = document.createElement("div");
    expect(() => new MapView({ journey: mappedJourney(), manifest: null }).render(container, [team()], "satellite")).not.toThrow();
    expect(container.querySelector(".map")).toBeNull();
  });
});
