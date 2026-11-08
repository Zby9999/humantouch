/** @jsxImportSource preact */
import type { TargetedKeyboardEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { changeTitle, changeValues, layerName } from "../design-values";
import { breakpointName } from "./breakpoints";
import { historyKey } from "./canvas-keys";
import type { Change } from "./changeset";
import { Icon } from "./icons";
import { pointerHeld } from "./pointer-held";

interface Props {
  changes: Change[];
  /** The Agent is applying them: nothing can be undone or discarded meanwhile. */
  readOnly: boolean;
  onRevert(id: number): void;
  /** ⌘Z / ⇧⌘Z (and Ctrl+Y) in the list, as on the canvas: undo or redo what was undone from it. Without them, the keys are left alone. */
  onUndo?(): void;
  onRedo?(): void;
  /** Called once the designer has confirmed. */
  onDiscard(): void;
  onClose(): void;
}

/**
 * Opened from the count beside the toggle: the changes not yet applied, each of which
 * can be undone on its own, and Discard all, which asks first.
 */
export function ChangeList({ changes, readOnly, onRevert, onUndo, onRedo, onDiscard, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  // As it goes on the page, not a frame later: a key pressed meanwhile would go to what opened it, and Esc would not close it.
  useLayoutEffect(() => {
    dialog.current!.focus({ preventScroll: true });
    // A press anywhere else closes it; what opened it (the count beside the toggle, or the one in edit mode) toggles it itself.
    const onPointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(dialog.current!) && !path.some((target) => target instanceof Element && target.hasAttribute("data-tk-changes-opener"))) {
        latestOnClose.current();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, []);
  useEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    // The editor's keys, by the editor's judgment (`historyKey`): ⌘Z undoes, ⇧⌘Z and Ctrl+Y redo; ⌘Y is the browser's.
    const key = historyKey(event, { held: pointerHeld() });
    if (key && onUndo && onRedo) {
      event.preventDefault();
      if (key === "undo") onUndo();
      else if (key === "redo") onRedo();
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (confirming) {
      setConfirming(false);
      return;
    }
    const opener = (event.currentTarget.getRootNode() as ShadowRoot).querySelector<HTMLElement>("[data-tk-changes-opener]");
    onClose();
    opener?.focus();
  };

  const count = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  return (
    <div ref={dialog} class="tk-changes" role="dialog" aria-label="Changes" tabIndex={-1} onKeyDown={onKeyDown}>
      <h2 class="tk-changes-title">{count} not applied yet</h2>
      {readOnly && <p class="tk-changes-note">The Agent is applying these changes.</p>}
      {!changes.length && <p class="tk-changes-note">No changes left.</p>}
      <ul class="tk-changes-list">
        {changes.map((change) => (
          <li key={change.id} class="tk-change">
            <span class="tk-change-text">
              <span class="tk-change-name">
                {changeTitle(change)} · {layerName(change)}
              </span>
              <span class="tk-change-values">
                {changeValues(change)}
                {change.scope === "component" && <span> · {change.target.component} itself</span>}
                {change.breakpoint && <span class="tk-change-breakpoint"> · {breakpointName(change.breakpoint)}</span>}
                {!!change.copiedBreakpoints?.length && <span class="tk-change-breakpoint"> · with copied breakpoints</span>}
              </span>
            </span>
            {!readOnly && (
              <button
                type="button"
                class="tk-icon-button"
                aria-label={`Undo the ${changeTitle(change).toLowerCase()} of ${layerName(change)}`}
                data-tk-tip="Undo this change"
                onClick={() => {
                  // Its row goes: focus stays in the list, so Esc still closes it.
                  dialog.current!.focus({ preventScroll: true });
                  onRevert(change.id);
                }}
              >
                <Icon name="undo" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly &&
        changes.length > 0 &&
        (confirming ? (
          <div class="tk-changes-confirm">
            <p>Discard all {count}? The canvas goes with them: edit mode freezes the page afresh.</p>
            <div class="tk-changes-actions">
              <button ref={cancel} type="button" class="tk-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" class="tk-button is-danger" onClick={onDiscard}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div class="tk-changes-actions">
            <button type="button" class="tk-button" onClick={() => setConfirming(true)}>
              Discard all
            </button>
          </div>
        ))}
    </div>
  );
}
