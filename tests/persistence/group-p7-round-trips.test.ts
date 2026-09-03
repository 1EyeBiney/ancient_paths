// @vitest-environment jsdom
// PHASE8_SPEC Group P7 — full round trips. Two full keyboard games (U10's
// script, via the shared appHarness) with a save-and-resume spliced in
// mid-game: once with an undo before the save point, once with the save
// point inside a community event.

import { describe, expect, it, vi, afterEach } from "vitest";
import { MemorySaveStore } from "../../src/persistence/store";
import type { PlaySession } from "../../src/engine/types";
import {
  makeApp,
  beginByMouse,
  keyboardStep,
  keydownOn,
  driveToSummary,
  findButtonByText,
  type AppHarness,
} from "../ui/appHarness";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function rulingLineCount(log: PlaySession["eventLog"]): number {
  return log.filter(
    (e) => /'s answer is ruled (correct|incorrect|skipped):/.test(e.text) || /answers for the room: (correct|incorrect)\.$/.test(e.text),
  ).length;
}

function rulingCueCount(calls: unknown[][]): number {
  return calls.filter((c) => c[0] === "correct" || c[0] === "incorrect" || c[0] === "skipped").length;
}

/** Captures the visible host heading and every team's resource cells, for
 * an immediately-after-Resume DOM comparison against the pre-save render. */
function captureVisibleState(root: HTMLElement, teamIds: string[]) {
  const heading = root.querySelector('[aria-label="Host controls"] h2')!.textContent;
  const teams = teamIds.map((id) => ({
    id,
    insight: root.querySelector(`[data-audience="teams"] tr[data-team-id="${id}"] [data-col="insight"]`)?.textContent,
    provision: root.querySelector(`[data-audience="teams"] tr[data-team-id="${id}"] [data-col="provision"]`)?.textContent,
    courage: root.querySelector(`[data-audience="teams"] tr[data-team-id="${id}"] [data-col="courage"]`)?.textContent,
  }));
  return { heading, teams };
}

let harnesses: AppHarness[] = [];
afterEach(() => {
  for (const h of harnesses) h.dispose();
  harnesses = [];
});

