/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { tailwindOf, type Breakpoint } from "./breakpoints";
import { Icon } from "./icons";

/**
 * The views shown beside the desktop view (ADR 0008), by width: tablet and
 * phone unless the designer has changed them. Kept in the page's storage, so
 * they stay as set for the project across reloads.
 */
const VIEWS_KEY = "03kind:views";
const TABLET = 768;
const PHONE = 390;
const DEFAULT_WIDTHS = [TABLET, PHONE];
/** The narrowest and widest view that can be added, px. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 4000;

/** The widths of the views beside the desktop view, widest first. */
export function readViewWidths(): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "null");
    if (Array.isArray(saved) && saved.every((width) => Number.isInteger(width) && width >= MIN_WIDTH && width <= MAX_WIDTH)) return saved;
  } catch {}
  return DEFAULT_WIDTHS;
}

export function writeViewWidths(widths: number[]) {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(widths));
  } catch {}
}

/** `widths` with a view `width` px wide too, kept widest first; unchanged if there is one that wide already. */
export function withWidth(widths: number[], width: number): number[] {
  if (widths.includes(width)) return widths;
  return [...widths, width].sort((a, b) => b - a);
}

/** What a view is called: by the device it stands for. */
export function viewName(width: number, desktop: boolean): string {
  if (desktop) return "Desktop";
  if (width === TABLET) return "Tablet";
  if (width === PHONE) return "Phone";
  return "Custom";
}

/**
 * The widths the desktop view, `width` px wide, covers: those around it that
 * none of `others`, the ranges of the views beside it, takes. Its changes hold
 * at every width, but these are the widths it shows them alone at. Null when
 * no other view takes any.
 */
export function desktopRange(width: number, others: (Breakpoint | null)[]): Breakpoint | null {
  let min: number | null = null;
  let max: number | null = null;
  for (const other of others) {
    if (other?.max != null && other.max <= width && (min === null || other.max > min)) min = other.max;
    if (other?.min != null && other.min > width && (max === null || other.min < max)) max = other.min;
  }
  return min === null && max === null ? null : { min, max };
}

/**
 * The widths a view covers, as plainly as they read: `768–1279`, `≥ 1280`,
 * `≤ 767`. A range's upper edge is the first width past it. With no range,
 * the view's own width.
 */
export function rangeText(breakpoint: Breakpoint | null, width: number): string {
  const { min, max } = breakpoint ?? { min: null, max: null };
  if (min !== null && max !== null) return `${min}–${max - 1}`;
  if (min !== null) return `≥ ${min}`;
  if (max !== null) return `≤ ${max - 1}`;
  return `${width}`;
}

/**
 * Above a view, as a Frame's name in Figma: its name and the widths it covers
 * (designer, 2026-11-08). The project's breakpoint its changes are written
 * with, and that it shows only what CSS does at its width, are in the range's
 * title. At its right end, the way to play it full screen and, but for the
 * desktop view, to delete it.
 */
export function ViewLabel(props: {
  name: string;
  width: number;
  /** The widths the view covers; null: its own width alone is known. */
  breakpoint: Breakpoint | null;
  left: number;
  top: number;
  size: number;
  /** Full screen, from this button: focus comes back to it after. */
  onPlay(button: HTMLButtonElement): void;
  onDelete?: () => void;
}) {
  const { name, width, breakpoint, left, top, size, onPlay, onDelete } = props;
  const tailwind = tailwindOf(breakpoint);
  const title = [
    tailwind ? `Changes here are written with the project's breakpoint ${tailwind}` : onDelete ? null : "Changes here apply at every width the other views don't cover",
    "Shows what the page's CSS does at this width (media queries, Tailwind breakpoints). Layout that scripts change by the window's width does not show here.",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      class="tk-view-label"
      role="group"
      aria-label={`${name} view`}
      style={{ left: `${left}px`, top: `${top}px`, width: `${size}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span class="tk-view-name">{name}</span>
      <span class="tk-view-range" data-tk-tip={title}>
        {rangeText(breakpoint, width)}
      </span>
      {/* Full screen before ×, which stays at the very end: the button pressed to play keeps its place on every view. */}
      <button
        type="button"
        class="tk-icon-button tk-view-play"
        aria-label={`Full screen ${name} view`}
        data-tk-tip={onDelete ? `Full screen, ${width}px wide (Esc to come back)` : "Full screen, as wide as the window (Esc to come back)"}
        onClick={(event) => onPlay(event.currentTarget)}
      >
        <Icon name="fullscreen" />
      </button>
      {onDelete && (
        <button type="button" class="tk-icon-button tk-view-delete" aria-label={`Delete ${name} view`} data-tk-tip="Delete view" onClick={onDelete}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

/** After the last view: a button that asks for a width, and adds a view that wide. */
export function AddView(props: { left: number; top: number; onAdd(width: number): void }) {
  const { left, top, onAdd } = props;
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const close = () => {
    setOpen(false);
    setInvalid(false);
  };
  return (
    <div
      class="tk-add-view"
      style={{ left: `${left}px`, top: `${top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {open ? (
        <input
          class="tk-add-view-width"
          type="number"
          inputMode="numeric"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          placeholder="Width"
          aria-label="New view width"
          aria-invalid={invalid || undefined}
          data-tk-tip={`A width from ${MIN_WIDTH} to ${MAX_WIDTH} px`}
          ref={(el) => el?.focus()}
          onBlur={close}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            } else if (event.key === "Enter") {
              event.preventDefault();
              const width = Math.round(Number(event.currentTarget.value));
              if (!(width >= MIN_WIDTH && width <= MAX_WIDTH)) return setInvalid(true);
              close();
              onAdd(width);
            }
          }}
        />
      ) : (
        <button type="button" class="tk-icon-button" aria-label="Add view" data-tk-tip="Add a view of another width" onClick={() => setOpen(true)}>
          <Icon name="plus" />
        </button>
      )}
    </div>
  );
}
