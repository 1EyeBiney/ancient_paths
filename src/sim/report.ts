// PHASE10_SPEC Group X10 — renders SIMULATION_REPORT.md from a batch of
// fresh simulateGame runs. Deterministic (fixed seeds), and deliberately
// reuses aggregate.ts's summarizeBatch/winShareBySeat/firstToFinishShareBySeat
// — the exact same functions X3/X4's own tests assert against — so the
// numbers in the committed report are never a second, divergent
// computation from what this phase's tests already checked.
//
// Seed counts here are SMALLER than X2-X5's own test files (which have
// their own ≤30s-per-group budget already spent proving pass/fail bounds)
// — this file additionally has to fit inside the SAME tests/sim ≤30s
// total budget (PHASE10_SPEC's own instruction), so every batch below is
// sized down further and says so in the rendered header.

import type { Journey, ContentPack } from "../content/schemas";
import type { DeckDifficultySetting } from "../session/builder";
import { simulateGame, type SimResult } from "./simulate";
import { summarizeBatch, winShareBySeat, firstToFinishShareBySeat, median } from "./aggregate";
import { PASSIVE, CAUTIOUS, BOLD, GENEROUS, HOARDER, DEFAULT_SUCCESS_MODEL, weightedStandardMixRate, type TeamPolicy } from "./policy";

// A fixed date, NOT `new Date()`: this report must be byte-identical on
// every run given the same journey/packs (its own committed-file check
// depends on that), so the header date only changes when a human
// deliberately regenerates the report and updates this constant —
// otherwise a report generated today would never again match itself
// generated tomorrow, and the "committed file matches a fresh build"
// test would fail forever on pure date drift, not a real content change.
const REPORT_DATE = "2026-09-03";

const REPORT_DIFFICULTIES: DeckDifficultySetting[] = ["gentle", "standard", "challenging"];
const LENGTH_SEEDS_PER_CELL = 2;
const ECONOMY_SEEDS_PER_PRESET = 5;
const FAIRNESS_SEEDS = 30;
const SERVICE_SEEDS_PER_PRESET = 5;

const PRESETS: TeamPolicy[] = [PASSIVE, CAUTIOUS, BOLD, GENEROUS, HOARDER];

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function num(x: number, digits = 2): string {
  return x.toFixed(digits);
}

function policyOneLine(p: TeamPolicy): string {
  return `route=${p.route}, window=${p.window}, recover=${p.recover}, surplus=${p.surplus}, contribution=${p.contribution}, grantedChoice=${p.grantedChoice}, journeyToken=${p.journeyToken}`;
}

interface LengthCell {
  teamCount: number;
  difficulty: DeckDifficultySetting;
  results: SimResult[];
}

function runLengthMatrix(journey: Journey, packs: ContentPack[]): LengthCell[] {
  const cells: LengthCell[] = [];
  for (let teamCount = 2; teamCount <= 8; teamCount++) {
    for (const difficulty of REPORT_DIFFICULTIES) {
      const results: SimResult[] = [];
      for (let s = 0; s < LENGTH_SEEDS_PER_CELL; s++) {
        results.push(
          simulateGame({
            journey,
            packs,
            teamCount,
            seed: `x10-length-${teamCount}-${difficulty}-${s}`,
            difficulty,
            policies: CAUTIOUS,
          }),
        );
      }
      cells.push({ teamCount, difficulty, results });
    }
  }
  return cells;
}

function renderLengthTable(cells: LengthCell[]): string {
  const lines = [
    `| Teams | Difficulty | Median rounds | Planned rounds | Median modeled minutes | Planned minutes | Exhausted / ${LENGTH_SEEDS_PER_CELL} |`,
    "|---|---|---|---|---|---|---|",
  ];
  for (const cell of cells) {
    const rounds = cell.results.map((r) => r.rounds);
    const med = median(rounds);
    const planned = cell.results[0]!.plannedRounds;
    // Phase 10 review: the round count alone hid the real length finding —
    // modeledMinutes (the simulator's own ~45s/task + overhead model, the
    // same one the estimator uses) is what §35 item 22 actually asks about.
    const modeledMinutes = median(cell.results.map((r) => r.modeledMinutes));
    const plannedMinutes = cell.results[0]!.plannedMinutes;
    const exhausted = cell.results.filter((r) => r.exhausted !== null).length;
    lines.push(
      `| ${cell.teamCount} | ${cell.difficulty} | ${num(med, 1)} | ${planned} | ${num(modeledMinutes, 0)} | ${num(plannedMinutes, 0)} | ${exhausted} |`,
    );
  }
  return lines.join("\n");
}

