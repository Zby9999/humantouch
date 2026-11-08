/** @jsxImportSource preact */
import type { TargetedKeyboardEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { changeTitle, changeValues, layerName } from "../design-values";
import { breakpointName } from "./breakpoints";
import { historyKey } from "./canvas-keys";
import type { Change } from "./changeset";
import { Icon } from "./icons";
import { APPLIED_RISE_MS, EASE_OUT, prefersReducedMotion } from "./motion";
import { pointerHeld } from "./pointer-held";

interface Props {
  changes: Change[];
  /**
   * The Agent is applying them: nothing can be undone or discarded meanwhile. The first is taken as the one it is at,
   * the order it is given them in; each goes from the list as the page shows it.
   */
  readOnly: boolean;
  /** Focused as it opens, for Esc and the keys; opened by itself as the Agent applies the round, it takes none. */
  takeFocus?: boolean;
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
 * can be undone on its own, and Discard all, which asks first. Too many for its height,
 * its title and Discard all stay where they are and the rows scroll between them, an
 * edge with rows past it fading out (designer, 2026-11-09).
 */
export function ChangeList({ changes, readOnly, takeFocus = true, onRevert, onUndo, onRedo, onDiscard, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** Rows out of sight above and below the list's edges: each such edge fades. */
  const [hidden, setHidden] = useState({ above: false, below: false });
  /** Each row's top in the list as last drawn: those after one applied rise from there into their places. */
  const rows = useRef(new Map<number, HTMLLIElement>());
  const tops = useRef(new Map<number, number>());
  /** Applied while the list is open: kept, where they were, as they go back and fade, till they are gone. */
  const leaving = useRef<{ change: Change; top: number; current: boolean }[]>([]);
  const [, setGone] = useState(0);
  const shown = useRef(changes);
  if (shown.current !== changes) {
    if (readOnly) {
      shown.current.forEach((change, index) => {
        if (changes.some(({ id }) => id === change.id) || !tops.current.has(change.id)) return;
        leaving.current.push({ change, top: tops.current.get(change.id)!, current: index === 0 });
      });
    }
    shown.current = changes;
  }
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;
  /** The list's height as last drawn: a row applied, it closes up over the rise, not at once. */
  const height = useRef(0);
  /** Every change applied: the last row goes back as the others did, then the list leaves as a popover does (designer, 2026-11-09). */
  const allApplied = readOnly && !changes.length;
  const [closing, setClosing] = useState(false);
  /** What the title counted last, kept as the last row goes. */
  const counted = useRef(changes.length);
  if (changes.length) counted.current = changes.length;
  useLayoutEffect(() => {
    if (!allApplied || leaving.current.length || closing) return;
    // Opened with nothing left: nothing to see go.
    if (!height.current) latestOnClose.current();
    else setClosing(true);
  });
  useLayoutEffect(() => {
    const rise = readOnly && !prefersReducedMotion();
    const moving: Animation[] = [];
    const next = new Map<number, number>();
    for (const [id, row] of rows.current) {
      const top = row.offsetTop;
      const was = tops.current.get(id);
      if (rise && was !== undefined && was !== top) {
        moving.push(row.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: APPLIED_RISE_MS, easing: EASE_OUT }));
      }
      next.set(id, top);
    }
    tops.current = next;
    const el = list.current!;
    // The last row applied: the list keeps its height as it goes, till the list leaves.
    if (allApplied) {
      if (height.current) el.style.minHeight = `${height.current}px`;
      return;
    }
    const now = el.offsetHeight;
    if (rise && height.current && now < height.current) {
      moving.push(el.animate([{ height: `${height.current}px` }, { height: `${now}px` }], { duration: APPLIED_RISE_MS, easing: EASE_OUT }));
    }
    height.current = now;
    // Risen, the list scrolls as far as its rows go, no further: its edges' fades as they are then.
    if (moving.length) void Promise.all(moving.map((animation) => animation.finished)).then(measure, () => {});
  });
  // As it goes on the page, not a frame later: a key pressed meanwhile would go to what opened it, and Esc would not close it.
  useLayoutEffect(() => {
    if (takeFocus) dialog.current!.focus({ preventScroll: true });
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
  const measure = () => {
    const el = list.current!;
    const next = { above: el.scrollTop > 0, below: el.scrollTop + el.clientHeight < el.scrollHeight - 1 };
    setHidden((was) => (was.above === next.above && was.below === next.below ? was : next));
  };
  // Rows gone or the window made shorter, the list may scroll no longer, or now.
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list.current!);
    return () => observer.disconnect();
  }, [changes.length]);

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

  const shownCount = allApplied ? counted.current : changes.length;
  const count = shownCount === 1 ? "1 change" : `${shownCount} changes`;
  return (
    <div
      ref={dialog}
      class={closing ? "tk-changes is-leaving" : "tk-changes"}
      role="dialog"
      aria-label="Changes"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "opacity") latestOnClose.current();
      }}
    >
      <h2 class="tk-changes-title">{count} not applied yet</h2>
      {readOnly && <p class="tk-changes-note">The Agent is applying these changes.</p>}
      {!changes.length && !readOnly && <p class="tk-changes-note">No changes left.</p>}
      <ul
        ref={list}
        class={["tk-changes-list", hidden.above && "is-above", hidden.below && "is-below"].filter(Boolean).join(" ")}
        onScroll={measure}
      >
        {changes.map((change, index) => (
          <li
            key={change.id}
            ref={(row) => {
              if (row) rows.current.set(change.id, row);
              else rows.current.delete(change.id);
            }}
            class={readOnly && index === 0 ? "tk-change is-current" : "tk-change"}
            aria-current={readOnly && index === 0 ? "step" : undefined}
          >
            {rowText(change)}
            {readOnly && index === 0 && <span class="tk-change-spinner" aria-hidden="true" />}
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
        {/* Applied: gone from the list, its row goes back and fades where it was, those after it rising into its place. */}
        {leaving.current.map(({ change, top, current }) => (
          <li
            key={`applied-${change.id}`}
            class={current ? "tk-change is-current is-applied" : "tk-change is-applied"}
            style={{ top: `${top}px` }}
            aria-hidden="true"
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              leaving.current = leaving.current.filter((row) => row.change !== change);
              setGone((n) => n + 1);
            }}
          >
            {rowText(change)}
            {current && <span class="tk-change-spinner" />}
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

/** A change's name and values, as its row in the list shows them. */
function rowText(change: Change) {
  return (
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
  );
}
