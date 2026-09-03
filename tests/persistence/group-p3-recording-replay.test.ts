// PHASE8_SPEC Group P3 — RecordingEngine and rebuildFromSave(). A real full
// game against testJourney (via the real builder, buildSessionDeck) is
// played through a RecordingEngine, exercising a fork choice, an offering,
// a community event, a share, and an undo; the resulting save must replay
// to an identical session. bigPack's synthetic tasks have no amplified
// variant (nothing can ever offer a surplus), so this uses a small custom
// pack with amplifiedVariant on every task — the same reason PHASE7_SPEC's
// C6 group built its own pack instead of reusing bigPack.

import { describe, expect, it } from "vitest";
import { createEngine, type Command, type TeamSetup } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { buildSessionDeck } from "../../src/session/builder";
import { testJourney } from "../session/fixtures";
import { contentPackSchema, TASK_CATEGORIES, DIFFICULTIES, type ContentPack, type Task } from "../../src/content/schemas";
import { NON_COMMUNITY_CATEGORIES } from "../../src/ui/setup";
import { RecordingEngine } from "../../src/persistence/recorder";
import { rebuildFromSave } from "../../src/persistence/replay";
import type { SavedGame } from "../../src/persistence/schema";
import { SAVE_SCHEMA_VERSION } from "../../src/persistence/schema";
import { IllegalCommandError } from "../../src/engine/errors";

const twoTeams: TeamSetup[] = [
  { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
  { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
];

const SEED = "p3-replay-seed";

/** Every task has an amplifiedVariant and every resourceInteraction true, so
 * amplify/offer works regardless of which task the deck draws — mirrors
 * PHASE7_SPEC C6's buildTestPack. */
function offerablePack(): ContentPack {
  const tasks: Task[] = [];
  let n = 0;
  for (const category of TASK_CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 6; i++) {
        n++;
        tasks.push({
          id: `p3-${category}-${difficulty}-${n}`,
          schemaVersion: 1,
          packId: "p3-pack",
          category,
          title: `P3 task ${n}`,
          biblePeriods: [],
          locations: [],
          difficulty,
          prompt: `P3 task ${n} prompt`,
          answer: `P3 answer ${n}`,
          acceptedAnswers: [`P3 answer ${n}`],
          hostGuidance: null,
          scriptureReferences: [],
          normalVariant: { prompt: `P3 task ${n} prompt`, successValue: 1 },
          assistedVariant: {
            available: true,
            cost: { resource: "insight", amount: 1 },
            prompt: `P3 task ${n} assisted`,
            successValue: 1,
          },
          amplifiedVariant: {
            available: true,
            cost: { resource: "courage", amount: 1 },
            prompt: `P3 task ${n} amplified`,
            answer: `P3 answer ${n}`,
            acceptedAnswers: [`P3 answer ${n}`],
            successValue: 2,
          },
          clues: [],
          teachingReveal: `P3 task ${n} teaching.`,
          historicalNote: null,
          audioAsset: null,
          tags: ["p3-test"],
          resourceInteractions: { insight: true, provision: true, courage: true },
          estimatedSeconds: 30,
        } as Task);
      }
    }
  }
  return contentPackSchema.parse({
    packId: "p3-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "P3 test pack",
    description: "Test-only, obviously fake, never real content.",
    tasks,
  });
}

function buildDeck(pack: ContentPack, seed: string) {
  return buildSessionDeck({
    journey: testJourney,
    packs: [pack],
    teamIds: ["matthew", "mark"],
    turnTaskLimit: 3,
    seed,
    enabledCategories: [...NON_COMMUNITY_CATEGORIES],
  }).deck;
}

/** Packages a RecordingEngine's current state as a SavedGame, whatever
 * point in the game it's at — shared by the full-game driver and the
 * mid-community-event test (PHASE9_SPEC Group N1). */
function buildSave(recorder: RecordingEngine, pack: ContentPack, seed: string): SavedGame {
  return {
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    content: {
      journeyId: testJourney.journeyId,
      journeyVersion: testJourney.version,
      packs: { [pack.packId]: pack.version },
    },
    setup: {
      journeyId: testJourney.journeyId,
      teamCount: 2,
      teamNames: ["Matthew", "Mark"],
      duration: "standard",
      pace: "standard",
      difficulty: "standard",
      enabledPackIds: [pack.packId],
      enabledCategories: [...NON_COMMUNITY_CATEGORIES],
      audio: { master: 100, music: 70, effects: 70, narration: 100 },
      communityCatchup: true,
      seed,
      tasksPerTurnOverride: null,
      reducedMotion: null,
      mapStyle: "satellite",
    },
    teams: twoTeams,
    turnTaskLimit: 3,
    commands: [...recorder.getCommands()],
    snapshot: recorder.getSession(),
    audio: { settings: { master: 100, music: 70, effects: 70, narration: 100 }, speechMode: "wait" },
  };
}

/** Plays a full game (fork, offering, community event, share, undo) via a
 * RecordingEngine and returns it plus a SavedGame built from its state. */
