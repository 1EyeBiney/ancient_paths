// Melody synthesis (PHASE6_SPEC "Architecture"; CONTENT_AUTHORING §3c).
// scheduleMelody() is pure: melody data + variation parameters in, a
// timed list of notes out — fully testable without any audio API.
// playSchedule() is the one place that turns that list into sound,
// taking an already-constructed AudioContext/GainNode as parameters
// (owned and unlocked by backend.ts) rather than creating one itself.

import type { Melody } from "../../content/schemas";

export interface NoteEvent {
  startSec: number;
  durationSec: number;
  hz: number;
}

export interface MelodyVariationOptions {
  /** Limit to the first N notes (the amplified form's shorter excerpt). */
  firstN?: number;
  /** Shifts every note; +12 = one octave up. */
  transposeSemitones?: number;
  /** >1 = faster (shorter note durations), <1 = slower. Default 1. */
  tempoFactor?: number;
  /** Replaces one note's pitch (before transpose) — an authored "altered detail" task. */
  wrongNote?: { index: number; midi: number };
}

export function hzForMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function scheduleMelody(melody: Melody, options: MelodyVariationOptions = {}): NoteEvent[] {
  const { firstN, transposeSemitones = 0, tempoFactor = 1, wrongNote } = options;
  const notes = melody.notes.slice(0, firstN ?? melody.notes.length);
  const secondsPerBeat = 60 / melody.tempoBpm / tempoFactor;

  const events: NoteEvent[] = [];
  let t = 0;
  notes.forEach((note, i) => {
    const midi = (wrongNote && wrongNote.index === i ? wrongNote.midi : note.midi) + transposeSemitones;
    const durationSec = note.beats * secondsPerBeat;
    events.push({ startSec: t, durationSec, hz: hzForMidi(midi) });
    t += durationSec;
  });
  return events;
}

export function scheduleTotalDurationSec(schedule: NoteEvent[]): number {
  return schedule.reduce((sum, e) => sum + e.durationSec, 0);
}

/** Minimal surface this needs from a real or fake AudioContext/GainNode —
 * matches the Web Audio API exactly, so a real AudioContext satisfies it
 * with no adapter, and backend.ts's fake can implement just this much. */
export interface ToneAudioContext {
  currentTime: number;
  createOscillator(): {
    type: OscillatorType;
    frequency: { setValueAtTime(v: number, t: number): void };
    connect(dest: unknown): void;
    start(t: number): void;
    stop(t: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(v: number, t: number): void;
      linearRampToValueAtTime(v: number, t: number): void;
    };
    connect(dest: unknown): void;
  };
}

const ENVELOPE_SEC = 0.015; // short attack/release, avoids clicks

/** Schedules a whole note sequence as Web Audio oscillators starting
 * "now" (ctx.currentTime), each routed through its own short-envelope
 * gain node into `destination`. Never used for voice (ACCESSIBILITY_
 * PATTERNS §5) — melodies and cues only. */
export function playSchedule(schedule: NoteEvent[], ctx: ToneAudioContext, destination: unknown, gain = 1): void {
  const base = ctx.currentTime;
  for (const note of schedule) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(note.hz, base + note.startSec);
    const start = base + note.startSec;
    const end = start + note.durationSec;
    const attackEnd = Math.min(end, start + ENVELOPE_SEC);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, attackEnd);
    env.gain.linearRampToValueAtTime(0, end);
    osc.connect(env);
    env.connect(destination);
    osc.start(start);
    osc.stop(end + 0.01);
  }
}
