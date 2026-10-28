/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import { tailwindOf, type Breakpoint } from "./breakpoints";
import { Icon } from "./icons";

/**
 * The views shown beside the desktop view (ADR 0008), by width: tablet and
 * phone unless the designer has changed them. Kept in the page's storage, so
 * they stay as set for the project across reloads.
 */
const VIEWS_KEY = "vernierkit:views";
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
 * Above a view: what it is, the project's Tailwind breakpoint it stands for,
 * that it shows only what CSS does at its width, and, but for the desktop
 * view, the way to delete it.
 */
export function ViewLabel(props: { name: string; width: number; breakpoint: Breakpoint | null; left: number; top: number; size: number; onDelete?: () => void }) {
  const { name, width, breakpoint, left, top, size, onDelete } = props;
  const tailwind = tailwindOf(breakpoint);
  return (
    <div
      class="vk-view-label"
      role="group"
      aria-label={`${name} view`}
      style={{ left: `${left}px`, top: `${top}px`, width: `${size}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onDblClick={(event) => event.stopPropagation()}
    >
      <span class="vk-view-name">{name}</span>
      <span class="vk-view-width">{width}</span>
      {tailwind && (
        <span class="vk-view-breakpoint" title="The project's breakpoint this view stands for: its changes are written with it">
          {tailwind}
        </span>
      )}
      <span class="vk-view-note" title="Shows what the page's CSS does at this width (media queries, Tailwind breakpoints). Layout that scripts change by the window's width does not show here.">
        CSS responsive only
      </span>
      {onDelete && (
        <button type="button" class="vk-icon-button vk-view-delete" aria-label={`Delete ${name} view`} title="Delete view" onClick={onDelete}>
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
      class="vk-add-view"
      style={{ left: `${left}px`, top: `${top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onDblClick={(event) => event.stopPropagation()}
    >
      {open ? (
        <input
          class="vk-add-view-width"
          type="number"
          inputMode="numeric"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          placeholder="Width"
          aria-label="New view width"
          aria-invalid={invalid || undefined}
          title={`A width from ${MIN_WIDTH} to ${MAX_WIDTH} px`}
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
        <button type="button" class="vk-icon-button" aria-label="Add view" title="Add a view of another width" onClick={() => setOpen(true)}>
          <Icon name="plus" />
        </button>
      )}
    </div>
  );
}
