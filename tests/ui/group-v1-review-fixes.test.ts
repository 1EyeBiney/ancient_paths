// @vitest-environment jsdom
// PHASE5_SPEC Group V1 — the Phase 4 review fixes (OPEN_QUESTIONS item 16).

import { afterEach, describe, expect, it } from "vitest";
import { makeApp, beginByMouse, keydownOn, type AppHarness } from "./appHarness";
import { makeHarness, driveToResourceWindow } from "./harness";
import { communityProgress } from "../../src/ui/communityProgress";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("V1 — idle re-prompt is wired into the app", () => {
  it("re-announces the current screen heading after ~12s only while an action is pending", () => {
    h = makeApp();
    beginByMouse(h);
    expect(h.app.getMode()).toBe("playing");
    expect(h.tick).not.toBeNull();
    const polite = h.root.querySelector<HTMLElement>('[aria-live="polite"]')!;

    h.clock.now += 13_000;
    h.tick!();
    expect(polite.textContent).toContain("Ready to begin");

    // Open the game menu: no host action is pending behind a modal.
    keydownOn(window, "Escape");
    const before = h.app.getPresenterLog().length;
    h.clock.now += 13_000;
    h.tick!();
    expect(h.app.getPresenterLog().length).toBe(before);
  });

  it("stops entirely once play ends and setup is showing again", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "Escape"); // game menu
    Array.from(h.root.querySelectorAll("button")).find((b) => b.textContent === "End session")!.click();
    Array.from(h.root.querySelectorAll("button")).find((b) => b.textContent === "End session")!.click(); // confirm
    expect(h.app.getMode()).toBe("setup");
    const before = h.app.getPresenterLog().length;
    h.clock.now += 30_000;
    h.tick!();
    expect(h.app.getPresenterLog().length).toBe(before);
  });
});

describe("V1 — the help menu has a visible list", () => {
  it("appears on ?, tracks Up/Down, and disappears on Escape", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "?");
    const menu = h.root.querySelector<HTMLElement>("#help-menu")!;
    expect(menu).not.toBeNull();
    const rows = menu.querySelectorAll('[role="option"]');
    expect(rows.length).toBeGreaterThan(3);
    expect(rows[0]!.getAttribute("aria-selected")).toBe("true");
    expect(menu.textContent).toContain("Repeat current game prompt");

    keydownOn(window, "ArrowDown");
    const rows2 = h.root.querySelectorAll('#help-menu [role="option"]');
    expect(rows2[1]!.getAttribute("aria-selected")).toBe("true");
    expect(h.root.querySelector("#help-menu")!.getAttribute("aria-activedescendant")).toBe(rows2[1]!.id);

    keydownOn(window, "Escape");
    expect(h.root.querySelector("#help-menu")).toBeNull();
  });

  it("disappears on the second ? (explorer mode has no list)", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "?");
    expect(h.root.querySelector("#help-menu")).not.toBeNull();
    keydownOn(window, "?");
    expect(h.root.querySelector("#help-menu")).toBeNull();
    keydownOn(window, "Escape"); // leave explorer
  });
});

describe("V1 — focus lands on the new screen heading after a host action", () => {
  it("after a keyboard-dispatched action", () => {
    h = makeApp();
    beginByMouse(h);
    keydownOn(window, "Enter"); // Start game -> beginTurn
    const heading = h.root.querySelector<HTMLElement>("main h2")!;
    expect(heading.textContent).toMatch(/^Round 1/);
    expect(document.activeElement).toBe(heading);
  });

  it("after a mouse click", () => {
    h = makeApp();
    beginByMouse(h);
    h.root.querySelector<HTMLButtonElement>('button[data-action-id="confirm"]')!.click();
    const heading = h.root.querySelector<HTMLElement>("main h2")!;
    expect(heading.textContent).toMatch(/^Round 1/);
    expect(document.activeElement).toBe(heading);
  });
});

describe("V1 — community-event progress survives undo (event-log derivation)", () => {
  it("relayAnswer, undo, then a different relayAnswer reads the truth", () => {
    const hh = makeHarness(); // harnessJourney: relay at "mid", threshold 2
    driveToResourceWindow(hh);
    hh.engine.dispatch({ type: "acceptAnswer" });
    hh.engine.dispatch({ type: "reveal" });
    hh.engine.dispatch({ type: "rule", result: "correct" });
    hh.engine.dispatch({ type: "finishTeaching" });
    hh.engine.dispatch({ type: "beginCommunityEvent" });

    hh.renderer.render(hh.engine, hh.container);
    hh.engine.dispatch({ type: "relayAnswer", teamId: "team-1", correct: true });
    let p = communityProgress(hh.engine, hh.journey)!;
    expect(p.roomProgress).toBe(1);
    expect(p.answeredTeamIds).toEqual(["team-1"]);

    hh.engine.dispatch({ type: "undo" });
    p = communityProgress(hh.engine, hh.journey)!;
    expect(p.roomProgress).toBe(0);
    expect(p.answeredTeamIds).toEqual([]);

    hh.engine.dispatch({ type: "relayAnswer", teamId: "team-1", correct: false });
    p = communityProgress(hh.engine, hh.journey)!;
    expect(p.roomProgress).toBe(0);
    expect(p.answeredTeamIds).toEqual(["team-1"]);

    hh.renderer.render(hh.engine, hh.container);
    expect(hh.container.textContent).toContain("Room progress: 0 of 2");
    expect(hh.container.textContent).toContain("Now answering: Team Beta");
    hh.presenter.dispose();
  });
});
