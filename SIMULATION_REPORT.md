# Simulation Report

Generated 2026-09-03 by `src/sim/report.ts` (PHASE10_SPEC Group X10, amended in Fable's Phase 10 review) from
116 simulated games total. No task text or task ids appear anywhere in this file — only counts,
percentages, and content-neutral labels (category names, route ids).

This file's own batches are smaller than X2-X5's own test files (which
already spend their own ≤30s-per-group budget proving pass/fail bounds):
length 2/cell (vs. X2's 3), economy 5/preset (vs. X3's 10),
fairness 30 seats-rotated games (vs. X4's 120), Service 5/preset (vs. X4's 10),
repeats 1 chain of 4 sessions (same as X5). Numbers here are a smaller, still-real sample of
the SAME deterministic simulator X2-X5 test against — not a different or looser model.

## Success model

Base success rate by difficulty: easy 0.85, moderate 0.65, hard 0.45.
Assisted multiplier 1.25 (capped at 0.95), amplified multiplier 0.8.
Clue bonus +0.1, eliminate-option bonus +0.1, skip chance 2.0%.
Standard-mix (30/50/20 easy/moderate/hard) weighted rate: 0.670 — compare against
`estimator.ts`'s own 0.65 `successRate` constant (OPEN_QUESTIONS item 11).

This is a documented parameter set for exercising the real engine and deck at scale, not a claim
about real players — Brian's own playtest timings calibrate the estimator separately.

## Team policies (presets)

- **PASSIVE**: route=first, window=passive, recover=never, surplus=keepLeast, contribution=hoarder, grantedChoice=least, journeyToken=hold
- **CAUTIOUS**: route=first, window=cautious, recover=always, surplus=keepLeast, contribution=hoarder, grantedChoice=least, journeyToken=hold
- **BOLD**: route=first, window=bold, recover=always, surplus=keepLeast, contribution=hoarder, grantedChoice=least, journeyToken=useOnHard
- **GENEROUS**: route=first, window=cautious, recover=always, surplus=offer, contribution=generous, grantedChoice=sharer, journeyToken=hold
- **HOARDER**: route=first, window=bold, recover=always, surplus=keepLeast, contribution=hoarder, grantedChoice=least, journeyToken=useOnHard

## X2 — game length and sufficiency

| Teams | Difficulty | Median rounds | Planned rounds | Median modeled minutes | Planned minutes | Exhausted / 2 |
|---|---|---|---|---|---|---|
| 2 | gentle | 6.5 | 3 | 60 | 40 | 0 |
| 2 | standard | 6.0 | 3 | 55 | 40 | 0 |
| 2 | challenging | 6.0 | 3 | 58 | 40 | 0 |
| 3 | gentle | 6.0 | 4 | 70 | 54 | 0 |
| 3 | standard | 6.0 | 4 | 70 | 54 | 0 |
| 3 | challenging | 6.0 | 4 | 77 | 54 | 0 |
| 4 | gentle | 6.5 | 4 | 98 | 66 | 0 |
| 4 | standard | 6.5 | 4 | 106 | 66 | 0 |
| 4 | challenging | 6.0 | 4 | 95 | 66 | 0 |
| 5 | gentle | 6.0 | 4 | 108 | 79 | 0 |
| 5 | standard | 6.0 | 4 | 114 | 79 | 0 |
| 5 | challenging | 6.0 | 4 | 116 | 79 | 0 |
| 6 | gentle | 7.5 | 6 | 129 | 101 | 0 |
| 6 | standard | 7.0 | 6 | 130 | 101 | 0 |
| 6 | challenging | 7.0 | 6 | 136 | 101 | 0 |
| 7 | gentle | 7.0 | 6 | 145 | 115 | 0 |
| 7 | standard | 7.0 | 6 | 147 | 115 | 0 |
| 7 | challenging | 7.0 | 6 | 147 | 115 | 0 |
| 8 | gentle | 7.0 | 6 | 163 | 129 | 0 |
| 8 | standard | 7.0 | 6 | 162 | 129 | 0 |
| 8 | challenging | 7.5 | 6 | 180 | 129 | 0 |

## X3 — resource economy (4 teams, standard)

| Preset | Assisted | Amplified | Cap discard | All at cap | Journey Token | Zero-spend teams | Mean Service |
|---|---|---|---|---|---|---|---|
| PASSIVE | 0.0% | 0.0% | 0.0% | 0.0% | 100.0% | 100.0% | 0.00 |
| CAUTIOUS | 100.0% | 0.0% | 0.0% | 0.0% | 100.0% | 0.0% | 0.00 |
| BOLD | 80.0% | 100.0% | 0.0% | 0.0% | 100.0% | 5.0% | 0.00 |
| GENEROUS | 100.0% | 0.0% | 0.0% | 0.0% | 100.0% | 5.0% | 5.70 |
| HOARDER | 100.0% | 100.0% | 0.0% | 0.0% | 100.0% | 0.0% | 0.00 |

## X4 — fairness

### Win share and first-to-Rome share by seat (4 teams, standard, policy rotated by seed)

| Seat | Win share | First-to-Rome share |
|---|---|---|
| 0 | 53.3% | 43.3% |
| 1 | 43.3% | 13.3% |
| 2 | 60.0% | 30.0% |
| 3 | 46.7% | 13.3% |

Seat spread (max − min win share): 16.7%. See OPEN_QUESTIONS item 37: this game's own
"finish the round" ending rule structurally favors earlier seats, and design doc §21 explicitly
allows a shared victory, so a win-share spread well above 1/team-count is the intended shape of
the game, not by itself a fairness defect — first-to-Rome share is the more direct turn-order signal.

### Routes

North fork (coastal/inland/mountain) and Aegean fork (corinth/macedonia) draw-weight shifts are
X4b's whole point (a route's own difficulty now shifts the session's draw weights one step) — a
static "required successes / base rate" formula does not capture the shifted in-play odds, so route
cost is reported qualitatively here rather than re-deriving X4's own per-route numbers; see
`tests/sim/group-x4-fairness.test.ts` and OPEN_QUESTIONS item 37's routes note for the full formula.

### Community events and catch-up

- Relay success rate: 100.0% across 60 relays.
- Contribution goal-met rate: 0.0% across 60 contributions — this batch's policy rotation (CAUTIOUS/BOLD/GENEROUS/HOARDER) has only GENEROUS ever pledging (the other three's `contribution` policy is "hoarder", a deliberate always-decline), so a low rate here reflects THIS batch's 1-in-4 contributor mix, not a general claim about real rooms (where most teams would plausibly contribute something).
- Exceptional-contribution awards: 0 total.
- Catch-up grants across this batch: 0 (4-team games — near-zero is expected; catch-up needs a team more than two stages behind).

