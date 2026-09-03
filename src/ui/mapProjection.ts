// Pure map math (PHASE5B_SPEC "Architecture", "The map panel"). No DOM,
// no network. Equirectangular projection: the shared imagery covers one
// fixed bounds box; a journey shows only its own viewport window of it;
// team positions are computed as percentages of that window so the map
// scales with the page.

import { z } from "zod";
import type { Journey } from "../content/schemas";
import type { TeamState } from "../engine/types";

// -- manifest ----------------------------------------------------------

const mapBoundsSchema = z
  .object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .refine((b) => b.north > b.south && b.east > b.west, {
    message: "Map bounds must have north > south and east > west.",
  });

// Always the object form (even for a real, non-placeholder asset) so
// consuming code never has to branch on string-vs-object — the offline
// fallback (PHASE5B_SPEC "Asset pipeline" step 4) just sets `placeholder`.
const mapStyleAssetSchema = z.object({
  file: z.string().min(1),
  placeholder: z.boolean().optional(),
});

export const mapManifestSchema = z.object({
  id: z.string().min(1),
  bounds: mapBoundsSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  styles: z.object({
    satellite: mapStyleAssetSchema,
    parchment: mapStyleAssetSchema,
  }),
  credits: z.string().min(1),
});

export type MapManifest = z.infer<typeof mapManifestSchema>;
export type MapBounds = z.infer<typeof mapBoundsSchema>;
export type MapStyleAsset = z.infer<typeof mapStyleAssetSchema>;
export type MapStyleId = "satellite" | "parchment" | "none";

// -- projection ----------------------------------------------------------

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Equirectangular projection into a width x height pixel box over `bounds`. */
export function project(point: LatLon, bounds: MapBounds, width: number, height: number): Point {
  const x = ((point.lon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - point.lat) / (bounds.north - bounds.south)) * height;
  return { x, y };
}

/** The sub-rectangle (in the manifest's own pixel space) that shows only
 * a journey's viewport of the shared image — used as the overlay's SVG
 * viewBox, so route/landmark coordinates (projected at full-manifest
 * scale) land in the right place without a second coordinate system. */
export function viewportToViewBox(viewport: MapBounds, manifest: MapManifest): PixelBox {
  const topLeft = project({ lat: viewport.north, lon: viewport.west }, manifest.bounds, manifest.width, manifest.height);
  const bottomRight = project(
    { lat: viewport.south, lon: viewport.east },
    manifest.bounds,
    manifest.width,
    manifest.height,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function viewBoxString(box: PixelBox): string {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

// -- journey structure: legs between consecutive milestones ---------------

type JourneyEntry = Journey["entries"][number];

/** The top-level entry (by array index) whose `arrivesAtMilestoneId`
 * equals the given milestone, or -1 (meaning "before the first entry" —
 * only true of the journey's own start milestone). */
function entryIndexArrivingAt(entries: readonly JourneyEntry[], milestoneId: string): number {
  return entries.findIndex((e) => e.kind === "stage" && e.arrivesAtMilestoneId === milestoneId);
}

/**
 * For each milestone (except the last), how many top-level entries sit
 * between the entry that arrives AT it and the entry that arrives at the
 * NEXT milestone (journey.milestones order is travel order — a binding
 * authoring rule). A fork counts as exactly one entry, whatever its
 * routes contain. This is the denominator for interpolating a team's
 * on-map position while `stagesBeyondMilestone > 0`: each non-arriving
 * top-level entry a team completes advances that counter by one.
 */
export function legStageCounts(journey: Journey): Map<string, number> {
  const counts = new Map<string, number>();
  const { milestones, entries } = journey;
  for (let i = 0; i < milestones.length - 1; i++) {
    const fromIdx = i === 0 ? -1 : entryIndexArrivingAt(entries, milestones[i]!.id);
    const toIdx = entryIndexArrivingAt(entries, milestones[i + 1]!.id);
    counts.set(milestones[i]!.id, Math.max(0, toIdx - fromIdx - 1));
  }
  return counts;
}

// -- team position on the map --------------------------------------------

export interface MapPosition {
  /** percentage of the viewport box, 0-100 */
  xPercent: number;
  yPercent: number;
}

const FAN_OFFSET_PERCENT = 2.5; // percentage points of the viewport box, per fanned index
const MAX_INTERPOLATION = 0.9;

/**
 * A team's position on the map as a percentage of the journey's viewport
 * box: at its current milestone, interpolated toward the next one while
 * `stagesBeyondMilestone > 0`. Teams landing on the identical point are
 * fanned by a small diagonal offset, in `teams` array order, so badges
 * never fully overlap. Returns null if either milestone lacks
 * coordinates (a journey without `map` never calls this).
 */
export function teamMapPosition(
  team: TeamState,
  journey: Journey,
  teams: readonly TeamState[],
): MapPosition | null {
  if (!journey.map) return null;
  const { viewport } = journey.map;
  const { milestones } = journey;
  const index = milestones.findIndex((m) => m.id === team.currentMilestoneId);
  if (index < 0) return null;
  const current = milestones[index]!;
  if (!current.coordinates) return null;

  let lat = current.coordinates.lat;
  let lon = current.coordinates.lon;

  const next = milestones[index + 1];
  if (team.stagesBeyondMilestone > 0 && next?.coordinates) {
    const legCount = legStageCounts(journey).get(current.id) ?? 1;
    const fraction = Math.min(MAX_INTERPOLATION, team.stagesBeyondMilestone / Math.max(1, legCount));
    lat = current.coordinates.lat + (next.coordinates.lat - current.coordinates.lat) * fraction;
    lon = current.coordinates.lon + (next.coordinates.lon - current.coordinates.lon) * fraction;
  }

  const xPercentRaw = ((lon - viewport.west) / (viewport.east - viewport.west)) * 100;
  const yPercentRaw = ((viewport.north - lat) / (viewport.north - viewport.south)) * 100;

  const fanIndex = fanIndexFor(team, teams);
  return {
    xPercent: xPercentRaw + fanIndex * FAN_OFFSET_PERCENT,
    yPercent: yPercentRaw + fanIndex * FAN_OFFSET_PERCENT,
  };
}

/** This team's index among teams sharing its EXACT (milestone, beyond)
 * position, counted in `teams` array order — team order 0 is unfanned. */
function fanIndexFor(team: TeamState, teams: readonly TeamState[]): number {
  const key = (t: TeamState) => `${t.currentMilestoneId}:${t.stagesBeyondMilestone > 0 ? "beyond" : "at"}`;
  const ownKey = key(team);
  let index = 0;
  for (const t of teams) {
    if (t.id === team.id) break;
    if (key(t) === ownKey) index++;
  }
  return index;
}
