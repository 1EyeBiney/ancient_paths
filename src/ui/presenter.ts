// The presenter (PHASE4_SPEC "The presenter"; ACCESSIBILITY_PATTERNS §1-§2).
// The ONE code path allowed to write the live regions or the sighted
// status line. Everything else in src/ui/ calls present() rather than
// touching these DOM nodes directly, so parity (what's shown is spoken,
// what's spoken is shown) is a structural guarantee, not a convention.

export type PresenterChannel = "polite" | "assertive";

export interface PresentInput {
  visual: string;
  spoken?: string;
  channel?: PresenterChannel;
}

export interface PresenterLogEntry {
  visual: string;
  spoken: string;
  channel: PresenterChannel;
  at: number;
}

export interface PresenterElements {
  /** sr-only live region, aria-live="polite" */
  politeRegion: HTMLElement;
  /** sr-only live region, aria-live="assertive" */
  assertiveRegion: HTMLElement;
  /** small aria-hidden text node for sighted co-testers (not the main screen content) */
  statusLine: HTMLElement;
}

export interface IdleWatcher {
  /** Returns the prompt to re-announce, or null if nothing is pending right now. */
  getPrompt: () => string | null;
}

export interface PresenterOptions extends PresenterElements {
  now?: () => number;
  /** Injectable so tests can capture and manually invoke the tick callback. */
  setIntervalFn?: (cb: () => void, ms: number) => number;
  clearIntervalFn?: (id: number) => void;
  idleThresholdMs?: number;
  idleCheckMs?: number;
  logLimit?: number;
}

const HAIR_SPACE = " ";
const DEFAULT_IDLE_THRESHOLD_MS = 12_000;
const DEFAULT_IDLE_CHECK_MS = 1_000;
const DEFAULT_LOG_LIMIT = 50;

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[*_`#]/g, "")
    .replace(/%/g, " percent")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ChannelState {
  lastBase: string | null;
  lastFinal: string | null;
}

export class Presenter {
  private readonly politeRegion: HTMLElement;
  private readonly assertiveRegion: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly now: () => number;
  private readonly clearIntervalFn: (id: number) => void;
  private readonly idleThresholdMs: number;
  private readonly logLimit: number;

  private readonly channelState: Record<PresenterChannel, ChannelState> = {
    polite: { lastBase: null, lastFinal: null },
    assertive: { lastBase: null, lastFinal: null },
  };

  private lastAnnounceAt: number;
  private readonly entries: PresenterLogEntry[] = [];
  private idleWatcher: IdleWatcher | null = null;
  private readonly intervalId: number;

  constructor(options: PresenterOptions) {
    this.politeRegion = options.politeRegion;
    this.assertiveRegion = options.assertiveRegion;
    this.statusLine = options.statusLine;
    this.now = options.now ?? (() => Date.now());
    const setIntervalFn = options.setIntervalFn ?? ((cb, ms) => globalThis.setInterval(cb, ms) as unknown as number);
    this.clearIntervalFn = options.clearIntervalFn ?? ((id) => globalThis.clearInterval(id as unknown as ReturnType<typeof setInterval>));
    this.idleThresholdMs = options.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
    this.logLimit = options.logLimit ?? DEFAULT_LOG_LIMIT;
    this.lastAnnounceAt = this.now();
    this.intervalId = setIntervalFn(() => this.checkIdle(), options.idleCheckMs ?? DEFAULT_IDLE_CHECK_MS);
  }

  present(input: PresentInput): void {
    const channel: PresenterChannel = input.channel ?? "polite";
    const spokenSource = input.spoken ?? input.visual;
    const base = sanitizeForSpeech(spokenSource);
    const state = this.channelState[channel];

    let finalText = base;
    if (base.length > 0 && base === state.lastBase) {
      // Alternate a trailing hair space so a live region that suppresses
      // identical-text mutations still re-announces every consecutive repeat.
      finalText = state.lastFinal?.endsWith(HAIR_SPACE) ? base : base + HAIR_SPACE;
    }
    state.lastBase = base;
    state.lastFinal = finalText;

    const region = channel === "assertive" ? this.assertiveRegion : this.politeRegion;
    region.textContent = finalText;
    this.statusLine.textContent = input.visual;

    this.lastAnnounceAt = this.now();
    this.entries.push({ visual: input.visual, spoken: base, channel, at: this.lastAnnounceAt });
    if (this.entries.length > this.logLimit) this.entries.shift();
  }

  log(): PresenterLogEntry[] {
    return this.entries.slice();
  }

  /** Replaces (or clears, with null) the idle re-prompt watcher. */
  setIdleWatcher(watcher: IdleWatcher | null): void {
    this.idleWatcher = watcher;
  }

  private checkIdle(): void {
    if (!this.idleWatcher) return;
    if (this.now() - this.lastAnnounceAt < this.idleThresholdMs) return;
    const prompt = this.idleWatcher.getPrompt();
    if (prompt === null) return;
    this.present({ visual: prompt, channel: "polite" });
  }

  dispose(): void {
    this.clearIntervalFn(this.intervalId);
  }
}
