/** @jsxImportSource preact */
import { useEffect, useRef, useState } from "preact/hooks";
import { TOAST_MS, useToastTime } from "./Toast";

/**
 * What the page did as the code changed in edit mode, with no claim (ticket
 * 78): `updated`, the canvas, with no changes on it, was frozen afresh;
 * `changed`, the page changed since the canvas, with changes on it, was
 * frozen. `key` tells a new one from the last.
 */
export interface PageToastMessage {
  kind: "updated" | "changed";
  key: number;
}

/** How long the toast that the page changed stays: it has a button, and is about something the designer did not do. */
export const PAGE_CHANGED_TOAST_MS = 8000;

/** What the bench and the tests find each toast by (`data-ht-notice`), whatever its words. */
export const PAGE_TOAST_NOTICES = { updated: "canvas-updated", changed: "page-changed" } as const;

interface Props {
  message: PageToastMessage | null;
  /** The changes on the canvas now: what updating it discards. */
  changes: number;
  /** Discard every change, as the change list's Discard all does, and freeze the page afresh. */
  onUpdate(): void;
}

/**
 * At the bottom left of the canvas, apart from the toast at its bottom
 * middle, which answers what the designer does: what happened outside, so
 * neither takes the other's place. Dark like it, it fades out a while after
 * it shows (about 3 seconds; 8 when the page changed), but not while the
 * pointer or the focus is on it, nor while asking. Read out as it changes.
 */
export function PageToast({ message, changes, onUpdate }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { shown, fading } = useToastTime(message, message?.kind === "changed" ? PAGE_CHANGED_TOAST_MS : TOAST_MS, hovered || focused || confirming);
  // A new one asks nothing yet; one gone takes what it held with it, as the pointer leaves nothing that is gone.
  useEffect(() => setConfirming(false), [message]);
  useEffect(() => {
    if (shown) return;
    setHovered(false);
    setFocused(false);
  }, [shown]);
  // Asking, and back: the focus goes to the button in place of the one pressed, if it was on it.
  const cancel = useRef<HTMLButtonElement>(null);
  const update = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  useEffect(() => {
    if (moveFocus.current) (confirming ? cancel : update).current?.focus({ preventScroll: true });
    moveFocus.current = false;
  }, [confirming]);
  const ask = (on: boolean) => {
    moveFocus.current = true;
    setConfirming(on);
  };
  const plural = changes === 1 ? "change" : "changes";
  return (
    <div class="ht-page-toasts" role="status">
      {shown && (
        <div
          class={`ht-toast is-page${fading ? " is-fading" : ""}`}
          data-ht-notice={PAGE_TOAST_NOTICES[shown.kind]}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocusIn={() => setFocused(true)}
          onFocusOut={(event) => setFocused((event.currentTarget as Element).contains(event.relatedTarget as Node | null))}
        >
          {shown.kind === "updated" ? (
            <span key={shown.key}>Canvas updated to the latest page</span>
          ) : confirming ? (
            <>
              <span>
                Discard your {changes} {plural} and update?
              </span>
              <button ref={cancel} type="button" class="ht-button" onClick={() => ask(false)}>
                Cancel
              </button>
              <button type="button" class="ht-button is-danger" onClick={onUpdate}>
                Discard and update
              </button>
            </>
          ) : (
            <>
              <span key={shown.key}>The page has changed since this canvas was frozen</span>
              <button ref={update} type="button" class="ht-button" onClick={() => ask(true)}>
                Update canvas
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
