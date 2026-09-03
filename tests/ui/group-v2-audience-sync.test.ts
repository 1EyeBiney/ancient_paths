// @vitest-environment jsdom
// PHASE5_SPEC Group V2 — audience synchronization: after EVERY step of a
// full keyboard-driven game, the audience view says what the engine says.

import { afterEach, describe, expect, it } from "vitest";
import { makeApp, beginByMouse, driveToSummary, type AppHarness } from "./appHarness";
import { bigPack, testJourney } from "../session/fixtures";
import type { Task } from "../../src/content/schemas";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

export function assertAudienceMatchesEngine(h: AppHarness, tasksById: Map<string, Task>): void {
  const engine = h.app.getEngine()!;
  const session = engine.getSession();
  const state = engine.getState();
  const audience = h.root.querySelector<HTMLElement>("#audience-view")!;
  expect(audience.hidden).toBe(false);

  const active = session.teams[session.activeTeamIndex]!;
  const nowPlaying = audience.querySelector<HTMLElement>('[data-audience="now-playing"]')!;
  if (state !== "ready") {
    expect(nowPlaying.textContent).toContain(active.name);
    const milestone = testJourney.milestones.find((m) => m.id === active.currentMilestoneId)!.name;
    expect(nowPlaying.textContent).toContain(milestone);
    const required = engine.getEffectiveStageRequirement(active.id)!;
    expect(audience.querySelector('[data-audience="stage-progress"]')!.textContent).toContain(
      `${active.stageSuccesses} of ${required} successes`,
    );
  }

  for (const team of session.teams) {
    const row = audience.querySelector<HTMLElement>(`[data-audience="teams"] tr[data-team-id="${team.id}"]`)!;
    expect(row.querySelector('[data-col="insight"]')!.textContent).toBe(String(team.resources.insight));
    expect(row.querySelector('[data-col="provision"]')!.textContent).toBe(String(team.resources.provision));
    expect(row.querySelector('[data-col="courage"]')!.textContent).toBe(String(team.resources.courage));
  }

  const publicTask = engine.getCurrentTaskPublic();
  if (publicTask) {
    const answer = tasksById.get(publicTask.id)!.answer;
    const revealed = engine.getRevealedAnswer();
    if (revealed) {
      expect(audience.querySelector('[data-audience="reveal"]')!.textContent).toContain(answer);
    } else {
      expect(audience.textContent).not.toContain(answer);
    }
    if (state === "awaitingAnswer" || state === "answerReveal") {
      expect(audience.querySelector('[data-audience="prompt"]')!.textContent).toBe(publicTask.activeVariant.prompt);
    }
  }
}

describe("V2 — the audience view matches the engine after every keyboard step", () => {
  it("through a complete game, including reveal timing and prompt persistence", () => {
    const pack = bigPack();
    const tasksById = new Map(pack.tasks.map((t) => [t.id, t]));
    h = makeApp({ packs: [pack] });
    beginByMouse(h);
    assertAudienceMatchesEngine(h, tasksById);

    let sawAwaiting = 0;
    let sawReveal = 0;
    const steps = driveToSummary(h, () => {
      assertAudienceMatchesEngine(h!, tasksById);
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
