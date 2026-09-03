// The audio backend seam (PHASE6_SPEC "Architecture"). The ONLY code that
// touches HTMLAudioElement, AudioContext, or timers. Everything else in
// this phase (manager.ts and its tests) is written against the
// AudioBackend interface, so it's fully testable against FakeAudioBackend
// without any real audio API — that is the point of the seam.
//
// ACCESSIBILITY_PATTERNS §5: produced voice/file clips play through
// HTML5 <audio> (screen readers can duck it); cues and melodies play
// through Web Audio (never voice — a screen reader cannot duck a raw
// Web Audio node, which would drown it out).

import type { CueTone } from "./cues";
import type { Melody } from "../../content/schemas";
import { playSchedule, scheduleMelody, type MelodyVariationOptions } from "./sequencer";

export type ClipSource =
  | { kind: "file"; filePath: string }
  | { kind: "melody"; melody: Melody; variation?: MelodyVariationOptions };

export interface PlayClipRequest {
  assetId: string;
  source: ClipSource;
  gain: number; // 0-1, fully computed by the manager
  durationSeconds: number; // drives the failsafe timer
}

export interface PlayClipCallbacks {
  onEnded: () => void;
  /** message is human-readable but the manager uses the asset's own fallbackText, not this string, for what it announces. */
  onError: (message: string) => void;
}

export interface AudioBackend {
  unlock(): void;
  isUnlocked(): boolean;

  /** Cues bypass the queue entirely — immediate, fire-and-forget. */
  playCue(tones: CueTone[], gain: number): void;

  /** Exactly one produced clip at a time; a second call implicitly stops the first. */
  playClip(request: PlayClipRequest, callbacks: PlayClipCallbacks): void;
  pauseClip(): void;
  resumeClip(): void;
  /** Stops the current clip. Its onEnded/onError never fires afterward. */
  stopClip(): void;
  isClipPaused(): boolean;
  hasActiveClip(): boolean;
  /** Live gain change on the currently loaded clip (a volume-dialog edit
   * mid-playback) — a no-op if nothing is loaded. Melody clips ignore this
   * (their gain node isn't re-touched after scheduling; a live gain change
   * takes effect on their next play). */
  setClipGain(gain: number): void;

  /** A single looped ambient/music channel, independent of the clip queue. */
  playAmbient(filePath: string, gain: number): void;
  stopAmbient(): void;
}

const FAILSAFE_SLACK_SEC = 1.5;

// ---------------------------------------------------------------------------
// FakeAudioBackend — records every call; lets a test fire `ended`, fail a
// load, or advance its own clock past the failsafe window. No real audio
// API is touched at all.
// ---------------------------------------------------------------------------

export interface BackendCall {
  method: string;
  args: unknown[];
}

export class FakeAudioBackend implements AudioBackend {
  readonly calls: BackendCall[] = [];

  private unlocked = false;
  private paused = false;
  private ambientPlaying = false;
  private failNext: string | null = null;

