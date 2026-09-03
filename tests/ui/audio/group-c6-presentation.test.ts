// @vitest-environment jsdom
// PHASE7_SPEC Group C6 — presentation: voiced offering/catch-up lines and
// their cues, pledge-amount buttons, sharing buttons, the audience
// Service column, the setup catch-up toggle reaching engine config, and
// Sound check listing the two new cues. Uses testJourney (s1 -> fork ->
// s2 -> s3, relay at "midway", contribution at "ford") + testPack (has
// amplifiedVariant, unlike bigPack's synthetic tasks) so amplify/offer
// and pledges both work.

import { describe, expect, it, vi, afterEach } from "vitest";
import { testJourney } from "../../engine/fixtures";
import { contentPackSchema, TASK_CATEGORIES, DIFFICULTIES, type ContentPack, type Task } from "../../../src/content/schemas";
import { CUES } from "../../../src/ui/audio/cues";
import { makeApp, beginByMouse, keydownOn, findButtonByText, keyboardStep, type AppHarness } from "../appHarness";

// The session builder needs every enabled category (all 7 by default)
// represented with plenty of tasks; testPack (engine fixtures, 6 tasks,
// 4 categories) is too small. This pack covers all 7 categories with
// amplifiedVariant on every task, so amplify/offer and pledges both work.
function buildTestPack(): ContentPack {
  const tasks: Task[] = [];
  let n = 0;
  for (const category of TASK_CATEGORIES) {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 6; i++) {
        n++;
        tasks.push({
          id: `c6-${category}-${difficulty}-${n}`,
          schemaVersion: 1,
          packId: "c6-pack",
          category,
          title: `C6 task ${n}`,
          biblePeriods: [],
          locations: [],
          difficulty,
          prompt: `C6 task ${n} prompt`,
          answer: `C6 answer ${n}`,
          acceptedAnswers: [`C6 answer ${n}`],
          hostGuidance: null,
          scriptureReferences: [],
          normalVariant: { prompt: `C6 task ${n} prompt`, successValue: 1 },
          assistedVariant: {
            available: true,
            cost: { resource: "insight", amount: 1 },
            prompt: `C6 task ${n} assisted`,
            successValue: 1,
          },
          amplifiedVariant: {
            available: true,
            cost: { resource: "courage", amount: 1 },
            prompt: `C6 task ${n} amplified`,
            answer: `C6 answer ${n}`,
            acceptedAnswers: [`C6 answer ${n}`],
            successValue: 2,
          },
          clues: [],
          teachingReveal: `C6 task ${n} teaching.`,
          historicalNote: null,
          audioAsset: null,
          tags: ["c6-test"],
          resourceInteractions: { insight: true, provision: true, courage: true },
          estimatedSeconds: 30,
        } as Task);
      }
    }
  }
  return contentPackSchema.parse({
    packId: "c6-pack",
    schemaVersion: 1,
    version: "0.0.1",
    title: "C6 test pack",
    description: "Test-only, obviously fake, never real content.",
    tasks,
  });
}

const testPack = buildTestPack();

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

function makeTestApp(extra: Record<string, unknown> = {}) {
  return makeApp({
    journeys: [testJourney],
    packs: [testPack],
    extra: { startingResources: { insight: 5, provision: 0, courage: 5 }, ...extra },
  });
}

/** Drives generic turns (auto-correct, first-option choices — the same
 * script U10/A6 use) until `predicate` is true or nothing more advances. */
function driveUntil(harness: AppHarness, predicate: (state: string) => boolean, maxSteps = 60): void {
  const engine = harness.app.getEngine()!;
  let steps = 0;
  while (!predicate(engine.getState()) && steps < maxSteps) {
    if (!keyboardStep(harness)) break;
    steps++;
  }
}

/** From "resourceWindow" with a fresh (unamplified) task: amplify it,
 * accept/reveal/rule correct (successValue 2 on a req-2 stage this
 * team's first task already progressed to 1/2 -> 1 surplus), then offer
 * it — offerSurplus is always the LAST option in the surplus list. */
function amplifyAndOfferViaUi(harness: AppHarness): void {
  expect(harness.app.getEngine()!.getState()).toBe("resourceWindow");
  findButtonByText(harness.root, "Spend Courage to amplify the task").click();
  keydownOn(window, "Enter"); // resourceWindow -> acceptAnswer
  keydownOn(window, "Enter"); // awaitingAnswer -> reveal
  keydownOn(window, "c"); // rule correct -> teachingReveal
  keydownOn(window, "Enter"); // finishTeaching -> surplusDecision (3 successes on a req-2 stage)
  expect(harness.app.getEngine()!.getState()).toBe("surplusDecision");
  const options = harness.root.querySelectorAll<HTMLElement>('[aria-label="Surplus choice"] [role="option"]');
  options[options.length - 1]!.click();
}

describe("C6 — an offering voices both lines in one announcement and plays its cue", () => {
  it("joins the two new log lines and plays the offering cue", () => {
    h = makeTestApp();
    beginByMouse(h);
    // First task of the game: one plain correct (1/2 on s1), then the
    // SECOND task is amplified for a surplus to offer.
    driveUntil(h, (s) => s === "resourceWindow");
    keydownOn(window, "Enter");
    keydownOn(window, "Enter");
    keydownOn(window, "c");
    driveUntil(h, (s) => s === "resourceWindow");

    const manager = h.app.getAudioManager();
    const cueSpy = vi.spyOn(manager, "playCue");
    amplifyAndOfferViaUi(h);

    expect(cueSpy.mock.calls.some((c) => c[0] === "offering")).toBe(true);
    const last = h.app.getPresenterLog().at(-1)!;
    expect(last.visual).toMatch(/offers a surplus success: .+ Offering effect: .+$/);
  });
});

