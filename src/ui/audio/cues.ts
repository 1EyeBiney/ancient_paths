// Synthesized cue definitions (PHASE6_SPEC "Architecture"). Pure data —
// short tone sequences played through Web Audio, never through HTML5
// audio (ACCESSIBILITY_PATTERNS §5: cues and melodies are Web Audio;
// voice is HTML5 audio, so a screen reader can duck it). Kept as data
// (not code) so cue timing/pitch can be reviewed and tuned without
// touching backend.ts.

export interface CueTone {
  hz: number;
  ms: number;
  /** 0-1, relative to the effects category gain. */
  gain: number;
}

export type CueId =
  | "correct"
  | "incorrect"
  | "skipped"
  | "stageComplete"
  | "journeyToken"
  | "communitySuccess"
  | "communityFail"
  | "arrival"
  | "celebration"
  | "menuOpen";

export const CUES: Record<CueId, CueTone[]> = {
  correct: [
    { hz: 660, ms: 90, gain: 0.8 },
    { hz: 880, ms: 140, gain: 0.8 },
  ],
  incorrect: [{ hz: 220, ms: 220, gain: 0.7 }],
  skipped: [{ hz: 330, ms: 150, gain: 0.6 }],
  stageComplete: [
    { hz: 523, ms: 100, gain: 0.8 },
    { hz: 659, ms: 100, gain: 0.8 },
    { hz: 784, ms: 160, gain: 0.8 },
  ],
  journeyToken: [
    { hz: 784, ms: 90, gain: 0.8 },
    { hz: 988, ms: 90, gain: 0.8 },
    { hz: 1175, ms: 180, gain: 0.9 },
  ],
  communitySuccess: [
    { hz: 587, ms: 110, gain: 0.8 },
    { hz: 740, ms: 110, gain: 0.8 },
    { hz: 880, ms: 170, gain: 0.85 },
  ],
  communityFail: [
    { hz: 392, ms: 160, gain: 0.7 },
    { hz: 330, ms: 220, gain: 0.7 },
  ],
  arrival: [{ hz: 440, ms: 120, gain: 0.7 }],
  celebration: [
    { hz: 523, ms: 90, gain: 0.85 },
    { hz: 659, ms: 90, gain: 0.85 },
    { hz: 784, ms: 90, gain: 0.85 },
    { hz: 1047, ms: 220, gain: 0.9 },
  ],
  menuOpen: [{ hz: 550, ms: 60, gain: 0.5 }],
};

export function cueDurationMs(id: CueId): number {
  return CUES[id].reduce((sum, tone) => sum + tone.ms, 0);
}