  private active: {
    assetId: string;
    fired: boolean;
    failsafeMs: number;
    callbacks: PlayClipCallbacks;
  } | null = null;
  private clockMs = 0;

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  unlock(): void {
    this.unlocked = true;
    this.record("unlock");
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  playCue(tones: CueTone[], gain: number): void {
    this.record("playCue", tones, gain);
  }

  playClip(request: PlayClipRequest, callbacks: PlayClipCallbacks): void {
    this.record("playClip", request);
    this.paused = false;
    if (this.failNext !== null) {
      const message = this.failNext;
      this.failNext = null;
      this.active = null;
      callbacks.onError(message);
      return;
    }
    this.active = {
      assetId: request.assetId,
      fired: false,
      failsafeMs: (request.durationSeconds + FAILSAFE_SLACK_SEC) * 1000,
      callbacks,
    };
    this.clockMs = 0;
  }

  pauseClip(): void {
    this.record("pauseClip");
    if (this.active) this.paused = true;
  }

  resumeClip(): void {
    this.record("resumeClip");
    if (this.active) this.paused = false;
  }

  stopClip(): void {
    this.record("stopClip");
    this.active = null;
    this.paused = false;
  }

  isClipPaused(): boolean {
    return this.paused;
  }

  hasActiveClip(): boolean {
    return this.active !== null;
  }

  setClipGain(gain: number): void {
    this.record("setClipGain", gain);
  }

  playAmbient(filePath: string, gain: number): void {
    this.record("playAmbient", filePath, gain);
    this.ambientPlaying = true;
  }

  stopAmbient(): void {
    this.record("stopAmbient");
    this.ambientPlaying = false;
  }

  isAmbientPlaying(): boolean {
    return this.ambientPlaying;
  }

  // -- test-only controls --------------------------------------------------

  /** The NEXT playClip() call fails to load instead of playing. */
  failNextLoad(message = "load failed"): void {
    this.failNext = message;
  }

  /** Simulates the underlying clip firing its native "ended" event. */
  fireEnded(): void {
    this.fireOnce();
  }

  /** Simulates the SAME native "ended" firing again (browsers sometimes
   * double-fire) — must advance nothing a second time. */
  fireEndedAgain(): void {
    this.fireOnce();
  }

  /** Advances the fake clock; if it crosses the failsafe threshold, the
   * failsafe timer fires (rescuing a swallowed `ended`). Like the real
   * backend, the failsafe measures playback time: a paused clip's clock
   * does not advance. */
  advanceClock(ms: number): void {
    if (!this.active || this.paused) return;
    this.clockMs += ms;
    if (this.clockMs >= this.active.failsafeMs) this.fireOnce();
  }

  private fireOnce(): void {
    const active = this.active;
    if (!active || active.fired) return;
    active.fired = true;
    this.active = null;
    active.callbacks.onEnded();
  }
}

// ---------------------------------------------------------------------------
// BrowserAudioBackend — the real implementation.
// ---------------------------------------------------------------------------

export class BrowserAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null;
  private unlockedFlag = false;

  private currentAudio: HTMLAudioElement | null = null; // file clips
  private currentMelodyGain: GainNode | null = null; // melody clips (paused via ctx.suspend)
  private currentFailsafeId: ReturnType<typeof setTimeout> | null = null;
  // The failsafe pauses with the clip (Fable's Phase 6 review): it must
  // measure playback time, not wall-clock time, or a clip paused longer
  // than its slack is declared "ended" while still paused and resume dies.
  private failsafeFire: (() => void) | null = null;
  private failsafeDeadlineMs = 0;
  private failsafeRemainingMs = 0;
  private generation = 0; // bumped by every playClip/stopClip; guards a stale event from a discarded clip

  private ambientAudio: HTMLAudioElement | null = null;
  private debugOscillatorCount = 0;

  unlock(): void {
    if (this.unlockedFlag) return;
    this.unlockedFlag = true;
    try {
      this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.installDebugHook();
    } catch {
      this.ctx = null; // no AudioContext available; cues/melodies degrade to silence + fallback text
    }
  }

