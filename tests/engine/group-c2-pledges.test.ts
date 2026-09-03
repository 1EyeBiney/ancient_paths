// PHASE7_SPEC Group C2 — pledge amounts and the exceptional-contribution
// Service award, on testJourney's contribution event at "ford"
// (contributionThreshold 2; exceptional = max(2, ceil(0.5*2)) = 2 per
// team — so a single team's own exceptional pledge always also meets the
// room's overall threshold there. "Exceptional but the room still
// failed" needs contributionThreshold clearly above the exceptional
// amount, so that one test uses a bespoke journey with threshold 6.)

import { describe, expect, it } from "vitest";
import { journeySchema } from "../../src/content/schemas";
import { createEngine } from "../../src/engine/engine";
import type { GameEngine } from "../../src/engine/engine";
import { createRng } from "../../src/engine/rng";
import { ArrayTaskSource } from "../../src/engine/taskSource";
import { makeEngine, presentAndComplete, testJourney, testPack } from "./fixtures";

function driveToFordEvent(engine: GameEngine): void {
  engine.dispatch({ type: "startGame" });
  presentAndComplete(engine, "correct"); // matthew 1/2
  presentAndComplete(engine, "correct"); // matthew 2/2 -> s1 done -> relay event at "midway"
  engine.dispatch({ type: "beginCommunityEvent" });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "relayAnswer", teamId: "matthew", correct: true });
  engine.dispatch({ type: "resolveCommunityEvent" }); // -> mark's turn

  presentAndComplete(engine, "correct"); // mark 1/2
  presentAndComplete(engine, "correct"); // mark 2/2 -> s1 done (event already fired) -> fork
  engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // matthew
  presentAndComplete(engine, "correct"); // matthew a-stage done -> s2
  engine.dispatch({ type: "chooseRoute", routeId: "route-a" }); // mark
  presentAndComplete(engine, "correct"); // mark a-stage done -> s2
  presentAndComplete(engine, "correct"); // matthew s2 done -> "ford" -> contribution event pending

  expect(engine.getState()).toBe("landmarkIntroduction");
  engine.dispatch({ type: "beginCommunityEvent" });
  expect(engine.getState()).toBe("communityEvent");
}

function makeStandardEngine(): GameEngine {
  const engine = makeEngine({ startingResources: { insight: 5, provision: 5, courage: 5 } });
  driveToFordEvent(engine);
  return engine;
}

describe("C2 — pledges", () => {
  it("a pledge of 2 deducts 2 from the team and counts toward the threshold", () => {
    const engine = makeStandardEngine();
    const before = engine.getTeam("matthew")!.resources.insight;
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 2 });
    expect(engine.getTeam("matthew")!.resources.insight).toBe(before - 2);
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew contributes 2 insight.")).toBe(true);

    engine.dispatch({ type: "declineContribution", teamId: "mark" });
    engine.dispatch({ type: "resolveCommunityEvent" });
    // threshold is 2 — matthew's own pledge already meets it.
    expect(engine.getSession().eventLog.some((e) => e.text === "The room succeeds at The Contribution Test.")).toBe(true);
  });

  it("pledgedByTeam sums repeated pledges from the same team", () => {
    const engine = makeStandardEngine();
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 1 });
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "provision", amount: 1 });
    // Neither single pledge of 1 meets the exceptional threshold of 2, but
    // their SUM (pledgedByTeam) does.
    engine.dispatch({ type: "declineContribution", teamId: "mark" });
    engine.dispatch({ type: "resolveCommunityEvent" });
    expect(engine.getSession().eventLog.some((e) => e.text === "Team Matthew made an exceptional contribution.")).toBe(true);
  });

  it("a team at or above the exceptional threshold earns +2 Service and the log line; a team below does not", () => {
    // A bespoke, higher threshold (6) so a below-exceptional pledge (1) is
    // genuinely distinguishable from an exceptional one (3) without the
    // single exceptional pledge alone already satisfying the room's goal.
    const journey = journeySchema.parse({
      ...testJourney,
      communityEvents: testJourney.communityEvents.map((e) =>
        e.id === "contrib-event" ? { ...e, contributionThreshold: 6 } : e,
      ),
    });
    const engine = createEngine({
      journey,
      packs: [testPack],
      teams: [
        { id: "matthew", name: "Matthew", color: "#c00", symbol: "cross" },
        { id: "mark", name: "Mark", color: "#0c0", symbol: "lion" },
      ],
      turnTaskLimit: 3,
      rng: createRng("c2-threshold-seed"),
      taskSource: new ArrayTaskSource(testPack.tasks),
      startingResources: { insight: 5, provision: 5, courage: 5 },
    });
    driveToFordEvent(engine);

    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 3 }); // >= 2: exceptional
    engine.dispatch({ type: "contribute", teamId: "mark", resource: "provision", amount: 1 }); // < 2: not exceptional
    engine.dispatch({ type: "resolveCommunityEvent" }); // 3+1=4 < 6: the room still fails

    const log = engine.getSession().eventLog;
    expect(log.some((e) => e.text === "The room does not meet the goal for The Contribution Test.")).toBe(true);
    expect(log.some((e) => e.text === "Team Matthew made an exceptional contribution.")).toBe(true);
    expect(log.some((e) => e.text === "Team Mark made an exceptional contribution.")).toBe(false);
  });

  it("a 2-unit exceptional pledge nets 3 Service (1 per-pledge donateResource + 2 exceptional)", () => {
    const engine = makeStandardEngine();
    const before = engine.getTeam("matthew")!.serviceScore;
    engine.dispatch({ type: "contribute", teamId: "matthew", resource: "insight", amount: 2 });
    engine.dispatch({ type: "declineContribution", teamId: "mark" });
    engine.dispatch({ type: "resolveCommunityEvent" });
    expect(engine.getTeam("matthew")!.serviceScore - before).toBe(3);
  });
});
