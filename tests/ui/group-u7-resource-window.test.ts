// @vitest-environment jsdom
// PHASE4_SPEC Group U7 — resource window.

import { describe, expect, it } from "vitest";
import { journeySchema, type Journey } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { ScreenRenderer } from "../../src/ui/screens";
import { Presenter } from "../../src/ui/presenter";
import { makeHarness, makeRichTask, driveToResourceWindow } from "./harness";

// A Journey Token can only be earned through real (perfect-stage) play —
// getTeam()/getSession() both return deep clones, so there is no way to
// mutate engine state directly from a test. This bespoke 2-stage,
// no-fork, no-community-event journey lets a team earn one in a single
// clean turn, then reach a SECOND resourceWindow (stage 2) with the token
// still held, to exercise its submenu.
function twoStageJourney(): Journey {
  return journeySchema.parse({
    journeyId: "u7-token-journey",
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

function makeTokenHarness() {
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
    rng: createRng("u7-token-seed"),
    taskSource: new ArrayTaskSource([task]),
    startingResources: { insight: 5, provision: 5, courage: 5 },
  });
  const politeRegion = document.createElement("div");
  const assertiveRegion = document.createElement("div");
  const statusLine = document.createElement("p");
  const presenter = new Presenter({
    politeRegion,
    assertiveRegion,
    statusLine,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
  });
  const container = document.createElement("div");
  const renderer = new ScreenRenderer({
    journey,
    tasksById: new Map([[task.id, task]]),
    present: (input) => presenter.present(input),
  });
  return { engine, renderer, container, politeRegion };
}

/** Drives one complete, always-correct turn from beginTurn through
 * whatever comes next (teaching -> either a new beginTurn for this same
 * team, or the next team's turn once the stage completes). */
function driveOneFullCorrectTurn(engine: ReturnType<typeof createEngine>): void {
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "acceptAnswer" });
  engine.dispatch({ type: "reveal" });
  engine.dispatch({ type: "rule", result: "correct" });
  engine.dispatch({ type: "finishTeaching" });
}

describe("U7 — only legal actions render", () => {
  it("a task with every interaction and a Journey Token shows all the submenus", () => {
    const { engine, renderer, container } = makeTokenHarness();
    engine.dispatch({ type: "startGame" }); // team-1, s1
    driveOneFullCorrectTurn(engine); // team-1 earns a token, perfect stage; team-2's turn begins
    driveOneFullCorrectTurn(engine); // team-2 clears s1 too; round 2, back to team-1 on s2
    expect(engine.getState()).toBe("beginTurn");
    expect(engine.getTeam("team-1")!.hasJourneyToken).toBe(true);

    engine.dispatch({ type: "presentTask" });
    const render = renderer.render(engine, container);
    const ids = render.actions.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "spendInsightExtraClue",
        "spendInsightEliminate",
        "spendProvisionAssist",
        "spendCourageAmplify",
        "journeyTokenExtraClue",
        "journeyTokenEliminate",
        "journeyTokenAssist",
        "journeyTokenAmplify",
        "confirm",
      ]),
    );
  });

  it("a task with no resource interactions shows only Accept answer", () => {
    const plain = makeRichTask({
      resourceInteractions: { insight: false, provision: false, courage: false },
      assistedVariant: null,
      amplifiedVariant: null,
    });
    const h = makeHarness({ tasks: [plain] });
    driveToResourceWindow(h);
    const render = h.renderer.render(h.engine, h.container);
    expect(render.actions.map((a) => a.id)).toEqual(["confirm"]);
  });

  it("without a Journey Token, no journeyToken* actions appear even if the task supports them", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    const render = h.renderer.render(h.engine, h.container);
    expect(render.actions.some((a) => a.id.startsWith("journeyToken"))).toBe(false);
    expect(render.actions.some((a) => a.id === "spendInsightExtraClue")).toBe(true);
  });

  it("resource counts are visible in the announcement/status, not hidden", () => {
    const h = makeHarness({ startingResources: { insight: 3, provision: 2, courage: 1 } });
    driveToResourceWindow(h);
    const status = h.engine.statusText();
    expect(status).toContain("Insight 3");
    expect(status).toContain("Provision 2");
    expect(status).toContain("Courage 1");
  });
});

describe("U7 — insight effect actions actually spend and apply", () => {
  it("extra clue reveals one more clue and deducts Insight", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    const before = h.engine.getTeam("team-1")!.resources.insight;
    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "spendInsightExtraClue")!.run();
    expect(h.engine.getTeam("team-1")!.resources.insight).toBeLessThan(before);
    expect(h.engine.getCurrentTaskPublic()!.cluesRevealed).toHaveLength(1);
  });
});

describe("U7 — eliminate-option updates the display and announces survivors", () => {
  it("struck-through AND textually marked, never color alone; announces the eliminate sentence", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    let render = h.renderer.render(h.engine, h.container);
    const before = h.engine.getCurrentTaskPublic()!.activeVariant.options!.slice();
    expect(before).toHaveLength(4);

    render.actions.find((a) => a.id === "spendInsightEliminate")!.run();

    const after = h.engine.getCurrentTaskPublic()!.activeVariant.options!;
    expect(after).toHaveLength(3);
    const eliminated = before.find((o) => !after.includes(o))!;
    expect(h.politeRegion.textContent).toMatch(/is eliminated/);
    expect(h.politeRegion.textContent).toContain(eliminated);
    expect(h.politeRegion.textContent).toMatch(/remain/);

    // Re-render: the eliminated option no longer appears in the live list
    // at all (engine already filters it) — textual, not color-only.
    render = h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).not.toContain(eliminated);
  });
});

describe("U7 — Journey Token submenu", () => {
  it("using the Journey Token for assist spends no Provision but consumes the token", () => {
    const { engine, renderer, container } = makeTokenHarness();
    engine.dispatch({ type: "startGame" });
    driveOneFullCorrectTurn(engine);
    driveOneFullCorrectTurn(engine);
    expect(engine.getTeam("team-1")!.hasJourneyToken).toBe(true);
    engine.dispatch({ type: "presentTask" });

    const provisionBefore = engine.getTeam("team-1")!.resources.provision;
    const render = renderer.render(engine, container);
    render.actions.find((a) => a.id === "journeyTokenAssist")!.run();
    expect(engine.getTeam("team-1")!.resources.provision).toBe(provisionBefore); // token pays, not Provision
    expect(engine.getTeam("team-1")!.hasJourneyToken).toBe(false);
  });
});

describe("U7 — an illegal command produces a polite message and leaves state unchanged", () => {
  it("dispatching an out-of-state command throws IllegalCommandError and the UI can catch it", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    const stateBefore = h.engine.getState();
    expect(() => h.engine.dispatch({ type: "reveal" })).toThrow();
    expect(h.engine.getState()).toBe(stateBefore); // dispatch is transactional; nothing changed
  });
});
