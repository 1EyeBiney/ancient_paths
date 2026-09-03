// PHASE10_SPEC Group X7 — shared driver for the automated accessibility
// audit. Adapts U10's keyboard-only/mouse-only state machine
// (tests/ui/group-u10-full-game.test.ts) so every X7 sub-group can drive
// a real game against the REAL journey and general-bible pack (blind: ids
// only) while running its own checks after every action, rather than
// re-implementing the drive loop per group.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { App } from "../../src/ui/app";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";

export function loadRealPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

export function loadRealJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

export const MAX_STEPS = 800;

export function keydownOn(target: EventTarget, key: string, extra: Partial<KeyboardEventInit> = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}

export function pressEnterOnFocused(el: HTMLElement): void {
  el.focus();
  keydownOn(el, "Enter");
}

export function typeInto(input: HTMLInputElement, text: string): void {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function cursorListEl(root: HTMLElement, ariaLabel: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${ariaLabel}"]`);
  if (!found) throw new Error(`audit harness: no cursor list for aria-label "${ariaLabel}"`);
  return found;
}

export function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === text);
  if (!found) throw new Error(`audit harness: no button "${text}"`);
  return found;
}

function drainGrantedChoicesByKeyboard(root: HTMLElement, app: App, afterAction?: () => void): void {
  const engine = app.getEngine();
  if (!engine) return;
  for (const team of engine.getSession().teams) {
    while (engine.getPendingChoicesForTeam(team.id) > 0) {
      const button = root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
      if (!button) break;
      pressEnterOnFocused(button);
      afterAction?.();
    }
  }
}

function drainGrantedChoicesByMouse(root: HTMLElement, app: App, afterAction?: () => void): void {
  const engine = app.getEngine();
  if (!engine) return;
  for (const team of engine.getSession().teams) {
    while (engine.getPendingChoicesForTeam(team.id) > 0) {
      const button = root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
      if (!button) break;
      button.click();
      afterAction?.();
    }
  }
}

export interface DriveResult {
  app: App;
  root: HTMLElement;
  steps: number;
  visitedStates: Set<string>;
  /** Disposes the app and removes its root — call in afterEach. Without
   * this, a prior test's App keeps its window keydown listener attached
   * and its DOM (including whatever element it last focused) lingering
   * in the shared jsdom document, corrupting the NEXT test's focus and
   * duplicate-id checks. */
  dispose: () => void;
}

/** Startup -> setup -> a full 2-team game against real content, by
 * KEYBOARD only. `afterAction` fires after every dispatched key/click —
 * the X7 sub-groups hang their per-action checks off it. */
export function driveRealGameByKeyboard(afterAction?: (app: App, root: HTMLElement) => void): DriveResult {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App({ root, journeys: [loadRealJourney()], packs: [loadRealPack()] });
  const dispose = () => {
    app.dispose();
    root.remove();
  };
  const tick = () => afterAction?.(app, root);

  pressEnterOnFocused(findButtonByText(root, "New game"));
  tick();
  pressEnterOnFocused(cursorListEl(root, "Journey"));
  tick();
  pressEnterOnFocused(cursorListEl(root, "Number of teams"));
  tick();
  const nameInputs = root.querySelectorAll<HTMLInputElement>("#team-names input");
  typeInto(nameInputs[0]!, "Audit Alpha");
  tick();
  typeInto(nameInputs[1]!, "Audit Beta");
  tick();
  pressEnterOnFocused(cursorListEl(root, "Duration"));
  tick();
  pressEnterOnFocused(cursorListEl(root, "Pace"));
  tick();
  pressEnterOnFocused(cursorListEl(root, "Difficulty"));
  tick();
  const seedInput = root.querySelector<HTMLInputElement>('input[aria-label="Seed"]')!;
  typeInto(seedInput, "x7-audit-keyboard");
  tick();

  pressEnterOnFocused(findButtonByText(root, "Begin journey"));
  tick();

  let steps = 0;
  const visitedStates = new Set<string>();
  while (app.getEngine()!.getState() !== "gameSummary" && steps < MAX_STEPS) {
    steps++;
    drainGrantedChoicesByKeyboard(root, app, tick);
    const state = app.getEngine()!.getState();
    visitedStates.add(state);

    switch (state) {
      case "ready":
      case "beginTurn":
      case "resourceWindow":
      case "awaitingAnswer":
      case "teachingReveal":
      case "landmarkIntroduction":
        keydownOn(window, "Enter");
        break;
      case "forkChoice":
        pressEnterOnFocused(cursorListEl(root, "Route choices"));
        break;
      case "answerReveal":
        keydownOn(window, "c");
        break;
      case "recoverDecision":
        pressEnterOnFocused(cursorListEl(root, "Recovery choice"));
        break;
      case "surplusDecision":
        pressEnterOnFocused(cursorListEl(root, "Surplus choice"));
        break;
      case "communityEvent": {
        const currentActions = app.getLastRender()?.actions ?? [];
        const pledgeList = root.querySelector<HTMLElement>('[aria-label="Pledge choice"]');
        if (pledgeList) {
          pledgeList.focus();
          keydownOn(pledgeList, "ArrowUp");
          keydownOn(pledgeList, "Enter");
        } else if (currentActions.some((a) => a.id === "ruleCorrect")) {
          keydownOn(window, "c");
        } else {
          keydownOn(window, "Enter");
        }
        break;
      }
      default:
        throw new Error(`audit harness (keyboard): unhandled state "${state}"`);
    }
    tick();
  }
  if (steps >= MAX_STEPS) throw new Error("audit harness (keyboard): did not terminate");
  return { app, root, steps, visitedStates, dispose };
}

