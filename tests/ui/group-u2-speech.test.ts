// PHASE4_SPEC Group U2 — speech builders. No jsdom needed: these are pure
// string functions. Uses the real engine's statusText()/allPositionsText()
// (Phase 2, already §23.3-ordered) as realistic input rather than
// re-deriving that formatting here.

import { describe, expect, it } from "vitest";
import {
  buildStatus,
  buildMultipleChoicePrompt,
  buildEliminateAnnouncement,
  buildEntryAnnouncement,
  buildNavigationAnnouncement,
  buildPositions,
  letterOptions,
  letterFor,
} from "../../src/ui/speech";
import { makeEngine } from "../engine/fixtures";

describe("U2 — status follows the §23.3 order exactly", () => {
  it("appends available actions after the engine's own item-1-through-8 status text", () => {
    const engine = makeEngine();
    const base = engine.statusText();
    // Sanity: the real engine status already carries items 1-8 in order.
    expect(base).toMatch(/^Team .+\. Currently on .+\. \d+ of \d+ successes\./);
    expect(base).toMatch(/Insight \d+\. Provision \d+\. Courage \d+\./);
    expect(base).toMatch(/(Holding a Journey Token|No Journey Token)\./);

    const composed = buildStatus(base, ["Present task"]);
    expect(composed.visual.startsWith(base)).toBe(true);
    expect(composed.visual.endsWith("Available actions: Present task.")).toBe(true);
    // Item 9 (actions) comes strictly after items 1-8.
    expect(composed.visual.indexOf("Available actions")).toBeGreaterThan(base.length - 1);
  });

  it("says plainly when nothing is available, rather than an empty clause", () => {
    const composed = buildStatus("Team Alpha status.", []);
    expect(composed.visual).toBe("Team Alpha status. No actions available right now.");
  });
});

describe("U2 — multiple-choice prompt composition (ACCESSIBILITY_PATTERNS §4)", () => {
  it("composes prompt + choice count + lettered options in one string", () => {
    const composed = buildMultipleChoicePrompt("Who replaced Judas?", ["Matthias", "Silas", "Barnabas"]);
    expect(composed.visual).toBe(
      "Who replaced Judas? 3 choices. A: Matthias. B: Silas. C: Barnabas.",
    );
    expect(composed.spoken).toBe(composed.visual);
  });

  it("falls back to just the prompt when there are no options", () => {
    const composed = buildMultipleChoicePrompt("Name the city.", []);
    expect(composed.visual).toBe("Name the city.");
  });

  it("letterFor maps 0-based indices to A, B, C...", () => {
    expect(letterFor(0)).toBe("A");
    expect(letterFor(2)).toBe("C");
  });
});

describe("U2 — eliminate-option re-reads only survivors", () => {
  it("matches ACCESSIBILITY_PATTERNS' exact worked example", () => {
    const composed = buildEliminateAnnouncement(["Matthias", "Silas", "Barnabas"], "Silas");
    expect(composed.visual).toBe(
      "B, Silas, is eliminated. Two choices remain: A, Matthias. C, Barnabas.",
    );
  });

  it("letterOptions marks eliminated options textually, not just by omission", () => {
    const options = letterOptions(["Matthias", "Silas", "Barnabas"], ["Silas"]);
    expect(options).toEqual([
      { letter: "A", text: "Matthias", eliminated: false },
      { letter: "B", text: "Silas", eliminated: true },
      { letter: "C", text: "Barnabas", eliminated: false },
    ]);
  });
});

describe("U2 — entry vs navigation announcements differ", () => {
  it("entry composes orientation + instructions + current item", () => {
    const entry = buildEntryAnnouncement(
      "Fork ahead.",
      "Use up and down to browse routes, Enter to choose.",
      "Coastal Road.",
    );
    expect(entry.visual).toBe(
      "Fork ahead. Use up and down to browse routes, Enter to choose. Coastal Road.",
    );
  });

  it("navigation is terse: current item only", () => {
    const nav = buildNavigationAnnouncement("Mountain Pass.");
    expect(nav.visual).toBe("Mountain Pass.");
  });
});

describe("U2 — team positions summary", () => {
  it("wraps the engine's one-clause-per-team summary unchanged", () => {
    const engine = makeEngine();
    const base = engine.allPositionsText();
    const composed = buildPositions(base);
    expect(composed.visual).toBe(base);
    // "One clause per team": as many sentences as teams.
    const sentenceCount = base.split(".").filter((s) => s.trim().length > 0).length;
    expect(sentenceCount).toBe(engine.getSession().teams.length);
  });
});
