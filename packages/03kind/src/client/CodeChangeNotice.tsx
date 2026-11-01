/** @jsxImportSource preact */
import { useLayoutEffect, useRef, useState } from "preact/hooks";

/** The notice on the page, while editing is paused: what holds the keys. Null when there is none. */
let shownNotice: HTMLElement | null = null;

/**
 * While editing is paused no key reaches the editor layer's own handlers, which
 * listen on the window: this one comes before all of them and stops each key
 * there. It is added once, as the module loads, for that: the Shell's and the
 * canvas's are added as they mount, after it, and listeners on the same target
 * run in the order they were added. So it needs no `pointerHeld()` of its own
 * (ADR 0012): it holds every key, and editing pauses only once no press is held.
 * What a key does by default goes on, so the notice's buttons still answer
 * Enter and Space; Tab goes round them. Keys let go are left alone: a key held
 * as editing paused (Space, to pan) is let go as usual. Keys typed in a view's
 * own document never come here: typing there ends as the notice takes the focus.
 */
function holdKeys(event: KeyboardEvent) {
  if (!shownNotice) return;
  event.stopImmediatePropagation();
  if (event.key !== "Tab") return;
  event.preventDefault();
  const buttons = [...shownNotice.querySelectorAll("button")];
  const at = buttons.indexOf((shownNotice.getRootNode() as ShadowRoot).activeElement as HTMLButtonElement);
  buttons.at((at + (event.shiftKey ? -1 : 1)) % buttons.length)?.focus();
}
window.addEventListener("keydown", holdKeys, true);

/** What the bench and the tests find this notice by (`data-tk-notice`), whatever its words. */
export const UNCLAIMED_NOTICE = "unclaimed";

interface Props {
  /** The change has nothing to do with the designer's: editing goes on. */
  onKeepEditing(): void;
  /** Back to preview mode, the round kept: edit mode comes back to this canvas. `animate` is false when pressed from the keyboard. */
  onBackToPreview(animate: boolean): void;
}

/**
 * In edit mode, as the code changes with no Agent having claimed the round
 * (ticket 66): the canvas may no longer be what the code draws, so editing
 * pauses until the designer says how to go on. Over the whole shell, which
 * takes no pointer meanwhile.
 */
export function CodeChangeNotice({ onKeepEditing, onBackToPreview }: Props) {
  const notice = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  // Before the shell behind it pauses: once it does, nothing in it has the focus.
  const [before] = useState(focusedNow);
  // As it goes on the page: a key pressed meanwhile would edit. Focus moving here ends what was being typed, as an edit.
  // Once it goes, the focus goes back where it was, if that is still there (the canvas, say).
  useLayoutEffect(() => {
    shownNotice = notice.current;
    keep.current!.focus({ preventScroll: true });
    return () => {
      if (shownNotice === notice.current) shownNotice = null;
      // Once the shell takes the focus again: it pauses no more by the end of this update.
      queueMicrotask(() => {
        if (before?.isConnected && !before.closest("[inert]")) before.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <div class="tk-paused">
      <div ref={notice} class="tk-notice" role="alertdialog" data-tk-notice={UNCLAIMED_NOTICE} aria-modal="true" aria-labelledby="tk-notice-title" aria-describedby="tk-notice-text">
        <h2 id="tk-notice-title" class="tk-notice-title">
          The code is changing, but no Agent has claimed your changes
        </h2>
        <p id="tk-notice-text" class="tk-notice-text">
          Editing is paused: the canvas may no longer match the code. Keep editing if this change has nothing to do with yours. Or go back to preview mode: your
          changes are kept, and edit mode comes back to this canvas.
        </p>
        <div class="tk-changes-actions">
          <button type="button" class="tk-button" onClick={(event) => onBackToPreview(event.detail > 0)}>
            Back to preview mode
          </button>
          <button ref={keep} type="button" class="tk-button is-primary" onClick={onKeepEditing}>
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}

/** What has the focus now, through the editor layer's Shadow DOM, if anything does. */
function focusedNow(): HTMLElement | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}
