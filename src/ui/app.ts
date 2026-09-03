// The app shell (PHASE4_SPEC "App shell and startup"). Owns the UI-level
// modes (startup, setup, playing) the engine doesn't know about; from
// "ready" onward, engine state drives screens.ts. The global game
// keyboard ladder (R/S/A/T/?/Enter/Escape/C/I/K/Ctrl+Z) is only attached
// while actually playing — setup navigation is ordinary Tab/native focus
// plus each CursorList's own local, self-contained key handling.
//
// Setup-screen scope trim (deliberate, not a hidden gap): journey, team
// count, team names, duration, pace, difficulty, and seed are real,
// interactive controls. Enabled packs/categories, audio settings, and the
// community catch-up toggle stay at SetupWizard's sensible defaults for
// this phase — their logic is already covered by Group U4's unit tests
// against SetupWizard directly; Phase 5's visual pass is the natural time
// to give them their own on-screen controls too.

import type { AudioAsset, ContentPack, Journey, Task } from "../content/schemas";
import { createEngine, type EngineOptions, type GameEngine } from "../engine/engine";
import { createRng } from "../engine/rng";
import { Presenter, type PresenterOptions } from "./presenter";
import { KeyboardController, type KeyBinding } from "./keys";
import { ModalManager } from "./modal";
import { UndoController } from "./undo";
import { ScreenRenderer, type ScreenRender } from "./screens";
import { AudienceView } from "./audience";
import { SetupWizard, attemptSessionGeneration, NON_COMMUNITY_CATEGORIES } from "./setup";
import { CursorList } from "./cursorList";
import { buildStatus, buildActionsSummary, buildPositions } from "./speech";
import type { DeckDifficultySetting } from "../session/builder";
import type { SessionDuration, SessionPace } from "../session/plan";
import type { MapManifest, MapStyleId } from "./mapProjection";
import { BrowserAudioBackend, type AudioBackend } from "./audio/backend";
import { AudioManager, type SpeechMode } from "./audio/manager";
import { CUES, type CueId } from "./audio/cues";
import type { GameState, TaskVariantKind } from "../engine/types";
import { DEFAULTS } from "../config/defaults";

export type AppMode = "startup" | "setup" | "soundCheck" | "playing";

type AudioCommandId = "audioPause" | "audioStop" | "audioSkip" | "audioReplay";

/** Human labels for the Sound check screen (cues.ts is data; names live here). */
const CUE_LABELS: Record<CueId, string> = {
  correct: "Correct answer",
  incorrect: "Incorrect answer",
  skipped: "Skipped answer",
  stageComplete: "Stage complete",
  journeyToken: "Journey Token earned",
  communitySuccess: "Community event succeeded",
  communityFail: "Community event fell short",
  arrival: "Arrival",
  celebration: "Celebration",
  menuOpen: "Menu opened",
  offering: "Offering made",
  serviceEarned: "Service earned",
};

/** Every event-log line the audio layer reacts to, in one place (PHASE7_SPEC
 * "Voiced log lines"): a cue to play, and/or whether to speak the line
 * itself. A line matches at most the first row here that fits it. Rows
 * without `present` were already cue-only before Phase 7 and stay that
 * way — only the new rows (offerings, catch-up, Service, sharing,
 * exceptional contributions, free clues) are voiced aloud. */
interface EventLogVoiceRow {
  pattern: RegExp;
  cue?: CueId;
  present?: boolean;
}

