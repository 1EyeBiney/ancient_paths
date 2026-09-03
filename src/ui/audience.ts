// The audience view (PHASE5_SPEC "Page structure" / "Audience panels").
// Engine state in, DOM out. No engine mutation, no keyboard handling, no
// announcements of its own (the host screens already announce every
// transition; this region is the browse-mode document twin, readable top
// to bottom). Rendered on the SAME pass as screens.ts by app.ts, which is
// what keeps the two views synchronized — one source of truth, one render.

import type { GameEngine } from "../engine/engine";
import type { Journey, Task } from "../content/schemas";
import type { TeamState } from "../engine/types";
import { findStage } from "./screens";
import { communityProgress } from "./communityProgress";
import { renderTeamBadge } from "./teamBadge";
import { acceptedAlternatives, letterFor } from "./speech";
import { MapView } from "./mapView";
import type { MapManifest, MapStyleId } from "./mapProjection";

export interface AudienceViewOptions {
  journey: Journey;
  tasksById: Map<string, Task>;
  /** Absent = no map (the strip alone) — never an error at render time. */
  mapManifest?: MapManifest | null;
  mapStyle?: MapStyleId;
}

function el(tag: string, opts: { text?: string; className?: string; data?: string } = {}): HTMLElement {
  const e = document.createElement(tag);
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.className) e.className = opts.className;
  if (opts.data) e.dataset.audience = opts.data;
  return e;
}

function progressBar(now: number, max: number, text: string): HTMLElement {
  const bar = el("div", { className: "progress" });
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuenow", String(now));
  bar.setAttribute("aria-valuemax", String(Math.max(max, 1)));
  bar.setAttribute("aria-valuetext", text);
  const fill = el("div", { className: "progress-fill" });
  fill.style.width = `${max > 0 ? Math.min(100, Math.round((now / max) * 100)) : 0}%`;
  bar.appendChild(fill);
  return bar;
}

export class AudienceView {
  private readonly mapView: MapView;

  constructor(private readonly options: AudienceViewOptions) {
    this.mapView = new MapView({ journey: options.journey, manifest: options.mapManifest ?? null });
  }

  private milestoneName(id: string): string {
    return this.options.journey.milestones.find((m) => m.id === id)?.name ?? id;
  }

  render(engine: GameEngine, container: HTMLElement): void {
    container.innerHTML = "";
    const session = engine.getSession();
    const state = engine.getState();
    const team = session.teams[session.activeTeamIndex]!;

    container.appendChild(el("h2", { text: "Audience view", className: "sr-only" }));

    this.renderNowPlaying(engine, container, team, state);
    if (state === "gameSummary") {
      this.renderSummary(engine, container);
    } else {
      this.renderTask(engine, container);
    }
    this.renderTeams(engine, container, team);
    this.renderJourney(container, session.teams);
    if (state === "landmarkIntroduction" || state === "communityEvent") {
      this.renderCommunity(engine, container);
    }
  }

  private renderNowPlaying(engine: GameEngine, container: HTMLElement, team: TeamState, state: string): void {
    const section = el("section", { className: "panel now-playing", data: "now-playing" });
    section.appendChild(el("h3", { text: "Now playing" }));
    if (state === "ready") {
      section.appendChild(el("p", { text: "Ready to begin.", className: "big" }));
      container.appendChild(section);
      return;
    }
    const session = engine.getSession();
    const stage = findStage(this.options.journey, team.currentStageId);
    const required = engine.getEffectiveStageRequirement(team.id) ?? stage?.requiredSuccesses ?? 0;
    const badgeRow = el("div", { className: "badge-row" });
    badgeRow.appendChild(renderTeamBadge(team, "team-badge-large"));
    section.appendChild(badgeRow);
    section.appendChild(
      el("p", {
        className: "big",
        text: `Round ${session.roundNumber}. Team ${team.name}, at ${this.milestoneName(team.currentMilestoneId)}.`,
      }),
    );
    const progressText = `${stage?.name ?? team.currentStageId}: ${team.stageSuccesses} of ${required} successes`;
    const p = el("p", { text: progressText, data: "stage-progress" });
    section.appendChild(p);
    section.appendChild(progressBar(team.stageSuccesses, required, progressText));
    container.appendChild(section);
  }

