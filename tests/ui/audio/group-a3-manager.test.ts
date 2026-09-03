// PHASE6_SPEC Group A3 — the AudioManager against FakeAudioBackend.
// Nothing here touches a real HTMLAudioElement or AudioContext; the fake
// backend is the whole point of the seam (backend.ts).

import { describe, expect, it, vi } from "vitest";
import { FakeAudioBackend } from "../../../src/ui/audio/backend";
import { AudioManager } from "../../../src/ui/audio/manager";
import type { AudioAsset } from "../../../src/content/schemas";
import type { PresentInput } from "../../../src/ui/presenter";

function asset(overrides: Partial<AudioAsset> & { assetId: string }): AudioAsset {
  return {
    filePath: `audio/${overrides.assetId}.wav`,
    assetType: "narration",
    transcript: "transcript",
    durationSeconds: 2,
    replayAllowed: true,
    fallbackText: `Fallback for ${overrides.assetId}.`,
    attribution: null,
    ...overrides,
  } as AudioAsset;
}

function makeManager(assets: AudioAsset[], settings = { master: 100, music: 100, effects: 100, narration: 100 }) {
  const backend = new FakeAudioBackend();
  const presented: PresentInput[] = [];
  const map = new Map(assets.map((a) => [a.assetId, a]));
  const manager = new AudioManager({
    backend,
    present: (input) => presented.push(input),
    settings,
    getAssets: () => map,
  });
  return { backend, manager, presented };
}

describe("A3 — queue behavior", () => {
  it("is FIFO and one clip plays at a time", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" }), asset({ assetId: "b" }), asset({ assetId: "c" })]);
    const order: string[] = [];
    manager.playAsset("a", { category: "narration", onDone: () => order.push("a") });
    manager.playAsset("b", { category: "narration", onDone: () => order.push("b") });
    manager.playAsset("c", { category: "narration", onDone: () => order.push("c") });

    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(1);
    backend.fireEnded();
    expect(order).toEqual(["a"]);
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);
    backend.fireEnded();
    expect(order).toEqual(["a", "b"]);
    backend.fireEnded();
    expect(order).toEqual(["a", "b", "c"]);
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(3);
  });
});

describe("A3 — completion signals", () => {
  it("ended fires the next clip", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" }), asset({ assetId: "b" })]);
    const done = vi.fn();
    manager.playAsset("a", { category: "narration" });
    manager.playAsset("b", { category: "narration", onDone: done });
    backend.fireEnded();
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);
    backend.fireEnded();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("a swallowed ended is rescued by the failsafe timer", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a", durationSeconds: 3 })]);
    const done = vi.fn();
    manager.playAsset("a", { category: "narration", onDone: done });
    backend.advanceClock(4000); // < 4.5s, not yet
    expect(done).not.toHaveBeenCalled();
    backend.advanceClock(600); // crosses 4.5s (durationSeconds + 1.5)
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("the fired-once guard: a duplicate native ended for the same clip calls onDone only once", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })]);
    const done = vi.fn();
    manager.playAsset("a", { category: "narration", onDone: done });
    backend.fireEnded();
    backend.fireEndedAgain(); // simulates a duplicate native "ended" event for the same clip
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("a load error presents fallbackText and continues to the next clip", () => {
    const { backend, manager, presented } = makeManager([
      asset({ assetId: "a", fallbackText: "A would play here." }),
      asset({ assetId: "b" }),
    ]);
    backend.failNextLoad();
    manager.playAsset("a", { category: "narration" });
    manager.playAsset("b", { category: "narration" });
    expect(presented.some((p) => p.visual === "A would play here.")).toBe(true);
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);
  });

  it("an unknown asset id presents a fallback-style message and never touches the backend", () => {
    const { backend, manager, presented } = makeManager([]);
    const done = vi.fn();
    manager.playAsset("missing", { category: "narration", onDone: done });
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(0);
    expect(presented.length).toBeGreaterThan(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("A3 — killAll", () => {
  it("cancels a pending sequence: a later ended from the old token does nothing", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" }), asset({ assetId: "b" })]);
    const doneA = vi.fn();
    const doneB = vi.fn();
    manager.playAsset("a", { category: "narration", onDone: doneA });
    manager.playAsset("b", { category: "narration", onDone: doneB });
    manager.killAll();
    backend.fireEnded(); // stale — the backend's own active clip was already cleared by stopClip()
    expect(doneA).not.toHaveBeenCalled();
    expect(doneB).not.toHaveBeenCalled();
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });
});

describe("A3 — transport controls call the right backend methods", () => {
  it("pause/resume/stop", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })]);
    manager.playAsset("a", { category: "narration" });
    manager.pause();
    expect(backend.calls.at(-1)?.method).toBe("pauseClip");
    manager.resume();
    expect(backend.calls.at(-1)?.method).toBe("resumeClip");
    manager.stop();
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });

  it("pause/resume/stop are no-ops when nothing is playing", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })]);
    manager.pause();
    manager.resume();
    manager.stop();
    expect(backend.calls).toHaveLength(0);
  });

  it("replay() plays the last task audio again via playClip", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })]);
    manager.presentTask("task-1", "normal", 3);
    manager.playAsset("a", { category: "narration", task: { taskId: "task-1", variantKind: "normal" } });
    backend.fireEnded();
    manager.replay();
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);
  });
});

