// Boots the app shell (PHASE4_SPEC "App shell and startup", PHASE5_SPEC
// "Content"). Loads the dev-sample pack (never ships, 8 tasks) and the
// generated dev-playtest pack (never ships, 420 placeholder tasks — enough
// to actually play the real journey) plus the Jerusalem-to-Rome journey,
// validates all of them, and hands any problems to the startup screen.

import "./ui/styles.css";
import { crossValidate, fetchJson, validateContentPack, validateJourney } from "./content/loader";
import type { ContentPack, Journey } from "./content/schemas";
import { App } from "./ui/app";

const PACK_FILES = ["content/packs/dev-sample.json", "content/packs/dev-playtest.json"];
const JOURNEY_FILES = ["content/journeys/jerusalem-rome.json"];

async function boot(): Promise<void> {
  const root = document.getElementById("app")!;
  const journeys: Journey[] = [];
  const packs: ContentPack[] = [];
  const loadErrors: string[] = [];

  try {
    const packRaws = await Promise.all(PACK_FILES.map((f) => fetchJson(f)));
    const journeyRaws = await Promise.all(JOURNEY_FILES.map((f) => fetchJson(f)));

    packRaws.forEach((raw, i) => {
      const result = validateContentPack(raw, PACK_FILES[i]!);
      if (result.ok) packs.push(result.data);
      else loadErrors.push(...result.errors.map((e) => `${PACK_FILES[i]}: ${e}`));
    });
    journeyRaws.forEach((raw, i) => {
      const result = validateJourney(raw, JOURNEY_FILES[i]!);
      if (result.ok) journeys.push(result.data);
      else loadErrors.push(...result.errors.map((e) => `${JOURNEY_FILES[i]}: ${e}`));
    });
    for (const journey of journeys) loadErrors.push(...crossValidate(journey, packs));
  } catch (err) {
    loadErrors.push("Could not load content: " + (err instanceof Error ? err.message : String(err)));
  }

  new App({ root, journeys, packs, loadErrors: loadErrors.length > 0 ? loadErrors : undefined });
}

void boot();
