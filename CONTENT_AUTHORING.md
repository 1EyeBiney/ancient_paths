# CONTENT_AUTHORING — packs, secrecy, and audio task definitions

Binding guidance for authoring content (Phase 9 and beyond) and for the
audio task behaviors Phase 6 implements.

## 1. The content secrecy policy (Brian plays this game)

Brian intends to host AND play. Therefore:

- **`dev-sample` is the only pack Brian ever reads.** It is throwaway
  development content used by tests, demos, and the boot page. Nothing in
  it may be reused in a production pack.
- **Production packs (starting with the real `general-bible`) are authored
  by agents in sessions where the content is never shown to Brian.**
  Agents must NEVER quote, summarize, or list production task prompts or
  answers in conversation with Brian, in commit messages, in
  IMPLEMENTATION_STATUS.md, or in any file he routinely reads. Refer to
  production tasks only by id and category counts ("34 scripture-knowledge
  tasks authored").
- Validation of production content is automated (schema + tests + the
  diagnostic deck preview of §29, which must also be treated as
  spoiler-bearing). Optional human proofreading is done by a sighted
  reviewer other than Brian.
- Playtest logs and event logs contain task ids, not prompts, wherever
  they might be read by Brian before he has played that content.
- **Amendment (2026-09-02, Brian's ruling — honor system):** tasks whose
  audio Brian personally produces (Voice Portrait clips, melody data,
  recorded renditions) are necessarily known to him. He plays anyway and
  simply does not contribute when such a task comes up for his team. A
  mechanical alternative was designed and shelved, available if the honor
  system ever gets old: tag author-known tasks (existing `tags` field,
  e.g. "author-brian") and add an `excludeTags` option to the session
  builder plus an "exclude tasks known to the host" setup toggle.

## 2. Production pack sourcing rules (design doc §13.3, §13.5)

- Historical claims are sourced during authoring and tagged in
  `historicalNote` with the distinction the design doc requires (stated in
  Scripture / accepted background / disputed).
- Hymns: public-domain only (published pre-1929, both words and music).
  Renditions (audio files) are produced by us — synthesized or performed —
  never sourced from third-party recordings.

## 3. Hymn and audio task model (defined 2026-09-02)

Hymn tasks come in these authored shapes (all use the ordinary task
schema — no new task kinds):

1. **Lyric completion** — text-only; prompt quotes the line with a blank.
   Works with zero audio. (Example shape: dev-hymn-001.)
2. **Melody identification** — task-level `audioAsset` is the NORMAL
   excerpt (longer, e.g. eight notes); the amplified variant carries its
   own SHORTER excerpt via the variant-level `audioAsset` override worth
   two successes. `maxPlays` per variant (default 2; amplified typically 1).
3. **Progressive introduction** — the base excerpt is short; the authored
   Insight interaction serves a LONGER excerpt (an additional asset
   referenced from the task's clue/insight data). Costs Insight like any
   extra clue.
4. **Altered detail** — two assets (original and altered); the prompt asks
   what changed. Same override mechanics.

Rules that apply to every audio/hymn task (design doc §13.4/§13.5/§22):

- Every audio asset has a transcript and `fallbackText`; when audio is
  unavailable the task is still playable from the fallback (for melody
  tasks the fallback poses the lyric-based form of the same question, and
  the task remains worth the same successes).
- Replay counting is engine-enforced from `maxPlays`; Insight's `replay`
  effect grants one replay beyond the cap where the task allows it.
- Excerpts are engineered to be fair by ear alone: no visual notation,
  no reliance on stereo placement.
- Narration/voice/hymn playback uses HTML5 audio (screen readers duck it);
  synthesized cues use Web Audio (see ACCESSIBILITY_PATTERNS §5).

## 3b. Voice Portrait tasks (defined 2026-09-02)

A speaking-clue identification shape ("Who Am I?"), produced with
ElevenLabs or recorded voices. A Biblical figure speaks progressive
first-person clues; teams guess the person. A multi-voice variant, the
**Event Scene**, has a narrator or several voices describing an event to
identify.

- Category: `audio-listening` (or `scripture-knowledge` where the guess
  leans on Bible knowledge more than listening). No new category.
- Mechanics map directly onto existing machinery:
  - The task's opening prompt plays the FIRST clue clip (task-level
    `audioAsset`).
  - Each entry in `clues` is the transcript of the next spoken clue, and
    the parallel `clueAudio` array holds the matching clip ids — so
    spending Insight for an extra clue PLAYS the character's next line.
  - Amplified form: answer after the first clue only, for two successes
    (authored variant, typically with no clue access — set
    `resourceInteractions.insight` appropriately or price it in).
  - Assisted form: multiple-choice options ("Was it Ruth, Naomi, or
    Orpah?").
- Every clip needs a transcript and fallbackText (the game must be
  playable text-only, as with all audio tasks).
- Clips are ordinary served audio files (voices cannot be synthesized in
  the browser). ElevenLabs output requires a plan whose license covers
  publishing the clips in a publicly served game — confirm before
  shipping any clip.

## 3c. Melodies as data (decided 2026-09-02)

Hymn tunes for melody tasks are stored as NOTE DATA, not audio files, and
synthesized in the browser at play time (GitHub Pages serves only static
files, but all synthesis happens client-side — no server needed).

- Brian authors melodies from his MIDI tools into a small JSON shape,
  draft (final schema lands with PHASE6_SPEC alongside the sequencer that
  plays it):

```json
{
  "melodyId": "amazing-grace",
  "title": "Amazing Grace (New Britain)",
  "tempoBpm": 90,
  "notes": [ { "midi": 62, "beats": 1 }, { "midi": 67, "beats": 2 } ],
  "attribution": "Public domain (pre-1929)."
}
```

- Every variation is a PARAMETER over the same data, generated live:
  first N notes (normal 8 / amplified 4), altered tempo, transposition,
  an authored wrong-note substitution. No per-variant audio production.
- Recorded renditions remain fully supported as ordinary audio assets
  wherever richer sound is wanted; note data is the workhorse for
  identify-the-tune mechanics.
- Melody data for pre-1929 hymns is public domain by nature; keep the
  attribution field honest anyway.

## 4. Version-one content targets (design doc §30.1)

30 Scripture Knowledge, 15 Bible Reasoning, 15 Historical Context,
10 Audio/Listening, 10 Hymn (PD only), 10 Decision/Strategy tasks,
4 Community Events, 20 Offering outcomes, and location introductions for
all landmarks — authored under the secrecy policy above, validated by the
schema, with placeholder tones standing in for unproduced audio.
PHASE9_SPEC.md raises the task targets (128 total, so two 4-team
sessions draw without repeats) and binds the authoring rules.

## 5. Operational rules added with Phase 9 (2026-09-03)

- **Development packs are `dev-*`.** A pack whose id starts with `dev-`
  never loads in a production build and defaults to unchecked in setup
  whenever a production pack is present. No schema flag — the id IS the
  flag. `dev-sample` stays the one pack Brian reads; `dev-playtest` is
  generated placeholder content.
- **Tests over production content are blind.** Every assertion reduces
  to a boolean whose failure message carries only a task id and a rule
  name; no test compares, snapshots, or prints a production task's text.
  Diagnosis is by opening the pack file yourself, silently.
- **Asset ids and transcripts never reveal an answer.** The Sound check
  screen lists every loaded asset by id and the transcript stands in for
  the audio wherever it can't play; a melody asset for a "name this
  hymn" task is therefore `gb-hymn-tune-03` with a transcript like "the
  first eight notes of the tune", never the hymn's name — the ANSWER
  names it.
- **A journey file is not secret.** Milestone introductions, route
  descriptions, event titles/descriptions and offering announcements are
  read aloud to the whole room; only tasks are secret.
- **A relay asks a shared community task** (PHASE9_SPEC Group N1 closes
  the gap where the engine never drew one): open-list prompts, judged by
  `hostGuidance` that states the rule without listing the answers, with
  the full set revealed to the room when the event resolves.
- **Unproduced audio in v1**: audio-listening tasks are text-delivered
  (the prompt is the transcript), `audioAsset: null`, tagged
  `audio-pending`; hymn tasks are text-only until Brian's melody data
  arrives (OPEN_QUESTIONS 23). No placeholder tones ship in a production
  pack — a beep before a real task is worse than no clip.
- **Variant costs follow the resource's job (Phase 9 review, OPEN_QUESTIONS
  35).** The assisted form costs **Provision** (design doc §8.2 "reduce an
  authored challenge to its assisted form", §20.5 "spend Provision for an
  eligible assisted form"); the amplified form costs **Courage** (§8.3);
  clues, option elimination and audio replay cost **Insight** (the engine's
  `insightEffectCost`, not authored per task). The schema leaves
  `cost.resource` free, and the engine deducts whatever a task declares,
  but the host's buttons are labelled "Spend Provision for the assisted
  form" / "Spend Courage to amplify the task" — so a task authored
  otherwise silently misleads the host. `general-bible.test.ts` enforces
  this blind; `dev-sample` was corrected to match.
- **A clue never answers the amplified form (Phase 9 content review,
  OPEN_QUESTIONS 35).** An amplified form earns two successes for
  knowing an extra detail; a purchasable clue that hands over that
  detail turns Courage's calculated risk (§8.3) into a one-Insight
  purchase. Clues help with the BASE question only. (Voice Portraits
  already say this: §3b "answer after the first clue only".) No blind
  rule can check this — it is a reviewer's item; a factual review pass
  over every new category is part of authoring, not optional.
