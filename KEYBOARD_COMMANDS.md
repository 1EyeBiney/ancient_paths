# Keyboard Commands (proposal — final map pends accessibility testing)

From design doc §23.2, amended for the host-as-player model. All commands
are mode-aware: none may fire inside text fields, and only commands valid
for the current game state execute. Every command also has a clickable
on-screen control (dual-modality requirement).

| Key | Function |
|---|---|
| R | Repeat current game prompt |
| S | Speak current game and team status |
| A | Speak available actions and usable resources |
| T | Speak all team positions |
| H or F1 | Context-sensitive help |
| Enter | Confirm or advance |
| Escape | Back or cancel when safe |
| Space | Pause or resume produced audio |
| Ctrl+Z | Undo the most recent reversible host action |

Ruling keys (host presses after the team has answered aloud and the reveal
has been shown): to be assigned in Phase 4 — candidates: C correct,
I incorrect, K skipped — chosen to avoid collision with the status keys
above and confirmed with a press-to-confirm step for consequential actions.

Notes:

- The host never receives the answer before the reveal (host-as-player
  model); the reveal command shows the official answer and accepted
  alternatives to the whole room at once.
- An input-firewall keeps global shortcuts out of setup text entry.
- This file is the living record; update it whenever a binding changes.
