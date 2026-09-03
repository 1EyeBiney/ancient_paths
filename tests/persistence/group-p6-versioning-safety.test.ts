// @vitest-environment jsdom
// PHASE8_SPEC Group P6 — versioning and safety. Nothing in the boot path
// may throw for any raw store content; a schema-version mismatch (newer OR
// older than known) is quarantined with a specific message; quarantine
// never deletes.

import { describe, expect, it, afterEach } from "vitest";
import { parseSavedGame, savedGameSchema, SAVE_SCHEMA_VERSION } from "../../src/persistence/schema";
import { MemorySaveStore } from "../../src/persistence/store";
import { makeApp, findButtonByText, type AppHarness } from "../ui/appHarness";
import { testJourney, bigPack } from "../session/fixtures";
import { createEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { RecordingEngine } from "../../src/persistence/recorder";
import { NON_COMMUNITY_CATEGORIES } from "../../src/ui/setup";
import type { SavedGame } from "../../src/persistence/schema";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function minimalValidSave(): SavedGame {
  const pack = bigPack();
  const { deck } = buildSessionDeck({
    journey: testJourney,
    packs: [pack],
    teamIds: ["team-1", "team-2"],
    turnTaskLimit: 3,
    seed: "p6-seed",
    enabledCategories: [...NON_COMMUNITY_CATEGORIES],
  });
  const inner = createEngine({
    journey: testJourney,
    packs: [pack],
    teams: [
      { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
      { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
    ],
    turnTaskLimit: 3,
    rng: createRng("p6-seed"),
    taskSource: deck,
  });
  const recorder = new RecordingEngine({ engine: inner });
  recorder.dispatch({ type: "startGame" });
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    content: { journeyId: testJourney.journeyId, journeyVersion: testJourney.version, packs: { [pack.packId]: pack.version } },
    setup: {
      journeyId: testJourney.journeyId,
      teamCount: 2,
      teamNames: ["Alpha", "Beta"],
      duration: "standard",
      pace: "standard",
      difficulty: "standard",
      enabledPackIds: [pack.packId],
      enabledCategories: [...NON_COMMUNITY_CATEGORIES],
      audio: { master: 100, music: 70, effects: 70, narration: 100 },
      communityCatchup: true,
      seed: "p6-seed",
      tasksPerTurnOverride: null,
      reducedMotion: null,
      mapStyle: "satellite",
      avoidRecentTasks: true,
      recentGamesToRemember: 3,
    },
    teams: [
      { id: "team-1", name: "Alpha", color: "#c00", symbol: "cross" },
      { id: "team-2", name: "Beta", color: "#0c0", symbol: "lion" },
    ],
    turnTaskLimit: 3,
    commands: [...recorder.getCommands()],
    snapshot: recorder.getSession(),
    audio: { settings: { master: 100, music: 70, effects: 70, narration: 100 }, speechMode: "wait" },
  };
}

describe("P6 — saveSchemaVersion mismatch", () => {
  it("newer than known: a specific message, and the schema itself rejects it", () => {
    const save = { ...minimalValidSave(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 };
    const parsed = parseSavedGame(save);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("This saved game was made by a newer version of the game.");
    expect(savedGameSchema.safeParse(save).success).toBe(false);
  });

  it("older than known takes the same path (the branch must exist even though nothing is older than 1 yet)", () => {
    const save = { ...minimalValidSave(), saveSchemaVersion: 0 };
    const parsed = parseSavedGame(save);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("This saved game was made by an older, unsupported version of the game.");
  });
});

describe("P6 — nothing in the boot path may throw", () => {
  const cases: [string, unknown][] = [
    ["null", null],
    ["a string", "not a save"],
    ["an empty object", {}],
    ["an array", [1, 2, 3]],
  ];
  for (const [label, raw] of cases) {
    it(`${label}: parseSavedGame never throws and reports failure`, () => {
      expect(() => parseSavedGame(raw)).not.toThrow();
      expect(parseSavedGame(raw).ok).toBe(false);
    });
  }

  it("a save with an unknown command type: rejected, never throws", () => {
    const save = { ...minimalValidSave(), commands: [{ type: "flyToTheMoon" }] };
    expect(() => parseSavedGame(save)).not.toThrow();
    expect(parseSavedGame(save).ok).toBe(false);
  });
});

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("P6 — boot and Resume never throw or crash the app", () => {
  it("a corrupt raw value at boot: the app still boots to Welcome with New game/Sound check", async () => {
    const store = new MemorySaveStore();
    await store.save("not a save" as unknown as SavedGame);
    h = makeApp({ extra: { saveStore: store } });
    await flush();
    expect(() => findButtonByText(h!.root, "New game")).not.toThrow();
    expect(() => findButtonByText(h!.root, "Sound check")).not.toThrow();
  });

  it("a save whose journey id no longer exists: Resume fails gracefully, quarantines, never deletes", async () => {
    const store = new MemorySaveStore();
    const base = minimalValidSave();
    const save: SavedGame = { ...base, content: { ...base.content, journeyId: "no-such-journey" } };
    await store.save(save);
    h = makeApp({ extra: { saveStore: store } });
    await flush();

    // The Resume card still renders (journey title falls back to the raw id).
    expect(() => findButtonByText(h!.root, "Resume game")).not.toThrow();
    findButtonByText(h.root, "Resume game").click();
    await flush();

    expect(h.app.getMode()).toBe("startup"); // never crashed into playing
    expect(() => findButtonByText(h!.root, "New game")).not.toThrow();
    expect(await store.load()).toBeNull(); // no longer the live save
  });
});

describe("P6 — quarantine never deletes", () => {
  it("multiple quarantines accumulate; clear() removes only the live save", async () => {
    const store = new MemorySaveStore();
    await store.quarantine({ first: true });
    await store.quarantine({ second: true });
    expect(store.getQuarantined()).toEqual([{ first: true }, { second: true }]);

    await store.save(minimalValidSave());
    expect(await store.load()).not.toBeNull();
    await store.clear();
    expect(await store.load()).toBeNull();
    // clear() touched only the live save, not the quarantined history.
    expect(store.getQuarantined()).toEqual([{ first: true }, { second: true }]);
  });
});
