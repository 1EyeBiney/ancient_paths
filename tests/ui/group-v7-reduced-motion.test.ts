// @vitest-environment jsdom
// PHASE5_SPEC Group V7 — reduced motion and the stylesheet's tokens.

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeApp, findButtonByText, keydownOn, type AppHarness } from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

const media = (matches: boolean) => (query: string) => ({ matches: query.includes("reduced-motion") && matches });

describe("V7 — data-reduced-motion follows the media query by default", () => {
  it("true when the OS asks for reduced motion", () => {
    h = makeApp({ extra: { matchMedia: media(true) } });
    expect(h.root.dataset.reducedMotion).toBe("true");
  });

  it("false otherwise (and when matchMedia is unavailable, as in jsdom)", () => {
    h = makeApp({ extra: { matchMedia: media(false) } });
    expect(h.root.dataset.reducedMotion).toBe("false");
    h.dispose();
    h = makeApp();
    expect(h.root.dataset.reducedMotion).toBe("false");
  });
});

describe("V7 — the setup toggle overrides the media query both ways", () => {
  it("OS says reduce, host unticks -> false; OS says no, host ticks -> true (by keyboard Space)", () => {
    h = makeApp({ extra: { matchMedia: media(true) } });
    findButtonByText(h.root, "New game").click();
    const box = h.root.querySelector<HTMLInputElement>("#reduced-motion")!;
    expect(box.checked).toBe(true);
    box.click();
    expect(h.root.dataset.reducedMotion).toBe("false");
    expect(h.app.getSetupWizard().reducedMotion).toBe(false);
    h.dispose();

    h = makeApp({ extra: { matchMedia: media(false) } });
    findButtonByText(h.root, "New game").click();
    const box2 = h.root.querySelector<HTMLInputElement>("#reduced-motion")!;
    expect(box2.checked).toBe(false);
    box2.focus();
    keydownOn(box2, " ");
    expect(box2.checked).toBe(true);
    expect(h.root.dataset.reducedMotion).toBe("true");
  });
});

describe("V7 — the stylesheet is honest about tokens and motion", () => {
  const css = readFileSync(resolve("src/ui/styles.css"), "utf8");

  it("defines the design tokens and is imported by main.ts", () => {
    for (const token of ["--ink", "--paper", "--accent", "--line", "--audience-base", "--badge-size", "--motion"]) {
      expect(css).toContain(`${token}:`);
    }
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    expect(main).toMatch(/import "\.\/ui\/styles\.css"/);
  });

  it("every animation is gated behind data-reduced-motion=\"false\"", () => {
    const animatedRules = css.match(/^[^@\n][^{]*\{[^}]*animation:[^}]*\}/gm) ?? [];
    expect(animatedRules.length).toBeGreaterThan(0);
    for (const rule of animatedRules) expect(rule).toContain('[data-reduced-motion="false"]');
  });
});
