/** @jsxImportSource preact */
import { useState } from "preact/hooks";
import type { VariableGroup } from "../service-protocol";
import type { Shadow } from "./effects";
import { Icon } from "./icons";
import { cssColor, type Color } from "./paint";
import { Select } from "./Select";
import type { Catalog, Resolved } from "./variables";

interface Props {
  /** The project's Variables, as the canvas draws them; null until they are in. */
  catalog: Catalog | null;
  /** What a Variable picked here would be set on, for its hint: the groups the selected layers take one of. */
  takes: Partial<Record<VariableGroup, string>>;
  /** Those of the groups the selected layers have now: marked in use. */
  inUse: Resolved["variable"][];
  /** Sets the Variable on the selected layers, where they take one of its group (`takes`). */
  onApply(entry: Resolved): void;
}

type Source = "all" | "own" | "tailwind";

/** The groups as the Variants tab lists them, in the Design panel's order. */
const GROUPS: { group: VariableGroup; title: string }[] = [
  { group: "color", title: "Color" },
  { group: "spacing", title: "Spacing" },
  { group: "radius", title: "Radius" },
  { group: "fontSize", title: "Font size" },
  { group: "shadow", title: "Shadow" },
];

/** A ramp's steps, as Tailwind names them: a color named so (`brand-500`) is a step of one. */
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const STEP_OF = /^(.+)-(50|[1-9]00|950)$/;

/** The largest a font size's sample is drawn: larger ones are told by their numbers. */
const SAMPLE_MAX = 32;

/**
 * The Design panel's other tab (designer, 2026-11-07): the project's
 * Variables, by group, the project's own first, then Tailwind's; colors as a
 * palette, a ramp a row, the others with what they look like. Found by name;
 * pointed at, one tells its name and value; clicked, it is set on the selected
 * layers that take one of its group, as the Design tab's Variables are.
 */
export function VariantsPanel({ catalog, takes, inUse, onApply }: Props) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [closed, setClosed] = useState<ReadonlySet<VariableGroup>>(new Set());
  const [pointed, setPointed] = useState<{ entry: Resolved; at: DOMRect } | null>(null);

  if (!catalog) return <p class="tk-panel-empty">Loading the project's Variables…</p>;
  const text = search.trim().toLowerCase();
  const listed = (group: VariableGroup) =>
    catalog
      .of(group)
      .filter(({ variable }) => (source === "all" || (source === "own") === variable.own) && (!text || variable.name.toLowerCase().includes(text)));
  const groups = GROUPS.map((g) => ({ ...g, entries: listed(g.group) })).filter((g) => g.entries.length);
  const used = (entry: Resolved) => inUse.some((v) => v.name === entry.variable.name && v.group === entry.variable.group && v.from === entry.variable.from);

  /** A Variable's own button: pointed at or focused, it tells its name; clicked, it is set. */
  const item = (entry: Resolved, cls: string, children?: preact.ComponentChildren, style?: Record<string, string>) => {
    const can = !!takes[entry.variable.group];
    const show = (event: Event) => setPointed({ entry, at: (event.currentTarget as Element).getBoundingClientRect() });
    return (
      <button
        key={entry.variable.name}
        type="button"
        class={`${cls}${used(entry) ? " is-in-use" : ""}`}
        style={style}
        aria-label={`${entry.variable.name}, ${valueOf(entry)}`}
        aria-disabled={!can || undefined}
        onPointerEnter={show}
        onPointerLeave={() => setPointed(null)}
        onFocus={show}
        onBlur={() => setPointed(null)}
        onClick={() => can && onApply(entry)}
      >
        {children}
      </button>
    );
  };

  return (
    <div class="tk-variants">
      <div class="tk-row">
        <label class="tk-field">
          <Icon name="search" />
          <input class="tk-input" type="search" placeholder="Search variables" aria-label="Search variables" value={search} onInput={(event) => setSearch(event.currentTarget.value)} />
        </label>
        <Select class="tk-select tk-variants-source" aria-label="Variables shown" value={source} onChange={(event) => setSource(event.currentTarget.value as Source)}>
          <option value="all">All</option>
          <option value="own">Project</option>
          <option value="tailwind">Tailwind</option>
        </Select>
      </div>
      {!groups.length && <p class="tk-panel-empty">{text ? `No Variable is named “${search.trim()}”.` : "The project has no Variables to show."}</p>}
      {groups.map(({ group, title, entries }) => {
        const open = !closed.has(group);
        const toggle = () => {
          const next = new Set(closed);
          if (!next.delete(group)) next.add(group);
          setClosed(next);
        };
        const own = entries.filter((e) => e.variable.own);
        const theirs = entries.filter((e) => !e.variable.own);
        return (
          <section key={group} class="tk-section" aria-label={title}>
            <div class="tk-section-header">
              <h3 class="tk-section-title">
                {title}
                <span class="tk-variants-count">{entries.length}</span>
              </h3>
              <button type="button" class="tk-icon-button" aria-label={`${open ? "Fold" : "Unfold"} ${title}`} aria-expanded={open} onClick={toggle}>
                <Icon name="chevron-down" />
              </button>
            </div>
            {open &&
              [
                ["Project", own],
                ["Tailwind", theirs],
              ].map(([label, list]) =>
                (list as Resolved[]).length ? (
                  <div key={label as string} class="tk-variants-part">
                    <p class="tk-variants-subtitle">{label as string}</p>
                    {view(group, list as Resolved[], item)}
                  </div>
                ) : null,
              )}
          </section>
        );
      })}
      {pointed && <Tip entry={pointed.entry} at={pointed.at} hint={takes[pointed.entry.variable.group]} inUse={used(pointed.entry)} />}
    </div>
  );
}

