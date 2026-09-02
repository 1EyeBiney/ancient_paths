# ACCESSIBILITY_PATTERNS — The Way's presentation contract

Distilled from Brian's proven accessible games (keyboard commander at
C:\nbs\kc, accessible golf at C:\nbs\ag, accessible_football, and the
headless space sim), adapted for THIS project's difference: The Way is
dual-modality (mouse + visual play is first-class), has setup text entry,
and must be browse-mode friendly — so it does NOT use the games'
role="application" full-page focus trap. This file is binding for
Phases 4–6. Where it conflicts with improvisation, this file wins.

## 1. The parity principle (Brian's ruling)

**Every meaningful thing shown on screen is also announced; every meaningful
announcement also appears on screen.** Parity is of INFORMATION, not literal
pixels — a progress animation is "shown" visually and "announced" as one
sentence, not sixty frames.

Implementation: ONE presenter API, e.g. `present({ visual, spoken })`,
is the only code allowed to write the display or the live region.
`spoken` defaults to the visual text; either side may be tailored (spoken
strings get sanitized: strip markdown characters, expand symbols —
"%"→"percent", numbers-and-units spelled speakably). Direct DOM writes and
direct live-region writes anywhere else are forbidden (kc's rule, ag's
funnel — both codebases converged on this independently).

Pull-based access completes the parity: R repeat / S status / A actions /
T positions re-speak current information at any time (design doc §23.2), so
a missed announcement never strands anyone.

## 2. Live region discipline

- One `sr-only` live region, `aria-live="polite"` by default; an assertive
  escalation only for errors and interruptions (kc's model). Never more
  than one region speaking.
- Compose ONE sentence per state change and push it once (both games:
  build the full string in the render step; no drip-feeding).
- Entry vs. navigation announcements differ: entering a screen speaks
  orientation + instructions + current item; subsequent movement speaks
  the item tersely (kc `isEntering` / ag `isInit` pattern).
- Guard against identical-consecutive-text suppression with the
  hair-space alternation trick (football/space-sim `say()`); kc/ag lack
  this and rely on luck — we don't.
- Idle re-prompts: if a required action is pending and nothing has been
  spoken for ~12 s, re-announce the prompt (kc nag timer / ag idle
  interval), always gated on current state.

## 3. Browse mode, focus, and input

- Semantic HTML everywhere: real headings, real buttons, real lists. A
  screen-reader user in browse mode must be able to read the whole
  audience view like a page. NO role="application" on body.
- Game hotkeys attach via one window-level keydown handler with a strict
  interceptor ladder (modal layers first, then state-gated game keys),
  `if (e.repeat) return` as the FIRST gate (held keys flood buffers), and
  a native pass-through list (F5, F6, F11, Ctrl+R/F/W/T) so browser and
  reader escape hatches always survive.
- INPUT FIREWALL: hotkeys never fire while focus is inside a text field
  (setup wizard team names). Check `event.target` against editable
  elements at the top of the handler.
- Modals are HTML dialogs with managed focus (trap while open, announce
  title on open, return focus to the invoker on close — design doc §23.4).
  Native `alert/confirm/prompt` are BANNED (they hijack reader focus; kc
  sentinel S7). Confirmations are states with an announced prompt.
- Never move focus as a side effect of game events; focus moves only when
  the user acts or a modal opens/closes.

## 4. Multiple-choice and list presentation

- Presenting an MC task: speak the prompt, then "N choices," then each
  choice with a letter label ("A: Matthias. B: Silas. C: Barnabas.") in
  one composed announcement. R re-reads it. The display shows the same
  letters and text. Teams answer ALOUD (no on-screen selection for
  answering) — the host just rules, so MC needs no cursor UI at all.
- Insight's eliminate-option announces the elimination and re-reads the
  survivors: "B, Silas, is eliminated. Two choices remain: A, Matthias.
  C, Barnabas." Display strikes it through AND marks it textually
  ("eliminated"), never color alone (§24).
- Where a real selection UI exists (setup wizard, surplus decisions,
  route choice): cursor-based list, current item announced tersely on
  arrow, first-letter type-ahead jump (kc login pattern), Enter confirms
  with a spoken confirmation, Escape backs up one level and re-announces
  where you landed (ag wizard pattern).

## 5. Audio coordination (Phase 6, binding)

- **Produced narration/voice = HTML5 `<audio>`; synthesized SFX = Web
  Audio.** Reason (kc, hard-won): screen readers duck HTML5 audio so TTS
  remains audible, but they cannot duck Web Audio nodes, which then drown
  the reader. Never route voice through Web Audio.
- Completion-driven handoffs, never guessed timeouts: chain on `onended`
  (with a fired-once guard AND a failsafe timer — browsers swallow
  `onended`), or measure via `onloadedmetadata` duration.
- A single deferred-announce slot ("speak when the current transition
  ends"), flushed by the transition's completion handler (ag pattern).
- Cancellation tokens on every async speech/audio sequence (capture an id,
  re-check it before each step) so a stale callback can't ambush the user
  half a minute after they navigated away (kc's 20-second-late
  announcement bug).
- One kill switch: all pending timers in one array, cleared atomically on
  state change.
- SFX under speech play dampened (~0.6×). Every produced clip has a
  transcript and a text fallback; a missing clip announces its fallback
  text rather than failing silently.

## 6. Discoverability

- Help (F1/H) and the key-describe explore mode both derive from ONE
  keybinding table in code; KEYBOARD_COMMANDS.md documents it. All three
  must change together — stale bindings docs are an accessibility bug
  (ag's ISSUES.md treats help text as load-bearing code).
- Every key answers: unmapped keys in game states get a concise spoken
  "does nothing here" style response ("silence is a bug").

## 7. Testing hooks

- The presenter API records its last N announcements in a readable buffer
  so automated tests can assert "X was announced" without a screen reader.
- Keyboard paths are testable headlessly by dispatching KeyboardEvents;
  synthetic-key quirks (empty e.key from tooling) are handled by an
  e.code fallback in the key normalizer.
