// @vitest-environment jsdom
// PHASE5_SPEC Group V8 — setup completeness and the dev-playtest pack.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contentPackSchema } from "../../src/content/schemas";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import { buildPack } from "../../scripts/make-dev-playtest.mjs";
import {
  makeApp,
  beginByMouse,
  driveToSummary,
  findButtonByText,
  keydownOn,
  assertAudienceMatchesEngine,
  type AppHarness,
} from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function setNumber(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("V8 — every new setup control reaches the wizard and BuildOptions", () => {
  it("packs, categories, custom minutes, tasks-per-turn clamp, catch-up, audio, reduced motion", () => {
    const playtest = contentPackSchema.parse(buildPack());
    h = makeApp({ packs: [playtest] });
    findButtonByText(h.root, "New game").click();
    const wizard = h.app.getSetupWizard();

    // Packs: untick (by keyboard Space) then re-tick by mouse.
    const packBox = h.root.querySelector<HTMLInputElement>("#pack-dev-playtest")!;
    packBox.focus();
    keydownOn(packBox, " ");
    expect(wizard.enabledPackIds).toEqual([]);
    packBox.click();
    expect(wizard.enabledPackIds).toEqual(["dev-playtest"]);

    // Categories: drop hymn.
    h.root.querySelector<HTMLInputElement>("#category-hymn")!.click();
    expect(wizard.toBuildOptions().enabledCategories).not.toContain("hymn");
    expect(wizard.toBuildOptions().enabledCategories).toContain("scripture-knowledge");

    // Custom minutes: choose the "custom" row (4th option), then type.
    const rows = h.root.querySelectorAll<HTMLElement>('[aria-label="Duration"] [role="option"]');
    rows[3]!.click();
    const custom = h.root.querySelector<HTMLInputElement>('input[aria-label="Custom minutes"]')!;
    expect(custom.disabled).toBe(false);
    setNumber(custom, "90");
    expect(wizard.duration).toEqual({ customMinutes: 90 });
    expect(wizard.getPlan()!.targetMinutes).toBe(90);
    setNumber(custom, "500"); // clamps
    expect(wizard.duration).toEqual({ customMinutes: 180 });
    rows[1]!.click(); // back to standard disables the field
    expect(custom.disabled).toBe(true);
    expect(wizard.duration).toBe("standard");

    // Tasks per turn: clamps to 1-6, blank = recommended.
    const tpt = h.root.querySelector<HTMLInputElement>('input[aria-label^="Tasks per turn"]')!;
    setNumber(tpt, "9");
    expect(wizard.tasksPerTurnOverride).toBe(6);
    expect(wizard.toBuildOptions().turnTaskLimit).toBe(6);
    setNumber(tpt, "");
    expect(wizard.tasksPerTurnOverride).toBeNull();

    // Catch-up, audio, reduced motion.
    h.root.querySelector<HTMLInputElement>("#community-catchup")!.click();
    expect(wizard.communityCatchup).toBe(false);
    setNumber(h.root.querySelector<HTMLInputElement>('input[aria-label="music volume"]')!, "35");
    expect(wizard.audio.music).toBe(35);
    setNumber(h.root.querySelector<HTMLInputElement>('input[aria-label="master volume"]')!, "250");
    expect(wizard.audio.master).toBe(100);
    h.root.querySelector<HTMLInputElement>("#reduced-motion")!.click();
    expect(wizard.reducedMotion).toBe(true);
    expect(h.root.dataset.reducedMotion).toBe("true");
  });
});

describe("V8 — the dev-playtest pack", () => {
  it("the generator is deterministic and the committed file matches it exactly", () => {
    const committed = JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8"));
    expect(committed).toEqual(buildPack());
    expect(buildPack()).toEqual(buildPack());
  });

  it("validates through contentPackSchema, is obviously fake, and never ships", () => {
    const pack = contentPackSchema.parse(buildPack());
    expect(pack.tasks).toHaveLength(420);
    expect(pack.description).toMatch(/NEVER SHIPS/);
    for (const t of pack.tasks) {
      expect(t.prompt).toMatch(/placeholder/i);
      expect(t.answer).toMatch(/^Placeholder answer/);
    }
    expect(pack.tasks.some((t) => t.normalVariant.options)).toBe(true);
    expect(pack.tasks.some((t) => t.clues.length > 0)).toBe(true);
    expect(pack.tasks.some((t) => t.assistedVariant)).toBe(true);
    expect(pack.tasks.some((t) => t.amplifiedVariant)).toBe(true);
  });

  it("a full App game against dev-playtest and the REAL Jerusalem-to-Rome journey reaches gameSummary, audience synchronized at every step", () => {
    const packResult = validateContentPack(
      JSON.parse(readFileSync(resolve("public/content/packs/dev-playtest.json"), "utf8")),
      "dev-playtest.json",
    );
    const journeyResult = validateJourney(
      JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8")),
      "jerusalem-rome.json",
    );
    expect(packResult.ok).toBe(true);
    expect(journeyResult.ok).toBe(true);
    if (!packResult.ok || !journeyResult.ok) return;
    const pack = packResult.data;
    const journey = journeyResult.data;
    const tasksById = new Map(pack.tasks.map((t) => [t.id, t]));

    h = makeApp({ journeys: [journey], packs: [pack] });
    beginByMouse(h, ["Lydia", "Silas"]);
    expect(h.app.getMode()).toBe("playing");
    assertAudienceMatchesEngine(h, tasksById, journey);
    const steps = driveToSummary(h, () => assertAudienceMatchesEngine(h!, tasksById, journey));
    expect(steps).toBeGreaterThan(10);
    expect(h.app.getEngine()!.getState()).toBe("gameSummary");
    expect(h.root.querySelector('[data-audience="summary"]')!.textContent).toContain("Barnabas Award");
  });
});
