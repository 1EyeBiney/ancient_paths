// Content loading and validation. Pure functions over parsed JSON so the
// same code path serves the browser (fetch) and the test suite (imported
// fixtures). Invalid required data produces a readable error report and
// stops session creation (design doc §33.2).

import {
  contentPackSchema,
  journeySchema,
  type ContentPack,
  type Journey,
} from "./schemas";

export interface ValidationFailure {
  ok: false;
  source: string;
  errors: string[];
}

export interface ValidationSuccess<T> {
  ok: true;
  source: string;
  data: T;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function report(source: string, issues: { path: PropertyKey[]; message: string }[]): ValidationFailure {
  return {
    ok: false,
    source,
    errors: issues.map((issue) => {
      const where = issue.path.length ? issue.path.map(String).join(".") : "(root)";
      return `${where}: ${issue.message}`;
    }),
  };
}

export function validateContentPack(raw: unknown, source: string): ValidationResult<ContentPack> {
  const parsed = contentPackSchema.safeParse(raw);
  if (!parsed.success) return report(source, parsed.error.issues);
  return { ok: true, source, data: parsed.data };
}

export function validateJourney(raw: unknown, source: string): ValidationResult<Journey> {
  const parsed = journeySchema.safeParse(raw);
  if (!parsed.success) return report(source, parsed.error.issues);
  return { ok: true, source, data: parsed.data };
}

// Cross-checks that need both a journey and the loaded packs, e.g. that
// every journey location can actually be served by available tasks. Kept
// intentionally light in Phase 1; the session builder (Phase 3) owns the
// deeper eligibility math.
export function crossValidate(journey: Journey, packs: ContentPack[]): string[] {
  const problems: string[] = [];
  const allTasks = packs.flatMap((p) => p.tasks);
  if (allTasks.length === 0) {
    problems.push("No tasks available in any enabled content pack.");
  }
  const categories = new Set(allTasks.map((t) => t.category));
  const wanted = new Set<string>();
  for (const entry of journey.entries) {
    if (entry.kind === "stage") {
      (entry.taskFocus ?? []).forEach((c) => wanted.add(c));
    } else {
      entry.routes.forEach((r) => r.taskFocus.forEach((c) => wanted.add(c)));
    }
  }
  for (const category of wanted) {
    if (!categories.has(category as (typeof allTasks)[number]["category"])) {
      problems.push(
        `Journey "${journey.journeyId}" wants task category "${category}" but no enabled pack provides it.`,
      );
    }
  }
  return problems;
}

// Browser-side convenience: fetch and validate a JSON file served with the
// site (content/ is copied verbatim into the build output).
export async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }
  return response.json();
}
