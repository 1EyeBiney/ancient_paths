// Keyboard system (PHASE4_SPEC "Keyboard system"; ACCESSIBILITY_PATTERNS
// §3, §6). One key normalizer, one keybinding table, and a controller that
// implements the ladder: repeat gate -> input firewall -> native
// pass-through -> explorer mode -> help menu -> state-gated dispatch ->
// unmapped fallback. The table also drives the help menu's rows and the
// keyboard-explorer's descriptions (KEYBOARD_COMMANDS.md documents it).

import type { GameState } from "../engine/types";

// The engine only ever occupies these 12 states in practice (verified by
// reading every `session.state = "..."` assignment in src/engine/engine.ts):
// taskPreview, taskPresentation, progressResolution, stageCompletion, and
// hostRuling are declared in the GameState union (design doc §25's full
// suggested list) but are never actually entered by Phase 2's dispatch
// logic today. "Global" bindings below are legal across this reachable
// set, not the full type union — see OPEN_QUESTIONS.md.
export const ENGINE_PLAY_STATES: GameState[] = [
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

export interface KeyBinding {
  id: string;
  keyDisplay: string;
  label: string;
  legalStates: GameState[];
  match: (event: KeyboardEvent) => boolean;
}

// -- key matchers -------------------------------------------------------

function letter(key: string) {
  return (event: KeyboardEvent) =>
    !event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === key;
}

const matchesQuestionMark = (event: KeyboardEvent) => event.key === "?";
const matchesHelpAlias = (event: KeyboardEvent) =>
  event.key === "F1" || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "h");
const matchesEscape = (event: KeyboardEvent) => event.key === "Escape";
const matchesEnter = (event: KeyboardEvent) => event.key === "Enter";
const matchesSpace = (event: KeyboardEvent) => event.key === " " || event.key === "Spacebar";
const matchesUndo = (event: KeyboardEvent) =>
  event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z";

export const KEY_BINDINGS: KeyBinding[] = [
  {
    id: "repeat",
    keyDisplay: "R",
    label: "Repeat current game prompt",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("r"),
  },
  {
    id: "status",
    keyDisplay: "S",
    label: "Speak current game and team status",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("s"),
  },
  {
    id: "actions",
    keyDisplay: "A",
    label: "Speak available actions and usable resources",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("a"),
  },
  {
    id: "positions",
    keyDisplay: "T",
    label: "Speak all team positions",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("t"),
  },
  {
    id: "help",
    keyDisplay: "?",
    label: "Open the help menu (a second ? while it's open enters keyboard explorer)",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesQuestionMark,
  },
  {
    id: "help",
    keyDisplay: "H or F1",
    label: "Open the help menu",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesHelpAlias,
  },
  {
    id: "confirm",
    keyDisplay: "Enter",
    label: "Confirm or advance",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesEnter,
  },
  {
    id: "cancel",
    keyDisplay: "Escape",
    label: "Back or cancel; opens the game menu when nothing to cancel",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesEscape,
  },
  {
    id: "audioPause",
    keyDisplay: "Space",
    label: "Pause or resume the current produced audio clip",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesSpace,
  },
  {
    id: "audioReplay",
    keyDisplay: "L",
    label: "Listen again: replay the current task audio",
    legalStates: ["resourceWindow", "awaitingAnswer"],
    match: letter("l"),
  },
  {
    id: "audioStop",
    keyDisplay: "X",
    label: "Stop the current produced audio clip",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("x"),
  },
  {
    id: "audioSkip",
    keyDisplay: "N",
    label: "Skip optional narration (never task audio)",
    legalStates: ENGINE_PLAY_STATES,
    match: letter("n"),
  },
  {
    id: "undo",
    keyDisplay: "Ctrl+Z",
    label: "Undo the most recent reversible action",
    legalStates: ENGINE_PLAY_STATES,
    match: matchesUndo,
  },
  {
    id: "ruleCorrect",
    keyDisplay: "C",
    label: "Rule the current answer correct",
    legalStates: ["answerReveal", "communityEvent"],
    match: letter("c"),
  },
  {
    id: "ruleIncorrect",
    keyDisplay: "I",
    label: "Rule the current answer incorrect",
    legalStates: ["answerReveal", "communityEvent"],
    match: letter("i"),
  },
  {
    id: "ruleSkipped",
    keyDisplay: "K",
    label: "Rule the current answer skipped",
    legalStates: ["answerReveal"],
    match: letter("k"),
  },
];

export function isLegalInState(binding: KeyBinding, state: GameState): boolean {
  return binding.legalStates.includes(state);
}

export function findBinding(event: KeyboardEvent): KeyBinding | undefined {
  return KEY_BINDINGS.find((b) => b.match(event));
}

/** Bindings legal right now, deduplicated by id (help has two matchers, one row). */
export function legalBindingsForState(state: GameState): KeyBinding[] {
  const seen = new Set<string>();
  const rows: KeyBinding[] = [];
  for (const binding of KEY_BINDINGS) {
    if (!isLegalInState(binding, state)) continue;
    if (seen.has(binding.id)) continue;
    seen.add(binding.id);
    rows.push(binding);
  }
  return rows;
}

// -- input firewall & native pass-through --------------------------------

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TEXT_ENTRY_TAGS.has(target.tagName)) return true;
  // Prefer the live isContentEditable getter (accounts for inheritance from
  // an ancestor), but jsdom implements neither that getter nor attribute
  // reflection for the contentEditable IDL property, so also check the
  // property string and the raw attribute directly — real browsers agree
  // with all three.
  if (target.isContentEditable) return true;
  if (target.contentEditable === "true") return true;
  const attr = target.getAttribute("contenteditable");
  return attr === "" || attr === "true";
}

