// A reusable accessible cursor list (ACCESSIBILITY_PATTERNS §4): arrow to
// move (terse announcement), first-letter type-ahead, Enter confirms,
// Escape backs out. Used by the setup wizard's selection steps and by
// forkChoice's route list. Attaches its OWN keydown listener directly to
// the list element and stops propagation for the keys it owns, so it
// coexists with keys.ts's window-level ladder without fighting it — the
// standard pattern for a focused widget owning its own navigation.

import type { PresentInput } from "./presenter";

export interface CursorListItem {
  id: string;
  label: string;
  announce?: string; // defaults to label
}

export interface CursorListOptions {
  container: HTMLElement;
  items: CursorListItem[];
  present: (input: PresentInput) => void;
  onConfirm: (item: CursorListItem, index: number) => void;
  onCancel?: () => void;
  ariaLabel?: string;
}

export class CursorList {
  // PHASE10_SPEC Group X7a: item DOM ids used to be just `cursor-item-
  // ${item.id}` — several setup lists share an option value ("standard"
  // appears in Duration, Pace, AND Difficulty), so three elements ended
  // up with the identical id on the same page, making any
  // aria-activedescendant/aria-labelledby reference to it ambiguous.
  // Each CursorList instance now gets its own numeric prefix.
  private static nextInstanceId = 0;
  private readonly instanceId = CursorList.nextInstanceId++;

  private cursor = 0;
  private readonly rowElements: HTMLElement[] = [];

  constructor(private readonly options: CursorListOptions) {
    this.render();
    this.options.container.addEventListener("keydown", this.handleKeyDown);
  }

  private render(): void {
    const { container, items, ariaLabel } = this.options;
    container.innerHTML = "";
    container.setAttribute("role", "listbox");
    container.tabIndex = 0;
    if (ariaLabel) container.setAttribute("aria-label", ariaLabel);
    this.rowElements.length = 0;
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.setAttribute("role", "option");
      row.id = `cursor-item-${this.instanceId}-${item.id}`;
      row.textContent = item.label;
      // Mouse parity (dual-modality, CLAUDE.md decision #2): a click both
      // selects and confirms, the mouse equivalent of arrowing-to-it then
      // pressing Enter. A plain role="option" div isn't natively
      // focusable, so without this a mouse click left DOM focus wherever
      // it happened to be (often nowhere) — the container is the correct
      // target, not the row itself: this widget's model keeps DOM focus
      // ON THE CONTAINER throughout, with aria-activedescendant (set in
      // applySelection()) naming the virtually-active row, exactly as
      // arrow-key navigation already does (PHASE10_SPEC Group X7c).
      row.addEventListener("click", () => {
        this.cursor = index;
        this.applySelection();
        this.options.container.focus();
        this.options.present({ visual: `${item.label} chosen.` });
        this.options.onConfirm(item, index);
      });
      container.appendChild(row);
      this.rowElements.push(row);
    });
    this.applySelection();
  }

  private applySelection(): void {
    this.rowElements.forEach((row, i) => {
      row.setAttribute("aria-selected", i === this.cursor ? "true" : "false");
    });
    const current = this.rowElements[this.cursor];
    if (current) this.options.container.setAttribute("aria-activedescendant", current.id);
  }

  getCursor(): number {
    return this.cursor;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const { items } = this.options;
    if (items.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      this.move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      this.move(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const item = items[this.cursor]!;
      this.options.present({ visual: `${item.label} chosen.` });
      this.options.onConfirm(item, this.cursor);
      return;
    }
    if (event.key === "Escape") {
      if (!this.options.onCancel) return;
      event.preventDefault();
      event.stopPropagation();
      this.options.onCancel();
      return;
    }
    if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
      const letter = event.key.toLowerCase();
      const startAt = (this.cursor + 1) % items.length;
      for (let i = 0; i < items.length; i++) {
        const idx = (startAt + i) % items.length;
        if (items[idx]!.label.toLowerCase().startsWith(letter)) {
          event.preventDefault();
          event.stopPropagation();
          this.cursor = idx;
          this.applySelection();
          this.announceCurrent();
          return;
        }
      }
    }
  };

  private move(delta: number): void {
    const { items } = this.options;
    this.cursor = (this.cursor + delta + items.length) % items.length;
    this.applySelection();
    this.announceCurrent();
  }

  private announceCurrent(): void {
    const item = this.options.items[this.cursor]!;
    this.options.present({ visual: item.announce ?? item.label });
  }

  dispose(): void {
    this.options.container.removeEventListener("keydown", this.handleKeyDown);
  }
}
