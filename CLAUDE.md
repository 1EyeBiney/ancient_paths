# CLAUDE.md — Ancient Paths (game title: "The Way: A Journey Through Bible Lands")

## Status: PHASE 1 COMPLETE (2026-09-02) — next up: Phase 2, the headless engine

Repo: https://github.com/1EyeBiney/ancient_paths (PRIVATE), branch main.
Stack: TypeScript 7 / Vite 8 / Vitest 4 / Zod 4; `npm test` (18/18 passing),
`npx tsc --noEmit` clean, `npm run build` → dist/ (base "./" for Pages).
See IMPLEMENTATION_STATUS.md for the full inventory and OPEN_QUESTIONS.md
for decided amendments + open items. Boot page loads + validates the sample
General Bible pack and Jerusalem-to-Rome journey, reporting visually and via
a live region.

Phase 2 scope (design doc §34): headless engine — see **PHASE2_SPEC.md**,
the binding implementation contract (state machine, command API, rule
details, ~45-test list in groups A–I, definition of done). The design doc
is now revision 1.1 (host-as-player amendments applied in-place).

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
- Naming: "The Way" = game title; Ancient Paths = project/workspace name.

## Related context

Brian's other projects inform this one: accessible_football (focus-trap shell,
aria-live one-voice speech, "silence is a bug"), headless_space_sim (audio
engine patterns, help-overlay pop-up pattern, CFG-driven tuning). Brian is
blind, uses NVDA; his ear is the tiebreaker on all audio; report every file
change explicitly.
