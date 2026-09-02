// Pure string builders (PHASE4_SPEC "Play screens"; ACCESSIBILITY_PATTERNS
// §2, §4). No DOM, no engine calls — everything here takes plain data
// (including, where useful, an already-composed string from the engine's
// own statusText()/allPositionsText(), which already implement §23.3's
// item 1-8 ordering and the "one clause per team" positions summary) and
// returns { visual, spoken } for the presenter to show.

export interface Composed {
  visual: string;
  spoken: string;
}

function same(text: string): Composed {
  return { visual: text, spoken: text };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function letterFor(index: number): string {
  const letter = LETTERS[index];
  if (!letter) throw new Error(`speech.letterFor: index ${index} has no letter (max 26 options)`);
  return letter;
}

// -- status (§23.3) ---------------------------------------------------------

/**
 * Appends the "available actions" clause (§23.3 item 9) to the engine's
 * own statusText() (items 1-8), so the full spoken order is preserved
 * without duplicating the engine's resource/progress phrasing here.
 */
export function buildStatus(baseStatusText: string, actions: string[]): Composed {
  const actionsClause =
    actions.length > 0 ? `Available actions: ${actions.join(", ")}.` : "No actions available right now.";
  return same(`${baseStatusText} ${actionsClause}`);
}

export function buildActionsSummary(actions: string[]): Composed {
  return same(actions.length > 0 ? `Available actions: ${actions.join(", ")}.` : "No actions available right now.");
}

/** Thin pass-through so app.ts only ever calls speech.ts, never the engine's text methods directly. */
export function buildPositions(baseAllPositionsText: string): Composed {
  return same(baseAllPositionsText);
}

// -- multiple choice (ACCESSIBILITY_PATTERNS §4) ----------------------------

export function buildMultipleChoicePrompt(prompt: string, options: string[]): Composed {
  if (options.length === 0) return same(prompt);
  const lettered = options.map((o, i) => `${letterFor(i)}: ${o}.`).join(" ");
  const text = `${prompt} ${options.length} choices. ${lettered}`;
  return same(text);
}

export interface LetteredOption {
  letter: string;
  text: string;
  eliminated: boolean;
}

/** The full option list for on-screen display: struck AND textually marked (§24 — never color alone). */
export function letterOptions(options: string[], eliminated: string[]): LetteredOption[] {
  return options.map((text, i) => ({
    letter: letterFor(i),
    text,
    eliminated: eliminated.includes(text),
  }));
}

/**
 * "B, Silas, is eliminated. Two choices remain: A, Matthias. C, Barnabas."
 * (ACCESSIBILITY_PATTERNS §4, exact shape) — re-reads only the survivors.
 */
export function buildEliminateAnnouncement(
  allOptionsBeforeElimination: string[],
  newlyEliminatedText: string,
): Composed {
  const eliminatedIndex = allOptionsBeforeElimination.indexOf(newlyEliminatedText);
  const eliminatedLetter = letterFor(eliminatedIndex);
  const survivors = allOptionsBeforeElimination.filter((o) => o !== newlyEliminatedText);
  const survivorWord = survivors.length === 1 ? "choice" : "choices";
  const survivorsListed = survivors
    .map((text) => `${letterFor(allOptionsBeforeElimination.indexOf(text))}, ${text}`)
    .join(". ");
  const text =
    `${eliminatedLetter}, ${newlyEliminatedText}, is eliminated. ` +
    `${numberWord(survivors.length)} ${survivorWord} remain: ${survivorsListed}.`;
  return same(text);
}

function numberWord(n: number): string {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return words[n] ?? String(n);
}

// -- entry vs navigation announcements (ACCESSIBILITY_PATTERNS §2) ----------

/** Entering a screen: orientation + instructions + current item, composed as one sentence group. */
export function buildEntryAnnouncement(orientation: string, instructions: string, currentItem: string): Composed {
  return same([orientation, instructions, currentItem].filter((s) => s.length > 0).join(" "));
}

/** Subsequent movement within the same screen: terse, current item only. */
export function buildNavigationAnnouncement(currentItem: string): Composed {
  return same(currentItem);
}

// -- misc composed sentences -------------------------------------------------

export function buildBeginTurnAnnouncement(
  roundNumber: number,
  teamName: string,
  locationName: string,
  successes: number,
  required: number,
): Composed {
  return same(
    `Round ${roundNumber}. Team ${teamName}, at ${locationName}. ${successes} of ${required} successes.`,
  );
}
