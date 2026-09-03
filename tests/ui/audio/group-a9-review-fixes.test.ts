// @vitest-environment jsdom
// Fable's review of Phase 6 (OPEN_QUESTIONS item 25): the failsafe timer
// must pause with the clip; the Insight / Journey Token "replay" effect
// needs a UI action so grantReplay is reachable; the transport bar needs
// a real group role; and a Sound check screen so Brian can test sounds
// one at a time instead of random-walking the game.

import { describe, expect, it, vi, afterEach } from "vitest";
import { contentPackSchema, audioAssetSchema } from "../../../src/content/schemas";
import { BrowserAudioBackend, FakeAudioBackend } from "../../../src/ui/audio/backend";
import { AudioManager } from "../../../src/ui/audio/manager";
import { CUES } from "../../../src/ui/audio/cues";
import type { AudioAsset } from "../../../src/content/schemas";
import { makeApp, beginByMouse, findButtonByText, keyboardStep, type AppHarness } from "../appHarness";
import { buildAudioPack, journeyWithAmbient } from "./fixtures";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// -- 1. the failsafe pauses with the clip -----------------------------------

class StubAudio {
  paused = true;
  volume = 1;
  currentTime = 0;
  constructor(public src: string) {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(): void {}
}

describe("A9 — BrowserAudioBackend's failsafe measures playback time, not wall-clock time", () => {
  it("a clip paused past its own duration is not declared ended until it has actually played that long", () => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", StubAudio);
    const backend = new BrowserAudioBackend();
    const onEnded = vi.fn();
    backend.playClip(
      { assetId: "a", source: { kind: "file", filePath: "audio/a.wav" }, gain: 1, durationSeconds: 2 },
      { onEnded, onError: vi.fn() },
    );

    vi.advanceTimersByTime(1000); // 1 s in
    backend.pauseClip();
    expect(backend.isClipPaused()).toBe(true);
    vi.advanceTimersByTime(10_000); // paused for 10 s — far past duration + 1.5 s slack
    expect(onEnded).not.toHaveBeenCalled();

    backend.resumeClip();
    expect(backend.isClipPaused()).toBe(false);
    vi.advanceTimersByTime(2400); // 1 s + 2.4 s = 3.4 s of playback, under the 3.5 s failsafe
    expect(onEnded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200); // 3.6 s of playback: the (swallowed) ended is now rescued
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("stop while paused clears the failsafe for good", () => {
    vi.useFakeTimers();
    vi.stubGlobal("Audio", StubAudio);
    const backend = new BrowserAudioBackend();
    const onEnded = vi.fn();
    backend.playClip(
      { assetId: "a", source: { kind: "file", filePath: "audio/a.wav" }, gain: 1, durationSeconds: 2 },
      { onEnded, onError: vi.fn() },
    );
    backend.pauseClip();
    backend.stopClip();
    vi.advanceTimersByTime(60_000);
    expect(onEnded).not.toHaveBeenCalled();
  });
});

describe("A9 — FakeAudioBackend mirrors that: the fake clock stops while paused", () => {
  it("pause, wait, resume: the manager still sees the clip as playing and Space can resume it", () => {
    const backend = new FakeAudioBackend();
    const asset: AudioAsset = {
      assetId: "a",
      filePath: "audio/a.wav",
      assetType: "narration",
      transcript: "t",
      durationSeconds: 2,
      replayAllowed: true,
      fallbackText: "f",
      attribution: null,
    };
    const manager = new AudioManager({
      backend,
      present: () => {},
      settings: { master: 100, music: 100, effects: 100, narration: 100 },
      getAssets: () => new Map([["a", asset]]),
    });
    manager.playAsset("a", { category: "narration" });
    manager.pause();
    backend.advanceClock(60_000);
    expect(manager.isPlaying()).toBe(true);
    expect(manager.isPaused()).toBe(true);
    manager.resume();
    expect(manager.isPaused()).toBe(false);
    backend.advanceClock(3600);
    expect(manager.isPlaying()).toBe(false);
  });
});

// -- 2. the Insight / Journey Token "replay" effect is reachable ------------

function driveUntil(harness: AppHarness, predicate: (state: string) => boolean, maxSteps = 100): void {
  const engine = harness.app.getEngine()!;
  let steps = 0;
  while (!predicate(engine.getState()) && steps < maxSteps) {
    if (!keyboardStep(harness)) break;
    steps++;
  }
}

describe("A9 — 'hear the audio again' actions", () => {
  it("spending Insight on replay raises the cap and replays the task clip", () => {
    const backend = new FakeAudioBackend();
    h = makeApp({
      journeys: [journeyWithAmbient],
      packs: [buildAudioPack()],
      extra: { audioBackend: backend, startingResources: { insight: 3, provision: 3, courage: 3 } },
    });
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow");
    const engine = h.app.getEngine()!;
    const taskId = engine.getCurrentTaskPublic()!.id;
    const manager = h.app.getAudioManager();
    backend.fireEnded(); // the automatic first play finishes
    expect(manager.canPlayTaskAudio(taskId, "normal")).toEqual({ allowed: true, played: 1, cap: 2 });

    const button = h.root.querySelector<HTMLButtonElement>('button[data-action-id="spendInsightReplay"]');
    expect(button).not.toBeNull();
    button!.click();

    expect(manager.canPlayTaskAudio(taskId, "normal")).toEqual({ allowed: true, played: 2, cap: 3 });
    const plays = backend.calls.filter((c) => c.method === "playClip" && (c.args[0] as { assetId: string }).assetId === `${taskId}-clip`);
    expect(plays).toHaveLength(2);
    expect(engine.getSession().eventLog.some((e) => /spends Insight to replay/.test(e.text))).toBe(true);
  });

  it("the actions are absent on a task with no audio", () => {
    h = makeApp(); // bigPack: no audio assets at all
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow");
    expect(h.root.querySelector('button[data-action-id="spendInsightReplay"]')).toBeNull();
    expect(h.root.querySelector('button[data-action-id="journeyTokenReplay"]')).toBeNull();
  });
});

// -- 3. the transport bar is a labelled group --------------------------------

describe("A9 — audio controls are a labelled group", () => {
  it("role=group with an accessible name, so the label is actually announced", () => {
    h = makeApp();
    beginByMouse(h);
    const bar = h.root.querySelector<HTMLElement>(".audio-controls")!;
    expect(bar.getAttribute("role")).toBe("group");
    expect(bar.getAttribute("aria-label")).toBe("Audio controls");
  });
});

// -- 4. the Sound check screen ----------------------------------------------

function packWithMelody() {
  const pack = buildAudioPack();
  const tune = audioAssetSchema.parse({
    assetId: "tune-1",
    melody: {
      melodyId: "tune-1",
      title: "Test tune",
      tempoBpm: 100,
      notes: [60, 62, 64, 65, 67, 69].map((midi) => ({ midi, beats: 1 })),
      attribution: "synthetic",
    },
    assetType: "hymn",
    transcript: "a test tune",
    durationSeconds: 3.6,
    replayAllowed: true,
    fallbackText: "A tune would play here.",
    attribution: "synthetic",
  });
  return contentPackSchema.parse({ ...pack, audioAssets: [...(pack.audioAssets ?? []), tune] });
}

describe("A9 — Sound check", () => {
  it("is reachable from Welcome, unlocks audio, lists every cue and every loaded asset, and plays them", () => {
    const backend = new FakeAudioBackend();
    h = makeApp({ journeys: [journeyWithAmbient], packs: [packWithMelody()], extra: { audioBackend: backend } });
    findButtonByText(h.root, "Sound check").click();
    expect(h.app.getMode()).toBe("soundCheck");
    expect(backend.isUnlocked()).toBe(true);

    const cueButtons = h.root.querySelectorAll<HTMLButtonElement>("button[data-cue-id]");
    expect(cueButtons).toHaveLength(Object.keys(CUES).length);
    const clipButtons = h.root.querySelectorAll<HTMLButtonElement>("button[data-asset-id]:not([data-variation])");
    const expectedAssets = (packWithMelody().audioAssets?.length ?? 0) + (journeyWithAmbient.audioAssets?.length ?? 0);
    expect(clipButtons).toHaveLength(expectedAssets);

    findButtonByText(h.root, "Correct answer").click();
    expect(backend.calls.filter((c) => c.method === "playCue")).toHaveLength(1);
    expect(backend.calls.find((c) => c.method === "playCue")?.args[0]).toEqual(CUES.correct);

    h.root.querySelector<HTMLButtonElement>('button[data-asset-id="midway-ambient"]:not([data-variation])')!.click();
    const clip = backend.calls.find((c) => c.method === "playClip")?.args[0] as { assetId: string };
    expect(clip.assetId).toBe("midway-ambient");
    backend.fireEnded();
    expect(h.app.getPresenterLog().at(-1)?.visual).toBe("Finished: midway-ambient.");

    h.root.querySelector<HTMLButtonElement>('button[data-asset-id="tune-1"][data-variation="excerpt"]')!.click();
    const melody = backend.calls.filter((c) => c.method === "playClip").at(-1)?.args[0] as {
      source: { kind: string; variation?: { firstN?: number } };
    };
    expect(melody.source.kind).toBe("melody");
    expect(melody.source.variation?.firstN).toBe(4);
  });

  it("has the transport controls and live audio settings, and Back returns to Welcome silently", () => {
    const backend = new FakeAudioBackend();
    h = makeApp({ journeys: [journeyWithAmbient], packs: [buildAudioPack()], extra: { audioBackend: backend } });
    findButtonByText(h.root, "Sound check").click();

    findButtonByText(h.root, "Stop audio").click();
    expect(h.app.getPresenterLog().at(-1)?.visual).toBe("Nothing is playing.");

    const master = h.root.querySelector<HTMLInputElement>('input[aria-label="master volume"]')!;
    master.value = "25";
    master.dispatchEvent(new Event("input", { bubbles: true }));
    expect(h.app.getAudioManager().getSettings().master).toBe(25);

    h.root.querySelector<HTMLButtonElement>('button[data-asset-id="midway-ambient"]')!.click();
    expect(h.app.getAudioManager().isPlaying()).toBe(true);
    findButtonByText(h.root, "Back").click();
    expect(h.app.getMode()).toBe("startup");
    expect(h.app.getAudioManager().isPlaying()).toBe(false);
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });
});
