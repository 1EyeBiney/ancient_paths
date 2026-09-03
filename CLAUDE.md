# CLAUDE.md — Ancient Paths (game title: "The Way: A Journey Through Bible Lands")

## Status: PHASE 5B COMPLETE, PHASE 6 (AUDIO) SPECIFIED (2026-09-02) — implement PHASE6_SPEC.md next

Repo: https://github.com/1EyeBiney/ancient_paths (PRIVATE), branch main.
Stack: TypeScript 7 / Vite 8 / Vitest 4 / Zod 4; `npm test` (297/297
passing), `npx tsc --noEmit` clean, `npm run build` → dist/ (base "./"
for Pages; map assets under `public/map/` copy through). See
IMPLEMENTATION_STATUS.md for the full inventory and OPEN_QUESTIONS.md
for decided amendments + open items.

**Phases 2, 3, and 4 are done**, each built against its binding spec
(PHASE2_SPEC.md: the headless engine in `src/engine/`, groups A-I plus a
full-game smoke test; PHASE3_SPEC.md: the session builder in
`src/session/`, groups S1-S11 including real SessionDeck-in-engine
integration; PHASE4_SPEC.md: the accessible host interface in `src/ui/`,
groups U1-U10 including a complete keyboard-only AND mouse-only game) by
an unattended Sonnet implementing agent per the rules below. The design
doc is revision 1.1 (host-as-player amendments applied in-place). The
Phase 2 estimator discrepancy is RESOLVED (the spec's own arithmetic
error; formula stands — OPEN_QUESTIONS item 11). The game now has a real
UI: `index.html`/`src/main.ts` boot `src/ui/app.ts`, replacing the old
Phase 1 boot page.

**Phase 5 is done** (PHASE5_SPEC.md, groups V1-V8, 262 tests): the
audience view renders on the same pass as the host controls, team
badges, journey strip, progress panels, a real stylesheet with reduced
motion, the full setup screen, and a generated never-ships
`dev-playtest` pack that makes the browser build playable
(`npm run dev`). Awaiting Brian's NVDA/sighted pass on: the scoped
`role="application"` host region (Decision 1), the visual scale, and
the default team names now being symbol words ("Team Lion" — see
OPEN_QUESTIONS 19).

