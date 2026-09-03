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
    this.overlay.addEventListener("keydown", this.handleEscape);

    options.present({ visual: `${options.title} dialog opened.` });
    heading.focus();
  }

  close(): void {
    if (!this.open_) return;
    this.overlay.hidden = true;
    this.open_ = false;
    this.overlay.removeEventListener("keydown", this.trapFocus);
    this.overlay.removeEventListener("keydown", this.handleEscape);
    const onClose = this.onCloseCallback;
    const invoker = this.invoker;
    this.onCloseCallback = undefined;
    this.invoker = null;
    onClose?.();
    // PHASE10_SPEC Group X7g: a sub-dialog opened from within the game menu
    // (e.g. Audio…) shares this single overlay with the menu itself, so
    // opening it detaches the menu's own button — including the "invoker"
    // captured for THIS dialog. If onClose() reentrantly reopens a parent
    // modal (see app.ts's openAudioDialog etc.), that nested open() already
    // focused its own heading and captured its own fresh invoker; calling
    // this call's (now-detached, and stale) invoker.focus() afterward would
    // do nothing useful at best, or steal focus from the reopened dialog at
    // worst. Only restore focus here if nothing reopened in the meantime.
    if (!this.open_) {
      invoker?.focus();
    }
  }

  // PHASE10_SPEC Group X7g: Escape-closes-modal previously relied entirely
  // on the app's global KeyboardController ladder, which is only attached
  // while mode === "playing" (see app.ts's own comment on attachKeyboard).
  // A modal opened from Welcome/Setup (the New-game guard) therefore had no
  // Escape handling at all — closable only by clicking Cancel. The modal
  // now owns its own Escape-to-close, independent of app mode; stopping
  // propagation keeps it from also reaching the app-level "cancel" binding
  // while playing, which would otherwise immediately reopen the game menu
  // (dispatchCommand("cancel") falls back to openGameMenu() once the modal
  // it just saw close makes isOpen() false).
  private handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    this.close();
  };

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
