// @vitest-environment jsdom
// PHASE10_SPEC Group X7b — status everywhere. Real journey + general-bible
// pack (blind: ids only). Drives until each of the 12 reachable states has
// been entered at least once, and in each, checks R/S/A/T/?/Escape.

import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { makeApp, findButtonByText, keydownOn, type AppHarness } from "../ui/appHarness";
import type { GameState } from "../../src/engine/types";

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

const ALL_12_STATES: GameState[] = [
  "ready",
  "beginTurn",
  "forkChoice",
  "resourceWindow",
  "awaitingAnswer",
  "answerReveal",
  "recoverDecision",
  "teachingReveal",
  "surplusDecision",
  "landmarkIntroduction",
  "communityEvent",
  "gameSummary",
];

const TASK_STATES = new Set<GameState>(["resourceWindow", "awaitingAnswer", "answerReveal", "recoverDecision"]);

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("X7b — R/S/A/T/help in every reachable state", () => {
  it("visits all 12 states; each gives non-empty, state-preserving R/S/A/T, and help opens with rows", () => {
    h = makeApp({
      journeys: [loadRealJourney()],
      packs: [loadRealPack()],
      // Every team starts able to afford recover/assist/amplify — the only
      // way to reach recoverDecision (needs Provision on an incorrect
      // ruling) without farming resources through many real turns first
      // (AppOptions.startingResources, test-ergonomics only — real play
      // always starts every team at zero).
      extra: { startingResources: { insight: 5, provision: 5, courage: 5 } },
    });
    findButtonByText(h.root, "New game").click();
    h.root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();
    findButtonByText(h.root, "Begin journey").click();

    const visited = new Set<GameState>();
    let usedIncorrectOnce = false;
    let steps = 0;
    const MAX_STEPS = 400;

    while (visited.size < ALL_12_STATES.length && steps < MAX_STEPS) {
      steps++;
      const engine = h.app.getEngine()!;
      for (const team of engine.getSession().teams) {
        while (engine.getPendingChoicesForTeam(team.id) > 0) {
          const b = h.root.querySelector<HTMLButtonElement>(`button[data-action-id="chooseGranted-${team.id}-insight"]`);
          if (!b) break;
          b.focus();
          keydownOn(b, "Enter");
        }
      }
      const state = engine.getState();

      if (!visited.has(state)) {
        visited.add(state);
        exerciseStatusCommands(h, state);
      }

      const root = h.root;
      switch (state) {
        case "ready":
        case "beginTurn":
        case "teachingReveal":
        case "landmarkIntroduction":
          keydownOn(window, "Enter");
          break;
        case "forkChoice": {
          const list = root.querySelector<HTMLElement>('[aria-label="Route choices"]')!;
          list.focus();
          keydownOn(list, "Enter");
          break;
        }
        case "resourceWindow": {
          // Reaching surplusDecision needs a success to overshoot a
          // stage's requirement — deliberately amplify once (the button
          // has no dedicated key) so an eventual amplified success (worth
          // 2) can overshoot a small real-journey stage.
          if (usedIncorrectOnce && !visited.has("surplusDecision")) {
            // Only after the deliberate-incorrect attempt (above) is
            // already spent, so this one is free to be ruled correct.
            // Keeps trying on every subsequent task (not just once) —
            // an amplified success (worth 2) only overshoots a stage's
            // requirement, and so reaches surplusDecision, if it doesn't
            // land exactly on the number still needed.
            const amplifyButton = root.querySelector<HTMLButtonElement>('button[data-action-id="spendCourageAmplify"]');
            if (amplifyButton) amplifyButton.click();
          }
          keydownOn(window, "Enter"); // acceptAnswer
          break;
        }
        case "awaitingAnswer":
          keydownOn(window, "Enter"); // reveal
          break;
        case "answerReveal":
          if (!usedIncorrectOnce) {
            usedIncorrectOnce = true;
            keydownOn(window, "i"); // incorrect, to reach recoverDecision
          } else {
            keydownOn(window, "c");
          }
          break;
        case "recoverDecision": {
          const list = root.querySelector<HTMLElement>('[aria-label="Recovery choice"]')!;
          list.focus();
          keydownOn(list, "ArrowDown"); // decline (second row)
          keydownOn(list, "Enter");
          break;
        }
        case "surplusDecision": {
          const list = root.querySelector<HTMLElement>('[aria-label="Surplus choice"]')!;
          list.focus();
          keydownOn(list, "Enter");
          break;
        }
        case "communityEvent": {
          const pledge = root.querySelector<HTMLElement>('[aria-label="Pledge choice"]');
          const actions = h.app.getLastRender()?.actions ?? [];
          if (pledge) {
            pledge.focus();
            keydownOn(pledge, "ArrowUp");
            keydownOn(pledge, "Enter");
          } else if (actions.some((a) => a.id === "ruleCorrect")) {
            keydownOn(window, "c");
          } else {
            keydownOn(window, "Enter");
          }
          break;
        }
        case "gameSummary":
          break;
        default:
          throw new Error(`X7b: unhandled state "${state}"`);
      }
    }

    expect(steps, "did not terminate").toBeLessThan(MAX_STEPS);
    const missing = ALL_12_STATES.filter((s) => !visited.has(s));
    expect(missing, `states never reached: ${missing.join(", ")}`).toEqual([]);
  });
});

