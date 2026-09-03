// @vitest-environment jsdom
// PHASE5_SPEC Group V5 — progress and resources panels.

import { afterEach, describe, expect, it } from "vitest";
import { makeApp, beginByMouse, keyboardStep, type AppHarness } from "./appHarness";
import { AudienceView } from "../../src/ui/audience";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { makeRichTask } from "./harness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("V5 — the stage progressbar matches visible text and the engine", () => {
  it("aria-valuenow/max track successes across several correct answers", () => {
    h = makeApp();
    beginByMouse(h);
    let checks = 0;
    let guard = 0;
    while (guard++ < 200 && keyboardStep(h)) {
      const engine = h.app.getEngine()!;
      if (engine.getState() === "gameSummary") break;
      const session = engine.getSession();
      const active = session.teams[session.activeTeamIndex]!;
      const bar = h.root.querySelector<HTMLElement>('[data-audience="now-playing"] [role="progressbar"]')!;
      const required = engine.getEffectiveStageRequirement(active.id)!;
      expect(bar.getAttribute("aria-valuenow")).toBe(String(active.stageSuccesses));
      expect(bar.getAttribute("aria-valuemax")).toBe(String(required));
      expect(bar.getAttribute("aria-valuetext")).toContain(`${active.stageSuccesses} of ${required}`);
      expect(h.root.querySelector('[data-audience="stage-progress"]')!.textContent).toContain(
        `${active.stageSuccesses} of ${required}`,
      );
      if (active.stageSuccesses > 0) checks++;
      if (checks > 3) break;
    }
    expect(checks).toBeGreaterThan(3);
  });
});

describe("V5 — the Teams table marks the active row textually", () => {
  it("exactly one row says 'now playing' and it is the active team", () => {
    h = makeApp();
    beginByMouse(h);
    keyboardStep(h); // ready -> beginTurn
    const engine = h.app.getEngine()!;
    const active = engine.getSession().teams[engine.getSession().activeTeamIndex]!;
    const rows = Array.from(h.root.querySelectorAll<HTMLElement>('[data-audience="teams"] tbody tr'));
    const marked = rows.filter((r) => r.querySelector('[data-col="status"]')!.textContent === "now playing");
    expect(marked).toHaveLength(1);
    expect(marked[0]!.dataset.teamId).toBe(active.id);
    expect(marked[0]!.classList.contains("active-team")).toBe(true);
  });
});

function twoStageJourney(): Journey {
  return journeySchema.parse({
    journeyId: "v5-token-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Token Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
      { id: "mid", name: "Mid", introText: "x", ambientAudioAsset: null },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
    ],
    entries: [
      { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "mid" },
      { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
    ],
    communityEvents: [],
    offeringOutcomes: [
      { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
      { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
      { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
      { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
    ],
  });
}

describe("V5 — a Journey Token shows as text once earned", () => {
  it("'Token held' appears in the earning team's row", () => {
    const journey = twoStageJourney();
    const task = makeRichTask();
    const engine = createEngine({
      journey,
      packs: [],
      teams: [
        { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
        { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
      ],
      turnTaskLimit: 3,
      rng: createRng("v5-token"),
      taskSource: new ArrayTaskSource([task]),
    });
    const view = new AudienceView({ journey, tasksById: new Map([[task.id, task]]) });
    const container = document.createElement("div");

    engine.dispatch({ type: "startGame" });
    view.render(engine, container);
    expect(container.querySelector('tr[data-team-id="team-1"] [data-col="token"]')!.textContent).toBe("—");

    for (const type of ["presentTask", "acceptAnswer", "reveal"] as const) engine.dispatch({ type });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" }); // perfect stage -> token
    expect(engine.getTeam("team-1")!.hasJourneyToken).toBe(true);
    view.render(engine, container);
    expect(container.querySelector('tr[data-team-id="team-1"] [data-col="token"]')!.textContent).toBe("Token held");
  });
});
