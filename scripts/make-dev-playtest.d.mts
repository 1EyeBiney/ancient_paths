// Type surface of the dependency-free generator, for tests that import it.
// Loosely typed on purpose — the pack is validated through
// contentPackSchema at the point of use, which is the real contract; this
// just gives tests enough shape to inspect the generator's own output
// (audio hookups, etc.) without a full schema-derived type.
export interface GeneratedAudioAsset {
  assetId: string;
  filePath?: string;
  melody?: unknown;
  attribution?: string | null;
  transcript: string;
  [key: string]: unknown;
}

export interface GeneratedTask {
  id: string;
  category: string;
  audioAsset: string | null;
  clueAudio?: (string | null)[];
  amplifiedVariant?: { audioAsset?: string; maxPlays?: number; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface GeneratedPack {
  packId: string;
  tasks: GeneratedTask[];
  audioAssets: GeneratedAudioAsset[];
  [key: string]: unknown;
}

export function buildPack(): GeneratedPack;
