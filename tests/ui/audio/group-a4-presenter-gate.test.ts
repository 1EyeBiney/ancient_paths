// @vitest-environment jsdom
// PHASE6_SPEC Group A4 — the presenter gate (binding rule #3). Two
// layers: the Presenter's own gate wiring against a mock gate, then the
// real AudioManager acting as the gate against FakeAudioBackend, which
// is what app.ts will actually wire together in Group A6.

import { describe, expect, it, vi } from "vitest";
import { Presenter, type PresenterGate, type PresenterOptions } from "../../../src/ui/presenter";
import { FakeAudioBackend } from "../../../src/ui/audio/backend";
import { AudioManager } from "../../../src/ui/audio/manager";
import type { AudioAsset } from "../../../src/content/schemas";

function makeElements() {
  return {
    politeRegion: document.createElement("div"),
    assertiveRegion: document.createElement("div"),
    statusLine: document.createElement("p"),
  };
}

function makePresenter(overrides: Partial<PresenterOptions> = {}) {
  const elements = makeElements();
  const presenter = new Presenter({ ...elements, setIntervalFn: () => 0, clearIntervalFn: () => {}, ...overrides });
  return { presenter, ...elements };
}

describe("A4 — Presenter + a mock gate", () => {
  it("defers a polite present() when the gate says to, and never writes the region", () => {
    const { presenter, politeRegion } = makePresenter();
    const gate: PresenterGate = { shouldDefer: () => true, defer: vi.fn(), onAnnounce: vi.fn() };
    presenter.setGate(gate);
    presenter.present({ visual: "Round 2 begins." });
    expect(politeRegion.textContent).toBe("");
    expect(gate.defer).toHaveBeenCalledWith({ visual: "Round 2 begins." });
    expect(gate.onAnnounce).not.toHaveBeenCalled();
  });

  it("announces immediately (and calls onAnnounce) when the gate says not to defer", () => {
    const { presenter, politeRegion } = makePresenter();
    const gate: PresenterGate = { shouldDefer: () => false, defer: vi.fn(), onAnnounce: vi.fn() };
    presenter.setGate(gate);
    presenter.present({ visual: "Round 2 begins." });
    expect(politeRegion.textContent).toBe("Round 2 begins.");
    expect(gate.onAnnounce).toHaveBeenCalledWith("polite");
  });

  it("assertive present() is never deferred, and calls onAnnounce", () => {
    const { presenter, assertiveRegion } = makePresenter();
    const gate: PresenterGate = { shouldDefer: () => true, defer: vi.fn(), onAnnounce: vi.fn() };
    presenter.setGate(gate);
    presenter.present({ visual: "Error!", channel: "assertive" });
    expect(assertiveRegion.textContent).toBe("Error!");
    expect(gate.defer).not.toHaveBeenCalled();
    expect(gate.onAnnounce).toHaveBeenCalledWith("assertive");
  });

  it("setGate(null) restores unguarded behavior", () => {
    const { presenter, politeRegion } = makePresenter();
    presenter.setGate({ shouldDefer: () => true, defer: vi.fn(), onAnnounce: vi.fn() });
    presenter.setGate(null);
    presenter.present({ visual: "No gate now." });
    expect(politeRegion.textContent).toBe("No gate now.");
  });
});

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

function makeWired() {
  const { presenter, politeRegion, assertiveRegion } = makePresenter();
  const backend = new FakeAudioBackend();
  const assets = new Map([[
    "clip",
    asset({ assetId: "clip" }),
  ]]);
  const manager = new AudioManager({
    backend,
    present: (input) => presenter.present(input),
    settings: { master: 100, music: 100, effects: 100, narration: 100 },
    getAssets: () => assets,
  });
  presenter.setGate(manager);
  return { presenter, backend, manager, politeRegion, assertiveRegion };
}

describe("A4 — AudioManager as the presenter's gate", () => {
  it("three polite present() calls while a clip plays result in one announcement (the last) once it ends", () => {
    const { presenter, backend, manager, politeRegion } = makeWired();
    manager.playAsset("clip", { category: "narration" });

    presenter.present({ visual: "First." });
    presenter.present({ visual: "Second." });
    presenter.present({ visual: "Third." });
    expect(politeRegion.textContent).toBe("");

    backend.fireEnded();
    expect(politeRegion.textContent).toBe("Third.");
  });

  it("an assertive present() stops the clip and announces immediately", () => {
    const { presenter, backend, manager, assertiveRegion } = makeWired();
    manager.playAsset("clip", { category: "narration" });
    expect(manager.isPlaying()).toBe(true);

    presenter.present({ visual: "Stop everything!", channel: "assertive" });
    expect(assertiveRegion.textContent).toBe("Stop everything!");
    expect(manager.isPlaying()).toBe(false);
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });

  it("with 'interrupt' speech mode, polite announcements also stop the clip", () => {
    const { presenter, backend, manager, politeRegion } = makeWired();
    manager.setSpeechMode("interrupt");
    manager.playAsset("clip", { category: "narration" });

    presenter.present({ visual: "Right now." });
    expect(politeRegion.textContent).toBe("Right now.");
    expect(manager.isPlaying()).toBe(false);
    expect(backend.calls.some((c) => c.method === "stopClip")).toBe(true);
  });

  it("effects gain is x0.6 while narration plays and restores once it ends", () => {
    const { backend, manager } = makeWired();
    manager.playCue("correct");
    expect(backend.calls.find((c) => c.method === "playCue")?.args[1]).toBeCloseTo(1, 5);

    manager.playAsset("clip", { category: "narration" });
    manager.playCue("incorrect");
    expect(backend.calls.filter((c) => c.method === "playCue").at(-1)?.args[1]).toBeCloseTo(0.6, 5);

    backend.fireEnded();
    manager.playCue("skipped");
    expect(backend.calls.filter((c) => c.method === "playCue").at(-1)?.args[1]).toBeCloseTo(1, 5);
  });
});
