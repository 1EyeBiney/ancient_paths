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

## 4. Version-one content targets (design doc §30.1)

30 Scripture Knowledge, 15 Bible Reasoning, 15 Historical Context,
10 Audio/Listening, 10 Hymn (PD only), 10 Decision/Strategy tasks,
4 Community Events, 20 Offering outcomes, and location introductions for
all landmarks — authored under the secrecy policy above, validated by the
schema, with placeholder tones standing in for unproduced audio.
