// @vitest-environment jsdom
// PHASE6_SPEC Group A7 — the deliverable: "missing optional audio never
// makes the game inaccessible." A backend whose AudioContext and every
// <audio> load both fail; the full keyboard game still reaches
// gameSummary, every asset that would have played appears as its
// fallbackText in the presenter log, and no exception escapes.

import { describe, expect, it, vi, afterEach } from "vitest";
import { FakeAudioBackend, type AudioBackend, type PlayClipRequest, type PlayClipCallbacks } from "../../../src/ui/audio/backend";
import type { PresentInput } from "../../../src/ui/presenter";
import { makeApp, beginByMouse, driveToSummary, type AppHarness } from "../appHarness";
import { buildAudioPack, journeyWithAmbient } from "./fixtures";

/** Everything that could go wrong with real audio, at once: unlock() is a
 * no-op (as if AudioContext's constructor threw and was swallowed),
 * every playClip immediately errors (as if every <audio> load failed),
 * and cues/ambient are silently inert — matching what BrowserAudioBackend
 * degrades to when nothing in the browser actually works. */
class AlwaysFailingBackend implements AudioBackend {
  unlock(): void {}
  isUnlocked(): boolean {
    return true;
  }
  playCue(): void {}
  playClip(_request: PlayClipRequest, callbacks: PlayClipCallbacks): void {
    callbacks.onError("simulated total audio failure");
  }
  pauseClip(): void {}
  resumeClip(): void {}
  stopClip(): void {}
  isClipPaused(): boolean {
    return false;
  }
  hasActiveClip(): boolean {
    return false;
  }
  playAmbient(): void {}
  stopAmbient(): void {}
}

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function runFullGame(backend: AudioBackend): AppHarness {
  const harness = makeApp({
    journeys: [journeyWithAmbient],
    packs: [buildAudioPack()],
    extra: { audioBackend: backend, startingResources: { insight: 3, provision: 3, courage: 3 } },
  });
  beginByMouse(harness);
  driveToSummary(harness, undefined, 800);
  return harness;
}

describe("A7 — the deliverable", () => {
  it("a succeeding fake backend reaches gameSummary", () => {
    h = runFullGame(new FakeAudioBackend());
    expect(h.app.getEngine()!.getState()).toBe("gameSummary");
  });

  it("a totally failing backend still reaches gameSummary, with no exception escaping", () => {
    expect(() => {
      h = runFullGame(new AlwaysFailingBackend());
    }).not.toThrow();
    expect(h!.app.getEngine()!.getState()).toBe("gameSummary");
  });

  it("every audio asset that would have played appears as its fallbackText in the presenter log", () => {
    const harness = makeApp({
      journeys: [journeyWithAmbient],
      packs: [buildAudioPack()],
      extra: { audioBackend: new AlwaysFailingBackend(), startingResources: { insight: 3, provision: 3, courage: 3 } },
    });
    h = harness;

    // The presenter's own log() is capped (PHASE4_SPEC), far shorter than a
    // whole game's worth of announcements, so capture every present() call
    // the manager ever makes directly, unbounded, from the start.
    const manager = harness.app.getAudioManager() as unknown as { present: (i: PresentInput) => void };
    const announced: PresentInput[] = [];
    vi.spyOn(manager, "present").mockImplementation((i: PresentInput) => announced.push(i));

    beginByMouse(harness);
    driveToSummary(harness, undefined, 800);

    const pack = buildAudioPack();
    const spokenAndVisual = announced.flatMap((entry) => [entry.visual, entry.spoken]);

    // At minimum, every task actually presented (resourceWindow reached)
    // has a task-level clip that auto-plays and immediately fails — its
    // fallbackText must have been announced. taskHistory records exactly
    // the tasks that were played.
    const session = harness.app.getEngine()!.getSession();
    const playedTaskIds = new Set(session.taskHistory.map((a) => a.taskId));
    expect(playedTaskIds.size).toBeGreaterThan(0);

    for (const taskId of playedTaskIds) {
      const task = pack.tasks.find((t) => t.id === taskId);
      if (!task?.audioAsset) continue;
      const asset = pack.audioAssets!.find((a) => a.assetId === task.audioAsset)!;
      expect(spokenAndVisual.some((text) => text === asset.fallbackText)).toBe(true);
    }
  });
});
