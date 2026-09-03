// @vitest-environment jsdom
// Fable's review of Phase 8 (OPEN_QUESTIONS item 31): four small fixes,
// each pinned here. (1) Resume applies the saved reduced-motion choice to
// the DOM. (2) An arming Ctrl+Z leaves "Undo will reverse…" standing, and
// a confirming Ctrl+Z says "Undo confirmed…" AND the new screen in one
// announcement (item 30). (3) The replay integrity check treats an
// undefined-valued key as absent, so a JSON round trip of a post-fork save
// still resumes. (IndexedDbSaveStore's transaction-complete change has no
// jsdom coverage — the browser check is its test, per rule 5.)

import { describe, expect, it, afterEach } from "vitest";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { testJourney, bigPack } from "../session/fixtures";
import { NON_COMMUNITY_CATEGORIES } from "../../src/ui/setup";
import { RecordingEngine } from "../../src/persistence/recorder";
import { rebuildFromSave } from "../../src/persistence/replay";
import { MemorySaveStore } from "../../src/persistence/store";
import { SAVE_SCHEMA_VERSION, type SavedGame } from "../../src/persistence/schema";
import { makeApp, beginByMouse, keyboardStep, keydownOn, findButtonByText, type AppHarness } from "./appHarness";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const SEED = "p8-review-seed";
const teams = [
  { id: "team-1", name: "Alpha", color: "#c0392b", symbol: "cross" },
  { id: "team-2", name: "Beta", color: "#27ae60", symbol: "lion" },
];

/** Drives a real deck+engine through the recorder with the S11 script
 * until `until` returns true, then packages a SavedGame. */
function recordUntil(until: (engine: RecordingEngine) => boolean, setupOverrides: Partial<SavedGame["setup"]> = {}) {
  const pack = bigPack();
  const buildOptions = {
    journey: testJourney,
    packs: [pack],
    teamIds: teams.map((t) => t.id),
    turnTaskLimit: 4,
    seed: SEED,
    enabledCategories: [...NON_COMMUNITY_CATEGORIES],
  };
  const { deck } = buildSessionDeck(buildOptions);
  const recorder = new RecordingEngine({
    engine: createEngine({ journey: testJourney, packs: [pack], teams, turnTaskLimit: 4, rng: createRng(SEED), taskSource: deck }),
  });
  recorder.dispatch({ type: "startGame" });
  let steps = 0;
  while (!until(recorder) && recorder.getState() !== "gameSummary" && steps++ < 400) {
    const state = recorder.getState();
    if (state === "forkChoice") recorder.dispatch({ type: "chooseRoute", routeId: recorder.getAvailableRoutes()![0]!.id });
    else if (state === "landmarkIntroduction") recorder.dispatch({ type: "beginCommunityEvent" });
    else if (state === "communityEvent") recorder.dispatch({ type: "resolveCommunityEvent" });
    else if (state === "surplusDecision") recorder.dispatch({ type: "keepSurplus", resource: "insight" });
    else if (state === "beginTurn") recorder.dispatch({ type: "presentTask" });
    else if (state === "resourceWindow") recorder.dispatch({ type: "acceptAnswer" });
    else if (state === "awaitingAnswer") recorder.dispatch({ type: "reveal" });
    else if (state === "answerReveal") recorder.dispatch({ type: "rule", result: "correct" });
    else if (state === "recoverDecision") recorder.dispatch({ type: "declineRecover" });
    else if (state === "teachingReveal") recorder.dispatch({ type: "finishTeaching" });
    else throw new Error(`recordUntil: unhandled state ${state}`);
  }
  const save: SavedGame = {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    content: { journeyId: testJourney.journeyId, journeyVersion: testJourney.version, packs: { [pack.packId]: pack.version } },
    setup: {
      journeyId: testJourney.journeyId,
      teamCount: 2,
      teamNames: teams.map((t) => t.name),
      duration: "standard",
      pace: "standard",
      difficulty: "standard",
      enabledPackIds: [pack.packId],
      enabledCategories: [...NON_COMMUNITY_CATEGORIES],
      audio: { master: 100, music: 70, effects: 70, narration: 100 },
      communityCatchup: true,
      seed: SEED,
      tasksPerTurnOverride: null,
      reducedMotion: null,
      mapStyle: "satellite",
      avoidRecentTasks: true,
      recentGamesToRemember: 3,
      ...setupOverrides,
    },
    teams,
    turnTaskLimit: 4,
    commands: [...recorder.getCommands()],
    snapshot: recorder.getSession(),
    audio: { settings: { master: 100, music: 70, effects: 70, narration: 100 }, speechMode: "wait" },
  };
  return { save, pack };
}

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("review fix 1 — Resume applies the saved reduced-motion choice", () => {
  it("a save made with Reduce motion on resumes with data-reduced-motion=true", async () => {
    const { save } = recordUntil((e) => e.getState() === "resourceWindow", { reducedMotion: true });
    const store = new MemorySaveStore();
    await store.save(save);
    h = makeApp({ extra: { saveStore: store, matchMedia: () => ({ matches: false }) } });
    await flush();
    expect(h.root.dataset.reducedMotion).toBe("false"); // Welcome, before Resume: the media query says no
    findButtonByText(h.root, "Resume game").click();
    await flush();
    expect(h.app.getMode()).toBe("playing");
    expect(h.root.dataset.reducedMotion).toBe("true");
  });
});

describe("review fix 2 — the undo arm/confirm announcements are heard (item 30)", () => {
  it("arming leaves 'Undo will reverse' standing; confirming says the confirmation and the new screen together", () => {
    h = makeApp();
    beginByMouse(h);
    keyboardStep(h); // ready -> startGame
    keyboardStep(h); // beginTurn -> presentTask
    const engine = h.app.getEngine()!;
    expect(engine.getState()).toBe("resourceWindow");
    expect(engine.canUndo()).toBe(true);

    keydownOn(window, "z", { ctrlKey: true }); // arm
    const armed = h.app.getPresenterLog().at(-1)!.visual;
    expect(armed).toMatch(/^Undo will reverse: .*Press again to confirm\.$/);
    expect(engine.getState()).toBe("resourceWindow"); // nothing changed, nothing re-rendered over the message

    keydownOn(window, "z", { ctrlKey: true }); // confirm
    expect(engine.getState()).toBe("beginTurn"); // presentTask reversed
    const last = h.app.getPresenterLog().at(-1)!.visual;
    expect(last).toMatch(/^Undo confirmed: /);
    // …and the beginTurn screen's own entry text follows in the SAME announcement.
    expect(last).toMatch(/Round 1\. Team /);
  });
});

describe("review fix 3 — the integrity check tolerates undefined-valued keys", () => {
  it("a post-fork save survives a JSON round trip (which drops `pendingForkId: undefined`)", () => {
    const { save, pack } = recordUntil((e) => e.getSession().teams.some((t) => t.selectedRouteId !== undefined));
    // The engine wrote `pendingForkId = undefined` on chooseRoute: the key is present, valued undefined.
    const routed = save.snapshot.teams.find((t) => t.selectedRouteId !== undefined)!;
    expect(Object.prototype.hasOwnProperty.call(routed, "pendingForkId")).toBe(true);
    expect(routed.pendingForkId).toBeUndefined();

    const roundTripped = JSON.parse(JSON.stringify(save)) as SavedGame;
    const result = rebuildFromSave(roundTripped, { journeys: [testJourney], packs: [pack] });
    if ("error" in result) throw new Error(`rebuild failed: ${result.error}`);
    expect(result.engine.getState()).toBe(save.snapshot.state);
  });
});
