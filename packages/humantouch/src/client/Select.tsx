/** @jsxImportSource preact */
import { Fragment, type ComponentChildren, type JSX, type TargetedKeyboardEvent } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { leavingProps, useExit } from "./exit";
import { Icon, type IconName } from "./icons";

/** The height of an option in the menu, the menu's padding, and the column its check mark is in, in px. */
const OPTION = 28;
const PADDING = 4;
const CHECK_COLUMN = 24;
/** A font's "Aa" before its name, and the space after it, in px: in the menu where the select has it, before its words (designer, 2026-11-08). */
const SAMPLE_COLUMN = 24;
/** Kept from the window's edges. */
const GAP = 8;

interface Option {
  value: string;
  label: string;
  disabled: boolean;
  /** A font's option (its `data-font`, a `font-family`): "Aa" in it before its name. */
  font?: string;
}

/**
 * A `<select>` whose options open in a menu of the editor layer's own, light
 * as the Variables' popover, the one chosen over the select as in Figma
 * (designer, 2026-11-05). The select stays what holds the value and the
 * focus: the keys it gets are the menu's while it is open, and no shortcut
 * of the canvas takes them, as a field keeps its keys.
 */
export function Select(props: JSX.IntrinsicElements["select"]) {
  const select = useRef<HTMLSelectElement>(null);
  const [open, setOpen] = useState(false);
  /** The option the keys are on, by index in `options`. */
  const [active, setActive] = useState(-1);
  const [options, setOptions] = useState<Option[]>([]);
  const id = useId();
  const exit = useExit(open);

  const show = () => {
    const el = select.current!;
    // Mixed, the option standing for it, which cannot be chosen, is not in the menu.
    const listed = [...el.options].filter((o) => !(o.value === "" && o.disabled)).map((o) => ({ value: o.value, label: o.text, disabled: o.disabled, font: o.dataset.font }));
    setOptions(listed);
    setActive(listed.findIndex((o) => o.value === el.value));
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (option: Option | undefined) => {
    close();
    const el = select.current!;
    if (!option || option.disabled || option.value === el.value) return;
    el.value = option.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  /** The next option that can be chosen from `from`, `by` 1 or -1; `from` itself when there is none. */
  const step = (from: number, by: number) => {
    for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLSelectElement>) => {
    const { key } = event;
    if (!open) {
      if (key === " " || key === "Enter" || key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        show();
      }
      return;
    }
    if (key === "Tab") return close();
    event.preventDefault();
    if (key === "Escape") {
      // The menu closes; the selection stays.
      event.stopPropagation();
      close();
    } else if (key === "ArrowDown" || key === "ArrowUp") setActive((i) => step(i, key === "ArrowDown" ? 1 : -1));
    else if (key === "Home") setActive(step(-1, 1));
    else if (key === "End") setActive(step(options.length, -1));
    else if (key === "Enter" || key === " ") choose(options[active]);
    else if (key.length === 1) {
      // Typed, the next option starting with the letter.
      const letter = key.toLowerCase();
      const next = [...options.keys()].map((n) => (active + 1 + n) % options.length).find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(letter));
      if (next !== undefined) setActive(next);
    }
  };

  return (
    <>
      <select
        {...props}
        ref={select}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          // Not the system's menu: ours, or closed again.
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          // In a field's label (the gap's sizing), the menu opens over the select: let go on it, the click is the label's, which would
          // take the focus to the field's input, closing the menu and listing the Variables there in its place. This press's click is not.
          const label = event.currentTarget.closest("label");
          if (label) {
            const keep = (click: Event) => click.preventDefault();
            label.addEventListener("click", keep);
            window.addEventListener("mouseup", () => setTimeout(() => label.removeEventListener("click", keep)), { once: true, capture: true });
          }
          if (open) close();
          else show();
        }}
        onKeyDown={onKeyDown}
        onBlur={close}
      />
      {exit.shown && (
        <Menu key={exit.key} id={id} select={select.current!} options={options} active={active} leaving={exit.leaving} onActive={setActive} onChoose={choose} onClose={close} />
      )}
    </>
  );
}

