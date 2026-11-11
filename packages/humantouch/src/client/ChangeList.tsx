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
  /** A row clicked: its change shown on the canvas, the list closing (designer, 2026-11-10). Without it, rows are not clicked. */
  onShow?(id: number): void;
  /** A row pointed at, or none (null): its change's layer outlined on the canvas (designer, 2026-11-10). */
  onHover?(id: number | null): void;
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
export function ChangeList({ changes, readOnly, takeFocus = true, onRevert, onShow, onHover, onUndo, onRedo, onDiscard, onClose }: Props) {
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
    // The last applied stays as it was, the list fading as a whole (`allApplied`).
    if (readOnly && changes.length) {
      shown.current.forEach((change, index) => {
        if (changes.some(({ id }) => id === change.id) || !tops.current.has(change.id)) return;
        leaving.current.push({ change, top: tops.current.get(change.id)!, current: index === 0 });
      });
    }
    shown.current = changes;
  }
  const latestOnClose = useRef(onClose);
  latestOnClose.current = onClose;
  // Gone, no row of it is pointed at.
  const latestOnHover = useRef(onHover);
  latestOnHover.current = onHover;
  useEffect(() => () => latestOnHover.current?.(null), []);
  /** The list's height as last drawn: a row applied, it closes up over the rise, not at once. */
  const height = useRef(0);
  /** The rows as last drawn with any: every change applied, the list fades out at once as it was, its last row in it (designer, 2026-11-09). */
  const last = useRef(changes);
  if (changes.length) last.current = changes;
  const allApplied = readOnly && !changes.length;
  const rowsShown = allApplied ? last.current : changes;
  const [closing, setClosing] = useState(false);
  useLayoutEffect(() => {
    if (!allApplied || closing) return;
    // Opened with nothing left: nothing to see go.
    if (!last.current.length) latestOnClose.current();
    else setClosing(true);
  });
  useLayoutEffect(() => {
    if (allApplied) return;
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
      if (!path.includes(dialog.current!) && !path.some((target) => target instanceof Element && target.hasAttribute("data-ht-changes-opener"))) {
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
    const opener = (event.currentTarget.getRootNode() as ShadowRoot).querySelector<HTMLElement>("[data-ht-changes-opener]");
    onClose();
    opener?.focus();
  };

  const count = rowsShown.length === 1 ? "1 change" : `${rowsShown.length} changes`;
  const names = namesOf(rowsShown);
  return (
    <div
      ref={dialog}
      class={closing ? "ht-changes is-leaving" : "ht-changes"}
      role="dialog"
      aria-label="Changes"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "opacity") latestOnClose.current();
      }}
    >
      <h2 class="ht-changes-title">{count} not applied yet</h2>
      {readOnly && <p class="ht-changes-note">The Agent is applying these changes.</p>}
      {!changes.length && !readOnly && <p class="ht-changes-note">No changes left.</p>}
      <ul
        ref={list}
        class={["ht-changes-list", hidden.above && "is-above", hidden.below && "is-below"].filter(Boolean).join(" ")}
        onScroll={measure}
      >
        {rowsShown.map((change, index) => (
          <li
            key={change.id}
            ref={(row) => {
              if (row) rows.current.set(change.id, row);
              else rows.current.delete(change.id);
            }}
            class={readOnly && index === 0 ? "ht-change is-current" : "ht-change"}
            aria-current={readOnly && index === 0 ? "step" : undefined}
            onPointerEnter={onHover && (() => onHover(change.id))}
            onPointerLeave={onHover && (() => onHover(null))}
          >
            {rowText(change, names, onShow)}
            {readOnly && index === 0 && <span class="ht-change-spinner" aria-hidden="true" />}
            {!readOnly && (
              <button
                type="button"
                class="ht-icon-button"
                aria-label={`Undo the ${changeTitle(change).toLowerCase()} of ${layerName(change)}`}
                data-ht-tip="Undo this change"
                onClick={() => {
                  // Its row goes: focus stays in the list, so Esc still closes it.
                  dialog.current!.focus({ preventScroll: true });
                  onHover?.(null);
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
            class={current ? "ht-change is-current is-applied" : "ht-change is-applied"}
            style={{ top: `${top}px` }}
            aria-hidden="true"
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              leaving.current = leaving.current.filter((row) => row.change !== change);
              setGone((n) => n + 1);
            }}
          >
            {rowText(change, names)}
            {current && <span class="ht-change-spinner" />}
          </li>
        ))}
      </ul>
      {!readOnly &&
        changes.length > 0 &&
        (confirming ? (
          <div class="ht-changes-confirm">
            <p>Discard all {count}? The canvas goes with them: edit mode freezes the page afresh.</p>
            <div class="ht-changes-actions">
              <button ref={cancel} type="button" class="ht-button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" class="ht-button is-danger" onClick={onDiscard}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div class="ht-changes-actions">
            <button type="button" class="ht-button" onClick={() => setConfirming(true)}>
              Discard all
            </button>
          </div>
        ))}
    </div>
  );
}

/** A change as its row names it: what changed, of which layer, and where it applies, the same for two changes alike. */
function nameOf(change: Change): string {
  const itself = change.scope === "component" ? ` · ${change.target.component} itself` : "";
  return `${changeTitle(change)} · ${layerName(change)}${itself}`;
}

/**
 * Each change's name in the list: one that would read as another's, the
 * layer's words after it, as the canvas shows them ("Start free"), to tell
 * the two apart (designer, 2026-11-10).
 */
function namesOf(changes: Change[]): Map<number, string> {
  const key = (change: Change) => `${nameOf(change)} ${breakpointName(change.breakpoint)}`;
  const counts = new Map<string, number>();
  for (const change of changes) counts.set(key(change), (counts.get(key(change)) ?? 0) + 1);
  return new Map(
    changes.map((change) => {
      const words = change.target.context.text;
      return [change.id, counts.get(key(change))! > 1 && words ? `${nameOf(change)} “${words}”` : nameOf(change)];
    }),
  );
}

/**
 * A change's row: what changed, of which layer, and where, on one line; its
 * values in its tip, pointed at (designer, 2026-11-10). With `onShow`, a
 * button that shows the change on the canvas.
 */
function rowText(change: Change, names: Map<number, string>, onShow?: (id: number) => void) {
  const name = (
    <span class="ht-change-name">
      {names.get(change.id) ?? nameOf(change)}
      {change.breakpoint && <span class="ht-change-breakpoint"> · {breakpointName(change.breakpoint)}</span>}
    </span>
  );
  const values = `${changeValues(change)}${change.copiedBreakpoints?.length ? " · with copied breakpoints" : ""}`;
  return onShow ? (
    <button type="button" class="ht-change-text" data-ht-tip={values} onClick={() => onShow(change.id)}>
      {name}
    </button>
  ) : (
    <span class="ht-change-text" data-ht-tip={values}>
      {name}
    </span>
  );
}
