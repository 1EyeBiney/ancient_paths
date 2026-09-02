// Task supply interface (PHASE2_SPEC "Task supply"). Phase 3 replaces
// ArrayTaskSource with a real balanced, seeded session deck behind this
// same interface; the engine never knows the difference.

import type { Task } from "../content/schemas";

export interface TaskSource {
  nextTask(teamId: string, stageId: string): Task;
  nextReplacement(category: Task["category"], difficulty: Task["difficulty"]): Task | null;
  nextCommunityTask(category: Task["category"]): Task;
}

/**
 * Naive round-robin task source for Phase 2 tests and development. Serves
 * from a flat task list; ignores teamId/stageId (Phase 3's real balancer
 * uses them). Deterministic: same construction + same call sequence always
 * yields the same tasks.
 */
export class ArrayTaskSource implements TaskSource {
  private cursor = 0;

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

  nextCommunityTask(category: Task["category"]): Task {
    const pool = this.tasks.filter((t) => t.category === category);
    if (pool.length === 0) {
      throw new Error(`ArrayTaskSource.nextCommunityTask: no task for category "${category}"`);
    }
    const task = pool[this.cursor % pool.length] as Task;
    this.cursor++;
    return task;
  }
}