function Menu({ id, select, options, active, leaving, onActive, onChoose, onClose }: {
  id: string;
  select: HTMLSelectElement;
  options: Option[];
  active: number;
  /** Closed with the pointer, it is leaving (`useExit`). */
  leaving: boolean;
  onActive(index: number): void;
  onChoose(option: Option): void;
  onClose(): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const chosen = options.findIndex((o) => o.value === select.value);

  useLayoutEffect(() => {
    const at = select.getBoundingClientRect();
    const height = box.current!.offsetHeight;
    // The option chosen over the select, its words where the select's are; Mixed, the first.
    const padding = parseFloat(getComputedStyle(select).paddingLeft);
    const left = at.left + padding - PADDING - CHECK_COLUMN - (options.some((o) => o.font) ? SAMPLE_COLUMN : 0);
    const top = at.top + at.height / 2 - PADDING - Math.max(chosen, 0) * OPTION - OPTION / 2;
    setPlace({
      left: Math.max(GAP, Math.min(left, window.innerWidth - box.current!.offsetWidth - GAP)),
      top: Math.max(GAP, Math.min(top, window.innerHeight - height - GAP)),
      minWidth: at.right - left,
    });
  }, [select]);
  useLayoutEffect(() => {
    // Longer than the window, the menu scrolls to the option the keys are on.
    const menu = box.current!;
    const option = menu.children[active] as HTMLElement | undefined;
    if (!option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop - PADDING;
    else if (option.offsetTop + OPTION > menu.scrollTop + menu.clientHeight) menu.scrollTop = option.offsetTop + OPTION + PADDING - menu.clientHeight;
  }, [active, place]);
  useEffect(() => {
    // The panel scrolled, or the window resized, the menu would be left behind: it closes. A scroll that
    // left the select where it was, one made just before it opened, say, is let be.
    const root = select.getRootNode() as Document | ShadowRoot;
    const at = select.getBoundingClientRect();
    const away = (event: Event) => {
      const now = select.getBoundingClientRect();
      if (event.target !== box.current && (now.top !== at.top || now.left !== at.left)) onClose();
    };
    window.addEventListener("resize", onClose);
    root.addEventListener("scroll", away, true);
    if (root !== document) document.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("resize", onClose);
      root.removeEventListener("scroll", away, true);
      if (root !== document) document.removeEventListener("scroll", away, true);
    };
  }, [select, onClose]);

  return (
    <div
      ref={box}
      id={id}
      class={leaving ? "tk-menu is-leaving" : "tk-menu"}
      role="listbox"
      {...leavingProps(leaving)}
      aria-label={select.getAttribute("aria-label") ?? undefined}
      style={{ left: `${place?.left ?? 0}px`, top: `${place?.top ?? 0}px`, minWidth: `${place?.minWidth ?? 0}px`, visibility: place ? "visible" : "hidden" }}
      // In a field's label, an option clicked does not go on to the field's input.
      onClick={(event) => event.preventDefault()}
    >
      {options.map((option, i) => (
        <div
          key={option.value}
          id={`${id}-${i}`}
          class={`tk-menu-option${i === active ? " is-active" : ""}`}
          role="option"
          aria-selected={i === chosen}
          aria-disabled={option.disabled || undefined}
          // The select keeps the focus, and its keys.
          onPointerDown={(event) => event.preventDefault()}
          // The pointer moved over it, not one it was left at that it came under, the menu scrolled by the keys or opened under it (ticket 131).
          onPointerMove={() => !option.disabled && i !== active && onActive(i)}
          onClick={() => !option.disabled && onChoose(option)}
        >
          {i === chosen && <Icon name="check" />}
          {option.font && (
            <span class="tk-font-sample" aria-hidden="true" style={{ fontFamily: option.font }}>
              Aa
            </span>
          )}
          {option.label}
        </div>
      ))}
    </div>
  );
}

/** One of a menu button's choices; `heading`, a heading over it and those after it. */
export interface MenuItem {
  value: string;
  label: string;
  disabled?: boolean;
  /** Drawn before its label: a Variable's swatch, say. */
  preview?: ComponentChildren;
  heading?: string;
  /**
   * What it is, more than its label shows, while a mouse points at it: drawn
   * from where it is (`at`) and the panel it is in (`beside`), as a shadow
   * Variable's layers beside the menu, as the Variables tab has them (designer, 2026-11-08).
   */
  details?(at: DOMRect, beside: DOMRect): ComponentChildren;
  /**
   * 1: in a second panel, to the left of the others: the shadow Variables
   * beside the effect types, which stay nearer the button, so the menu is not
   * one tall strip (designer, 2026-11-08). With no such item, or only such
   * items, one panel.
   */
  column?: 1;
}

/**
 * A button, an icon, whose choices open in a menu under it, light as a
 * select's, and right-aligned with it: Effects' + (designer, 2026-11-05).
 * The menu is in a dialog of its own, so no shortcut of the canvas takes its
 * keys: ↑ / ↓ to move, Enter to choose, Esc to close; a press elsewhere closes it.
 * With items in a second panel, ↑ / ↓ keep to a panel and ← / → go across (designer, 2026-11-08).
 */
export function MenuButton({ label, icon, items, onChoose, class: className }: { label: string; icon: IconName; items: MenuItem[]; onChoose(value: string): void; class?: string }) {
  const [open, setOpen] = useState<HTMLButtonElement | null>(null);
  const exit = useExit(open);
  return (
    <>
      {/* In a field's label, a click on the button or its menu does not go on to the field's input. */}
      <button
        type="button"
        class={className ? `tk-icon-button ${className}` : "tk-icon-button"}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={!!open}
        onClick={(event) => {
          event.preventDefault();
          setOpen(open ? null : event.currentTarget);
        }}
      >
        <Icon name={icon} />
      </button>
      {exit.shown && (
        <ButtonMenu
          key={exit.key}
          label={label}
          anchor={exit.shown}
          items={items}
          leaving={exit.leaving}
          onChoose={(value) => {
            setOpen(null);
            exit.shown!.focus();
            onChoose(value);
          }}
          onClose={(refocus) => {
            setOpen(null);
            if (refocus) exit.shown!.focus();
          }}
        />
      )}
    </>
  );
}

function ButtonMenu({ label, anchor, items, leaving, onChoose, onClose }: {
  label: string;
  anchor: HTMLElement;
  items: MenuItem[];
  /** Closed with the pointer, it is leaving (`useExit`). */
  leaving: boolean;
  onChoose(value: string): void;
  onClose(refocus: boolean): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  /**
   * Where it is: under its button, or over it when there is more room there and not enough under; two panels then have
   * their feet level, by the button. `room`: as tall as it goes on its side, a long panel scrolling in it, so a short
   * one stays by the button however long the other is (designer, 2026-11-08).
   */
  const [place, setPlace] = useState<{ left: number; top: number; above: boolean; room: number } | null>(null);
  /** The item a mouse points at that has details to show, where it is, and the panel it is in. */
  const [pointed, setPointed] = useState<{ index: number; at: DOMRect; beside: DOMRect } | null>(null);
  const [active, setActive] = useState(() => items.findIndex((item) => !item.disabled));
  const id = useId();
  useLayoutEffect(() => {
    const at = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = box.current!;
    const below = at.bottom + 4;
    const under = window.innerHeight - below - GAP;
    const over = at.top - 4 - GAP;
    const above = height > under && over > under;
    const room = above ? over : under;
    setPlace({
      left: Math.max(GAP, Math.min(at.right - width, window.innerWidth - width - GAP)),
      top: above ? at.top - 4 - Math.min(height, room) : below,
      above,
      room,
    });
  }, [anchor]);
  // Focused once placed: until then it is hidden, and a hidden list takes no focus (its keys went to the canvas).
  const placed = !!place;
  useLayoutEffect(() => {
    if (placed) list.current!.focus({ preventScroll: true });
  }, [placed]);
  useEffect(() => {
    const root = anchor.getRootNode() as Document | ShadowRoot;
    const away = (event: Event) => {
      const path = event.composedPath();
      if (!leaving && !path.includes(box.current!) && !path.includes(anchor)) onClose(false);
    };
    document.addEventListener("pointerdown", away, true);
    if (root !== document) root.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      if (root !== document) root.removeEventListener("pointerdown", away, true);
    };
  }, [anchor, onClose, leaving]);
  /** Two panels, as columns of the one list, when some items, and not all, are in the second, at the left (designer, 2026-11-08). */
  const columns = items.some((item) => item.column === 1) && items.some((item) => item.column !== 1);
  const columnOf = (i: number) => (columns ? (items[i]?.column ?? 0) : 0);
  /** Where item `i` is in its column. */
  const rowOf = (i: number) => items.slice(0, i).filter((_, j) => columnOf(j) === columnOf(i)).length;
  /** The next item that can be chosen from `from` by `by`, in `column`: ↑ / ↓, Home and End keep to the column. */
  const step = (from: number, by: number, column = columnOf(active)) => {
    for (let i = from + by; i >= 0 && i < items.length; i += by) if (!items[i].disabled && columnOf(i) === column) return i;
    return from;
  };
  /** ← / →: the item of the other column at the nearest row; none there, it stays (designer, 2026-11-08). */
  const across = (from: number, column: number) => {
    if (!columns || from < 0 || column === columnOf(from)) return from;
    const row = rowOf(from);
    let best = from;
    items.forEach((item, i) => {
      if (item.disabled || columnOf(i) !== column) return;
      if (best === from || Math.abs(rowOf(i) - row) < Math.abs(rowOf(best) - row)) best = i;
    });
    return best;
  };
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "Tab") return onClose(false);
    const arrows = columns ? ["ArrowLeft", "ArrowRight"] : [];
    if (![...arrows, "ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (key === "Escape") return onClose(true);
    if (key === "Enter" || key === " ") return items[active] && onChoose(items[active].value);
    const next =
      key === "ArrowDown" || key === "ArrowUp" ? step(active, key === "ArrowDown" ? 1 : -1)
      : key === "Home" ? step(-1, 1)
      : key === "End" ? step(items.length, -1)
      : across(active, key === "ArrowLeft" ? 1 : 0);
    setActive(next);
    // A column scrolls on its own: the item moved to is brought into it.
    list.current!.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const option = (item: MenuItem, i: number) => (
    <Fragment key={item.value}>
      {item.heading && (
        <div class="tk-menu-heading" role="presentation">
          {item.heading}
        </div>
      )}
      <div
        id={`${id}-${i}`}
        data-index={i}
        class={`tk-menu-option${i === active ? " is-active" : ""}`}
        role="option"
        aria-selected={false}
        aria-disabled={item.disabled || undefined}
        onPointerDown={(event) => event.preventDefault()}
        // The pointer moved over it, not one it was left at that it came under, the list scrolled by the keys or opened under it (ticket 131).
        onPointerMove={(event) => {
          if (!item.disabled && i !== active) setActive(i);
          if (!item.details || event.pointerType !== "mouse" || pointed?.index === i) return;
          const el = event.currentTarget;
          setPointed({ index: i, at: el.getBoundingClientRect(), beside: (el.closest(".tk-menu-column") ?? el).getBoundingClientRect() });
        }}
        onPointerLeave={() => setPointed(null)}
        onClick={(event) => {
          event.preventDefault();
          if (!item.disabled) onChoose(item.value);
        }}
      >
        {item.preview}
        {item.label}
      </div>
    </Fragment>
  );
  return (
    <div
      ref={box}
      class={`tk-menu is-plain${columns ? " is-split" : ""}${place?.above ? " is-above" : ""}${leaving ? " is-leaving" : ""}`}
      role="dialog"
      {...leavingProps(leaving)}
      aria-label={label}
      style={{ left: `${place?.left ?? 0}px`, top: `${place?.top ?? 0}px`, visibility: place ? "visible" : "hidden", ...(place && { "--tk-menu-room": `${place.room}px` }) }}
    >
      <div
        ref={list}
        role="listbox"
        aria-label={label}
        tabIndex={-1}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        class={columns ? "tk-menu-list is-columns" : "tk-menu-list"}
        onKeyDown={onKeyDown}
      >
        {columns
          ? [1, 0].map((column) => (
              <div key={column} class="tk-menu-column" role="presentation">
                {items.map((item, i) => columnOf(i) === column && option(item, i))}
              </div>
            ))
          : items.map(option)}
      </div>
      {pointed && !leaving && items[pointed.index]?.details?.(pointed.at, pointed.beside)}
    </div>
  );
}
