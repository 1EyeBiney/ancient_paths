// Shared test harness for Groups U6-U8: a real engine driven with
// ArrayTaskSource (Phase 2's own precise-control pattern — see
// full-game-smoke.test.ts) against ONE bespoke "rich" task that exercises
// every resource interaction, plus a ScreenRenderer wired to it. Using
// ArrayTaskSource (not a real SessionDeck) here is deliberate: these
// groups test the SCREENS/ruling-flow logic against a task whose exact
// shape we control, not draw randomness (already covered by U5).

import { taskSchema, contentPackSchema, journeySchema, type Task, type Journey } from "../../src/content/schemas";
import { createEngine, type GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { ScreenRenderer } from "../../src/ui/screens";
import { Presenter } from "../../src/ui/presenter";

export const RICH_ANSWER = "Rich Answer Never Shown Pre-Reveal";
export const RICH_OPTIONS = ["Matthias", RICH_ANSWER, "Barnabas", "Silas"];

export function makeRichTask(overrides: Partial<Task> = {}): Task {
  const raw = {
    id: "rich-task-1",
    schemaVersion: 1,
    packId: "harness-pack",
    category: "scripture-knowledge",
    title: "Rich Task Title",
    biblePeriods: [],
    locations: [],
    difficulty: "moderate",
    prompt: "Rich task base prompt.",
    answer: RICH_ANSWER,
    acceptedAnswers: [RICH_ANSWER],
    hostGuidance: "Accept close phonetic spellings.",
    scriptureReferences: [],
    normalVariant: {
      prompt: "Who replaced Judas among the apostles?",
      options: RICH_OPTIONS,
      successValue: 1,
    },
    assistedVariant: {
      available: true,
      cost: { resource: "provision", amount: 1 },
      prompt: "Assisted: Who replaced Judas? (easier phrasing)",
      options: RICH_OPTIONS,
      successValue: 1,
    },
    amplifiedVariant: {
      available: true,
      cost: { resource: "courage", amount: 1 },
      prompt: "Amplified: Who replaced Judas, and why?",
      answer: RICH_ANSWER,
      acceptedAnswers: [RICH_ANSWER],
      successValue: 2,
    },
    clues: ["Clue one: chosen by lot.", "Clue two: one of two candidates."],
    teachingReveal: "Acts 1:26 — the lot fell to Matthias, and he was added to the eleven.",
    historicalNote: "The casting of lots reflects Old Testament priestly practice.",
    audioAsset: null,
    tags: ["harness"],
    resourceInteractions: { insight: true, provision: true, courage: true },
    estimatedSeconds: 30,
    ...overrides,
  };
  return taskSchema.parse(raw);
}

export function harnessJourney(): Journey {
  return journeySchema.parse({
    journeyId: "harness-journey",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Harness Test Path",
    startMilestoneId: "start",
    destinationMilestoneId: "finish",
    milestones: [
      { id: "start", name: "Start", introText: "x", ambientAudioAsset: null },
      { id: "mid", name: "Antioch", introText: "The believers gather at Antioch.", ambientAudioAsset: null },
      { id: "finish", name: "Finish", introText: "x", ambientAudioAsset: null },
    ],
    entries: [
      { kind: "stage", id: "s1", name: "S1", requiredSuccesses: 1, arrivesAtMilestoneId: "mid" },
      { kind: "stage", id: "s2", name: "S2", requiredSuccesses: 1, arrivesAtMilestoneId: "finish" },
    ],
    communityEvents: [
      {
        kind: "relay",
        id: "relay-1",
        milestoneId: "mid",
        title: "Relay at Antioch",
        description: "The room answers together.",
        repeatable: false,
        taskCategory: "community",
        successThreshold: 2,
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

export interface Harness {
  engine: GameEngine;
  renderer: ScreenRenderer;
  presenter: Presenter;
  container: HTMLElement;
  politeRegion: HTMLElement;
  assertiveRegion: HTMLElement;
  statusLine: HTMLElement;
  tasksById: Map<string, Task>;
  journey: Journey;
}

/** A pool of tasks: the rich one first, then enough plain community/other
 * tasks (via ArrayTaskSource's own array order) to drive a full turn or
 * two without exhausting supply. */
export function makeHarness(
  opts: {
    tasks?: Task[];
    startingResources?: { insight: number; provision: number; courage: number };
    seed?: string;
  } = {},
): Harness {
  const journey = harnessJourney();
  const tasks = opts.tasks ?? [makeRichTask()];
  const pack = contentPackSchema.parse({
    packId: "harness-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "Harness pack",
    tasks,
  });
  const tasksById = new Map(pack.tasks.map((t) => [t.id, t]));

  const engine = createEngine({
    journey,
    packs: [pack],
    teams: [
      { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
      { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
    ],
    turnTaskLimit: 3,
    rng: createRng(opts.seed ?? "harness-seed"),
    taskSource: new ArrayTaskSource(pack.tasks),
    startingResources: opts.startingResources ?? { insight: 5, provision: 5, courage: 5 },
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
    tasksById,
    present: (input) => presenter.present(input),
  });

  return { engine, renderer, presenter, container, politeRegion, assertiveRegion, statusLine, tasksById, journey };
}

/** Drives from ready/beginTurn up to (and rendering) resourceWindow for
 * the current task, re-rendering at each step. */
export function driveToResourceWindow(h: Harness): void {
  if (h.engine.getState() === "ready") h.engine.dispatch({ type: "startGame" });
  h.renderer.render(h.engine, h.container);
  if (h.engine.getState() === "beginTurn") {
    h.engine.dispatch({ type: "presentTask" });
    h.renderer.render(h.engine, h.container);
  }
}

export function driveToAnswerReveal(h: Harness): void {
  driveToResourceWindow(h);
  h.engine.dispatch({ type: "acceptAnswer" });
  h.renderer.render(h.engine, h.container);
  h.engine.dispatch({ type: "reveal" });
  h.renderer.render(h.engine, h.container);
}
