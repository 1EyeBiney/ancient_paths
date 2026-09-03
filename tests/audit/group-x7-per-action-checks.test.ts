// @vitest-environment jsdom
// PHASE10_SPEC Groups X7a (names/structure), X7c (focus), X7d (speech
// hygiene), X7e (no flooding) — all four are "after every action" checks
// over the SAME driven game, so they run together here rather than
// re-driving four separate games. Real journey + general-bible pack.
// SECRECY: assertion messages carry no task text.

import { describe, expect, it } from "vitest";
import type { App } from "../../src/ui/app";
import { driveRealGameByKeyboard, driveRealGameByMouse } from "./harness";

interface Violation {
  step: number;
  message: string;
}

const FORBIDDEN_SPEECH_FRAGMENTS = ["undefined", "null", "NaN", "[object", "Team Team"];
// Underscore is excluded from the VISUAL check: hymn lyric-completion
// prompts legitimately quote a line "with a blank" using "___"
// (CONTENT_AUTHORING §3) — real, reviewed content, not stray markdown.
// It stays forbidden in SPOKEN text, where sanitizeForSpeech (presenter.ts)
// already strips it — a spoken underscore would mean that guarantee broke.
const FORBIDDEN_VISUAL_CHARS = /[*#|<>`]/;
const FORBIDDEN_SPOKEN_CHARS = /[*_#|<>`]/;

function accessibleNameOf(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const wrappingLabel = el.closest("label");
    if (wrappingLabel?.textContent?.trim()) return wrappingLabel.textContent.trim();
  }
  const text = el.textContent?.trim();
  if (text) return text;
  return "";
}

function elementDescriptor(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
  return `${el.tagName.toLowerCase()}${id}${role}`;
}

/** A hidden element (the `hidden` attribute, or `aria-hidden="true"`, on
 * itself or an ancestor) isn't exposed to the accessibility tree, so a
 * missing name there is not a real defect — the modal overlay sits in the
 * DOM from construction but is empty and `hidden` until first opened. */
function isExposed(el: Element): boolean {
  if (el.closest("[hidden]")) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  return true;
}

function checkNamesAndStructure(root: HTMLElement, app: App, violations: Violation[], step: number): void {
  const controls = root.querySelectorAll('button, input, select, [role="option"], [role="listbox"], [role="dialog"]');
  for (const el of controls) {
    if (!isExposed(el)) continue;
    if (accessibleNameOf(el) === "") {
      violations.push({ step, message: `no accessible name: ${elementDescriptor(el)}` });
    }
  }
  for (const el of root.querySelectorAll("[tabindex]")) {
    const t = Number(el.getAttribute("tabindex"));
    if (t > 0) violations.push({ step, message: `positive tabindex: ${elementDescriptor(el)}` });
  }
  const ids = [...root.querySelectorAll("[id]")].map((e) => e.id);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) violations.push({ step, message: `duplicate id: "${id}"` });
    seen.add(id);
  }
  const politeCount = root.querySelectorAll('[aria-live="polite"]').length;
  if (politeCount !== 1) violations.push({ step, message: `expected exactly one aria-live="polite" region, found ${politeCount}` });
  const assertiveCount = root.querySelectorAll('[aria-live="assertive"]').length;
  if (assertiveCount > 1) violations.push({ step, message: `expected at most one aria-live="assertive" region, found ${assertiveCount}` });
  for (const el of root.querySelectorAll("svg, img")) {
    if (!isExposed(el)) continue;
    const hidden = el.getAttribute("aria-hidden") === "true";
    if (!hidden && accessibleNameOf(el) === "") {
      violations.push({ step, message: `${elementDescriptor(el)} is neither aria-hidden nor named` });
    }
  }
  // "Exactly one h2" applies to a single GAME SCREEN (per PHASE10_SPEC
  // X7a) — the setup wizard is deliberately many sections on one page
  // (PHASE4_SPEC "Setup screen scope"), each with its own heading, so
  // this check is scoped to app.getMode() === "playing".
  if (app.getMode() === "playing") {
    const host = root.querySelector<HTMLElement>('[aria-label="Host controls"]');
    if (host) {
      const h2s = host.querySelectorAll("h2");
      if (h2s.length !== 1) violations.push({ step, message: `host region has ${h2s.length} h2 elements while playing, expected 1` });
    }
  }
  const applicationRegions = root.querySelectorAll('[role="application"]');
  if (applicationRegions.length !== 1) {
    violations.push({ step, message: `expected exactly one role="application" region, found ${applicationRegions.length}` });
  }
}

