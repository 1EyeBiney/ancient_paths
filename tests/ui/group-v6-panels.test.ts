// @vitest-environment jsdom
// PHASE5_SPEC Group V6 — community, reveal, and summary panels.

import { afterEach, describe, expect, it } from "vitest";
import { AudienceView } from "../../src/ui/audience";
import { makeHarness, driveToResourceWindow, makeRichTask, RICH_ANSWER } from "./harness";
import { makeApp, beginByMouse, driveToSummary, type AppHarness } from "./appHarness";
import { journeySchema, taskSchema, type Journey } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("V6 — relay progress updates per answer", () => {
  it("'p of t correct' and the progressbar follow relayAnswer", () => {
    const hh = makeHarness();
    const view = new AudienceView({ journey: hh.journey, tasksById: hh.tasksById });
    driveToResourceWindow(hh);
    for (const type of ["acceptAnswer", "reveal"] as const) hh.engine.dispatch({ type });
    hh.engine.dispatch({ type: "rule", result: "correct" });
    hh.engine.dispatch({ type: "finishTeaching" });
    hh.engine.dispatch({ type: "beginCommunityEvent" });

    const container = document.createElement("div");
    view.render(hh.engine, container);
    expect(container.querySelector('[data-audience="community-progress"]')!.textContent).toBe("0 of 2 correct");

    hh.engine.dispatch({ type: "relayAnswer", teamId: "team-1", correct: true });
    view.render(hh.engine, container);
    expect(container.querySelector('[data-audience="community-progress"]')!.textContent).toBe("1 of 2 correct");
    const bar = container.querySelector('[data-audience="community"] [role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("2");
    hh.presenter.dispose();
  });
});

describe("V6 — contribution pledged total updates per pledge", () => {
  function contributionJourney(): Journey {
    return journeySchema.parse({
      journeyId: "v6-contribution",
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

  it("'p of t pledged' rises with each contribution and ignores declines", () => {
    const journey = contributionJourney();
    const task = taskSchema.parse({
      id: "v6-task",
      schemaVersion: 1,
      packId: "v6-pack",
      category: "scripture-knowledge",
      title: "V6 Task",
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
    const engine = createEngine({
      journey,
      packs: [],
      teams: [
        { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
        { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
      ],
      turnTaskLimit: 3,
      rng: createRng("v6-contribution"),
      taskSource: new ArrayTaskSource([task]),
      startingResources: { insight: 5, provision: 5, courage: 5 },
    });
    const view = new AudienceView({ journey, tasksById: new Map([[task.id, task]]) });
    const container = document.createElement("div");
    for (const type of ["startGame", "presentTask", "acceptAnswer", "reveal"] as const) engine.dispatch({ type });
    engine.dispatch({ type: "rule", result: "correct" });
    engine.dispatch({ type: "finishTeaching" });
    engine.dispatch({ type: "beginCommunityEvent" });

    view.render(engine, container);
    expect(container.querySelector('[data-audience="community-progress"]')!.textContent).toBe("0 of 3 pledged");
    engine.dispatch({ type: "contribute", teamId: "team-1", resource: "insight", amount: 2 });
    view.render(engine, container);
    expect(container.querySelector('[data-audience="community-progress"]')!.textContent).toBe("2 of 3 pledged");
    engine.dispatch({ type: "declineContribution", teamId: "team-2" });
    view.render(engine, container);
    expect(container.querySelector('[data-audience="community-progress"]')!.textContent).toBe("2 of 3 pledged");
  });
});

describe("V6 — the reveal panel shows answer, accepted, guidance only after reveal", () => {
  it("absent before reveal, present after", () => {
    const hh = makeHarness();
    const view = new AudienceView({ journey: hh.journey, tasksById: hh.tasksById });
    const container = document.createElement("div");
    driveToResourceWindow(hh);
    hh.engine.dispatch({ type: "acceptAnswer" });
    view.render(hh.engine, container);
    expect(container.querySelector('[data-audience="reveal"]')).toBeNull();
    expect(container.querySelector('[data-audience="prompt"]')).not.toBeNull();

    hh.engine.dispatch({ type: "reveal" });
    view.render(hh.engine, container);
    const reveal = container.querySelector('[data-audience="reveal"]')!;
    expect(reveal.textContent).toContain(RICH_ANSWER);
    // Phase 9 review: the rich task's acceptedAnswers is just [answer], and
    // content rules require the list to contain the answer — so a bare
    // "Also accepted: <the same answer>" line is noise, not information.
    expect(reveal.textContent).not.toContain("Also accepted");
    expect(reveal.textContent).toContain("Accept close phonetic spellings");
    hh.presenter.dispose();
  });

  it("'Also accepted' lists only genuine alternatives, never the official answer again", () => {
    const hh = makeHarness({
      tasks: [makeRichTask({ acceptedAnswers: [RICH_ANSWER, "A Genuine Alternative", RICH_ANSWER.toUpperCase()] })],
    });
    const view = new AudienceView({ journey: hh.journey, tasksById: hh.tasksById });
    const container = document.createElement("div");
    driveToResourceWindow(hh);
    hh.engine.dispatch({ type: "acceptAnswer" });
    hh.engine.dispatch({ type: "reveal" });
    view.render(hh.engine, container);
    const reveal = container.querySelector('[data-audience="reveal"]')!;
    const alsoLine = [...reveal.querySelectorAll("p")].find((p) => p.textContent!.startsWith("Also accepted"))!;
    expect(alsoLine.textContent).toBe("Also accepted: A Genuine Alternative");

    // The host screen's spoken reveal matches (same helper, same rule).
    hh.renderer.render(hh.engine, hh.container);
    const spoken = hh.politeRegion.textContent ?? "";
    expect(spoken).toContain("Also accepted: A Genuine Alternative.");
    expect(spoken.match(/Also accepted/g)?.length).toBe(1);
    hh.presenter.dispose();
  });
});

describe("V6 — the game summary leaderboard", () => {
  it("lists winners, the award, and final positions with badges at gameSummary", () => {
    h = makeApp();
    beginByMouse(h, ["Lydia", "Silas"]);
    driveToSummary(h);
    const engine = h.app.getEngine()!;
    const summary = engine.getSummary()!;
    const panel = h.root.querySelector<HTMLElement>('[data-audience="summary"]')!;
    expect(panel).not.toBeNull();
    const winnerBadges = panel.querySelectorAll('[data-audience="winners"] .team-badge');
    expect(winnerBadges.length).toBe(summary.journeyWinners.length);
    expect(panel.querySelector('[data-audience="award"]')!.textContent).toMatch(/Barnabas Award: /);
    expect(panel.querySelectorAll('[data-audience="positions"] li').length).toBe(summary.finalPositions.length);
    expect(h.root.querySelector('[data-audience="task"]')).toBeNull();
  });
});