describe("P7 — full round trips", () => {
  it("a save-and-resume WITH an undo before the save point reaches gameSummary identically", async () => {
    const h1 = makeApp();
    harnesses.push(h1);
    const cueSpy1 = vi.spyOn(h1.app.getAudioManager(), "playCue");
    beginByMouse(h1);

    // Drive a few real steps, then a real (press-twice) Ctrl+Z through the
    // app's own undo UI — going through app.ts (not a direct engine
    // dispatch) so its lastRender cache stays in sync, same as any other
    // real action.
    for (let i = 0; i < 4; i++) keyboardStep(h1);
    const engine1 = h1.app.getEngine()!;
    expect(engine1.canUndo()).toBe(true);
    keydownOn(window, "z", { ctrlKey: true }); // arms it
    keydownOn(window, "z", { ctrlKey: true }); // confirms -> dispatches "undo"
    for (let i = 0; i < 4; i++) keyboardStep(h1);
    await flush();

    const preSaveSession = engine1.getSession();
    const preSaveLog = [...preSaveSession.eventLog];
    const preSaveRulingLines = rulingLineCount(preSaveLog);
    const preSaveCues = rulingCueCount(cueSpy1.mock.calls);
    const teamIds = preSaveSession.teams.map((t) => t.id);
    const preSaveVisible = captureVisibleState(h1.root, teamIds);

    const latestSave = h1.saveStore.writes.at(-1)!;
    expect(latestSave.commands.some((c) => c.type === "undo")).toBe(true);

    const store2 = new MemorySaveStore();
    await store2.save(latestSave);
    const h2 = makeApp({ extra: { saveStore: store2 } });
    harnesses.push(h2);
    await flush();
    const cueSpy2 = vi.spyOn(h2.app.getAudioManager(), "playCue");

    findButtonByText(h2.root, "Resume game").click();
    await flush();

    // The resumed engine's session equals the pre-resume session
    // (timestamps re-stamp on replay; text and everything else must match).
    const resumedSession = h2.app.getEngine()!.getSession();
    expect(resumedSession.teams).toEqual(preSaveSession.teams);
    expect(resumedSession.state).toBe(preSaveSession.state);
    expect(resumedSession.eventLog.map((e) => e.text)).toEqual(preSaveLog.map((e) => e.text));

    // Every audience row and the host heading are identical immediately after Resume.
    expect(captureVisibleState(h2.root, teamIds)).toEqual(preSaveVisible);

    driveToSummary(h2, undefined, 800);
    await flush();
    expect(h2.app.getEngine()!.getState()).toBe("gameSummary");

    const finalLog = h2.app.getEngine()!.getSession().eventLog;
    const postResumeLog = finalLog.slice(preSaveLog.length);
    const totalRulingLines = preSaveRulingLines + rulingLineCount(postResumeLog);
    const totalRulingCues = preSaveCues + rulingCueCount(cueSpy2.mock.calls);
    expect(totalRulingCues).toBe(totalRulingLines);

    const finalCommands = h2.saveStore.writes.at(-1)!.commands;
    expect(finalCommands.some((c) => c.type === "chooseGrantedResource")).toBe(true);
  });

  it("a save-and-resume with the save point INSIDE a community event reaches gameSummary identically", async () => {
    const h1 = makeApp();
    harnesses.push(h1);
    const cueSpy1 = vi.spyOn(h1.app.getAudioManager(), "playCue");
    beginByMouse(h1);

    let steps = 0;
    while (h1.app.getEngine()!.getState() !== "communityEvent" && steps < 400) {
      keyboardStep(h1);
      steps++;
    }
    expect(h1.app.getEngine()!.getState()).toBe("communityEvent");
    await flush();

    const preSaveSession = h1.app.getEngine()!.getSession();
    const preSaveLog = [...preSaveSession.eventLog];
    const preSaveRulingLines = rulingLineCount(preSaveLog);
    const preSaveCues = rulingCueCount(cueSpy1.mock.calls);
    const teamIds = preSaveSession.teams.map((t) => t.id);
    const preSaveVisible = captureVisibleState(h1.root, teamIds);

    const latestSave = h1.saveStore.writes.at(-1)!;
    expect(latestSave.snapshot.state).toBe("communityEvent");

    const store2 = new MemorySaveStore();
    await store2.save(latestSave);
    const h2 = makeApp({ extra: { saveStore: store2 } });
    harnesses.push(h2);
    await flush();
    const cueSpy2 = vi.spyOn(h2.app.getAudioManager(), "playCue");

    findButtonByText(h2.root, "Resume game").click();
    await flush();

    const resumedSession = h2.app.getEngine()!.getSession();
    expect(resumedSession.state).toBe("communityEvent");
    expect(resumedSession.teams).toEqual(preSaveSession.teams);
    expect(resumedSession.eventLog.map((e) => e.text)).toEqual(preSaveLog.map((e) => e.text));
    expect(captureVisibleState(h2.root, teamIds)).toEqual(preSaveVisible);

    driveToSummary(h2, undefined, 800);
    await flush();
    expect(h2.app.getEngine()!.getState()).toBe("gameSummary");

    const finalLog = h2.app.getEngine()!.getSession().eventLog;
    const postResumeLog = finalLog.slice(preSaveLog.length);
    const totalRulingLines = preSaveRulingLines + rulingLineCount(postResumeLog);
    const totalRulingCues = preSaveCues + rulingCueCount(cueSpy2.mock.calls);
    expect(totalRulingCues).toBe(totalRulingLines);

    const finalCommands = h2.saveStore.writes.at(-1)!.commands;
    expect(finalCommands.some((c) => c.type === "chooseGrantedResource")).toBe(true);
  });
});
