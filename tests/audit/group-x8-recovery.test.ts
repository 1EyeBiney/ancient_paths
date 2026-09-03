// @vitest-environment jsdom
// PHASE10_SPEC Group X8 — error-recovery matrix (§23.7). Real journey +
// general-bible pack (blind: ids/categories only, never task text). For
// four of the five mistakes a host can make (wrong route, wrong ruling,
// wrong resource spent, advanced too early), Ctrl+Z's arm press announces
// what will be reversed and names it in plain words, and the confirm press
// restores the exact prior session and screen heading — proven both as a
// plain in-memory undo and as a mistake that was made, autosaved, reloaded
// through the real Resume flow (which uses rebuildFromSave internally),
// and only THEN undone. The fifth mistake (skipped narration) is a
// different recovery shape entirely — N/R/L, not Ctrl+Z — and gets its own
// test.

import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import type { GameState, PlaySession } from "../../src/engine/types";
import { MemorySaveStore } from "../../src/persistence/store";
import { FakeAudioBackend } from "../../src/ui/audio/backend";
import {
  makeApp,
  beginByMouse,
  keyboardStep,
  keydownOn,
  pressEnterOnFocused,
  findButtonByText,
  type AppHarness,
} from "../ui/appHarness";

function loadRealPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}
function loadRealJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function currentHeading(h: AppHarness): string | null {
  return h.root.querySelector('[aria-label="Host controls"] h2')?.textContent ?? null;
}

/** Advances `h` by ordinary "correct" play (keyboardStep's own script) until
 * the engine reaches `target`, checking BEFORE each step so a step is never
 * taken FROM the target state itself — the caller always gets to perform
 * its own (possibly mistaken) action there instead of keyboardStep's
 * default one. */
function driveUntilState(h: AppHarness, target: GameState, maxSteps = 400): void {
  let steps = 0;
  while (h.app.getEngine()!.getState() !== target) {
    if (steps >= maxSteps) throw new Error(`group-x8: did not reach "${target}" within ${maxSteps} steps`);
    if (!keyboardStep(h)) throw new Error(`group-x8: reached gameSummary before "${target}"`);
    steps++;
  }
}

function eventLogTexts(session: PlaySession): string[] {
  return session.eventLog.map((e) => e.text);
}

/** "Spent the wrong resource" doesn't touch `PlaySession` at all — assist/
 * amplify only flip the in-progress task's active variant (resources are
 * deducted at ruling time, not at spend time); that's tracked on the
 * engine's internal `currentTask`, not on `session`, so `getSession()`
 * alone shows "no visual difference" for this one mistake even though the
 * mistake (and its later undo) are both real. Folding the active variant
 * kind into the comparable snapshot makes the "did this change"/"did undo
 * revert it" checks meaningful for every scenario, not just the three that
 * happen to touch session fields directly. */
function comparableSnapshot(h: AppHarness): { session: Readonly<PlaySession>; variantKind: string | null } {
  const engine = h.app.getEngine()!;
  return { session: engine.getSession(), variantKind: engine.getCurrentTaskPublic()?.activeVariant.kind ?? null };
}

/** `Array.prototype.findLast` needs es2023 lib (not this project's
 * target) — a plain reverse scan instead. */
function findLastPresented(
  log: ReturnType<AppHarness["app"]["getPresenterLog"]>,
  predicate: (entry: ReturnType<AppHarness["app"]["getPresenterLog"]>[number]) => boolean,
): ReturnType<AppHarness["app"]["getPresenterLog"]>[number] | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    if (predicate(log[i]!)) return log[i];
  }
  return undefined;
}

// Cost lookup only (never fed to a harness) — task/variant costs are
// content-authored (a `{resource, amount}` per assisted/amplified variant;
// extra-clue is a flat `insightEffectCost`, currently 1), NOT implied by a
// spend button's mere presence: `PublicTask.canAssist`/`canAmplify`/
// `canExtraClue` only reflect whether the task's CONTENT supports the
// action, not whether the team can currently afford it (src/engine/
// engine.ts's getCurrentTaskPublic). A team with 0 Provision still sees a
// "Spend Provision" button; clicking it throws IllegalCommandError inside
// dispatch(), which is swallowed (RecordingEngine only records commands
// that didn't throw) — silently a no-op from the test's point of view.
const COST_LOOKUP_PACK = loadRealPack();
const INSIGHT_EFFECT_COST = 1;

/** The one spend action (button + resource type + amount) the ACTIVE
 * team can actually afford right now, or null if none. */
