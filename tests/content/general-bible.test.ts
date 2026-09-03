// PHASE9_SPEC Group N3 — the general-bible pack's blind rules and
// per-category counts. SECRECY PROTOCOL rule 3: every assertion here is a
// boolean whose failure message carries only a task id and a rule name —
// never a task's prompt, answer, acceptedAnswers, clues, teachingReveal,
// historicalNote, hostGuidance, variant prompts, or options.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney, crossValidate } from "../../src/content/loader";
import type { ContentPack, Task } from "../../src/content/schemas";

const BIBLE_PERIODS = [
  "creation-patriarchs",
  "exodus-wilderness",
  "conquest-judges",
  "united-kingdom",
  "divided-kingdom-exile",
  "return-second-temple",
  "life-of-jesus",
  "early-church",
  "pauline-journeys",
];

const LOCATIONS = [
  "jerusalem",
  "judea",
  "samaria",
  "galilee",
  "caesarea",
  "antioch",
  "asia-minor",
  "ephesus",
  "greece",
  "corinth",
  "philippi",
  "macedonia",
  "rome",
  "egypt",
  "babylon",
  "sinai",
  "damascus",
  "cyprus",
  "malta",
  "patmos",
  "nazareth",
  "bethlehem",
];

const CATEGORY_ID_PREFIX: Record<Task["category"], string> = {
  "scripture-knowledge": "sk",
  "bible-reasoning": "br",
  "historical-context": "hc",
  "audio-listening": "al",
  hymn: "hy",
  "decision-strategy": "ds",
  community: "cm",
};

// Grows as N4-N10 land; never commit a count the pack doesn't yet meet.
const TARGET_COUNTS: Record<Task["category"], number> = {
  "scripture-knowledge": 40, // N4, done
  "bible-reasoning": 20, // N5, done
  "historical-context": 20, // N6, done
  "decision-strategy": 1,
  hymn: 1,
  "audio-listening": 1,
  community: 1,
};

function loadPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(`pack failed to validate: ${result.errors.join("; ")}`);
  return result.data;
}

function loadJourney() {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(`journey failed to validate: ${result.errors.join("; ")}`);
  return result.data;
}

/** Whether `haystack` contains `needle` case-insensitively — the
 * "prompt/clue does not contain the answer" checks, all gated on
 * needle.length >= 4 by the spec (short answers like "me" are exempt). */
