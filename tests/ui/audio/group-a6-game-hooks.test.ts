// @vitest-environment jsdom
// PHASE6_SPEC Group A6 — game hooks: task audio auto-play, extra-clue
// audio, ruling cues, landmark ambient, journey-token/stage-complete
// cues from the event log, celebration at gameSummary, killAll on a
// state change mid-clip, and a whole-game cue/log consistency check.

import { describe, expect, it, vi, afterEach } from "vitest";
import { FakeAudioBackend, type BackendCall } from "../../../src/ui/audio/backend";
import {
  makeApp,
  beginByMouse,
  keydownOn,
  keyboardStep,
  driveToSummary,
  type AppHarness,
} from "../appHarness";
import { buildAudioPack, journeyWithAmbient, AMBIENT_PATH } from "./fixtures";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function driveUntil(harness: AppHarness, predicate: (state: string) => boolean, maxSteps = 100): void {
  const engine = harness.app.getEngine()!;
  let steps = 0;
  while (!predicate(engine.getState()) && steps < maxSteps) {
    if (!keyboardStep(harness)) break;
    steps++;
  }
}

function playClipCalls(calls: BackendCall[]): { assetId: string }[] {
  return calls.filter((c) => c.method === "playClip").map((c) => c.args[0] as { assetId: string });
}

function makeAudioApp(startingResources?: { insight: number; provision: number; courage: number }): {
  h: AppHarness;
  backend: FakeAudioBackend;
} {
  const backend = new FakeAudioBackend();
  const harness = makeApp({
    journeys: [journeyWithAmbient],
    packs: [buildAudioPack()],
    extra: { audioBackend: backend, ...(startingResources ? { startingResources } : {}) },
  });
  return { h: harness, backend };
}

describe("A6 — task audio on presentation", () => {
  it("plays the task's clip automatically and counts it as one play", () => {
    const setup = makeAudioApp();
    h = setup.h;
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow");

    const engine = h.app.getEngine()!;
    const taskId = engine.getCurrentTaskPublic()!.id;
    const manager = h.app.getAudioManager();

    expect(manager.canPlayTaskAudio(taskId, "normal")).toEqual({ allowed: true, played: 1, cap: 2 });
    expect(playClipCalls(setup.backend.calls).some((c) => c.assetId === `${taskId}-clip`)).toBe(true);
  });
});

describe("A6 — extra clue audio", () => {
  it("plays clueAudio for a newly revealed clue", () => {
    const setup = makeAudioApp({ insight: 3, provision: 3, courage: 3 });
    h = setup.h;
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow");

    const engine = h.app.getEngine()!;
    const taskId = engine.getCurrentTaskPublic()!.id;
    setup.backend.fireEnded(); // let the task's own auto-played clip finish, freeing the queue
    const button = h.root.querySelector<HTMLButtonElement>('button[data-action-id="spendInsightExtraClue"]');
    expect(button).not.toBeNull();
    button!.click();

    expect(engine.getCurrentTaskPublic()!.cluesRevealed.length).toBe(1);
    expect(playClipCalls(setup.backend.calls).some((c) => c.assetId === `${taskId}-clue-0`)).toBe(true);
  });
});

describe("A6 — ruling cues", () => {
  it("plays correct, incorrect, and skipped cues on their respective rulings", () => {
    const setup = makeAudioApp();
    h = setup.h;
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    const cueSpy = vi.spyOn(manager, "playCue");

    for (const [key, result] of [
      ["c", "correct"],
      ["i", "incorrect"],
      ["k", "skipped"],
    ] as const) {
      driveUntil(h, (s) => s === "resourceWindow");
      keydownOn(window, "Enter"); // acceptAnswer -> awaitingAnswer
      keydownOn(window, "Enter"); // reveal -> answerReveal
      keydownOn(window, key); // rule
      expect(cueSpy).toHaveBeenCalledWith(result);
      // clear whatever state the ruling landed in (teachingReveal / recoverDecision) back toward the next task
      driveUntil(h, (s) => s === "resourceWindow" || s === "gameSummary" || s === "forkChoice", 20);
      if (h.app.getEngine()!.getState() === "forkChoice") break;
    }
  });
});

describe("A6 — landmark arrival: ambient + stageComplete + journeyToken", () => {
  it("starts the milestone's ambient and fires stageComplete/journeyToken cues on a perfect stage", () => {
    const setup = makeAudioApp();
    h = setup.h;
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    const cueSpy = vi.spyOn(manager, "playCue");

    driveUntil(h, (s) => s === "landmarkIntroduction", 200);
    expect(h.app.getEngine()!.getState()).toBe("landmarkIntroduction");

    expect(setup.backend.calls.some((c) => c.method === "playAmbient" && c.args[0] === AMBIENT_PATH)).toBe(true);
    expect(cueSpy.mock.calls.some((c) => c[0] === "stageComplete")).toBe(true);
    expect(cueSpy.mock.calls.some((c) => c[0] === "journeyToken")).toBe(true);
  });
});

describe("A6 — a state change mid-clip kills it", () => {
  it("killAll stops the clip when the engine state changes", () => {
    const setup = makeAudioApp();
    h = setup.h;
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow");

    const manager = h.app.getAudioManager();
    expect(manager.isPlaying()).toBe(true);

    keydownOn(window, "Enter"); // acceptAnswer -> awaitingAnswer: a genuine state change
    expect(manager.isPlaying()).toBe(false);
    expect(setup.backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });
});

describe("A6 — celebration and whole-game consistency", () => {
  it("plays celebration at gameSummary and keeps ruling cues consistent with the event log", () => {
    const setup = makeAudioApp();
    h = setup.h;
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    const cueSpy = vi.spyOn(manager, "playCue");

    driveToSummary(h, undefined, 800);
    expect(h.app.getEngine()!.getState()).toBe("gameSummary");
    expect(cueSpy.mock.calls.some((c) => c[0] === "celebration")).toBe(true);

    const log = h.app.getEngine()!.getSession().eventLog;
    const rulingLines = log.filter(
      (e) => /'s answer is ruled (correct|incorrect|skipped):/.test(e.text) || /answers for the room: (correct|incorrect)\.$/.test(e.text),
    ).length;
    const rulingCues = cueSpy.mock.calls.filter((c) => c[0] === "correct" || c[0] === "incorrect" || c[0] === "skipped").length;
    expect(rulingCues).toBe(rulingLines);
  });
});