  /** Group A8's manual browser check reads this — dev builds only (Vite
   * dead-code-eliminates the `import.meta.env.DEV` branch in production). */
  private installDebugHook(): void {
    if (!this.ctx || !import.meta.env?.DEV) return;
    const ctx = this.ctx;
    const originalCreateOscillator = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      this.debugOscillatorCount++;
      return originalCreateOscillator();
    };
    (window as unknown as { __audioDebug: unknown }).__audioDebug = {
      contextState: () => ctx.state,
      oscillatorCount: () => this.debugOscillatorCount,
      unlocked: () => this.unlockedFlag,
      currentAudioPaused: () => this.currentAudio?.paused ?? null,
      currentAudioVolume: () => this.currentAudio?.volume ?? null,
    };
  }

  isUnlocked(): boolean {
    return this.unlockedFlag;
  }

  playCue(tones: CueTone[], gain: number): void {
    if (!this.ctx) return;
    const master = this.ctx.createGain();
    master.gain.value = gain;
    master.connect(this.ctx.destination);
    let offsetSec = 0;
    for (const tone of tones) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      const start = this.ctx.currentTime + offsetSec;
      const durationSec = tone.ms / 1000;
      const end = start + durationSec;
      osc.type = "sine";
      osc.frequency.setValueAtTime(tone.hz, start);
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(tone.gain, Math.min(end, start + 0.01));
      env.gain.linearRampToValueAtTime(0, end);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(end + 0.01);
      offsetSec += durationSec;
    }
  }

  playClip(request: PlayClipRequest, callbacks: PlayClipCallbacks): void {
    this.stopClip();
    const myGeneration = ++this.generation;
    let fired = false;

    const fire = (fn: () => void) => {
      if (fired || myGeneration !== this.generation) return;
      fired = true;
      if (this.currentFailsafeId !== null) {
        clearTimeout(this.currentFailsafeId);
        this.currentFailsafeId = null;
      }
      fn();
    };

    this.failsafeFire = () => fire(() => callbacks.onEnded());
    this.armFailsafe((request.durationSeconds + FAILSAFE_SLACK_SEC) * 1000);

    if (request.source.kind === "file") {
      const audio = new Audio(request.source.filePath);
      audio.volume = Math.max(0, Math.min(1, request.gain));
      audio.addEventListener("ended", () => fire(() => callbacks.onEnded()));
      audio.addEventListener("error", () => fire(() => callbacks.onError("could not load audio file")));
      this.currentAudio = audio;
      void audio.play().catch(() => fire(() => callbacks.onError("could not start audio playback")));
      return;
    }

    // Melody: Web Audio. No real "ended" event for a group of oscillators,
    // so the failsafe timer (already armed above, at the schedule's own
    // duration) is the only completion signal.
    if (!this.ctx) {
      fire(() => callbacks.onError("no audio context available"));
      return;
    }
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, request.gain));
    gainNode.connect(this.ctx.destination);
    this.currentMelodyGain = gainNode;
    const schedule = scheduleMelody(request.source.melody, request.source.variation);
    playSchedule(schedule, this.ctx, gainNode, 1);
  }

  private armFailsafe(ms: number): void {
    this.failsafeRemainingMs = ms;
    this.failsafeDeadlineMs = Date.now() + ms;
    this.currentFailsafeId = setTimeout(() => this.failsafeFire?.(), ms);
  }

  private suspendFailsafe(): void {
    if (this.currentFailsafeId === null) return;
    clearTimeout(this.currentFailsafeId);
    this.currentFailsafeId = null;
    this.failsafeRemainingMs = Math.max(0, this.failsafeDeadlineMs - Date.now());
  }

  private clearFailsafe(): void {
    if (this.currentFailsafeId !== null) {
      clearTimeout(this.currentFailsafeId);
      this.currentFailsafeId = null;
    }
    this.failsafeFire = null;
  }

  pauseClip(): void {
    if (!this.hasActiveClip() || this.isClipPaused()) return;
    if (this.currentAudio) this.currentAudio.pause();
    else if (this.currentMelodyGain && this.ctx && this.ctx.state === "running") void this.ctx.suspend();
    this.suspendFailsafe();
  }

  resumeClip(): void {
    if (!this.hasActiveClip() || !this.isClipPaused()) return;
    if (this.currentAudio) void this.currentAudio.play().catch(() => {});
    else if (this.currentMelodyGain && this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    if (this.failsafeFire && this.currentFailsafeId === null) this.armFailsafe(this.failsafeRemainingMs);
  }

  stopClip(): void {
    this.generation++; // any pending native event or failsafe from the old clip becomes a no-op
    this.clearFailsafe();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.currentMelodyGain) {
      this.currentMelodyGain.disconnect();
      this.currentMelodyGain = null;
    }
  }

  isClipPaused(): boolean {
    if (this.currentAudio) return this.currentAudio.paused;
    if (this.currentMelodyGain) return this.ctx?.state === "suspended";
    return false;
  }

  hasActiveClip(): boolean {
    return this.currentAudio !== null || this.currentMelodyGain !== null;
  }

  setClipGain(gain: number): void {
    if (this.currentAudio) this.currentAudio.volume = Math.max(0, Math.min(1, gain));
    else if (this.currentMelodyGain) this.currentMelodyGain.gain.value = Math.max(0, Math.min(1, gain));
  }

  playAmbient(filePath: string, gain: number): void {
    this.stopAmbient();
    const audio = new Audio(filePath);
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, gain));
    this.ambientAudio = audio;
    void audio.play().catch(() => {
      /* ambient is optional atmosphere; a failed load is silently skipped, never surfaced as an error */
    });
  }

  stopAmbient(): void {
    if (this.ambientAudio) {
      this.ambientAudio.pause();
      this.ambientAudio = null;
    }
  }
}
