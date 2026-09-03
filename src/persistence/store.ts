// PHASE8_SPEC Group P2 — the save-store seam. IndexedDB (CLAUDE.md decision
// 1) for real play; an in-memory store for tests (rule 5: no fake-IndexedDB
// dependency — the real store is covered by the browser check, P8).

import type { RecentTasks, SavedGame } from "./schema";

export interface SaveStore {
  /** Raw, unvalidated — the schema (parseSavedGame) decides what it means. */
  load(): Promise<unknown | null>;
  save(game: SavedGame): Promise<void>;
  /** Removes only the live save; quarantined saves are untouched. */
  clear(): Promise<void>;
  /** Sets a bad or foreign save aside under its own key. Never deletes it. */
  quarantine(raw: unknown): Promise<void>;
  /** PHASE10_SPEC Group X6: raw, unvalidated — parseRecentTasks decides
   * what it means. Separate from load()/save(): outlives "Delete saved
   * game" and any one session (up to 5 remembered games). */
  readRecentTasks(): Promise<unknown | null>;
  writeRecentTasks(tasks: RecentTasks): Promise<void>;
}

/** Tests: a plain in-memory implementation with a few extra knobs for
 * asserting on autosave behavior (writes) and simulating a failing store. */
export class MemorySaveStore implements SaveStore {
  private current: unknown | null = null;
  private quarantined: unknown[] = [];
  private recentTasks: unknown | null = null;
  /** Every successful save, in order — tests assert on its length/contents. */
  readonly writes: SavedGame[] = [];
  private failNext = false;

  /** The next save() call rejects instead of succeeding (once). */
  failNextSave(): void {
    this.failNext = true;
  }

  async load(): Promise<unknown | null> {
    return this.current;
  }

  async save(game: SavedGame): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("MemorySaveStore: simulated save failure");
    }
    this.current = game;
    this.writes.push(game);
  }

  async clear(): Promise<void> {
    this.current = null;
  }

  async quarantine(raw: unknown): Promise<void> {
    this.quarantined.push(raw);
    this.current = null;
  }

  getQuarantined(): readonly unknown[] {
    return this.quarantined;
  }

  async readRecentTasks(): Promise<unknown | null> {
    return this.recentTasks;
  }

  async writeRecentTasks(tasks: RecentTasks): Promise<void> {
    this.recentTasks = tasks;
  }
}

const DB_NAME = "the-way";
const DB_VERSION = 1;
const STORE_NAME = "saves";
const CURRENT_KEY = "current";
const RECENT_TASKS_KEY = "recent-tasks";

/** database `the-way`, object store `saves`, key `current` for the live
 * save and `quarantined-<ISO>` for set-aside ones. Opens lazily; every
 * method resolves or rejects, never throws synchronously. */
export class IndexedDbSaveStore implements SaveStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDbSaveStore: failed to open database"));
    });
    return this.dbPromise;
  }

  /** Resolves on the TRANSACTION completing, not on the request succeeding:
   * a request's onsuccess fires before the write is durable, and a
   * transaction can still abort after it (e.g. QuotaExceededError on
   * commit) — which must surface as a failed save, not a silent one. */
  private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = fn(store);
      const fail = (error: unknown) => reject(error ?? new Error("IndexedDbSaveStore: request failed"));
      request.onerror = () => fail(request.error);
      tx.onerror = () => fail(tx.error);
      tx.onabort = () => fail(tx.error ?? new Error("IndexedDbSaveStore: transaction aborted"));
      tx.oncomplete = () => resolve(request.result);
    });
  }

  async load(): Promise<unknown | null> {
    const value = await this.withStore("readonly", (s) => s.get(CURRENT_KEY));
    return value ?? null;
  }

  async save(game: SavedGame): Promise<void> {
    await this.withStore("readwrite", (s) => s.put(game, CURRENT_KEY));
  }

  async clear(): Promise<void> {
    await this.withStore("readwrite", (s) => s.delete(CURRENT_KEY));
  }

  async quarantine(raw: unknown): Promise<void> {
    const key = `quarantined-${new Date().toISOString()}`;
    await this.withStore("readwrite", (s) => s.put(raw, key));
    await this.clear();
  }

  async readRecentTasks(): Promise<unknown | null> {
    const value = await this.withStore("readonly", (s) => s.get(RECENT_TASKS_KEY));
    return value ?? null;
  }

  async writeRecentTasks(tasks: RecentTasks): Promise<void> {
    await this.withStore("readwrite", (s) => s.put(tasks, RECENT_TASKS_KEY));
  }
}
