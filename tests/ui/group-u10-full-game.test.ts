// @vitest-environment jsdom
// PHASE4_SPEC Group U10 — full game by keyboard, then by mouse.

import { describe, expect, it } from "vitest";
import { App } from "../../src/ui/app";
import { testJourney, bigPack } from "../session/fixtures";

const MAX_STEPS = 500;

function keydownOn(target: EventTarget, key: string, extra: Partial<KeyboardEventInit> = {}): void {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(event);
}

function pressEnterOnFocused(el: HTMLElement): void {
  el.focus();
  keydownOn(el, "Enter");
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function cursorListEl(root: HTMLElement, ariaLabel: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${ariaLabel}"]`);
  if (!found) throw new Error(`U10 test: no cursor list found for aria-label "${ariaLabel}"`);
  return found;
}

function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(root.querySelectorAll("button"));
  const found = buttons.find((b) => b.textContent === text);
  if (!found) throw new Error(`U10 test: no button found with text "${text}"`);
  return found;
}

/** Resolves any pending granted-resource choices via a real focused-button
 * Enter press (the keyboard path for actions with no dedicated key). */
function drainGrantedChoicesByKeyboard(root: HTMLElement, app: App): void {
  const engine = app.getEngine();
  if (!engine) return;
  for (const team of engine.getSession().teams) {
    while (engine.getPendingChoicesForTeam(team.id) > 0) {
      const button = root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
      if (!button) break;
      pressEnterOnFocused(button);
    }
  }
}

function drainGrantedChoicesByMouse(root: HTMLElement, app: App): void {
  const engine = app.getEngine();
  if (!engine) return;
  for (const team of engine.getSession().teams) {
    while (engine.getPendingChoicesForTeam(team.id) > 0) {
      const button = root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
      if (!button) break;
      button.click();
    }
  }
}

describe("U10 — a complete 2-team game driven only by keyboard events, setup included", () => {
  it("reaches gameSummary, and every state entered produced at least one announcement", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = new App({ root, journeys: [testJourney], packs: [bigPack()] });

    expect(app.getMode()).toBe("startup");
    pressEnterOnFocused(findButtonByText(root, "New game"));
    expect(app.getMode()).toBe("setup");

    // Journey (only one loaded; first row confirms it).
    pressEnterOnFocused(cursorListEl(root, "Journey"));
    // Team count: first row is "2 teams" (matches the default), confirmed
    // via a real Enter dispatch on the focused list.
    pressEnterOnFocused(cursorListEl(root, "Number of teams"));

    const nameInputs = root.querySelectorAll<HTMLInputElement>("#team-names input");
    expect(nameInputs).toHaveLength(2);
    typeInto(nameInputs[0]!, "Keyboard Alpha");
    typeInto(nameInputs[1]!, "Keyboard Beta");

    // Duration: exercise Up/Down, not just Enter-on-first-row.
    const durationList = cursorListEl(root, "Duration");
    durationList.focus();
    keydownOn(durationList, "ArrowDown");
    keydownOn(durationList, "Enter");

    pressEnterOnFocused(cursorListEl(root, "Pace"));
    pressEnterOnFocused(cursorListEl(root, "Difficulty"));

    const seedInput = root.querySelector<HTMLInputElement>('input[aria-label="Seed"]')!;
    typeInto(seedInput, "u10-keyboard-full-game");

    // Baseline captured BEFORE Begin journey, so the "ready" screen's own
    // announcement (which fires during beginJourney, before the loop
    // starts) is correctly detected as new on the first iteration.
    let lastSeenEntry = app.getPresenterLog().at(-1) ?? null;
    pressEnterOnFocused(findButtonByText(root, "Begin journey"));
    expect(app.getMode()).toBe("playing");

    let steps = 0;
    const visitedStates = new Set<string>();
    const announcedStates = new Set<string>();
    // Compare the log's LAST ENTRY OBJECT by reference, not its length —
    // the presenter's log is a capped ring buffer, so length alone stops
    // growing once a real (long) game saturates it, while a freshly
    // pushed entry is always a new object.
    while (app.getEngine()!.getState() !== "gameSummary" && steps < MAX_STEPS) {
      steps++;
      drainGrantedChoicesByKeyboard(root, app);
      const state = app.getEngine()!.getState();
      visitedStates.add(state);
      const currentLastEntry = app.getPresenterLog().at(-1) ?? null;
      if (currentLastEntry !== lastSeenEntry) announcedStates.add(state);
      lastSeenEntry = currentLastEntry;

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
          // Driven off the ACTUAL current actions, not an assumed event
          // kind or a hand-tracked counter — robust to relay vs
          // contribution, and to the "everyone's responded" screen where
          // only Resolve remains.
          const currentActions = app.getLastRender()?.actions ?? [];
          const pledgeList = root.querySelector<HTMLElement>('[aria-label="Pledge choice"]');
          if (pledgeList) {
            // Always decline: teams start with 0 resources in this test, so
            // contributing would be an illegal (unaffordable) command.
            // Decline is always the LAST row; ArrowUp from a fresh list
            // (cursor 0) wraps to it.
            pledgeList.focus();
            keydownOn(pledgeList, "ArrowUp");
            keydownOn(pledgeList, "Enter");
          } else if (currentActions.some((a) => a.id === "ruleCorrect")) {
            keydownOn(window, "c");
          } else {
            keydownOn(window, "Enter"); // resolveCommunityEvent
          }
          break;
        }
        default:
          throw new Error(`U10 keyboard drive: unhandled state "${state}"`);
      }
    }

    expect(steps).toBeLessThan(MAX_STEPS);
    expect(app.getEngine()!.getState()).toBe("gameSummary");
    expect(root.textContent).toContain("Keyboard Alpha");

    // Every state actually entered during the run produced at least one
    // announcement (the loop exits the moment gameSummary is reached, so
    // its own render — which DID fire, via the action that produced the
    // transition — is checked separately below).
    expect(visitedStates.size).toBeGreaterThan(5); // sanity: a real, varied game
    expect(announcedStates).toEqual(visitedStates);
    expect(app.getPresenterLog().at(-1)?.visual).toMatch(/Game over/);

    const log = app.getEngine()!.getSession().eventLog;
    expect(log.length).toBeGreaterThan(5);
  });
});

