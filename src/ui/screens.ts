// Play screens (PHASE4_SPEC "Play screens"). One render function per
// reachable engine state (see OPEN_QUESTIONS.md item 14 — taskPreview,
// taskPresentation, progressResolution, stageCompletion, hostRuling are
// never entered by the real engine and are not built here). Builds real
// DOM for content directly (spec explicitly allows this in screen render
// code); every announcement still goes through the injected presenter.
//
// Two engine-API gaps found while building this, worked around without
// touching src/engine/ (documented in OPEN_QUESTIONS.md item 15):
//   - teachingReveal's actual teaching text isn't in the public read API,
//     so the renderer looks it up from the loaded content pack by the
//     current task's id (still valid pre-clear at this state).
//   - there is no getter for a community event's live room progress /
//     pledged total, so the renderer tracks it locally, incremented only
//     by commands the renderer itself dispatches — it can't drift from
//     the engine's own (private) count.

import type { GameEngine } from "../engine/engine";
import type { Journey, Task } from "../content/schemas";
import type { ResourceType, TaskResult } from "../engine/types";
import type { PresentInput } from "./presenter";
import { CursorList } from "./cursorList";
import { communityProgress } from "./communityProgress";
import {
  buildMultipleChoicePrompt,
  buildEliminateAnnouncement,
  buildEntryAnnouncement,
  buildBeginTurnAnnouncement,
} from "./speech";

export interface ScreenAction {
  id: string;
  label: string;
  run: () => void;
}

export interface ScreenRender {
  heading: string;
  actions: ScreenAction[];
  primaryActionId: string | null;
}

export interface ScreenRendererOptions {
  journey: Journey;
  tasksById: Map<string, Task>;
  present: (input: PresentInput) => void;
  onNewGame?: () => void;
  /** Called after any action's run() fires (mouse click or keyboard
   * dispatch alike), so the caller can re-render against the engine's new
   * state. Without this, only the caller's OWN explicit re-render (as
   * app.ts does after a keyboard dispatch) would fire — a mouse click,
   * which calls action.run() directly, would otherwise leave a stale
   * screen up. */
  onAfterAction?: () => void;
  /** The Insight (or Journey Token) "replay" effect was just spent on this
   * task: the caller raises the audio play cap and replays (PHASE6_SPEC
   * `grantReplay`). Fired after the engine has accepted the spend. */
  onReplayGranted?: (taskId: string) => void;
}

type JourneyEntry = Journey["entries"][number];
type StageEntry = Extract<JourneyEntry, { kind: "stage" }>;

function findStage(journey: Journey, stageId: string): StageEntry | undefined {
  for (const entry of journey.entries) {
    if (entry.kind === "stage" && entry.id === stageId) return entry;
    if (entry.kind === "fork") {
      for (const route of entry.routes) {
        const stage = route.stages.find((s) => s.id === stageId);
        if (stage) return stage;
      }
    }
  }
  return undefined;
}

function el(tag: string, opts: { text?: string; className?: string } = {}): HTMLElement {
  const e = document.createElement(tag);
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.className) e.className = opts.className;
  return e;
}

export class ScreenRenderer {
  private activeCursorList: CursorList | null = null;

  constructor(private readonly options: ScreenRendererOptions) {}

