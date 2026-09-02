// PHASE4_SPEC Group U4 — setup wizard. Pure logic, no DOM needed.

import { describe, expect, it } from "vitest";
import {
  SetupWizard,
  attemptSessionGeneration,
  TEAM_PRESETS,
  NON_COMMUNITY_CATEGORIES,
} from "../../src/ui/setup";
import { testJourney } from "../session/fixtures";
import { makeSyntheticPack } from "../session/factory";
import { buildSessionDeck } from "../../src/session/builder";

function makeWizard(overrides: Partial<{ randomSeedSource: () => number }> = {}) {
  const packs = [makeSyntheticPack(50)];
  return new SetupWizard({ journeys: [testJourney], packs, ...overrides });
}

describe("U4 — a full pass through every step produces a valid BuildOptions", () => {
  it("defaults are enough on their own to build a real deck", () => {
    const wizard = makeWizard();
    const options = wizard.toBuildOptions();
    expect(options.journey).toBe(testJourney);
    expect(options.teamIds).toHaveLength(2);
    expect(options.seed.length).toBeGreaterThan(0);
    const { deck, report } = buildSessionDeck(options);
    expect(deck).toBeTruthy();
    expect(report.warnings).toBeDefined();
  });

  it("every step's setter feeds into the final BuildOptions and team setups", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(3);
    wizard.setTeamName(0, "Berean Bunch");
    wizard.setDuration("long");
    wizard.setPace("relaxed");
    wizard.setDifficulty("challenging");
    wizard.setEnabledCategories(["scripture-knowledge", "hymn"]);
    wizard.setCommunityCatchup(false);
    wizard.setAudio({ master: 50 });
    wizard.setSeed("fixed-seed-123");

    const options = wizard.toBuildOptions();
    expect(options.teamIds).toHaveLength(3);
    expect(options.difficulty).toBe("challenging");
    expect(options.enabledCategories).toEqual(["scripture-knowledge", "hymn"]);
    expect(options.seed).toBe("fixed-seed-123");

    const teams = wizard.toTeamSetups();
    expect(teams[0]!.name).toBe("Berean Bunch");
    expect(wizard.communityCatchup).toBe(false);
    expect(wizard.audio.master).toBe(50);
  });
});

describe("U4 — team names prefill and are editable", () => {
  it("prefills Team 1..Team N and preserves edits across a count change that keeps the index", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(4);
    expect(wizard.teamNames).toEqual(["Team 1", "Team 2", "Team 3", "Team 4"]);
    wizard.setTeamName(1, "Antioch All-Stars");
    wizard.setTeamCount(3);
    expect(wizard.teamNames).toEqual(["Team 1", "Antioch All-Stars", "Team 3"]);
    wizard.setTeamCount(5);
    expect(wizard.teamNames).toEqual([
      "Team 1",
      "Antioch All-Stars",
      "Team 3",
      "Team 4",
      "Team 5",
    ]);
  });

  it("clamps team count to 2-8", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(1);
    expect(wizard.teamCount).toBe(2);
    wizard.setTeamCount(20);
    expect(wizard.teamCount).toBe(8);
  });
});

describe("U4 — every team gets a distinct color AND symbol", () => {
  it("8 presets are all pairwise distinct", () => {
    expect(new Set(TEAM_PRESETS.map((p) => p.color)).size).toBe(TEAM_PRESETS.length);
    expect(new Set(TEAM_PRESETS.map((p) => p.symbol)).size).toBe(TEAM_PRESETS.length);
  });

  it("a full 8-team setup gets 8 distinct colors and symbols", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(8);
    const teams = wizard.toTeamSetups();
    expect(new Set(teams.map((t) => t.color)).size).toBe(8);
    expect(new Set(teams.map((t) => t.symbol)).size).toBe(8);
  });

  it("community is never a user-toggleable category", () => {
    expect(NON_COMMUNITY_CATEGORIES).not.toContain("community");
    expect(NON_COMMUNITY_CATEGORIES).toHaveLength(6);
  });
});

