// @vitest-environment jsdom
// PHASE5B_SPEC Group M4 — synchronization: markers track the real
// engine, driven through a complete game against the REAL journey.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import { mapManifestSchema } from "../../src/ui/mapProjection";
import { teamMapPosition } from "../../src/ui/mapProjection";
import { makeApp, beginByMouse, keyboardStep, type AppHarness } from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function loadReal() {
  const packResult = validateContentPack(
    JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8")),
    "dev-playtest.json",
  );
  const journeyResult = validateJourney(
    JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8")),
    "jerusalem-rome.json",
  );
  const manifest = mapManifestSchema.parse(
    JSON.parse(readFileSync(resolve("public/map/mediterranean.json"), "utf8")),
  );
  if (!packResult.ok || !journeyResult.ok) throw new Error("real content failed to validate");
  return { pack: packResult.data, journey: journeyResult.data, manifest };
}

describe("M4 — every marker's position equals teamMapPosition for the current engine state", () => {
  it("through a complete game against the real journey, pack, and manifest", () => {
    const { pack, journey, manifest } = loadReal();
    h = makeApp({ journeys: [journey], packs: [pack], extra: { mapManifest: manifest } });
    beginByMouse(h, ["Lydia", "Silas"]);
    expect(h.app.getMode()).toBe("playing");

    let steps = 0;
    let sawMap = false;
    const check = () => {
      const engine = h!.app.getEngine()!;
      const session = engine.getSession();
      const mapEl = h!.root.querySelector("#audience-view .map");
      if (mapEl) {
        sawMap = true;
        const markers = Array.from(mapEl.querySelectorAll<HTMLElement>(".map-marker"));
        expect(markers).toHaveLength(session.teams.length);
        for (const team of session.teams) {
          const marker = markers.find((m) => m.dataset.teamId === team.id)!;
          const expected = teamMapPosition(team, journey, session.teams)!;
          expect(marker.style.getPropertyValue("--x")).toBe(`${expected.xPercent}%`);
          expect(marker.style.getPropertyValue("--y")).toBe(`${expected.yPercent}%`);
        }
      }
      // The map and the strip agree on which milestone each team is at.
      const strip = h!.root.querySelector("#audience-view .landmark-strip")!;
      for (const team of session.teams) {
        const group = strip.querySelector(`.landmark[data-milestone-id="${team.currentMilestoneId}"]`)!;
        expect(group.querySelector(`.marker[data-team-id="${team.id}"]`)).not.toBeNull();
      }
    };
    check();
    while (h.app.getEngine()!.getState() !== "gameSummary" && steps < 600) {
      keyboardStep(h);
      steps++;
      check();
    }
    expect(steps).toBeGreaterThan(10);
    expect(sawMap).toBe(true);
  });
});