describe("C6 — pledge amounts", () => {
  it("offers 1..3 per resource when the team owns plenty", () => {
    h = makeTestApp();
    beginByMouse(h);
    driveUntil(h, (s) => s === "communityEvent" && !!h!.root.querySelector('[aria-label="Pledge choice"]'));

    const current = h.app.getEngine()!.getCurrentTaskPublic(); // null in communityEvent; use the log line instead
    void current;
    const insightOptions = Array.from(
      h.root.querySelectorAll<HTMLElement>('[aria-label="Pledge choice"] [role="option"]'),
    ).filter((o) => /contribute \d insight/.test(o.textContent ?? ""));
    // The pledging team owns 5 insight (starting resources), capped at
    // config.community.maxPledgePerTeam (3).
    const maxPledge = h.app.getEngine()!.getConfig().community.maxPledgePerTeam;
    expect(insightOptions).toHaveLength(maxPledge);
    expect(insightOptions[0]!.textContent).toMatch(/contribute 1 insight$/);
    expect(insightOptions[maxPledge - 1]!.textContent).toMatch(new RegExp(`contribute ${maxPledge} insight$`));
  });
});

describe("C6 — sharing a granted resource", () => {
  it("a share button per other team appears beside a pending choice; clicking it moves the gift", () => {
    h = makeTestApp();
    beginByMouse(h);
    driveUntil(h, (s) => s === "landmarkIntroduction"); // "midway": relay event pending
    driveUntil(h, (s) => s !== "landmarkIntroduction" && s !== "communityEvent"); // resolves the relay (success)

    const teams = h.app.getEngine()!.getSession().teams;
    const [teamA, teamB] = [teams[0]!.name, teams[1]!.name];
    expect(() => findButtonByText(h!.root, `Team ${teamA}: share with Team ${teamB}`)).not.toThrow();
    expect(() => findButtonByText(h!.root, `Team ${teamB}: share with Team ${teamA}`)).not.toThrow();

    findButtonByText(h.root, `Team ${teamA}: share with Team ${teamB}`).click();
    // teamA's own choice is now gone (only the button for team A -> B disappears, not B -> A).
    expect(() => findButtonByText(h!.root, `Team ${teamA}: share with Team ${teamB}`)).toThrow();
  });
});

describe("C6 — the audience Service column", () => {
  it("tracks each team's serviceScore after every render", () => {
    h = makeTestApp();
    beginByMouse(h);
    const activeId = () => h!.app.getEngine()!.getSession().teams[h!.app.getEngine()!.getSession().activeTeamIndex]!.id;
    const row = () => h!.root.querySelector(`[data-audience="teams"] tr[data-team-id="${activeId()}"]`)!;
    expect(row().querySelector('[data-col="service"]')!.textContent).toBe("0");

    driveUntil(h, (s) => s === "resourceWindow");
    keydownOn(window, "Enter");
    keydownOn(window, "Enter");
    keydownOn(window, "c");
    driveUntil(h, (s) => s === "resourceWindow");
    const scoringTeamId = activeId();
    amplifyAndOfferViaUi(h);

    const finalRow = h.root.querySelector(`[data-audience="teams"] tr[data-team-id="${scoringTeamId}"]`)!;
    const engineScore = h.app.getEngine()!.getTeam(scoringTeamId)!.serviceScore;
    expect(finalRow.querySelector('[data-col="service"]')!.textContent).toBe(String(engineScore));
    expect(engineScore).toBeGreaterThan(0);
  });
});

describe("C6 — the setup catch-up toggle reaches the engine config", () => {
  it("unchecking it before Begin journey disables catch-up on the engine", () => {
    h = makeTestApp();
    findButtonByText(h.root, "New game").click();
    h.root.querySelector<HTMLElement>('[aria-label="Journey"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Number of teams"] [role="option"]')!.click();
    const checkbox = h.root.querySelector<HTMLInputElement>("#community-catchup")!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    h.root.querySelector<HTMLElement>('[aria-label="Duration"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Pace"] [role="option"]')!.click();
    h.root.querySelector<HTMLElement>('[aria-label="Difficulty"] [role="option"]')!.click();
    findButtonByText(h.root, "Begin journey").click();

    expect(h.app.getEngine()!.getConfig().catchUp.enabled).toBe(false);
  });
});

describe("C6 — Sound check", () => {
  it("lists the two new Phase 7 cues", () => {
    h = makeTestApp();
    findButtonByText(h.root, "Sound check").click();
    const cueButtons = h.root.querySelectorAll<HTMLButtonElement>("button[data-cue-id]");
    expect(cueButtons).toHaveLength(Object.keys(CUES).length);
    expect(Array.from(cueButtons).some((b) => b.dataset.cueId === "offering")).toBe(true);
    expect(Array.from(cueButtons).some((b) => b.dataset.cueId === "serviceEarned")).toBe(true);
  });
});
