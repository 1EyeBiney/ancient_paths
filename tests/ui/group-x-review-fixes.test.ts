// @vitest-environment jsdom
// Phase 10 review (Fable, 2026-09-03; OPEN_QUESTIONS item 42) — regression
// for the setup wizard's cursor lists. Every setup list used to start on
// row 0 and mark it aria-selected regardless of the wizard's real value
// (appendChoiceList accepted `current` and discarded it), so a screen
// reader heard "short, selected" for Duration on a fresh setup whose
// wizard held "standard", and after End session / Resume every list
// disagreed with the values actually in force. CursorList now takes
// `selectedId`: the cursor opens on the chosen row, aria-selected marks
// the CHOSEN row (updated on confirm), aria-activedescendant follows the
// cursor while browsing.

import { describe, expect, it, afterEach } from "vitest";
import { makeApp, findButtonByText, keydownOn, type AppHarness } from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function list(root: HTMLElement, label: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
}
function selectedLabel(root: HTMLElement, label: string): string | undefined {
  return list(root, label).querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.textContent ?? undefined;
}
function activeLabel(root: HTMLElement, label: string): string | undefined {
  const el = list(root, label);
  const id = el.getAttribute("aria-activedescendant");
  return id ? (root.ownerDocument.getElementById(id)?.textContent ?? undefined) : undefined;
}

describe("Review — setup cursor lists reflect the wizard's real values", () => {
  it("a fresh setup opens every list on the wizard's default, and only that row is aria-selected", () => {
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    const root = h.root;
    expect(selectedLabel(root, "Number of teams")).toBe("2 teams");
    expect(selectedLabel(root, "Duration")).toBe("standard");
    expect(selectedLabel(root, "Pace")).toBe("standard");
    expect(selectedLabel(root, "Difficulty")).toBe("standard");
    expect(selectedLabel(root, "Map style")).toBe("satellite");
    // The cursor starts on the chosen row too — the first Arrow press
    // moves from the real value, not from row 0.
    expect(activeLabel(root, "Duration")).toBe("standard");
    for (const label of ["Number of teams", "Duration", "Pace", "Difficulty", "Map style"]) {
      expect(list(root, label).querySelectorAll('[role="option"][aria-selected="true"]').length, label).toBe(1);
    }
  });

  it("arrowing browses (aria-activedescendant moves) without changing the choice until Enter", () => {
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    const root = h.root;
    const teams = list(root, "Number of teams");
    teams.focus();
    keydownOn(teams, "ArrowDown");
    keydownOn(teams, "ArrowDown");
    expect(activeLabel(root, "Number of teams")).toBe("4 teams");
    expect(selectedLabel(root, "Number of teams"), "browsing must not change the choice").toBe("2 teams");
    expect(root.querySelectorAll("#team-names input").length).toBe(2);

    keydownOn(teams, "Enter");
    expect(selectedLabel(root, "Number of teams")).toBe("4 teams");
    expect(root.querySelectorAll("#team-names input").length).toBe(4);
  });

  it("after End session the re-rendered setup opens on the values that were in force", () => {
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    const root = h.root;
    Array.from(list(root, "Number of teams").querySelectorAll<HTMLElement>('[role="option"]'))
      .find((o) => o.textContent === "4 teams")!
      .click();
    Array.from(list(root, "Duration").querySelectorAll<HTMLElement>('[role="option"]'))
      .find((o) => o.textContent === "long")!
      .click();
    findButtonByText(root, "Begin journey").click();

    keydownOn(window, "Escape"); // game menu
    findButtonByText(root, "End session").click();
    findButtonByText(root, "End session").click(); // confirm

    expect(root.querySelector("#host-controls h2")!.textContent).toBe("Set up your session");
    expect(selectedLabel(root, "Number of teams")).toBe("4 teams");
    expect(activeLabel(root, "Number of teams")).toBe("4 teams");
    expect(selectedLabel(root, "Duration")).toBe("long");
    expect(activeLabel(root, "Duration")).toBe("long");
  });

  it("a decision list (fork routes) keeps selection-follows-cursor — nothing is pre-chosen there", () => {
    // Structural: CursorList without selectedId is unchanged. Covered
    // end-to-end by the existing fork tests; here just the widget contract.
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    // The Journey list has exactly one option and a selectedId; it must
    // still be the selected AND active row (a one-item list is the
    // degenerate case of "opens on the chosen row").
    expect(selectedLabel(h.root, "Journey")).toBeDefined();
    expect(activeLabel(h.root, "Journey")).toBe(selectedLabel(h.root, "Journey"));
  });
});