const NEVER_INTERCEPT_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
  "Tab",
  "F5",
  "F6",
  "F11",
  "F12",
]);

export function isNativePassthrough(event: KeyboardEvent): boolean {
  if (NEVER_INTERCEPT_KEYS.has(event.key)) return true;
  if (event.ctrlKey) {
    const k = event.key.toLowerCase();
    if (k === "r" || k === "f" || k === "w" || k === "t") return true;
  }
  return false;
}

export function keyLabel(event: KeyboardEvent): string {
  if (event.key === "?") return "Question mark";
  if (event.key === " " || event.key === "Spacebar") return "Space";
  if (event.key === "Escape") return "Escape";
  if (event.key === "Enter") return "Enter";
  if (event.ctrlKey && event.key.length === 1) return `Control ${event.key.toUpperCase()}`;
  if (event.key.length === 1) return event.key.toUpperCase();
  return event.key;
}

// -- the controller --------------------------------------------------------

export type KeyboardMode = "normal" | "help" | "explorer";

export interface KeyboardControllerOptions {
  getState: () => GameState;
  dispatchCommand: (id: string, event: KeyboardEvent) => void;
  present: (text: string) => void;
  /** Fires whenever the help menu opens (rows + cursor), moves its cursor,
   * or closes (cursor null) — the caller renders the visible list, so the
   * spoken rows always have an on-screen twin (parity; Brian's ruling). */
  onHelpChange?: (rows: KeyBinding[], cursor: number | null) => void;
}

export class KeyboardController {
  private mode: KeyboardMode = "normal";
  private helpCursor = 0;

  constructor(private readonly options: KeyboardControllerOptions) {}

  getMode(): KeyboardMode {
    return this.mode;
  }

  getHelpRows(): KeyBinding[] {
    return legalBindingsForState(this.options.getState());
  }

  getHelpCursor(): number {
    return this.helpCursor;
  }

  handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;

    if (this.mode === "explorer") {
      this.handleExplorerKey(event);
      return;
    }
    if (this.mode === "help") {
      this.handleHelpKey(event);
      return;
    }
    this.handleNormalKey(event);
  }

  private handleNormalKey(event: KeyboardEvent): void {
    const isTextEntry = isTextEntryTarget(event.target);
    if (isTextEntry) {
      if (matchesEscape(event)) {
        event.preventDefault();
        this.options.dispatchCommand("cancel", event);
      }
      return;
    }
    if (isNativePassthrough(event)) return;

    if (matchesQuestionMark(event) || matchesHelpAlias(event)) {
      event.preventDefault();
      this.openHelp();
      return;
    }

    const state = this.options.getState();
    const binding = findBinding(event);
    if (binding && isLegalInState(binding, state)) {
      event.preventDefault();
      this.options.dispatchCommand(binding.id, event);
      return;
    }
    if (NEVER_INTERCEPT_KEYS.has(event.key) || event.key.length === 0) return;
    event.preventDefault();
    this.options.present(`${keyLabel(event)} does nothing here. Press question mark for help.`);
  }

  private handleHelpKey(event: KeyboardEvent): void {
    if (isNativePassthrough(event)) return;
    if (matchesQuestionMark(event)) {
      event.preventDefault();
      this.closeHelp();
      this.enterExplorer();
      return;
    }
    if (matchesHelpAlias(event) || matchesEscape(event)) {
      event.preventDefault();
      this.closeHelp();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveHelpCursor(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveHelpCursor(-1);
      return;
    }
    event.preventDefault(); // help menu captures focus; everything else is swallowed
  }

  private handleExplorerKey(event: KeyboardEvent): void {
    if (matchesEscape(event)) {
      event.preventDefault();
      this.exitExplorer();
      return;
    }
    if (isTextEntryTarget(event.target)) return; // never captured from a text field
    if (isNativePassthrough(event)) return;
    if (NEVER_INTERCEPT_KEYS.has(event.key) || event.key.length === 0) return;
    event.preventDefault();
    this.describeKeyInExplorer(event);
  }

  private openHelp(): void {
    this.mode = "help";
    this.helpCursor = 0;
    const rows = this.getHelpRows();
    const first = rows[0];
    const intro = "Help menu. Up and down to browse, question mark or escape to close.";
    this.options.onHelpChange?.(rows, 0);
    this.options.present(first ? `${intro} ${first.keyDisplay}. ${first.label}.` : intro);
  }

  private closeHelp(): void {
    this.mode = "normal";
    this.options.onHelpChange?.([], null);
    this.options.present("Help closed.");
  }

  private enterExplorer(): void {
    this.mode = "explorer";
    this.options.present("Keyboard explorer. Press any key to hear what it does here. Escape to exit.");
  }

  private exitExplorer(): void {
    this.mode = "normal";
    this.options.present("Keyboard explorer closed.");
  }

  private moveHelpCursor(delta: number): void {
    const rows = this.getHelpRows();
    if (rows.length === 0) return;
    this.helpCursor = (this.helpCursor + delta + rows.length) % rows.length;
    const row = rows[this.helpCursor]!;
    this.options.onHelpChange?.(rows, this.helpCursor);
    this.options.present(`${row.keyDisplay}. ${row.label}.`);
  }

  private describeKeyInExplorer(event: KeyboardEvent): void {
    const binding = findBinding(event);
    const label = keyLabel(event);
    if (!binding) {
      this.options.present(`${label} is not a game shortcut.`);
      return;
    }
    const state = this.options.getState();
    if (isLegalInState(binding, state)) {
      this.options.present(`${label}. ${binding.label}.`);
    } else {
      this.options.present(`${label}. ${binding.label}. Not available in the current state.`);
    }
  }
}
