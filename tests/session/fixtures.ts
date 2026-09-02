// Shared session-test fixtures. Reuses testJourney from the Phase 2 engine
// fixtures (already validated, has a fork with taskFocus and a relay
// community event) so Phase 3 tests exercise the same real structure the
// engine does. Task supply comes from the synthetic factory since the
// dev-sample pack is far too small for statistical tests.

import { testJourney } from "../engine/fixtures";
import { buildSessionDeck, type BuildOptions, type SessionDeck } from "../../src/session/builder";
import { makeSyntheticPack } from "./factory";

export { testJourney };

/** A large synthetic pack: 7 categories x 3 difficulties x countPerCell. */
export function bigPack(countPerCell = 100) {
  return makeSyntheticPack(countPerCell);
}

export function defaultBuildOptions(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    journey: testJourney,
    packs: [bigPack()],
    teamIds: ["alpha", "beta"],
    turnTaskLimit: 3,
    seed: "session-test-seed",
    ...overrides,
  };
}

/** testJourney's s1/s2 have no taskFocus mismatch issues for plain
 * non-focus rotation tests; this stage id deliberately does not exist in
 * the journey, so findStageInJourney returns undefined and nextTask always
 * falls back to ordinary (non-focus) per-team rotation. */
export const NO_FOCUS_STAGE = "no-such-stage";

/** Draws `roundsPerTeam` tasks for each team in turn order, round by round,
 * returning the served task ids in call order. */
export function driveMany(
  deck: SessionDeck,
  teamIds: string[],
  stageId: string,
  roundsPerTeam: number,
): string[] {
  const ids: string[] = [];
  for (let r = 0; r < roundsPerTeam; r++) {
    for (const teamId of teamIds) {
      ids.push(deck.nextTask(teamId, stageId).id);
    }
  }
  return ids;
}

/** Same as driveMany but returns the served categories instead of ids. */
export function driveManyCategories(
  deck: SessionDeck,
  teamIds: string[],
  stageId: string,
  roundsPerTeam: number,
): Record<string, string[]> {
  const byTeam: Record<string, string[]> = {};
  for (const teamId of teamIds) byTeam[teamId] = [];
  for (let r = 0; r < roundsPerTeam; r++) {
    for (const teamId of teamIds) {
      byTeam[teamId]!.push(deck.nextTask(teamId, stageId).category);
    }
  }
  return byTeam;
}

export function build(overrides: Partial<BuildOptions> = {}) {
  return buildSessionDeck(defaultBuildOptions(overrides));
}
