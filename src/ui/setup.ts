// Setup wizard (PHASE4_SPEC "Setup wizard"; design doc §19). Pure state
// machine: no DOM here. app.ts renders each step and drives this class
// through the arrow-key/Enter/Escape cursor-list pattern
// (ACCESSIBILITY_PATTERNS §4); this file owns only the selections, their
// validation, and the live duration estimate.

import type { ContentPack, Journey, Task } from "../content/schemas";
import { TASK_CATEGORIES } from "../content/schemas";
import { planSession, type SessionDuration, type SessionPace, type SessionPlan } from "../session/plan";
import { buildSessionDeck, SessionBuildError, type BuildOptions, type BuildResult, type DeckDifficultySetting } from "../session/builder";
import type { TeamSetup } from "../engine/engine";
import type { MapStyleId } from "./mapProjection";
import type { SetupSnapshot } from "../persistence/schema";

export type NonCommunityCategory = Exclude<Task["category"], "community">;

export const NON_COMMUNITY_CATEGORIES: NonCommunityCategory[] = TASK_CATEGORIES.filter(
  (c): c is NonCommunityCategory => c !== "community",
);

export interface TeamPreset {
  color: string;
  symbol: string;
}

// 8 distinct color+symbol pairs (§24: every team needs a name, a color,
// AND a distinct symbol — never color alone).
export const TEAM_PRESETS: TeamPreset[] = [
  { color: "#c0392b", symbol: "cross" },
  { color: "#27ae60", symbol: "lion" },
  { color: "#1f6fa3", symbol: "dove" }, // darkened from #2980b9: that one only reached 4.39:1 vs white
  { color: "#f39c12", symbol: "anchor" },
  { color: "#8e44ad", symbol: "star" },
  { color: "#16a085", symbol: "shield" },
  { color: "#d35400", symbol: "olive-branch" },
  { color: "#2c3e50", symbol: "crown" },
];

export interface AudioSettings {
  master: number;
  music: number;
  effects: number;
  narration: number;
}

const MIN_TEAMS = 2;
const MAX_TEAMS = 8;
const MIN_TASKS_PER_TURN = 1;
const MAX_TASKS_PER_TURN = 6;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function defaultSeed(random: () => number = Math.random): string {
  return Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join("");
}

export interface SetupWizardOptions {
  journeys: Journey[];
  packs: ContentPack[];
  /** Injectable so tests can produce a deterministic default seed. */
  randomSeedSource?: () => number;
}

export class SetupWizard {
  readonly journeys: Journey[];
  readonly packs: ContentPack[];

  journey: Journey | null;
  teamCount: number;
  teamNames: string[];
  duration: SessionDuration;
  pace: SessionPace;
  difficulty: DeckDifficultySetting;
  enabledPackIds: string[];
  enabledCategories: NonCommunityCategory[];
  audio: AudioSettings;
  communityCatchup: boolean;
  seed: string;
  tasksPerTurnOverride: number | null;
  /** null = follow the prefers-reduced-motion media query. */
  reducedMotion: boolean | null;
  mapStyle: MapStyleId;

  private readonly randomSeedSource: () => number;

  constructor(options: SetupWizardOptions) {
    this.journeys = options.journeys;
    this.packs = options.packs;
    this.randomSeedSource = options.randomSeedSource ?? Math.random;

    this.journey = options.journeys[0] ?? null;
    this.teamCount = MIN_TEAMS;
    this.teamNames = this.defaultTeamNames(MIN_TEAMS);
    this.duration = "standard";
    this.pace = "standard";
    this.difficulty = "standard";
    this.enabledPackIds = options.packs.map((p) => p.packId);
    this.enabledCategories = [...NON_COMMUNITY_CATEGORIES];
    this.audio = { master: 100, music: 70, effects: 70, narration: 100 };
    this.communityCatchup = true;
    this.seed = defaultSeed(this.randomSeedSource);
    this.tasksPerTurnOverride = null;
    this.reducedMotion = null;
    this.mapStyle = "satellite";
  }

  setReducedMotion(v: boolean | null): void {
    this.reducedMotion = v;
  }

  setMapStyle(style: MapStyleId): void {
    this.mapStyle = style;
  }

