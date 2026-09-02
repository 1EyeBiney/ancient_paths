// @vitest-environment jsdom
// PHASE4_SPEC Group U1 — the presenter (ACCESSIBILITY_PATTERNS §1-§2).

import { describe, expect, it } from "vitest";
import { Presenter, type PresenterOptions } from "../../src/ui/presenter";

const HAIR_SPACE = " ";

function makeElements() {
  return {
    politeRegion: document.createElement("div"),
    assertiveRegion: document.createElement("div"),
    statusLine: document.createElement("p"),
  };
}

function makePresenter(overrides: Partial<PresenterOptions> = {}) {
  const elements = makeElements();
  const presenter = new Presenter({
    ...elements,
    setIntervalFn: () => 0,
    clearIntervalFn: () => {},
    ...overrides,
  });
  return { presenter, ...elements };
}

describe("U1 — parity: visual and spoken both land", () => {
  it("writes visual to the status line and spoken to the polite region by default", () => {
    const { presenter, politeRegion, statusLine } = makePresenter();
    presenter.present({ visual: "Round 1 begins." });
    expect(statusLine.textContent).toBe("Round 1 begins.");
    expect(politeRegion.textContent).toBe("Round 1 begins.");
  });

  it("spoken defaults to visual but can be tailored independently", () => {
    const { presenter, politeRegion, statusLine } = makePresenter();
    presenter.present({ visual: "50% complete", spoken: "halfway there" });
    expect(statusLine.textContent).toBe("50% complete");
    expect(politeRegion.textContent).toBe("halfway there");
  });

  it("routes to the assertive region only when requested", () => {
    const { presenter, politeRegion, assertiveRegion } = makePresenter();
    presenter.present({ visual: "Error: could not load pack.", channel: "assertive" });
    expect(assertiveRegion.textContent).toBe("Error: could not load pack.");
    expect(politeRegion.textContent).toBe("");
  });
});

