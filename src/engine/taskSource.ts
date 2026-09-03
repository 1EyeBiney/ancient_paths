// Task supply interface (PHASE2_SPEC "Task supply"). Phase 3 replaces
// ArrayTaskSource with a real balanced, seeded session deck behind this
// same interface; the engine never knows the difference.

import type { Task } from "../content/schemas";

export interface TaskSource {
  nextTask(teamId: string, stageId: string): Task;
  nextReplacement(category: Task["category"], difficulty: Task["difficulty"]): Task | null;
  // null when the source has no task for this category (PHASE9_SPEC Group
  // N1) — a relay simply has no shared prompt that turn rather than
  // erroring; SessionDeck still throws SessionBuildError on real content
  // insufficiency, which already satisfies this wider return type.
  nextCommunityTask(category: Task["category"]): Task | null;
}

/**
 * Naive round-robin task source for Phase 2 tests and development. Serves
 * from a flat task list; ignores teamId/stageId (Phase 3's real balancer
 * uses them). Deterministic: same construction + same call sequence always
 * yields the same tasks.
 */
export class ArrayTaskSource implements TaskSource {
  private cursor = 0;
  // A separate cursor for community draws (PHASE9_SPEC Group N1): drawing a
  // relay's shared task must never shift which task nextTask()/
  // nextReplacement() serve next — many existing tests assert an exact
  // ordinary draw sequence around a relay event.
  private communityCursor = 0;

  constructor(private readonly tasks: readonly Task[]) {}

  nextTask(_teamId: string, _stageId: string): Task {
    if (this.tasks.length === 0) {
      throw new Error("ArrayTaskSource.nextTask: no tasks available");
    }
    const task = this.tasks[this.cursor % this.tasks.length] as Task;
    this.cursor++;
    return task;
  }

  nextReplacement(category: Task["category"], difficulty: Task["difficulty"]): Task | null {
    const pool = this.tasks.filter((t) => t.category === category && t.difficulty === difficulty);
    if (pool.length === 0) return null;
    const task = pool[this.cursor % pool.length] as Task;
    this.cursor++;
    return task;
  }

  nextCommunityTask(category: Task["category"]): Task | null {
    const pool = this.tasks.filter((t) => t.category === category);
    if (pool.length === 0) return null;
    const task = pool[this.communityCursor % pool.length] as Task;
    this.communityCursor++;
    return task;
  }
}
