// PHASE2_SPEC Group G — milestones and community events.

import { describe, expect, it } from "vitest";
import { IllegalCommandError } from "../../src/engine/errors";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import type { GameEngine } from "../../src/engine/engine";
import { advanceBothTeamsToFork, makeEngine, presentAndComplete, taskById } from "./fixtures";

describe("G1 — a milestone's event triggers once, on first arrival only", () => {
  it("Mark arriving after Matthew does not re-trigger the relay event", () => {
    const engine = makeEngine();
    advanceBothTeamsToFork(engine); // both teams complete s1; only the first arrival should trigger

    const triggered = engine.getSession().triggeredMilestones;
    expect(triggered.filter((m) => m === "midway")).toHaveLength(1);
  });
});

describe("G2 — ordinary turn order resumes correctly around an event, with 3 teams", () => {
  it("advances 1 -> 2 -> 3 -> 1, not skipping or repeating a team", () => {
    const three = [
      { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
      { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
      { id: "luke", name: "Luke", color: "#00c", symbol: "ox" },
    ];
    const engine = makeEngine({ teams: three, turnTaskLimit: 1 });
    engine.dispatch({ type: "startGame" });
    expect(engine.getSession().activeTeamIndex).toBe(0);

    presentAndComplete(engine, "correct"); // Matthew turn 1: 1/2, turn ends (limit 1)
    // Mark and Luke each get a throwaway turn before Matthew's next.
    presentAndComplete(engine, "incorrect");
    presentAndComplete(engine, "incorrect");
    expect(engine.getSession().activeTeamIndex).toBe(0);

    presentAndComplete(engine, "correct"); // Matthew: 2/2, s1 done -> event pending
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "resolveCommunityEvent" });

    expect(engine.getSession().activeTeamIndex).toBe(1); // Mark, not Luke and not Matthew again
    presentAndComplete(engine, "incorrect"); // Mark's turn, doesn't matter what happens
    expect(engine.getSession().activeTeamIndex).toBe(2); // Luke
    presentAndComplete(engine, "incorrect");
    expect(engine.getSession().activeTeamIndex).toBe(0); // back to Matthew
  });
});

function reachRelayEvent(engine: GameEngine): void {
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct");
  presentAndComplete(engine, "correct"); // Matthew: s1 done -> landmarkIntroduction
  engine.dispatch({ type: "beginCommunityEvent" });
}

describe("G3 — a relay meeting its threshold applies the room reward", () => {
  it("two correct relay answers trigger the grant-resource-every-team reward", () => {
    const engine = makeEngine();
    reachRelayEvent(engine);
    expect(engine.getState()).toBe("communityEvent");

    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "mark", correct: true }); // meets successThreshold: 2
    engine.dispatch({ type: "resolveCommunityEvent" });

    // The relay's reward is grant-resource-every-team, resource "choice" —
    // every team should now have a pending choice to resolve. Group P1:
    // matthew also holds a stage-reward choice from completing s1.
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(2);
    expect(engine.getPendingChoicesForTeam("mark")).toBe(1);

    const log = engine.getSession().eventLog.map((e) => e.text).join(" | ");
    expect(log).toMatch(/succeeds at/i);
  });
});

describe("G4 — a relay that misses its threshold applies no reward and no penalty", () => {
  it("one correct answer (below the threshold of 2) grants nothing and harms no one", () => {
    const engine = makeEngine();
    reachRelayEvent(engine);
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true }); // only 1, threshold is 2

    const matthewBefore = engine.getTeam("matthew")!;
    const markBefore = engine.getTeam("mark")!;
    engine.dispatch({ type: "resolveCommunityEvent" });

    // Group P1: matthew still holds the stage-reward choice from completing
    // s1 — the relay's failure withholds only the relay's own reward.
    expect(engine.getPendingChoicesForTeam("matthew")).toBe(1);
    expect(engine.getPendingChoicesForTeam("mark")).toBe(0);
    expect(engine.getTeam("matthew")!.resources).toEqual(matthewBefore.resources);
    expect(engine.getTeam("mark")!.resources).toEqual(markBefore.resources);
    expect(engine.getTeam("matthew")!.stageSuccesses).toBe(matthewBefore.stageSuccesses); // no penalty
    const log = engine.getSession().eventLog.map((e) => e.text).join(" | ");
    expect(log).toMatch(/does not meet the goal/i);
  });
});

