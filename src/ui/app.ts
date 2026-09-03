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

import type { ContentPack, Journey, Task } from "../content/schemas";
import { createEngine, type GameEngine } from "../engine/engine";
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

export type AppMode = "startup" | "setup" | "playing";

export interface AppOptions {
  root: HTMLElement;
  journeys: Journey[];
  packs: ContentPack[];
  loadErrors?: string[];
  /** Injectable presenter clock/timer so tests can drive the idle re-prompt manually. */
  presenterTimer?: Pick<PresenterOptions, "now" | "setIntervalFn" | "clearIntervalFn" | "idleThresholdMs">;
  /** Injectable so tests can simulate prefers-reduced-motion (jsdom has no matchMedia). */
  matchMedia?: (query: string) => { matches: boolean };
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

  private engine: GameEngine | null = null;
  private renderer: ScreenRenderer | null = null;
  private undoController: UndoController | null = null;
  private keyboard: KeyboardController | null = null;
  private windowKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastRender: ScreenRender | null = null;
  private activeCursorLists: CursorList[] = [];

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
    this.presenter.present({ visual: "Ready. Press Enter, or choose New game, to set up a session." });
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

    // Audio settings (stored only until Phase 6)
    this.contentContainer.appendChild(el("h2", { text: "Audio (applies from Phase 6)" }));
    const audioBox = el("div");
    audioBox.id = "audio";
    for (const key of ["master", "music", "effects", "narration"] as const) {
      const label = document.createElement("label");
      label.textContent = `${key} volume (0-100)`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "100";
      input.value = String(this.wizard.audio[key]);
      input.setAttribute("aria-label", `${key} volume`);
      input.addEventListener("input", () => this.wizard.setAudio({ [key]: clampInt(input.value, 0, 100, 100) }));
      label.appendChild(input);
      audioBox.appendChild(label);
    }
    this.contentContainer.appendChild(audioBox);

    // Community catch-up, reduced motion
    this.contentContainer.appendChild(el("h2", { text: "Options" }));
    this.contentContainer.appendChild(
      this.checkbox("community-catchup", "Community catch-up (applies from Phase 7)", this.wizard.communityCatchup, (on) =>
        this.wizard.setCommunityCatchup(on),
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

    this.engine = createEngine({
      journey,
      packs,
      teams: outcome.teams,
      turnTaskLimit: this.wizard.effectiveTasksPerTurn(),
      rng: createRng(this.wizard.seed),
      taskSource: outcome.result.deck,
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
        this.engine = null;
        this.renderer = null;
        this.undoController = null;
        this.renderSetup();
      },
      onAfterAction: () => this.renderCurrentScreen(),
    });
    this.audience = new AudienceView({ journey, tasksById });
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
  private renderCurrentScreen(): void {
    if (!this.engine || !this.renderer) return;
    // Same pass, same state: this is what keeps host and audience in sync.
    this.audience?.render(this.engine, this.audienceContainer);
    this.lastRender = this.renderer.render(this.engine, this.contentContainer);
    const heading = this.contentContainer.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
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
        this.undoController?.press();
        this.renderCurrentScreen();
        return;
      case "audioPause":
        this.presenter.present({ visual: "Audio controls are not wired up yet." });
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

        const endSession = document.createElement("button");
        endSession.type = "button";
        endSession.textContent = "End session";
        endSession.addEventListener("click", () => this.openEndSessionConfirm());

        container.append(resume, status, endSession);
      },
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
