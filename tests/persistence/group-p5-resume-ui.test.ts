// @vitest-environment jsdom
// PHASE8_SPEC Group P5 — resume, the New-game guard, and the game log.

import { describe, expect, it, afterEach } from "vitest";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { testJourney, bigPack } from "../session/fixtures";
import { NON_COMMUNITY_CATEGORIES } from "../../src/ui/setup";
import { RecordingEngine } from "../../src/persistence/recorder";
import { MemorySaveStore } from "../../src/persistence/store";
import { SAVE_SCHEMA_VERSION, type SavedGame } from "../../src/persistence/schema";
import { makeApp, findButtonByText, keydownOn, type AppHarness } from "../ui/appHarness";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

const SEED = "p5-resume-seed";
const teams = [
  { id: "team-1", name: "Alpha", color: "#c0392b", symbol: "cross" },
  { id: "team-2", name: "Beta", color: "#27ae60", symbol: "lion" },
];

/** A short, valid, resumable save against the harness's own default
 * journey/pack (testJourney + bigPack) so a fresh App booted against those
 * same defaults can rebuild it. */
function buildValidSave(): SavedGame {
  const pack = bigPack();
  const { deck } = buildSessionDeck({
    journey: testJourney,
    packs: [pack],
    teamIds: teams.map((t) => t.id),
    turnTaskLimit: 4,
    seed: SEED,
    enabledCategories: [...NON_COMMUNITY_CATEGORIES],
  });
  const inner = createEngine({
    journey: testJourney,
    packs: [pack],
    teams,
    turnTaskLimit: 4,
    rng: createRng(SEED),
    taskSource: deck,
  });
  const recorder = new RecordingEngine({ engine: inner });
  recorder.dispatch({ type: "startGame" });
  recorder.dispatch({ type: "presentTask" });
  recorder.dispatch({ type: "acceptAnswer" });

  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: "2026-09-03T12:34:56.000Z",
    content: {
      journeyId: testJourney.journeyId,
      journeyVersion: testJourney.version,
      packs: { [pack.packId]: pack.version },
    },
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
    },
    teams,
    turnTaskLimit: 4,
    commands: [...recorder.getCommands()],
    snapshot: recorder.getSession(),
    audio: { settings: { master: 100, music: 70, effects: 70, narration: 100 }, speechMode: "wait" },
  };
}

/** An independently rebuilt reference engine at the same saved state, for
 * comparison against the resumed App's engine — matches PHASE8_SPEC's
 * "host + audience screens identical to a fresh render of the rebuilt
 * engine" requirement without depending on rebuildFromSave itself (already
 * covered by Group P3). */
function buildReferenceEngine(save: SavedGame) {
  const pack = bigPack();
  const { deck } = buildSessionDeck({
    journey: testJourney,
    packs: [pack],
    teamIds: teams.map((t) => t.id),
    turnTaskLimit: 4,
    seed: SEED,
    enabledCategories: [...NON_COMMUNITY_CATEGORIES],
  });
  const reference = createEngine({
    journey: testJourney,
    packs: [pack],
    teams,
    turnTaskLimit: 4,
    rng: createRng(SEED),
    taskSource: deck,
  });
  for (const command of save.commands) reference.dispatch(command);
  return reference;
}

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("P5 — boot with a saved game", () => {
  it("shows a Resume game button above New game, with the card text", async () => {
    const store = new MemorySaveStore();
    const save = buildValidSave();
    await store.save(save);
    h = makeApp({ extra: { saveStore: store } });
    await flush();

    const buttons = Array.from(h.root.querySelectorAll("button")).map((b) => b.textContent);
    const resumeIdx = buttons.indexOf("Resume game");
    const newGameIdx = buttons.indexOf("New game");
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(newGameIdx).toBeGreaterThan(resumeIdx);

    const activeTeam = save.snapshot.teams[save.snapshot.activeTeamIndex]!.name;
    const expectedCard = `${testJourney.title}. 2 teams: Alpha, Beta. Round ${save.snapshot.roundNumber}, ${activeTeam}'s turn. Saved ${new Date(save.savedAt).toLocaleString()}.`;
    expect(h.root.textContent).toContain(expectedCard);
  });

  it("Resume reaches playing at the saved state, matching a fresh render of the rebuilt engine", async () => {
    const store = new MemorySaveStore();
    const save = buildValidSave();
    await store.save(save);
    h = makeApp({ extra: { saveStore: store } });
    await flush();

    findButtonByText(h.root, "Resume game").click();
    await flush();

    expect(h.app.getMode()).toBe("playing");
    const engine = h.app.getEngine()!;
    expect(engine.getState()).toBe(save.snapshot.state);

    const reference = buildReferenceEngine(save);
    expect(engine.getSession().teams).toEqual(reference.getSession().teams);
    expect(engine.getSession().activeTeamIndex).toEqual(reference.getSession().activeTeamIndex);
    expect(engine.getState()).toBe(reference.getState());

    const activeId = reference.getSession().teams[reference.getSession().activeTeamIndex]!.id;
    expect(h.root.querySelector("#host-controls h2")).toBeTruthy();
    expect(h.root.querySelector(`[data-audience="teams"] tr[data-team-id="${activeId}"]`)).toBeTruthy();
    const resourceCells = h.root.querySelectorAll(`[data-audience="teams"] tr[data-team-id="${activeId}"] [data-col="insight"]`);
    expect(resourceCells[0]!.textContent).toBe(String(reference.getTeam(activeId)!.resources.insight));
  });
});