function affordableSpend(h: AppHarness): { actionId: string; resource: "insight" | "provision" | "courage"; amount: number } | null {
  const engine = h.app.getEngine()!;
  const publicTask = engine.getCurrentTaskPublic();
  if (!publicTask) return null;
  const task = COST_LOOKUP_PACK.tasks.find((t) => t.id === publicTask.id);
  if (!task) return null;
  const session = engine.getSession();
  const team = session.teams[session.activeTeamIndex]!;

  if (publicTask.canAssist && task.assistedVariant && team.resources[task.assistedVariant.cost.resource] >= task.assistedVariant.cost.amount) {
    return { actionId: "spendProvisionAssist", resource: task.assistedVariant.cost.resource, amount: task.assistedVariant.cost.amount };
  }
  if (publicTask.canAmplify && task.amplifiedVariant && team.resources[task.amplifiedVariant.cost.resource] >= task.amplifiedVariant.cost.amount) {
    return { actionId: "spendCourageAmplify", resource: task.amplifiedVariant.cost.resource, amount: task.amplifiedVariant.cost.amount };
  }
  if (publicTask.canExtraClue && team.resources.insight >= INSIGHT_EFFECT_COST) {
    return { actionId: "spendInsightExtraClue", resource: "insight", amount: INSIGHT_EFFECT_COST };
  }
  return null;
}

/** "Spent the wrong resource" needs a team that actually HAS a spendable
 * resource. `startingResources` (a test-only AppOptions override) can't be
 * used for this scenario because it only seeds the LIVE engine — the
 * save/reload variant below replays through `rebuildFromSave`, which has no
 * such override, so a game that started with it would come back from
 * replay with different (zero) resources and fail the "exact restore"
 * check for a reason that has nothing to do with undo. Earning resources
 * the normal way (DEFAULTS.stageCompletionReward on a real success) keeps
 * both variants honest. */
function driveToSpendableResourceWindow(h: AppHarness): void {
  driveUntilState(h, "resourceWindow");
  let attempts = 0;
  while (!affordableSpend(h)) {
    if (attempts >= 150) throw new Error("group-x8: no team could ever afford a spend within the search budget");
    if (!keyboardStep(h)) throw new Error("group-x8: reached gameSummary before any team could afford a spend");
    driveUntilState(h, "resourceWindow");
    attempts++;
  }
}

interface MistakeScenario {
  name: string;
  driveTo: (h: AppHarness) => void;
  makeMistake: (h: AppHarness) => void;
}

const SCENARIOS: MistakeScenario[] = [
  {
    name: "chose the wrong route",
    driveTo: (h) => driveUntilState(h, "forkChoice"),
    makeMistake: (h) => pressEnterOnFocused(h.root.querySelector<HTMLElement>('[aria-label="Route choices"]')!),
  },
  {
    name: "marked the wrong ruling",
    driveTo: (h) => driveUntilState(h, "answerReveal"),
    makeMistake: () => keydownOn(window, "c"),
  },
  {
    name: "spent the wrong resource",
    driveTo: driveToSpendableResourceWindow,
    makeMistake: (h) => {
      // Spend buttons have no dedicated global hotkey (unlike Enter/C/I,
      // which the app's own keyboard ladder maps to the current screen's
      // primary/ruling action) — a real keyboard user reaches them by Tab
      // then native Enter/Space, which jsdom doesn't synthesize from a bare
      // KeyboardEvent. A direct click is the correct way to drive one here,
      // matching group-x7b-status.test.ts's own established pattern.
      const spend = affordableSpend(h);
      if (!spend) throw new Error("group-x8: driveTo should have guaranteed an affordable spend here");
      const btn = h.root.querySelector<HTMLButtonElement>(`button[data-action-id="${spend.actionId}"]`);
      if (!btn) throw new Error(`group-x8: no button for action "${spend.actionId}"`);
      btn.click();
    },
  },
  {
    name: "advanced too early (Present task)",
    driveTo: (h) => driveUntilState(h, "beginTurn"),
    makeMistake: () => keydownOn(window, "Enter"),
  },
];

let harnesses: AppHarness[] = [];
afterEach(() => {
  for (const h of harnesses) h.dispose();
  harnesses = [];
});

function newHarness(extra: Record<string, unknown> = {}): AppHarness {
  const h = makeApp({ journeys: [loadRealJourney()], packs: [loadRealPack()], extra });
  harnesses.push(h);
  return h;
}

