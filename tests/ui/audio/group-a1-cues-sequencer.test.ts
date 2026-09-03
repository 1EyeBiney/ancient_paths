// PHASE6_SPEC Group A1 — cues and sequencer. Pure functions, no DOM, no
// Web Audio API — deterministic.

import { describe, expect, it } from "vitest";
import { CUES, cueDurationMs, type CueId } from "../../../src/ui/audio/cues";
import { hzForMidi, scheduleMelody, scheduleTotalDurationSec } from "../../../src/ui/audio/sequencer";
import type { Melody } from "../../../src/content/schemas";

describe("A1 — every cue has at least one positive-duration tone", () => {
  it("all 12 documented cue ids are present with real tones", () => {
    const expectedIds: CueId[] = [
      "correct",
      "incorrect",
      "skipped",
      "stageComplete",
      "journeyToken",
      "communitySuccess",
      "communityFail",
      "arrival",
      "celebration",
      "menuOpen",
      "offering",
      "serviceEarned",
    ];
    expect(Object.keys(CUES).sort()).toEqual([...expectedIds].sort());
    for (const id of expectedIds) {
      expect(CUES[id].length).toBeGreaterThan(0);
      for (const tone of CUES[id]) {
        expect(tone.ms).toBeGreaterThan(0);
        expect(tone.hz).toBeGreaterThan(0);
      }
      expect(cueDurationMs(id)).toBe(CUES[id].reduce((s, t) => s + t.ms, 0));
    }
  });
});

describe("A1 — hzForMidi", () => {
  it("A4 (midi 69) is 440Hz; A5 (midi 81, +12) is 880Hz", () => {
    expect(hzForMidi(69)).toBeCloseTo(440, 5);
    expect(hzForMidi(81)).toBeCloseTo(880, 5);
  });
});

function melody(overrides: Partial<Melody> = {}): Melody {
  return {
    melodyId: "test-tune",
    title: "Test Tune",
    tempoBpm: 120,
    notes: [
      { midi: 60, beats: 1 },
      { midi: 62, beats: 1 },
      { midi: 64, beats: 2 },
      { midi: 65, beats: 1 },
    ],
    attribution: "Test fixture.",
    ...overrides,
  };
}

describe("A1 — scheduleMelody honors every variation parameter", () => {
  it("with no options, plays every note at its natural pitch/duration", () => {
    const m = melody();
    const schedule = scheduleMelody(m);
    expect(schedule).toHaveLength(4);
    expect(schedule[0]!.hz).toBeCloseTo(hzForMidi(60), 5);
    expect(schedule[2]!.durationSec).toBeCloseTo((2 * 60) / 120, 5); // 2 beats at 120bpm
    expect(scheduleTotalDurationSec(schedule)).toBeCloseTo(
      m.notes.reduce((sum, n) => sum + n.beats, 0) * (60 / m.tempoBpm),
      5,
    );
  });

  it("firstN limits to the first N notes", () => {
    const schedule = scheduleMelody(melody(), { firstN: 2 });
    expect(schedule).toHaveLength(2);
  });

  it("transposeSemitones: +12 exactly doubles every hz", () => {
    const base = scheduleMelody(melody());
    const up = scheduleMelody(melody(), { transposeSemitones: 12 });
    base.forEach((note, i) => expect(up[i]!.hz).toBeCloseTo(note.hz * 2, 5));
  });

  it("tempoFactor scales durations (and thus start times) inversely", () => {
    const base = scheduleMelody(melody());
    const doubleSpeed = scheduleMelody(melody(), { tempoFactor: 2 });
    base.forEach((note, i) => {
      expect(doubleSpeed[i]!.durationSec).toBeCloseTo(note.durationSec / 2, 5);
      expect(doubleSpeed[i]!.startSec).toBeCloseTo(note.startSec / 2, 5);
    });
  });

  it("wrongNote changes only the pitch at that index", () => {
    const base = scheduleMelody(melody());
    const altered = scheduleMelody(melody(), { wrongNote: { index: 2, midi: 70 } });
    altered.forEach((note, i) => {
      if (i === 2) expect(note.hz).toBeCloseTo(hzForMidi(70), 5);
      else expect(note.hz).toBeCloseTo(base[i]!.hz, 5);
    });
    // Durations/timing are unaffected by a wrong-note substitution.
    altered.forEach((note, i) => {
      expect(note.durationSec).toBeCloseTo(base[i]!.durationSec, 5);
      expect(note.startSec).toBeCloseTo(base[i]!.startSec, 5);
    });
  });

  it("is fully deterministic: identical inputs produce identical output", () => {
    const a = scheduleMelody(melody(), { firstN: 3, transposeSemitones: -2, tempoFactor: 1.5 });
    const b = scheduleMelody(melody(), { firstN: 3, transposeSemitones: -2, tempoFactor: 1.5 });
    expect(a).toEqual(b);
  });
});
