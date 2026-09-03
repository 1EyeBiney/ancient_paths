// Community-event progress derived from the engine's own event log
// (PHASE5_SPEC "Community event"; V1 fix 4). The engine keeps room
// progress and pledged totals privately (OPEN_QUESTIONS item 15), and a
// UI-side counter cannot follow `undo` — but every relevant command also
// writes a log line, and the log IS undo-tracked state. So both the host
// screen and the audience view read progress from here, never from a
// counter of their own.

import type { GameEngine } from "../engine/engine";
import type { Journey } from "../content/schemas";

type CommunityEventDef = Journey["communityEvents"][number];

export interface CommunityProgress {
  event: CommunityEventDef;
  /** relay: correct answers so far */
  roomProgress: number;
  /** relay: teams that have answered this event */
  answeredTeamIds: string[];
  /** contribution: total resource units pledged */
  pledgedTotal: number;
  /** contribution: teams that have pledged or declined */
  respondedTeamIds: string[];
}

const RELAY_LINE = /^Team (.+) answers for the room: (correct|incorrect)\.$/;
const CONTRIBUTE_LINE = /^Team (.+) contributes (\d+) (insight|provision|courage)\.$/;
const DECLINE_LINE = /^Team (.+) declines to contribute\.$/;

export function activeCommunityEvent(engine: GameEngine, journey: Journey): CommunityEventDef | undefined {
  const lastMilestone = engine.getSession().triggeredMilestones.at(-1);
  return journey.communityEvents.find((e) => e.milestoneId === lastMilestone);
}

export function communityProgress(engine: GameEngine, journey: Journey): CommunityProgress | null {
  const event = activeCommunityEvent(engine, journey);
  if (!event) return null;
  const session = engine.getSession();
  const beginText = `The room begins ${event.title}.`;
  const log = session.eventLog;
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.text === beginText) {
      start = i;
      break;
    }
  }
  const idByName = new Map(session.teams.map((t) => [t.name, t.id]));

  const progress: CommunityProgress = {
    event,
    roomProgress: 0,
    answeredTeamIds: [],
    pledgedTotal: 0,
    respondedTeamIds: [],
  };
  if (start < 0) return progress;

  for (const entry of log.slice(start + 1)) {
    let m = RELAY_LINE.exec(entry.text);
    if (m) {
      const id = idByName.get(m[1]!);
      if (id && !progress.answeredTeamIds.includes(id)) progress.answeredTeamIds.push(id);
      if (m[2] === "correct") progress.roomProgress++;
      continue;
    }
    m = CONTRIBUTE_LINE.exec(entry.text);
    if (m) {
      const id = idByName.get(m[1]!);
      if (id && !progress.respondedTeamIds.includes(id)) progress.respondedTeamIds.push(id);
      progress.pledgedTotal += Number(m[2]);
      continue;
    }
    m = DECLINE_LINE.exec(entry.text);
    if (m) {
      const id = idByName.get(m[1]!);
      if (id && !progress.respondedTeamIds.includes(id)) progress.respondedTeamIds.push(id);
    }
  }
  return progress;
}
