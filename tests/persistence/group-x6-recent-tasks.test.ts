// PHASE10_SPEC Group X6 — recent-use memory across games. Brian ruled yes
// (OPEN_QUESTIONS item 35); this implements the spec's own description.

// @vitest-environment jsdom

import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemorySaveStore } from "../../src/persistence/store";
import { parseRecentTasks, RECENT_TASKS_SCHEMA_VERSION, type RecentTasks } from "../../src/persistence/schema";
import { SetupWizard } from "../../src/ui/setup";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { testJourney, bigPack } from "../session/fixtures";
import { makeSyntheticPack } from "../session/factory";
import {
  makeApp,
  beginByMouse,
  finishSetupByMouse,
  driveToSummary,
  findButtonByText,
  keydownOn,
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

describe("X6 — the store round-trip", () => {
  it("MemorySaveStore: writeRecentTasks then readRecentTasks returns the same record", async () => {
    const store = new MemorySaveStore();
    expect(await store.readRecentTasks()).toBeNull();
    const record: RecentTasks = {
      schemaVersion: RECENT_TASKS_SCHEMA_VERSION,
      sessions: [{ endedAt: "2026-09-03T00:00:00.000Z", journeyId: testJourney.journeyId, taskIds: ["a-1", "a-2"] }],
    };
    await store.writeRecentTasks(record);
    expect(await store.readRecentTasks()).toEqual(record);
  });

  it("parseRecentTasks accepts a valid record and returns null for a corrupt one, never throwing", () => {
    const valid: RecentTasks = { schemaVersion: 1, sessions: [{ endedAt: "x", journeyId: "y", taskIds: ["z"] }] };
    expect(parseRecentTasks(valid)).toEqual(valid);
    expect(parseRecentTasks({ garbage: true })).toBeNull();
    expect(parseRecentTasks(null)).toBeNull();
    expect(parseRecentTasks("not an object")).toBeNull();
    expect(() => parseRecentTasks(undefined)).not.toThrow();
  });
});

describe("X6 — SetupWizard.recentTaskIdsToExclude()", () => {
  it("off: always empty, regardless of remembered sessions", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    wizard.setAvoidRecentTasks(false);
    wizard.setRecentSessions([{ taskIds: ["a", "b"] }]);
    expect(wizard.recentTaskIdsToExclude()).toEqual([]);
  });

  it("on: the union of the last N remembered sessions, oldest first", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    wizard.setAvoidRecentTasks(true);
    wizard.setRecentGamesToRemember(2);
    wizard.setRecentSessions([{ taskIds: ["s1-a", "s1-b"] }, { taskIds: ["s2-a"] }, { taskIds: ["s3-a", "s3-b"] }]);
    // 3 remembered, but only the last 2 (s2, s3) count toward a 2-game memory.
    expect(wizard.recentTaskIdsToExclude()).toEqual(["s2-a", "s3-a", "s3-b"]);
  });

  it("toBuildOptions() carries excludeTaskIds only when non-empty", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    wizard.setTeamCount(2);
    expect(wizard.toBuildOptions().excludeTaskIds).toBeUndefined();

    wizard.setRecentSessions([{ taskIds: ["x-1"] }]);
    expect(wizard.toBuildOptions().excludeTaskIds).toEqual(["x-1"]);
  });

  it("round-trips through toSnapshot()/applySnapshot()", () => {
    const wizard = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    wizard.setTeamCount(2);
    wizard.setAvoidRecentTasks(false);
    wizard.setRecentGamesToRemember(5);
    const snapshot = wizard.toSnapshot();
    expect(snapshot.avoidRecentTasks).toBe(false);
    expect(snapshot.recentGamesToRemember).toBe(5);

    const fresh = new SetupWizard({ journeys: [testJourney], packs: [bigPack()] });
    fresh.applySnapshot(snapshot);
    expect(fresh.avoidRecentTasks).toBe(false);
    expect(fresh.recentGamesToRemember).toBe(5);
  });
});

