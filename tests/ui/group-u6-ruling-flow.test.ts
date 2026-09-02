// @vitest-environment jsdom
// PHASE4_SPEC Group U6 — ruling flow.

import { describe, expect, it } from "vitest";
import { makeHarness, makeRichTask, driveToResourceWindow, driveToAnswerReveal, RICH_ANSWER } from "./harness";

describe("U6 — pre-reveal DOM and announcements never contain the answer", () => {
  it("resourceWindow's DOM never shows the answer text (open-ended task, no options)", () => {
    // A multiple-choice task's options legitimately DO include the correct
    // answer text pre-reveal (that's inherent to MC — the schema itself
    // requires one option to match the answer); the real privacy guarantee
    // there is that the engine never tells the UI WHICH option is correct.
    // The meaningful "never shown" claim applies to an open-ended task,
    // where the true answer genuinely has no reason to appear on screen.
    const openEnded = makeRichTask({
      normalVariant: { prompt: "Open-ended: who replaced Judas?", successValue: 1 },
    });
    const h = makeHarness({ tasks: [openEnded] });
    driveToResourceWindow(h);
    expect(h.container.textContent).not.toContain(RICH_ANSWER);
    expect(h.politeRegion.textContent).not.toContain(RICH_ANSWER);
    expect(h.statusLine.textContent).not.toContain(RICH_ANSWER);
  });

  it("awaitingAnswer's DOM never shows the answer text", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    h.engine.dispatch({ type: "acceptAnswer" });
    h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).not.toContain(RICH_ANSWER);
  });
});

describe("U6 — reveal shows answer + accepted alternatives + hostGuidance", () => {
  it("all three appear once revealed", () => {
    const h = makeHarness();
    driveToAnswerReveal(h);
    expect(h.container.textContent).toContain(RICH_ANSWER);
    expect(h.container.textContent).toContain("Accept close phonetic spellings");
    // Polite, not assertive: a reveal is expected flow, not an error.
    expect(h.politeRegion.textContent).toContain(RICH_ANSWER);
  });
});

describe("U6 — C/I/K dispatch the matching rule", () => {
  it("C rules correct", () => {
    const h = makeHarness();
    driveToAnswerReveal(h);
    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleCorrect")!.run();
    expect(h.engine.getState()).not.toBe("answerReveal");
    const history = h.engine.getSession().taskHistory;
    expect(history.at(-1)?.result).toBe("correct");
  });

  it("I rules incorrect", () => {
    const h = makeHarness({ tasks: [makeRichTask({ resourceInteractions: { insight: false, provision: false, courage: false } })] });
    driveToAnswerReveal(h);
    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleIncorrect")!.run();
    const history = h.engine.getSession().taskHistory;
    expect(history.at(-1)?.result).toBe("incorrect");
  });

  it("K rules skipped", () => {
    const h = makeHarness({ tasks: [makeRichTask({ resourceInteractions: { insight: false, provision: false, courage: false } })] });
    driveToAnswerReveal(h);
    const render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleSkipped")!.run();
    const history = h.engine.getSession().taskHistory;
    expect(history.at(-1)?.result).toBe("skipped");
  });
});

describe("U6 — incorrect with Provision available leads to recoverDecision", () => {
  it("goes to recoverDecision, and both accept/decline branches work", () => {
    // Two rich tasks: the second is what nextReplacement should serve.
    const first = makeRichTask({ id: "rich-1" });
    const second = makeRichTask({ id: "rich-2", title: "Rich Task Two" });
    const h = makeHarness({ tasks: [first, second], startingResources: { insight: 5, provision: 5, courage: 5 } });
    driveToAnswerReveal(h);
    let render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleIncorrect")!.run();
    expect(h.engine.getState()).toBe("recoverDecision");

    render = h.renderer.render(h.engine, h.container);
    expect(render.actions.map((a) => a.id)).toEqual(
      expect.arrayContaining(["acceptRecover", "declineRecover"]),
    );

    // Branch: decline.
    render.actions.find((a) => a.id === "declineRecover")!.run();
    expect(h.engine.getState()).toBe("teachingReveal");
  });

  it("accepting recover spends Provision and returns to resourceWindow with a fresh task", () => {
    const first = makeRichTask({ id: "rich-1" });
    const second = makeRichTask({ id: "rich-2", title: "Rich Task Two" });
    const h = makeHarness({ tasks: [first, second] });
    driveToAnswerReveal(h);
    let render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleIncorrect")!.run();
    expect(h.engine.getState()).toBe("recoverDecision");

    const provisionBefore = h.engine.getTeam("team-1")!.resources.provision;
    render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "acceptRecover")!.run();
    expect(h.engine.getState()).toBe("resourceWindow");
    expect(h.engine.getTeam("team-1")!.resources.provision).toBeLessThan(provisionBefore);
    expect(h.engine.getCurrentTaskPublic()!.isRecoveryAttempt).toBe(true);
  });
});

describe("U6 — teaching reveal shows text and continues", () => {
  it("shows the task's real teaching text (looked up from the loaded pack) and Continue advances", () => {
    const h = makeHarness({ tasks: [makeRichTask({ resourceInteractions: { insight: false, provision: false, courage: false } })] });
    driveToAnswerReveal(h);
    let render = h.renderer.render(h.engine, h.container);
    render.actions.find((a) => a.id === "ruleSkipped")!.run();
    expect(h.engine.getState()).toBe("teachingReveal");

    render = h.renderer.render(h.engine, h.container);
    expect(h.container.textContent).toContain("the lot fell to Matthias");

    render.actions.find((a) => a.id === "confirm")!.run();
    expect(h.engine.getState()).not.toBe("teachingReveal");
  });
});