function runEconomyBatches(journey: Journey, packs: ContentPack[]): Map<string, SimResult[]> {
  const batches = new Map<string, SimResult[]>();
  for (const preset of PRESETS) {
    const results: SimResult[] = [];
    for (let s = 0; s < ECONOMY_SEEDS_PER_PRESET; s++) {
      results.push(
        simulateGame({ journey, packs, teamCount: 4, seed: `x10-econ-${preset.name}-${s}`, difficulty: "standard", policies: preset }),
      );
    }
    batches.set(preset.name, results);
  }
  return batches;
}

function renderEconomyTable(batches: Map<string, SimResult[]>): string {
  const lines = [
    "| Preset | Assisted | Amplified | Cap discard | All at cap | Journey Token | Zero-spend teams | Mean Service |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const preset of PRESETS) {
    const s = summarizeBatch(batches.get(preset.name)!);
    lines.push(
      `| ${preset.name} | ${pct(s.assistedAttemptGameShare)} | ${pct(s.amplifiedAttemptGameShare)} | ${pct(s.capDiscardGameShare)} | ${pct(s.allTeamsAtCapGameShare)} | ${pct(s.journeyTokenGameShare)} | ${pct(s.zeroSpendTeamShare)} | ${num(s.meanServiceScore)} |`,
    );
  }
  return lines.join("\n");
}

function runFairnessBatch(journey: Journey, packs: ContentPack[]): SimResult[] {
  const rotation = [CAUTIOUS, BOLD, GENEROUS, HOARDER];
  const results: SimResult[] = [];
  for (let s = 0; s < FAIRNESS_SEEDS; s++) {
    const rotated = Array.from({ length: 4 }, (_, seat) => rotation[(seat + s) % rotation.length]!);
    results.push(simulateGame({ journey, packs, teamCount: 4, seed: `x10-fair-${s}`, difficulty: "standard", policies: rotated }));
  }
  return results;
}

function renderFairnessTable(batch: SimResult[]): string {
  const winShares = winShareBySeat(batch);
  const firstShares = firstToFinishShareBySeat(batch);
  const lines = ["| Seat | Win share | First-to-Rome share |", "|---|---|---|"];
  for (let seat = 0; seat < winShares.length; seat++) {
    lines.push(`| ${seat} | ${pct(winShares[seat]!)} | ${pct(firstShares[seat]!)} |`);
  }
  return lines.join("\n");
}

function renderCommunityAndCatchUp(batch: SimResult[]): { catchUpTotal: number; communityLines: string } {
  const catchUpTotal = batch.reduce((sum, r) => sum + r.teams.reduce((s2, t) => s2 + t.catchUpGrants, 0), 0);
  const allEvents = batch.flatMap((r) => r.communityEvents);
  const relays = allEvents.filter((e) => e.kind === "relay");
  const contributions = allEvents.filter((e) => e.kind === "contribution");
  const relaySuccessRate = relays.length ? relays.filter((e) => e.success).length / relays.length : 0;
  const contributionMetRate = contributions.length ? contributions.filter((e) => e.success).length / contributions.length : 0;
  const exceptionalTotal = contributions.reduce((s, e) => s + e.exceptionalAwards, 0);
  const communityLines = [
    `- Relay success rate: ${pct(relaySuccessRate)} across ${relays.length} relays.`,
    `- Contribution goal-met rate: ${pct(contributionMetRate)} across ${contributions.length} contributions — this batch's policy rotation (CAUTIOUS/BOLD/GENEROUS/HOARDER) has only GENEROUS ever pledging (the other three's \`contribution\` policy is "hoarder", a deliberate always-decline), so a low rate here reflects THIS batch's 1-in-4 contributor mix, not a general claim about real rooms (where most teams would plausibly contribute something).`,
    `- Exceptional-contribution awards: ${exceptionalTotal} total.`,
    `- Catch-up grants across this batch: ${catchUpTotal} (4-team games — near-zero is expected; catch-up needs a team more than two stages behind).`,
  ].join("\n");
  return { catchUpTotal, communityLines };
}

