// PHASE7_SPEC Group C1 — catch-up. testJourney's shape: s1 -> fork1
// (route-a/route-b, 1 stage each) -> s2 -> s3, with a relay event at
// "midway" (arrives from s1) and a contribution event at "ford" (arrives
// from s2). ArrayTaskSource ignores teamId/stageId and just round-robins,
// so any small task list works regardless of which stage is active.

import { describe, expect, it } from "vitest";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { createEngine, type GameEngine, type TeamSetup } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { DEFAULTS } from "../../src/config/defaults";
import { testJourney, testPack, completeCurrentTask } from "./fixtures";

const matthew: TeamSetup = { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" };
const mark: TeamSetup = { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" };
const luke: TeamSetup = { id: "luke", name: "Luke", color: "#00c", symbol: "ox" };

function makeMultiTeamEngine(teams: TeamSetup[], configOverrides: Record<string, unknown> = {}): GameEngine {
  return createEngine({
    journey: testJourney,
    packs: [testPack],
    teams,
    turnTaskLimit: 1, // one task ends the turn — makes turn rotation easy to script
    rng: createRng("c1-seed"),
    taskSource: new ArrayTaskSource(testPack.tasks),
    startingResources: { insight: 5, provision: 5, courage: 5 },
    config: configOverrides,
  });
}

/** Present a task for the currently active team and rule it, in one call
 * (turnTaskLimit is 1, so this always ends that team's turn). */
function turn(engine: GameEngine, result: "correct" | "incorrect"): void {
  engine.dispatch({ type: "presentTask" });
  completeCurrentTask(engine, result);
}

describe("C1 — catch-up", () => {
  it("teams more than 2 entries behind the leader get a resource choice when the room succeeds; the leader gets none", () => {
    const engine = makeMultiTeamEngine([matthew, mark, luke]);
    engine.dispatch({ type: "startGame" });

    turn(engine, "correct"); // matthew 1/2 on s1
    turn(engine, "incorrect"); // mark stays 0/2
    turn(engine, "incorrect"); // luke stays 0/2
    turn(engine, "correct"); // matthew 2/2 -> s1 complete -> relay event at "midway"
    expect(engine.getState()).toBe("landmarkIntroduction");

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true }); // threshold 2 met
    engine.dispatch({ type: "resolveCommunityEvent" }); // success; gap is only 1 here — no catch-up yet
    expect(engine.getSession().eventLog.some((e) => e.text.startsWith("Catch-up:"))).toBe(false);

    // mark and luke never progress past s1; matthew races on: fork -> route-a -> s2 -> "ford".
    turn(engine, "incorrect"); // mark
    turn(engine, "incorrect"); // luke
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    turn(engine, "correct"); // matthew: a-stage (req 1) complete -> s2, ordinal 2

    turn(engine, "incorrect"); // mark
    turn(engine, "incorrect"); // luke
    turn(engine, "correct"); // matthew: s2 (req 1) complete -> arrives "ford" -> s3 (ordinal 3), contrib-event pending
    expect(engine.getState()).toBe("landmarkIntroduction");
    expect(engine.getStagesBehindLeader("mark")).toBe(3);
    expect(engine.getStagesBehindLeader("luke")).toBe(3);
    expect(engine.getStagesBehindLeader("matthew")).toBe(0);

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 4 }); // threshold 4
    engine.dispatch({ type: "resolveCommunityEvent" });
    expect(engine.getSession().eventLog.some((e) => e.text === "The room succeeds at The Contribution Test.")).toBe(true);

    const markChoices = engine.getPendingChoiceDetailsForTeam("mark");
    const lukeChoices = engine.getPendingChoiceDetailsForTeam("luke");
    const matthewChoices = engine.getPendingChoiceDetailsForTeam("matthew");
    expect(markChoices.some((c) => c.reason === "catch-up")).toBe(true);
    expect(lukeChoices.some((c) => c.reason === "catch-up")).toBe(true);
    expect(matthewChoices.some((c) => c.reason === "catch-up")).toBe(false);

    const log = engine.getSession().eventLog;
    expect(log.some((e) => e.text === "Catch-up: Team Mark is 3 stages behind and may choose 1 resource.")).toBe(true);
    expect(log.some((e) => e.text === "Catch-up: Team Luke is 3 stages behind and may choose 1 resource.")).toBe(true);
    expect(log.some((e) => e.text.includes("Catch-up: Team Matthew"))).toBe(false);
  });

  it("stagesBehind is a strict '>' boundary: exactly 2 entries behind grants nothing", () => {
    const engine = makeMultiTeamEngine([matthew, mark]);
    engine.dispatch({ type: "startGame" });

    turn(engine, "correct"); // matthew 1/2
    turn(engine, "correct"); // mark 1/2
    turn(engine, "correct"); // matthew 2/2 -> s1 complete -> relay event
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" }); // matthew -> mark's turn

    turn(engine, "correct"); // mark 2/2 -> s1 complete too (event already triggered, no re-fire) -> fork
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // matthew: fork -> route-a
    turn(engine, "correct"); // matthew: a-stage complete -> s2 (ordinal 2)
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // mark: fork -> route-a
    turn(engine, "incorrect"); // mark: a-stage stays 0/1 — parked at ordinal 1 (the fork's own index)

    turn(engine, "correct"); // matthew: s2 complete -> "ford" -> s3 (ordinal 3); contrib-event pending
    expect(engine.getStagesBehindLeader("mark")).toBe(2); // 3 - 1, exactly at the configured threshold

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 4 });
    engine.dispatch({ type: "resolveCommunityEvent" });

    expect(engine.getSession().eventLog.some((e) => e.text.startsWith("Catch-up:"))).toBe(false);
    expect(engine.getPendingChoiceDetailsForTeam("mark").some((c) => c.reason === "catch-up")).toBe(false);
  });

  it("catchUp.enabled: false grants nothing even to a team far behind", () => {
    const engine = makeMultiTeamEngine([matthew, mark, luke], {
      catchUp: { ...DEFAULTS.catchUp, enabled: false },
    });
    engine.dispatch({ type: "startGame" });

    turn(engine, "correct");
    turn(engine, "incorrect");
    turn(engine, "incorrect");
    turn(engine, "correct");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" });

    turn(engine, "incorrect");
    turn(engine, "incorrect");
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    turn(engine, "correct");
    turn(engine, "incorrect");
    turn(engine, "incorrect");
    turn(engine, "correct");
    expect(engine.getStagesBehindLeader("mark")).toBe(3);

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 4 });
    engine.dispatch({ type: "resolveCommunityEvent" });

    expect(engine.getSession().eventLog.some((e) => e.text.startsWith("Catch-up:"))).toBe(false);
    expect(engine.getPendingChoiceDetailsForTeam("mark").some((c) => c.reason === "catch-up")).toBe(false);
    expect(engine.getPendingChoiceDetailsForTeam("luke").some((c) => c.reason === "catch-up")).toBe(false);
  });

  it("a failed community event grants no catch-up, even to an eligible team", () => {
    const engine = makeMultiTeamEngine([matthew, mark, luke]);
    engine.dispatch({ type: "startGame" });

    turn(engine, "correct");
    turn(engine, "incorrect");
    turn(engine, "incorrect");
    turn(engine, "correct");
    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
    engine.dispatch({ type: "resolveCommunityEvent" });

    turn(engine, "incorrect");
    turn(engine, "incorrect");
    engine.dispatch({ type: "chooseRoute", routeId: "route-a" });
    turn(engine, "correct");
    turn(engine, "incorrect");
    turn(engine, "incorrect");
    turn(engine, "correct"); // matthew reaches "ford"; contrib-event pending, gap 3 for mark/luke

    engine.dispatch({ type: "beginCommunityEvent" });
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 }); // below threshold 4
    engine.dispatch({ type: "resolveCommunityEvent" });

    expect(engine.getSession().eventLog.some((e) => e.text === "The room does not meet the goal for The Contribution Test.")).toBe(
      true,
    );
    expect(engine.getSession().eventLog.some((e) => e.text.startsWith("Catch-up:"))).toBe(false);
    expect(engine.getPendingChoiceDetailsForTeam("mark").some((c) => c.reason === "catch-up")).toBe(false);
  });
});
