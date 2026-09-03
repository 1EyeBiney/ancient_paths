# PHASE6_SPEC — The Audio System

Binding contract for the Phase 6 unattended implementation (design doc
§22, §34 Phase 6). Read CLAUDE.md's agent rules first. This spec
outranks improvisation; where it is silent, ACCESSIBILITY_PATTERNS.md §5
governs (BINDING for this phase — read it twice), then CONTENT_AUTHORING
§3/§3b/§3c, then design doc §22. Do not modify: the design doc,
`src/engine/`, `src/session/`, `src/content/schemas.ts` (the audio
asset, melody, and reference-validation changes are ALREADY there —
Fable added them with this spec), `dev-sample.json`, `jerusalem-
rome.json`, or any PHASE*_SPEC.md. If blocked, write the problem to
OPEN_QUESTIONS.md and continue with another group. KEYBOARD_COMMANDS.md
is a living file: this phase ADDS bindings — update it.

Prerequisites (all true today): Phases 2-5B green, 303 tests passing,
the site deploys on every push to `main`.

## Objective (§34 Phase 6)

"Narration queue; effects; music; pause; replay; skip; transcripts;
fallback speech; volume categories; prevention of overlapping
announcements. Deliverable: **missing optional audio never makes the
game inaccessible.**"

Text-first remains the rule (CLAUDE.md decision 7): interface speech is
the primary channel; produced audio is an enhancement layered on it.
Nothing in this phase may make a screen-reader host's experience worse
than Phase 5B's. Brian's ear is the tiebreaker on everything audible.

## What the schema already provides (do not change it)

- `audioAssetSchema`: `{ assetId, filePath? | melody?, assetType,
  transcript, durationSeconds, volumeRecommendation?, replayAllowed,
  fallbackText, attribution }` — exactly ONE of `filePath` / `melody`.
- `melodySchema` (CONTENT_AUTHORING §3c): `{ melodyId, title, tempoBpm,
  notes: [{ midi, beats }…], attribution }`.
- `contentPack.audioAssets?` and `journey.audioAssets?` arrays. Every
  `task.audioAsset`, variant `audioAsset`, `clueAudio[i]`, and
  `milestone.ambientAudioAsset` reference MUST resolve within its own
  pack/journey (validated at load; dangling ids are content errors).
- Variant `maxPlays` (default 2) — NOT enforced by the engine (verified:
  the engine only logs the Insight "replay" spend). Play caps are the
  audio manager's job.
- `PublicTask` carries no audio ids; look the full `Task` up by id in
  `tasksById` (the established Phase 5 pattern, OPEN_QUESTIONS 15).

## Architecture (new files under `src/ui/audio/`)

- `cues.ts` — synthesized cue DEFINITIONS as data: `CUES` table mapping
  cue ids (`correct`, `incorrect`, `skipped`, `stageComplete`,
  `journeyToken`, `communitySuccess`, `communityFail`, `arrival`,
  `celebration`, `menuOpen`) to short tone sequences `[{ hz, ms, gain }]`.
  Pure data, so tests assert the table without sound.
- `sequencer.ts` — melody synthesis. `scheduleMelody(melody, options)` →
  a pure `NoteEvent[]` (`{ startSec, durationSec, hz }`) applying the
  variation parameters: `firstN`, `transposeSemitones`, `tempoFactor`,
  `wrongNote: { index, midi }`. `playSchedule(schedule, ctx, gainNode)`
  drives Web Audio oscillators (sine, short attack/release envelope).
  `hzForMidi(midi) = 440 · 2^((midi-69)/12)`.
- `backend.ts` — the ONLY code that touches `HTMLAudioElement`,
  `AudioContext`, or timers. An `AudioBackend` interface with two
  implementations: `BrowserAudioBackend` (real) and `FakeAudioBackend`
  (tests: records every call, lets a test fire `ended`, fail a load, or
  advance its clock). Everything else in this phase is testable against
  the fake — that is the point of the seam.
