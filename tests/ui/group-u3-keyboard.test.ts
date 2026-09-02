// @vitest-environment jsdom
// PHASE4_SPEC Group U3 — keyboard system.

import { describe, expect, it } from "vitest";
import {
  KeyboardController,
  KEY_BINDINGS,
  legalBindingsForState,
  isNativePassthrough,
  isTextEntryTarget,
} from "../../src/ui/keys";
import type { GameState } from "../../src/engine/types";

function key(
  k: string,
  opts: Partial<{ repeat: boolean; ctrlKey: boolean; target: EventTarget }> = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: k,
    repeat: opts.repeat ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (opts.target) Object.defineProperty(event, "target", { value: opts.target, configurable: true });
  return event;
}

function makeController(state: GameState = "beginTurn") {
  let current = state;
  const commands: { id: string }[] = [];
  const presented: string[] = [];
  const controller = new KeyboardController({
    getState: () => current,
    dispatchCommand: (id) => commands.push({ id }),
    present: (text) => presented.push(text),
  });
  return {
    controller,
    commands,
    presented,
    setState: (s: GameState) => {
      current = s;
    },
  };
}

describe("U3 — the repeat gate", () => {
  it("ignores a synthetic held-key repeat entirely", () => {
    const { controller, commands } = makeController();
    controller.handleKeyDown(key("r", { repeat: true }));
    expect(commands).toHaveLength(0);
  });
});

describe("U3 — input firewall", () => {
  it("game keys do not fire while focus is in a text field", () => {
    const input = document.createElement("input");
    const { controller, commands } = makeController();
    controller.handleKeyDown(key("r", { target: input }));
    expect(commands).toHaveLength(0);
  });

  it("Escape still fires from a text field", () => {
    const input = document.createElement("input");
    const { controller, commands } = makeController();
    controller.handleKeyDown(key("Escape", { target: input }));
    expect(commands).toEqual([{ id: "cancel" }]);
  });

  it("recognizes textarea, select, and contenteditable as text entry", () => {
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isTextEntryTarget(textarea)).toBe(true);
    expect(isTextEntryTarget(select)).toBe(true);
    expect(isTextEntryTarget(div)).toBe(true);
    expect(isTextEntryTarget(document.createElement("button"))).toBe(false);
  });
});

describe("U3 — native pass-through list", () => {
  it("never intercepts F5, F11, F12, or Ctrl+R/F/W/T", () => {
    expect(isNativePassthrough(key("F5"))).toBe(true);
    expect(isNativePassthrough(key("F11"))).toBe(true);
    expect(isNativePassthrough(key("F12"))).toBe(true);
    expect(isNativePassthrough(key("r", { ctrlKey: true }))).toBe(true);
    expect(isNativePassthrough(key("f", { ctrlKey: true }))).toBe(true);
    expect(isNativePassthrough(key("w", { ctrlKey: true }))).toBe(true);
    expect(isNativePassthrough(key("t", { ctrlKey: true }))).toBe(true);
  });

  it("a pass-through key produces no command and no unmapped message", () => {
    const { controller, commands, presented } = makeController();
    controller.handleKeyDown(key("F5"));
    expect(commands).toHaveLength(0);
    expect(presented).toHaveLength(0);
  });
});

describe("U3 — unmapped keys speak a concise fallback", () => {
  it("an unmapped printable key says it does nothing here", () => {
    const { controller, presented } = makeController();
    controller.handleKeyDown(key("z"));
    expect(presented).toHaveLength(1);
    expect(presented[0]).toMatch(/does nothing here/);
    expect(presented[0]).toMatch(/question mark for help/);
  });
});

describe("U3 — state gating", () => {
  it("C does not rule in beginTurn", () => {
    const { controller, commands, presented } = makeController("beginTurn");
    controller.handleKeyDown(key("c"));
    expect(commands).toHaveLength(0);
    expect(presented[0]).toMatch(/does nothing here/);
  });

  it("C rules correct in answerReveal", () => {
    const { controller, commands } = makeController("answerReveal");
    controller.handleKeyDown(key("c"));
    expect(commands).toEqual([{ id: "ruleCorrect" }]);
  });

  it("C also works in communityEvent (relay answers), but K (skipped) does not", () => {
    const { controller, commands, presented } = makeController("communityEvent");
    controller.handleKeyDown(key("c"));
    expect(commands).toEqual([{ id: "ruleCorrect" }]);
    controller.handleKeyDown(key("k"));
    expect(presented.at(-1)).toMatch(/does nothing here/);
  });

  it("R/S/A/T work in every engine play state", () => {
    const states: GameState[] = [
      "ready",
      "beginTurn",
      "forkChoice",
      "resourceWindow",
      "awaitingAnswer",
      "answerReveal",
      "recoverDecision",
      "teachingReveal",
      "surplusDecision",
      "landmarkIntroduction",
      "communityEvent",
      "gameSummary",
    ];
    for (const state of states) {
      const { controller, commands } = makeController(state);
      controller.handleKeyDown(key("r"));
      controller.handleKeyDown(key("s"));
      controller.handleKeyDown(key("a"));
      controller.handleKeyDown(key("t"));
      expect(commands.map((c) => c.id)).toEqual(["repeat", "status", "actions", "positions"]);
    }
  });
});