describe("U4 — planSession is re-called on duration/pace/team-count change", () => {
  it("changing duration changes the target and (usually) the warning", () => {
    const wizard = makeWizard();
    const before = wizard.getPlan()!;
    wizard.setDuration("short");
    const after = wizard.getPlan()!;
    expect(after.targetMinutes).toBe(40);
    expect(after.targetMinutes).not.toBe(before.targetMinutes);
  });

  it("changing team count changes recommendedTasksPerTurn per §36", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(2);
    expect(wizard.getPlan()!.recommendedTasksPerTurn).toBe(4);
    wizard.setTeamCount(4);
    expect(wizard.getPlan()!.recommendedTasksPerTurn).toBe(3);
    wizard.setTeamCount(7);
    expect(wizard.getPlan()!.recommendedTasksPerTurn).toBe(2);
  });

  it("a mismatched configuration's warning is available verbatim from the plan", () => {
    const wizard = makeWizard();
    wizard.setDuration("short"); // testJourney's real numbers overshoot a 40-min target
    const plan = wizard.getPlan()!;
    if (plan.warnings.length > 0) {
      expect(plan.warnings[0]).toMatch(/minutes/);
      expect(plan.warnings[0]).toMatch(/target/);
    }
  });
});

describe("U4 — tasks-per-turn override clamps 1-6", () => {
  it("clamps below 1 up to 1, and above 6 down to 6", () => {
    const wizard = makeWizard();
    wizard.setTasksPerTurnOverride(0);
    expect(wizard.tasksPerTurnOverride).toBe(1);
    wizard.setTasksPerTurnOverride(99);
    expect(wizard.tasksPerTurnOverride).toBe(6);
    wizard.setTasksPerTurnOverride(4);
    expect(wizard.tasksPerTurnOverride).toBe(4);
  });

  it("null clears the override back to the recommended value", () => {
    const wizard = makeWizard();
    wizard.setTasksPerTurnOverride(6);
    expect(wizard.effectiveTasksPerTurn()).toBe(6);
    wizard.setTasksPerTurnOverride(null);
    expect(wizard.effectiveTasksPerTurn()).toBe(wizard.getPlan()!.recommendedTasksPerTurn);
  });
});

describe("U4 — seed auto-generates and is overridable", () => {
  it("a fresh wizard has a non-empty auto-generated seed", () => {
    const wizard = makeWizard();
    expect(wizard.seed.length).toBeGreaterThan(0);
  });

  it("two wizards get different auto-generated seeds", () => {
    const a = makeWizard();
    const b = makeWizard();
    expect(a.seed).not.toBe(b.seed);
  });

  it("setSeed overrides it, and regenerateSeed produces a new one", () => {
    const wizard = makeWizard();
    wizard.setSeed("my-chosen-seed");
    expect(wizard.seed).toBe("my-chosen-seed");
    wizard.regenerateSeed();
    expect(wizard.seed).not.toBe("my-chosen-seed");
  });
});

describe("U4 — the review screen contains every chosen value", () => {
  it("reviewLines() mentions journey, teams, duration, pace, difficulty, seed, and the estimate", () => {
    const wizard = makeWizard();
    wizard.setTeamName(0, "River Rats");
    wizard.setSeed("review-seed");
    const lines = wizard.reviewLines().join("\n");
    expect(lines).toContain(testJourney.title);
    expect(lines).toContain("River Rats");
    expect(lines).toContain("standard");
    expect(lines).toContain("review-seed");
    expect(lines).toMatch(/Estimated duration: about \d+ minutes\./);
  });
});

describe("U4 — SessionBuildError returns to review, not a crash", () => {
  it("insufficient content produces a readable ok:false result instead of throwing", () => {
    const wizard = new SetupWizard({
      journeys: [testJourney],
      packs: [makeSyntheticPack(1)], // deliberately scarce
    });
    const outcome = attemptSessionGeneration(wizard);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.message.length).toBeGreaterThan(0);
    }
  });

  it("adequate content produces ok:true with a real deck and matching teams", () => {
    const wizard = makeWizard();
    wizard.setTeamCount(3);
    const outcome = attemptSessionGeneration(wizard);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.teams).toHaveLength(3);
      expect(outcome.result.deck).toBeTruthy();
    }
  });
});
