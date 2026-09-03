#!/usr/bin/env node
// Writes tiny placeholder WAV tones (PHASE6_SPEC "Content"): stand-ins for
// narration and Voice Portrait clips in the dev-playtest pack. Pure JS
// RIFF/PCM writer, no dependencies, no real voices. Deterministic. Run:
//   node scripts/make-placeholder-audio.mjs [outDir]

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SAMPLE_RATE = 8000; // low rate keeps files tiny; these are placeholders, not content
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

// One short tone per placeholder: [hz, seconds]. Six distinct pitches so
// they're at least audibly different from one another in a dev check.
export const PLACEHOLDER_TONES = [
  ["placeholder-1", 440, 0.5],
  ["placeholder-2", 494, 0.5],
  ["placeholder-3", 554, 0.5],
  ["placeholder-4", 587, 0.6],
  ["placeholder-5", 659, 0.6],
  ["placeholder-6", 740, 0.7],
];

function sineWav(hz, seconds) {
  const sampleCount = Math.round(SAMPLE_RATE * seconds);
  const dataSize = sampleCount * CHANNELS * (BITS_PER_SAMPLE / 8);
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8), 28); // byte rate
  buf.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32); // block align
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  // Short attack/release envelope so it doesn't click.
  const envelopeSamples = Math.min(200, Math.floor(sampleCount / 4));
  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    let envelope = 1;
    if (i < envelopeSamples) envelope = i / envelopeSamples;
    else if (i > sampleCount - envelopeSamples) envelope = (sampleCount - i) / envelopeSamples;
    const sample = Math.sin(2 * Math.PI * hz * t) * envelope * 0.5; // 0.5 = headroom
    const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buf.writeInt16LE(int16, 44 + i * 2);
  }
  return buf;
}

export function buildPlaceholderFiles() {
  return PLACEHOLDER_TONES.map(([name, hz, seconds]) => ({
    name: `${name}.wav`,
    buffer: sineWav(hz, seconds),
    durationSeconds: seconds,
  }));
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("make-placeholder-audio.mjs");
if (isMain) {
  const outDir = resolve(process.argv[2] ?? "public/audio/dev");
  mkdirSync(outDir, { recursive: true });
  for (const file of buildPlaceholderFiles()) {
    const path = resolve(outDir, file.name);
    writeFileSync(path, file.buffer);
    console.log(`wrote ${path} (${file.buffer.length} bytes)`);
  }
}
