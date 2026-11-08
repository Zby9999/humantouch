/** @jsxImportSource preact */
import { createContext, type ComponentChildren, type RefObject, type TargetedKeyboardEvent } from "preact";
import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Variable, VariableGroup } from "../service-protocol";
import { ResetButton, useChangeMarks, type ValuePart } from "./ChangeMarks";
import { writeShadows, type Shadow } from "./effects";
import { leavingProps, useExit } from "./exit";
import { Icon } from "./icons";
import { cssColor, type Color } from "./paint";
import type { Property } from "./property-table";
import { equal, sameVariable, type Catalog, type Drawn, type Resolved } from "./variables";
import { paletteRows } from "./VariantsPanel";

const CatalogContext = createContext<Catalog | null>(null);

/** The project's Variables, for the Design panel; null while there are none. */
export const CatalogProvider = CatalogContext.Provider;

export function useCatalog(): Catalog | null {
  return useContext(CatalogContext);
}

/** What the Design panel needs of a part of a value that can be a Variable. */
export interface Slot {
  group: VariableGroup;
  /** Tells the selected layers apart: what was typed for some is not hinted at for others. */
  selection: string;
  /** The Variable the designer picked for it, shared by the selected layers; null when none. */
  bound: Variable | null;
  /** Picks a Variable for it; null detaches it, keeping the value. */
  onPick(entry: Resolved | null): void;
}

const POPOVER_WIDTH = 240;
/** The most it is tall, as its styles have it (`.tk-popover`). */
const POPOVER_MAX_HEIGHT = 520;
const GAP = 8;

/**
 * A panel over the Design panel, beside it as in Figma, for the control
 * `anchor`: it closes on Esc, or on a press outside it, giving focus back.
 * `leaving`: closed with the pointer, it fades and moves down (`useExit`).
 */
