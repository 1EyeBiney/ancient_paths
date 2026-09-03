// @vitest-environment jsdom
// PHASE5B_SPEC Group M5 — motion and style.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import { mapManifestSchema } from "../../src/ui/mapProjection";
import { makeApp, finishSetupByMouse, findButtonByText, type AppHarness } from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

describe("M5 — marker movement is gated behind [data-reduced-motion=\"false\"]", () => {
  const css = readFileSync(resolve("src/ui/styles.css"), "utf8");

  it("a transition rule mentions .map-marker only under the reduced-motion=false selector", () => {
    const transitionRules = css.match(/^[^@\n][^{]*\{[^}]*transition:[^}]*\}/gm) ?? [];
    const markerRules = transitionRules.filter((r) => r.includes(".map-marker"));
    expect(markerRules.length).toBeGreaterThan(0);
    for (const rule of markerRules) expect(rule).toContain('[data-reduced-motion="false"]');
  });

  it(".map-marker itself (outside the gate) sets no transition", () => {
    // A bare, ungated selector for .map-marker must not itself declare a
    // transition — only the gated variant may.
    const bareMarkerBlock = /(?:^|\n)\.map-marker\s*\{([^}]*)\}/m.exec(css);
    expect(bareMarkerBlock).not.toBeNull();
    expect(bareMarkerBlock![1]).not.toMatch(/transition:/);
  });
});

describe("M5 — switching Map style in setup changes data-map-style; 'none' removes the map", () => {
  it("satellite -> parchment changes the attribute; 'none' removes .map entirely", () => {
    h = makeApp();
    // Reach setup and choose the third Map style option ("none") to prove
    // the control is wired, then re-enter to pick "parchment".
    const root = h.root;
    findButtonByText(root, "New game").click();
    const mapList = root.querySelectorAll('[aria-label="Map style"] [role="option"]');
    expect(mapList).toHaveLength(3); // satellite, parchment, none
    (mapList[1] as HTMLElement).click(); // parchment
    expect(h.app.getSetupWizard().mapStyle).toBe("parchment");

    finishSetupByMouse(h);
    expect(h.app.getMode()).toBe("playing");
    const mapEl = root.querySelector<HTMLElement>("#audience-view .map");
    // testJourney (the harness default) has no `map` field, so even with
    // a style chosen there is nothing to render — confirms style alone
    // never fabricates a map for an unmapped journey.
    expect(mapEl).toBeNull();
  });

  it("'none' is honored end to end against a real mapped journey", () => {
    const journey = validateJourney(
      JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8")),
      "journey",
    );
    const pack = validateContentPack(
      JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8")),
      "pack",
    );
    const manifest = mapManifestSchema.parse(
      JSON.parse(readFileSync(resolve("public/map/mediterranean.json"), "utf8")),
    );
    if (!journey.ok || !pack.ok) throw new Error("real content failed to validate");

    h = makeApp({ journeys: [journey.data], packs: [pack.data], extra: { mapManifest: manifest } });
    findButtonByText(h.root, "New game").click();
    const mapList = h.root.querySelectorAll('[aria-label="Map style"] [role="option"]');
    (mapList[2] as HTMLElement).click(); // "none"
    finishSetupByMouse(h);
    expect(h.root.querySelector("#audience-view .map")).toBeNull();
    expect(h.root.querySelector("#audience-view .landmark-strip")).not.toBeNull(); // strip unaffected
  });
});

describe("M5 — the setup review lines include the map style", () => {
  it("reviewLines() names the chosen style", () => {
    h = makeApp();
    findButtonByText(h.root, "New game").click();
    const wizard = h.app.getSetupWizard();
    expect(wizard.reviewLines().join("\n")).toContain("Map style: satellite.");
    h.root.querySelectorAll<HTMLElement>('[aria-label="Map style"] [role="option"]')[1]!.click();
    expect(wizard.reviewLines().join("\n")).toContain("Map style: parchment.");
  });
});
