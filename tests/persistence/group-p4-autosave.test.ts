// @vitest-environment jsdom
// PHASE8_SPEC Group P4 — autosave. After beginJourney and after every
// committed command, App saves to its SaveStore; saves are coalesced (at
// most one in flight); a failing store announces once and stops trying;
// an illegal (rejected) command causes no save.

import { describe, expect, it, afterEach } from "vitest";
import { makeApp, beginByMouse, type AppHarness } from "../ui/appHarness";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("P4 — autosave", () => {
  it("beginJourney produces the first save; every committed command produces exactly one more, with commands.length growing by one each time", async () => {
    h = makeApp();
    beginByMouse(h);
    await flush();
    expect(h.saveStore.writes).toHaveLength(1);
    expect(h.saveStore.writes[0]!.commands).toEqual([]);

    const engine = h.app.getEngine()!;

    engine.dispatch({ type: "startGame" });
    await flush();
    expect(h.saveStore.writes).toHaveLength(2);
    expect(h.saveStore.writes.at(-1)!.commands).toHaveLength(1);
    expect(h.saveStore.writes.at(-1)!.snapshot).toEqual(engine.getSession());

    engine.dispatch({ type: "presentTask" });
    await flush();
    expect(h.saveStore.writes).toHaveLength(3);
    expect(h.saveStore.writes.at(-1)!.commands).toHaveLength(2);
    expect(h.saveStore.writes.at(-1)!.snapshot).toEqual(engine.getSession());
  });

  it("an illegal command (rejected by the engine) causes no save", async () => {
    h = makeApp();
    beginByMouse(h);
    await flush();
    const engine = h.app.getEngine()!;
    engine.dispatch({ type: "startGame" });
    await flush();
    const before = h.saveStore.writes.length;

    // "reveal" is illegal from "beginTurn" — presentTask hasn't run yet.
    expect(() => engine.dispatch({ type: "reveal" })).toThrow();
    await flush();
    expect(h.saveStore.writes.length).toBe(before);
  });

  it("a failing store announces once, politely, and never again", async () => {
    h = makeApp();
    beginByMouse(h);
    await flush();
    const engine = h.app.getEngine()!;

    h.saveStore.failNextSave();
    engine.dispatch({ type: "startGame" });
    await flush();
    const afterFirstFailure = h.app.getPresenterLog();
    expect(
      afterFirstFailure.some(
        (e) => e.visual === "Saving is unavailable in this browser. Play continues, but this game cannot be resumed.",
      ),
    ).toBe(true);
    const writesAfterFailure = h.saveStore.writes.length;

    // A second failure (deliberately forced again) must NOT re-announce, and
    // Group P4 says the store stops trying after the first failure — no
    // further save attempt at all.
    h.saveStore.failNextSave();
    engine.dispatch({ type: "presentTask" });
    await flush();
    const finalLog = h.app.getPresenterLog();
    expect(
      finalLog.filter(
        (e) => e.visual === "Saving is unavailable in this browser. Play continues, but this game cannot be resumed.",
      ),
    ).toHaveLength(1);
    expect(h.saveStore.writes.length).toBe(writesAfterFailure); // no further attempt
  });
});
