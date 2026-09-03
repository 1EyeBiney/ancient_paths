// PHASE6_SPEC Group A2 — schema (extending the already-green content
// tests) plus the regenerated dev-playtest pack.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack } from "../../../src/content/loader";
import { buildPack } from "../../../scripts/make-dev-playtest.mjs";
import { buildPlaceholderFiles, PLACEHOLDER_TONES } from "../../../scripts/make-placeholder-audio.mjs";

describe("A2 — the regenerated dev-playtest pack validates", () => {
  it("contains both melody and file audio assets", () => {
    const pack = buildPack();
    const result = validateContentPack(pack, "dev-playtest");
    expect(result.ok).toBe(true);
    expect(pack.audioAssets.some((a) => "melody" in a)).toBe(true);
    expect(pack.audioAssets.some((a) => "filePath" in a)).toBe(true);
    expect(pack.audioAssets.filter((a) => "melody" in a)).toHaveLength(4);
    expect(pack.audioAssets.filter((a) => "filePath" in a)).toHaveLength(6);
  });

  it("is deterministic across regeneration", () => {
    expect(buildPack()).toEqual(buildPack());
  });

  it("the committed file matches a fresh build", () => {
    const committed = JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8"));
    expect(committed).toEqual(buildPack());
  });

  it("every audio reference resolves, and no task references audio the pack lacks", () => {
    const pack = buildPack();
    const ids = new Set(pack.audioAssets.map((a) => a.assetId));
    for (const task of pack.tasks) {
      if (task.audioAsset) expect(ids.has(task.audioAsset)).toBe(true);
      if (task.amplifiedVariant?.audioAsset) expect(ids.has(task.amplifiedVariant.audioAsset)).toBe(true);
      for (const clip of task.clueAudio ?? []) {
        if (clip) expect(ids.has(clip)).toBe(true);
      }
    }
  });

  it("every referenced WAV file exists on disk under public/", () => {
    const pack = buildPack();
    for (const asset of pack.audioAssets) {
      const filePath = asset.filePath;
      if (filePath) {
        expect(() => readFileSync(resolve("public", filePath))).not.toThrow();
      }
    }
  });

  it("melody assets are obviously synthetic, never claiming to be a real hymn", () => {
    const pack = buildPack();
    for (const asset of pack.audioAssets) {
      if (asset.melody) {
        expect(asset.attribution?.toLowerCase()).toMatch(/synthetic|placeholder/);
        expect(asset.transcript.toLowerCase()).toMatch(/synthetic|placeholder/);
      }
    }
  });
});

describe("A2 — the placeholder WAV generator", () => {
  it("produces valid RIFF/WAVE files, deterministic, under 1 second each", () => {
    const files = buildPlaceholderFiles();
    expect(files).toHaveLength(PLACEHOLDER_TONES.length);
    for (const file of files) {
      expect(file.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(file.buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
      expect(file.durationSeconds).toBeLessThanOrEqual(1);
    }
    expect(buildPlaceholderFiles().map((f) => f.buffer.toString("base64"))).toEqual(
      files.map((f) => f.buffer.toString("base64")),
    );
  });

  it("the committed WAV files on disk match a fresh build byte for byte", () => {
    for (const file of buildPlaceholderFiles()) {
      const committed = readFileSync(resolve("public/audio/dev", file.name));
      expect(committed.equals(file.buffer)).toBe(true);
    }
  });
});
