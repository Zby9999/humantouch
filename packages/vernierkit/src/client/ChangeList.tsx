/** @jsxImportSource preact */
import type { TargetedKeyboardEvent } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { changeTitle, changeValues, layerName } from "../design-values";
import type { Change } from "./changeset";
import { Icon } from "./icons";

interface Props {
  changes: Change[];
  /** The Agent is applying them: nothing can be undone or discarded meanwhile. */
  readOnly: boolean;
  onRevert(id: number): void;
  /** Called once the designer has confirmed. */
  onDiscard(): void;
  onClose(): void;
}

/**
 * Opened from the toggle's badge: the changes not yet applied, each of which
 * can be undone on its own, and Discard all, which asks first.
 */
export function ChangeList({ changes, readOnly, onRevert, onDiscard, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;

  useEffect(() => {
    dialog.current!.focus({ preventScroll: true });
    // A press anywhere else closes it; the badge toggles it itself.
    const onPointerDown = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(dialog.current!) && !path.some((target) => target instanceof Element && target.classList.contains("vk-badge"))) {
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
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (confirming) {
      setConfirming(false);
      return;
    }
    const badge = (event.currentTarget.getRootNode() as ShadowRoot).querySelector<HTMLElement>(".vk-badge");
    onClose();
    badge?.focus();
  };

  const count = changes.length === 1 ? "1 change" : `${changes.length} changes`;
  return (
    <div ref={dialog} class="vk-changes" role="dialog" aria-label="Changes" tabIndex={-1} onKeyDown={onKeyDown}>
      <h2 class="vk-changes-title">{count} not applied yet</h2>
      {readOnly && <p class="vk-changes-note">The Agent is applying these changes.</p>}
      <ul class="vk-changes-list">
        {changes.map((change) => (
          <li key={change.id} class="vk-change">
            <span class="vk-change-text">
              <span class="vk-change-name">
                {changeTitle(change)} · {layerName(change)}
              </span>
              <span class="vk-change-values">{changeValues(change)}</span>
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
