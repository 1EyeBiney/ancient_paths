// @vitest-environment jsdom
// PHASE7_SPEC Group C7 — full games: catch-up on and off both reach
// gameSummary; the summary screen and audience panel show
// serviceAwardName and communityAccomplishments; every voiced log line
// appears in the presenter log; ruling cues still equal ruling lines;
// no permanent-progress field decreases across the game except through
// undo. The dual-modality mouse drive is already covered by the
// existing U10 mouse test (unchanged by Phase 7 — its pledge decline is
// still the LAST cursor-list row, now after the amount options).

import { describe, expect, it, vi, afterEach } from "vitest";
import { DEFAULTS } from "../../../src/config/defaults";
import type { PresentInput } from "../../../src/ui/presenter";
import { makeApp, beginByMouse, driveToSummary, findButtonByText, type AppHarness } from "../appHarness";

let h: AppHarness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

// The same "present"-flagged patterns as app.ts's EVENT_LOG_VOICE table
// (private there) — duplicated here deliberately: this test independently
// verifies every one of THOSE log lines actually reaches the presenter.
const VOICED_PATTERNS: RegExp[] = [
  /^Team .+ offers a surplus success: /,
  /^Offering effect: /,
  /^Catch-up: /,
  /^Team .+ earns \d+ Service\.$/,
  /^Team .+ shares its gift with Team /,
  /^Team .+ made an exceptional contribution\.$/,
  /^Team .+ receives a free clue from an earlier gift\.$/,
];

describe("C7 — full games reach gameSummary with catch-up on and off", () => {
  it("catch-up ON (the default)", () => {
    h = makeApp();
    beginByMouse(h);
    expect(h.app.getEngine()!.getConfig().catchUp.enabled).toBe(true);
    driveToSummary(h, undefined, 800);
    expect(h.app.getEngine()!.getState()).toBe("gameSummary");
  });

  it("catch-up OFF", () => {
    h = makeApp();
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
    driveToSummary(h, undefined, 800);
    expect(h.app.getEngine()!.getState()).toBe("gameSummary");
  });
});

describe("C7 — the summary shows serviceAwardName and communityAccomplishments", () => {
  it("on both the host screen and the audience panel", () => {
    h = makeApp();
    beginByMouse(h);
    driveToSummary(h, undefined, 800);

    const summary = h.app.getEngine()!.getSummary()!;
    expect(summary.serviceAwardName).toBe(DEFAULTS.serviceAwardPublicName);

    expect(h.root.textContent).toContain(`${DEFAULTS.serviceAwardPublicName}:`);
    const audienceAward = h.root.querySelector('[data-audience="award"]')!;
    expect(audienceAward.textContent).toContain(DEFAULTS.serviceAwardPublicName);

    if (summary.communityAccomplishments.length > 0) {
      expect(h.root.querySelector('[data-audience="community-accomplishments"]')).not.toBeNull();
    }
  });
});

describe("C7 — voiced log lines and ruling-cue consistency across a whole game", () => {
  it("every voiced line reaches the presenter; ruling cues equal ruling lines", () => {
    h = makeApp();
    const manager = h.app.getAudioManager() as unknown as { present: (i: PresentInput) => void };
    const announced: PresentInput[] = [];
    vi.spyOn(manager, "present").mockImplementation((i) => announced.push(i));
    const cueSpy = vi.spyOn(h.app.getAudioManager(), "playCue");

    beginByMouse(h);
    driveToSummary(h, undefined, 800);

    const log = h.app.getEngine()!.getSession().eventLog;
    const spokenTexts = new Set(announced.flatMap((a) => [a.visual, a.spoken]));
    for (const entry of log) {
      if (VOICED_PATTERNS.some((p) => p.test(entry.text))) {
        // Joined announcements combine several lines with spaces; a
        // substring match is the honest check for those.
        const found = [...spokenTexts].some((s) => s?.includes(entry.text));
        expect(found, `expected "${entry.text}" to have been spoken`).toBe(true);
      }
    }

    const rulingLines = log.filter(
      (e) => /'s answer is ruled (correct|incorrect|skipped):/.test(e.text) || /answers for the room: (correct|incorrect)\.$/.test(e.text),
    ).length;
    const rulingCues = cueSpy.mock.calls.filter((c) => c[0] === "correct" || c[0] === "incorrect" || c[0] === "skipped").length;
    expect(rulingCues).toBe(rulingLines);
  });
});

describe("C7 — permanent progress never decreases outside undo", () => {
  it("each team's milestone index never drops, and finishedTeamIds only grows", () => {
    h = makeApp();
    beginByMouse(h);
    const engine = h.app.getEngine()!;
    const journey = h.app.getSetupWizard().journey!;
    const milestoneIndex = (id: string) => journey.milestones.findIndex((m) => m.id === id);

    let lastIndices = new Map(engine.getSession().teams.map((t) => [t.id, milestoneIndex(t.currentMilestoneId)]));
    let lastFinishedCount = engine.getSession().finishedTeamIds.length;

    driveToSummary(
      h,
      () => {
        for (const team of engine.getSession().teams) {
          const idx = milestoneIndex(team.currentMilestoneId);
          expect(idx).toBeGreaterThanOrEqual(lastIndices.get(team.id)!);
          lastIndices.set(team.id, idx);
        }
        expect(engine.getSession().finishedTeamIds.length).toBeGreaterThanOrEqual(lastFinishedCount);
        lastFinishedCount = engine.getSession().finishedTeamIds.length;
      },
      800,
    );

    expect(engine.getState()).toBe("gameSummary");
  });
});
