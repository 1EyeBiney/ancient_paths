// Dialog manager (PHASE4_SPEC "Game menu and modals"; ACCESSIBILITY_PATTERNS
// §3). Opening a modal moves focus in, traps it while open, announces the
// title, and returns focus to the invoking control on close. Native
// alert/confirm/prompt are banned everywhere in this project — this is
// what replaces them.

import type { PresentInput } from "./presenter";

export interface ModalOpenOptions {
  title: string;
  build: (container: HTMLElement) => void;
  present: (input: PresentInput) => void;
  onClose?: () => void;
}

const FOCUSABLE_SELECTOR = 'button, [tabindex]:not([tabindex="-1"]), input, select, textarea, a[href]';

export class ModalManager {
  private readonly overlay: HTMLElement;
  private invoker: HTMLElement | null = null;
  private open_ = false;
  private onCloseCallback: (() => void) | undefined;

  constructor(private readonly root: HTMLElement) {
    this.overlay = document.createElement("div");
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    // PHASE10_SPEC Group X7a: the dialog element itself had no accessible
    // name (only the one-time present() announcement carried the title) —
    // an automated check, or a screen reader announcing role+name on
    // entry, would hear a bare "dialog". The heading is recreated fresh
    // in open() every time but always with this same id, so a static
    // aria-labelledby set once here is always correct once the dialog is
    // visible.
    this.overlay.setAttribute("aria-labelledby", "modal-heading");
    this.overlay.hidden = true;
    this.root.appendChild(this.overlay);
  }

  isOpen(): boolean {
    return this.open_;
  }

  element(): HTMLElement {
    return this.overlay;
  }

  open(options: ModalOpenOptions): void {
    this.invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.overlay.innerHTML = "";

    const heading = document.createElement("h2");
    heading.id = "modal-heading";
    heading.textContent = options.title;
    heading.tabIndex = -1;
    this.overlay.appendChild(heading);
    options.build(this.overlay);

    this.overlay.hidden = false;
    this.open_ = true;
    this.onCloseCallback = options.onClose;
    this.overlay.addEventListener("keydown", this.trapFocus);

    options.present({ visual: `${options.title} dialog opened.` });
    heading.focus();
  }

  close(): void {
    if (!this.open_) return;
    this.overlay.hidden = true;
    this.open_ = false;
    this.overlay.removeEventListener("keydown", this.trapFocus);
    const onClose = this.onCloseCallback;
    this.onCloseCallback = undefined;
    onClose?.();
    this.invoker?.focus();
    this.invoker = null;
  }

  private trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const focusables = Array.from(this.overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
