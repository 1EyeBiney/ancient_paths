# Open Questions

Per design doc §1.10 and §37: decisions made with the "simplest reversible
option" rule are recorded here, along with genuinely unresolved questions.
Items marked DECIDED were ruled on by Brian and override the design doc.

## Decided (2026-09-02)

1. **DECIDED — Hosting**: internet-served static app on Brian's GitHub space
   (GitHub Pages). No backend. Spec's "no internet during play" amended to
   "loads from the web; offline caching is a possible later enhancement."
2. **DECIDED — Dual modality**: mouse + visual play is first-class alongside
   keyboard + screen reader (most churches won't run a screen reader).
3. **DECIDED — Host-as-player**: the host never sees/hears answers before a
   team commits aloud. Flow: answer aloud → host reveals to everyone → host
   rules. No private host channel, no secondary display. (Brian's
   preference; revisit only if it proves complicating.)
4. **DECIDED — Provision "retry" is now "recover"**: after a failure, spend
   Provision to draw a replacement task (same category and difficulty, same
   success opportunity, same turn) from the deck's reserves. Authored
   retry-variants are used where content provides them. A publicly revealed
   answer is never re-asked.
5. **DECIDED — Journey plan**: composite Pauline route for version one;
   "Paul's Voyage to Rome" (Acts 27–28, storm-flavored) reserved as the
   second journey.
6. **DECIDED — Stage counts** (working values pending playtests): Short ≈ 2,
   Standard ≈ 3–4, Long ≈ 5–6 stages; not every milestone is a stage
   boundary. The duration estimator is a first-class feature.
7. **DECIDED — Hymn rights**: public-domain (pre-1929) hymns only, with
   self-produced renditions. Narration is text-first; produced recordings
   come later.

## Open

1. Final milestone list and exact stage layout for the composite journey
   (current sample uses Jerusalem → Caesarea → Antioch → Rome; Asia Minor
   and Greece milestones to be added when the journey is authored fully).
2. Exact Journey Token power (spec §37.4) — awaiting balance testing.
3. Community Event catch-up reward rules (spec §37.5) — configurable;
   defaults to be set during Phase 7.
4. Whether a timed endgame / final challenge is offered (spec §37.7).
5. Whether recent-task history persists between games automatically
   (spec §37.10) — deferred; per-session memory only in version one.
6. Final keyboard map after accessibility testing (spec §37.12) — the
   proposal in KEYBOARD_COMMANDS.md is a starting point.
7. How team answer entry works in detail for host-as-player mode when the
   host's own team answers (self-ruling relies on the room as referee —
   confirm in playtesting that this feels fair).
8. Whether the audience display and host controls are one page (current
   assumption: yes, one window, one page) — revisit if playtests want a
   projector-only view without visible controls.
