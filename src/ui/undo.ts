// Press-twice-confirm undo (PHASE4_SPEC "Undo and error recovery"; design
// doc §23.7). First press names what will be reversed (the last event log
// entry) and arms a confirmation window; a second press within that window
// dispatches the undo; anything else (including an explicit cancel, which
// app.ts calls whenever any other command fires) disarms it.

import type { GameEngine } from "../engine/engine";
import type { PresentInput } from "./presenter";

export interface UndoControllerOptions {
  engine: GameEngine;
  present: (input: PresentInput) => void;
  now?: () => number;
  armWindowMs?: number;
}

const DEFAULT_ARM_WINDOW_MS = 10_000;

export class UndoController {
  private armedAt: number | null = null;
  private readonly now: () => number;
  private readonly armWindowMs: number;

  constructor(private readonly options: UndoControllerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.armWindowMs = options.armWindowMs ?? DEFAULT_ARM_WINDOW_MS;
  }

  isArmed(): boolean {
    return this.armedAt !== null;
  }

  /** Call whenever the host presses the undo key/button. */
  press(): void {
    if (!this.options.engine.canUndo()) {
      this.armedAt = null;
      this.options.present({ visual: "Nothing to undo." });
      return;
    }
    if (this.armedAt !== null && this.now() - this.armedAt <= this.armWindowMs) {
      const description = this.lastEventDescription();
      this.armedAt = null;
      this.options.engine.dispatch({ type: "undo" });
      this.options.present({ visual: `Undo confirmed: ${description}` });
      return;
    }
    this.armedAt = this.now();
    const description = this.lastEventDescription();
    this.options.present({ visual: `Undo will reverse: ${description}. Press again to confirm.` });
  }

  /** Call whenever any OTHER command dispatches, so a stray undo arm doesn't linger. */
  cancel(): void {
    if (this.armedAt === null) return;
    this.armedAt = null;
    this.options.present({ visual: "Undo cancelled." });
  }

  private lastEventDescription(): string {
    const log = this.options.engine.getSession().eventLog;
    const last = log[log.length - 1];
    return last ? last.text : "the last action";
  }
}
