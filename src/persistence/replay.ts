// PHASE8_SPEC Group P3 — rebuildFromSave(): resume by rebuilding the deck
// from the saved seed and replaying every command since startGame. Never
// trusts the saved PlaySession snapshot directly (it is display + an
// integrity check only) — the replayed engine IS the resumed game.

import type { ContentPack, Journey } from "../content/schemas";
import { createEngine, type Command, type TeamSetup } from "../engine/engine";
import type { PlaySession } from "../engine/types";
import { createRng } from "../engine/rng";
import { buildSessionDeck, type SessionDeck } from "../session/builder";
import { DEFAULTS } from "../config/defaults";
import type { SavedGame } from "./schema";
import { RecordingEngine } from "./recorder";

export interface RebuildOptions {
  journeys: Journey[];
  packs: ContentPack[];
  /** Wired to autosave so play can continue seamlessly after Resume. */
  onCommitted?: (command: Command) => void;
}

export type RebuildResult =
  | { engine: RecordingEngine; deck: SessionDeck; teams: TeamSetup[]; turnTaskLimit: number }
  | { error: string };

/** Deep structural equality for plain JSON-shaped data (no Date/Map/Set),
 * independent of key insertion order — the two PlaySession objects being
 * compared come from different construction paths (schema parse vs. live
 * engine state) so a JSON.stringify string comparison isn't safe. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/** log() stamps `new Date().toISOString()` at record time, which differs
 * on replay — the integrity check ignores it and compares text only. */
function stripEventTimestamps(session: PlaySession): unknown {
  return { ...session, eventLog: session.eventLog.map((e) => ({ text: e.text })) };
}

export function rebuildFromSave(save: SavedGame, options: RebuildOptions): RebuildResult {
  const journey = options.journeys.find((j) => j.journeyId === save.content.journeyId);
  if (!journey || journey.version !== save.content.journeyVersion) {
    return { error: "content changed" };
  }

  const enabledPacks: ContentPack[] = [];
  for (const packId of save.setup.enabledPackIds) {
    const pack = options.packs.find((p) => p.packId === packId);
    const savedVersion = save.content.packs[packId];
    if (!pack || savedVersion === undefined || pack.version !== savedVersion) {
      return { error: "content changed" };
    }
    enabledPacks.push(pack);
  }

  let deck: SessionDeck;
  try {
    const built = buildSessionDeck({
      journey,
      packs: enabledPacks,
      teamIds: save.teams.map((t) => t.id),
      turnTaskLimit: save.turnTaskLimit,
      seed: save.setup.seed,
      difficulty: save.setup.difficulty,
      enabledCategories: save.setup.enabledCategories,
    });
    deck = built.deck;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "content changed" };
  }

  const innerEngine = createEngine({
    journey,
    packs: enabledPacks,
    teams: save.teams,
    turnTaskLimit: save.turnTaskLimit,
    rng: createRng(save.setup.seed),
    taskSource: deck,
    config: { catchUp: { ...DEFAULTS.catchUp, enabled: save.setup.communityCatchup } },
  });

  for (let i = 0; i < save.commands.length; i++) {
    try {
      innerEngine.dispatch(save.commands[i]!);
    } catch {
      return { error: `replay diverged at command ${i}` };
    }
  }

  if (!deepEqual(stripEventTimestamps(innerEngine.getSession()), stripEventTimestamps(save.snapshot))) {
    return { error: "saved game does not match its record" };
  }

  const engine = new RecordingEngine({
    engine: innerEngine,
    onCommitted: options.onCommitted,
    initialCommands: save.commands,
  });

  return { engine, deck, teams: save.teams, turnTaskLimit: save.turnTaskLimit };
}