### Service by preset (4 teams, standard, 5 seeds each)

| Preset | Mean Service |
|---|---|
| HOARDER | 0.00 |
| CAUTIOUS | 0.00 |
| GENEROUS | 5.85 |

## X5 — content-repeat analysis (one chain: 4, 2, 8, 4 teams; one-session memory)

| Session | Teams | Distinct tasks this session | Cumulative distinct tasks | Repeats from previous session | Deck warnings (any) | Exclusion relaxations at build |
|---|---|---|---|---|---|---|
| 1 | 4 | 44 | 44 | 0 | 0 | 0 |
| 2 | 2 | 24 | 68 | 0 | 0 | 0 |
| 3 | 8 | 84 | 110 | 0 | 1 | 0 |
| 4 | 4 | 43 | 122 | 7 | 9 | 8 |

## Findings

- Seat win-share spread across 30 rotated-policy games: 16.7% (OPEN_QUESTIONS item 37).
- BOLD's Journey Token rate across 5 games: 100.0% (spec's own 30% expectation is informational, not a gate — OPEN_QUESTIONS item 36's smaller-sample ruling applies here too).
- Catch-up grants in 30 four-team games: 0 (near-zero is the expected shape at 4 teams — catch-up needs a team more than two stages behind the leader).
- **Game length (the finding that matters for §35 item 22):** at standard, the modeled duration runs 1.26x–1.60x the estimator's own planned minutes across 2–8 teams; a 4-team Standard game models at 106 minutes against 66 planned and the design's 55-minute target (OPEN_QUESTIONS item 42). The estimator counts the journey's required successes; the model also pays for the ~35% of moderate attempts that fail, the recover retries those buy, and the community events — the estimator's constants were never calibrated against play (item 11). Brian's timed playtest decides whether real rooms are faster than the 45s/task model, or the journey/constants need retuning.
- **Content supply (the finding that matters for Phase 11 content growth):** with one-session memory (4 → 2 → 8 → 4 teams) the chain holds zero repeats through session 3, then session 4 — a 4-team game right after an 8-team game — repeats 7 of its 43 tasks (8 of the previous session's ids were let back in at build to reach the sufficiency bar; the deck's last-resort pool covers any further shortfall mid-game, and the game finished without exhausting). 128 tasks is enough for repeat-free memory up to about 5-team games back to back; an 8-team game consumes ~84 of them. 8 exclusion relaxations across the chain in total (OPEN_QUESTIONS item 42).
- The shipped `general-bible` pack currently ships zero real `audioAssets` (OPEN_QUESTIONS item 40) — this report's economy/fairness numbers are unaffected (they measure resource/turn mechanics, not audio), but any future audio-specific simulation metric would need real assets first.

## Proposals

- OPEN_QUESTIONS item 42 (game length): do not retune the journey, the success model, or
  `estimator.ts` on modeled numbers alone — Brian's timed playtest (§35 item 22) is the
  calibration point. If real rooms come in near the model, the candidates are (a) a lower
  Standard requirement (the journey's 7 required successes are content, frozen this phase),
  (b) recalibrating `estimator.ts`'s per-task constants so the setup screen's own estimate
  (already honest — it warns "longer than the 55-minute target" at 4 teams) matches reality,
  or (c) both. If real rooms are faster, the 45s/task model constant is what moves.
- OPEN_QUESTIONS item 37: rotate which team occupies "seat 0" each game (cosmetic — spreads the
  structural first-seat advantage across teams over many sessions rather than always favoring
  whichever team a host happens to list first), OR give every seat one guaranteed "grace" round
  after any team finishes (a real rule change to `Engine.endTurnAndAdvance`, weighed against
  longer games). Neither implemented this phase — `src/engine/` stays frozen to defects only.
- OPEN_QUESTIONS item 39: give "End session?" the same reopen-the-menu-on-cancel treatment as
  Audio/Game log/Delete saved game/Forget recent tasks, gated so a successful CONFIRM (which tears
  the game down) does not trigger it — a small, well-scoped Phase 11 fix.
- OPEN_QUESTIONS item 40: once Brian records real narration/task audio, re-point
  `tests/audit/group-x8-recovery.test.ts`'s N/R/L test at the real assets and drop its in-memory
  synthetic-asset augmentation.