  private renderTask(engine: GameEngine, container: HTMLElement): void {
    const task = engine.getCurrentTaskPublic();
    if (!task) return;
    const section = el("section", { className: "panel task", data: "task" });
    section.appendChild(el("h3", { text: "Task" }));
    section.appendChild(el("p", { text: task.title, className: "task-title" }));
    section.appendChild(el("p", { text: task.activeVariant.prompt, className: "big prompt", data: "prompt" }));
    const options = task.activeVariant.options ?? [];
    if (options.length > 0) {
      const list = el("ol", { className: "choices", data: "choices" });
      options.forEach((opt, i) => list.appendChild(el("li", { text: `${letterFor(i)}: ${opt}` })));
      section.appendChild(list);
    }
    if (task.cluesRevealed.length > 0) {
      const clues = el("ul", { className: "clues", data: "clues" });
      for (const clue of task.cluesRevealed) clues.appendChild(el("li", { text: clue }));
      section.appendChild(clues);
    }
    const revealed = engine.getRevealedAnswer();
    if (revealed) {
      const reveal = el("div", { className: "reveal", data: "reveal" });
      reveal.appendChild(el("p", { text: `Answer: ${revealed.answer}`, className: "big" }));
      const alternatives = acceptedAlternatives(revealed.answer, revealed.acceptedAnswers);
      if (alternatives.length > 0) {
        reveal.appendChild(el("p", { text: `Also accepted: ${alternatives.join(", ")}` }));
      }
      if (revealed.hostGuidance) reveal.appendChild(el("p", { text: `Host guidance: ${revealed.hostGuidance}` }));
      section.appendChild(reveal);
    }
    container.appendChild(section);
  }