function Popover({ label, anchor, leaving = false, onClose, children }: { label: string; anchor: HTMLElement; leaving?: boolean; onClose(): void; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const at = anchor.getBoundingClientRect();
      // Placed as if it were as tall as it can be: it stays where it is as it grows or shrinks, a tab or a fill's type changed,
      // and is whole in the window however tall it comes to (designer, 2026-11-05).
      const tallest = Math.min(POPOVER_MAX_HEIGHT, window.innerHeight - 2 * GAP);
      const left = at.left - POPOVER_WIDTH - GAP >= GAP ? at.left - POPOVER_WIDTH - GAP : Math.max(GAP, at.right - POPOVER_WIDTH);
      setPlace({ left, top: Math.max(GAP, Math.min(at.top, window.innerHeight - tallest - GAP)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  useEffect(() => {
    const root = anchor.getRootNode() as Document | ShadowRoot;
    const away = (event: Event) => {
      const path = event.composedPath();
      // A gradient's handles on the canvas change what it shows: pressed, it stays open.
      const keeps = path.some((el) => el instanceof Element && el.hasAttribute("data-tk-keeps-popover"));
      if (!leaving && !path.includes(box.current!) && !path.includes(anchor) && !keeps) onClose();
    };
    // On the document: a press on the page or canvas; on the shadow root: one elsewhere in the editor layer.
    document.addEventListener("pointerdown", away, true);
    if (root !== document) root.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      if (root !== document) root.removeEventListener("pointerdown", away, true);
    };
  }, [anchor, onClose, leaving]);
  const close = () => {
    onClose();
    anchor.focus();
  };
  return (
    <div
      ref={box}
      class={leaving ? "tk-popover is-leaving" : "tk-popover"}
      role="dialog"
      {...leavingProps(leaving)}
      aria-label={label}
      // A click on it keeps its keys in it: Esc closes it, not the selection.
      tabIndex={-1}
      style={{ width: `${POPOVER_WIDTH}px`, left: `${place?.left ?? 0}px`, top: `${place?.top ?? 0}px`, visibility: place ? "visible" : "hidden" }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        close();
      }}
    >
      <div class="tk-popover-header">
        <h3 class="tk-section-title">{label}</h3>
        <button type="button" class="tk-icon-button" aria-label="Close" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </div>
  );
}

/** What a Variable draws, in a word: "22px", "#3D63F5", "2 shadows". */
function valueText(drawn: Drawn): string {
  if (typeof drawn === "number") return `${drawn}px`;
  if (Array.isArray(drawn)) return drawn.length === 1 ? "1 shadow" : `${drawn.length} shadows`;
  return drawn.opacity < 1 ? `${drawn.color} ${Math.round(drawn.opacity * 100)}%` : drawn.color;
}

/** A small picture of what a Variable draws: a swatch of a color, a box with its shadows. */
export function Preview({ drawn }: { drawn: Drawn }) {
  if (typeof drawn === "number") return null;
  if (Array.isArray(drawn)) {
    return <span class="tk-variable-preview is-shadow" style={{ boxShadow: writeShadows(drawn as Shadow[])["box-shadow"] }} aria-hidden="true" />;
  }
  return <span class="tk-variable-preview" style={{ "--tk-swatch": cssColor(drawn as Color) }} aria-hidden="true" />;
}

/** Which heading a Variable is listed under: the project's own apart from Tailwind's, and a color with its family (`brand-500` under brand). */
function headingOf({ name, group, own }: Variable): string {
  const base = own ? "This project" : "Tailwind";
  if (group !== "color") return base;
  const bare = name.replace(/^--/, "");
  const family = bare.replace(/-\d+$/, "");
  return family === bare ? base : `${base} · ${family}`;
}

/**
 * A Variable in a list: its preview, name and what it draws. A button in a
 * picker's list; in the list under a field typed into, a row that leaves the
 * focus in the field, chosen as the pointer passes over it.
 */
function Option({ as, id, entry, selected, onChoose, onPick }: {
  as: "button" | "div";
  id?: string;
  entry: Resolved;
  selected: boolean;
  onChoose?(): void;
  onPick(entry: Resolved): void;
}) {
  const { variable, drawn } = entry;
  const Tag = as;
  return (
    <Tag
      {...(as === "button" ? { type: "button" } : {
        // The field keeps the focus, and what is typed, until one is picked.
        onPointerDown: (event: PointerEvent) => event.preventDefault(),
        onPointerEnter: onChoose,
      })}
      id={id}
      role="option"
      class="tk-variable-option"
      aria-selected={selected}
      aria-label={variable.name}
      title={`${variable.name}: ${variable.value}`}
      onClick={() => onPick(entry)}
    >
      <Preview drawn={drawn} />
      <span class="tk-variable-name">{variable.name}</span>
      <span class="tk-variable-value">{valueText(drawn)}</span>
    </Tag>
  );
}

/**
 * The Variables of a group, under their headings, the project's own first,
 * found by name as one types. The one picked shows as selected.
 */
export function VariableList({ group, bound, onPick }: { group: VariableGroup; bound: Variable | null; onPick(entry: Resolved): void }) {
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => search.current?.focus(), []);
  const found = !catalog ? [] : query.trim() ? catalog.named(group, query) : catalog.of(group);
  const headings = [...new Set(found.map(({ variable }) => headingOf(variable)))];
  return (
    <>
      <input
        ref={search}
        type="search"
        class="tk-input tk-variable-search"
        aria-label="Search variables"
        placeholder="Search"
        spellcheck={false}
        autocomplete="off"
        value={query}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <div class="tk-variable-list" role="listbox" aria-label="Variables">
        {!found.length && <p class="tk-layer-note">No variables match.</p>}
        {/* Colors not searched for: a palette, the project's own first, as the Variants tab shows them (designer, 2026-11-07). */}
        {group === "color" && !query.trim()
          ? (["Project", "Tailwind"] as const).map((heading) => {
              const part = found.filter(({ variable }) => variable.own === (heading === "Project"));
              return part.length ? (
                <div key={heading} role="group" aria-label={heading}>
                  <h4 class="tk-section-title tk-subtitle">{heading}</h4>
                  <div class="tk-variants-palette">
                    {paletteRows(part).map(([name, steps], r) => (
                      <div key={`${name} ${r}`} class="tk-variants-ramp is-bare">
                        {steps.map((entry, i) =>
                          entry ? (
                            <button
                              key={entry.variable.name}
                              type="button"
                              role="option"
                              class="tk-variants-swatch"
                              aria-selected={sameVariable(bound, entry.variable)}
                              aria-label={entry.variable.name}
                              title={`${entry.variable.name}: ${valueText(entry.drawn)}`}
                              style={{ "--tk-swatch": cssColor(entry.drawn as Color) }}
                              onClick={() => onPick(entry)}
                            />
                          ) : (
                            <span key={`empty ${i}`} class="tk-variants-empty" />
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })
          : headings.map((heading) => (
          <div key={heading} role="group" aria-label={heading}>
            <h4 class="tk-section-title tk-subtitle">{heading}</h4>
            {found
              .filter(({ variable }) => headingOf(variable) === heading)
              .map((entry) => {
                const { variable } = entry;
                const selected = sameVariable(bound, variable);
                return <Option key={`${variable.from} ${variable.name}`} as="button" entry={entry} selected={selected} onPick={onPick} />;
              })}
          </div>
            ))}
      </div>
    </>
  );
}

/**
 * A field whose value can be a Variable, as in Figma: with one picked, the
 * Variable's name shows in its place, to pick another or detach it; without,
 * the field, which lists the group's Variables as it is focused and typed
 * into (`useTypeahead`). With no Variables in the group, the field alone.
 *
 * The field is in the same element whether the Variables are in or not: they
 * can come in after the panel is up, as the field is typed into, and it keeps
 * its focus, what is typed and what is selected in it (ticket 98). With no
 * button beside it, that element lays out as if the field were in its place.
 */
export function VariableSlot({ label, slot, property, part, rowReset, children }: {
  label: string;
  /** Its reset is its row's, at the row's left (a size's, with its sizing): marked, the name has none of its own (designer, 2026-11-08). */
  rowReset?: boolean;
  slot: Slot | undefined;
  /** The property the field sets, and its part: with a Variable picked, the name is marked as the field would be (`ChangeMarks`). */
  property?: Property;
  part?: number | ValuePart;
  children: ComponentChildren;
}) {
  const catalog = useCatalog();
  const marks = useChangeMarks();
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const exit = useExit(open);
  const offered = slot && catalog?.of(slot.group).length ? slot : undefined;
  const pick = (entry: Resolved | null) => {
    setOpen(null);
    offered!.onPick(entry);
  };
  const lower = label.toLowerCase();
  const typing: Typing | null = offered ? { group: offered.group, selection: offered.selection, read: readLength, naming: namesLength, onPick: pick } : null;
  const bound = offered?.bound;
  const changed = !!bound && !!property && marks.changed(property, part);
  return (
    <div class={offered ? "tk-variable-slot" : "tk-variable-slot is-alone"}>
      {bound ? (
        <div class={`tk-field tk-variable-chip${changed ? " is-changed" : ""}`}>
          <Icon name="variable" />
          <button
            type="button"
            class="tk-variable-chip-name"
            aria-label={`${label} variable`}
            aria-haspopup="dialog"
            title={`${bound.name}: ${bound.value}`}
            onClick={(event) => setOpen(open ? null : event.currentTarget)}
          >
            {bound.name}
          </button>
          <button type="button" class="tk-icon-button" aria-label={`Detach ${lower} variable`} title="Detach variable" onClick={() => pick(null)}>
            <Icon name="detach" />
          </button>
          {changed && !rowReset && <ResetButton label={lower} onReset={() => marks.reset([property!], typeof part === "object" ? part : undefined)} />}
        </div>
      ) : (
        <TypingProvider value={typing}>{children}</TypingProvider>
      )}
      {offered && bound && exit.shown && (
        <Popover key={exit.key} label={`${label} variables`} anchor={exit.shown} leaving={exit.leaving} onClose={() => setOpen(null)}>
          <VariableList group={offered.group} bound={bound ?? null} onPick={pick} />
        </Popover>
      )}
    </div>
  );
}

/**
 * A color's picker, as in Figma: a Custom tab, with `top` (a fill's type and
 * gradient) over the editor layer's own picker, and a Variables tab listing
 * the project's color Variables when it has them (designer, 2026-11-05).
 * `label`: "Fill". Drawn while `anchor`, the control it is open from, is
 * there, and a moment after, as it leaves (`useExit`).
 */
export function ColorPicker(props: Omit<ColorPickerProps, "anchor" | "leaving"> & { anchor: HTMLElement | null }) {
  const exit = useExit(props.anchor);
  return exit.shown && <PickerPopover key={exit.key} {...props} anchor={exit.shown} leaving={exit.leaving} />;
}

interface ColorPickerProps {
  label: string;
  anchor: HTMLElement;
  leaving: boolean;
  /** The color as a Variable: none, no Variables tab. */
  slot?: Slot;
  top?: ComponentChildren;
  /** The picker; none, a fill of Mixed types say, only `top`. */
  custom?: ComponentChildren;
  onClose(): void;
}

function PickerPopover({ label, anchor, leaving, slot, top, custom, onClose }: ColorPickerProps) {
  const [tab, setTab] = useState<"custom" | "variables">(slot?.bound ? "variables" : "custom");
  const tabs = [
    { id: "custom", label: "Custom" },
    { id: "variables", label: "Variables" },
  ] as const;
  const tabbed = !!(custom && slot);
  const shown = tabbed ? tab : "custom";
  return (
    <Popover label={`${label} color`} anchor={anchor} leaving={leaving} onClose={onClose}>
      {tabbed && (
        <div class="tk-tabs" role="tablist" aria-label="Color">
          {tabs.map(({ id, label }) => (
            <button key={id} type="button" role="tab" class="tk-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div class="tk-tab-panel" role={tabbed ? "tabpanel" : undefined} aria-label={tabbed ? (shown === "custom" ? "Custom" : "Variables") : undefined}>
        {shown === "custom" ? (
          <>
            {top}
            {custom}
          </>
        ) : (
          <VariableList
            group="color"
            bound={slot!.bound}
            onPick={(entry) => {
              onClose();
              slot!.onPick(entry);
            }}
          />
        )}
      </div>
    </Popover>
  );
}

/**
 * What a field typed into needs to find its Variables as one types: given to
 * a number field by its VariableSlot, and to a color's hex by its color field.
 */
export interface Typing {
  group: VariableGroup;
  /** The selected layers it is typed for, as `Slot` tells them apart. */
  selection: string;
  /** What the text would draw as a value: null when it is not one (a name, say). */
  read(text: string): Drawn | null;
  /** Whether the text is part of a name rather than a value: "pri", not "12" or "3d6". */
  naming(text: string): boolean;
  onPick(entry: Resolved): void;
}

const TypingContext = createContext<Typing | null>(null);

/** Lets the field inside find its Variables as it is typed into. */
export const TypingProvider = TypingContext.Provider;

/** A length typed in, in px, to two decimals, as a number field reads it. */
function readLength(text: string): number | null {
  const n = parseFloat(text);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Text that starts as no number does: a name. */
function namesLength(text: string): boolean {
  return /^[^\d+\-.]/.test(text.trim());
}

/** Text with a letter no hex value has: a name. */
export function namesColor(text: string): boolean {
  return /[^\s#0-9a-f]/i.test(text);
}

/** What a field shows of the Variables as it is typed into: the keys it takes first, its input's attributes, and what follows the input. */
export interface Typeahead {
  /** Handles a key the list takes (↑, ↓, Enter, Esc while it is open); false for any other. */
  keyDown(event: TargetedKeyboardEvent<HTMLInputElement>): boolean;
  /** The text typed was applied as the value. */
  applied(text: string): void;
  input: Record<string, string | undefined>;
  after: ComponentChildren;
}

const NONE: Typeahead = { keyDown: () => false, applied: () => {}, input: {}, after: null };

/**
 * Finds Variables as a field is typed into, as in Figma, for a field inside a
 * TypingProvider. Focused, the field lists the group's Variables under it, the
 * closest to what it shows, or what is typed, first, to pick with a click: no
 * button beside it to open them (designer, 2026-11-05). Text that is part of
 * a name lists those that have it, to choose with ↑ / ↓ and pick with Enter
 * (Esc puts back the value); with a value typed, ↑ / ↓ and Enter are the
 * field's. A value close to one of them (see `NEAR`) shows its name quietly at
 * the end of the field, to pick with a click. None of it takes the focus or
 * stops the typing. `text`: what is typed and not yet applied; `value`: what
 * the field shows; `reset` drops what is typed.
 */
export function useTypeahead({ text, value, focused, input, reset }: {
  text: string | null;
  value: string;
  focused: boolean;
  input: RefObject<HTMLInputElement | null>;
  reset(): void;
}): Typeahead {
  const typing = useContext(TypingContext);
  const catalog = useCatalog();
  const id = useId();
  /** The option chosen with the arrows, for the text it was chosen in: other text starts again at the first. */
  const [chosen, setChosen] = useState({ text, index: 0 });
  /** The value last typed in and applied, and for which layers: its hint stays while the field shows it for them, to be clicked. */
  const [typed, setTyped] = useState<{ drawn: Drawn; selection: string } | null>(null);
  /** The list closed with Esc, for the text it was closed on: it opens again as more is typed, or the field is focused again. */
  const [closed, setClosed] = useState<{ text: string | null } | null>(null);
  useEffect(() => {
    if (!focused) setClosed(null);
  }, [focused]);
  if (!typing || !catalog) return NONE;

  const { group, selection, read, naming, onPick } = typing;
  const byName = text !== null && naming(text);
  const options = closed?.text === text ? [] : byName ? catalog.named(group, text) : focused ? catalog.closest(group, read(text ?? value)) : [];
  const open = options.length > 0;
  // Only a name typed has an option the keys are on.
  const active = !byName ? -1 : chosen.text === text ? Math.min(chosen.index, options.length - 1) : 0;
  const shown = read(value);
  const kept = typed?.selection === selection && shown !== null && equal(typed.drawn, shown) ? typed.drawn : null;
  const drawn = text !== null ? read(text) : kept;
  const near = drawn !== null ? catalog.near(group, drawn) : null;

  const pick = (entry: Resolved) => {
    reset();
    setTyped(null);
    onPick(entry);
  };
  const optionId = (index: number) => `${id}-${index}`;

  return {
    keyDown(event) {
      if (!open || !byName) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const by = event.key === "ArrowDown" ? 1 : -1;
        setChosen({ text, index: (active + by + options.length) % options.length });
      } else if (event.key === "Enter") pick(options[active]);
      else if (event.key === "Escape") {
        reset();
        setClosed({ text: null });
      }
      else return false;
      event.preventDefault();
      // Esc closes the list and keeps the field, and the selection.
      event.stopPropagation();
      return true;
    },
    applied(applied) {
      const drawn = read(applied);
      setTyped(drawn === null ? null : { drawn, selection });
    },
    input: open ? { "aria-autocomplete": "list", "aria-controls": id, "aria-activedescendant": active >= 0 ? optionId(active) : undefined } : {},
    after: (
      <>
        {near && (
          <button
            type="button"
            class="tk-variable-hint"
            aria-label={`Use variable ${near.variable.name}`}
            title={`Close to ${near.variable.name} (${valueText(near.drawn)}): use it`}
            // A press keeps the field typed into: what is typed is not applied on the way.
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => pick(near)}
          >
            {near.variable.name}
          </button>
        )}
        {open && input.current && (
          <Matches id={id} anchor={input.current} options={options} active={active} optionId={optionId} onChoose={(index) => byName && setChosen({ text, index })} onPick={pick} />
        )}
      </>
    ),
  };
}

/** The Variables whose names have what is typed, in a list under the field. */
function Matches({ id, anchor, options, active, optionId, onChoose, onPick }: {
  id: string;
  anchor: HTMLInputElement;
  options: Resolved[];
  active: number;
  optionId(index: number): string;
  onChoose(index: number): void;
  onPick(entry: Resolved): void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const at = (anchor.closest(".tk-field") ?? anchor).getBoundingClientRect();
    const width = Math.max(at.width, MATCHES_WIDTH);
    const height = list.current!.offsetHeight;
    const below = at.bottom + 4;
    setPlace({
      left: Math.max(GAP, Math.min(at.left, window.innerWidth - width - GAP)),
      top: below + height + GAP <= window.innerHeight ? below : Math.max(GAP, at.top - 4 - height),
      width,
    });
  }, [anchor, options.length]);
  useEffect(() => {
    list.current?.querySelector(`[id="${optionId(active)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      ref={list}
      id={id}
      class="tk-matches"
      role="listbox"
      aria-label="Matching variables"
      style={{ width: `${place?.width ?? MATCHES_WIDTH}px`, left: `${place?.left ?? 0}px`, top: `${place?.top ?? 0}px`, visibility: place ? "visible" : "hidden" }}
    >
      {options.map((entry, index) => (
        <Option
          key={`${entry.variable.from} ${entry.variable.name}`}
          as="div"
          id={optionId(index)}
          entry={entry}
          selected={index === active}
          onChoose={() => onChoose(index)}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

const MATCHES_WIDTH = 200;
