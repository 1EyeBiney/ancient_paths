// Shared App-level harness for Phase 5 groups: builds a real App against
// a synthetic pack (or any content), walks the setup screen by mouse to
// reach "playing", and offers keyboard/mouse drivers that mirror U10's.
// Every harness exposes dispose() — call it in afterEach so the
// presenter's idle interval never outlives its test.

import { expect } from "vitest";
import { App, type AppOptions } from "../../src/ui/app";
import type { ContentPack, Journey, Task } from "../../src/content/schemas";
import { testJourney, bigPack } from "../session/fixtures";

export interface AppHarness {
  app: App;
  root: HTMLElement;
  tick: (() => void) | null;
  clock: { now: number };
  dispose: () => void;
}

export function keydownOn(target: EventTarget, key: string, extra: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}

export function pressEnterOnFocused(el: HTMLElement): void {
  el.focus();
  keydownOn(el, "Enter");
}

export function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!found) throw new Error(`appHarness: no button "${text}"`);
  return found;
}

export function makeApp(
  opts: { journeys?: Journey[]; packs?: ContentPack[]; extra?: Partial<AppOptions> } = {},
): AppHarness {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const clock = { now: 0 };
  let tick: (() => void) | null = null;
  const app = new App({
    root,
    journeys: opts.journeys ?? [testJourney],
    packs: opts.packs ?? [bigPack()],
    presenterTimer: {
      now: () => clock.now,
      setIntervalFn: (cb) => {
        tick = cb;
        return 1;
      },
      clearIntervalFn: () => {},
      idleThresholdMs: 12_000,
    },
    ...opts.extra,
  });
  return {
    app,
    root,
    get tick() {
      return tick;
    },
    clock,
    dispose: () => {
      app.dispose();
      root.remove();
    },
  };
}

/** Startup -> setup -> playing, by mouse, accepting every first option. */
export function beginByMouse(h: AppHarness, teamNames: [string, string] = ["Alpha", "Beta"]): void {
  findButtonByText(h.root, "New game").click();
  finishSetupByMouse(h, teamNames);
}

/** The rest of setup -> playing, by mouse, assuming the setup screen is
 * ALREADY showing (New game already clicked) — lets a test interact with
 * a setup control (e.g. Map style) before finishing the wizard. */
export function finishSetupByMouse(h: AppHarness, teamNames: [string, string] = ["Alpha", "Beta"]): void {
  const { root } = h;
  root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
  root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();
  const inputs = root.querySelectorAll<HTMLInputElement>("#team-names input");
  inputs[0]!.value = teamNames[0];
  inputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
  inputs[1]!.value = teamNames[1];
  inputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
  root.querySelector<HTMLElement>('[aria-label="Duration"] [role="option"]')!.click();
  root.querySelector<HTMLElement>('[aria-label="Pace"] [role="option"]')!.click();
  root.querySelector<HTMLElement>('[aria-label="Difficulty"] [role="option"]')!.click();
  findButtonByText(root, "Begin journey").click();
}

/** One keyboard step for the current engine state (U10's script). Returns false at gameSummary. */
export function keyboardStep(h: AppHarness): boolean {
  const { app, root } = h;
  const engine = app.getEngine()!;
  for (const team of engine.getSession().teams) {
    while (engine.getPendingChoicesForTeam(team.id) > 0) {
      const b = root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
      if (!b) break;
      pressEnterOnFocused(b);
    }
  }
  const state = engine.getState();
  const list = (label: string) => root.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  switch (state) {
    case "gameSummary":
      return false;
    case "ready":
    case "beginTurn":
    case "resourceWindow":
    case "awaitingAnswer":
    case "teachingReveal":
    case "landmarkIntroduction":
      keydownOn(window, "Enter");
      return true;
    case "forkChoice":
      pressEnterOnFocused(list("Route choices")!);
      return true;
    case "answerReveal":
      keydownOn(window, "c");
      return true;
    case "recoverDecision":
      pressEnterOnFocused(list("Recovery choice")!);
      return true;
    case "surplusDecision":
      pressEnterOnFocused(list("Surplus choice")!);
      return true;
    case "communityEvent": {
      const pledge = list("Pledge choice");
      const actions = app.getLastRender()?.actions ?? [];
      if (pledge) {
        pledge.focus();
        keydownOn(pledge, "ArrowUp");
        keydownOn(pledge, "Enter");
      } else if (actions.some((a) => a.id === "ruleCorrect")) {
        keydownOn(window, "c");
      } else {
        keydownOn(window, "Enter");
      }
      return true;
    }
    default:
      throw new Error(`appHarness.keyboardStep: unhandled state "${state}"`);
  }
}

/** The V2 synchronization assertion, journey-agnostic so V8 can reuse it
 * against the real Jerusalem-to-Rome journey. */
export function assertAudienceMatchesEngine(h: AppHarness, tasksById: Map<string, Task>, journey: Journey): void {
  const engine = h.app.getEngine()!;
  const session = engine.getSession();
  const state = engine.getState();
  const audience = h.root.querySelector<HTMLElement>("#audience-view")!;
  expect(audience.hidden).toBe(false);

  const active = session.teams[session.activeTeamIndex]!;
  const nowPlaying = audience.querySelector<HTMLElement>('[data-audience="now-playing"]')!;
  if (state !== "ready") {
    expect(nowPlaying.textContent).toContain(active.name);
    const milestone = journey.milestones.find((m) => m.id === active.currentMilestoneId)!.name;
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
      // A multiple-choice task legitimately lists the answer among its
      // options pre-reveal (the schema requires it); the guarantee is that
      // no REVEAL panel exists and nothing marks which option is right.
      expect(audience.querySelector('[data-audience="reveal"]')).toBeNull();
      if (!publicTask.activeVariant.options) expect(audience.textContent).not.toContain(answer);
    }
    if (state === "awaitingAnswer" || state === "answerReveal") {
      expect(audience.querySelector('[data-audience="prompt"]')!.textContent).toBe(publicTask.activeVariant.prompt);
    }
  }
}

/** Drives to gameSummary; calls `afterEach` after every step for assertions. */
export function driveToSummary(h: AppHarness, afterEach?: () => void, maxSteps = 600): number {
  let steps = 0;
  while (steps < maxSteps && keyboardStep(h)) {
    steps++;
    afterEach?.();
  }
  if (steps >= maxSteps) throw new Error("appHarness.driveToSummary: did not terminate");
  return steps;
}
