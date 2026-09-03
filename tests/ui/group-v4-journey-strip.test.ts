// @vitest-environment jsdom
// PHASE5_SPEC Group V4 — the journey landmark strip.

import { afterEach, describe, expect, it } from "vitest";
import { makeApp, beginByMouse, keyboardStep, type AppHarness } from "./appHarness";
import { testJourney } from "../session/fixtures";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function strip(h: AppHarness): HTMLElement {
  return h.root.querySelector<HTMLElement>('[data-audience="journey"] .landmark-strip')!;
}

describe("V4 — milestones render in journey order", () => {
  it("one landmark per milestone, in order", () => {
    h = makeApp();
    beginByMouse(h);
    const ids = Array.from(strip(h).querySelectorAll<HTMLElement>(".landmark")).map((l) => l.dataset.milestoneId);
    expect(ids).toEqual(testJourney.milestones.map((m) => m.id));
  });
});

describe("V4 — each team appears under its current milestone", () => {
  it("both teams start under the start milestone, and the strip names every team allPositionsText names", () => {
    h = makeApp();
    beginByMouse(h);
    const start = strip(h).querySelector<HTMLElement>(`.landmark[data-milestone-id="${testJourney.startMilestoneId}"]`)!;
    const markers = Array.from(start.querySelectorAll<HTMLElement>(".marker")).map((m) => m.dataset.teamId);
    expect(markers).toEqual(["team-1", "team-2"]);
    for (const team of h.app.getEngine()!.getSession().teams) {
      expect(h.app.getEngine()!.allPositionsText()).toContain(team.name);
      expect(strip(h).textContent).toContain(team.name);
    }
  });

  it("a team moves to a new landmark when it arrives, and shows 'traveling on' beyond it", () => {
    h = makeApp();
    beginByMouse(h);
    // testJourney: s1 arrives at "midway"; then a fork whose route stages do
    // NOT arrive at a milestone — completing one leaves the team "beyond"
    // midway with stagesBeyondMilestone > 0.
    let guard = 0;
    let sawTraveling = false;
    let sawMidway = false;
    while (guard++ < 400 && keyboardStep(h)) {
      const teams = h.app.getEngine()!.getSession().teams;
      for (const t of teams) {
        const marker = strip(h).querySelector<HTMLElement>(`.marker[data-team-id="${t.id}"]`)!;
        const landmark = marker.closest<HTMLElement>(".landmark")!;
        expect(landmark.dataset.milestoneId).toBe(t.currentMilestoneId);
        if (t.currentMilestoneId === "midway") sawMidway = true;
        if (t.stagesBeyondMilestone > 0) {
          expect(marker.dataset.traveling).toBe("true");
          expect(marker.textContent).toContain("traveling on");
          sawTraveling = true;
        } else {
          expect(marker.dataset.traveling).toBeUndefined();
        }
      }
      if (sawTraveling && sawMidway) break;
    }
    expect(sawMidway).toBe(true);
    expect(sawTraveling).toBe(true);
  });
});
