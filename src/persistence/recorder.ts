// PHASE8_SPEC Group P3 — RecordingEngine: a GameEngine decorator that
// records every command that actually committed, so autosave (Group P4)
// never has to touch the 28 dispatch sites in screens.ts or the one in
// undo.ts. Illegal commands throw inside the wrapped engine (which rolls
// itself back) and are never appended.

import type {
  Command,
  GameEngine,
  GameSummary,
  PublicTask,
  RevealedAnswer,
  RouteInfo,
} from "../engine/engine";
import type { GameDefaults } from "../config/defaults";
import type { GameState, PlaySession, TeamState } from "../engine/types";

export interface RecordingEngineOptions {
  engine: GameEngine;
  /** Called after a command commits (did not throw), with that command. */
  onCommitted?: (command: Command) => void;
  /** Commands already recorded (resume: replay leaves the log pre-loaded). */
  initialCommands?: readonly Command[];
}

export class RecordingEngine implements GameEngine {
  private readonly inner: GameEngine;
  private readonly onCommitted?: (command: Command) => void;
  private readonly commands: Command[];

  constructor(options: RecordingEngineOptions) {
    this.inner = options.engine;
    this.onCommitted = options.onCommitted;
    this.commands = [...(options.initialCommands ?? [])];
  }

  getCommands(): readonly Command[] {
    return this.commands;
  }

  dispatch(command: Command): GameState {
    const state = this.inner.dispatch(command);
    this.commands.push(command);
    this.onCommitted?.(command);
    return state;
  }

  canUndo(): boolean {
    return this.inner.canUndo();
  }

  getState(): GameState {
    return this.inner.getState();
  }

  getSession(): Readonly<PlaySession> {
    return this.inner.getSession();
  }

  getTeam(id: string): Readonly<TeamState> | undefined {
    return this.inner.getTeam(id);
  }

  getCurrentTaskPublic(): PublicTask | null {
    return this.inner.getCurrentTaskPublic();
  }

  getRevealedAnswer(): RevealedAnswer | null {
    return this.inner.getRevealedAnswer();
  }

  getAvailableRoutes(): RouteInfo[] | null {
    return this.inner.getAvailableRoutes();
  }

  getEffectiveStageRequirement(teamId: string): number | null {
    return this.inner.getEffectiveStageRequirement(teamId);
  }

  getPendingSurplus(): number {
    return this.inner.getPendingSurplus();
  }

  getPendingChoicesForTeam(teamId: string): number {
    return this.inner.getPendingChoicesForTeam(teamId);
  }

  getPendingChoiceDetailsForTeam(teamId: string): { amount: number; reason: string; shareable: boolean }[] {
    return this.inner.getPendingChoiceDetailsForTeam(teamId);
  }

  getStagesBehindLeader(teamId: string): number {
    return this.inner.getStagesBehindLeader(teamId);
  }

  getConfig(): Readonly<GameDefaults> {
    return this.inner.getConfig();
  }

  getSummary(): GameSummary | null {
    return this.inner.getSummary();
  }

  statusText(): string {
    return this.inner.statusText();
  }

  allPositionsText(): string {
    return this.inner.allPositionsText();
  }
}
