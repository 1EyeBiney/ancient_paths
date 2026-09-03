#!/usr/bin/env node
// Generates public/content/packs/dev-playtest.json (PHASE5_SPEC "Content";
// PHASE6_SPEC "Content: dev-playtest gains audio"). Deterministic,
// dependency-free, obviously fake: every prompt says so. This pack exists
// so the browser build is actually playable against the real journey; it
// NEVER ships (see its description). Run:
//   node scripts/make-dev-playtest.mjs [outputPath]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PLACEHOLDER_TONES } from "./make-placeholder-audio.mjs";

const CATEGORIES = [
  "scripture-knowledge",
  "bible-reasoning",
  "historical-context",
  "audio-listening",
  "hymn",
  "decision-strategy",
  "community",
];
const DIFFICULTIES = ["easy", "moderate", "hard"];
const PER_CELL = 20;
const PACK_ID = "dev-playtest";

// -- audio assets (PHASE6_SPEC decisions, Brian may veto) -------------------
// 6 file assets = the placeholder WAV tones (stand-ins for narration/Voice
// Portrait clips: no real voices, no ElevenLabs — OPEN_QUESTIONS 12/23).
// 4 melody assets = synthetic scale/arpeggio "tunes"; Brian authors the
// real public-domain hymn melodies later (OPEN_QUESTIONS 23).

function fileAssets() {
  return PLACEHOLDER_TONES.map(([name, hz, seconds], i) => ({
    assetId: name,
    filePath: `audio/dev/${name}.wav`,
    assetType: "task-audio",
    transcript: `Placeholder tone ${i + 1} (obviously fake, never real content).`,
    durationSeconds: seconds,
    replayAllowed: true,
    fallbackText: `A short placeholder tone (about ${hz} hertz) would play here.`,
    attribution: null,
  }));
}

const PLACEHOLDER_TUNES = [
  { melodyId: "placeholder-tune-1", title: "Placeholder tune 1 (ascending scale)", tempoBpm: 100, notes: [60, 62, 64, 65, 67, 69, 71, 72].map((midi) => ({ midi, beats: 1 })) },
  { melodyId: "placeholder-tune-2", title: "Placeholder tune 2 (arpeggio)", tempoBpm: 90, notes: [60, 64, 67, 72, 67, 64, 60].map((midi) => ({ midi, beats: 1 })) },
  { melodyId: "placeholder-tune-3", title: "Placeholder tune 3 (descending scale)", tempoBpm: 100, notes: [72, 71, 69, 67, 65, 64, 62, 60].map((midi) => ({ midi, beats: 1 })) },
  { melodyId: "placeholder-tune-4", title: "Placeholder tune 4 (short motif)", tempoBpm: 110, notes: [67, 71, 74, 71, 67, 71, 74, 79].map((midi) => ({ midi, beats: 1 })) },
];

function melodyAssets() {
  return PLACEHOLDER_TUNES.map((tune) => ({
    assetId: tune.melodyId,
    melody: { ...tune, attribution: "Synthetic placeholder — not a real hymn tune." },
    assetType: "hymn",
    transcript: `${tune.title}: a synthetic placeholder tune, not a real hymn.`,
    durationSeconds: (tune.notes.reduce((s, n) => s + n.beats, 0) * 60) / tune.tempoBpm,
    replayAllowed: true,
    fallbackText: "A short placeholder tune would play here.",
    attribution: "Synthetic placeholder — not a real hymn tune.",
  }));
}

function task(category, difficulty, n) {
  const answer = `Placeholder answer ${n}`;
  const prompt = `Dev playtest task ${n} (placeholder — never real content).`;
  const kind = n % 3; // 0: multiple choice, 1: clues, 2: plain
  const interact = n % 4; // spreads resourceInteractions around

  // Audio hookups (PHASE6_SPEC): every 10th audio-listening task gets a
  // task-level clip + a clueAudio array parallel to its clues; every hymn
  // task with n % 3 === 1 gets a melody asset on the amplified variant.
  const getsClipAudio = category === "audio-listening" && n % 10 === 0;
  const getsMelody = category === "hymn" && n % 3 === 1;

  const options =
    kind === 0
      ? [`Placeholder option ${n}A`, answer, `Placeholder option ${n}C`, `Placeholder option ${n}D`]
      : undefined;
  const clues = kind === 1 || getsClipAudio ? [`Placeholder clue ${n} one.`, `Placeholder clue ${n} two.`] : [];

  const assisted =
    interact === 1 || interact === 3
      ? {
          available: true,
          cost: { resource: "provision", amount: 1 },
          prompt: `Assisted: ${prompt}`,
          ...(options ? { options } : {}),
          successValue: 1,
        }
      : null;
  const amplified =
    interact === 2 || interact === 3 || getsMelody
      ? {
          available: true,
          cost: { resource: "courage", amount: 1 },
          prompt: `Amplified: ${prompt}`,
          answer,
          acceptedAnswers: [answer],
          successValue: 2,
          ...(getsMelody ? { audioAsset: PLACEHOLDER_TUNES[n % PLACEHOLDER_TUNES.length].melodyId, maxPlays: 1 } : {}),
        }
      : null;

  const clipAssetId = getsClipAudio ? PLACEHOLDER_TONES[Math.floor(n / 10) % PLACEHOLDER_TONES.length][0] : null;

  return {
    id: `${PACK_ID}-${category}-${difficulty}-${n}`,
    schemaVersion: 1,
    packId: PACK_ID,
    category,
    title: `Playtest ${category} ${difficulty} #${n}`,
    biblePeriods: [],
    locations: [],
    difficulty,
    prompt,
    answer,
    acceptedAnswers: [answer],
    hostGuidance: n % 5 === 0 ? "Placeholder host guidance." : null,
    scriptureReferences: [],
    normalVariant: { prompt, ...(options ? { options } : {}), successValue: 1 },
    assistedVariant: assisted,
    amplifiedVariant: amplified,
    clues,
    clueAudio: getsClipAudio ? [clipAssetId, clipAssetId] : undefined,
    teachingReveal: `Placeholder teaching reveal ${n}.`,
    historicalNote: n % 7 === 0 ? `Placeholder historical note ${n}.` : null,
    audioAsset: getsClipAudio ? clipAssetId : null,
    tags: ["dev-playtest", "placeholder"],
    resourceInteractions: {
      insight: interact !== 0 && (kind === 0 || kind === 1),
      provision: interact === 1 || interact === 3,
      courage: interact === 2 || interact === 3 || getsMelody,
    },
    estimatedSeconds: 30,
  };
}

export function buildPack() {
  const tasks = [];
  let n = 1;
  for (const category of CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < PER_CELL; i++) tasks.push(task(category, difficulty, n++));
    }
  }
  return {
    packId: PACK_ID,
    schemaVersion: 1,
    version: "0.0.1",
    title: "Dev Playtest (placeholder content)",
    description:
      "Generated by scripts/make-dev-playtest.mjs. Every prompt and answer is an obviously fake placeholder so the browser build is playable end to end. NEVER SHIPS.",
    tasks,
    audioAssets: [...fileAssets(), ...melodyAssets()],
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("make-dev-playtest.mjs");
if (isMain) {
  const out = resolve(process.argv[2] ?? "public/content/packs/dev-playtest.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(buildPack(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
