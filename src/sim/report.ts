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
    `| Teams | Difficulty | Median rounds | Planned rounds | Exhausted / ${LENGTH_SEEDS_PER_CELL} |`,
    "|---|---|---|---|---|",
  ];
  for (const cell of cells) {
    const rounds = cell.results.map((r) => r.rounds);
    const med = median(rounds);
    const planned = cell.results[0]!.plannedRounds;
    const exhausted = cell.results.filter((r) => r.exhausted !== null).length;
    lines.push(`| ${cell.teamCount} | ${cell.difficulty} | ${num(med, 1)} | ${planned} | ${exhausted} |`);
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
    sessions.push({
      teamCount,
      distinctThisSession: result.distinctTasks,
      cumulativeDistinct: cumulative.size,
      warningCount: result.deckWarnings.length,
    });
    priorIds.push(result.taskIds);
  }
  return sessions;
}

function renderRepeatsTable(sessions: RepeatSession[]): string {
  const lines = ["| Session | Teams | Distinct tasks this session | Cumulative distinct tasks | Deck warnings |", "|---|---|---|---|---|"];
  sessions.forEach((s, i) => {
    lines.push(`| ${i + 1} | ${s.teamCount} | ${s.distinctThisSession} | ${s.cumulativeDistinct} | ${s.warningCount} |`);
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
  const firstRepeatSession = repeatSessions.findIndex((s, i) => i > 0 && s.warningCount > 0);

  const totalGames =
    lengthCells.reduce((s, c) => s + c.results.length, 0) +
    ECONOMY_SEEDS_PER_PRESET * PRESETS.length +
    FAIRNESS_SEEDS +
    SERVICE_SEEDS_PER_PRESET * 3 +
    repeatSessions.length;

  const presetTable = PRESETS.map((p) => `- **${p.name}**: ${policyOneLine(p)}`).join("\n");

  return `# Simulation Report

Generated ${REPORT_DATE} by \`src/sim/report.ts\` (PHASE10_SPEC Group X10) from
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
- Recent-use exclusion held with no relaxation warning through session ${firstRepeatSession < 0 ? repeatSessions.length : firstRepeatSession} of this one-session-memory chain.
- The shipped \`general-bible\` pack currently ships zero real \`audioAssets\` (OPEN_QUESTIONS item 40) — this report's economy/fairness numbers are unaffected (they measure resource/turn mechanics, not audio), but any future audio-specific simulation metric would need real assets first.

## Proposals

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
