// @vitest-environment jsdom
// PHASE5_SPEC Group V2 — audience synchronization: after EVERY step of a
// full keyboard-driven game, the audience view says what the engine says.

import { afterEach, describe, expect, it } from "vitest";
import { makeApp, beginByMouse, driveToSummary, assertAudienceMatchesEngine, type AppHarness } from "./appHarness";
import { bigPack, testJourney } from "../session/fixtures";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("V2 — the audience view matches the engine after every keyboard step", () => {
  it("through a complete game, including reveal timing and prompt persistence", () => {
    const pack = bigPack();
    const tasksById = new Map(pack.tasks.map((t) => [t.id, t]));
    h = makeApp({ packs: [pack] });
    beginByMouse(h);
    assertAudienceMatchesEngine(h, tasksById, testJourney);

    let sawAwaiting = 0;
    let sawReveal = 0;
    const steps = driveToSummary(h, () => {
      assertAudienceMatchesEngine(h!, tasksById, testJourney);
      const state = h!.app.getEngine()!.getState();
      if (state === "awaitingAnswer") sawAwaiting++;
      if (state === "answerReveal") sawReveal++;
    });
    expect(steps).toBeGreaterThan(10);
    expect(sawAwaiting).toBeGreaterThan(0);
    expect(sawReveal).toBeGreaterThan(0);
    expect(h.root.querySelector('[data-audience="summary"]')).not.toBeNull();
  });

  it("is hidden outside play and reappears with a new game", () => {
    h = makeApp();
    const audience = h.root.querySelector<HTMLElement>("#audience-view")!;
    expect(audience.hidden).toBe(true);
    beginByMouse(h);
    expect(audience.hidden).toBe(false);
    expect(audience.querySelector('[data-audience="now-playing"]')!.textContent).toContain("Ready to begin");
  });
});
