// PHASE10_SPEC Group X5 — content-repeat analysis. Real journey +
// general-bible pack. SECRECY: counts/ids only.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { simulateGame } from "../../src/sim/simulate";
import { CAUTIOUS } from "../../src/sim/policy";

function loadPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}
function loadJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

const pack = loadPack();
const journey = loadJourney();

const CATEGORY_PREFIX: Record<string, string> = {
  sk: "scripture-knowledge",
  br: "bible-reasoning",
  hc: "historical-context",
  al: "audio-listening",
  hy: "hymn",
  ds: "decision-strategy",
  cm: "community",
};
function categoryOf(taskId: string): string {
  const prefix = taskId.split("-")[1] ?? "";
  return CATEGORY_PREFIX[prefix] ?? "unknown";
}

// Chain order per the spec: 4 teams, then 2, then 8, then 4 again.
const TEAM_COUNTS = [4, 2, 8, 4];

interface SessionRecord {
  teamCount: number;
  ids: string[];
  warnings: string[];
}

function runChain(memorySessions: number): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (let i = 0; i < TEAM_COUNTS.length; i++) {
    const teamCount = TEAM_COUNTS[i]!;
    // Oldest-first union of the last `memorySessions` sessions' ids — the
    // builder relaxes oldest exclusions first when a category would
    // otherwise become unservable.
    const excludeTaskIds = sessions.slice(-memorySessions).flatMap((s) => s.ids);
    const result = simulateGame({
      journey,
      packs: [pack],
      teamCount,
      seed: `x5-mem${memorySessions}-session${i}-${teamCount}`,
      difficulty: "standard",
      policies: CAUTIOUS,
      excludeTaskIds,
    });
    sessions.push({ teamCount, ids: result.taskIds, warnings: result.deckWarnings });
  }
  return sessions;
}

describe("X5 — one-session memory (scenario a)", () => {
  const sessions = runChain(1);

  it("sessions 1-3 draw zero tasks repeated from the immediately preceding session", () => {
    // The spec's assertion is sessions 1-3 (4, 2, 8 teams). Phase 10
    // review: this loop used to run to session 4 as well and passed only
    // because session 4 (4 teams, right after the 8-team game) failed to
    // BUILD — "insufficient content", 0 tasks drawn, so "zero repeats" was
    // vacuously true. The builder now relaxes the oldest exclusions in
    // aggregate (OPEN_QUESTIONS item 42), session 4 builds, and it
    // genuinely repeats a handful of the 8-team game's tasks: 128 tasks
    // minus ~84 drawn by 8 teams leaves fewer than a 4-team session needs.
    // That is the content-growth finding X5 exists to surface — reported
    // below, not asserted away.
    for (let i = 1; i < 3; i++) {
      const previous = new Set(sessions[i - 1]!.ids);
      const repeats = sessions[i]!.ids.filter((id) => previous.has(id));
      expect(repeats, `session ${i + 1} (teams=${sessions[i]!.teamCount}) repeats from session ${i}`).toEqual([]);
    }
  });

  it("session 4 (4 teams after 8) builds via relaxation and its repeat count is reported, not gated", () => {
    const previous = new Set(sessions[2]!.ids);
    const repeats = sessions[3]!.ids.filter((id) => previous.has(id));
    expect(sessions[3]!.ids.length, "session 4 must build (it used to fail with 'insufficient content')").toBeGreaterThan(0);
    expect(sessions[3]!.warnings.some((w) => w.includes("exclusion relaxed"))).toBe(true);
    // Report-only: the number lands in SIMULATION_REPORT.md's X5 table.
    expect(repeats.length).toBeGreaterThanOrEqual(0);
  });

  it("no EXCLUSION-RELAXATION warning appears in sessions 1-3 (an actual excluded task let back in)", () => {
    // The builder emits two different warning shapes: "Recent-use
    // exclusion relaxed…" (an excluded task WAS let back in — this is
    // the thing one-session memory should never need) and "Content
    // supply is tight…" (a general margin caution, unrelated to whether
    // exclusion held — sessions 1-3's zero-repeats test above already
    // confirms no excluded task was actually drawn even when this
    // second warning appears, e.g. at 8 teams against a 128-task pool).
    for (let i = 0; i < 3; i++) {
      const relaxations = sessions[i]!.warnings.filter((w) => w.includes("exclusion relaxed"));
      expect(relaxations, `session ${i + 1} exclusion-relaxation warnings`).toEqual([]);
    }
  });

  it("distinct tasks used grows monotonically across the chain", () => {
    const seen = new Set<string>();
    const distinctByStep: number[] = [];
    for (const s of sessions) {
      for (const id of s.ids) seen.add(id);
      distinctByStep.push(seen.size);
    }
    for (let i = 1; i < distinctByStep.length; i++) {
      expect(distinctByStep[i]!).toBeGreaterThanOrEqual(distinctByStep[i - 1]!);
    }
  });
});

describe("X5 — three-session memory (scenario b)", () => {
  const sessions = runChain(3);

  it("records the chain's shape without throwing: sessions, warnings, and any repeats are all observable", () => {
    expect(sessions.length).toBe(4);
    const firstWarningIndex = sessions.findIndex((s) => s.warnings.length > 0);
    let firstRepeatIndex = -1;
    let firstRepeatCategory: string | null = null;
    const cumulative: string[] = [];
    for (let i = 0; i < sessions.length; i++) {
      const priorSet = new Set(cumulative);
      const repeat = sessions[i]!.ids.find((id) => priorSet.has(id));
      if (repeat && firstRepeatIndex < 0) {
        firstRepeatIndex = i;
        firstRepeatCategory = categoryOf(repeat);
      }
      cumulative.push(...sessions[i]!.ids);
    }
    // Report-only per the spec ("everything else is report -> Phase 11
    // content-growth targets"): with 128 tasks and 3-session memory
    // against ~34/4-team, ~18/2-team, and a larger 8-team draw, a
    // relaxation or repeat by session 4 is plausible and not a defect —
    // these are recorded as counts for SIMULATION_REPORT.md, not gated.
    expect(firstWarningIndex).toBeGreaterThanOrEqual(-1);
    expect(firstRepeatIndex).toBeGreaterThanOrEqual(-1);
    expect(firstRepeatCategory === null || typeof firstRepeatCategory === "string").toBe(true);
  });

  it("the number of distinct tasks used across 1, 2, 3, 4 sessions is well-formed and non-decreasing", () => {
    const seen = new Set<string>();
    let previous = 0;
    for (const s of sessions) {
      for (const id of s.ids) seen.add(id);
      expect(seen.size).toBeGreaterThanOrEqual(previous);
      previous = seen.size;
    }
    expect(previous).toBeLessThanOrEqual(128);
  });
});