  private renderTeams(engine: GameEngine, container: HTMLElement, active: TeamState): void {
    const section = el("section", { className: "panel teams", data: "teams" });
    section.appendChild(el("h3", { text: "Teams" }));
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of ["Team", "Location", "Insight", "Provision", "Courage", "Journey Token", "Service", "Status"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    for (const team of engine.getSession().teams) {
      const tr = document.createElement("tr");
      tr.dataset.teamId = team.id;
      const isActive = team.id === active.id && engine.getState() !== "gameSummary";
      if (isActive) tr.className = "active-team";
      const cells: (string | HTMLElement)[] = [
        renderTeamBadge(team),
        this.milestoneName(team.currentMilestoneId),
        String(team.resources.insight),
        String(team.resources.provision),
        String(team.resources.courage),
        team.hasJourneyToken ? "Token held" : "—",
        String(team.serviceScore),
        isActive ? "now playing" : "",
      ];
      cells.forEach((c, i) => {
        const td = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) (td as HTMLTableCellElement).scope = "row";
        if (typeof c === "string") td.textContent = c;
        else td.appendChild(c);
        td.dataset.col = ["team", "location", "insight", "provision", "courage", "token", "service", "status"][i]!;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
  }

  private renderJourney(container: HTMLElement, teams: readonly TeamState[]): void {
    const section = el("section", { className: "panel journey", data: "journey" });
    section.appendChild(el("h3", { text: "Journey" }));

    const mapContainer = el("div", { data: "map-container" });
    section.appendChild(mapContainer);
    this.mapView.render(mapContainer, teams, this.options.mapStyle ?? "satellite");

    const strip = el("ol", { className: "landmark-strip" });
    for (const milestone of this.options.journey.milestones) {
      const item = el("li", { className: "landmark" });
      item.dataset.milestoneId = milestone.id;
      item.appendChild(el("span", { text: milestone.name, className: "landmark-name" }));
      const here = teams.filter((t) => t.currentMilestoneId === milestone.id);
      if (here.length > 0) {
        const markers = el("ul", { className: "markers" });
        for (const team of here) {
          const marker = el("li", { className: "marker" });
          marker.dataset.teamId = team.id;
          marker.appendChild(renderTeamBadge(team, "team-badge-small"));
          if (team.stagesBeyondMilestone > 0) {
            marker.appendChild(el("span", { text: " traveling on", className: "traveling" }));
            marker.dataset.traveling = "true";
          }
          markers.appendChild(marker);
        }
        item.appendChild(markers);
      }
      strip.appendChild(item);
    }
    section.appendChild(strip);
    container.appendChild(section);
  }

  private renderCommunity(engine: GameEngine, container: HTMLElement): void {
    const progress = communityProgress(engine, this.options.journey);
    if (!progress) return;
    const { event } = progress;
    const section = el("section", { className: "panel community", data: "community" });
    section.appendChild(el("h3", { text: "Community event" }));
    section.appendChild(el("p", { text: event.title, className: "big" }));
    section.appendChild(el("p", { text: event.description }));
    // The shared relay task's prompt (PHASE9_SPEC Group N1) — never the
    // host guidance (it can hint at judging) and never the answer.
    const communityTask = event.kind === "relay" ? engine.getCommunityTaskPublic() : null;
    if (communityTask) {
      section.appendChild(el("p", { text: communityTask.prompt, data: "community-prompt" }));
    }
    const [now, max, text] =
      event.kind === "relay"
        ? [progress.roomProgress, event.successThreshold, `${progress.roomProgress} of ${event.successThreshold} correct`]
        : [progress.pledgedTotal, event.contributionThreshold, `${progress.pledgedTotal} of ${event.contributionThreshold} pledged`];
    section.appendChild(el("p", { text, data: "community-progress" }));
    section.appendChild(progressBar(now, max, text));
    container.appendChild(section);
  }

  private renderSummary(engine: GameEngine, container: HTMLElement): void {
    const summary = engine.getSummary();
    if (!summary) return;
    const session = engine.getSession();
    const byId = (id: string) => session.teams.find((t) => t.id === id);
    const section = el("section", { className: "panel summary", data: "summary" });
    section.appendChild(el("h3", { text: "Game summary" }));

    const winners = el("div", { data: "winners" });
    winners.appendChild(el("p", { text: summary.journeyWinners.length === 1 ? "Journey winner" : "Journey winners", className: "big" }));
    const winnerList = el("ul");
    for (const id of summary.journeyWinners) {
      const team = byId(id);
      const li = el("li");
      if (team) li.appendChild(renderTeamBadge(team, "team-badge-large"));
      else li.textContent = id;
      winnerList.appendChild(li);
    }
    winners.appendChild(winnerList);
    section.appendChild(winners);

    const award = el("p", { data: "award" });
    const recipients = summary.barnabasAwardRecipients.map((id) => byId(id)?.name ?? id).join(", ");
    award.textContent = `${summary.serviceAwardName}: ${recipients || "not awarded"}.`;
    section.appendChild(award);

    if (summary.communityAccomplishments.length > 0) {
      const community = el("div", { data: "community-accomplishments" });
      community.appendChild(el("p", { text: "Community", className: "big" }));
      const list = el("ul");
      for (const line of summary.communityAccomplishments) list.appendChild(el("li", { text: line }));
      community.appendChild(list);
      section.appendChild(community);
    }

    const positions = el("ol", { className: "leaderboard", data: "positions" });
    for (const id of summary.finalPositions) {
      const team = byId(id);
      const li = el("li");
      if (team) li.appendChild(renderTeamBadge(team));
      else li.textContent = id;
      positions.appendChild(li);
    }
    section.appendChild(positions);
    container.appendChild(section);
  }
}