const EVENT_LOG_VOICE: EventLogVoiceRow[] = [
  { pattern: /'s answer is ruled correct:/, cue: "correct" },
  { pattern: /answers for the room: correct\.$/, cue: "correct" },
  { pattern: /'s answer is ruled incorrect:/, cue: "incorrect" },
  { pattern: /answers for the room: incorrect\.$/, cue: "incorrect" },
  { pattern: /'s answer is ruled skipped:/, cue: "skipped" },
  { pattern: /earns a Journey Token for a perfect stage\.$/, cue: "journeyToken" },
  // Deliberately narrower than "every stage completion": a fork-route
  // stage that completes without arriving at a milestone logs nothing
  // distinct (OPEN_QUESTIONS), so it gets no stageComplete cue either.
  { pattern: / has reached .+\.$/, cue: "stageComplete" },
  { pattern: /has completed the journey!$/, cue: "stageComplete" },
  { pattern: /^The room succeeds at /, cue: "communitySuccess" },
  { pattern: /^The room does not meet the goal for /, cue: "communityFail" },
  { pattern: /^Team .+ offers a surplus success: /, cue: "offering", present: true },
  { pattern: /^Offering effect: /, present: true },
  { pattern: /^Catch-up: /, cue: "serviceEarned", present: true },
  { pattern: /^Team .+ earns \d+ Service\.$/, cue: "serviceEarned", present: true },
  { pattern: /^Team .+ shares its gift with Team /, present: true },
  { pattern: /^Team .+ made an exceptional contribution\.$/, present: true },
  { pattern: /^Team .+ receives a free clue from an earlier gift\.$/, present: true },
];

export interface AppOptions {
  root: HTMLElement;
  journeys: Journey[];
  /** Absent = no map (the strip alone) — never an error. */
  mapManifest?: MapManifest | null;
  packs: ContentPack[];
  loadErrors?: string[];
  /** Injectable presenter clock/timer so tests can drive the idle re-prompt manually. */
  presenterTimer?: Pick<PresenterOptions, "now" | "setIntervalFn" | "clearIntervalFn" | "idleThresholdMs">;
  /** Injectable so tests can simulate prefers-reduced-motion (jsdom has no matchMedia). */
  matchMedia?: (query: string) => { matches: boolean };
  /** Injectable so tests exercise the audio system against a fake, never real audio APIs. */
  audioBackend?: AudioBackend;
  /** Test-ergonomics only (matches EngineOptions.startingResources from Phase 2):
   * real play always starts every team at zero. */
  startingResources?: EngineOptions["startingResources"];
}

function el(tag: string, opts: { text?: string; className?: string } = {}): HTMLElement {
  const e = document.createElement(tag);
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.className) e.className = opts.className;
  return e;
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export class App {
  private mode: AppMode = "startup";
  private readonly root: HTMLElement;
  private readonly politeRegion: HTMLElement;
  private readonly assertiveRegion: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly contentContainer: HTMLElement;
  private readonly audienceContainer: HTMLElement;
  private readonly modalRoot: HTMLElement;
  private audience: AudienceView | null = null;

  private readonly presenter: Presenter;
  private readonly modal: ModalManager;
  private readonly wizard: SetupWizard;
  private readonly audioManager: AudioManager;
  private audioAssets: Map<string, AudioAsset> = new Map();

  private engine: GameEngine | null = null;
  private renderer: ScreenRenderer | null = null;
  private undoController: UndoController | null = null;
  private keyboard: KeyboardController | null = null;
  private windowKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastRender: ScreenRender | null = null;
  private activeCursorLists: CursorList[] = [];

  private currentJourney: Journey | null = null;
  private tasksById: Map<string, Task> | null = null;
  private lastEngineState: GameState | null = null;
  private lastEventLogLength = 0;
  /** `${taskId}::${variantKind}` for the presentation currently auto-played, or null. */
  private lastAudioPresentationKey: string | null = null;
  private lastCluesRevealedCount = 0;

  constructor(private readonly options: AppOptions) {
    this.root = options.root;
    this.root.innerHTML = "";

    this.politeRegion = el("div");
    this.politeRegion.className = "sr-only";
    this.politeRegion.setAttribute("aria-live", "polite");
    this.assertiveRegion = el("div");
    this.assertiveRegion.className = "sr-only";
    this.assertiveRegion.setAttribute("aria-live", "assertive");
    this.statusLine = el("p");
    this.statusLine.setAttribute("aria-hidden", "true");
    this.statusLine.className = "status-line";
    // Page structure (PHASE5_SPEC): one h1, then the audience view (a
    // browse-mode document region) and the host controls (a SCOPED
    // application region — never on body — so NVDA delivers single-letter
    // hotkeys while focus is inside it; Decision 1, Brian's ear decides).
    const title = el("h1", { text: "The Way: A Journey Through Bible Lands", className: "app-title" });
    const main = el("main");
    this.audienceContainer = el("section");
    this.audienceContainer.id = "audience-view";
    this.audienceContainer.className = "audience";
    this.audienceContainer.setAttribute("aria-label", "Audience view");
    this.audienceContainer.hidden = true;
    this.contentContainer = el("section");
    this.contentContainer.id = "host-controls";
    this.contentContainer.className = "host";
    this.contentContainer.setAttribute("aria-label", "Host controls");
    this.contentContainer.setAttribute("role", "application");
    main.append(this.audienceContainer, this.contentContainer);
    this.modalRoot = el("div");

    this.root.append(this.politeRegion, this.assertiveRegion, this.statusLine, title, main, this.modalRoot);

    this.presenter = new Presenter({
      politeRegion: this.politeRegion,
      assertiveRegion: this.assertiveRegion,
      statusLine: this.statusLine,
      ...options.presenterTimer,
    });
    this.modal = new ModalManager(this.modalRoot);
    this.wizard = new SetupWizard({ journeys: options.journeys, packs: options.packs });
    this.audioManager = new AudioManager({
      backend: options.audioBackend ?? new BrowserAudioBackend(),
      present: (i) => this.presenter.present(i),
      settings: { ...this.wizard.audio },
      getAssets: () => this.audioAssets,
    });
    this.presenter.setGate(this.audioManager);

    // Enter/Space activates a focused native <button>, stopping the event
    // there so it never also reaches the window-level game ladder (which
    // would otherwise double-fire the same command while playing). Real
    // browsers already do this for free; this is a harmless, standards-
    // matching explicit fallback (and the only way this behavior is
    // exercised at all under jsdom, which doesn't implement it).
    this.root.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      const active = document.activeElement;
      if (!this.root.contains(active)) return;
      const isButton = active instanceof HTMLButtonElement;
      const isCheckbox = active instanceof HTMLInputElement && active.type === "checkbox";
      if (!isButton && !isCheckbox) return;
      if (isCheckbox && event.key === "Enter") return; // Space toggles a checkbox; Enter is not its activation key
      event.preventDefault();
      event.stopPropagation();
      active.click();
    });

    this.applyReducedMotion();
    this.renderStartup();
  }

  dispose(): void {
    this.detachKeyboard();
    this.presenter.dispose();
  }

  getMode(): AppMode {
    return this.mode;
  }

  getEngine(): GameEngine | null {
    return this.engine;
  }

  getLastRender(): ScreenRender | null {
    return this.lastRender;
  }

  getPresenterLog() {
    return this.presenter.log();
  }

  /** Read-only access for tests; the setup screen is the only writer. */
  getSetupWizard(): SetupWizard {
    return this.wizard;
  }

  getAudioManager(): AudioManager {
    return this.audioManager;
  }

  // -- keyboard attach/detach ------------------------------------------

  private attachKeyboard(): void {
    if (this.keyboard) return;
    this.keyboard = new KeyboardController({
      getState: () => this.engine!.getState(),
      dispatchCommand: (id) => this.dispatchCommand(id),
      present: (text) => this.presenter.present({ visual: text }),
      onHelpChange: (rows, cursor) => this.renderHelpList(rows, cursor),
    });
    this.windowKeydownHandler = (e) => this.keyboard!.handleKeyDown(e);
    window.addEventListener("keydown", this.windowKeydownHandler);
  }

  private detachKeyboard(): void {
    if (this.windowKeydownHandler) window.removeEventListener("keydown", this.windowKeydownHandler);
    this.windowKeydownHandler = null;
    this.keyboard = null;
    this.presenter.setIdleWatcher(null);
    this.renderHelpList([], null);
  }

  /** The on-screen twin of the spoken help rows (parity; Brian's ruling). */
  private renderHelpList(rows: KeyBinding[], cursor: number | null): void {
    const existing = this.modalRoot.querySelector("#help-menu");
    if (existing) existing.remove();
    if (cursor === null) return;
    const list = document.createElement("ul");
    list.id = "help-menu";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Help menu");
    rows.forEach((row, i) => {
      const item = document.createElement("li");
      item.id = `help-row-${row.id}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", i === cursor ? "true" : "false");
      item.textContent = `${row.keyDisplay}: ${row.label}`;
      list.appendChild(item);
    });
    const current = rows[cursor];
    if (current) list.setAttribute("aria-activedescendant", `help-row-${current.id}`);
    this.modalRoot.appendChild(list);
  }

  /** While playing, the idle re-prompt repeats the current screen's
   * heading only while a host action is actually pending. */
  private idlePrompt(): string | null {
    if (this.mode !== "playing" || this.modal.isOpen()) return null;
    if (!this.lastRender || this.lastRender.actions.length === 0) return null;
    return this.lastRender.heading;
  }

  private hideAudience(): void {
    this.audience = null;
    this.audienceContainer.innerHTML = "";
    this.audienceContainer.hidden = true;
  }

  private disposeCursorLists(): void {
    for (const list of this.activeCursorLists) list.dispose();
    this.activeCursorLists = [];
  }

  // -- startup -----------------------------------------------------------

  private renderStartup(): void {
    this.mode = "startup";
    this.disposeCursorLists();
    this.hideAudience();
    this.contentContainer.innerHTML = "";
    this.contentContainer.appendChild(el("h2", { text: "Welcome" }));

    if (this.options.loadErrors && this.options.loadErrors.length > 0) {
      this.contentContainer.appendChild(el("h2", { text: "Content could not be loaded" }));
      const list = el("ul");
      for (const err of this.options.loadErrors) list.appendChild(el("li", { text: err }));
      this.contentContainer.appendChild(list);
      this.presenter.present({
        visual: `Content could not be loaded: ${this.options.loadErrors.join("; ")}`,
        channel: "assertive",
      });
      return;
    }

    const startButton = document.createElement("button");
    startButton.type = "button";
    startButton.textContent = "New game";
    startButton.addEventListener("click", () => this.renderSetup());
    this.contentContainer.appendChild(startButton);

    const soundCheckButton = document.createElement("button");
    soundCheckButton.type = "button";
    soundCheckButton.textContent = "Sound check";
    soundCheckButton.addEventListener("click", () => this.renderSoundCheck());
    this.contentContainer.appendChild(soundCheckButton);

    this.presenter.present({ visual: "Ready. Press Enter, or choose New game, to set up a session. Sound check tests your speakers." });
  }

  // -- sound check ----------------------------------------------------------

  /** A host feature, not a dev back door: check the speakers (and how NVDA
   * and the game's sounds sit together) before a session, one cue or clip
   * at a time, with the same transport controls and Audio settings as play.
   * Every audio asset from every loaded pack and journey is listed. */
  private renderSoundCheck(): void {
    this.mode = "soundCheck";
    this.detachKeyboard();
    this.disposeCursorLists();
    this.hideAudience();
    this.audioManager.killAll();
    const assets = new Map<string, AudioAsset>();
    for (const pack of this.options.packs) for (const asset of pack.audioAssets ?? []) assets.set(asset.assetId, asset);
    for (const journey of this.options.journeys) for (const asset of journey.audioAssets ?? []) assets.set(asset.assetId, asset);
    this.audioAssets = assets;
    this.audioManager.unlock(); // the Sound check click IS a user gesture

    const c = this.contentContainer;
    c.innerHTML = "";
    c.appendChild(el("h2", { text: "Sound check" }));
    c.appendChild(
      el("p", {
        text:
          "Tab to a sound and press Enter to play it. Cues play at once; clips and tunes announce when they finish. " +
          "If cues are faint under a screen reader, turn its audio ducking off (NVDA: NVDA+Shift+D).",
      }),
    );

    c.appendChild(el("h2", { text: "Cues" }));
    const cueGroup = el("div", { className: "actions" });
    cueGroup.setAttribute("role", "group");
    cueGroup.setAttribute("aria-label", "Cues");
    for (const cueId of Object.keys(CUES) as CueId[]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = CUE_LABELS[cueId];
      button.dataset.cueId = cueId;
      // Deliberately no announcement: a cue is ~200 ms and would be spoken
      // over by its own label. The sound IS the feedback; a sighted
      // co-tester sees which button was pressed.
      button.addEventListener("click", () => this.audioManager.playCue(cueId));
      cueGroup.appendChild(button);
    }
    c.appendChild(cueGroup);

    c.appendChild(el("h2", { text: "Clips and tunes" }));
    const clipGroup = el("div", { className: "actions" });
    clipGroup.setAttribute("role", "group");
    clipGroup.setAttribute("aria-label", "Clips and tunes");
    if (assets.size === 0) clipGroup.appendChild(el("p", { text: "No audio assets are loaded." }));
    for (const asset of assets.values()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${asset.assetId} (${asset.assetType}${asset.melody ? ", tune" : ""})`;
      button.dataset.assetId = asset.assetId;
      button.addEventListener("click", () =>
        this.audioManager.playAsset(asset.assetId, {
          onDone: () => this.presenter.present({ visual: `Finished: ${asset.assetId}.` }),
        }),
      );
      clipGroup.appendChild(button);
      if (asset.melody) {
        const excerpt = document.createElement("button");
        excerpt.type = "button";
        excerpt.textContent = `${asset.assetId}: first four notes, faster`;
        excerpt.dataset.assetId = asset.assetId;
        excerpt.dataset.variation = "excerpt";
        excerpt.addEventListener("click", () => this.audioManager.playMelody(asset.assetId, { firstN: 4, tempoFactor: 1.25 }));
        clipGroup.appendChild(excerpt);
      }
    }
    c.appendChild(clipGroup);

    c.appendChild(el("h2", { text: "Controls" }));
    this.renderAudioControls(c, { listenAgain: false, dispatch: (id) => this.runAudioCommand(id) });

    c.appendChild(el("h2", { text: "Audio settings" }));
    this.buildAudioSettings(c);

    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "Back";
    back.addEventListener("click", () => {
      this.audioManager.killAll();
      this.renderStartup();
    });
    c.appendChild(back);

    this.presenter.present({ visual: "Sound check. Tab to a cue or clip and press Enter to play it." });
  }

  /** The four live volume inputs and the speech-mode choice — shared by
   * the Audio… game-menu dialog and the Sound check screen. */
  private buildAudioSettings(container: HTMLElement): void {
    for (const key of ["master", "music", "effects", "narration"] as const) {
      const label = document.createElement("label");
      label.textContent = `${key} volume (0-100)`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.value = String(this.wizard.audio[key]);
      input.setAttribute("aria-label", `${key} volume`);
      input.addEventListener("input", () => {
        const value = clampInt(input.value, 0, 100, this.wizard.audio[key]);
        this.wizard.setAudio({ [key]: value });
        this.audioManager.setSettings({ [key]: value });
      });
      label.appendChild(input);
      container.appendChild(label);
    }

    const speechLabel = document.createElement("label");
    speechLabel.textContent = "Interface speech";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Interface speech behavior");
    const modes: { value: SpeechMode; text: string }[] = [
      { value: "wait", text: "Wait for audio to finish" },
      { value: "interrupt", text: "Interrupt audio immediately" },
    ];
    for (const mode of modes) {
      const option = document.createElement("option");
      option.value = mode.value;
      option.textContent = mode.text;
      if (this.audioManager.getSpeechMode() === mode.value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => this.audioManager.setSpeechMode(select.value as SpeechMode));
    speechLabel.appendChild(select);
    container.appendChild(speechLabel);
  }

  // -- setup ---------------------------------------------------------------

  private renderSetup(): void {
    this.mode = "setup";
    this.detachKeyboard();
    this.disposeCursorLists();
    this.hideAudience();
    this.contentContainer.innerHTML = "";
    this.contentContainer.appendChild(el("h2", { text: "Set up your session" }));

    // Journey
    this.contentContainer.appendChild(el("h2", { text: "Journey" }));
    const journeyList = el("div");
    this.contentContainer.appendChild(journeyList);
    this.activeCursorLists.push(
      new CursorList({
        container: journeyList,
        items: this.wizard.journeys.map((j) => ({ id: j.journeyId, label: j.title })),
        present: (i) => this.presenter.present(i),
        ariaLabel: "Journey",
        onConfirm: (item) => {
          const journey = this.wizard.journeys.find((j) => j.journeyId === item.id)!;
          this.wizard.setJourney(journey);
          this.updateEstimate();
        },
      }),
    );

    // Team count
    this.contentContainer.appendChild(el("h2", { text: "Number of teams" }));
    const teamCountList = el("div");
    this.contentContainer.appendChild(teamCountList);
    this.activeCursorLists.push(
      new CursorList({
        container: teamCountList,
        items: [2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: String(n), label: `${n} teams` })),
        present: (i) => this.presenter.present(i),
        ariaLabel: "Number of teams",
        onConfirm: (item) => {
          this.wizard.setTeamCount(Number(item.id));
          this.renderTeamNameInputs();
          this.updateEstimate();
        },
      }),
    );

    // Team names (re-rendered whenever team count changes)
    this.contentContainer.appendChild(el("h2", { text: "Team names" }));
    const teamNamesContainer = el("div");
    teamNamesContainer.id = "team-names";
    this.contentContainer.appendChild(teamNamesContainer);
    this.renderTeamNameInputs();

    // Duration / pace / difficulty
    const customMinutes = document.createElement("input");
    customMinutes.type = "number";
    customMinutes.min = "15";
    customMinutes.max = "180";
    customMinutes.value = typeof this.wizard.duration === "object" ? String(this.wizard.duration.customMinutes) : "55";
    customMinutes.setAttribute("aria-label", "Custom minutes");
    customMinutes.disabled = typeof this.wizard.duration !== "object";
    this.appendChoiceList("Duration", ["short", "standard", "long", "custom"], this.wizard.duration as string, (id) => {
      if (id === "custom") {
        customMinutes.disabled = false;
        this.wizard.setDuration({ customMinutes: clampInt(customMinutes.value, 15, 180, 55) });
      } else {
        customMinutes.disabled = true;
        this.wizard.setDuration(id as SessionDuration);
      }
      this.updateEstimate();
    });
    const customLabel = document.createElement("label");
    customLabel.textContent = "Custom minutes (15-180)";
    customLabel.appendChild(customMinutes);
    customMinutes.addEventListener("input", () => {
      if (customMinutes.disabled) return;
      this.wizard.setDuration({ customMinutes: clampInt(customMinutes.value, 15, 180, 55) });
      this.updateEstimate();
    });
    this.contentContainer.appendChild(customLabel);
    this.appendChoiceList("Pace", ["relaxed", "standard", "quick"], this.wizard.pace, (id) => {
      this.wizard.setPace(id as SessionPace);
      this.updateEstimate();
    });
    this.appendChoiceList("Difficulty", ["gentle", "standard", "challenging"], this.wizard.difficulty, (id) => {
      this.wizard.setDifficulty(id as DeckDifficultySetting);
    });

    this.appendChoiceList("Map style", ["satellite", "parchment", "none"], this.wizard.mapStyle, (id) => {
      this.wizard.setMapStyle(id as MapStyleId);
    });

    // Tasks per turn (blank = recommended)
    this.contentContainer.appendChild(el("h2", { text: "Tasks per turn" }));
    const tasksPerTurn = document.createElement("input");
    tasksPerTurn.type = "number";
    tasksPerTurn.min = "1";
    tasksPerTurn.max = "6";
    tasksPerTurn.placeholder = "recommended";
    tasksPerTurn.setAttribute("aria-label", "Tasks per turn (blank for recommended)");
    tasksPerTurn.addEventListener("input", () => {
      this.wizard.setTasksPerTurnOverride(tasksPerTurn.value === "" ? null : clampInt(tasksPerTurn.value, 1, 6, 3));
      this.updateEstimate();
    });
    this.contentContainer.appendChild(tasksPerTurn);

    // Content packs
    this.contentContainer.appendChild(el("h2", { text: "Content packs" }));
    const packsBox = el("div");
    packsBox.id = "packs";
    for (const pack of this.wizard.packs) {
      packsBox.appendChild(
        this.checkbox(`pack-${pack.packId}`, pack.title, this.wizard.enabledPackIds.includes(pack.packId), (on) => {
          const ids = new Set(this.wizard.enabledPackIds);
          if (on) ids.add(pack.packId);
          else ids.delete(pack.packId);
          this.wizard.setEnabledPacks([...ids]);
        }),
      );
    }
    this.contentContainer.appendChild(packsBox);

    // Task categories (community is always in play; not listed)
    this.contentContainer.appendChild(el("h2", { text: "Task categories" }));
    const categoriesBox = el("div");
    categoriesBox.id = "categories";
    for (const category of NON_COMMUNITY_CATEGORIES) {
      categoriesBox.appendChild(
        this.checkbox(`category-${category}`, category, this.wizard.enabledCategories.includes(category), (on) => {
          const set = new Set(this.wizard.enabledCategories);
          if (on) set.add(category);
          else set.delete(category);
          this.wizard.setEnabledCategories(NON_COMMUNITY_CATEGORIES.filter((c) => set.has(c)));
        }),
      );
    }
    this.contentContainer.appendChild(categoriesBox);

    // Audio settings (the same controls as the Audio… dialog and Sound check)
    this.contentContainer.appendChild(el("h2", { text: "Audio" }));
    const audioBox = el("div");
    audioBox.id = "audio";
    this.buildAudioSettings(audioBox);
    this.contentContainer.appendChild(audioBox);

    // Community catch-up, reduced motion
    this.contentContainer.appendChild(el("h2", { text: "Options" }));
    this.contentContainer.appendChild(
      this.checkbox(
        "community-catchup",
        "Community catch-up (teams more than two stages behind get a bonus when the room succeeds)",
        this.wizard.communityCatchup,
        (on) => this.wizard.setCommunityCatchup(on),
      ),
    );
    this.contentContainer.appendChild(
      this.checkbox("reduced-motion", "Reduce motion", this.effectiveReducedMotion(), (on) => {
        this.wizard.setReducedMotion(on);
        this.applyReducedMotion();
      }),
    );

    // Seed
    this.contentContainer.appendChild(el("h2", { text: "Seed" }));
    const seedInput = document.createElement("input");
    seedInput.type = "text";
    seedInput.value = this.wizard.seed;
    seedInput.setAttribute("aria-label", "Seed");
    seedInput.addEventListener("input", () => this.wizard.setSeed(seedInput.value));
    this.contentContainer.appendChild(seedInput);
    const regenButton = document.createElement("button");
    regenButton.type = "button";
    regenButton.textContent = "Regenerate seed";
    regenButton.addEventListener("click", () => {
      this.wizard.regenerateSeed();
      seedInput.value = this.wizard.seed;
    });
    this.contentContainer.appendChild(regenButton);

    // Live estimate
    const estimate = el("p");
    estimate.id = "estimate";
    this.contentContainer.appendChild(estimate);
    this.updateEstimate(estimate);

    // Begin
    const beginButton = document.createElement("button");
    beginButton.type = "button";
    beginButton.textContent = "Begin journey";
    beginButton.addEventListener("click", () => this.beginJourney());
    this.contentContainer.appendChild(beginButton);

    this.presenter.present({ visual: "Session setup. Choose a journey, team count, names, pace, and seed." });
  }

  private checkbox(id: string, labelText: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    label.append(input, ` ${labelText}`);
    return label;
  }

  private effectiveReducedMotion(): boolean {
    if (this.wizard.reducedMotion !== null) return this.wizard.reducedMotion;
    const mm = this.options.matchMedia ?? (typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null);
    return mm ? mm("(prefers-reduced-motion: reduce)").matches : false;
  }

  /** Stamps the effective value on the root; styles.css only animates under "false". */
  private applyReducedMotion(): void {
    this.root.dataset.reducedMotion = this.effectiveReducedMotion() ? "true" : "false";
  }

  private renderTeamNameInputs(): void {
    const container = this.contentContainer.querySelector<HTMLElement>("#team-names");
    if (!container) return;
    container.innerHTML = "";
    this.wizard.teamNames.forEach((name, i) => {
      const label = document.createElement("label");
      label.textContent = `Team ${i + 1} name`;
      const input = document.createElement("input");
      input.type = "text";
      input.value = name;
      input.addEventListener("input", () => this.wizard.setTeamName(i, input.value));
      label.appendChild(input);
      container.appendChild(label);
    });
  }

  private appendChoiceList(
    heading: string,
    ids: string[],
    current: string,
    onConfirm: (id: string) => void,
  ): void {
    this.contentContainer.appendChild(el("h2", { text: heading }));
    const list = el("div");
    this.contentContainer.appendChild(list);
    this.activeCursorLists.push(
      new CursorList({
        container: list,
        items: ids.map((id) => ({ id, label: id })),
        present: (i) => this.presenter.present(i),
        ariaLabel: heading,
        onConfirm: (item) => onConfirm(item.id),
      }),
    );
    void current;
  }

  private updateEstimate(target?: HTMLElement): void {
    const el_ = target ?? this.contentContainer.querySelector<HTMLElement>("#estimate");
    const plan = this.wizard.getPlan();
    if (!el_ || !plan) return;
    const text = `Estimated duration: about ${Math.round(plan.estimatedMinutes)} minutes.${plan.warnings.length > 0 ? " " + plan.warnings.join(" ") : ""}`;
    el_.textContent = text;
  }

  private beginJourney(): void {
    const outcome = attemptSessionGeneration(this.wizard);
    if (!outcome.ok) {
      this.presenter.present({ visual: outcome.error.message, channel: "assertive" });
      return;
    }
    const journey = this.wizard.journey!;
    const packs = this.wizard.packs.filter((p) => this.wizard.enabledPackIds.includes(p.packId));
    const allTasks: Task[] = packs.flatMap((p) => p.tasks);
    const tasksById = new Map(allTasks.map((t) => [t.id, t]));

    const assets = new Map<string, AudioAsset>();
    for (const pack of packs) for (const asset of pack.audioAssets ?? []) assets.set(asset.assetId, asset);
    for (const asset of journey.audioAssets ?? []) assets.set(asset.assetId, asset);
    this.audioAssets = assets;
    this.currentJourney = journey;
    this.tasksById = tasksById;
    this.audioManager.unlock(); // the Begin-journey click IS the user gesture; no audio before this

    this.engine = createEngine({
      journey,
      packs,
      teams: outcome.teams,
      turnTaskLimit: this.wizard.effectiveTasksPerTurn(),
      rng: createRng(this.wizard.seed),
      taskSource: outcome.result.deck,
      config: { catchUp: { ...DEFAULTS.catchUp, enabled: this.wizard.communityCatchup } },
      ...(this.options.startingResources ? { startingResources: this.options.startingResources } : {}),
    });
    this.undoController = new UndoController({
      engine: this.engine,
      present: (i) => this.presenter.present(i),
    });
    this.renderer = new ScreenRenderer({
      journey,
      tasksById,
      present: (i) => this.presenter.present(i),
      onNewGame: () => {
        this.audioManager.killAll();
        this.engine = null;
        this.renderer = null;
        this.undoController = null;
        this.renderSetup();
      },
      onAfterAction: () => this.renderCurrentScreen(),
      onReplayGranted: (taskId) => {
        this.audioManager.grantReplay(taskId);
        this.audioManager.replay();
      },
    });
    this.audience = new AudienceView({
      journey,
      tasksById,
      mapManifest: this.options.mapManifest,
      mapStyle: this.wizard.mapStyle,
    });
    this.audienceContainer.hidden = false;

    this.mode = "playing";
    this.disposeCursorLists();
    this.attachKeyboard();
    this.presenter.setIdleWatcher({ getPrompt: () => this.idlePrompt() });
    this.renderCurrentScreen();
  }

  // -- playing -------------------------------------------------------------

  /** Every call here is a response to a host action (there are no
   * non-user-initiated renders), so moving focus to the new screen's
   * heading is consistent with "focus moves only when the user acts" —
   * and without it, wiping the container drops focus to <body>. */
  /** `silent` skips every audio side effect (cues, auto-play, ambient) but
   * still resyncs the tracking fields to the post-action engine state — the
   * undo path (PHASE6_SPEC: "killAll() and nothing else"). */
  private renderCurrentScreen(silent = false): void {
    if (!this.engine || !this.renderer) return;
    // Same pass, same state: this is what keeps host and audience in sync.
    this.audience?.render(this.engine, this.audienceContainer);
    this.lastRender = this.renderer.render(this.engine, this.contentContainer);
    const state = this.engine.getState();
    this.renderAudioControls(this.contentContainer, {
      listenAgain: state === "resourceWindow" || state === "awaitingAnswer",
      dispatch: (id) => this.dispatchCommand(id),
    });
    this.syncAudioHooks(silent);
    const heading = this.contentContainer.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  // -- audio game hooks (PHASE6_SPEC "Game hooks") --------------------------

  /** The presentation key (task + active variant) currently auto-played in
   * resourceWindow, or null outside it / with no current task. */
  private presentationKey(): string | null {
    const publicTask = this.engine?.getCurrentTaskPublic();
    return publicTask ? `${publicTask.id}::${publicTask.activeVariant.kind}` : null;
  }

  private syncAudioHooks(silent: boolean): void {
    if (!this.engine) return;
    const session = this.engine.getSession();
    const state = this.engine.getState();
    const stateChanged = state !== this.lastEngineState;
    const previousLogLength = this.lastEventLogLength;

    if (silent) {
      this.lastAudioPresentationKey = state === "resourceWindow" ? this.presentationKey() : null;
      this.lastCluesRevealedCount = this.engine.getCurrentTaskPublic()?.cluesRevealed.length ?? 0;
    } else {
      if (stateChanged) this.audioManager.killAll();
      this.voiceNewEventLogLines(previousLogLength, session.eventLog.length);
      if (stateChanged) this.handleAudioStateEntry(state);
      this.syncTaskAudioPresentation(state);
      this.syncClueAudio();
    }

    this.lastEngineState = state;
    this.lastEventLogLength = session.eventLog.length;
  }

  /** Every log line pushed since the last render: play its cue (if any),
   * and collect its text (if voiced) into ONE joined announcement — the
   * deferred-announce slot is latest-wins, so several separate present()
   * calls in one render would silently drop all but the last. */
  private voiceNewEventLogLines(fromIndex: number, toIndex: number): void {
    const session = this.engine!.getSession();
    const toSpeak: string[] = [];
    const cues = new Set<CueId>();
    for (let i = fromIndex; i < toIndex; i++) {
      const text = session.eventLog[i]!.text;
      const row = EVENT_LOG_VOICE.find((r) => r.pattern.test(text));
      if (!row) continue;
      if (row.cue) cues.add(row.cue);
      if (row.present) toSpeak.push(text);
    }
    // Cues play immediately and overlap, so one render plays each distinct
    // cue at most once (three catch-up grants = one ding, not three), and
    // an offering IS the Service moment — its own cue stands in for the
    // serviceEarned ding that the same render would otherwise stack on it.
    if (cues.has("offering")) cues.delete("serviceEarned");
    for (const cue of cues) this.audioManager.playCue(cue);
    if (toSpeak.length > 0) this.presenter.present({ visual: toSpeak.join(" ") });
  }

  private handleAudioStateEntry(state: GameState): void {
    if (state === "landmarkIntroduction") {
      const milestoneId = this.engine!.getSession().triggeredMilestones.at(-1);
      const milestone = this.currentJourney?.milestones.find((m) => m.id === milestoneId);
      this.audioManager.playAmbient(milestone?.ambientAudioAsset ?? null);
    } else if (state === "gameSummary") {
      this.audioManager.playCue("celebration");
    }
  }

  private resolveTaskVariant(task: Task, kind: TaskVariantKind): { audioAsset?: string | null; maxPlays?: number } | null {
    if (kind === "normal") return task.normalVariant;
    if (kind === "assisted") return task.assistedVariant;
    return task.amplifiedVariant;
  }

  /** resourceWindow entry, or a variant change (assist/amplify) within it:
   * plays the active variant's (or task's) audio once and resets its cap. */
  private syncTaskAudioPresentation(state: GameState): void {
    if (state !== "resourceWindow") {
      this.lastAudioPresentationKey = null;
      return;
    }
    const publicTask = this.engine!.getCurrentTaskPublic();
    if (!publicTask) {
      this.lastAudioPresentationKey = null;
      return;
    }
    const key = this.presentationKey();
    if (key === this.lastAudioPresentationKey) return;
    this.lastAudioPresentationKey = key;
    this.lastCluesRevealedCount = publicTask.cluesRevealed.length;

    const task = this.tasksById?.get(publicTask.id);
    if (!task) return;
    const variant = this.resolveTaskVariant(task, publicTask.activeVariant.kind);
    const assetId = variant?.audioAsset ?? task.audioAsset;
    if (!assetId) return;
    this.audioManager.presentTask(publicTask.id, publicTask.activeVariant.kind, variant?.maxPlays ?? 2);
    this.audioManager.playAsset(assetId, {
      category: "narration",
      task: { taskId: publicTask.id, variantKind: publicTask.activeVariant.kind },
    });
  }

  /** A newly revealed clue (cluesRevealed grew) plays its parallel clueAudio entry. */
  private syncClueAudio(): void {
    const publicTask = this.engine!.getCurrentTaskPublic();
    if (!publicTask) {
      this.lastCluesRevealedCount = 0;
      return;
    }
    const revealed = publicTask.cluesRevealed.length;
    if (revealed <= this.lastCluesRevealedCount) {
      this.lastCluesRevealedCount = revealed;
      return;
    }
    const task = this.tasksById?.get(publicTask.id);
    const clueAudioId = task?.clueAudio?.[revealed - 1];
    this.lastCluesRevealedCount = revealed;
    if (clueAudioId) this.audioManager.playAsset(clueAudioId, { category: "narration" });
  }

  /** Where the transport bar currently lives, so an audio command can
   * refresh its Pause/Resume label in place without a full re-render. */
  private audioControlsHost: { target: HTMLElement; listenAgain: boolean; dispatch: (id: AudioCommandId) => void } | null =
    null;

  /** The dual-modality twin of the audio keys (§22.3): visible, clickable
   * buttons alongside Space/L/X/N. "Listen again" only appears in the two
   * states where L is legal — the others are always available. Also used
   * by the Sound check screen, which has no engine. */
  private renderAudioControls(
    target: HTMLElement,
    options: { listenAgain: boolean; dispatch: (id: AudioCommandId) => void },
  ): void {
    this.audioControlsHost = { target, ...options };
    target.querySelector(".audio-controls")?.remove();
    const bar = el("div", { className: "audio-controls" });
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Audio controls");

    const button = (text: string, id: AudioCommandId) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => options.dispatch(id));
      bar.appendChild(b);
    };
    button(this.audioManager.isPaused() ? "Resume audio" : "Pause audio", "audioPause");
    if (options.listenAgain) button("Listen again", "audioReplay");
    button("Stop audio", "audioStop");
    button("Skip narration", "audioSkip");

    target.appendChild(bar);
  }

  private refreshAudioControls(): void {
    const host = this.audioControlsHost;
    if (host && host.target.isConnected) this.renderAudioControls(host.target, host);
  }

  /** Space/L/X/N and their buttons, in play or in the Sound check. */
  private runAudioCommand(id: AudioCommandId): void {
    switch (id) {
      case "audioPause":
        if (!this.audioManager.isPlaying()) {
          this.presenter.present({ visual: "Nothing is playing." });
          return;
        }
        if (this.audioManager.isPaused()) this.audioManager.resume();
        else this.audioManager.pause();
        break;
      case "audioStop":
        if (!this.audioManager.isPlaying()) {
          this.presenter.present({ visual: "Nothing is playing." });
          return;
        }
        this.audioManager.stop();
        break;
      case "audioSkip":
        if (!this.audioManager.isPlaying()) {
          this.presenter.present({ visual: "Nothing is playing." });
          return;
        }
        this.audioManager.skip();
        break;
      case "audioReplay":
        // Deliberately not gated on isPlaying(): its purpose is replaying a
        // clip that has already finished. replay() itself announces
        // "Nothing to replay yet." or "No replays left." as appropriate.
        this.audioManager.replay();
        break;
    }
    this.refreshAudioControls();
  }

  private dispatchCommand(id: string): void {
    if (!this.engine || !this.renderer) return;

    if (id === "cancel") {
      if (this.modal.isOpen()) {
        this.modal.close();
      } else {
        this.openGameMenu();
      }
      return;
    }
    if (this.modal.isOpen()) return; // modal owns input while open

    switch (id) {
      case "repeat": {
        const last = this.presenter.log().at(-1);
        if (last) this.presenter.present({ visual: last.visual, spoken: last.spoken, channel: last.channel });
        return;
      }
      case "status": {
        const actionLabels = this.lastRender?.actions.map((a) => a.label) ?? [];
        this.presenter.present(buildStatus(this.engine.statusText(), actionLabels));
        return;
      }
      case "actions": {
        const actionLabels = this.lastRender?.actions.map((a) => a.label) ?? [];
        this.presenter.present(buildActionsSummary(actionLabels));
        return;
      }
      case "positions":
        this.presenter.present(buildPositions(this.engine.allPositionsText()));
        return;
      case "undo":
        // PHASE6_SPEC: undo is killAll() and nothing else — no cue replays.
        this.audioManager.killAll();
        this.undoController?.press();
        this.renderCurrentScreen(true);
        return;
      case "audioPause":
      case "audioStop":
      case "audioSkip":
      case "audioReplay":
        this.runAudioCommand(id);
        return;
      case "confirm": {
        const primaryId = this.lastRender?.primaryActionId;
        if (!primaryId) return;
        this.runAction(primaryId);
        return;
      }
      default:
        this.runAction(id);
    }
  }

  private runAction(id: string): void {
    const action = this.lastRender?.actions.find((a) => a.id === id);
    if (!action) return;
    this.undoController?.cancel();
    try {
      action.run();
    } catch (err) {
      this.presenter.present({
        visual: err instanceof Error ? err.message : "That could not be done right now.",
        channel: "assertive",
      });
    }
    this.renderCurrentScreen();
  }

  private openGameMenu(): void {
    this.audioManager.playCue("menuOpen");
    this.modal.open({
      title: "Game menu",
      present: (i) => this.presenter.present(i),
      build: (container) => {
        const resume = document.createElement("button");
        resume.type = "button";
        resume.textContent = "Resume";
        resume.addEventListener("click", () => this.modal.close());

        const status = document.createElement("button");
        status.type = "button";
        status.textContent = "Game status";
        status.addEventListener("click", () => {
          if (this.engine) this.presenter.present({ visual: this.engine.statusText() });
        });

        const audio = document.createElement("button");
        audio.type = "button";
        audio.textContent = "Audio…";
        audio.addEventListener("click", () => this.openAudioDialog());

        const endSession = document.createElement("button");
        endSession.type = "button";
        endSession.textContent = "End session";
        endSession.addEventListener("click", () => this.openEndSessionConfirm());

        container.append(resume, status, audio, endSession);
      },
    });
  }

  private openAudioDialog(): void {
    this.modal.open({
      title: "Audio",
      present: (i) => this.presenter.present(i),
      build: (container) => this.buildAudioSettings(container),
    });
  }

  private openEndSessionConfirm(): void {
    this.modal.open({
      title: "End session?",
      present: (i) => this.presenter.present(i),
      build: (container) => {
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.textContent = "End session";
        confirmBtn.addEventListener("click", () => {
          this.modal.close();
          this.audioManager.killAll();
          this.engine = null;
          this.renderer = null;
          this.undoController = null;
          this.renderSetup();
        });
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => this.modal.close());
        container.append(confirmBtn, cancelBtn);
      },
    });
  }
}