  render(engine: GameEngine, container: HTMLElement): ScreenRender {
    this.activeCursorList?.dispose();
    this.activeCursorList = null;
    container.innerHTML = "";

    const state = engine.getState();
    const base = (() => {
      switch (state) {
        case "ready":
          return this.renderReady(engine, container);
        case "beginTurn":
          return this.renderBeginTurn(engine, container);
        case "forkChoice":
          return this.renderForkChoice(engine, container);
        case "resourceWindow":
          return this.renderResourceWindow(engine, container);
        case "awaitingAnswer":
          return this.renderAwaitingAnswer(engine, container);
        case "answerReveal":
          return this.renderAnswerReveal(engine, container);
        case "recoverDecision":
          return this.renderRecoverDecision(engine, container);
        case "teachingReveal":
          return this.renderTeachingReveal(engine, container);
        case "surplusDecision":
          return this.renderSurplusDecision(engine, container);
        case "landmarkIntroduction":
          return this.renderLandmarkIntroduction(engine, container);
        case "communityEvent":
          return this.renderCommunityEvent(engine, container);
        case "gameSummary":
          return this.renderGameSummary(engine, container);
        default:
          throw new Error(`screens.render: state "${state}" is not built (see OPEN_QUESTIONS.md item 14)`);
      }
    })();

    // Granted-choice pickers are cross-cutting: chooseGrantedResource has
    // no requireState() gate in the engine, and a "choice" grant (from an
    // offering or a community reward) can land on ANY team, not just the
    // one whose screen is currently up. Appended to every render so a
    // pending choice is never stranded behind an unrelated screen.
    this.appendGrantedChoicePickers(engine, container, base.actions);
    return base;
  }

  private appendGrantedChoicePickers(engine: GameEngine, container: HTMLElement, actions: ScreenAction[]): void {
    for (const team of engine.getSession().teams) {
      const pending = engine.getPendingChoicesForTeam(team.id);
      if (pending <= 0) continue;
      container.appendChild(
        el("p", { text: `Team ${team.name} may choose a resource (${pending} pending).`, className: "pending-choice" }),
      );
      const resources: ResourceType[] = ["insight", "provision", "courage"];
      for (const resource of resources) {
        const action: ScreenAction = {
          id: `chooseGranted-${team.id}-${resource}`,
          label: `Team ${team.name}: take ${resource}`,
          run: () => engine.dispatch({ type: "chooseGrantedResource", teamId: team.id, resource }),
        };
        actions.push(action);
      }
      this.renderButtons(container, actions.filter((a) => a.id.startsWith(`chooseGranted-${team.id}-`)));
    }
  }

  private present(input: PresentInput): void {
    this.options.present(input);
  }

  private currentTeam(engine: GameEngine) {
    const session = engine.getSession();
    return session.teams[session.activeTeamIndex]!;
  }

  // -- ready -----------------------------------------------------------

