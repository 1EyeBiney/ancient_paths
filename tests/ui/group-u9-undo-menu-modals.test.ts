// @vitest-environment jsdom
// PHASE4_SPEC Group U9 — undo, menu, modals.

import { describe, expect, it } from "vitest";
import { UndoController } from "../../src/ui/undo";
import { ModalManager } from "../../src/ui/modal";
import { makeHarness, driveToResourceWindow } from "./harness";

describe("U9 — press-twice undo", () => {
  it("first press arms and announces what will be reversed; canUndo gating when there's nothing yet", () => {
    const h = makeHarness();
    const presented: string[] = [];
    const undo = new UndoController({ engine: h.engine, present: (i) => presented.push(i.visual) });

    expect(h.engine.canUndo()).toBe(false);
    undo.press();
    expect(presented.at(-1)).toMatch(/Nothing to undo/);
    expect(undo.isArmed()).toBe(false);
  });

  it("arm -> confirm within the window dispatches undo and reports what happened", () => {
    const h = makeHarness();
    driveToResourceWindow(h); // presentTask is now undoable
    expect(h.engine.canUndo()).toBe(true);

    let clock = 0;
    const presented: string[] = [];
    const undo = new UndoController({ engine: h.engine, present: (i) => presented.push(i.visual), now: () => clock });

    undo.press(); // arm
    expect(undo.isArmed()).toBe(true);
    expect(presented.at(-1)).toMatch(/Undo will reverse:/);
    expect(presented.at(-1)).toMatch(/Press again to confirm/);

    const stateBefore = h.engine.getState();
    clock += 2_000; // well within the window
    undo.press(); // confirm
    expect(undo.isArmed()).toBe(false);
    expect(presented.at(-1)).toMatch(/Undo confirmed/);
    expect(h.engine.getState()).not.toBe(stateBefore); // presentTask was reversed
  });

  it("arm -> a call outside the window re-arms instead of confirming", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    let clock = 0;
    const presented: string[] = [];
    const undo = new UndoController({
      engine: h.engine,
      present: (i) => presented.push(i.visual),
      now: () => clock,
      armWindowMs: 10_000,
    });
    undo.press(); // arm at t=0
    clock += 15_000; // window expired
    undo.press();
    expect(presented.at(-1)).toMatch(/Undo will reverse:/); // re-armed, not confirmed
    expect(undo.isArmed()).toBe(true);
  });

  it("cancel() disarms without dispatching, and is silent when nothing was armed", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    const presented: string[] = [];
    const undo = new UndoController({ engine: h.engine, present: (i) => presented.push(i.visual) });

    undo.cancel(); // nothing armed: silent
    expect(presented).toHaveLength(0);

    undo.press(); // arm
    expect(undo.isArmed()).toBe(true);
    undo.cancel();
    expect(undo.isArmed()).toBe(false);
    expect(presented.at(-1)).toMatch(/cancelled/i);

    const stateBefore = h.engine.getState();
    undo.press(); // this is a fresh arm, not a confirm
    expect(h.engine.getState()).toBe(stateBefore); // nothing dispatched
    expect(presented.at(-1)).toMatch(/Undo will reverse:/);
  });

  it("names the actual last event log entry", () => {
    const h = makeHarness();
    driveToResourceWindow(h);
    const lastEvent = h.engine.getSession().eventLog.at(-1)!.text;
    const presented: string[] = [];
    const undo = new UndoController({ engine: h.engine, present: (i) => presented.push(i.visual) });
    undo.press();
    expect(presented.at(-1)).toContain(lastEvent);
  });
});

describe("U9 — modal focus trap, title announcement, and return-to-invoker", () => {
  it("announces the title on open and moves focus into the dialog", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const invoker = document.createElement("button");
    invoker.textContent = "Open menu";
    document.body.appendChild(invoker);
    invoker.focus();
    expect(document.activeElement).toBe(invoker);

    const presented: string[] = [];
    const modal = new ModalManager(root);
    modal.open({
      title: "Game menu",
      present: (i) => presented.push(i.visual),
      build: (container) => {
        const resume = document.createElement("button");
        resume.textContent = "Resume";
        container.appendChild(resume);
      },
    });

    expect(presented.at(-1)).toMatch(/Game menu.*opened/);
    expect(modal.isOpen()).toBe(true);
    expect(document.activeElement).not.toBe(invoker); // focus moved into the modal
    expect(modal.element().contains(document.activeElement)).toBe(true);
  });

  it("Tab wraps from the last focusable back to the first (a real trap)", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();

    const modal = new ModalManager(root);
    let first!: HTMLButtonElement;
    let last!: HTMLButtonElement;
    modal.open({
      title: "Game menu",
      present: () => {},
      build: (container) => {
        first = document.createElement("button");
        first.textContent = "Resume";
        const middle = document.createElement("button");
        middle.textContent = "Game status";
        last = document.createElement("button");
        last.textContent = "End session";
        container.append(first, middle, last);
      },
    });
    last.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    modal.element().dispatchEvent(event);
    expect(document.activeElement).toBe(first);
  });

  it("closing returns focus to the control that opened it", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();

    const modal = new ModalManager(root);
    modal.open({
      title: "Game menu",
      present: () => {},
      build: (container) => {
        const btn = document.createElement("button");
        btn.textContent = "x";
        container.appendChild(btn);
      },
    });
    expect(document.activeElement).not.toBe(invoker);
    modal.close();
    expect(modal.isOpen()).toBe(false);
    expect(document.activeElement).toBe(invoker);
  });
});

describe("U9 — end-session is press-to-confirm", () => {
  it("a confirmation dialog with Confirm/Cancel guards ending the session", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();

    const modal = new ModalManager(root);
    let ended = false;
    let confirmBtn!: HTMLButtonElement;
    let cancelBtn!: HTMLButtonElement;
    modal.open({
      title: "End session?",
      present: () => {},
      build: (container) => {
        confirmBtn = document.createElement("button");
        confirmBtn.textContent = "End session";
        confirmBtn.addEventListener("click", () => {
          ended = true;
          modal.close();
        });
        cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => modal.close());
        container.append(confirmBtn, cancelBtn);
      },
    });

    cancelBtn.click();
    expect(ended).toBe(false);
    expect(modal.isOpen()).toBe(false);

    modal.open({
      title: "End session?",
      present: () => {},
      build: (container) => container.appendChild(confirmBtn),
    });
    confirmBtn.click();
    expect(ended).toBe(true);
  });
});