describe("A3 — task audio play caps", () => {
  it("caps at 2 plays by default, then presents 'No replays left.'; grantReplay allows a third", () => {
    const { backend, manager, presented } = makeManager([asset({ assetId: "a" })]);
    manager.presentTask("task-1", "normal");
    manager.playAsset("a", { category: "narration", task: { taskId: "task-1", variantKind: "normal" } });
    backend.fireEnded();
    manager.replay();
    backend.fireEnded();
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);

    manager.replay();
    expect(presented.at(-1)?.visual).toBe("No replays left.");
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);

    manager.grantReplay("task-1");
    manager.replay();
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(3);

    const status = manager.canPlayTaskAudio("task-1", "normal");
    expect(status).toEqual({ allowed: false, played: 3, cap: 3 });
  });

  it("skip() never skips task audio", () => {
    const { backend, manager, presented } = makeManager([asset({ assetId: "a" })]);
    manager.presentTask("task-1", "normal");
    manager.playAsset("a", { category: "narration", task: { taskId: "task-1", variantKind: "normal" } });
    manager.skip();
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(false);
    expect(presented.at(-1)?.visual).toBe("This audio can't be skipped.");
  });

  it("skip() does skip optional (non-task) narration and advances the queue", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" }), asset({ assetId: "b" })]);
    const doneA = vi.fn();
    manager.playAsset("a", { category: "narration", onDone: doneA });
    manager.playAsset("b", { category: "narration" });
    manager.skip();
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
    expect(backend.calls.filter((c) => c.method === "playClip")).toHaveLength(2);
  });
});

describe("A3 — gain math", () => {
  it("multiplies master x category x volumeRecommendation", () => {
    const { backend, manager } = makeManager(
      [asset({ assetId: "a", assetType: "effect", volumeRecommendation: 0.5 })],
      { master: 50, music: 100, effects: 80, narration: 100 },
    );
    manager.playAsset("a", { category: "effects" });
    const call = backend.calls.find((c) => c.method === "playClip");
    const request = call?.args[0] as { gain: number };
    expect(request.gain).toBeCloseTo(0.5 * 0.8 * 0.5, 5);
  });

  it("defaults volumeRecommendation to 1 when absent", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })], { master: 80, music: 100, effects: 100, narration: 60 });
    manager.playAsset("a", { category: "narration" });
    const call = backend.calls.find((c) => c.method === "playClip");
    const request = call?.args[0] as { gain: number };
    expect(request.gain).toBeCloseTo(0.8 * 0.6 * 1, 5);
  });

  it("dampens cue gain by x0.6 while narration is playing", () => {
    const { backend, manager } = makeManager([asset({ assetId: "a" })], { master: 100, music: 100, effects: 100, narration: 100 });
    manager.playCue("correct");
    const first = backend.calls.find((c) => c.method === "playCue");
    expect(first?.args[1]).toBeCloseTo(1, 5);

    manager.playAsset("a", { category: "narration" });
    manager.playCue("incorrect");
    const calls = backend.calls.filter((c) => c.method === "playCue");
    expect(calls.at(-1)?.args[1]).toBeCloseTo(0.6, 5);
  });
});