function containsCI(haystack: string, needle: string): boolean {
  if (needle.length < 4) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function answerPool(task: Task): string[] {
  return [task.answer, ...task.acceptedAnswers].map((a) => a.toLowerCase());
}

describe("N3 — general-bible: pack-level validity", () => {
  const pack = loadPack();
  const journey = loadJourney();

  it("validates against the content schema", () => {
    const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
    expect(validateContentPack(raw, "x").ok).toBe(true);
  });

  it("cross-validates cleanly against the real journey (every taskFocus category is covered)", () => {
    expect(crossValidate(journey, [pack])).toEqual([]);
  });
});

describe("N3 — general-bible: per-task blind rules", () => {
  const pack = loadPack();

  for (const task of pack.tasks) {
    const id = task.id;

    it(`${id}: id matches the gb-<cat>-NNN convention for its category`, () => {
      const expectedPrefix = CATEGORY_ID_PREFIX[task.category];
      const ok = new RegExp(`^gb-${expectedPrefix}-\\d+$`).test(id);
      expect(ok, `task ${id}: id convention`).toBe(true);
    });

    it(`${id}: tags are lowercase, include "general-bible", and carry 1-3 topical tags`, () => {
      const allLower = task.tags.every((t) => t === t.toLowerCase());
      expect(allLower, `task ${id}: tags lowercase`).toBe(true);
      expect(task.tags.includes("general-bible"), `task ${id}: tagged general-bible`).toBe(true);
      const topicalCount = task.tags.length - 1;
      expect(topicalCount >= 1 && topicalCount <= 3, `task ${id}: 1-3 topical tags`).toBe(true);
    });

    it(`${id}: acceptedAnswers includes the answer, case-insensitively`, () => {
      const ok = task.acceptedAnswers.some((a) => a.toLowerCase() === task.answer.toLowerCase());
      expect(ok, `task ${id}: acceptedAnswers includes answer`).toBe(true);
    });

    it(`${id}: prompt is at most 280 chars and never contains the answer`, () => {
      expect(task.prompt.length <= 280, `task ${id}: prompt length`).toBe(true);
      const hasOptions = !!task.normalVariant.options;
      const leaks = !hasOptions && containsCI(task.prompt, task.answer);
      expect(leaks, `task ${id}: prompt does not leak answer`).toBe(false);
    });

    it(`${id}: no clue contains the answer`, () => {
      const leaks = task.clues.some((c) => containsCI(c, task.answer));
      expect(leaks, `task ${id}: clues do not leak answer`).toBe(false);
    });

    it(`${id}: variant prompts never leak that variant's own answer (options-bearing prompts exempt)`, () => {
      if (task.assistedVariant && !task.assistedVariant.options) {
        const leaks = containsCI(task.assistedVariant.prompt, task.answer);
        expect(leaks, `task ${id}: assistedVariant prompt does not leak answer`).toBe(false);
      }
      if (task.amplifiedVariant && !task.amplifiedVariant.options) {
        const leaks = containsCI(task.amplifiedVariant.prompt, task.amplifiedVariant.answer);
        expect(leaks, `task ${id}: amplifiedVariant prompt does not leak its own answer`).toBe(false);
      }
    });

    it(`${id}: every options list has 3-4 entries with exactly one matching the answer pool`, () => {
      const pool = answerPool(task);
      const ampPool = task.amplifiedVariant ? [task.amplifiedVariant.answer, ...task.amplifiedVariant.acceptedAnswers].map((a) => a.toLowerCase()) : [];
      const checks: { options: string[] | undefined; pool: string[] }[] = [
        { options: task.normalVariant.options, pool },
        { options: task.assistedVariant?.options, pool },
        { options: task.amplifiedVariant?.options, pool: ampPool },
      ];
      for (const { options, pool: p } of checks) {
        if (!options) continue;
        expect(options.length >= 3 && options.length <= 4, `task ${id}: options count`).toBe(true);
        const matches = options.filter((o) => p.includes(o.toLowerCase())).length;
        expect(matches === 1, `task ${id}: exactly one option matches the answer pool`).toBe(true);
      }
    });

    it(`${id}: resourceInteractions are only true when the corresponding form exists`, () => {
      const hasOptions = !!(task.normalVariant.options || task.assistedVariant?.options || task.amplifiedVariant?.options);
      if (task.resourceInteractions.insight) {
        expect(task.clues.length >= 1 || hasOptions, `task ${id}: insight needs clues or options`).toBe(true);
      }
      if (task.resourceInteractions.provision) {
        expect(task.assistedVariant !== null, `task ${id}: provision needs an assisted form`).toBe(true);
      }
      if (task.resourceInteractions.courage) {
        expect(task.amplifiedVariant !== null, `task ${id}: courage needs an amplified form`).toBe(true);
      }
    });

    it(`${id}: hard tasks have a clue, a 30-90s estimate, and a 40-400 char teaching reveal`, () => {
      if (task.difficulty !== "hard") return;
      expect(task.clues.length >= 1, `task ${id}: hard needs a clue`).toBe(true);
      expect(task.estimatedSeconds >= 30 && task.estimatedSeconds <= 90, `task ${id}: hard estimatedSeconds range`).toBe(true);
      expect(
        task.teachingReveal.length >= 40 && task.teachingReveal.length <= 400,
        `task ${id}: hard teachingReveal length`,
      ).toBe(true);
    });

    it(`${id}: SK/BR/HC/DS cite a source (HC may cite a note instead)`, () => {
      if (!["scripture-knowledge", "bible-reasoning", "historical-context", "decision-strategy"].includes(task.category)) return;
      const noteOnly = task.category === "historical-context" && task.historicalNote !== null;
      expect(
        task.scriptureReferences.length >= 1 || noteOnly,
        `task ${id}: scriptureReferences or (HC) a historicalNote`,
      ).toBe(true);
    });

    it(`${id}: historical-context has a properly prefixed historicalNote`, () => {
      if (task.category !== "historical-context") return;
      expect(task.historicalNote !== null, `task ${id}: historicalNote present`).toBe(true);
      const prefixes = ["Stated in Scripture:", "Widely accepted background:", "Disputed:"];
      const ok = task.historicalNote !== null && prefixes.some((p) => task.historicalNote!.startsWith(p));
      expect(ok, `task ${id}: historicalNote prefix`).toBe(true);
    });

    it(`${id}: decision-strategy has hostGuidance`, () => {
      if (task.category !== "decision-strategy") return;
      expect(task.hostGuidance !== null, `task ${id}: hostGuidance present`).toBe(true);
    });

    it(`${id}: hymn's teachingReveal names a public-domain year (1500-1928)`, () => {
      if (task.category !== "hymn") return;
      const m = /\b(1[5-9]\d{2})\b/.exec(task.teachingReveal);
      const year = m ? Number(m[1]) : 0;
      expect(year >= 1500 && year <= 1928, `task ${id}: hymn year`).toBe(true);
    });

    it(`${id}: audio-listening has no audio asset yet and is tagged audio-pending`, () => {
      if (task.category !== "audio-listening") return;
      expect(task.audioAsset === null, `task ${id}: audioAsset null`).toBe(true);
      expect(task.tags.includes("audio-pending"), `task ${id}: tagged audio-pending`).toBe(true);
    });

    it(`${id}: community has no variants, no resource interactions, and hostGuidance`, () => {
      if (task.category !== "community") return;
      expect(task.assistedVariant === null, `task ${id}: community no assistedVariant`).toBe(true);
      expect(task.amplifiedVariant === null, `task ${id}: community no amplifiedVariant`).toBe(true);
      const noInteractions = !task.resourceInteractions.insight && !task.resourceInteractions.provision && !task.resourceInteractions.courage;
      expect(noInteractions, `task ${id}: community no resourceInteractions`).toBe(true);
      expect(task.hostGuidance !== null, `task ${id}: community hostGuidance present`).toBe(true);
    });

    it(`${id}: biblePeriods and locations are from the agreed vocabularies`, () => {
      const periodsOk = task.biblePeriods.every((p) => BIBLE_PERIODS.includes(p));
      expect(periodsOk, `task ${id}: biblePeriods vocabulary`).toBe(true);
      const locationsOk = task.locations.every((l) => LOCATIONS.includes(l));
      expect(locationsOk, `task ${id}: locations vocabulary`).toBe(true);
    });
  }
});

describe("N3 — general-bible: pack-wide rules", () => {
  const pack = loadPack();

  it("ids are unique", () => {
    const seen = new Set<string>();
    for (const task of pack.tasks) {
      expect(seen.has(task.id), `task ${task.id}: duplicate id`).toBe(false);
      seen.add(task.id);
    }
  });

  it("no two tasks share (category, answer) case-insensitively", () => {
    const seen = new Set<string>();
    for (const task of pack.tasks) {
      const key = `${task.category}::${task.answer.toLowerCase()}`;
      expect(seen.has(key), `task ${task.id}: duplicate (category, answer)`).toBe(false);
      seen.add(key);
    }
  });

  it("at least 30% easy, at most 30% hard", () => {
    const total = pack.tasks.length;
    const easy = pack.tasks.filter((t) => t.difficulty === "easy").length;
    const hard = pack.tasks.filter((t) => t.difficulty === "hard").length;
    expect(easy / total, "pack-wide: easy share").toBeGreaterThanOrEqual(0.3);
    expect(hard / total, "pack-wide: hard share").toBeLessThanOrEqual(0.3);
  });

  it("at least 60% of non-community tasks have an assisted form, at least 40% an amplified form", () => {
    const nonCommunity = pack.tasks.filter((t) => t.category !== "community");
    const assisted = nonCommunity.filter((t) => t.assistedVariant !== null).length;
    const amplified = nonCommunity.filter((t) => t.amplifiedVariant !== null).length;
    expect(assisted / nonCommunity.length, "pack-wide: assisted share").toBeGreaterThanOrEqual(0.6);
    expect(amplified / nonCommunity.length, "pack-wide: amplified share").toBeGreaterThanOrEqual(0.4);
  });

  it("meets the current per-category count targets (grow these as N4-N10 land)", () => {
    const counts = new Map<string, number>();
    for (const task of pack.tasks) counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
    for (const [category, target] of Object.entries(TARGET_COUNTS)) {
      expect(counts.get(category) ?? 0, `category "${category}" count`).toBe(target);
    }
  });
});
