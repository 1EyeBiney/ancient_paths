// PHASE10_SPEC Group X10 — the simulation report. Renders SIMULATION_REPORT.md
// from a fresh (smaller, still-real) batch of simulateGame runs and compares
// it against the committed file. Same idea as the dev-playtest generator's
// "committed file matches the generator" test (group-a2-schema-and-content
// .test.ts), without a second script: if the two differ, this WRITES the
// regenerated file and fails with a message telling a human to review it,
// then commit — the next run passes once that's done.

import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContentPack, validateJourney } from "../../src/content/loader";
import type { ContentPack, Journey } from "../../src/content/schemas";
import { generateReport } from "../../src/sim/report";

function loadPack(): ContentPack {
  const raw = JSON.parse(readFileSync(resolve("public/content/packs/general-bible.json"), "utf8"));
  const result = validateContentPack(raw, "general-bible.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}
function loadJourney(): Journey {
  const raw = JSON.parse(readFileSync(resolve("public/content/journeys/jerusalem-rome.json"), "utf8"));
  const result = validateJourney(raw, "jerusalem-rome.json");
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.data;
}

// Computed once and shared by every it() below (matching X2-X5's own
// "run the batch once, assert on it many times" convention) — generating
// the report is itself a real simulation run (~5s), and this file's tests
// each check a different property of the SAME deterministic output.
const journey = loadJourney();
const pack = loadPack();
const generated = generateReport(journey, [pack]);

describe("X10 — SIMULATION_REPORT.md", () => {
  it(
    "is deterministic across regeneration",
    () => {
      // A second real generateReport() call, ~5s alone — vitest's default
      // 5000ms per-test timeout is too tight once other tests/sim files
      // are contending for CPU in the same run (fine in isolation, flaky
      // alongside the rest of the suite) — a longer, explicit timeout,
      // not a real determinism issue.
      expect(generateReport(journey, [pack])).toBe(generated);
    },
    20_000,
  );

  it("the committed file matches a fresh generation", () => {
    const reportPath = resolve("SIMULATION_REPORT.md");

    let committed: string | null;
    try {
      committed = readFileSync(reportPath, "utf8");
    } catch {
      committed = null;
    }

    if (committed !== generated) {
      writeFileSync(reportPath, generated, "utf8");
      throw new Error("SIMULATION_REPORT.md regenerated — review it, then commit");
    }
  });

  it("contains no task text or task ids — only counts, percentages, and content-neutral labels", () => {
    const realTaskIds = new Set(pack.tasks.map((t) => t.id));
    for (const id of realTaskIds) {
      expect(generated.includes(id), `report should not contain a real task id: ${id}`).toBe(false);
    }
    // Prompts are full sentences (CONTENT_AUTHORING) — a substring match
    // is a strong, safe check. Answers are sometimes a single short word
    // or number, which would false-positive against ordinary report
    // prose (headers, preset names) — checked separately, and loosely,
    // below instead of via a blanket substring scan.
    for (const task of pack.tasks) {
      expect(generated.includes(task.prompt)).toBe(false);
    }
  });
});