function exerciseStatusCommands(h: AppHarness, state: GameState): void {
  const engine = h.app.getEngine()!;

  for (const key of ["r", "s", "a", "t"] as const) {
    // Compare the last entry OBJECT by reference, not log length: the
    // presenter's log is a capped ring buffer (Presenter's logLimit), so
    // length alone stops growing once a game saturates it while a freshly
    // pushed entry is always a new object (same gotcha U10 already
    // documents in tests/ui/group-u10-full-game.test.ts).
    const before = { state: engine.getState(), session: engine.getSession(), lastEntry: h.app.getPresenterLog().at(-1) ?? null };
    keydownOn(window, key);
    const after = { state: engine.getState(), session: engine.getSession(), lastEntry: h.app.getPresenterLog().at(-1) ?? null };
    expect(after.state, `${key} in ${state}: state changed`).toBe(before.state);
    expect(after.session, `${key} in ${state}: session changed`).toEqual(before.session);
    expect(after.lastEntry, `${key} in ${state}: no new announcement`).not.toBe(before.lastEntry);
    const latest = h.app.getPresenterLog().at(-1)!;
    expect(latest.visual.length, `${key} in ${state}: empty announcement`).toBeGreaterThan(0);

    if (key === "s") {
      const activeTeam = engine.getSession().teams[engine.getSession().activeTeamIndex]!;
      expect(latest.visual, `S in ${state}: missing team name`).toContain(activeTeam.name);
      if (TASK_STATES.has(state)) {
        expect(latest.visual, `S in ${state}: missing "successes"`).toContain("successes");
      }
    }
  }

  // "?" opens help with >= 1 row (rendered as #help-menu's <li> rows);
  // Escape closes it. Skip in gameSummary/ready, where global game keys
  // are still legal per KEYBOARD_COMMANDS.md's "every play state" table.
  keydownOn(window, "?");
  const helpMenu = h.root.parentElement?.querySelector("#help-menu") ?? document.querySelector("#help-menu");
  expect(helpMenu, `help menu did not open in ${state}`).not.toBeNull();
  expect(helpMenu!.querySelectorAll("li").length, `help menu has no rows in ${state}`).toBeGreaterThanOrEqual(1);
  keydownOn(window, "Escape");
  const helpMenuAfter = document.querySelector("#help-menu");
  expect(helpMenuAfter, `help menu did not close in ${state}`).toBeNull();
}