  private renderReady(engine: GameEngine, container: HTMLElement): ScreenRender {
    container.appendChild(el("h2", { text: "Ready to begin" }));
    const actions: ScreenAction[] = [
      { id: "confirm", label: "Start game", run: () => engine.dispatch({ type: "startGame" }) },
    ];
    this.renderButtons(container, actions);
    const heading = "Ready to begin.";
    this.present(buildEntryAnnouncement(heading, "Press Enter, or choose Start game, to begin.", ""));
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- beginTurn ---------------------------------------------------------

  private renderBeginTurn(engine: GameEngine, container: HTMLElement): ScreenRender {
    const session = engine.getSession();
    const team = this.currentTeam(engine);
    const stage = findStage(this.options.journey, team.currentStageId);
    const required = engine.getEffectiveStageRequirement(team.id) ?? stage?.requiredSuccesses ?? 0;
    const heading = buildBeginTurnAnnouncement(
      session.roundNumber,
      team.name,
      stage?.name ?? team.currentStageId,
      team.stageSuccesses,
      required,
    ).visual;
    container.appendChild(el("h2", { text: heading }));
    const actions: ScreenAction[] = [
      { id: "confirm", label: "Present task", run: () => engine.dispatch({ type: "presentTask" }) },
    ];
    this.renderButtons(container, actions);
    this.present({ visual: heading });
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- forkChoice ----------------------------------------------------------

  private renderForkChoice(engine: GameEngine, container: HTMLElement): ScreenRender {
    const routes = engine.getAvailableRoutes() ?? [];
    const heading = "Fork ahead. Choose a route.";
    container.appendChild(el("h2", { text: heading }));
    const list = el("div", { className: "route-list" });
    container.appendChild(list);

    const actions: ScreenAction[] = routes.map((route) => ({
      id: `route-${route.id}`,
      label: `${route.name}: ${route.description} (${route.difficulty}, ${route.stageCount} stage${route.stageCount === 1 ? "" : "s"})`,
      run: () => engine.dispatch({ type: "chooseRoute", routeId: route.id }),
    }));

    this.activeCursorList = new CursorList({
      container: list,
      items: actions.map((a) => ({ id: a.id, label: a.label })),
      present: (input) => this.present(input),
      onConfirm: (item) => {
        const action = actions.find((a) => a.id === item.id);
        if (action) this.runActionSafely(action);
        this.options.onAfterAction?.();
      },
      ariaLabel: "Route choices",
    });

    this.present(
      buildEntryAnnouncement(
        heading,
        "Use up and down to browse routes, Enter to choose.",
        actions[0]?.label ?? "",
      ),
    );
    return { heading, actions, primaryActionId: null };
  }

  // -- resourceWindow --------------------------------------------------

  private renderResourceWindow(engine: GameEngine, container: HTMLElement): ScreenRender {
    const task = engine.getCurrentTaskPublic()!;
    const team = this.currentTeam(engine);
    const heading = task.title;
    container.appendChild(el("h2", { text: heading }));

    const composed = buildMultipleChoicePrompt(task.activeVariant.prompt, task.activeVariant.options ?? []);
    container.appendChild(el("p", { text: composed.visual }));

    if (task.activeVariant.options && task.activeVariant.options.length > 0) {
      const optionsList = el("ul");
      // Reconstruct the pre-elimination option set is not needed here — the
      // engine already filters eliminated options out of activeVariant, so
      // what's left IS what's still live. Elimination text markers apply
      // only at the moment of the eliminate action itself (see below).
      for (const opt of task.activeVariant.options) {
        optionsList.appendChild(el("li", { text: opt }));
      }
      container.appendChild(optionsList);
    }

    if (task.cluesRevealed.length > 0) {
      const clues = el("ul", { className: "clues" });
      for (const clue of task.cluesRevealed) clues.appendChild(el("li", { text: clue }));
      container.appendChild(clues);
    }

    const actions: ScreenAction[] = [];

    if (task.canExtraClue) {
      actions.push({
        id: "spendInsightExtraClue",
        label: "Spend Insight for an extra clue",
        run: () => engine.dispatch({ type: "spendInsight", effect: "extra-clue" }),
      });
    }
    if (task.canEliminateOption) {
      actions.push({
        id: "spendInsightEliminate",
        label: "Spend Insight to eliminate a wrong option",
        run: () => {
          const before = task.activeVariant.options ?? [];
          engine.dispatch({ type: "spendInsight", effect: "eliminate-option" });
          const after = engine.getCurrentTaskPublic()?.activeVariant.options ?? [];
          const eliminated = before.find((o) => !after.includes(o));
          if (eliminated) this.present(buildEliminateAnnouncement(before, eliminated));
        },
      });
    }
    if (task.canAssist) {
      actions.push({
        id: "spendProvisionAssist",
        label: "Spend Provision for the assisted form",
        run: () => engine.dispatch({ type: "spendProvision" }),
      });
    }
    if (task.canAmplify) {
      actions.push({
        id: "spendCourageAmplify",
        label: "Spend Courage to amplify the task",
        run: () => engine.dispatch({ type: "spendCourage" }),
      });
    }
    // Hear-it-again (the engine's Insight/Journey-Token "replay" effect):
    // only meaningful when the active variant (or the task) actually has
    // audio — PublicTask carries no audio ids, so look the full Task up.
    // Mirrors the engine's own can* gating (interaction + structure, not
    // affordability; an unaffordable spend is refused at dispatch).
    const fullTask = this.options.tasksById.get(task.id);
    const activeVariantAudio =
      task.activeVariant.kind === "normal"
        ? fullTask?.normalVariant.audioAsset
        : task.activeVariant.kind === "assisted"
          ? fullTask?.assistedVariant?.audioAsset
          : fullTask?.amplifiedVariant?.audioAsset;
    const canReplayAudio = !!fullTask?.resourceInteractions.insight && !!(activeVariantAudio ?? fullTask?.audioAsset);
    if (canReplayAudio) {
      actions.push({
        id: "spendInsightReplay",
        label: "Spend Insight to hear the audio again",
        run: () => {
          engine.dispatch({ type: "spendInsight", effect: "replay" });
          this.options.onReplayGranted?.(task.id);
        },
      });
    }
    if (team.hasJourneyToken) {
      if (canReplayAudio) {
        actions.push({
          id: "journeyTokenReplay",
          label: "Use Journey Token to hear the audio again",
          run: () => {
            engine.dispatch({ type: "useJourneyToken", effect: "replay" });
            this.options.onReplayGranted?.(task.id);
          },
        });
      }
      if (task.canExtraClue) {
        actions.push({
          id: "journeyTokenExtraClue",
          label: "Use Journey Token for an extra clue",
          run: () => engine.dispatch({ type: "useJourneyToken", effect: "extra-clue" }),
        });
      }
      if (task.canEliminateOption) {
        actions.push({
          id: "journeyTokenEliminate",
          label: "Use Journey Token to eliminate a wrong option",
          run: () => {
            const before = task.activeVariant.options ?? [];
            engine.dispatch({ type: "useJourneyToken", effect: "eliminate-option" });
            const after = engine.getCurrentTaskPublic()?.activeVariant.options ?? [];
            const eliminated = before.find((o) => !after.includes(o));
            if (eliminated) this.present(buildEliminateAnnouncement(before, eliminated));
          },
        });
      }
      if (task.canAssist) {
        actions.push({
          id: "journeyTokenAssist",
          label: "Use Journey Token for the assisted form",
          run: () => engine.dispatch({ type: "useJourneyToken", effect: "assist" }),
        });
      }
      if (task.canAmplify) {
        actions.push({
          id: "journeyTokenAmplify",
          label: "Use Journey Token to amplify the task",
          run: () => engine.dispatch({ type: "useJourneyToken", effect: "amplify" }),
        });
      }
    }

    actions.push({
      id: "confirm",
      label: "Accept answer",
      run: () => engine.dispatch({ type: "acceptAnswer" }),
    });

    this.renderButtons(container, actions);
    this.present(buildEntryAnnouncement(heading, composed.spoken, ""));
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- awaitingAnswer --------------------------------------------------

  private renderAwaitingAnswer(engine: GameEngine, container: HTMLElement): ScreenRender {
    const heading = "Team answers aloud.";
    container.appendChild(el("h2", { text: heading }));
    const actions: ScreenAction[] = [
      { id: "confirm", label: "Reveal", run: () => engine.dispatch({ type: "reveal" }) },
    ];
    this.renderButtons(container, actions);
    this.present({ visual: heading });
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- answerReveal ------------------------------------------------------

  private renderAnswerReveal(engine: GameEngine, container: HTMLElement): ScreenRender {
    const revealed = engine.getRevealedAnswer()!;
    const heading = "Answer revealed.";
    container.appendChild(el("h2", { text: heading }));
    container.appendChild(el("p", { text: `Answer: ${revealed.answer}` }));
    if (revealed.acceptedAnswers.length > 0) {
      container.appendChild(el("p", { text: `Also accepted: ${revealed.acceptedAnswers.join(", ")}` }));
    }
    if (revealed.hostGuidance) {
      container.appendChild(el("p", { text: `Host guidance: ${revealed.hostGuidance}` }));
    }

    const rule = (result: TaskResult): void => {
      engine.dispatch({ type: "rule", result });
    };
    const actions: ScreenAction[] = [
      { id: "ruleCorrect", label: "Correct", run: () => rule("correct") },
      { id: "ruleIncorrect", label: "Incorrect", run: () => rule("incorrect") },
      { id: "ruleSkipped", label: "Skipped", run: () => rule("skipped") },
    ];
    this.renderButtons(container, actions);

    // Polite, not assertive: a reveal is expected game flow (the host just
    // pressed Reveal), not an error or interruption (ACCESSIBILITY_PATTERNS
    // §2 reserves assertive for those).
    const guidance = revealed.hostGuidance ? ` Host guidance: ${revealed.hostGuidance}.` : "";
    const accepted = revealed.acceptedAnswers.length > 0 ? ` Also accepted: ${revealed.acceptedAnswers.join(", ")}.` : "";
    this.present({ visual: `The answer is ${revealed.answer}.${accepted}${guidance}` });
    return { heading, actions, primaryActionId: null };
  }

  // -- recoverDecision -----------------------------------------------------

  private renderRecoverDecision(engine: GameEngine, container: HTMLElement): ScreenRender {
    const heading = "Recover with a replacement task?";
    container.appendChild(el("h2", { text: heading }));
    const actions: ScreenAction[] = [
      {
        id: "acceptRecover",
        label: "Spend Provision to recover",
        run: () => engine.dispatch({ type: "acceptRecover" }),
      },
      { id: "declineRecover", label: "Decline", run: () => engine.dispatch({ type: "declineRecover" }) },
    ];
    // A cursor list (not just buttons + a single Enter default) because
    // there are two genuinely different, non-equivalent choices here and
    // neither has its own dedicated key — this is how a keyboard-only host
    // picks between them.
    this.renderChoiceList(container, actions, "Recovery choice");
    this.present({ visual: `${heading} The team may spend Provision for a fresh task, same turn.` });
    return { heading, actions, primaryActionId: null };
  }

  // -- teachingReveal --------------------------------------------------

  private renderTeachingReveal(engine: GameEngine, container: HTMLElement): ScreenRender {
    const publicTask = engine.getCurrentTaskPublic();
    const task = publicTask ? this.options.tasksById.get(publicTask.id) : undefined;
    const heading = "Teaching moment.";
    container.appendChild(el("h2", { text: heading }));
    const teachingText = task?.teachingReveal ?? "No teaching text available for this task.";
    container.appendChild(el("p", { text: teachingText }));
    if (task?.historicalNote) container.appendChild(el("p", { text: task.historicalNote }));

    const actions: ScreenAction[] = [
      { id: "confirm", label: "Continue", run: () => engine.dispatch({ type: "finishTeaching" }) },
    ];
    this.renderButtons(container, actions);
    this.present({ visual: `${heading} ${teachingText}` });
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- surplusDecision -----------------------------------------------------

  private renderSurplusDecision(engine: GameEngine, container: HTMLElement): ScreenRender {
    const surplus = engine.getPendingSurplus();
    const heading = `${surplus} surplus success${surplus === 1 ? "" : "es"} to resolve.`;
    container.appendChild(el("h2", { text: heading }));

    const resources: ResourceType[] = ["insight", "provision", "courage"];
    const actions: ScreenAction[] = [
      ...resources.map((r) => ({
        id: `keepSurplus-${r}`,
        label: `Keep as ${r}`,
        run: () => engine.dispatch({ type: "keepSurplus", resource: r }),
      })),
      { id: "offerSurplus", label: "Offer as an offering", run: () => engine.dispatch({ type: "offerSurplus" }) },
    ];
    this.renderChoiceList(container, actions, "Surplus choice");
    this.present({ visual: `${heading} Keep it as a resource, or offer it.` });
    return { heading, actions, primaryActionId: null };
  }

  // -- landmarkIntroduction ------------------------------------------------

  private renderLandmarkIntroduction(engine: GameEngine, container: HTMLElement): ScreenRender {
    const team = this.currentTeam(engine);
    const milestone = this.options.journey.milestones.find((m) => m.id === team.currentMilestoneId);
    const heading = milestone?.name ?? "A landmark.";
    container.appendChild(el("h2", { text: heading }));
    container.appendChild(el("p", { text: milestone?.introText ?? "" }));
    const actions: ScreenAction[] = [
      {
        id: "confirm",
        label: "Begin community event",
        run: () => engine.dispatch({ type: "beginCommunityEvent" }),
      },
    ];
    this.renderButtons(container, actions);
    this.present({ visual: `${heading}. ${milestone?.introText ?? ""}` });
    return { heading, actions, primaryActionId: "confirm" };
  }

  // -- communityEvent --------------------------------------------------

  private renderCommunityEvent(engine: GameEngine, container: HTMLElement): ScreenRender {
    // Progress is derived from the engine's event log (communityProgress.ts)
    // rather than a local counter, so it survives undo.
    const progress = communityProgress(engine, this.options.journey);
    if (!progress) throw new Error("screens.renderCommunityEvent: no matching community event definition found");
    const { event } = progress;
    const teams = engine.getSession().teams;

    const heading = event.title;
    container.appendChild(el("h2", { text: heading }));
    container.appendChild(el("p", { text: event.description }));

    const actions: ScreenAction[] = [];
    const pledgeActions: ScreenAction[] = [];

    if (event.kind === "relay") {
      container.appendChild(el("p", { text: `Room progress: ${progress.roomProgress} of ${event.successThreshold}.` }));
      const remaining = teams.filter((t) => !progress.answeredTeamIds.includes(t.id));
      const current = remaining[0];

      if (current) {
        container.appendChild(el("p", { text: `Now answering: Team ${current.name}.` }));
        const relayRule = (correct: boolean) => {
          engine.dispatch({ type: "relayAnswer", teamId: current.id, correct });
        };
        actions.push(
          { id: "ruleCorrect", label: `Team ${current.name}: correct`, run: () => relayRule(true) },
          { id: "ruleIncorrect", label: `Team ${current.name}: incorrect`, run: () => relayRule(false) },
        );
        this.present({
          visual: `${heading}. Room progress ${progress.roomProgress} of ${event.successThreshold}. Now answering: Team ${current.name}.`,
        });
      } else {
        container.appendChild(el("p", { text: "Every team has answered." }));
        this.present({ visual: `${heading}. Every team has answered. Resolve when ready.` });
      }
    } else {
      container.appendChild(el("p", { text: `Pledged: ${progress.pledgedTotal} of ${event.contributionThreshold}.` }));
      const remaining = teams.filter((t) => !progress.respondedTeamIds.includes(t.id));
      const current = remaining[0];

      if (current) {
        container.appendChild(
          el("p", { text: `Now pledging: Team ${current.name}. Accepted: ${event.acceptedResources.join(", ")}.` }),
        );
        for (const resource of event.acceptedResources) {
          pledgeActions.push({
            id: `contribute-${resource}`,
            label: `Team ${current.name}: contribute 1 ${resource}`,
            run: () => engine.dispatch({ type: "contribute", teamId: current.id, resource, amount: 1 }),
          });
        }
        pledgeActions.push({
          id: "declineContribution",
          label: `Team ${current.name}: decline`,
          run: () => engine.dispatch({ type: "declineContribution", teamId: current.id }),
        });
        actions.push(...pledgeActions);
        this.present({ visual: `${heading}. Now pledging: Team ${current.name}.` });
      } else {
        container.appendChild(el("p", { text: "Every team has responded." }));
        this.present({ visual: `${heading}. Every team has responded. Resolve when ready.` });
      }
    }

    actions.push({
      id: "resolveCommunityEvent",
      label: "Resolve event",
      run: () => engine.dispatch({ type: "resolveCommunityEvent" }),
    });

    if (pledgeActions.length > 0) {
      // Contribution has no dedicated keys (unlike relay's C/I) — a cursor
      // list is the keyboard path for choosing among 3+ non-equivalent
      // pledge/decline options.
      this.renderChoiceList(container, pledgeActions, "Pledge choice");
      this.renderButtons(
        container,
        actions.filter((a) => a.id === "resolveCommunityEvent"),
      );
    } else {
      this.renderButtons(container, actions);
    }
    // Enter resolves (a keyboard-only host's natural "I'm done" action);
    // C/I remain the per-team relay-ruling shortcuts, unaffected.
    return { heading, actions, primaryActionId: "resolveCommunityEvent" };
  }

  // -- gameSummary -------------------------------------------------------

  private renderGameSummary(engine: GameEngine, container: HTMLElement): ScreenRender {
    const summary = engine.getSummary()!;
    const session = engine.getSession();
    const heading = "Game summary.";
    container.appendChild(el("h2", { text: heading }));

    const winners = summary.journeyWinners
      .map((id) => session.teams.find((t) => t.id === id)?.name ?? id)
      .join(", ");
    container.appendChild(el("p", { text: `Journey winner${summary.journeyWinners.length === 1 ? "" : "s"}: ${winners}.` }));

    const barnabas = summary.barnabasAwardRecipients
      .map((id) => session.teams.find((t) => t.id === id)?.name ?? id)
      .join(", ");
    container.appendChild(el("p", { text: `Barnabas Award: ${barnabas || "not awarded"}.` }));

    const positions = summary.finalPositions
      .map((id) => session.teams.find((t) => t.id === id)?.name ?? id)
      .join(", ");
    container.appendChild(el("p", { text: `Final positions: ${positions}.` }));

    const actions: ScreenAction[] = [
      { id: "newGame", label: "New game", run: () => this.options.onNewGame?.() },
    ];
    this.renderButtons(container, actions);
    this.present({
      visual: `Game over. Journey winner${summary.journeyWinners.length === 1 ? "" : "s"}: ${winners}. Barnabas Award: ${barnabas || "not awarded"}.`,
    });
    return { heading, actions, primaryActionId: "newGame" };
  }

  // -- DOM helpers -------------------------------------------------------

  /** A keyboard-navigable cursor list for a screen with several genuinely
   * different, non-equivalent choices and no dedicated key for each — the
   * same pattern as forkChoice's route list. Rows are also clickable
   * (dual-modality). */
  private renderChoiceList(container: HTMLElement, actions: ScreenAction[], ariaLabel: string): void {
    const list = el("div");
    container.appendChild(list);
    this.activeCursorList = new CursorList({
      container: list,
      items: actions.map((a) => ({ id: a.id, label: a.label })),
      present: (input) => this.present(input),
      ariaLabel,
      onConfirm: (item) => {
        const action = actions.find((a) => a.id === item.id);
        if (action) this.runActionSafely(action);
        this.options.onAfterAction?.();
      },
    });
  }

  private renderButtons(container: HTMLElement, actions: ScreenAction[]): void {
    const list = el("div", { className: "actions" });
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.dataset.actionId = action.id;
      button.addEventListener("click", () => {
        this.runActionSafely(action);
        this.options.onAfterAction?.();
      });
      list.appendChild(button);
    }
    container.appendChild(list);
  }

  /**
   * Every action.run() call in this file goes through here, whether it
   * came from a mouse click or a keyboard-dispatched command (app.ts's own
   * runAction() has an equivalent catch for actions it runs directly) —
   * "the engine throws IllegalCommandError and reverts — catch it, present
   * the message politely, never crash" applies to BOTH input paths
   * equally, not just the keyboard one.
   */
  private runActionSafely(action: ScreenAction): void {
    try {
      action.run();
    } catch (err) {
      this.present({
        visual: err instanceof Error ? err.message : "That could not be done right now.",
        channel: "assertive",
      });
    }
  }
}

export { findStage };