  /** Default names are the preset symbol words ("Cross", "Lion", ...) so
   * the engine's "Team ${name}" phrasing reads "Team Lion", not the
   * "Team Team 1" the Phase 5 browser check heard (OPEN_QUESTIONS 19). */
  private defaultTeamName(index: number): string {
    return TEAM_PRESETS[index % TEAM_PRESETS.length]!.symbol
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  private defaultTeamNames(count: number): string[] {
    return Array.from({ length: count }, (_, i) => this.defaultTeamName(i));
  }

  // -- setters (each validates/clamps its own input) ----------------------

  setJourney(journey: Journey): void {
    this.journey = journey;
  }

  setTeamCount(n: number): void {
    const count = clamp(Math.round(n), MIN_TEAMS, MAX_TEAMS);
    const names = this.teamNames.slice(0, count);
    while (names.length < count) names.push(this.defaultTeamName(names.length));
    this.teamCount = count;
    this.teamNames = names;
  }

  setTeamName(index: number, name: string): void {
    if (index < 0 || index >= this.teamNames.length) {
      throw new Error(`SetupWizard.setTeamName: index ${index} out of range`);
    }
    this.teamNames[index] = name;
  }

  teamPreset(index: number): TeamPreset {
    return TEAM_PRESETS[index % TEAM_PRESETS.length]!;
  }

  setDuration(d: SessionDuration): void {
    this.duration = d;
  }

  setPace(p: SessionPace): void {
    this.pace = p;
  }

  setDifficulty(d: DeckDifficultySetting): void {
    this.difficulty = d;
  }

  setEnabledPacks(ids: string[]): void {
    this.enabledPackIds = ids;
  }

  setEnabledCategories(categories: NonCommunityCategory[]): void {
    this.enabledCategories = categories;
  }

  setAudio(partial: Partial<AudioSettings>): void {
    this.audio = {
      master: clamp(partial.master ?? this.audio.master, 0, 100),
      music: clamp(partial.music ?? this.audio.music, 0, 100),
      effects: clamp(partial.effects ?? this.audio.effects, 0, 100),
      narration: clamp(partial.narration ?? this.audio.narration, 0, 100),
    };
  }

  setCommunityCatchup(v: boolean): void {
    this.communityCatchup = v;
  }

  setSeed(s: string): void {
    this.seed = s;
  }

  regenerateSeed(): void {
    this.seed = defaultSeed(this.randomSeedSource);
  }

  setTasksPerTurnOverride(n: number | null): void {
    this.tasksPerTurnOverride = n === null ? null : clamp(Math.round(n), MIN_TASKS_PER_TURN, MAX_TASKS_PER_TURN);
  }

  // -- persistence (Phase 8) -------------------------------------------------

  /** Every public field, keyed by journey id (not the Journey object itself)
   * — PHASE8_SPEC.md Group P2's SetupSnapshot, one field per wizard field. */
  toSnapshot(): SetupSnapshot {
    if (!this.journey) throw new Error("SetupWizard.toSnapshot: no journey selected");
    return {
      journeyId: this.journey.journeyId,
      teamCount: this.teamCount,
      teamNames: [...this.teamNames],
      duration: this.duration,
      pace: this.pace,
      difficulty: this.difficulty,
      enabledPackIds: [...this.enabledPackIds],
      enabledCategories: [...this.enabledCategories],
      audio: { ...this.audio },
      communityCatchup: this.communityCatchup,
      seed: this.seed,
      tasksPerTurnOverride: this.tasksPerTurnOverride,
      reducedMotion: this.reducedMotion,
      mapStyle: this.mapStyle,
    };
  }

  /** Resolves the journey by id from this wizard's own journeys list;
   * throws if it no longer exists (PHASE8_SPEC.md Group P2: "the snapshot
   * is invalid" — callers should have already checked via rebuildFromSave). */
  applySnapshot(snapshot: SetupSnapshot): void {
    const journey = this.journeys.find((j) => j.journeyId === snapshot.journeyId);
    if (!journey) {
      throw new Error(`SetupWizard.applySnapshot: unknown journey "${snapshot.journeyId}"`);
    }
    this.journey = journey;
    this.teamCount = snapshot.teamCount;
    this.teamNames = [...snapshot.teamNames];
    this.duration = snapshot.duration;
    this.pace = snapshot.pace;
    this.difficulty = snapshot.difficulty;
    this.enabledPackIds = [...snapshot.enabledPackIds];
    this.enabledCategories = [...snapshot.enabledCategories];
    this.audio = { ...snapshot.audio };
    this.communityCatchup = snapshot.communityCatchup;
    this.seed = snapshot.seed;
    this.tasksPerTurnOverride = snapshot.tasksPerTurnOverride;
    this.reducedMotion = snapshot.reducedMotion;
    this.mapStyle = snapshot.mapStyle;
  }

  // -- derived --------------------------------------------------------------

  /**
   * The live duration estimate. Note: planSession() (Phase 3, not modified
   * here) always computes its estimate against the RECOMMENDED tasks/turn
   * for the team count — a tasksPerTurnOverride changes real gameplay
   * pacing but is not reflected back into this pre-game estimate, since
   * planSession has no override parameter and duplicating its internal
   * pace constants here would create a second source of truth.
   */
  getPlan(): SessionPlan | null {
    if (!this.journey) return null;
    return planSession({
      journey: this.journey,
      teamCount: this.teamCount,
      duration: this.duration,
      pace: this.pace,
    });
  }

  effectiveTasksPerTurn(): number {
    return this.tasksPerTurnOverride ?? this.getPlan()?.recommendedTasksPerTurn ?? 3;
  }

  toTeamSetups(): TeamSetup[] {
    return this.teamNames.map((name, i) => {
      const preset = this.teamPreset(i);
      return { id: `team-${i + 1}`, name, color: preset.color, symbol: preset.symbol };
    });
  }

  toBuildOptions(): BuildOptions {
    if (!this.journey) throw new Error("SetupWizard.toBuildOptions: no journey selected");
    const packs = this.packs.filter((p) => this.enabledPackIds.includes(p.packId));
    return {
      journey: this.journey,
      packs,
      teamIds: this.toTeamSetups().map((t) => t.id),
      turnTaskLimit: this.effectiveTasksPerTurn(),
      seed: this.seed,
      difficulty: this.difficulty,
      enabledCategories: this.enabledCategories,
    };
  }

  /** A full, browse-readable list of every chosen value (setup review screen). */
  reviewLines(): string[] {
    const plan = this.getPlan();
    return [
      `Journey: ${this.journey?.title ?? "none selected"}.`,
      `Teams: ${this.teamCount}.`,
      ...this.teamNames.map((name, i) => {
        const preset = this.teamPreset(i);
        return `Team ${i + 1}: ${name}, ${preset.color}, ${preset.symbol}.`;
      }),
      `Duration: ${typeof this.duration === "string" ? this.duration : `${this.duration.customMinutes} minutes`}.`,
      `Pace: ${this.pace}.`,
      `Difficulty: ${this.difficulty}.`,
      `Map style: ${this.mapStyle}.`,
      `Enabled packs: ${this.enabledPackIds.join(", ") || "none"}.`,
      `Enabled categories: ${this.enabledCategories.join(", ") || "none"}.`,
      `Tasks per turn: ${this.effectiveTasksPerTurn()}${this.tasksPerTurnOverride ? " (overridden)" : " (recommended)"}.`,
      `Community catch-up: ${this.communityCatchup ? "on" : "off"}.`,
      `Audio: master ${this.audio.master}, music ${this.audio.music}, effects ${this.audio.effects}, narration ${this.audio.narration}.`,
      `Seed: ${this.seed}.`,
      ...(plan ? [`Estimated duration: about ${Math.round(plan.estimatedMinutes)} minutes.`, ...plan.warnings] : []),
    ];
  }
}

export type SessionGenerationResult =
  | { ok: true; result: BuildResult; teams: TeamSetup[] }
  | { ok: false; error: SessionBuildError };

/**
 * Builds the REAL deck for the game about to start. Any deck used to
 * preview during setup must be a separate, discarded call to
 * buildSessionDeck() — this is the one whose result actually becomes the
 * engine's TaskSource (PHASE4_SPEC's determinism rule).
 */
export function attemptSessionGeneration(wizard: SetupWizard): SessionGenerationResult {
  try {
    const result = buildSessionDeck(wizard.toBuildOptions());
    return { ok: true, result, teams: wizard.toTeamSetups() };
  } catch (err) {
    if (err instanceof SessionBuildError) return { ok: false, error: err };
    throw err;
  }
}