describe("X8 — error-recovery matrix", () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      it("Ctrl+Z arms with a plain-words announcement and confirm restores the exact prior session and screen", () => {
        const h = newHarness();
        beginByMouse(h);
        scenario.driveTo(h);

        const engine = h.app.getEngine()!;
        expect(engine.canUndo(), "nothing to undo yet — test setup issue").toBe(true);
        const preMistake = comparableSnapshot(h);
        const preMistakeHeading = currentHeading(h);

        scenario.makeMistake(h);
        const mistakeSnapshot = comparableSnapshot(h);
        const mistakeSession = mistakeSnapshot.session;
        expect(mistakeSnapshot, `${scenario.name}: session/variant should have changed`).not.toEqual(preMistake);
        const reversedDescription = mistakeSession.eventLog.at(-1)?.text ?? "the last action";

        keydownOn(window, "z", { ctrlKey: true }); // arm
        const armEntry = h.app.getPresenterLog().at(-1)!;
        expect(armEntry.visual, `${scenario.name}: arm wording`).toContain("Undo will reverse:");
        expect(armEntry.visual, `${scenario.name}: arm should name the reversed action`).toContain(reversedDescription);
        expect(armEntry.visual, `${scenario.name}: arm should ask for confirmation`).toContain("Press again to confirm");
        // Arming alone must not have changed anything yet.
        expect(comparableSnapshot(h), `${scenario.name}: arm press changed state`).toEqual(mistakeSnapshot);

        keydownOn(window, "z", { ctrlKey: true }); // confirm
        expect(comparableSnapshot(h), `${scenario.name}: confirm should restore the exact prior session/variant`).toEqual(
          preMistake,
        );
        expect(currentHeading(h), `${scenario.name}: confirm should restore the prior screen heading`).toBe(
          preMistakeHeading,
        );

        const confirmEntry = findLastPresented(h.app.getPresenterLog(), (e) => e.visual.includes("Undo confirmed:"));
        expect(confirmEntry, `${scenario.name}: no "Undo confirmed" announcement (the game log)`).toBeDefined();
        expect(confirmEntry!.visual, `${scenario.name}: game log should name the reversed action`).toContain(
          reversedDescription,
        );
      });

      it("a mistake made, saved, reloaded via Resume (rebuildFromSave), then undone still restores", async () => {
        const h1 = newHarness();
        beginByMouse(h1);
        scenario.driveTo(h1);

        const preMistakeSession = h1.app.getEngine()!.getSession();
        const preMistakeHeading = currentHeading(h1);

        scenario.makeMistake(h1);
        await flush(); // let the coalesced autosave land
        const mistakeSession = h1.app.getEngine()!.getSession();
        const reversedDescription = mistakeSession.eventLog.at(-1)?.text ?? "the last action";

        const latestSave = h1.saveStore.writes.at(-1)!;
        const store2 = new MemorySaveStore();
        await store2.save(latestSave);

        const h2 = newHarness({ saveStore: store2 });
        await flush();
        findButtonByText(h2.root, "Resume game").click();
        await flush();

        const resumedEngine = h2.app.getEngine()!;
        expect(resumedEngine.getState(), `${scenario.name}: resumed state should match the saved (post-mistake) state`).toBe(
          mistakeSession.state,
        );
        expect(resumedEngine.getSession().teams, `${scenario.name}: resumed teams should match`).toEqual(
          mistakeSession.teams,
        );
        expect(eventLogTexts(resumedEngine.getSession()), `${scenario.name}: resumed log text should match`).toEqual(
          eventLogTexts(mistakeSession),
        );
        expect(currentHeading(h2), `${scenario.name}: resumed screen heading should match the mistake state`).toBe(
          currentHeading(h1),
        );

        expect(resumedEngine.canUndo(), `${scenario.name}: a resumed game should still be undoable`).toBe(true);
        keydownOn(window, "z", { ctrlKey: true }); // arm
        const armEntry = h2.app.getPresenterLog().at(-1)!;
        expect(armEntry.visual, `${scenario.name}: post-resume arm wording`).toContain("Undo will reverse:");
        keydownOn(window, "z", { ctrlKey: true }); // confirm

        const restored = resumedEngine.getSession();
        // Timestamps are re-stamped on replay (PHASE8_SPEC), so the prior
        // session's own text (not the object) is the real invariant here —
        // matching src/persistence/replay.ts's own comparison strategy.
        expect(restored.teams, `${scenario.name}: post-reload undo should restore the exact prior teams`).toEqual(
          preMistakeSession.teams,
        );
        expect(restored.state, `${scenario.name}: post-reload undo should restore the exact prior state`).toBe(
          preMistakeSession.state,
        );
        expect(eventLogTexts(restored), `${scenario.name}: post-reload undo should restore the exact prior log text`).toEqual(
          eventLogTexts(preMistakeSession),
        );
        expect(currentHeading(h2), `${scenario.name}: post-reload undo should restore the prior screen heading`).toBe(
          preMistakeHeading,
        );

        const confirmEntry = findLastPresented(h2.app.getPresenterLog(), (e) => e.visual.includes("Undo confirmed:"));
        expect(confirmEntry, `${scenario.name}: no "Undo confirmed" announcement after reload (the game log)`).toBeDefined();
        expect(confirmEntry!.visual, `${scenario.name}: post-reload game log should name the reversed action`).toContain(
          reversedDescription,
        );
      });
    });
  }
});

