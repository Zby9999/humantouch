/** @jsxImportSource preact */
import type { TargetedKeyboardEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { changeTitle, changeValues, layerName } from "../design-values";
import { breakpointName } from "./breakpoints";
import type { Change } from "./changeset";
import { Icon } from "./icons";

interface Props {
  changes: Change[];
  /** The Agent is applying them: nothing can be undone or discarded meanwhile. */
  readOnly: boolean;
  onRevert(id: number): void;
  /** ⌘Z / ⇧⌘Z in the list: undo or redo what was undone from it. Without them, the keys are left alone. */
  onUndo?(): void;
  onRedo?(): void;
  /** Called once the designer has confirmed. */
  onDiscard(): void;
  onClose(): void;
}

/**
 * Opened from the toggle's badge: the changes not yet applied, each of which
 * can be undone on its own, and Discard all, which asks first.
 */
export function ChangeList({ changes, readOnly, onRevert, onUndo, onRedo, onDiscard, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  useEffect(() => {
    dialog.current!.focus({ preventScroll: true });
    // A press anywhere else closes it; what opened it (the badge, or the count in edit mode) toggles it itself.
    const onPointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(dialog.current!) && !path.some((target) => target instanceof Element && target.hasAttribute("data-vk-changes-opener"))) {
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
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey && (key === "z" || key === "y") && onUndo && onRedo) {
      event.preventDefault();
      if (key === "y" ? !event.metaKey : event.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (confirming) {
      setConfirming(false);
      return;
    }
    const opener = (event.currentTarget.getRootNode() as ShadowRoot).querySelector<HTMLElement>("[data-vk-changes-opener]");
    onClose();
    opener?.focus();
  };

  const count = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  return (
    <div ref={dialog} class="vk-changes" role="dialog" aria-label="Changes" tabIndex={-1} onKeyDown={onKeyDown}>
      <h2 class="vk-changes-title">{count} not applied yet</h2>
      {readOnly && <p class="vk-changes-note">The Agent is applying these changes.</p>}
      {!changes.length && <p class="vk-changes-note">No changes left.</p>}
      <ul class="vk-changes-list">
        {changes.map((change) => (
          <li key={change.id} class="vk-change">
            <span class="vk-change-text">
              <span class="vk-change-name">
                {changeTitle(change)} · {layerName(change)}
              </span>
              <span class="vk-change-values">
                {changeValues(change)}
                {change.breakpoint && <span class="vk-change-breakpoint"> · {breakpointName(change.breakpoint)}</span>}
                {!!change.copiedBreakpoints?.length && <span class="vk-change-breakpoint"> · with copied breakpoints</span>}
              </span>
            </span>
            {!readOnly && (
              <button
                type="button"
                class="vk-icon-button"
                aria-label={`Undo the ${changeTitle(change).toLowerCase()} of ${layerName(change)}`}
                title="Undo this change"
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
          <div class="vk-changes-confirm">
            <p>Discard all {count}? The canvas goes with them: edit mode freezes the page afresh.</p>
            <div class="vk-changes-actions">
              <button ref={cancel} type="button" class="vk-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" class="vk-button is-danger" onClick={onDiscard}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div class="vk-changes-actions">
            <button type="button" class="vk-button" onClick={() => setConfirming(true)}>
              Discard all
            </button>
          </div>
        ))}
    </div>
  );
}