function checkFocus(root: HTMLElement, violations: Violation[], step: number): void {
  const active = document.activeElement;
  if (!active || active === document.body) {
    violations.push({ step, message: "focus is on body or null" });
    return;
  }
  const host = root.querySelector('[aria-label="Host controls"]');
  const modalRoot = root.querySelector('[role="dialog"]');
  const insideHost = host?.contains(active) ?? false;
  const insideModal = modalRoot ? modalRoot.contains(active) || active === modalRoot : false;
  const insideRoot = root.contains(active);
  if (!insideHost && !insideModal && insideRoot) {
    // Setup screen controls live directly in the host container but
    // outside any [role=dialog] — still fine as long as focus is
    // somewhere inside the app root at all; only a TRUE body/null loss
    // (checked above) is a defect. Nothing further to flag here.
    return;
  }
  if (!insideRoot) {
    violations.push({ step, message: `focus (${elementDescriptor(active)}) is outside the app root entirely` });
  }
}

function checkSpeechHygiene(app: App, root: HTMLElement, violations: Violation[], step: number): void {
  const latest = app.getPresenterLog().at(-1);
  if (latest?.visual !== undefined) {
    if (FORBIDDEN_VISUAL_CHARS.test(latest.visual)) violations.push({ step, message: "forbidden character in visual announcement" });
    if (/ {2,}/.test(latest.visual)) violations.push({ step, message: "double space in visual announcement" });
    for (const frag of FORBIDDEN_SPEECH_FRAGMENTS) {
      if (latest.visual.includes(frag)) violations.push({ step, message: `forbidden fragment "${frag}" in visual announcement` });
    }
  }
  if (latest?.spoken !== undefined) {
    if (FORBIDDEN_SPOKEN_CHARS.test(latest.spoken)) violations.push({ step, message: "forbidden character in spoken announcement (sanitizeForSpeech should have stripped it)" });
    if (/ {2,}/.test(latest.spoken)) violations.push({ step, message: "double space in spoken announcement" });
    for (const frag of FORBIDDEN_SPEECH_FRAGMENTS) {
      if (latest.spoken.includes(frag)) violations.push({ step, message: `forbidden fragment "${frag}" in spoken announcement` });
    }
  }
  const hostText = root.querySelector('[aria-label="Host controls"]')?.textContent ?? "";
  for (const frag of FORBIDDEN_SPEECH_FRAGMENTS) {
    if (hostText.includes(frag)) violations.push({ step, message: `forbidden fragment "${frag}" visible in host region` });
  }
}

function checkNoFlood(app: App, violations: Violation[], step: number, lastPoliteCount: { value: number }): number {
  const politeCount = app.getPresenterLog().filter((e) => e.channel === "polite").length;
  const delta = politeCount - lastPoliteCount.value;
  if (delta > 4) violations.push({ step, message: `polite announcements grew by ${delta} in one action (max 4)` });
  lastPoliteCount.value = politeCount;
  return delta;
}

function runChecks(drive: "keyboard" | "mouse") {
  const violations: Violation[] = [];
  const lastPoliteCount = { value: 0 };
  let maxFloodDelta = 0;
  let step = 0;

  const hook = (app: App, root: HTMLElement) => {
    step++;
    checkNamesAndStructure(root, app, violations, step);
    checkFocus(root, violations, step);
    checkSpeechHygiene(app, root, violations, step);
    maxFloodDelta = Math.max(maxFloodDelta, checkNoFlood(app, violations, step, lastPoliteCount));
  };

  const result = drive === "keyboard" ? driveRealGameByKeyboard(hook) : driveRealGameByMouse(hook);
  result.dispose();
  return { violations, maxFloodDelta, steps: result.steps };
}

describe("X7a/X7c/X7d/X7e — per-action accessibility checks over a real game (keyboard)", () => {
  it("finds zero violations across a full driven game", () => {
    const { violations, maxFloodDelta, steps } = runChecks("keyboard");
    if (violations.length > 0) {
      const sample = violations.slice(0, 10).map((v) => `step ${v.step}: ${v.message}`);
      // eslint-disable-next-line no-console
      console.log(`X7 violations (${violations.length} total, first 10):\n${sample.join("\n")}`);
    }
    expect(violations, `${violations.length} violations found (see console)`).toEqual([]);
    expect(steps).toBeGreaterThan(5);
    // Report-only per the spec (X7e): the maximum observed, not a gate —
    // the >4 check above is the actual runaway-loop stop.
    expect(maxFloodDelta).toBeGreaterThanOrEqual(0);
  });
});

describe("X7a/X7c/X7d/X7e — the same checks over a real game (mouse)", () => {
  it("finds zero violations across a full driven game", () => {
    const { violations } = runChecks("mouse");
    if (violations.length > 0) {
      const sample = violations.slice(0, 10).map((v) => `step ${v.step}: ${v.message}`);
      // eslint-disable-next-line no-console
      console.log(`X7 (mouse) violations (${violations.length} total, first 10):\n${sample.join("\n")}`);
    }
    expect(violations, `${violations.length} violations found (see console)`).toEqual([]);
  });
});
