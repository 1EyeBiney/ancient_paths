// PHASE5B_SPEC Group M2 — manifest and assets.

import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { mapManifestSchema } from "../../src/ui/mapProjection";
import { BOUNDS, WIDTH, HEIGHT } from "../../scripts/make-map.mjs";

const MAP_DIR = resolve("public/map");
const manifestPath = resolve(MAP_DIR, "mediterranean.json");
const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("M2 — the committed manifest validates against mapManifestSchema", () => {
  it("parses cleanly", () => {
    const result = mapManifestSchema.safeParse(manifestRaw);
    expect(result.success).toBe(true);
  });

  it("its bounds/width/height match the generator script's own constants", () => {
    expect(manifestRaw.bounds).toEqual(BOUNDS);
    expect(manifestRaw.width).toBe(WIDTH);
    expect(manifestRaw.height).toBe(HEIGHT);
  });
});

describe("M2 — both style files exist and are under budget", () => {
  it("satellite <= 700KB, parchment <= 400KB", () => {
    const manifest = mapManifestSchema.parse(manifestRaw);
    const satellitePath = resolve(MAP_DIR, manifest.styles.satellite.file);
    const parchmentPath = resolve(MAP_DIR, manifest.styles.parchment.file);
    expect(statSync(satellitePath).size).toBeLessThanOrEqual(700 * 1024);
    expect(statSync(parchmentPath).size).toBeLessThanOrEqual(400 * 1024);
  });
});

describe("M2 — CREDITS.md names both public-domain sources", () => {
  it("mentions NASA and Natural Earth", () => {
    const credits = readFileSync(resolve(MAP_DIR, "CREDITS.md"), "utf8");
    expect(credits).toMatch(/NASA/);
    expect(credits).toMatch(/Natural Earth/);
    expect(credits.toLowerCase()).toMatch(/public domain/);
  });
});

describe("M2 — the parchment SVG's viewBox matches the manifest size", () => {
  it("viewBox is '0 0 width height'", () => {
    const manifest = mapManifestSchema.parse(manifestRaw);
    const svg = readFileSync(resolve(MAP_DIR, manifest.styles.parchment.file), "utf8");
    const match = /viewBox="([^"]+)"/.exec(svg);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(`0 0 ${manifest.width} ${manifest.height}`);
  });
});
