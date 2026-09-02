// Phase 1 boot page: load the sample content, validate it, and report the
// result both visually and through a polite live region. This page is the
// Phase 1 deliverable ("validated sample journey and sample tasks load
// successfully"), not the game — the real presentation layer is Phase 4/5.

import {
  crossValidate,
  fetchJson,
  validateContentPack,
  validateJourney,
} from "./content/loader";
import { DEFAULTS } from "./config/defaults";

const statusLine = document.getElementById("status-line")!;
const reportEl = document.getElementById("report")!;
const announceEl = document.getElementById("announce")!;

function say(text: string): void {
  // Same one-voice pattern as Brian's other projects: a single live region,
  // with a hair space alternated in so repeated text is still spoken.
  announceEl.textContent =
    announceEl.textContent === text ? text + " " : text;
}

function addSection(title: string, lines: string[], good: boolean): void {
  const h = document.createElement("h2");
  h.textContent = title;
  const ul = document.createElement("ul");
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    li.className = good ? "ok" : "bad";
    ul.append(li);
  }
  reportEl.append(h, ul);
}

async function boot(): Promise<void> {
  try {
    const [packRaw, journeyRaw] = await Promise.all([
      fetchJson("content/packs/dev-sample.json"),
      fetchJson("content/journeys/jerusalem-rome.json"),
    ]);

    const pack = validateContentPack(packRaw, "dev-sample.json");
    const journey = validateJourney(journeyRaw, "jerusalem-rome.json");

    const problems: string[] = [];
    if (!pack.ok) problems.push(...pack.errors.map((e) => `Pack: ${e}`));
    if (!journey.ok) problems.push(...journey.errors.map((e) => `Journey: ${e}`));
    if (pack.ok && journey.ok) {
      problems.push(...crossValidate(journey.data, [pack.data]));
    }

    if (problems.length === 0 && pack.ok && journey.ok) {
      const categories = new Set(pack.data.tasks.map((t) => t.category)).size;
      const summary =
        `All content valid. Pack "${pack.data.title}" loaded with ` +
        `${pack.data.tasks.length} tasks across ${categories} categories. ` +
        `Journey "${journey.data.title}" loaded with ` +
        `${journey.data.milestones.length} milestones and ` +
        `${journey.data.communityEvents.length} community events. ` +
        `Service recognition: the ${DEFAULTS.serviceAwardPublicName}.`;
      statusLine.textContent = summary;
      say(summary);
      addSection(
        "Milestones",
        journey.data.milestones.map((m) => m.name),
        true,
      );
      addSection(
        "Task categories in the pack",
        [...new Set(pack.data.tasks.map((t) => t.category))],
        true,
      );
    } else {
      const summary = `Content validation failed with ${problems.length} problem(s).`;
      statusLine.textContent = summary;
      say(summary);
      addSection("Problems", problems, false);
    }
  } catch (err) {
    const message =
      "Could not load content: " + (err instanceof Error ? err.message : String(err));
    statusLine.textContent = message;
    say(message);
  }
}

void boot();
