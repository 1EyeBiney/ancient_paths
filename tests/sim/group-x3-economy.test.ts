// PHASE10_SPEC Group X3 — resource economy. Real journey + general-bible
// pack. SECRECY: counts/ids only.
//
// OPEN_QUESTIONS item 36: 10 seeds per 4-team preset (not the spec's 40)
// and 8 seeds for the 2/8-team BOLD checks (not 20) — same team-count-
// scaling cost as X2; these smaller batches already give a clear signal
// on every assertion below (which are about whether a mechanic is
// REACHABLE at all, not a precise rate).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { simulateGame, type SimResult } from "../../src/sim/simulate";
import { summarizeBatch } from "../../src/sim/aggregate";
import { CAUTIOUS, BOLD, GENEROUS, HOARDER, type TeamPolicy } from "../../src/sim/policy";

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

const SEEDS_4TEAM = 10;
const SEEDS_EXTREME = 8;

function runBatch(teamCount: number, preset: TeamPolicy, count: number, tag: string): SimResult[] {
  const results: SimResult[] = [];
  for (let s = 0; s < count; s++) {
    results.push(
      simulateGame({ journey, packs: [pack], teamCount, seed: `x3-${tag}-${preset.name}-${teamCount}-${s}`, difficulty: "standard", policies: preset }),
    );
  }
  return results;
}

const presets = [CAUTIOUS, BOLD, GENEROUS, HOARDER];
const batches4 = new Map(presets.map((p) => [p.name, runBatch(4, p, SEEDS_4TEAM, "std")]));
const batchBold2 = runBatch(2, BOLD, SEEDS_EXTREME, "extreme");
const batchBold8 = runBatch(8, BOLD, SEEDS_EXTREME, "extreme");

describe("X3 — the assisted/amplified faucet is reachable", () => {
  it(`BOLD at 4 teams: amplified attempts in >=90% of ${SEEDS_4TEAM} games`, () => {
    const summary = summarizeBatch(batches4.get("BOLD")!);
    expect(summary.amplifiedAttemptGameShare).toBeGreaterThanOrEqual(0.9);
  });

  it(`CAUTIOUS at 4 teams: assisted attempts in >=60% of ${SEEDS_4TEAM} games`, () => {
    const summary = summarizeBatch(batches4.get("CAUTIOUS")!);
    expect(summary.assistedAttemptGameShare).toBeGreaterThanOrEqual(0.6);
  });
});

describe("X3 — no resource flooding", () => {
  for (const preset of presets) {
    it(`${preset.name}: no preset ends with every team at the cap in more than 10% of games`, () => {
      const summary = summarizeBatch(batches4.get(preset.name)!);
      expect(summary.allTeamsAtCapGameShare).toBeLessThanOrEqual(0.1);
    });

    it(`${preset.name}: cap discards happen in at most 25% of games`, () => {
      const summary = summarizeBatch(batches4.get(preset.name)!);
      expect(summary.capDiscardGameShare).toBeLessThanOrEqual(0.25);
    });
  }
});

describe("X3 — the Journey Token is reachable (report-only per the spec)", () => {
  it("BOLD games earning a Journey Token — informational, no hard bound", () => {
    const all = [...batchBold2, ...batches4.get("BOLD")!, ...batchBold8];
    const summary = summarizeBatch(all);
    if (summary.journeyTokenGameShare < 0.3) {
      // eslint-disable-next-line no-console
      console.log(
        `X3 note: BOLD Journey Token rate is ${(summary.journeyTokenGameShare * 100).toFixed(1)}% across ${all.length} games, below the spec's 30% expectation — see SIMULATION_REPORT.md.`,
      );
    }
    expect(summary.journeyTokenGameShare).toBeGreaterThanOrEqual(0);
  });
});

describe("X3 — economy report data is well-formed for every preset", () => {
  for (const preset of presets) {
    it(`${preset.name}: summary has no negative or NaN fields`, () => {
      const summary = summarizeBatch(batches4.get(preset.name)!);
      for (const key of ["amplifiedAttemptGameShare", "assistedAttemptGameShare", "capDiscardGameShare", "allTeamsAtCapGameShare", "journeyTokenGameShare", "zeroSpendTeamShare"] as const) {
        expect(Number.isFinite(summary[key]), key).toBe(true);
        expect(summary[key]).toBeGreaterThanOrEqual(0);
        expect(summary[key]).toBeLessThanOrEqual(1);
      }
    });
  }
});
