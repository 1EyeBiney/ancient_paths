// @vitest-environment jsdom
// PHASE6_SPEC Group A5 — controls: Space/L/X/N reach the AudioManager,
// each has a visible button, idle keys say so, KEYBOARD_COMMANDS.md
// documents all four, and the Audio dialog's inputs are live.

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeApp, beginByMouse, findButtonByText, keydownOn, keyboardStep, type AppHarness } from "../appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function driveUntil(harness: AppHarness, predicate: (state: string) => boolean, maxSteps = 60): void {
  const engine = harness.app.getEngine()!;
  let steps = 0;
  while (!predicate(engine.getState()) && steps < maxSteps) {
    if (!keyboardStep(harness)) break;
    steps++;
  }
}

describe("A5 — Space/X/N reach the manager", () => {
  it("Space pauses when playing, and resumes when paused", () => {
    h = makeApp();
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    vi.spyOn(manager, "isPlaying").mockReturnValue(true);
    const pause = vi.spyOn(manager, "pause").mockImplementation(() => {});
    const resume = vi.spyOn(manager, "resume").mockImplementation(() => {});

    vi.spyOn(manager, "isPaused").mockReturnValue(false);
    keydownOn(window, " ");
    expect(pause).toHaveBeenCalledTimes(1);

    vi.spyOn(manager, "isPaused").mockReturnValue(true);
    keydownOn(window, " ");
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("X stops the current clip", () => {
    h = makeApp();
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    vi.spyOn(manager, "isPlaying").mockReturnValue(true);
    const stop = vi.spyOn(manager, "stop").mockImplementation(() => {});
    keydownOn(window, "x");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("N skips the current optional clip", () => {
    h = makeApp();
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    vi.spyOn(manager, "isPlaying").mockReturnValue(true);
    const skip = vi.spyOn(manager, "skip").mockImplementation(() => {});
    keydownOn(window, "n");
    expect(skip).toHaveBeenCalledTimes(1);
  });

  it("pressing Space, X, or N with nothing playing says 'Nothing is playing.'", () => {
    h = makeApp();
    beginByMouse(h);
    for (const key of [" ", "x", "n"]) {
      keydownOn(window, key);
      expect(h.app.getPresenterLog().at(-1)?.visual).toBe("Nothing is playing.");
    }
  });
});

describe("A5 — L (Listen again)", () => {
  it("reaches the manager's replay() while in resourceWindow or awaitingAnswer", () => {
    h = makeApp();
    beginByMouse(h);
    driveUntil(h, (s) => s === "resourceWindow" || s === "awaitingAnswer");
    const manager = h.app.getAudioManager();
    const replay = vi.spyOn(manager, "replay").mockImplementation(() => {});
    keydownOn(window, "l");
    expect(replay).toHaveBeenCalledTimes(1);
  });

  it("outside its legal states, says 'L does nothing here.'", () => {
    h = makeApp();
    beginByMouse(h);
    expect(h.app.getEngine()!.getState()).toBe("ready");
    keydownOn(window, "l");
    expect(h.app.getPresenterLog().at(-1)?.visual).toMatch(/^L does nothing here\./);
  });
});

describe("A5 — buttons (dual modality)", () => {
  it("Pause/Resume, Stop, and Skip buttons are always present while playing", () => {
    h = makeApp();
    beginByMouse(h);
    expect(() => findButtonByText(h!.root, "Pause audio")).not.toThrow();
    expect(() => findButtonByText(h!.root, "Stop audio")).not.toThrow();
    expect(() => findButtonByText(h!.root, "Skip narration")).not.toThrow();
  });

  it("the Listen again button appears only in resourceWindow/awaitingAnswer", () => {
    h = makeApp();
    beginByMouse(h);
    expect(h.app.getEngine()!.getState()).toBe("ready");
    expect(h.root.querySelectorAll("button").length).toBeGreaterThan(0);
    expect(Array.from(h.root.querySelectorAll("button")).some((b) => b.textContent === "Listen again")).toBe(false);

    driveUntil(h, (s) => s === "resourceWindow" || s === "awaitingAnswer");
    expect(() => findButtonByText(h!.root, "Listen again")).not.toThrow();
  });

  it("clicking Pause audio calls the manager the same way Space does", () => {
    h = makeApp();
    beginByMouse(h);
    const manager = h.app.getAudioManager();
    vi.spyOn(manager, "isPlaying").mockReturnValue(true);
    vi.spyOn(manager, "isPaused").mockReturnValue(false);
    const pause = vi.spyOn(manager, "pause").mockImplementation(() => {});
    findButtonByText(h.root, "Pause audio").click();
    expect(pause).toHaveBeenCalledTimes(1);
  });
});

describe("A5 — KEYBOARD_COMMANDS.md documents the four audio keys", () => {
  it("lists Space, L, X, and N", () => {
    const text = readFileSync(resolve("KEYBOARD_COMMANDS.md"), "utf8");
    expect(text).toMatch(/\|\s*Space\s*\|/);
    expect(text).toMatch(/\|\s*L\s*\|/);
    expect(text).toMatch(/\|\s*X\s*\|/);
    expect(text).toMatch(/\|\s*N\s*\|/);
  });
});

describe("A5 — the Audio dialog", () => {
  it("its volume inputs change manager settings live", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "Escape"); // open the game menu
    findButtonByText(h.root, "Audio…").click();

    const masterInput = h.root.querySelector<HTMLInputElement>('input[aria-label="master volume"]')!;
    masterInput.value = "42";
    masterInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(h.app.getAudioManager().getSettings().master).toBe(42);
  });

  it("the Interface speech choice flips the gate mode", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "Escape");
    findButtonByText(h.root, "Audio…").click();

    const manager = h.app.getAudioManager();
    expect(manager.getSpeechMode()).toBe("wait");

    const select = h.root.querySelector<HTMLSelectElement>('select[aria-label="Interface speech behavior"]')!;
    select.value = "interrupt";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(manager.getSpeechMode()).toBe("interrupt");
  });
});
