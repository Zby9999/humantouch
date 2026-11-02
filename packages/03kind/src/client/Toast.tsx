/** @jsxImportSource preact */
import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { TOAST_FADE_MS } from "./motion";

/** How long a toast stays once shown, or once the pointer leaves it. */
export const TOAST_MS = 3000;

/** Shows a toast in edit mode: a short note of one line, gone on its own a moment later. A new one takes the old one's place. */
export type ShowToast = (text: string) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** What may show a toast: the edit mode shell wraps the Design panel in it; anything else that is to show one is wrapped the same way. */
export const ToastProvider = ToastContext.Provider;

/** The edit mode shell's toast, to show a short note with. Outside a `ToastProvider`, it shows nothing. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** A toast to show: `key` tells a new one from the last, though their words be the same, so its time starts afresh. */
export interface ToastMessage {
  text: string;
  key: number;
}

/**
 * How long a toast shows: `message` from when it is set, then fading out, then
 * gone; but not while `held` (the pointer on it, say), and once let go, for
 * `ms` again. What it is to show is `shown`, kept while it fades.
 */
export function useToastTime<T>(message: T | null, ms: number, held: boolean): { shown: T | null; fading: boolean } {
  const [shown, setShown] = useState<T | null>(message);
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stay = () => clearTimeout(timer.current);
  useEffect(() => {
    setShown(message);
    setFading(false);
  }, [message]);
  useEffect(() => {
    stay();
    if (!message) return;
    if (held) return setFading(false);
    timer.current = setTimeout(() => {
      setFading(true);
      timer.current = setTimeout(() => setShown(null), TOAST_FADE_MS);
    }, ms);
  }, [message, held]);
  useEffect(() => stay, []);
  return { shown, fading };
}

/**
 * At the bottom middle of the canvas, as in Figma: a dark pill of one line,
 * fading out about 3 seconds after it shows, but not while the pointer is on it.
 * Read out as it changes.
 */
export function Toast({ message }: { message: ToastMessage | null }) {
  /** The pointer is on the toast: it stays until the pointer leaves. */
  const [hovered, setHovered] = useState(false);
  const { shown, fading } = useToastTime(message, TOAST_MS, hovered);
  return (
    <div class="tk-toasts" role="status">
      {shown && (
        // One toast at a time: a new one shows its words in the same place, without coming in again.
        <p class={`tk-toast${fading ? " is-fading" : ""}`} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
          {/* A new toast is new words in the live region, though they be the same: it is read out again. */}
          <span key={shown.key}>{shown.text}</span>
        </p>
      )}
    </div>
  );
}
