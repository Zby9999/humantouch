/** @jsxImportSource preact */
import { useLayoutEffect, useRef } from "preact/hooks";

/**
 * The notice up, while editing is paused: what holds the keys. Null when
 * there is none.
 */
let up: HTMLElement | null = null;

/**
 * While editing is paused no key reaches the editor layer's own handlers, which
 * listen on the window: this one, added as the module loads, comes before all
 * of them and stops each key there. What a key does by default goes on, so
 * the notice's buttons still answer Enter and Space; Tab goes round them.
 * Keys let go are left alone: a key held as editing paused (Space, to pan)
 * is let go as usual.
 */
function holdKeys(event: KeyboardEvent) {
  if (!up) return;
  event.stopImmediatePropagation();
  if (event.key !== "Tab") return;
  event.preventDefault();
  const buttons = [...up.querySelectorAll("button")];
  const at = buttons.indexOf((up.getRootNode() as ShadowRoot).activeElement as HTMLButtonElement);
  buttons.at((at + (event.shiftKey ? -1 : 1)) % buttons.length)?.focus();
}
window.addEventListener("keydown", holdKeys, true);

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
  // As it goes on the page: a key pressed meanwhile would edit. Focus moving here ends what was being typed, as an edit.
  useLayoutEffect(() => {
    up = notice.current;
    keep.current!.focus({ preventScroll: true });
    return () => {
      if (up === notice.current) up = null;
    };
  }, []);
  return (
    <div class="vk-paused">
      <div ref={notice} class="vk-notice" role="alertdialog" aria-modal="true" aria-labelledby="vk-notice-title" aria-describedby="vk-notice-text">
        <h2 id="vk-notice-title" class="vk-notice-title">
          The code is changing, but no Agent has claimed your changes
        </h2>
        <p id="vk-notice-text" class="vk-notice-text">
          Editing is paused: the canvas may no longer match the code. Keep editing if this change has nothing to do with yours. Or go back to preview mode: your
          changes are kept, and edit mode comes back to this canvas.
        </p>
        <div class="vk-changes-actions">
          <button type="button" class="vk-button" onClick={(event) => onBackToPreview(event.detail > 0)}>
            Back to preview mode
          </button>
          <button ref={keep} type="button" class="vk-button is-primary" onClick={onKeepEditing}>
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