function playRecordedGame(seed = SEED): { recorder: RecordingEngine; save: SavedGame; pack: ContentPack } {
  const pack = offerablePack();
  const deck = buildDeck(pack, seed);
  const inner = createEngine({
    journey: testJourney,
    packs: [pack],
    teams: twoTeams,
    turnTaskLimit: 3,
    rng: createRng(seed),
    taskSource: deck,
  });
  const recorder = new RecordingEngine({ engine: inner });

  recorder.dispatch({ type: "startGame" });

  // Exercise undo early: present a task, then undo it back to beginTurn.
  recorder.dispatch({ type: "presentTask" });
  recorder.dispatch({ type: "undo" });

  let steps = 0;
  const MAX_STEPS = 800;
  let resolvedChoiceAsCourage = false;
  let sharedGift = false;
  let offeredSurplus = false;

  while (recorder.getState() !== "gameSummary" && steps < MAX_STEPS) {
    steps++;
    const state = recorder.getState();

    // Resolve matthew's first pending choice (queued when s1 completes, by
    // Group P1's stage reward) as courage — the only way this pack's teams
    // acquire courage to spend on an amplify, without seeding
    // startingResources (real play always starts at 0/0/0).
    if (!resolvedChoiceAsCourage && recorder.getPendingChoicesForTeam("matthew") > 0) {
      recorder.dispatch({ type: "chooseGrantedResource", teamId: "matthew", resource: "courage" });
      resolvedChoiceAsCourage = true;
      continue;
    }
    // Once that's done, the next team holding a pending choice shares it —
    // exercises shareGrantedResource.
    if (resolvedChoiceAsCourage && !sharedGift) {
      const holder = twoTeams.find((t) => recorder.getPendingChoicesForTeam(t.id) > 0);
      if (holder) {
        const other = twoTeams.find((t) => t.id !== holder.id)!;
        recorder.dispatch({ type: "shareGrantedResource", teamId: holder.id, toTeamId: other.id });
        sharedGift = true;
        continue;
      }
    }

    if (state === "forkChoice") {
      const routes = recorder.getAvailableRoutes()!;
      recorder.dispatch({ type: "chooseRoute", routeId: routes[0]!.id });
      continue;
    }
    if (state === "landmarkIntroduction") {
      recorder.dispatch({ type: "beginCommunityEvent" });
      continue;
    }
    if (state === "communityEvent") {
      // testJourney has one relay event (at "midway") and one contribution
      // event (at "ford"); meet the relay's threshold, leave the
      // contribution unpledged (same as the S11 full-game script) — either
      // way, resolve.
      const milestoneId = recorder.getSession().triggeredMilestones.at(-1);
      const event = testJourney.communityEvents.find((e) => e.milestoneId === milestoneId);
      if (event?.kind === "relay") {
        for (let i = 0; i < event.successThreshold; i++) {
          recorder.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
        }
      }
      recorder.dispatch({ type: "resolveCommunityEvent" });
      continue;
    }
    if (state === "surplusDecision") {
      // The FIRST surplus is offered (exercises the offering path); any
      // later surplus is just kept, to keep the script simple.
      if (!offeredSurplus) {
        recorder.dispatch({ type: "offerSurplus" });
        offeredSurplus = true;
      } else {
        recorder.dispatch({ type: "keepSurplus", resource: "insight" });
      }
      continue;
    }
    if (state === "beginTurn") {
      recorder.dispatch({ type: "presentTask" });
      continue;
    }
    if (state === "resourceWindow") {
      const activeId = recorder.getSession().teams[recorder.getSession().activeTeamIndex]!.id;
      // Amplify matthew's first eligible task once matthew holds courage —
      // manufactures a surplus to offer.
      if (
        activeId === "matthew" &&
        !offeredSurplus &&
        recorder.getCurrentTaskPublic()?.canAmplify &&
        recorder.getTeam("matthew")!.resources.courage >= 1
      ) {
        recorder.dispatch({ type: "spendCourage" });
      }
      recorder.dispatch({ type: "acceptAnswer" });
      continue;
    }
    if (state === "awaitingAnswer") {
      recorder.dispatch({ type: "reveal" });
      continue;
    }
    if (state === "answerReveal") {
      recorder.dispatch({ type: "rule", result: "correct" });
      continue;
    }
    if (state === "recoverDecision") {
      recorder.dispatch({ type: "declineRecover" });
      continue;
    }
    if (state === "teachingReveal") {
      recorder.dispatch({ type: "finishTeaching" });
      continue;
    }
    throw new Error(`P3 driver: unhandled state "${state}"`);
  }
  if (steps >= MAX_STEPS) throw new Error("P3 driver: did not terminate");
  expect(recorder.getState()).toBe("gameSummary");
  expect(offeredSurplus).toBe(true);
  expect(sharedGift).toBe(true);

  return { recorder, save: buildSave(recorder, pack, seed), pack };
}