describe("U10 — the same shape of game, driven only by mouse clicks (dual-modality proof)", () => {
  it("reaches gameSummary using only .click() on rendered controls", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = new App({ root, journeys: [testJourney], packs: [bigPack()] });

    findButtonByText(root, "New game").click();
    expect(app.getMode()).toBe("setup");

    // Cursor-list rows are clickable (row 0 = first option in each list).
    root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
    root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();

    const nameInputs = root.querySelectorAll<HTMLInputElement>("#team-names input");
    nameInputs[0]!.value = "Mouse Alpha";
    nameInputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
    nameInputs[1]!.value = "Mouse Beta";
    nameInputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));

    root.querySelector<HTMLElement>('[aria-label="Duration"] [role="option"]')!.click();
    root.querySelector<HTMLElement>('[aria-label="Pace"] [role="option"]')!.click();
    root.querySelector<HTMLElement>('[aria-label="Difficulty"] [role="option"]')!.click();

    findButtonByText(root, "Begin journey").click();
    expect(app.getMode()).toBe("playing");

    let steps = 0;
    while (app.getEngine()!.getState() !== "gameSummary" && steps < MAX_STEPS) {
      steps++;
      drainGrantedChoicesByMouse(root, app);
      const state = app.getEngine()!.getState();

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
          // Driven off the ACTUAL current actions (see the keyboard driver
          // for why), not an assumed event kind or a hand-tracked counter.
          const currentActions = app.getLastRender()?.actions ?? [];
          // Always decline (LAST row): teams start with 0 resources, so
          // contributing would be an illegal (unaffordable) command.
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
          throw new Error(`U10 mouse drive: unhandled state "${state}"`);
      }
    }

    expect(steps).toBeLessThan(MAX_STEPS);
    expect(app.getEngine()!.getState()).toBe("gameSummary");
    expect(root.textContent).toContain("Mouse Alpha");
  });
});
