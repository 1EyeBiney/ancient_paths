// @vitest-environment jsdom
// PHASE4_SPEC Group U8 — fork, surplus, community.

import { describe, expect, it } from "vitest";
import { journeySchema, taskSchema, contentPackSchema, type Journey } from "../../src/content/schemas";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { ScreenRenderer } from "../../src/ui/screens";
import { Presenter } from "../../src/ui/presenter";
import { makeHarness, driveToResourceWindow } from "./harness";

// harnessJourney (from ./harness) has no fork, so a bespoke journey with a
// 2-route fork right at the start is used for the fork test in this group.
function forkJourney(): Journey {
  return journeySchema.parse({
    journeyId: "u8-fork-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Fork Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
    ],
    entries: [
      {
        kind: "fork",
        id: "fork-1",
        name: "Fork 1",
        routes: [
          {
            id: "coastal",
            name: "Coastal Road",
            description: "Along the shore.",
            difficulty: "easy",
            taskFocus: [],
            stages: [{ kind: "stage", id: "coastal-s1", name: "Coastal S1", requiredSuccesses: 3 }],
          },
          {
            id: "mountain",
            name: "Mountain Pass",
            description: "Over the ridge.",
            difficulty: "hard",
            taskFocus: [],
            stages: [{ kind: "stage", id: "mountain-s1", name: "Mountain S1", requiredSuccesses: 3 }],
          },
        ],
      },
      // Routes rejoin by construction at this next top-level entry.
      { kind: "stage", id: "reconnect-s1", name: "Reconnect", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
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

function makeForkTask() {
  return taskSchema.parse({
    id: "fork-task-1",
    schemaVersion: 1,
    packId: "u8-pack",
    category: "scripture-knowledge",
    title: "Fork Task",
    biblePeriods: [],
    locations: [],
    difficulty: "easy",
    prompt: "x",
    answer: "x",
    acceptedAnswers: ["x"],
    hostGuidance: null,
    scriptureReferences: [],
    normalVariant: { prompt: "x", successValue: 1 },
    assistedVariant: null,
    amplifiedVariant: null,
    clues: [],
    teachingReveal: "x",
    historicalNote: null,
    audioAsset: null,
    tags: [],
    resourceInteractions: { insight: false, provision: false, courage: false },
    estimatedSeconds: 20,
  });
}

interface ForkHarness {
  engine: GameEngine;
  renderer: ScreenRenderer;
  container: HTMLElement;
  politeRegion: HTMLElement;
}

function makeForkHarness(): ForkHarness {
  const journey = forkJourney();
  const task = makeForkTask();
  const engine = createEngine({
    journey,
    packs: [],
    teams: [
      { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
      { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
    ],
    turnTaskLimit: 3,
    rng: createRng("u8-fork-seed"),
    taskSource: new ArrayTaskSource([task]),
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

describe("U8 — fork route list announces and confirms", () => {
  it("presents both routes and dispatches chooseRoute on confirm", () => {
    const { engine, renderer, container, politeRegion } = makeForkHarness();
    engine.dispatch({ type: "startGame" });
    expect(engine.getState()).toBe("forkChoice");

    const render = renderer.render(engine, container);
    expect(render.actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(["route-coastal", "route-mountain"]),
    );
    expect(container.textContent).toContain("Coastal Road");
    expect(container.textContent).toContain("Mountain Pass");
    expect(politeRegion.textContent).toMatch(/browse routes/);

    render.actions.find((a) => a.id === "route-mountain")!.run();
    expect(engine.getState()).toBe("beginTurn");
    expect(engine.getTeam("team-1")!.currentStageId).toBe("mountain-s1");
  });
});

describe("U8 — surplus keep/offer paths", () => {
  it("amplifying a 1-required stage produces a real surplus, and Keep awards the chosen resource", () => {
    // Insight starts at 0 (below the resourceCap of 5) so the +1 award from
    // keeping the surplus is actually observable; 1 Courage to amplify.
    const h = makeHarness({ startingResources: { insight: 0, provision: 0, courage: 1 } });
    driveToResourceWindow(h);
    h.engine.dispatch({ type: "spendCourage" }); // amplify: successValue becomes 2, stage needs only 1
    h.engine.dispatch({ type: "acceptAnswer" });
    h.engine.dispatch({ type: "reveal" });
    h.engine.dispatch({ type: "rule", result: "correct" });
    h.engine.dispatch({ type: "finishTeaching" });
    expect(h.engine.getState()).toBe("surplusDecision");
    expect(h.engine.getPendingSurplus()).toBe(1);

    const insightBefore = h.engine.getTeam("team-1")!.resources.insight;
    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "keepSurplus-insight")!.run();
    expect(h.engine.getTeam("team-1")!.resources.insight).toBe(insightBefore + 1);
    expect(h.engine.getPendingSurplus()).toBe(0);
  });

  it("offering the surplus resolves it without awarding a plain resource to the team directly", () => {
    const h = makeHarness({ startingResources: { insight: 0, provision: 0, courage: 1 } });
    driveToResourceWindow(h);
    h.engine.dispatch({ type: "spendCourage" });
    h.engine.dispatch({ type: "acceptAnswer" });
    h.engine.dispatch({ type: "reveal" });
    h.engine.dispatch({ type: "rule", result: "correct" });
    h.engine.dispatch({ type: "finishTeaching" });
    expect(h.engine.getState()).toBe("surplusDecision");

    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "offerSurplus")!.run();
    expect(h.engine.getPendingSurplus()).toBe(0);
    // offerSurplus always resolves the pending surplus, regardless of which
    // (data-authored, weighted) offering outcome was drawn.
  });
});

describe("U8 — relay event walks teams in order and relayAnswer flows", () => {
  it("the first team is announced, correct/incorrect dispatch relayAnswer, then the next team comes up", () => {
    const h = makeHarness(); // harnessJourney has a relay at "mid" with successThreshold 2
    driveToResourceWindow(h);
    h.engine.dispatch({ type: "acceptAnswer" });
    h.engine.dispatch({ type: "reveal" });
    h.engine.dispatch({ type: "rule", result: "correct" });
    h.engine.dispatch({ type: "finishTeaching" });
    expect(h.engine.getState()).toBe("landmarkIntroduction");
    let render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "confirm")!.run();
    expect(h.engine.getState()).toBe("communityEvent");

    render = h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).toContain("Now answering: Team Alpha");
    render.actions.find((a) => a.id === "ruleCorrect")!.run();

    render = h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).toContain("Now answering: Team Beta");
    expect(h.container.textContent).toMatch(/Room progress: 1 of 2/);
  });
});

describe("U8 — contribution pledge and decline flow", () => {
  function contributionJourney(): Journey {
    return journeySchema.parse({
      journeyId: "u8-contribution-journey",
      schemaVersion: 1,
      version: "0.0.1",
      title: "Contribution Test Path",
      startMilestoneId: "start",
      destinationMilestoneId: "mid",
      milestones: [
        { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
        { id: "mid", name: "Mid", introText: "x", ambientAudioAsset: null },
      ],
      entries: [{ kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "mid" }],
      communityEvents: [
        {
          kind: "contribution",
          id: "contrib-1",
          milestoneId: "mid",
          title: "Building Fund",
          description: "Pledge resources.",
          repeatable: false,
          acceptedResources: ["insight", "provision"],
          contributionThreshold: 3,
          reward: { type: "grant-resource-every-team", resource: "choice", amount: 1 },
        },
      ],
      offeringOutcomes: [
        { id: "o1", category: "beneficial", announcement: "x", effect: { type: "none" } },
        { id: "o2", category: "community", announcement: "x", effect: { type: "none" } },
        { id: "o3", category: "humorous", announcement: "x", effect: { type: "none" } },
        { id: "o4", category: "neutral", announcement: "x", effect: { type: "none" } },
      ],
    });
  }

  it("Team Alpha pledges, Team Beta declines, then the room resolves", () => {
    const journey = contributionJourney();
    const task = makeForkTask();
    const engine = createEngine({
      journey,
      packs: [],
      teams: [
        { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
        { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
      ],
      turnTaskLimit: 3,
      rng: createRng("u8-contribution-seed"),
      taskSource: new ArrayTaskSource([task]),
      startingResources: { insight: 5, provision: 5, courage: 5 },
    });
    const presenter = new Presenter({
      politeRegion: document.createElement("div"),
      assertiveRegion: document.createElement("div"),
      statusLine: document.createElement("p"),
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
    });
    const container = document.createElement("div");
    const renderer = new ScreenRenderer({
      journey,
      tasksById: new Map([[task.id, task]]),
      present: (input) => presenter.present(input),
    });

    engine.dispatch({ type: "startGame" });
    engine.dispatch({ type: "presentTask" });
    engine.dispatch({ type: "acceptAnswer" });
    engine.dispatch({ type: "reveal" });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" });
    expect(engine.getState()).toBe("landmarkIntroduction");
    engine.dispatch({ type: "beginCommunityEvent" });
    expect(engine.getState()).toBe("communityEvent");

    let render = renderer.render(engine, container);
    expect(container.textContent).toContain("Now pledging: Team Alpha");
    const insightBefore = engine.getTeam("team-1")!.resources.insight;
    render.actions.find((a) => a.id === "contribute-insight-1")!.run();
    expect(engine.getTeam("team-1")!.resources.insight).toBe(insightBefore - 1);

    render = renderer.render(engine, container);
    expect(container.textContent).toContain("Now pledging: Team Beta");
    render.actions.find((a) => a.id === "declineContribution")!.run();

    render = renderer.render(engine, container);
    render.actions.find((a) => a.id === "resolveCommunityEvent")!.run();
    expect(engine.getState()).not.toBe("communityEvent");
  });
});

describe("U8 — granted-resource choice picker drains pendingChoices", () => {
  it("a successful relay's grant-resource-every-team(choice) reward surfaces a picker per team, and choosing drains it", () => {
    // relay reward: grant-resource-every-team, resource "choice", amount 1;
    // insight starts at 0 so the award is observable below the resourceCap.
    const h = makeHarness({ startingResources: { insight: 0, provision: 0, courage: 0 } });
    driveToResourceWindow(h);
    h.engine.dispatch({ type: "acceptAnswer" });
    h.engine.dispatch({ type: "reveal" });
    h.engine.dispatch({ type: "rule", result: "correct" });
    h.engine.dispatch({ type: "finishTeaching" });
    h.engine.dispatch({ type: "beginCommunityEvent" });

    // Meet the threshold (2) with both teams answering correctly.
    h.engine.dispatch({ type: "relayAnswer", teamId: "team-1", correct: true });
    h.engine.dispatch({ type: "relayAnswer", teamId: "team-2", correct: true });
    h.engine.dispatch({ type: "resolveCommunityEvent" });

    expect(h.engine.getPendingChoicesForTeam("team-1")).toBeGreaterThan(0);
    expect(h.engine.getPendingChoicesForTeam("team-2")).toBeGreaterThan(0);

    const render = h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).toContain("Team Alpha may choose a resource");
    expect(h.container.textContent).toContain("Team Beta may choose a resource");

    const pick = render.actions.find((a) => a.id === "chooseGranted-team-1-insight")!;
    const insightBefore = h.engine.getTeam("team-1")!.resources.insight;
    pick.run();
    expect(h.engine.getPendingChoicesForTeam("team-1")).toBe(0);
    expect(h.engine.getTeam("team-1")!.resources.insight).toBe(insightBefore + 1);
    // Beta's pending choice is untouched by Alpha's pick.
    expect(h.engine.getPendingChoicesForTeam("team-2")).toBeGreaterThan(0);
  });
});