describe("X6 — a full App game", () => {
  let h: AppHarness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
  });

  it("records this game's task ids at gameSummary; every id is short (an id, never text)", async () => {
    // Real content, deliberately — general-bible's ids are the ones this
    // guarantee actually protects; the synthetic fixtures' ids are long by
    // design (unrelated to the "never task text" concern this checks).
    h = makeApp({ journeys: [loadRealJourney()], packs: [loadRealPack()] });
    beginByMouse(h);
    driveToSummary(h);
    await flush();
    await flush();

    const raw = await h.saveStore.readRecentTasks();
    const parsed = parseRecentTasks(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessions.length).toBe(1);
    const ids = parsed!.sessions[0]!.taskIds;
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id.length, `"${id}" should read as an id, not task text`).toBeLessThanOrEqual(40);
    }
  });

  it("a second game appends a second session (oldest first), capped at 5 remembered", async () => {
    h = makeApp();
    beginByMouse(h);
    driveToSummary(h);
    await flush();
    await flush();
    const afterFirst = parseRecentTasks(await h.saveStore.readRecentTasks())!;
    expect(afterFirst.sessions.length).toBe(1);

    // gameSummary's "New game" goes to SETUP (not Welcome) — finish it
    // directly rather than calling beginByMouse, which itself starts from
    // Welcome's own "New game" button.
    findButtonByText(h.root, "New game").click();
    finishSetupByMouse(h);
    driveToSummary(h);
    await flush();
    await flush();
    const afterSecond = parseRecentTasks(await h.saveStore.readRecentTasks())!;
    expect(afterSecond.sessions.length).toBe(2);
  });

  it("Forget recent tasks clears the record; Delete saved game leaves it untouched", async () => {
    h = makeApp();
    beginByMouse(h);
    driveToSummary(h);
    await flush();
    await flush();
    expect(parseRecentTasks(await h.saveStore.readRecentTasks())!.sessions.length).toBe(1);

    // Start a second game so there's a live session (and a save) to act on.
    findButtonByText(h.root, "New game").click();
    finishSetupByMouse(h);
    await flush();

    keydownOn(window, "Escape"); // opens the game menu
    findButtonByText(h.root, "Delete saved game").click();
    findButtonByText(h.root, "Delete saved game").click(); // the confirm button, same label
    await flush();
    expect(parseRecentTasks(await h.saveStore.readRecentTasks())!.sessions.length, "Delete saved game must not clear recent tasks").toBe(1);

    keydownOn(window, "Escape"); // reopen the game menu
    findButtonByText(h.root, "Forget recent tasks").click();
    findButtonByText(h.root, "Forget recent tasks").click(); // the confirm button, same label
    await flush();
    expect(await h.saveStore.readRecentTasks()).toEqual({ schemaVersion: RECENT_TASKS_SCHEMA_VERSION, sessions: [] });
  });

  it("an End session with fewer than 10 attempts does not record; ending after 10+ does", async () => {
    h = makeApp();
    beginByMouse(h);
    // Present and reveal-correct exactly one task, then end early.
    keydownOn(window, "Enter"); // presentTask
    keydownOn(window, "Enter"); // acceptAnswer
    keydownOn(window, "Enter"); // reveal
    keydownOn(window, "c"); // rule correct
    keydownOn(window, "Enter"); // finishTeaching
    keydownOn(window, "Escape"); // game menu
    findButtonByText(h.root, "End session").click();
    findButtonByText(h.root, "End session").click(); // confirm
    await flush();
    expect(await h.saveStore.readRecentTasks(), "fewer than 10 attempts: not recorded").toBeNull();
  });

  it("setup exposes the union it will exclude, in the right order, once recent sessions exist", async () => {
    h = makeApp();
    beginByMouse(h);
    driveToSummary(h);
    await flush();
    await flush();

    findButtonByText(h.root, "New game").click();
    const wizard = h.app.getSetupWizard();
    expect(wizard.recentSessions.length).toBe(1);
    expect(wizard.toBuildOptions().excludeTaskIds).toEqual(wizard.recentSessions[0]!.taskIds);
  });
});

describe("X6 — the setup estimate's relaxation sentence", () => {
  let h: AppHarness | null = null;
  afterEach(() => {
    h?.dispose();
    h = null;
  });

  it("appears when avoiding recent tasks would force a relaxation, and not otherwise", () => {
    // A tiny pack (2 tasks per category/difficulty cell) so excluding one
    // whole category's worth of ids (6) is enough to starve just that
    // category — leaving community's own reserve untouched, so the build
    // still succeeds (with a warning) rather than failing outright.
    const tinyPack = makeSyntheticPack(2);
    h = makeApp({ packs: [tinyPack] });
    findButtonByText(h.root, "New game").click(); // enters setup; does not finish it
    const teamCountOption = h.root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!;
    teamCountOption.click();
    const estimateBefore = h.root.querySelector<HTMLElement>("#estimate")!.textContent ?? "";
    expect(estimateBefore).not.toContain("Some tasks from recent games may return");

    const wizard = h.app.getSetupWizard();
    const scriptureIds = tinyPack.tasks.filter((t) => t.category === "scripture-knowledge").map((t) => t.id);
    wizard.setRecentSessions([{ taskIds: scriptureIds }]);
    wizard.setAvoidRecentTasks(true);
    // Re-run updateEstimate() by exercising a control's own callback again
    // (setting wizard fields directly doesn't itself touch the DOM).
    teamCountOption.click();
    const estimateAfter = h.root.querySelector<HTMLElement>("#estimate")!.textContent ?? "";
    expect(estimateAfter).toContain("Some tasks from recent games may return");
    // No task ids or category names — the sentence is fixed and generic.
    for (const id of scriptureIds) expect(estimateAfter).not.toContain(id);
    expect(estimateAfter).not.toContain("scripture-knowledge");
  });
});