type Item = (entry: Resolved, cls: string, children?: preact.ComponentChildren, style?: Record<string, string>) => preact.JSX.Element;

/** A group's Variables, each drawn as what it is. */
function view(group: VariableGroup, entries: Resolved[], item: Item) {
  switch (group) {
    case "color":
      return <Palette entries={entries} item={item} />;
    case "spacing": {
      // A length's bar, as long as it is next to the longest of the list: the longest fills the row between name and value.
      const longest = Math.max(...entries.map((entry) => entry.drawn as number), 1);
      return entries.map((entry) => (
        <div key={entry.variable.name} class="tk-variants-row">
          <span class="tk-variants-name">{entry.variable.name}</span>
          <span class="tk-variants-track">
            <span class="tk-variants-bar" style={{ width: `max(1px, ${((entry.drawn as number) / longest) * 100}%)` }} />
          </span>
          <span class="tk-variants-value">{valueOf(entry)}</span>
        </div>
      ));
    }
    case "radius":
      return (
        <div class="tk-variants-tiles is-four">
          {entries.map((entry) =>
            item(
              entry,
              "tk-variants-tile",
              <>
                <span class="tk-variants-radius" style={{ borderTopLeftRadius: `${Math.min(entry.drawn as number, 40)}px` }} />
                <span class="tk-variants-label">
                  <span>{entry.variable.name}</span>
                  <span class="tk-variants-value">{px(entry.drawn as number)}</span>
                </span>
              </>,
            ),
          )}
        </div>
      );
    case "fontSize":
      return entries.map((entry) =>
        item(
          entry,
          "tk-variants-row is-button",
          <>
            <span class="tk-variants-sample" style={{ fontSize: `${Math.min(entry.drawn as number, SAMPLE_MAX)}px` }}>
              Aa
            </span>
            <span class="tk-variants-name">{entry.variable.name}</span>
            <span class="tk-variants-value">{valueOf(entry)}</span>
          </>,
        ),
      );
    case "shadow":
      return (
        <div class="tk-variants-tiles is-three">
          {entries.map((entry) =>
            item(
              entry,
              "tk-variants-tile",
              <>
                <span class="tk-variants-shadow" style={{ boxShadow: shadowCss(entry.drawn as Shadow[]) }} />
                <span class="tk-variants-label is-center">{entry.variable.name}</span>
              </>,
            ),
          )}
        </div>
      );
  }
}

/**
 * Colors as the rows of a palette: a ramp (`brand-50` … `brand-950`) a row,
 * each step in its column; the colors of no ramp after them, "other", on the
 * same columns. Empty columns are undefined.
 */
export function paletteRows(entries: Resolved[]): [string, (Resolved | undefined)[]][] {
  const ramps = new Map<string, (Resolved | undefined)[]>();
  const others: Resolved[] = [];
  for (const entry of entries) {
    const step = STEP_OF.exec(entry.variable.name.replace(/^--(color-)?/, ""));
    if (!step) {
      others.push(entry);
      continue;
    }
    const row = ramps.get(step[1]) ?? Array<Resolved | undefined>(STEPS.length).fill(undefined);
    row[STEPS.indexOf(step[2])] = entry;
    ramps.set(step[1], row);
  }
  const rows: [string, (Resolved | undefined)[]][] = [...ramps];
  for (let i = 0; i < others.length; i += STEPS.length) {
    const part: (Resolved | undefined)[] = others.slice(i, i + STEPS.length);
    rows.push(["other", [...part, ...Array<undefined>(STEPS.length - part.length).fill(undefined)]]);
  }
  return rows;
}

/**
 * Colors as a palette: a ramp (`brand-50` … `brand-950`) a row, under its
 * name, each step in its column; the colors of no ramp in a row of their own
 * at the end, on the same columns, named when pointed at.
 */
function Palette({ entries, item }: { entries: Resolved[]; item: Item }) {
  const swatch = (entry: Resolved | undefined, i: number) =>
    entry ? item(entry, "tk-variants-swatch", undefined, { "--tk-swatch": cssColor(entry.drawn as Color) }) : <span key={`empty ${i}`} class="tk-variants-empty" />;
  return (
    <div class="tk-variants-palette">
      {paletteRows(entries).map(([name, steps], r) => (
        <div key={`${name} ${r}`} class="tk-variants-ramp">
          <span class="tk-variants-ramp-name">{name}</span>
          {steps.map(swatch)}
        </div>
      ))}
    </div>
  );
}

/** Over the Variable pointed at: its name and value, and what clicking it does. */
function Tip({ entry, at, hint, inUse }: { entry: Resolved; at: DOMRect; hint: string | undefined; inUse: boolean }) {
  return (
    <div class="tk-variants-tip" role="tooltip" style={{ left: `${at.left + at.width / 2}px`, top: `${at.top - 4}px` }}>
      <span>
        <span class="tk-variants-tip-name">{entry.variable.name}</span> <span class="tk-variants-tip-value">{valueOf(entry)}</span>
      </span>
      {inUse ? <span class="tk-variants-tip-hint">In use</span> : hint && <span class="tk-variants-tip-hint">Click to set the {hint}</span>}
    </div>
  );
}

/** A Variable's value as the panel tells it: a color as hex, a length in px, a font size with nothing more. */
function valueOf({ variable, drawn }: Resolved): string {
  if (variable.group === "color") {
    const { color, opacity } = drawn as Color;
    return opacity < 1 ? `${color.toUpperCase()} ${Math.round(opacity * 100)}%` : color.toUpperCase();
  }
  if (variable.group === "shadow") return variable.value;
  return px(drawn as number);
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

function shadowCss(shadows: Shadow[]): string {
  return shadows.map((s) => `${s.type === "inner" ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${cssColor(s)}`).join(", ");
}