**Phase 5B (the map) is done** (PHASE5B_SPEC.md, groups M1-M6, 297
tests): a real map on the audience view — NASA Blue Marble satellite
imagery or a Natural Earth parchment style, host-selectable, generated
once by `scripts/make-map.mjs` and committed under `public/map/`, with
the journey's route drawn through its landmarks and team badges gliding
along it (a CSS transition, gated behind reduced motion — verified live
in both states, not just in tests). Manually browser-checked; findings
and one small clarity fix (a class-name collision between the map's own
landmark groups and the Phase 5 strip's) are in OPEN_QUESTIONS item 21.

**Phase 6 (audio) is specified and ready to implement**: see
**PHASE6_SPEC.md** — an AudioManager behind a fake-able backend seam
(voice via HTML5 audio, cues/melodies via Web Audio, per
ACCESSIBILITY_PATTERNS §5, which is BINDING), a one-clip-at-a-time queue
with a presenter gate (polite announcements defer until a clip ends;
assertive interrupts), completion-driven handoffs with failsafes,
cancellation tokens + one kill switch, play caps (the engine does NOT
enforce `maxPlays` — the manager does), Space/L/X/N controls and an
Audio dialog, a melody sequencer for note-data hymns, placeholder tones
in dev-playtest, and Group A7 as the deliverable: with audio entirely
broken, the whole game still completes on fallback text. The schema
already has audio-asset records, melody data, and reference validation
(Fable added them with the spec) — implementers must not touch it.

## Rules for unattended coding agents (Sonnet sessions)

Brian's workflow: Fable plans and writes specs; Sonnet implements
unattended. If you are the implementing agent:

1. Read PHASE2_SPEC.md (or the current phase's spec) FIRST; it outranks
   improvisation. Work test-first, one test group at a time.
2. Run `npm test` and `npx tsc --noEmit` before every commit; never commit
   red; commit per green group with a descriptive message.
3. NEVER modify: the design doc, src/content/schemas.ts, sample content,
   or specs — if blocked by them, write the problem to OPEN_QUESTIONS.md
   and continue with another group.
4. Update IMPLEMENTATION_STATUS.md as groups complete.
5. No new dependencies without recording the reason in OPEN_QUESTIONS.md.
6. Push to origin when a session's work is green and committed.
7. ACCESSIBILITY_PATTERNS.md binds all presentation work (Phases 4–6);
   CONTENT_AUTHORING.md binds all content work.
8. **Content secrecy**: Brian plays this game. Never quote production pack
   prompts or answers to him in any channel (chat, commits, status docs).
   Only the `dev-sample` pack is safe to discuss openly.

The authoritative spec is `design starter for Ancient Paths - journeys through Bible lands.md`
(38 sections — read it before doing anything; its §1 binds AI agents: preserve
mechanics, no hard-coded content, engine/presentation separation, spoken
accessibility is primary, keyboard-everything, no answer sheet, deterministic
testable logic, OPEN_QUESTIONS.md + IMPLEMENTATION_STATUS.md upkeep).

One-line pitch: local-first, keyboard/screen-reader-first church-group game;
2–8 teams journey Jerusalem→Rome via stages, forks, and three distinct
resources (Insight/Provision/Courage); permanent progress, no sabotage;
separate Service score → Barnabas Award; landmark-triggered Community Events;
seeded balanced session decks; host (possibly blind) rules on spoken answers.

## Decisions so far (2026-09-02) — AMENDMENTS TO THE SPEC

These are Brian's rulings; where they conflict with the design doc, THESE win:

1. **Internet-hosted, not local-first**: static web app on Brian's GitHub
   space (GitHub Pages). No backend/accounts; persistence in-browser
   (IndexedDB). Audio ships as ordinary served files. Spec's "no internet
   during play" → "loads from the web; offline caching optional later."
2. **Mouse + visual play is first-class**: most churches won't use a screen
   reader. Every control must be clickable/visible AND keyboard/speech
   operable — dual-modality parity, blind-first discipline retained.
3. **Host-as-player model** (Brian's preference, revisit only if it proves
   complicating): the host never knows answers before teams commit. Flow:
   team states answer aloud → host presses reveal → official answer +
   accepted alternatives spoken/shown to ALL → host marks correct/incorrect
   (room = referee; handles host ruling on own team). Kills host-privacy /
   earbud / dual-display problems entirely. Brian intends to host AND play
   on a team via NVDA. No secondary display support.
4. **Provision "retry" → "recover"** (consequence of #3): after failure,
   Provision draws a replacement task (same category/difficulty, same
   success chance, this turn) from the deck's reserves; authored retry
   variants used where they exist. Never re-ask a publicly revealed answer.
5. **Journey**: composite Pauline route for v1 breadth (Jerusalem, Caesarea,
   Antioch, Asia Minor, Greece, Rome flavor); "Paul's Voyage to Rome"
   (Acts 27–28, storm-heavy) reserved as journey #2.
6. **Pacing**: duration estimator is a first-class feature. Working stage
   math (~45 s/task): Short ≈ 2 stages, Standard ≈ 3–4, Long ≈ 5–6; not all
   milestones are stage boundaries — some are narrative waypoints.
7. **Assets**: public-domain (pre-1929) hymns only, self-made renditions;
   text-first content with interface speech as placeholder narration;
   Brian records produced narration later.
8. **Process**: git + private GitHub repo, proper .gitignore from first
   commit. Stack: Claude recommends TypeScript + Vite static build (fits
   Pages deploy), framework-light hand-owned DOM — pending confirmation.
9. **The map (2026-09-02)**: after Phase 5, a dedicated map phase — a
   shipped public-domain map image (NASA Blue Marble satellite OR a
   parchment/Natural Earth period style, host-selectable) with an SVG
   route/team-badge overlay animated on progress (reduced motion →
   jump). One imagery set covers the whole eastern Mediterranean; each
   journey declares its viewport and per-milestone lat/long (schema
   change, Fable-spec'd). Must run on a ~6-year-old laptop. Live 3D
   globe = stretch only. Details: OPEN_QUESTIONS item 17.
10. **Deployment (2026-09-02)**: `.github/workflows/deploy.yml` builds,
    type-checks, tests, and publishes `dist/` to GitHub Pages on every
    push to `main` — the implementing agent's normal push-per-green-group
    is the deploy. Live address: https://1eyebiney.github.io/ancient_paths/
    once Settings → Pages → Source is set to "GitHub Actions" (and the
    repo is public, or the account is on a paid plan — Pages does not
    serve private repos for free).
- Naming: "The Way" = game title; Ancient Paths = project/workspace name.

## Related context

Brian's other projects inform this one: accessible_football (focus-trap shell,
aria-live one-voice speech, "silence is a bug"), headless_space_sim (audio
engine patterns, help-overlay pop-up pattern, CFG-driven tuning). Brian is
blind, uses NVDA; his ear is the tiebreaker on all audio; report every file
change explicitly.