function runServiceBatches(journey: Journey, packs: ContentPack[]): Map<string, SimResult[]> {
  const batches = new Map<string, SimResult[]>();
  for (const preset of [HOARDER, CAUTIOUS, GENEROUS]) {
    const results: SimResult[] = [];
    for (let s = 0; s < SERVICE_SEEDS_PER_PRESET; s++) {
      results.push(
        simulateGame({ journey, packs, teamCount: 4, seed: `x10-service-${preset.name}-${s}`, difficulty: "standard", policies: preset }),
      );
    }
    batches.set(preset.name, results);
  }
  return batches;
}

function renderServiceTable(batches: Map<string, SimResult[]>): string {
  const lines = ["| Preset | Mean Service |", "|---|---|"];
  for (const name of ["HOARDER", "CAUTIOUS", "GENEROUS"]) {
    const s = summarizeBatch(batches.get(name)!);
    lines.push(`| ${name} | ${num(s.meanServiceScore)} |`);
  }
  return lines.join("\n");
}

interface RepeatSession {
  teamCount: number;
  distinctThisSession: number;
  cumulativeDistinct: number;
  warningCount: number;
  /** Only the "Recent-use exclusion relaxed…" warnings — an excluded task
   * actually let back in. "Content supply is tight…" is a separate margin
   * caution the builder emits at 8 teams regardless (X5's own test draws
   * the same line); counting it as a relaxation misreported the chain. */
  relaxationCount: number;
  /** Tasks this session drew that the IMMEDIATELY PRECEDING session also
   * drew — the repeats one-session memory could not prevent (relaxed at
   * build time, or served from the deck's last-resort pool mid-game). */
  repeatsFromPrevious: number;
}

function runRepeatChain(journey: Journey, packs: ContentPack[]): RepeatSession[] {
  const teamCounts = [4, 2, 8, 4];
  const sessions: RepeatSession[] = [];
  const priorIds: string[][] = [];
  const cumulative = new Set<string>();
  for (let i = 0; i < teamCounts.length; i++) {
    const teamCount = teamCounts[i]!;
    const excludeTaskIds = priorIds.slice(-1).flat(); // one-session memory
    const result = simulateGame({
      journey,
      packs,
      teamCount,
      seed: `x10-repeats-session${i}-${teamCount}`,
      difficulty: "standard",
      policies: CAUTIOUS,
      excludeTaskIds,
    });
    for (const id of result.taskIds) cumulative.add(id);
    const previous = new Set(priorIds.at(-1) ?? []);
    sessions.push({
      teamCount,
      distinctThisSession: result.distinctTasks,
      cumulativeDistinct: cumulative.size,
      warningCount: result.deckWarnings.length,
      relaxationCount: result.deckWarnings.filter((w) => w.includes("exclusion relaxed")).length,
      repeatsFromPrevious: new Set(result.taskIds.filter((id) => previous.has(id))).size,
    });
    priorIds.push(result.taskIds);
  }
  return sessions;
}

function renderRepeatsTable(sessions: RepeatSession[]): string {
  const lines = [
    "| Session | Teams | Distinct tasks this session | Cumulative distinct tasks | Repeats from previous session | Deck warnings (any) | Exclusion relaxations at build |",
    "|---|---|---|---|---|---|---|",
  ];
  sessions.forEach((s, i) => {
    lines.push(
      `| ${i + 1} | ${s.teamCount} | ${s.distinctThisSession} | ${s.cumulativeDistinct} | ${s.repeatsFromPrevious} | ${s.warningCount} | ${s.relaxationCount} |`,
    );
  });
  return lines.join("\n");
}

/** Renders the full SIMULATION_REPORT.md content. Pure and deterministic —
 * same journey/packs in, byte-identical markdown out, every time. */