function markSkipsATurn(engine: GameEngine): void {
  engine.dispatch({ type: "presentTask" });
  engine.dispatch({ type: "acceptAnswer" });
  engine.dispatch({ type: "reveal" });
  engine.dispatch({ type: "rule", result: "skipped" });
  engine.dispatch({ type: "finishTeaching" });
}

/**
 * Drives Matthew (only) all the way to s2's completion, triggering the
 * contribution event at "ford" — the community-event fixture that requires
 * getting past the fork. turnTaskLimit is pinned to 1 so every turn (real
 * or throwaway) is exactly one dispatched task, keeping the choreography
 * unambiguous. Mark's turns are inert skips; Mark never actually progresses.
 */
function reachContributionEvent(engine: GameEngine): void {
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct"); // Matthew turn 1: 1/2
  markSkipsATurn(engine); // Mark's throwaway turn
  presentAndComplete(engine, "correct"); // Matthew turn 2: 2/2 -> s1 done -> landmarkIntroduction
  engine.dispatch({ type: "beginCommunityEvent" });
  engine.dispatch({ type: "resolveCommunityEvent" }); // relay unmet, harmless -> Mark's turn
  markSkipsATurn(engine); // Mark's throwaway turn
  // Matthew turn 3: forkChoice
  engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
  presentAndComplete(engine, "correct"); // a-stage req 1 -> done, no milestone -> Mark's turn
  markSkipsATurn(engine);
  // Matthew turn 4: on s2 (req 1)
  presentAndComplete(engine, "correct"); // s2 done -> arrives at "ford" -> contribution event
  engine.dispatch({ type: "beginCommunityEvent" });
}

describe("G5 — contribution pledges validate ownership, earn Service, and never refund", () => {
  it("rejects pledging more than the team owns", () => {
    const engine = makeEngine({
      turnTaskLimit: 1,
      startingResources: { insight: 0, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    reachContributionEvent(engine);
    expect(engine.getState()).toBe("communityEvent");
    expect(() =>
      engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 }),
    ).toThrow(IllegalCommandError); // owns 0
  });

  it("a valid pledge earns Service and is never refunded even if the event fails", () => {
    const engine = makeEngine({
      turnTaskLimit: 1,
      startingResources: { insight: 1, provision: 0, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    reachContributionEvent(engine);
    const serviceBefore = engine.getTeam("matthew")!.serviceScore;

    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 });
    expect(engine.getTeam("matthew")!.resources.insight).toBe(0); // deducted immediately

    engine.dispatch({ type: "resolveCommunityEvent" }); // only 1 pledged; threshold is 2 -> fails
    expect(engine.getTeam("matthew")!.resources.insight).toBe(0); // still not refunded
    expect(engine.getTeam("matthew")!.serviceScore).toBeGreaterThan(serviceBefore); // still earned
  });
});

describe("G6 — meeting the contribution threshold applies the room reward", () => {
  it("combined pledges from both teams reach the threshold and reduce the next stage", () => {
    const engine = makeEngine({
      turnTaskLimit: 1,
      startingResources: { insight: 1, provision: 1, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    reachContributionEvent(engine);

    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 });
    engine.dispatch({ type: "contribute", teamId: "mark", resource: "provision", amount: 1 }); // total 2, meets threshold
    engine.dispatch({ type: "resolveCommunityEvent" });

    const log = engine.getSession().eventLog.map((e) => e.text).join(" | ");
    expect(log).toMatch(/succeeds at/i);
  });
});

describe("G7 — reduce-next-stage-requirement floors at 1", () => {
  it("a reduction larger than the stage requirement never drops below 1", () => {
    const engine = makeEngine({
      turnTaskLimit: 1,
      startingResources: { insight: 1, provision: 1, courage: 0 },
      taskSource: new ArrayTaskSource([taskById("sk-easy-1"), taskById("sk-easy-2")]),
    });
    reachContributionEvent(engine);
    // s3 (the stage after "ford") normally requires 2; the fixture's
    // contribution reward reduces by 2, which would floor at 0 without the
    // explicit floor — must land at 1.
    expect(engine.getEffectiveStageRequirement("matthew")).toBe(2); // unreduced yet

    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 });
    engine.dispatch({ type: "contribute", teamId: "mark", resource: "provision", amount: 1 });
    engine.dispatch({ type: "resolveCommunityEvent" });

    markSkipsATurn(engine); // Mark's throwaway turn, back to Matthew
    // Matthew's next stage is s3 now.
    expect(engine.getTeam("matthew")!.currentStageId).toBe("s3");
    expect(engine.getEffectiveStageRequirement("matthew")).toBe(1); // floored, not 0
  });
});

