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
import { Presenter, type PresenterElements } from "./presenter";
import { KeyboardController } from "./keys";
import { ModalManager } from "./modal";
import { UndoController } from "./undo";
import { ScreenRenderer, type ScreenRender } from "./screens";
import { SetupWizard, attemptSessionGeneration } from "./setup";
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
}

function el(tag: string, opts: { text?: string; className?: string } = {}): HTMLElement {
  const e = document.createElement(tag);
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.className) e.className = opts.className;
  return e;
}

export class App {
  private mode: AppMode = "startup";
  private readonly root: HTMLElement;
  private readonly politeRegion: HTMLElement;
  private readonly assertiveRegion: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly contentContainer: HTMLElement;
  private readonly modalRoot: HTMLElement;

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
    this.contentContainer = el("main");
    this.modalRoot = el("div");

    this.root.append(this.politeRegion, this.assertiveRegion, this.statusLine, this.contentContainer, this.modalRoot);

    this.presenter = new Presenter({
      politeRegion: this.politeRegion,
      assertiveRegion: this.assertiveRegion,
      statusLine: this.statusLine,
    } as PresenterElements);
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
      if (!(active instanceof HTMLButtonElement) || !this.root.contains(active)) return;
      event.preventDefault();
      event.stopPropagation();
      active.click();
    });

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

  // -- keyboard attach/detach ------------------------------------------

  private attachKeyboard(): void {
    if (this.keyboard) return;
    this.keyboard = new KeyboardController({
      getState: () => this.engine!.getState(),
      dispatchCommand: (id) => this.dispatchCommand(id),
      present: (text) => this.presenter.present({ visual: text }),
    });
    this.windowKeydownHandler = (e) => this.keyboard!.handleKeyDown(e);
    window.addEventListener("keydown", this.windowKeydownHandler);
  }

  private detachKeyboard(): void {
    if (this.windowKeydownHandler) window.removeEventListener("keydown", this.windowKeydownHandler);
    this.windowKeydownHandler = null;
    this.keyboard = null;
  }

  private disposeCursorLists(): void {
    for (const list of this.activeCursorLists) list.dispose();
    this.activeCursorLists = [];
  }

  // -- startup -----------------------------------------------------------

  private renderStartup(): void {
    this.mode = "startup";
    this.disposeCursorLists();
    this.contentContainer.innerHTML = "";
    this.contentContainer.appendChild(el("h1", { text: "The Way: A Journey Through Bible Lands" }));

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
    this.contentContainer.innerHTML = "";
    this.contentContainer.appendChild(el("h1", { text: "Set up your session" }));

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
    this.appendChoiceList("Duration", ["short", "standard", "long"], this.wizard.duration as string, (id) => {
      this.wizard.setDuration(id as SessionDuration);
      this.updateEstimate();
    });
    this.appendChoiceList("Pace", ["relaxed", "standard", "quick"], this.wizard.pace, (id) => {
      this.wizard.setPace(id as SessionPace);
      this.updateEstimate();
    });
    this.appendChoiceList("Difficulty", ["gentle", "standard", "challenging"], this.wizard.difficulty, (id) => {
      this.wizard.setDifficulty(id as DeckDifficultySetting);
    });

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

    this.mode = "playing";
    this.disposeCursorLists();
    this.attachKeyboard();
    this.renderCurrentScreen();
  }

  // -- playing -------------------------------------------------------------

  private renderCurrentScreen(): void {
    if (!this.engine || !this.renderer) return;
    this.lastRender = this.renderer.render(this.engine, this.contentContainer);
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
