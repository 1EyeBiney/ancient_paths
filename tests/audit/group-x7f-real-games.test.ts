// @vitest-environment jsdom
// PHASE10_SPEC Group X7f — complete games on real content, keyboard-only
// and mouse-only (U10's dual-modality proof, extended from testJourney/
// bigPack to the real journey and general-bible pack). SECRECY: blind.

import { describe, expect, it, afterEach } from "vitest";
import { driveRealGameByKeyboard, driveRealGameByMouse, type DriveResult } from "./harness";

let active: DriveResult | null = null;
afterEach(() => {
  active?.dispose();
  active = null;
});

describe("X7f — a complete real-content game, keyboard only", () => {
  it("reaches gameSummary with a real winner and Service award named, zero presenter errors", () => {
    active = driveRealGameByKeyboard();
    const { app, root, visitedStates } = active;
    expect(app.getEngine()!.getState()).toBe("gameSummary");
    expect(visitedStates.size).toBeGreaterThan(5);
    expect(root.textContent).toContain("Audit Alpha");
    const summary = app.getEngine()!.getSummary()!;
    expect(summary.journeyWinners.length).toBeGreaterThanOrEqual(1);
    expect(summary.serviceAwardName.length).toBeGreaterThan(0);
    expect(app.getPresenterLog().at(-1)?.visual).toMatch(/Game over/);
    // "Zero presenter errors": no announcement text ever contains an
    // error-shaped fragment (a thrown-and-caught error, or "undefined").
    for (const entry of app.getPresenterLog()) {
      expect(entry.visual).not.toMatch(/error|undefined|\[object/i);
    }
  });
});

describe("X7f — the same shape of game on real content, mouse only", () => {
  it("reaches gameSummary using only .click() on rendered controls", () => {
    active = driveRealGameByMouse();
    const { app, root } = active;
    expect(app.getEngine()!.getState()).toBe("gameSummary");
    expect(root.textContent).toContain("Audit Alpha");
    const summary = app.getEngine()!.getSummary()!;
    expect(summary.journeyWinners.length).toBeGreaterThanOrEqual(1);
  });
});
