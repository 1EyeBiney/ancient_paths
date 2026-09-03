// AudioManager (PHASE6_SPEC "AudioManager"). Owns categories, the
// produced-audio queue, play caps, pause/replay/stop/skip, fallbacks,
// cancellation tokens, the kill switch, and the presenter gate. Talks
// only to an AudioBackend (backend.ts) and a present() function — never
// touches HTMLAudioElement/AudioContext/timers directly, so it is fully
// testable against FakeAudioBackend.

import type { AudioAsset } from "../../content/schemas";
import type { PresentInput, PresenterChannel } from "../presenter";
import { CUES, type CueId } from "./cues";
import type { AudioBackend, ClipSource } from "./backend";
import type { MelodyVariationOptions } from "./sequencer";

export type SettingsCategory = "music" | "effects" | "narration";

export interface AudioManagerSettings {
  master: number;
  music: number;
  effects: number;
  narration: number;
}

export type SpeechMode = "wait" | "interrupt";

export interface TaskAudioRef {
  taskId: string;
  variantKind: string;
}

export interface PlayAssetOptions {
  category?: SettingsCategory;
  onDone?: () => void;
  variation?: MelodyVariationOptions;
  /** Present only for task/variant audio — ties this play to the play-cap system. */
  task?: TaskAudioRef;
}

export interface AudioManagerOptions {
  backend: AudioBackend;
  present: (input: PresentInput) => void;
  settings: AudioManagerSettings;
  getAssets: () => Map<string, AudioAsset>;
}

interface QueueItem {
  assetId: string;
  category: SettingsCategory;
  onDone?: () => void;
  task?: TaskAudioRef;
  variation?: MelodyVariationOptions;
}

interface TaskCapState {
  maxPlays: number;
  played: number;
}

function taskKey(ref: TaskAudioRef): string {
  return `${ref.taskId}::${ref.variantKind}`;
}

function categoryForAssetType(assetType: AudioAsset["assetType"]): SettingsCategory {
  switch (assetType) {
    case "narration":
    case "task-audio":
    case "hymn":
      return "narration";
    case "music":
    case "ambient":
      return "music";
    case "effect":
      return "effects";
  }
}

const DEFAULT_MAX_PLAYS = 2;
const NO_REPLAYS_LEFT = "No replays left.";
const UNAVAILABLE = "That audio is unavailable right now.";

export class AudioManager {
  private readonly backend: AudioBackend;
  private readonly present: (input: PresentInput) => void;
  private settings: AudioManagerSettings;
  private readonly getAssets: () => Map<string, AudioAsset>;

  private queue: QueueItem[] = [];
  private currentItem: QueueItem | null = null;
  private token = 0;

  private readonly taskCaps = new Map<string, TaskCapState>();
  private lastTaskAudio: { assetId: string; category: SettingsCategory; task: TaskAudioRef; variation?: MelodyVariationOptions } | null = null;

  private deferredPolite: PresentInput | null = null;
  private speechMode: SpeechMode = "wait";

  constructor(options: AudioManagerOptions) {
    this.backend = options.backend;
    this.present = options.present;
    this.settings = options.settings;
    this.getAssets = options.getAssets;
  }

  unlock(): void {
    this.backend.unlock();
  }