describe("X8 — skipped narration: N repeats-or-explains, R repeats the prompt, L replays or announces the fallback", () => {
  it("drives to a task-audio clip, then exercises N, R, and both branches of L", () => {
    // The shipped general-bible pack currently has zero real audioAssets
    // (CLAUDE.md's Phase 6 status: narration is placeholder, Brian records
    // real clips later) — so no task in it ever sets lastTaskAudio today.
    // To exercise L's "clip exists"/"fails to load" branches at all, this
    // test augments an in-memory copy of the real pack with one synthetic
    // asset on one real audio-listening task (ids/structure stay real;
    // nothing is written back to the committed file). See OPEN_QUESTIONS
    // for the underlying content gap this papers over.
    // Every audio-listening task gets the SAME synthetic asset — the deck
    // draws one at random per seed/session, so pinning the augmentation to
    // a single task id risks that particular task never being drawn in a
    // short 2-team game (SessionDeck only pulls a subset of the pack).
    // Whichever audio-listening task actually comes up, it now has audio.
    const basePack = loadRealPack();
    const assetId = "x8-test-task-audio";
    const fallbackText = "Audio unavailable for this test. The prompt text above still applies.";
    const pack: ContentPack = {
      ...basePack,
      audioAssets: [
        ...(basePack.audioAssets ?? []),
        {
          assetId,
          filePath: "test/x8-fake.mp3",
          assetType: "task-audio",
          transcript: "x8 test transcript",
          durationSeconds: 3,
          replayAllowed: true,
          fallbackText,
          attribution: null,
        },
      ],
      tasks: basePack.tasks.map((t) =>
        t.category === "audio-listening"
          ? {
              ...t,
              audioAsset: assetId,
              // Default maxPlays is 2 (schema comment) — this test needs
              // three: the automatic play on entry, one successful L
              // replay, and one L replay that's made to fail (fallback
              // branch). Schema caps maxPlays at 3, which is exactly enough.
              normalVariant: { ...t.normalVariant, maxPlays: 3 },
            }
          : t,
      ),
    };

    const backend = new FakeAudioBackend();
    const h = makeApp({ journeys: [loadRealJourney()], packs: [pack], extra: { audioBackend: backend } });
    harnesses.push(h);
    beginByMouse(h);

    const engine = h.app.getEngine()!;
    driveUntilState(h, "resourceWindow");
    let attempts = 0;
    while (engine.getCurrentTaskPublic()!.category !== "audio-listening") {
      if (attempts >= 150) throw new Error("group-x8: never drew an audio-listening task within the search budget");
      if (!keyboardStep(h)) throw new Error("group-x8: reached gameSummary before drawing an audio-listening task");
      driveUntilState(h, "resourceWindow");
      attempts++;
    }

    // The task's own prompt audio auto-plays on entry (syncTaskAudioPresentation)
    // and is task-tied — not skippable. Let it finish naturally (as if the
    // room heard the whole thing), which is what actually sets lastTaskAudio
    // for L to replay.
    expect(backend.calls.some((c) => c.method === "playClip" && (c.args[0] as { assetId: string }).assetId === assetId)).toBe(
      true,
    );
    backend.fireEnded();

    // N with nothing currently playing.
    const beforeN = h.app.getPresenterLog().at(-1)!;
    keydownOn(window, "n");
    const afterN = h.app.getPresenterLog().at(-1)!;
    expect(afterN, "N should produce a new announcement").not.toBe(beforeN);
    expect(afterN.visual).toBe("Nothing is playing.");

    // R repeats the prompt (the last announcement standing, unchanged by N
    // since nothing was playing) — not just "any new text", the exact prior
    // entry's own visual.
    keydownOn(window, "r");
    const afterR = h.app.getPresenterLog().at(-1)!;
    expect(afterR.visual, "R should repeat the last announcement").toBe(afterN.visual);

    // L replays the task's audio when a clip exists: a fresh playClip call
    // for the same asset.
    const callsBeforeL1 = backend.calls.length;
    keydownOn(window, "l");
    const replayCalls = backend.calls.slice(callsBeforeL1).filter((c) => c.method === "playClip");
    expect(replayCalls.length, "L should trigger a fresh playClip for the existing task audio").toBe(1);
    expect((replayCalls[0]!.args[0] as { assetId: string }).assetId).toBe(assetId);
    backend.fireEnded();

    // L announces the fallback when the clip fails to load (fake backend).
    backend.failNextLoad();
    keydownOn(window, "l");
    const afterFallback = h.app.getPresenterLog().at(-1)!;
    expect(afterFallback.visual, "L's failed replay should announce the asset's own fallback text").toBe(fallbackText);
  });
});
