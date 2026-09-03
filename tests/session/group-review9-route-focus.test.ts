// Phase 9 review (OPEN_QUESTIONS item 35) — a fork route's taskFocus
// governs draws for the stages inside it. PHASE3_SPEC's planner step 4
// says "the team's current stage/route taskFocus"; the Phase 3 builder
// looked at the stage alone, and since the schema requires taskFocus on a
// route but makes it optional on a stage, every route stage in the real
// journey was getting plain rotation — its description's "testing X and Y"
// was untrue. Surfaced by the real content, not by the synthetic fixtures.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSessionDeck } from "../../src/session/builder";
import { validateJourney } from "../../src/content/loader";
import { defaultBuildOptions, bigPack, testJourney } from "./fixtures";

describe("review 9 — route taskFocus governs the route's stages", () => {
  it("testJourney: a-stage draws only route-a's focus, b-stage only route-b's, s1 keeps its own", () => {
    const { deck } = buildSessionDeck(defaultBuildOptions({ teamIds: ["alpha", "beta"] }));
    const a = new Set<string>();
    const b = new Set<string>();
    const s1 = new Set<string>();
    for (let i = 0; i < 30; i++) {
      a.add(deck.nextTask("alpha", "a-stage").category);
      b.add(deck.nextTask("beta", "b-stage").category);
      s1.add(deck.nextTask("alpha", "s1").category);
    }
    // testJourney fixture: route-a focuses scripture-knowledge, route-b
    // historical-context, s1 scripture-knowledge (its own, stage-level).
    expect([...a]).toEqual(["scripture-knowledge"]);
    expect([...b]).toEqual(["historical-context"]);
    expect([...s1]).toEqual(["scripture-knowledge"]);
    expect(testJourney.entries[1]!.kind).toBe("fork");
  });

  it("a stage inside a route that declares its OWN focus keeps the stage's focus", () => {
    const journey = structuredClone(testJourney);
    const fork = journey.entries[1]!;
    if (fork.kind !== "fork") throw new Error("fixture changed");
    fork.routes[0]!.stages[0]!.taskFocus = ["decision-strategy"];
    const { deck } = buildSessionDeck(defaultBuildOptions({ journey, teamIds: ["alpha", "beta"] }));
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(deck.nextTask("alpha", "a-stage").category);
    expect([...seen]).toEqual(["decision-strategy"]);
  });

  it("the real journey: every fork-route stage draws within its route's declared focus", () => {
    const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
    const result = validateJourney(raw, "jerusalem-rome.json");
    if (!result.ok) throw new Error(result.errors.join("; "));
    const journey = result.data;
    const { deck } = buildSessionDeck(
      defaultBuildOptions({ journey, packs: [bigPack()], teamIds: ["alpha", "beta"] }),
    );
    let routeStages = 0;
    for (const entry of journey.entries) {
      if (entry.kind !== "fork") continue;
      for (const route of entry.routes) {
        for (const stage of route.stages) {
          routeStages++;
          const allowed = new Set<string>(stage.taskFocus ?? route.taskFocus);
          for (let i = 0; i < 20; i++) {
            const category = deck.nextTask("alpha", stage.id).category;
            expect(allowed.has(category), `${stage.id}: ${category} outside route focus`).toBe(true);
          }
        }
      }
    }
    expect(routeStages).toBe(5); // three north-fork routes + two aegean-fork routes
  });
});
