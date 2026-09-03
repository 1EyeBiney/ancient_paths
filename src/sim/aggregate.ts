// PHASE10_SPEC Groups X3-X5, X10 — turning a batch of SimResults into
// summary statistics. Shared by the economy/fairness test assertions and
// by report.ts's tables, so the numbers in SIMULATION_REPORT.md are
// exactly the numbers the tests checked, never a second computation.

import type { ResourceType } from "../engine/types";
import type { GrantSource, SimResult, SpendUse, TeamSimResult } from "./simulate";

const RESOURCE_CAP = 5;

export interface BatchSummary {
  gameCount: number;
  teamCount: number;
  /** Share of GAMES with at least one attempt of the given variant. */
  amplifiedAttemptGameShare: number;
  assistedAttemptGameShare: number;
  /** Share of GAMES where at least one team discarded a resource at the cap. */
  capDiscardGameShare: number;
  /** Share of GAMES where every team ended with every resource at the cap. */
  allTeamsAtCapGameShare: number;
  /** Share of GAMES where at least one team earned a Journey Token. */
  journeyTokenGameShare: number;
  /** Share of TEAMS (across all games) that ended with no recorded spending. */
  zeroSpendTeamShare: number;
  meanResourcesEnd: Record<ResourceType, number>;
  meanServiceScore: number;
  resourcesGrantedBySourceTotal: Partial<Record<GrantSource, number>>;
  resourcesSpentByUseTotal: Partial<Record<SpendUse, number>>;
}

function allTeams(results: SimResult[]): TeamSimResult[] {
  return results.flatMap((r) => r.teams);
}

export function summarizeBatch(results: SimResult[]): BatchSummary {
  const gameCount = results.length;
  const teamCount = results[0]?.teamCount ?? 0;
  const teams = allTeams(results);

  const gamesWithAmplified = results.filter((r) => r.variantAttempts.amplified > 0).length;
  const gamesWithAssisted = results.filter((r) => r.variantAttempts.assisted > 0).length;
  const gamesWithCapDiscard = results.filter((r) => r.teams.some((t) => t.capDiscards > 0)).length;
  const gamesAllAtCap = results.filter((r) =>
    r.teams.every((t) => t.resourcesEnd.insight >= RESOURCE_CAP && t.resourcesEnd.provision >= RESOURCE_CAP && t.resourcesEnd.courage >= RESOURCE_CAP),
  ).length;
  const gamesWithJourneyToken = results.filter((r) => r.teams.some((t) => t.journeyTokenEarned)).length;
  const zeroSpendTeams = teams.filter((t) => Object.keys(t.resourcesSpentByUse).length === 0).length;

  const meanResourcesEnd: Record<ResourceType, number> = { insight: 0, provision: 0, courage: 0 };
  let serviceSum = 0;
  const grantedTotal: Partial<Record<GrantSource, number>> = {};
  const spentTotal: Partial<Record<SpendUse, number>> = {};
  for (const t of teams) {
    meanResourcesEnd.insight += t.resourcesEnd.insight;
    meanResourcesEnd.provision += t.resourcesEnd.provision;
    meanResourcesEnd.courage += t.resourcesEnd.courage;
    serviceSum += t.serviceScore;
    for (const [source, amount] of Object.entries(t.resourcesGrantedBySource)) {
      grantedTotal[source as GrantSource] = (grantedTotal[source as GrantSource] ?? 0) + (amount ?? 0);
    }
    for (const [use, amount] of Object.entries(t.resourcesSpentByUse)) {
      spentTotal[use as SpendUse] = (spentTotal[use as SpendUse] ?? 0) + (amount ?? 0);
    }
  }
  const n = teams.length || 1;
  meanResourcesEnd.insight /= n;
  meanResourcesEnd.provision /= n;
  meanResourcesEnd.courage /= n;

  return {
    gameCount,
    teamCount,
    amplifiedAttemptGameShare: gameCount ? gamesWithAmplified / gameCount : 0,
    assistedAttemptGameShare: gameCount ? gamesWithAssisted / gameCount : 0,
    capDiscardGameShare: gameCount ? gamesWithCapDiscard / gameCount : 0,
    allTeamsAtCapGameShare: gameCount ? gamesAllAtCap / gameCount : 0,
    journeyTokenGameShare: gameCount ? gamesWithJourneyToken / gameCount : 0,
    zeroSpendTeamShare: teams.length ? zeroSpendTeams / teams.length : 0,
    meanResourcesEnd,
    meanServiceScore: serviceSum / n,
    resourcesGrantedBySourceTotal: grantedTotal,
    resourcesSpentByUseTotal: spentTotal,
  };
}

// ---------------------------------------------------------------------------
// Fairness helpers (Group X4)
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Win share per SEAT (0-indexed team position) across a batch of games —
 * a team "wins" if it appears in that game's `winners`. */
export function winShareBySeat(results: SimResult[]): number[] {
  const teamCount = results[0]?.teamCount ?? 0;
  const wins = new Array(teamCount).fill(0) as number[];
  for (const r of results) {
    r.teams.forEach((t, seat) => {
      if (r.winners.includes(t.id)) wins[seat]!++;
    });
  }
  return wins.map((w) => (results.length ? w / results.length : 0));
}

/** First-team-to-Rome share per seat: the seat that appears FIRST in
 * finalPositions (the §21 comparator's winner-by-position, which for a
 * finished team reflects arrival order among finishers). */
export function firstToFinishShareBySeat(results: SimResult[]): number[] {
  const teamCount = results[0]?.teamCount ?? 0;
  const counts = new Array(teamCount).fill(0) as number[];
  for (const r of results) {
    if (r.winners.length === 0) continue;
    const firstId = r.finalPositions.find((id) => r.winners.includes(id));
    if (!firstId) continue;
    const seat = r.teams.findIndex((t) => t.id === firstId);
    if (seat >= 0) counts[seat]!++;
  }
  return counts.map((c) => (results.length ? c / results.length : 0));
}