describe("U1 — spoken sanitizer", () => {
  it("strips markdown characters", () => {
    const { presenter, politeRegion } = makePresenter();
    presenter.present({ visual: "x", spoken: "**Team Lydia** wins `Round 1` #победа" });
    expect(politeRegion.textContent).not.toMatch(/[*`#]/);
  });

  it("expands % and & into words", () => {
    const { presenter, politeRegion } = makePresenter();
    presenter.present({ visual: "x", spoken: "50% Insight & Courage" });
    expect(politeRegion.textContent).toBe("50 percent Insight and Courage");
  });
});

describe("U1 — hair-space alternation on identical consecutive text", () => {
  it("re-renders a genuinely different string on each consecutive repeat", () => {
    const { presenter, politeRegion } = makePresenter();
    presenter.present({ visual: "x", spoken: "Team Lydia, at Antioch." });
    const first = politeRegion.textContent;
    presenter.present({ visual: "x", spoken: "Team Lydia, at Antioch." });
    const second = politeRegion.textContent;
    presenter.present({ visual: "x", spoken: "Team Lydia, at Antioch." });
    const third = politeRegion.textContent;

    expect(second).not.toBe(first);
    expect(second).toBe(first + HAIR_SPACE);
    expect(third).not.toBe(second);
    expect(third).toBe(first); // toggles back off
  });

  it("does not alternate when the text actually changes", () => {
    const { presenter, politeRegion } = makePresenter();
    presenter.present({ visual: "x", spoken: "Team Lydia, at Antioch." });
    presenter.present({ visual: "x", spoken: "Team Mark, at Antioch." });
    expect(politeRegion.textContent).toBe("Team Mark, at Antioch.");
  });

  it("tracks polite and assertive channels independently", () => {
    const { presenter, politeRegion, assertiveRegion } = makePresenter();
    presenter.present({ visual: "x", spoken: "Repeat me", channel: "polite" });
    presenter.present({ visual: "x", spoken: "Repeat me", channel: "assertive" });
    // Different channels: neither has seen this text as its OWN previous
    // push, so neither should be hair-spaced yet.
    expect(politeRegion.textContent).toBe("Repeat me");
    expect(assertiveRegion.textContent).toBe("Repeat me");
  });
});

describe("U1 — the log buffer", () => {
  it("records visual, spoken, and channel for each present() call", () => {
    const { presenter } = makePresenter();
    presenter.present({ visual: "A", spoken: "Ay" });
    presenter.present({ visual: "B", channel: "assertive" });
    const log = presenter.log();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ visual: "A", spoken: "Ay", channel: "polite" });
    expect(log[1]).toMatchObject({ visual: "B", spoken: "B", channel: "assertive" });
  });

  it("caps the buffer at the configured limit, dropping the oldest", () => {
    const elements = makeElements();
    const presenter = new Presenter({
      ...elements,
      setIntervalFn: () => 0,
      clearIntervalFn: () => {},
      logLimit: 3,
    });
    for (let i = 0; i < 5; i++) presenter.present({ visual: `msg ${i}` });
    const log = presenter.log();
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.visual)).toEqual(["msg 2", "msg 3", "msg 4"]);
  });
});

describe("U1 — idle re-prompt", () => {
  it("re-announces the pending prompt once an idle period has elapsed, via the injected timer only", () => {
    let tick: (() => void) | null = null;
    let clock = 0;
    const elements = makeElements();
    const presenter = new Presenter({
      ...elements,
      now: () => clock,
      setIntervalFn: (cb) => {
        tick = cb;
        return 1;
      },
      clearIntervalFn: () => {},
      idleThresholdMs: 12_000,
    });
    expect(tick).not.toBeNull();

    let pending = true;
    presenter.setIdleWatcher({ getPrompt: () => (pending ? "Please rule the current answer." : null) });

    clock += 5_000;
    tick!();
    expect(elements.politeRegion.textContent).toBe(""); // not idle long enough yet

    clock += 8_000; // total 13s since last announcement
    tick!();
    expect(elements.politeRegion.textContent).toBe("Please rule the current answer.");
  });

  it("does not fire while nothing is pending (gated on state via getPrompt returning null)", () => {
    let tick: (() => void) | null = null;
    let clock = 0;
    const elements = makeElements();
    const presenter = new Presenter({
      ...elements,
      now: () => clock,
      setIntervalFn: (cb) => {
        tick = cb;
        return 1;
      },
      clearIntervalFn: () => {},
      idleThresholdMs: 12_000,
    });
    presenter.setIdleWatcher({ getPrompt: () => null });
    clock += 20_000;
    tick!();
    expect(elements.politeRegion.textContent).toBe("");
  });

  it("re-arms after firing: a second full idle period fires again", () => {
    let tick: (() => void) | null = null;
    let clock = 0;
    const elements = makeElements();
    const presenter = new Presenter({
      ...elements,
      now: () => clock,
      setIntervalFn: (cb) => {
        tick = cb;
        return 1;
      },
      clearIntervalFn: () => {},
      idleThresholdMs: 12_000,
    });
    presenter.setIdleWatcher({ getPrompt: () => "Still waiting on a ruling." });

    clock += 13_000;
    tick!();
    const firstFire = elements.politeRegion.textContent;
    expect(firstFire).toContain("Still waiting");

    clock += 13_000;
    tick!();
    const secondFire = elements.politeRegion.textContent;
    expect(secondFire).toContain("Still waiting");
    expect(secondFire).not.toBe(firstFire); // alternation proves it re-announced, not just held state
  });
});

describe("U1 — unused: no global timer leaks (dispose)", () => {
  it("dispose() calls the injected clearIntervalFn", () => {
    const elements = makeElements();
    let cleared: unknown = null;
    const presenter = new Presenter({
      ...elements,
      setIntervalFn: () => 42,
      clearIntervalFn: (id) => {
        cleared = id;
      },
    });
    presenter.dispose();
    expect(cleared).toBe(42);
  });
});
