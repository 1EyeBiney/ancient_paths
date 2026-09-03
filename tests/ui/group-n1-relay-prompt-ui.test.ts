// @vitest-environment jsdom
// PHASE9_SPEC Group N1 — the relay prompt, on both screens: the host
// screen and the audience panel show the drawn task's prompt while the
// event is live, its answer never appears anywhere before resolve, and
// the reveal is voiced on resolve.

import { describe, expect, it, afterEach } from "vitest";
import { makeApp, beginByMouse, keyboardStep, type AppHarness } from "./appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function driveToCommunityEvent(harness: AppHarness): void {
  let steps = 0;
  while (harness.app.getEngine()!.getState() !== "communityEvent" && steps++ < 100) {
    if (!keyboardStep(harness)) break;
  }
}

describe("N1 UI — the relay's shared task appears on both screens; its answer stays hidden until resolve", () => {
  it("host screen and audience panel both show the prompt while live", () => {
    h = makeApp();
    beginByMouse(h);
    driveToCommunityEvent(h);
    const engine = h.app.getEngine()!;
    expect(engine.getState()).toBe("communityEvent");

    const communityTask = engine.getCommunityTaskPublic();
    expect(communityTask).not.toBeNull();
    const prompt = communityTask!.prompt;

    expect(h.root.querySelector('[aria-label="Host controls"]')!.textContent).toContain(prompt);
    expect(h.root.querySelector('[data-audience="community"]')!.textContent).toContain(prompt);
    expect(h.root.querySelector('#host-controls [data-community-prompt]')).not.toBeNull();
  });

  it("the answer is absent from both screens before resolve, and revealed (and voiced) after", () => {
    h = makeApp();
    beginByMouse(h);
    driveToCommunityEvent(h);
    const engine = h.app.getEngine()!;
    expect(engine.getState()).toBe("communityEvent");

    const preResolveHostText = h.root.querySelector('[aria-label="Host controls"]')!.textContent ?? "";
    const preResolveAudienceText = h.root.querySelector('[data-audience="community"]')!.textContent ?? "";

    // Meet the relay's threshold (ruleCorrect via the real UI action, twice
    // for testJourney's threshold of 2) then resolve.
    let guard = 0;
    while (engine.getState() === "communityEvent" && guard++ < 10) {
      if (!keyboardStep(h)) break;
    }
    expect(engine.getState()).not.toBe("communityEvent"); // resolved and turn advanced

    const revealLine = engine.getSession().eventLog.find((e) => e.text.startsWith("Community answer: "));
    expect(revealLine).toBeDefined();
    const answer = revealLine!.text.slice("Community answer: ".length);
    expect(answer.length).toBeGreaterThan(0);

    // The answer was nowhere on screen before resolve.
    expect(preResolveHostText).not.toContain(answer);
    expect(preResolveAudienceText).not.toContain(answer);

    // The reveal line was spoken (present()'d) on resolve.
    const spoken = h.app.getPresenterLog().some((entry) => entry.visual.includes(revealLine!.text));
    expect(spoken).toBe(true);
  });
});