describe("P3 — RecordingEngine records only committed commands", () => {
  it("an illegal command is not recorded", () => {
    const pack = offerablePack();
    const deck = buildDeck(pack, SEED);
    const inner = createEngine({
      journey: testJourney,
      packs: [pack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: createRng(SEED),
      taskSource: deck,
    });
    const recorder = new RecordingEngine({ engine: inner });
    recorder.dispatch({ type: "startGame" });
    expect(recorder.getCommands()).toHaveLength(1);

    // "reveal" is illegal from "ready"/"beginTurn" — presentTask hasn't run.
    expect(() => recorder.dispatch({ type: "reveal" })).toThrow(IllegalCommandError);
    expect(recorder.getCommands()).toHaveLength(1); // unchanged
  });

  it("calls onCommitted only for committed commands", () => {
    const pack = offerablePack();
    const deck = buildDeck(pack, SEED);
    const inner = createEngine({
      journey: testJourney,
      packs: [pack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: createRng(SEED),
      taskSource: deck,
    });
    const committed: Command[] = [];
    const recorder = new RecordingEngine({ engine: inner, onCommitted: (c) => committed.push(c) });
    recorder.dispatch({ type: "startGame" });
    expect(() => recorder.dispatch({ type: "reveal" })).toThrow();
    expect(committed).toEqual([{ type: "startGame" }]);
  });
});

describe("P3 — rebuildFromSave", () => {
  it("replays a full game (fork, offering, community event, share, undo) to an identical session", () => {
    const { recorder, save, pack } = playRecordedGame();
    const result = rebuildFromSave(save, { journeys: [testJourney], packs: [pack] });
    if ("error" in result) throw new Error(`rebuild failed: ${result.error}`);
    // Event-log timestamps are re-stamped at replay time (log() uses
    // `new Date()`); everything else — including every log line's TEXT and
    // order — must match exactly.
    const strip = (s: ReturnType<typeof recorder.getSession>) => ({
      ...s,
      eventLog: s.eventLog.map((e) => e.text),
    });
    expect(strip(result.engine.getSession())).toEqual(strip(recorder.getSession()));
    expect(result.engine.getState()).toBe("gameSummary");
  });

  it("a changed pack version is refused", () => {
    const { save, pack } = playRecordedGame();
    const mutatedPack = { ...pack, version: "9.9.9" };
    const result = rebuildFromSave(save, { journeys: [testJourney], packs: [mutatedPack] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("content changed");
  });

  it("a command list with one extra bogus command is refused with the command index in the message", () => {
    const { save, pack } = playRecordedGame();
    const tampered: SavedGame = { ...save, commands: [...save.commands, { type: "presentTask" }] };
    const result = rebuildFromSave(tampered, { journeys: [testJourney], packs: [pack] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe(`replay diverged at command ${save.commands.length}`);
  });

  it("a tampered snapshot is refused", () => {
    const { save, pack } = playRecordedGame();
    const tampered: SavedGame = {
      ...save,
      snapshot: { ...save.snapshot, roundNumber: save.snapshot.roundNumber + 99 },
    };
    const result = rebuildFromSave(tampered, { journeys: [testJourney], packs: [pack] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("saved game does not match its record");
  });

  it("an unknown journey id is refused as content changed", () => {
    const { save, pack } = playRecordedGame();
    const result = rebuildFromSave(save, { journeys: [], packs: [pack] });
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("content changed");
  });
});

describe("PHASE9_SPEC Group N1 — the drawn community task survives a save-and-replay", () => {
  it("getCommunityTaskPublic()?.id matches after replay, saved mid-event (before resolve)", () => {
    const pack = offerablePack();
    const deck = buildDeck(pack, SEED);
    const inner = createEngine({
      journey: testJourney,
      packs: [pack],
      teams: twoTeams,
      turnTaskLimit: 3,
      rng: createRng(SEED),
      taskSource: deck,
    });
    const recorder = new RecordingEngine({ engine: inner });
    recorder.dispatch({ type: "startGame" });

    let steps = 0;
    while (recorder.getState() !== "communityEvent" && steps++ < 200) {
      const state = recorder.getState();
      if (state === "beginTurn") recorder.dispatch({ type: "presentTask" });
      else if (state === "resourceWindow") recorder.dispatch({ type: "acceptAnswer" });
      else if (state === "awaitingAnswer") recorder.dispatch({ type: "reveal" });
      else if (state === "answerReveal") recorder.dispatch({ type: "rule", result: "correct" });
      else if (state === "teachingReveal") recorder.dispatch({ type: "finishTeaching" });
      else if (state === "landmarkIntroduction") recorder.dispatch({ type: "beginCommunityEvent" });
      else throw new Error(`N1 driver: unhandled state "${state}"`);
    }
    expect(recorder.getState()).toBe("communityEvent");
    const communityTaskId = recorder.getCommunityTaskPublic()?.id;
    expect(communityTaskId).toBeDefined();

    const save = buildSave(recorder, pack, SEED);
    const result = rebuildFromSave(save, { journeys: [testJourney], packs: [pack] });
    if ("error" in result) throw new Error(`rebuild failed: ${result.error}`);
    expect(result.engine.getState()).toBe("communityEvent");
    expect(result.engine.getCommunityTaskPublic()?.id).toBe(communityTaskId);
  });
});