describe("U3 — help menu: first ? opens it, listing only the current state's bindings", () => {
  it("opens on ? and announces the first row", () => {
    const { controller, presented } = makeController("answerReveal");
    controller.handleKeyDown(key("?"));
    expect(controller.getMode()).toBe("help");
    expect(presented.at(-1)).toMatch(/Help menu/);
  });

  it("lists only bindings legal in the current state", () => {
    const rowsAtBeginTurn = legalBindingsForState("beginTurn").map((b) => b.id);
    expect(rowsAtBeginTurn).not.toContain("ruleCorrect"); // C is not legal in beginTurn
    const rowsAtAnswerReveal = legalBindingsForState("answerReveal").map((b) => b.id);
    expect(rowsAtAnswerReveal).toContain("ruleCorrect");
    expect(rowsAtAnswerReveal).toContain("ruleSkipped");
  });

  it("Up/Down walk the rows with a terse announcement each", () => {
    const { controller, presented } = makeController("answerReveal");
    controller.handleKeyDown(key("?"));
    const afterOpen = presented.length;
    controller.handleKeyDown(key("ArrowDown"));
    expect(presented.length).toBe(afterOpen + 1);
    expect(controller.getHelpCursor()).toBe(1);
    controller.handleKeyDown(key("ArrowUp"));
    expect(controller.getHelpCursor()).toBe(0);
  });

  it("Escape closes the help menu back to normal mode", () => {
    const { controller } = makeController();
    controller.handleKeyDown(key("?"));
    expect(controller.getMode()).toBe("help");
    controller.handleKeyDown(key("Escape"));
    expect(controller.getMode()).toBe("normal");
  });

  it("H/F1 open and plainly close the help menu without chaining into explorer", () => {
    const { controller } = makeController();
    controller.handleKeyDown(key("F1"));
    expect(controller.getMode()).toBe("help");
    controller.handleKeyDown(key("F1"));
    expect(controller.getMode()).toBe("normal"); // closed, NOT explorer
  });
});

describe("U3 — second ? while help is open enters keyboard explorer", () => {
  it("closes help and enters explorer, announcing the escape-exit", () => {
    const { controller, presented } = makeController();
    controller.handleKeyDown(key("?"));
    controller.handleKeyDown(key("?"));
    expect(controller.getMode()).toBe("explorer");
    expect(presented.at(-1)).toMatch(/Keyboard explorer/);
    expect(presented.at(-1)).toMatch(/Escape to exit/);
  });

  it("in explorer mode, keys are described state-aware and nothing executes", () => {
    const { controller, commands, presented } = makeController("beginTurn");
    controller.handleKeyDown(key("?"));
    controller.handleKeyDown(key("?"));
    presented.length = 0;

    controller.handleKeyDown(key("c")); // C: legal only in answerReveal/communityEvent
    expect(commands).toHaveLength(0); // never executes
    expect(presented.at(-1)).toMatch(/Rule the current answer correct/);
    expect(presented.at(-1)).toMatch(/Not available in the current state/);

    controller.handleKeyDown(key("r")); // R: legal everywhere
    expect(commands).toHaveLength(0);
    expect(presented.at(-1)).toMatch(/Repeat current game prompt/);
    expect(presented.at(-1)).not.toMatch(/Not available/);

    controller.handleKeyDown(key("z")); // not a game shortcut at all
    expect(presented.at(-1)).toMatch(/not a game shortcut/);
  });

  it("Escape is the only exit from explorer mode", () => {
    const { controller } = makeController();
    controller.handleKeyDown(key("?"));
    controller.handleKeyDown(key("?"));
    expect(controller.getMode()).toBe("explorer");
    controller.handleKeyDown(key("r")); // describes, doesn't exit
    expect(controller.getMode()).toBe("explorer");
    controller.handleKeyDown(key("Escape"));
    expect(controller.getMode()).toBe("normal");
  });

  it("a text field is never captured by explorer mode", () => {
    const input = document.createElement("input");
    const { controller, presented } = makeController();
    controller.handleKeyDown(key("?"));
    controller.handleKeyDown(key("?"));
    presented.length = 0;
    controller.handleKeyDown(key("x", { target: input }));
    expect(presented).toHaveLength(0); // passed through untouched, not described
  });
});

describe("U3 — the live keybinding table drives both help rows and explorer descriptions", () => {
  it("changing a binding's label changes both help and explorer output identically", () => {
    const original = KEY_BINDINGS.find((b) => b.id === "repeat")!;
    const originalLabel = original.label;
    (original as { label: string }).label = "TEMP TEST LABEL";
    try {
      const { controller: helpController, presented: helpPresented } = makeController("beginTurn");
      helpController.handleKeyDown(key("?"));
      const helpRowText = helpPresented.join(" ");

      const { controller: explorerController, presented: explorerPresented } = makeController("beginTurn");
      explorerController.handleKeyDown(key("?"));
      explorerController.handleKeyDown(key("?"));
      explorerController.handleKeyDown(key("r"));

      expect(helpRowText).toContain("TEMP TEST LABEL");
      expect(explorerPresented.at(-1)).toContain("TEMP TEST LABEL");
    } finally {
      (original as { label: string }).label = originalLabel;
    }
  });
});