/** The same shape, by MOUSE only. */
export function driveRealGameByMouse(afterAction?: (app: App, root: HTMLElement) => void): DriveResult {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App({ root, journeys: [loadRealJourney()], packs: [loadRealPack()] });
  const dispose = () => {
    app.dispose();
    root.remove();
  };
  const tick = () => afterAction?.(app, root);

  findButtonByText(root, "New game").click();
  tick();
  root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
  tick();
  root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();
  tick();
  const nameInputs = root.querySelectorAll<HTMLInputElement>("#team-names input");
  nameInputs[0]!.value = "Audit Alpha";
  nameInputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
  tick();
  nameInputs[1]!.value = "Audit Beta";
  nameInputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
  tick();
  root.querySelector<HTMLElement>('[aria-label="Duration"] [role="option"]')!.click();
  tick();
  root.querySelector<HTMLElement>('[aria-label="Pace"] [role="option"]')!.click();
  tick();
  root.querySelector<HTMLElement>('[aria-label="Difficulty"] [role="option"]')!.click();
  tick();

  findButtonByText(root, "Begin journey").click();
  tick();

  let steps = 0;
  const visitedStates = new Set<string>();
  while (app.getEngine()!.getState() !== "gameSummary" && steps < MAX_STEPS) {
    steps++;
    drainGrantedChoicesByMouse(root, app, tick);
    const state = app.getEngine()!.getState();
    visitedStates.add(state);

    switch (state) {
      case "ready":
      case "beginTurn":
      case "resourceWindow":
      case "awaitingAnswer":
      case "teachingReveal":
      case "landmarkIntroduction":
        root.querySelector<HTMLButtonElement>('button[data-action-id="confirm"]')!.click();
        break;
      case "forkChoice":
        root.querySelector<HTMLElement>('[aria-label="Route choices"] [role="option"]')!.click();
        break;
      case "answerReveal":
        root.querySelector<HTMLButtonElement>('button[data-action-id="ruleCorrect"]')!.click();
        break;
      case "recoverDecision":
        root.querySelector<HTMLElement>('[aria-label="Recovery choice"] [role="option"]')!.click();
        break;
      case "surplusDecision":
        root.querySelector<HTMLElement>('[aria-label="Surplus choice"] [role="option"]')!.click();
        break;
      case "communityEvent": {
        const currentActions = app.getLastRender()?.actions ?? [];
        const pledgeRows = root.querySelectorAll<HTMLElement>('[aria-label="Pledge choice"] [role="option"]');
        const pledgeRow = pledgeRows.length > 0 ? pledgeRows[pledgeRows.length - 1]! : null;
        if (pledgeRow) {
          pledgeRow.click();
        } else if (currentActions.some((a) => a.id === "ruleCorrect")) {
          root.querySelector<HTMLButtonElement>('button[data-action-id="ruleCorrect"]')!.click();
        } else {
          root.querySelector<HTMLButtonElement>('button[data-action-id="resolveCommunityEvent"]')!.click();
        }
        break;
      }
      default:
        throw new Error(`audit harness (mouse): unhandled state "${state}"`);
    }
    tick();
  }
  if (steps >= MAX_STEPS) throw new Error("audit harness (mouse): did not terminate");
  return { app, root, steps, visitedStates, dispose };
}