- `manager.ts` — `AudioManager`: categories, the produced-audio queue,
  play caps, pause/replay/stop/skip, fallbacks, cancellation tokens, the
  kill switch, and the presenter gate. Detailed below.
- `src/ui/app.ts` — constructs the manager, unlocks it on the first user
  gesture, wires game hooks, adds the audio controls + the Audio dialog.
- `src/ui/presenter.ts` — gains an optional `gate` (below). Small change.
- `scripts/make-dev-playtest.mjs` — extended to emit audio assets (below).
- `scripts/make-placeholder-audio.mjs` — writes tiny placeholder WAV
  tones (pure JS, no dependencies) under `public/audio/dev/`.
- Tests under `tests/ui/audio/` (`group-a*.test.ts`).

## The binding rules, restated as requirements (ACCESSIBILITY_PATTERNS §5)

1. **Voice through HTML5 `<audio>`, cues and melodies through Web Audio.**
   `assetType` narration / task-audio / hymn-with-filePath / ambient /
   music → `<audio>` elements. Cues and melody assets → Web Audio. Never
   route a voice clip through Web Audio (screen readers can't duck it).
2. **Completion-driven, never guessed**: chain on `ended` with a fired-
   once guard AND a failsafe timer of `durationSeconds + 1.5 s` (browsers
   swallow `ended`); whichever fires first wins, the other is cancelled.
3. **One deferred-announce slot**: while a produced clip is playing,
   polite `present()` calls are held in a single slot (latest wins,
   earlier ones dropped — they're superseded) and flushed once when the
   clip ends or is stopped. Assertive announcements STOP the clip and go
   out immediately (§22.2 "intentionally stop it when the user requests
   an interrupt"). The presenter gains `setGate(gate | null)` where
   `gate = { shouldDefer(): boolean, defer(input): void }`; the manager
   is the gate.
4. **Cancellation tokens**: every async sequence captures a token at start
   and re-checks it before each step; `killAll()` (called on every engine
   state change and on leaving play) bumps the token and clears every
   pending timer from ONE array.
5. **SFX under speech dampened ×0.6**: while a narration/task-audio clip
   is playing, the effects category gain is multiplied by 0.6.
6. **Missing clip → fallback text**: a load error, an unknown asset id,
   an absent AudioContext, or an unavailable file presents the asset's
   `fallbackText` (polite) and continues as if the clip had ended. Never
   a thrown error, never silence.

## AudioManager

```
constructor({ backend, present, settings, getAssets })
  settings: { master, music, effects, narration } (0-100, from SetupWizard.audio)
  getAssets(): Map<assetId, AudioAsset>   (pack + journey assets merged at beginJourney)
unlock()                 first user gesture: create/resume the AudioContext
setSettings(partial)     live gain changes (Audio dialog)
playAsset(id, { category, onDone? })   queue-aware produced playback
playCue(cueId)           immediate, never queued, never gated
playMelody(id, variation)             Web Audio via the sequencer (queued like a clip)
pause() / resume()       the current produced clip
stop()                   current clip → flush the deferred slot
replay()                 current task audio again, respecting caps
skip()                   optional narration only (never task audio)
killAll()                the kill switch
canPlayTaskAudio(taskId, variantKind): { allowed, played, cap }
grantReplay(taskId)      +1 to the cap for this presentation (Insight "replay")
```

- **Gain** = `master/100 × category/100 × (asset.volumeRecommendation ?? 1)`,
  applied via `<audio>.volume` or a Web Audio GainNode per category.
- **Queue**: produced clips (narration, task audio, melodies) play one at
  a time, FIFO; cues bypass the queue; ambient/music is a separate
  looped channel (one at a time, cross-faded by stop-then-play; no
  overlap rule applies to it against speech only via dampening).
- **Play caps**: per presented task (keyed by the task id + a
  presentation counter that resets on `presentTask`), the active
  variant's `maxPlays ?? 2`. `replay()` beyond the cap presents "No
  replays left." `grantReplay` raises the cap by one (called by app.ts
  when the Insight `replay` action runs).
- **Optional vs required**: narration and ambient are OPTIONAL (skippable
  with N); task audio is REQUIRED for the task's fairness and is never
  skipped by N (stop with X is allowed; a stopped task clip still counts
  as one play).

## Game hooks (app.ts, on every render/transition — all through the manager)

- `beginJourney`: merge pack + journey assets; `unlock()` on the Start-game
  click (it IS a user gesture); no audio before that.
- `landmarkIntroduction` entry: the milestone's `ambientAudioAsset`
  (if any) starts looping on the music channel; otherwise silence.
- `resourceWindow` entry (a new presentation): if the active variant (or
  task) has an audio asset, play it once automatically (counts as play 1)
  AFTER the screen's entry announcement has been flushed — i.e. queue
  the clip and let the presenter gate defer nothing that was already
  spoken. Variant changes (assist/amplify) re-resolve the asset and
  reset the cap to the new variant's `maxPlays`.
- Extra clue revealed (`cluesRevealed` grew): play `clueAudio[i]` for the
  new clue, if present (Voice Portrait: the character's next line).
- `rule` result: `correct` / `incorrect` / `skipped` cue.
- Stage completion (a milestone arrival or stagesBeyond increment):
  `stageComplete`; Journey Token earned: `journeyToken`; community
  resolve: `communitySuccess` / `communityFail` from the event log line;
  `gameSummary`: `celebration`; game menu open: `menuOpen`.
- Every engine state change: `killAll()` FIRST, then the hooks above.
- `undo`: `killAll()` and nothing else (no cue replays on undo).

## Controls (§22.3) and keys

| Key | Function | States |
|---|---|---|
| Space | Pause / resume the current produced clip (already reserved) | play states |
| L | Listen again: replay the current task audio (respects the cap) | resourceWindow, awaitingAnswer |
| X | Stop the current clip | play states |
| N | Skip optional narration (never task audio) | play states |

Each key has a visible button in the host controls (dual modality);
pressing one with nothing playing says so ("Nothing is playing."). Add
the four to `KEY_BINDINGS` and KEYBOARD_COMMANDS.md. The game menu gains
**Audio…** opening a modal (via `modal.ts`) with the four volume number
inputs (live) and an "Interface speech" choice: **wait** (default —
announcements defer until the clip ends) or **interrupt** (announcements
stop the clip). Setup's existing audio inputs now actually apply.

## Content: dev-playtest gains audio (Decisions, Brian may veto)

1. `scripts/make-placeholder-audio.mjs` writes ~6 tiny 16-bit mono WAVs
   (≤ 1 s each, simple tones, pure-JS RIFF writer) to
   `public/audio/dev/placeholder-N.wav` — stand-ins for narration and
   Voice Portrait clips. No real voices, no ElevenLabs (licensing still
   unconfirmed — OPEN_QUESTIONS 12).
2. `make-dev-playtest.mjs` emits `audioAssets`: 4 melody assets (assetType
   `hymn`, SYNTHETIC scale/arpeggio tunes titled "Placeholder tune N" —
   Brian authors the real public-domain hymn melodies later) and 6 file
   assets pointing at the WAVs, then references them: every 10th
   `audio-listening` task gets a task-level clip + `clueAudio`; every
   `hymn` task with `n % 3 === 1` gets a melody asset (amplified variant
   `maxPlays: 1`). Everything obviously fake; the pack still never ships.
3. `jerusalem-rome.json` stays untouched (no ambient assets yet; Phase 9
   authors them). Ambient is proven by a bespoke test journey.

## Test list (implement in order; files under tests/ui/audio/)

Group A1 — cues and sequencer (pure): every `CUES` entry has ≥1 tone with
positive `ms`; `hzForMidi(69) = 440`, `hzForMidi(81) = 880`;
`scheduleMelody` honors `firstN`, `transposeSemitones` (hz doubles per
+12), `tempoFactor` (durations scale inversely), and `wrongNote` (only
that index changes); total duration equals Σ beats × 60/tempo;
deterministic.

Group A2 — schema (already green, extend): pack/journey audio assets,
dangling references, one-source rule, melody assets — plus: the
dev-playtest pack, once regenerated, validates and contains both melody
and file assets, and every referenced WAV exists on disk.

Group A3 — the manager against the fake backend: queue is FIFO and one-
at-a-time; `ended` fires the next clip; a swallowed `ended` is rescued
by the failsafe (advance the fake clock past `durationSeconds + 1.5`);
the fired-once guard (fire `ended` twice) advances only once; a load
error presents `fallbackText` and continues; an unknown id presents a
fallback-style message; `killAll` cancels a pending sequence (a later
`ended` from the old token does nothing); pause/resume/stop/replay/skip
call the right backend methods; a task clip's cap: 2 plays then "No
replays left.", `grantReplay` allows a third; skip never skips task
audio; gain math per category with `volumeRecommendation`.

Group A4 — presenter gate: while a clip plays, three polite `present()`
calls result in ONE announcement (the last) after `ended`; an assertive
`present()` stops the clip and announces immediately; with "interrupt"
speech behavior, polite announcements also stop the clip; effects gain
is ×0.6 while narration plays and restores after.

Group A5 — controls: Space/L/X/N reach the manager (KeyboardController
ids `audioPause`, `audioReplay`, `audioStop`, `audioSkip`); each has a
button; "Nothing is playing." when idle; L outside its states says
"does nothing here"; KEYBOARD_COMMANDS.md lists all four (a test reads
the file); the Audio dialog's inputs change manager settings live and
the speech-behavior choice flips the gate mode.

Group A6 — game hooks (App + fake backend, dev-playtest with audio +
testJourney or a bespoke journey with an ambient asset): task clip plays
on presentation and counts; extra clue plays its `clueAudio`;
correct/incorrect/skipped cues fire on rulings; ambient starts on
landmark arrival; `celebration` at gameSummary; a state change mid-clip
kills it; running the whole U10 keyboard script produces a backend log
whose cue sequence is consistent with the engine's event log (spot-check
counts: rulings == cue count).

Group A7 — the deliverable: with a backend whose `AudioContext` and
`<audio>` both FAIL (constructor throws / every load errors), the full
U10 keyboard game still reaches gameSummary, every audio asset it would
have played appears as its `fallbackText` in the presenter log, and no
exception escapes. Run it twice: once with a fake that succeeds, once
that fails; both reach gameSummary.

Group A8 — browser check (manual, by Sonnet, recorded): `npm run dev`,
Start game (the unlock), present a hymn task and confirm via
`getComputedStyle`/DOM that the melody is scheduled (an AudioContext in
`running` state, oscillators created — inspect via the backend's own
counters exposed on `window.__audioDebug` in dev only), Space pauses a
placeholder WAV (`<audio>.paused` flips), L replays and the cap message
appears on the third try, the Audio dialog changes `<audio>.volume`
live. Sonnet cannot hear; Brian's ear is the final check. Record results
and anything surprising in OPEN_QUESTIONS.md.

## Definition of done

All A-groups green alongside the existing 303 tests; `npx tsc --noEmit`
and `npm run build` clean; placeholder WAVs and the regenerated
dev-playtest committed with their generators; KEYBOARD_COMMANDS.md
updated; OPEN_QUESTIONS.md updated with the browser-check results and
any discrepancy found (never silently fixed); IMPLEMENTATION_STATUS.md
moves Phase 6 to Completed, styled like Phases 2-5B; no forbidden files
modified; committed per green group and pushed (each push deploys —
Brian will listen on the live site).
