/** @jsxImportSource preact */
import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Variable, VariableGroup } from "../service-protocol";
import { writeShadows, type Shadow } from "./effects";
import { Icon } from "./icons";
import { cssColor, type Color } from "./paint";
import { sameVariable, type Catalog, type Drawn, type Resolved } from "./variables";

const CatalogContext = createContext<Catalog | null>(null);

/** The project's Variables, for the Design panel; null while there are none. */
export const CatalogProvider = CatalogContext.Provider;

export function useCatalog(): Catalog | null {
  return useContext(CatalogContext);
}

/** What the Design panel needs of a part of a value that can be a Variable. */
export interface Slot {
  group: VariableGroup;
  /** The Variable the designer picked for it, shared by the selected layers; null when none. */
  bound: Variable | null;
  /** Picks a Variable for it; null detaches it, keeping the value. */
  onPick(entry: Resolved | null): void;
}

const POPOVER_WIDTH = 240;
const GAP = 8;

/**
 * A panel over the Design panel, beside it as in Figma, for the control
 * `anchor`: it closes on Esc, or on a press outside it, giving focus back.
 */
function Popover({ label, anchor, onClose, children }: { label: string; anchor: HTMLElement; onClose(): void; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const at = anchor.getBoundingClientRect();
    const height = box.current!.offsetHeight;
    const left = at.left - POPOVER_WIDTH - GAP >= GAP ? at.left - POPOVER_WIDTH - GAP : Math.max(GAP, at.right - POPOVER_WIDTH);
    setPlace({ left, top: Math.max(GAP, Math.min(at.top, window.innerHeight - height - GAP)) });
  }, [anchor]);
  useEffect(() => {
    const root = anchor.getRootNode() as Document | ShadowRoot;
    const away = (event: Event) => {
      const path = event.composedPath();
      if (!path.includes(box.current!) && !path.includes(anchor)) onClose();
    };
    // On the document: a press on the page or canvas; on the shadow root: one elsewhere in the editor layer.
    document.addEventListener("pointerdown", away, true);
    if (root !== document) root.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      if (root !== document) root.removeEventListener("pointerdown", away, true);
    };
  }, [anchor, onClose]);
  const close = () => {
    onClose();
    anchor.focus();
  };
  return (
    <div
      ref={box}
      class="vk-popover"
      role="dialog"
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
      <div class="vk-popover-header">
        <h3 class="vk-section-title">{label}</h3>
        <button type="button" class="vk-icon-button" aria-label="Close" onClick={close}>
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
function Preview({ drawn }: { drawn: Drawn }) {
  if (typeof drawn === "number") return null;
  if (Array.isArray(drawn)) {
    return <span class="vk-variable-preview is-shadow" style={{ boxShadow: writeShadows(drawn as Shadow[])["box-shadow"] }} aria-hidden="true" />;
  }
  return <span class="vk-variable-preview" style={{ "--vk-swatch": cssColor(drawn as Color) }} aria-hidden="true" />;
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
 * The Variables of a group, under their headings, the project's own first,
 * found by name as one types. The one picked shows as selected.
 */
export function VariableList({ group, bound, onPick }: { group: VariableGroup; bound: Variable | null; onPick(entry: Resolved): void }) {
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => search.current?.focus(), []);
  const found = (catalog?.of(group) ?? []).filter(({ variable }) => variable.name.toLowerCase().includes(query.trim().toLowerCase()));
  const headings = [...new Set(found.map(({ variable }) => headingOf(variable)))];
  return (
    <>
      <input
        ref={search}
        type="search"
        class="vk-input vk-variable-search"
        aria-label="Search variables"
        placeholder="Search"
        spellcheck={false}
        autocomplete="off"
        value={query}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <div class="vk-variable-list" role="listbox" aria-label="Variables">
        {!found.length && <p class="vk-layer-note">No variables match.</p>}
        {headings.map((heading) => (
          <div key={heading} role="group" aria-label={heading}>
            <h4 class="vk-section-title vk-subtitle">{heading}</h4>
            {found
              .filter(({ variable }) => headingOf(variable) === heading)
              .map((entry) => {
                const { variable, drawn } = entry;
                const selected = sameVariable(bound, variable);
                return (
                  <button
                    key={`${variable.from} ${variable.name}`}
                    type="button"
                    role="option"
                    class="vk-variable-option"
                    aria-selected={selected}
                    aria-label={variable.name}
                    title={`${variable.name}: ${variable.value}`}
                    onClick={() => onPick(entry)}
                  >
                    <Preview drawn={drawn} />
                    <span class="vk-variable-name">{variable.name}</span>
                    <span class="vk-variable-value">{valueText(drawn)}</span>
                  </button>
                );
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
 * the field, and beside it a button that lists the group's Variables. With no
 * Variables in the group, the field alone.
 */
export function VariableSlot({ label, slot, children }: { label: string; slot: Slot | undefined; children: ComponentChildren }) {
  const catalog = useCatalog();
  const [open, setOpen] = useState<HTMLElement | null>(null);
  if (!slot || !catalog?.of(slot.group).length) return <>{children}</>;
  const { group, bound, onPick } = slot;
  const pick = (entry: Resolved | null) => {
    setOpen(null);
    onPick(entry);
  };
  const lower = label.toLowerCase();
  return (
    <div class="vk-variable-slot">
      {bound ? (
        <div class="vk-field vk-variable-chip">
          <Icon name="variable" />
          <button
            type="button"
            class="vk-variable-chip-name"
            aria-label={`${label} variable`}
            aria-haspopup="dialog"
            title={`${bound.name}: ${bound.value}`}
            onClick={(event) => setOpen(open ? null : event.currentTarget)}
          >
            {bound.name}
          </button>
          <button type="button" class="vk-icon-button" aria-label={`Detach ${lower} variable`} title="Detach variable" onClick={() => pick(null)}>
            <Icon name="detach" />
          </button>
        </div>
      ) : (
        <>
          {children}
          <button
            type="button"
            class="vk-icon-button vk-variable-button"
            aria-label={`${label} variables`}
            aria-haspopup="dialog"
            title="Apply variable"
            onClick={(event) => setOpen(open ? null : event.currentTarget)}
          >
            <Icon name="variable" />
          </button>
        </>
      )}
      {open && (
        <Popover label={`${label} variables`} anchor={open} onClose={() => setOpen(null)}>
          <VariableList group={group} bound={bound} onPick={pick} />
        </Popover>
      )}
    </div>
  );
}

/**
 * A color's picker, as in Figma: a Custom tab with the system's color picker,
 * and a Variables tab listing the project's color Variables. `label`: "Fill".
 */
export function ColorPicker({ label, anchor, slot, custom, onClose }: {
  label: string;
  anchor: HTMLElement;
  slot: Slot;
  /** The Custom tab: the system's color picker. */
  custom: ComponentChildren;
  onClose(): void;
}) {
  const [tab, setTab] = useState<"custom" | "variables">(slot.bound ? "variables" : "custom");
  const tabs = [
    { id: "custom", label: "Custom" },
    { id: "variables", label: "Variables" },
  ] as const;
  return (
    <Popover label={`${label} color`} anchor={anchor} onClose={onClose}>
      <div class="vk-tabs" role="tablist" aria-label="Color">
        {tabs.map(({ id, label }) => (
          <button key={id} type="button" role="tab" class="vk-tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab === "custom" ? "Custom" : "Variables"}>
        {tab === "custom" ? (
          custom
        ) : (
          <VariableList
            group="color"
            bound={slot.bound}
            onPick={(entry) => {
              onClose();
              slot.onPick(entry);
            }}
          />
        )}
      </div>
    </Popover>
  );
}
