// PHASE8_SPEC Group P2 — the save schema and the store seam.

import { describe, expect, it } from "vitest";
import { makeEngine } from "../engine/fixtures";
import { testJourney as engineTestJourney } from "../engine/fixtures";
import { savedGameSchema, parseSavedGame, SAVE_SCHEMA_VERSION, type SavedGame } from "../../src/persistence/schema";
import { MemorySaveStore } from "../../src/persistence/store";
import { SetupWizard } from "../../src/ui/setup";
import { testJourney, bigPack } from "../session/fixtures";

function makeValidSave(): SavedGame {
  const engine = makeEngine();
  engine.dispatch({ type: "startGame" });
  engine.dispatch({ type: "presentTask" });
  const session = engine.getSession();
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    content: {
      journeyId: engineTestJourney.journeyId,
      journeyVersion: engineTestJourney.version,
      packs: { "test-pack": "0.0.1" },
    },
    setup: {
      journeyId: engineTestJourney.journeyId,
      teamCount: 2,
      teamNames: ["Matthew", "Mark"],
      duration: "standard",
      pace: "standard",
      difficulty: "standard",
      enabledPackIds: ["test-pack"],
      enabledCategories: ["scripture-knowledge", "historical-context", "decision-strategy"],
      audio: { master: 100, music: 70, effects: 70, narration: 100 },
      communityCatchup: true,
      seed: "fixture-seed",
      tasksPerTurnOverride: null,
      reducedMotion: null,
      mapStyle: "satellite",
      avoidRecentTasks: true,
      recentGamesToRemember: 3,
    },
    teams: [
      { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
      { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
    ],
    turnTaskLimit: 3,
    commands: [{ type: "startGame" }, { type: "presentTask" }],
    snapshot: session,
    audio: {
      settings: { master: 100, music: 70, effects: 70, narration: 100 },
      speechMode: "wait",
    },
  };
}

describe("P2 — the save schema", () => {
  it("accepts a well-formed save", () => {
    const save = makeValidSave();
    const result = savedGameSchema.safeParse(save);
    expect(result.success).toBe(true);
  });

  it("rejects a save missing a required field", () => {
    const save = makeValidSave() as unknown as Record<string, unknown>;
    delete save.setup;
    expect(savedGameSchema.safeParse(save).success).toBe(false);
  });

  it("rejects a wrong saveSchemaVersion", () => {
    // PHASE10_SPEC Group X6 bumped SAVE_SCHEMA_VERSION 1 -> 2; a literal
    // "2" here would stop being wrong the next time it bumps again, so
    // this is symbolic like P6's own mismatch tests.
    const save = { ...makeValidSave(), saveSchemaVersion: SAVE_SCHEMA_VERSION + 1 } as unknown;
    expect(savedGameSchema.safeParse(save).success).toBe(false);
    const parsed = parseSavedGame(save);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/newer version/);
  });

  it("rejects a command of unknown type", () => {
    const save = makeValidSave();
    const withBadCommand = { ...save, commands: [...save.commands, { type: "flyToTheMoon" }] };
    expect(savedGameSchema.safeParse(withBadCommand).success).toBe(false);
  });

  it("parseSavedGame accepts a well-formed save and rejects garbage without throwing", () => {
    expect(parseSavedGame(makeValidSave()).ok).toBe(true);
    expect(parseSavedGame(null).ok).toBe(false);
    expect(parseSavedGame("nope").ok).toBe(false);
    expect(parseSavedGame({}).ok).toBe(false);
    expect(parseSavedGame([]).ok).toBe(false);
  });
});

describe("P2 — SetupSnapshot round-trips through toSnapshot/applySnapshot", () => {
  it("every field survives the round trip", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    wizard.setTeamCount(3);
    wizard.setTeamName(0, "Cross Team");
    wizard.setDuration({ customMinutes: 42 });
    wizard.setPace("quick");
    wizard.setDifficulty("challenging");
    wizard.setEnabledPacks([]);
    wizard.setEnabledCategories(["hymn"]);
    wizard.setAudio({ master: 50, music: 10, effects: 20, narration: 30 });
    wizard.setCommunityCatchup(false);
    wizard.setSeed("a-specific-seed");
    wizard.setTasksPerTurnOverride(5);
    wizard.setReducedMotion(true);
    wizard.setMapStyle("parchment");

    const snapshot = wizard.toSnapshot();

    const fresh = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    fresh.applySnapshot(snapshot);

    expect(fresh.journey?.journeyId).toBe(testJourney.journeyId);
    expect(fresh.teamCount).toBe(3);
    expect(fresh.teamNames[0]).toBe("Cross Team");
    expect(fresh.duration).toEqual({ customMinutes: 42 });
    expect(fresh.pace).toBe("quick");
    expect(fresh.difficulty).toBe("challenging");
    expect(fresh.enabledPackIds).toEqual([]);
    expect(fresh.enabledCategories).toEqual(["hymn"]);
    expect(fresh.audio).toEqual({ master: 50, music: 10, effects: 20, narration: 30 });
    expect(fresh.communityCatchup).toBe(false);
    expect(fresh.seed).toBe("a-specific-seed");
    expect(fresh.tasksPerTurnOverride).toBe(5);
    expect(fresh.reducedMotion).toBe(true);
    expect(fresh.mapStyle).toBe("parchment");
  });

  it("applySnapshot throws for an unknown journey id", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    const snapshot = wizard.toSnapshot();
    const other = new SetupWizard({ journeys: [], packs: [] });
    expect(() => other.applySnapshot(snapshot)).toThrow();
  });
});

describe("P2 — MemorySaveStore", () => {
  it("save/load/clear/quarantine", async () => {
    const store = new MemorySaveStore();
    expect(await store.load()).toBeNull();

    const save = makeValidSave();
    await store.save(save);
    expect(await store.load()).toEqual(save);
    expect(store.writes).toEqual([save]);

    await store.clear();
    expect(await store.load()).toBeNull();

    await store.quarantine({ garbage: true });
    expect(store.getQuarantined()).toEqual([{ garbage: true }]);
    expect(await store.load()).toBeNull(); // quarantine also clears the live save
  });

  it("failNextSave rejects exactly the next save", async () => {
    const store = new MemorySaveStore();
    store.failNextSave();
    await expect(store.save(makeValidSave())).rejects.toThrow();
    await expect(store.save(makeValidSave())).resolves.toBeUndefined();
  });
});