describe("P5 — a corrupt saved game", () => {
  it("is quarantined and announced; the game boots normally otherwise", async () => {
    const store = new MemorySaveStore();
    await store.save({ garbage: true } as unknown as SavedGame);
    h = makeApp({ extra: { saveStore: store } });
    await flush();

    expect(h.root.textContent).toContain("A saved game could not be read and was set aside.");
    expect(() => findButtonByText(h!.root, "Resume game")).toThrow();
    expect(() => findButtonByText(h!.root, "New game")).not.toThrow();
    expect(await store.load()).toBeNull(); // quarantined, not left as "current"
  });
});

describe("P5 — New game while a save exists", () => {
  it("asks first; Cancel keeps the save and returns to Welcome", async () => {
    const store = new MemorySaveStore();
    const save = buildValidSave();
    await store.save(save);
    h = makeApp({ extra: { saveStore: store } });
    await flush();

    findButtonByText(h.root, "New game").click();
    expect(h.app.getMode()).toBe("startup"); // still on Welcome — the modal is open, not setup
    expect(() => findButtonByText(h!.root, "Cancel")).not.toThrow();

    findButtonByText(h.root, "Cancel").click();
    expect(h.app.getMode()).toBe("startup");
    expect(() => findButtonByText(h!.root, "Resume game")).not.toThrow(); // save still offered
    expect(await store.load()).toEqual(save); // untouched

    findButtonByText(h.root, "New game").click();
    findButtonByText(h.root, "Start a new game").click();
    expect(h.app.getMode()).toBe("setup");
    expect(await store.load()).toBeNull(); // cleared
  });
});

describe("P5 — Game log and Delete saved game", () => {
  it("Game log lists the last lines; Delete saved game asks twice and stops further autosaving", async () => {
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    h.root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Duration"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Pace"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Difficulty"] [role="option"]')!.click();
    findButtonByText(h.root, "Begin journey").click();
    await flush();

    const engine = h.app.getEngine()!;
    engine.dispatch({ type: "startGame" });
    await flush();

    keydownOn(window, "Escape"); // opens the game menu (no host action pending behind a modal)
    findButtonByText(h.root, "Game log…").click();
    const lastLine = engine.getSession().eventLog.at(-1)!.text;
    const list = h.root.querySelector('[role="dialog"] ol');
    expect(list).toBeTruthy();
    expect(list!.textContent).toContain(lastLine);

    keydownOn(window, "Escape"); // close the log
    keydownOn(window, "Escape"); // reopen the game menu
    findButtonByText(h.root, "Delete saved game").click();
    expect(() => findButtonByText(h!.root, "Cancel")).not.toThrow(); // confirm dialog open, not yet deleted
    await flush();
    expect(await h.saveStore.load()).not.toBeNull(); // not deleted yet

    findButtonByText(h.root, "Delete saved game").click(); // the confirm button, same label
    await flush();
    expect(await h.saveStore.load()).toBeNull();

    const writesBefore = h.saveStore.writes.length;
    engine.dispatch({ type: "presentTask" });
    await flush();
    expect(h.saveStore.writes.length).toBe(writesBefore); // stopped autosaving for the rest of this game
  });
});