  setSettings(partial: Partial<AudioManagerSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  getSettings(): AudioManagerSettings {
    return { ...this.settings };
  }

  setSpeechMode(mode: SpeechMode): void {
    this.speechMode = mode;
  }

  getSpeechMode(): SpeechMode {
    return this.speechMode;
  }

  isPlaying(): boolean {
    return this.currentItem !== null;
  }

  isPaused(): boolean {
    return this.currentItem !== null && this.backend.isClipPaused();
  }

  /** Establishes (or resets) the play-cap state for a newly presented task/variant. */
  presentTask(taskId: string, variantKind: string, maxPlays = DEFAULT_MAX_PLAYS): void {
    this.taskCaps.set(taskKey({ taskId, variantKind }), { maxPlays, played: 0 });
  }

  canPlayTaskAudio(taskId: string, variantKind: string): { allowed: boolean; played: number; cap: number } {
    const cap = this.taskCaps.get(taskKey({ taskId, variantKind })) ?? { maxPlays: DEFAULT_MAX_PLAYS, played: 0 };
    return { allowed: cap.played < cap.maxPlays, played: cap.played, cap: cap.maxPlays };
  }

  grantReplay(taskId: string): void {
    for (const [key, cap] of this.taskCaps.entries()) {
      if (key.startsWith(`${taskId}::`)) this.taskCaps.set(key, { ...cap, maxPlays: cap.maxPlays + 1 });
    }
  }

  private gainFor(category: SettingsCategory, asset: AudioAsset): number {
    const master = this.settings.master / 100;
    const cat = this.settings[category] / 100;
    const vol = asset.volumeRecommendation ?? 1;
    return master * cat * vol;
  }

  private isNarrationPlaying(): boolean {
    return this.currentItem !== null && this.currentItem.category === "narration";
  }

  playCue(cueId: CueId): void {
    const tones = CUES[cueId];
    const damp = this.isNarrationPlaying() ? 0.6 : 1;
    const gain = (this.settings.master / 100) * (this.settings.effects / 100) * damp;
    this.backend.playCue(tones, gain);
  }

  playAsset(id: string, options: PlayAssetOptions = {}): void {
    const asset = this.getAssets().get(id);
    const category = options.category ?? (asset ? categoryForAssetType(asset.assetType) : "narration");

    if (!asset) {
      this.present({ visual: UNAVAILABLE, channel: "polite" });
      options.onDone?.();
      return;
    }

    if (options.task) {
      const key = taskKey(options.task);
      const cap = this.taskCaps.get(key) ?? { maxPlays: DEFAULT_MAX_PLAYS, played: 0 };
      if (cap.played >= cap.maxPlays) {
        this.present({ visual: NO_REPLAYS_LEFT, channel: "polite" });
        options.onDone?.();
        return;
      }
      this.taskCaps.set(key, { ...cap, played: cap.played + 1 });
      this.lastTaskAudio = { assetId: id, category, task: options.task, variation: options.variation };
    }

    const item: QueueItem = { assetId: id, category, onDone: options.onDone, task: options.task, variation: options.variation };
    if (this.currentItem) this.queue.push(item);
    else this.startItem(item);
  }

  playMelody(id: string, variation?: MelodyVariationOptions): void {
    const asset = this.getAssets().get(id);
    const category = asset ? categoryForAssetType(asset.assetType) : "narration";
    this.playAsset(id, { category, variation });
  }

  playAmbient(assetId: string | null): void {
    this.backend.stopAmbient();
    if (!assetId) return;
    const asset = this.getAssets().get(assetId);
    if (!asset || !asset.filePath) return;
    this.backend.playAmbient(asset.filePath, this.gainFor("music", asset));
  }

  private startItem(item: QueueItem): void {
    this.currentItem = item;
    const tokenAtStart = this.token;
    const asset = this.getAssets().get(item.assetId);
    if (!asset) {
      this.present({ visual: UNAVAILABLE, channel: "polite" });
      this.finishCurrent(item);
      return;
    }

    const source: ClipSource = asset.melody
      ? { kind: "melody", melody: asset.melody, variation: item.variation }
      : { kind: "file", filePath: asset.filePath as string };

    this.backend.playClip(
      { assetId: asset.assetId, source, gain: this.gainFor(item.category, asset), durationSeconds: asset.durationSeconds },
      {
        onEnded: () => {
          if (tokenAtStart !== this.token) return;
          this.finishCurrent(item);
        },
        onError: () => {
          if (tokenAtStart !== this.token) return;
          this.present({ visual: asset.fallbackText, channel: "polite" });
          this.finishCurrent(item);
        },
      },
    );
  }

  private finishCurrent(item: QueueItem): void {
    this.currentItem = null;
    this.flushDeferred();
    item.onDone?.();
    this.advanceQueue();
  }

  private advanceQueue(): void {
    const next = this.queue.shift();
    if (next) this.startItem(next);
  }

  private flushDeferred(): void {
    if (!this.deferredPolite) return;
    const input = this.deferredPolite;
    this.deferredPolite = null;
    this.present(input);
  }

  pause(): void {
    if (this.currentItem) this.backend.pauseClip();
  }

  resume(): void {
    if (this.currentItem) this.backend.resumeClip();
  }

  /** Stops the current clip and the rest of the queue; flushes the deferred slot. Never calls onDone (an abort, not a completion). */
  stop(): void {
    if (!this.currentItem) return;
    this.backend.stopClip();
    this.token++;
    this.currentItem = null;
    this.queue = [];
    this.flushDeferred();
  }

  /** Replays the last-played task audio, respecting its cap. */
  replay(): void {
    if (!this.lastTaskAudio) {
      this.present({ visual: "Nothing to replay yet.", channel: "polite" });
      return;
    }
    const { assetId, category, task, variation } = this.lastTaskAudio;
    this.playAsset(assetId, { category, task, variation });
  }

  /** Skips the current OPTIONAL clip only; task audio is never skipped. */
  skip(): void {
    if (!this.currentItem) return;
    if (this.currentItem.task) {
      this.present({ visual: "This audio can't be skipped.", channel: "polite" });
      return;
    }
    const item = this.currentItem;
    this.backend.stopClip();
    this.token++;
    this.currentItem = null;
    this.finishCurrent(item);
  }

  /** The kill switch: cancels any pending completion, clears the queue and ambient, discards (not flushes) any deferred announcement. */
  killAll(): void {
    this.token++;
    this.backend.stopClip();
    this.backend.stopAmbient();
    this.currentItem = null;
    this.queue = [];
    this.deferredPolite = null;
  }

  // -- the presenter gate ----------------------------------------------------

  shouldDefer(): boolean {
    return this.currentItem !== null && this.speechMode === "wait";
  }

  defer(input: PresentInput): void {
    this.deferredPolite = input;
  }

  onAnnounce(channel: PresenterChannel): void {
    const shouldStop = channel === "assertive" || (channel === "polite" && this.speechMode === "interrupt");
    if (!shouldStop || !this.currentItem) return;
    this.deferredPolite = null;
    this.backend.stopClip();
    this.token++;
    this.currentItem = null;
    this.queue = [];
  }
}
