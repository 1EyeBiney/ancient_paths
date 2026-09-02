// Boots the Phase 4 app shell (PHASE4_SPEC "App shell and startup"). This
// replaces the Phase 1 boot page: loading + validating content is now the
// startup screen's job, handled by App itself via loadErrors.

import { crossValidate, fetchJson, validateContentPack, validateJourney } from "./content/loader";
import type { ContentPack, Journey } from "./content/schemas";
import { App } from "./ui/app";

async function boot(): Promise<void> {
  const root = document.getElementById("app")!;
  const journeys: Journey[] = [];
  const packs: ContentPack[] = [];
  const loadErrors: string[] = [];

  try {
    const [packRaw, journeyRaw] = await Promise.all([
      fetchJson("content/packs/dev-sample.json"),
      fetchJson("content/journeys/jerusalem-rome.json"),
    ]);

    const pack = validateContentPack(packRaw, "dev-sample.json");
    const journey = validateJourney(journeyRaw, "jerusalem-rome.json");

    if (!pack.ok) loadErrors.push(...pack.errors.map((e) => `Pack: ${e}`));
    if (!journey.ok) loadErrors.push(...journey.errors.map((e) => `Journey: ${e}`));
    if (pack.ok && journey.ok) {
      loadErrors.push(...crossValidate(journey.data, [pack.data]));
      packs.push(pack.data);
      journeys.push(journey.data);
    }
  } catch (err) {
    loadErrors.push("Could not load content: " + (err instanceof Error ? err.message : String(err)));
  }

  new App({ root, journeys, packs, loadErrors: loadErrors.length > 0 ? loadErrors : undefined });
}

void boot();
