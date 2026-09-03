// PHASE10_SPEC Group X2 — game length and sufficiency under realistic
// play. Real journey + general-bible pack. SECRECY: counts/ids only.
//
// OPEN_QUESTIONS item 36: 3 seeds per cell, not the spec's 12 — a real
// game's cost scales with team count (structuredClone per dispatch), and
// 12 seeds across this matrix measured ~44.7s alone, blowing the whole
// tests/sim budget on one file. 3 seeds × 7 team counts × 3 difficulties ×
// 3 presets (189 games) keeps every assertion meaningful — exhaustion is a
// near-certain/near-impossible outcome per cell here (128 tasks vs. a
// handful drawn), not a coin flip that needs a big sample to resolve — and
// costs well under 15s. Deterministic per seed, so a smaller sample is not
// "flakier", only a fixed, checked-once set of games.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { simulateGame, type SimResult } from "../../src/sim/simulate";
import { CAUTIOUS, BOLD, PASSIVE, type TeamPolicy } from "../../src/sim/policy";
import { buildSessionDeck, type DeckDifficultySetting } from "../../src/session/builder";

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

const SEEDS_PER_CELL = 3;
const DIFFICULTIES: DeckDifficultySetting[] = ["gentle", "standard", "challenging"];
const PRESETS: TeamPolicy[] = [CAUTIOUS, BOLD, PASSIVE];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

interface CellStats {
  teamCount: number;
  difficulty: DeckDifficultySetting;
  preset: string;
  results: SimResult[];
  exhaustedCount: number;
}

function runCell(teamCount: number, difficulty: DeckDifficultySetting, preset: TeamPolicy): CellStats {
  const results: SimResult[] = [];
  for (let s = 0; s < SEEDS_PER_CELL; s++) {
    results.push(
      simulateGame({
        journey,
        packs: [pack],
        teamCount,
        seed: `x2-${teamCount}-${difficulty}-${preset.name}-${s}`,
        difficulty,
        policies: preset,
      }),
    );
  }
  return {
    teamCount,
    difficulty,
    preset: preset.name,
    results,
    exhaustedCount: results.filter((r) => r.exhausted !== null).length,
  };
}

// Computed once and shared by every it() below — re-running the whole
// matrix per assertion would blow the time budget for no benefit (the
// matrix is deterministic, not order-dependent).
const matrix: CellStats[] = [];
for (let teamCount = 2; teamCount <= 8; teamCount++) {
  for (const difficulty of DIFFICULTIES) {
    for (const preset of PRESETS) {
      matrix.push(runCell(teamCount, difficulty, preset));
    }
  }
}

describe("X2 — no exhaustion at standard or gentle", () => {
  for (const cell of matrix.filter((c) => c.difficulty === "gentle" || c.difficulty === "standard")) {
    it(`teams=${cell.teamCount} difficulty=${cell.difficulty} preset=${cell.preset}: none of ${SEEDS_PER_CELL} exhaust`, () => {
      expect(cell.exhaustedCount, "exhausted games").toBe(0);
    });
  }
});

describe("X2 — challenging at 7-8 teams: exhaustion only after a build that warned", () => {
  const highTeamChallenging = matrix.filter((c) => c.difficulty === "challenging" && c.teamCount >= 7);
  for (const cell of highTeamChallenging) {
    it(`teams=${cell.teamCount} preset=${cell.preset}: any exhaustion coincides with the report's own warning behavior`, () => {
      // buildSessionDeck warns ("Content supply is tight…") whenever
      // available < 1.5x projected draws; a run that exhausts must have
      // been in that tight band, i.e. sufficiency's OWN check would have
      // already flagged it — verified directly against the builder here
      // rather than re-deriving warnings from simulateGame's result.
      if (cell.exhaustedCount === 0) return;
      const teamIds = Array.from({ length: cell.teamCount }, (_, i) => `w${i}`);
      const turnTaskLimit = cell.results[0]!.turnTaskLimit;
      // Re-run the build (cheap — build only, no play) to inspect the
      // report's warnings for this exact cell.
      const { report } = buildSessionDeck({
        journey,
        packs: [pack],
        teamIds,
        turnTaskLimit,
        seed: `x2-${cell.teamCount}-${cell.difficulty}-${cell.preset}-build-check`,
        difficulty: cell.difficulty,
      });
      expect(report.warnings.length, "a cell that exhausted mid-play must have warned at build time").toBeGreaterThan(0);
    });
  }
});

describe("X2 — median rounds fall within [0.5x, 2.0x] of plannedRounds at standard", () => {
  for (let teamCount = 2; teamCount <= 8; teamCount++) {
    it(`teams=${teamCount}`, () => {
      const cells = matrix.filter((c) => c.teamCount === teamCount && c.difficulty === "standard");
      const rounds = cells.flatMap((c) => c.results.map((r) => r.rounds));
      const plannedRounds = cells[0]!.results[0]!.plannedRounds;
      const med = median(rounds);
      expect(med, `median rounds (${med}) vs plannedRounds (${plannedRounds})`).toBeGreaterThanOrEqual(0.5 * plannedRounds);
      expect(med).toBeLessThanOrEqual(2.0 * plannedRounds);
    });
  }
});

describe("X2 — shared-victory rate is reported (no pass/fail bound, informational)", () => {
  it("computes a rate per team count at standard without throwing", () => {
    for (let teamCount = 2; teamCount <= 8; teamCount++) {
      const cells = matrix.filter((c) => c.teamCount === teamCount && c.difficulty === "standard");
      const results = cells.flatMap((c) => c.results);
      const rate = results.filter((r) => r.sharedVictory).length / results.length;
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});