export function generateReport(journey: Journey, packs: ContentPack[]): string {
  const lengthCells = runLengthMatrix(journey, packs);
  const economyBatches = runEconomyBatches(journey, packs);
  const fairnessBatch = runFairnessBatch(journey, packs);
  const { catchUpTotal, communityLines } = renderCommunityAndCatchUp(fairnessBatch);
  const serviceBatches = runServiceBatches(journey, packs);
  const repeatSessions = runRepeatChain(journey, packs);

  const winShares = winShareBySeat(fairnessBatch);
  const seatSpread = Math.max(...winShares) - Math.min(...winShares);
  const journeyTokenBold = summarizeBatch(economyBatches.get("BOLD")!).journeyTokenGameShare;
  const totalRelaxations = repeatSessions.reduce((sum, s) => sum + s.relaxationCount, 0);

  // Phase 10 review — the length finding the round-count table hid: how
  // far the modeled duration sits from the estimator's own planned minutes
  // (and from the design's 55-minute Standard target) at each team count.
  const standardCells = lengthCells.filter((c) => c.difficulty === "standard");
  const durationRatios = standardCells.map(
    (c) => median(c.results.map((r) => r.modeledMinutes)) / c.results[0]!.plannedMinutes,
  );
  const minRatio = Math.min(...durationRatios);
  const maxRatio = Math.max(...durationRatios);
  const fourTeam = standardCells.find((c) => c.teamCount === 4)!;
  const fourTeamModeled = median(fourTeam.results.map((r) => r.modeledMinutes));
  const fourTeamPlanned = fourTeam.results[0]!.plannedMinutes;

  const totalGames =
    lengthCells.reduce((s, c) => s + c.results.length, 0) +
    ECONOMY_SEEDS_PER_PRESET * PRESETS.length +
    FAIRNESS_SEEDS +
    SERVICE_SEEDS_PER_PRESET * 3 +
    repeatSessions.length;

  const presetTable = PRESETS.map((p) => `- **${p.name}**: ${policyOneLine(p)}`).join("\n");

  return `# Simulation Report

Generated ${REPORT_DATE} by \`src/sim/report.ts\` (PHASE10_SPEC Group X10, amended in Fable's Phase 10 review) from
${totalGames} simulated games total. No task text or task ids appear anywhere in this file — only counts,
percentages, and content-neutral labels (category names, route ids).

This file's own batches are smaller than X2-X5's own test files (which
already spend their own ≤30s-per-group budget proving pass/fail bounds):
length ${LENGTH_SEEDS_PER_CELL}/cell (vs. X2's 3), economy ${ECONOMY_SEEDS_PER_PRESET}/preset (vs. X3's 10),
fairness ${FAIRNESS_SEEDS} seats-rotated games (vs. X4's 120), Service ${SERVICE_SEEDS_PER_PRESET}/preset (vs. X4's 10),
repeats 1 chain of 4 sessions (same as X5). Numbers here are a smaller, still-real sample of
the SAME deterministic simulator X2-X5 test against — not a different or looser model.

## Success model

Base success rate by difficulty: easy ${DEFAULT_SUCCESS_MODEL.base.easy}, moderate ${DEFAULT_SUCCESS_MODEL.base.moderate}, hard ${DEFAULT_SUCCESS_MODEL.base.hard}.
Assisted multiplier ${DEFAULT_SUCCESS_MODEL.assistedMultiplier} (capped at ${DEFAULT_SUCCESS_MODEL.assistedCap}), amplified multiplier ${DEFAULT_SUCCESS_MODEL.amplifiedMultiplier}.
Clue bonus +${DEFAULT_SUCCESS_MODEL.clueBonus}, eliminate-option bonus +${DEFAULT_SUCCESS_MODEL.eliminateBonus}, skip chance ${pct(DEFAULT_SUCCESS_MODEL.skipChance)}.
Standard-mix (30/50/20 easy/moderate/hard) weighted rate: ${num(weightedStandardMixRate(DEFAULT_SUCCESS_MODEL), 3)} — compare against
\`estimator.ts\`'s own 0.65 \`successRate\` constant (OPEN_QUESTIONS item 11).

This is a documented parameter set for exercising the real engine and deck at scale, not a claim
about real players — Brian's own playtest timings calibrate the estimator separately.

## Team policies (presets)

${presetTable}

## X2 — game length and sufficiency

${renderLengthTable(lengthCells)}

## X3 — resource economy (4 teams, standard)

${renderEconomyTable(economyBatches)}

## X4 — fairness

### Win share and first-to-Rome share by seat (4 teams, standard, policy rotated by seed)

${renderFairnessTable(fairnessBatch)}

Seat spread (max − min win share): ${pct(seatSpread)}. See OPEN_QUESTIONS item 37: this game's own
"finish the round" ending rule structurally favors earlier seats, and design doc §21 explicitly
allows a shared victory, so a win-share spread well above 1/team-count is the intended shape of
the game, not by itself a fairness defect — first-to-Rome share is the more direct turn-order signal.

### Routes

North fork (coastal/inland/mountain) and Aegean fork (corinth/macedonia) draw-weight shifts are
X4b's whole point (a route's own difficulty now shifts the session's draw weights one step) — a
static "required successes / base rate" formula does not capture the shifted in-play odds, so route
cost is reported qualitatively here rather than re-deriving X4's own per-route numbers; see
\`tests/sim/group-x4-fairness.test.ts\` and OPEN_QUESTIONS item 37's routes note for the full formula.

### Community events and catch-up

${communityLines}

### Service by preset (4 teams, standard, ${SERVICE_SEEDS_PER_PRESET} seeds each)

${renderServiceTable(serviceBatches)}

## X5 — content-repeat analysis (one chain: 4, 2, 8, 4 teams; one-session memory)

${renderRepeatsTable(repeatSessions)}

## Findings

- Seat win-share spread across ${FAIRNESS_SEEDS} rotated-policy games: ${pct(seatSpread)} (OPEN_QUESTIONS item 37).
- BOLD's Journey Token rate across ${ECONOMY_SEEDS_PER_PRESET} games: ${pct(journeyTokenBold)} (spec's own 30% expectation is informational, not a gate — OPEN_QUESTIONS item 36's smaller-sample ruling applies here too).
- Catch-up grants in ${FAIRNESS_SEEDS} four-team games: ${catchUpTotal} (near-zero is the expected shape at 4 teams — catch-up needs a team more than two stages behind the leader).
- **Game length (the finding that matters for §35 item 22):** at standard, the modeled duration runs ${num(minRatio, 2)}x–${num(maxRatio, 2)}x the estimator's own planned minutes across 2–8 teams; a 4-team Standard game models at ${num(fourTeamModeled, 0)} minutes against ${num(fourTeamPlanned, 0)} planned and the design's 55-minute target (OPEN_QUESTIONS item 42). The estimator counts the journey's required successes; the model also pays for the ~35% of moderate attempts that fail, the recover retries those buy, and the community events — the estimator's constants were never calibrated against play (item 11). Brian's timed playtest decides whether real rooms are faster than the 45s/task model, or the journey/constants need retuning.
- **Content supply (the finding that matters for Phase 11 content growth):** with one-session memory (4 → 2 → 8 → 4 teams) the chain holds zero repeats through session 3, then session 4 — a 4-team game right after an 8-team game — repeats ${repeatSessions.at(-1)!.repeatsFromPrevious} of its ${repeatSessions.at(-1)!.distinctThisSession} tasks (${repeatSessions.at(-1)!.relaxationCount} of the previous session's ids were let back in at build to reach the sufficiency bar; the deck's last-resort pool covers any further shortfall mid-game, and the game finished without exhausting). 128 tasks is enough for repeat-free memory up to about 5-team games back to back; an 8-team game consumes ~84 of them. ${totalRelaxations} exclusion relaxation${totalRelaxations === 1 ? "" : "s"} across the chain in total (OPEN_QUESTIONS item 42).
- The shipped \`general-bible\` pack currently ships zero real \`audioAssets\` (OPEN_QUESTIONS item 40) — this report's economy/fairness numbers are unaffected (they measure resource/turn mechanics, not audio), but any future audio-specific simulation metric would need real assets first.

## Proposals

- OPEN_QUESTIONS item 42 (game length): do not retune the journey, the success model, or
  \`estimator.ts\` on modeled numbers alone — Brian's timed playtest (§35 item 22) is the
  calibration point. If real rooms come in near the model, the candidates are (a) a lower
  Standard requirement (the journey's 7 required successes are content, frozen this phase),
  (b) recalibrating \`estimator.ts\`'s per-task constants so the setup screen's own estimate
  (already honest — it warns "longer than the 55-minute target" at 4 teams) matches reality,
  or (c) both. If real rooms are faster, the 45s/task model constant is what moves.
- OPEN_QUESTIONS item 37: rotate which team occupies "seat 0" each game (cosmetic — spreads the
  structural first-seat advantage across teams over many sessions rather than always favoring
  whichever team a host happens to list first), OR give every seat one guaranteed "grace" round
  after any team finishes (a real rule change to \`Engine.endTurnAndAdvance\`, weighed against
  longer games). Neither implemented this phase — \`src/engine/\` stays frozen to defects only.
- OPEN_QUESTIONS item 39: give "End session?" the same reopen-the-menu-on-cancel treatment as
  Audio/Game log/Delete saved game/Forget recent tasks, gated so a successful CONFIRM (which tears
  the game down) does not trigger it — a small, well-scoped Phase 11 fix.
- OPEN_QUESTIONS item 40: once Brian records real narration/task audio, re-point
  \`tests/audit/group-x8-recovery.test.ts\`'s N/R/L test at the real assets and drop its in-memory
  synthetic-asset augmentation.
`;
}
