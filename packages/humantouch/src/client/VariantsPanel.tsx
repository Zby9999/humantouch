/** @jsxImportSource preact */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
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

/** Tailwind's steps: a ramp on these only shares their 11 columns. */
const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
/** A color named so (`brand-500`, `gray-1`) is a step of a ramp, numbered. */
const STEP_NUMBER = /^(.+)-(\d+)$/;

/** The largest a font size's sample is drawn: larger ones are told by their numbers. */
const SAMPLE_MAX = 32;

/**
 * The Design panel's other tab (designer, 2026-11-07): the project's
 * Variables, by group, the project's own first, then Tailwind's, showing the
 * project's own alone at first, or Tailwind's where it has none (designer,
 * 2026-11-09); colors as a palette, a ramp a row, the others with what they look like. Found by name;
 * pointed at, one tells its name and value; clicked, it is set on the selected
 * layers that take one of its group, as the Design tab's Variables are. A
 * radius tile has its name over its value (designer, 2026-11-08): pointed at,
 * it tells them only when its name is cut short, as nothing on screen repeats.
 * No tip repeats what is on screen (designer, 2026-11-08): a font size's row
 * has its name and value, so it tells nothing; a color's swatch has neither,
 * so it tells both. A shadow, pointed at with a mouse, shows its layers in a
 * panel at the Design panel's left, each value named (`ShadowDetails`).
 */
export function VariantsPanel({ catalog, takes, inUse, onApply }: Props) {
  const [search, setSearch] = useState("");
  /** Chosen in its select; till then, the project's own, or Tailwind's where it has none (designer, 2026-11-09). */
  const [chosen, setChosen] = useState<Source | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<VariableGroup>>(new Set());
  const [pointed, setPointed] = useState<{ entry: Resolved; at: DOMRect } | null>(null);
  const [detailed, setDetailed] = useState<{ entry: Resolved; at: DOMRect; panel: DOMRect } | null>(null);

  if (!catalog) return <p class="tk-panel-empty">Loading the project's Variables…</p>;
  const source = chosen ?? (GROUPS.some(({ group }) => catalog.of(group).some(({ variable }) => variable.own)) ? "own" : "tailwind");
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
    const show = (event: Event) => {
      const button = event.currentTarget as Element;
      const { group } = entry.variable;
      // A font size's row has its name and value on it: pointed at, it tells nothing more (designer, 2026-11-08).
      if (group === "fontSize") return;
      if (group === "shadow") {
        // A shadow's layers, in a panel over the canvas; on a mouse's pointing only, as a spacing bar's whole length (designer, 2026-11-08).
        if (!(event instanceof PointerEvent) || event.pointerType !== "mouse") return;
        const panel = (button.closest(".tk-panel") ?? button).getBoundingClientRect();
        setDetailed({ entry, at: button.getBoundingClientRect(), panel });
        return;
      }
      // A tile that shows its name whole tells nothing more pointed at (designer, 2026-11-08).
      const name = button.querySelector(".tk-variants-tile-name");
      if (name && name.scrollWidth <= name.clientWidth) return;
      setPointed({ entry, at: button.getBoundingClientRect() });
    };
    const hide = () => {
      setPointed(null);
      setDetailed(null);
    };
    return (
      <button
        key={entry.variable.name}
        type="button"
        class={`${cls}${used(entry) ? " is-in-use" : ""}`}
        style={style}
        aria-label={`${entry.variable.name}, ${valueOf(entry)}`}
        aria-disabled={!can || undefined}
        onPointerEnter={show}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
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
        <Select class="tk-select tk-variants-source" aria-label="Variables shown" value={source} onChange={(event) => setChosen(event.currentTarget.value as Source)}>
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
      {detailed && <ShadowDetails entry={detailed.entry} at={detailed.at} panel={detailed.panel} />}
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
    case "spacing":
      return <Lengths entries={entries} />;
    case "radius":
      return (
        <div class="tk-variants-tiles is-four">
          {entries.map((entry) =>
            item(
              entry,
              "tk-variants-tile",
              <>
                <span class="tk-variants-radius" style={{ borderTopLeftRadius: `${Math.min(entry.drawn as number, 40)}px` }} />
                <span class="tk-variants-label is-stacked">
                  <span class="tk-variants-tile-name">{entry.variable.name}</span>
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
 * Lengths as bars, each as long as it is: 1px of bar a px (designer,
 * 2026-11-08). One longer than the room between its name and value runs on
 * behind the value and shows past it, up to the panel's inner edge; pointed
 * at with a mouse, it shows whole in a box over the canvas. Pointed at, the
 * others show nothing more: their name and value are on the row.
 */
function Lengths({ entries }: { entries: Resolved[] }) {
  const [whole, setWhole] = useState<{ length: number; at: DOMRect } | null>(null);
  return (
    <>
      {entries.map((entry) => {
        const length = entry.drawn as number;
        const show = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          const row = event.currentTarget as HTMLElement;
          const track = row.querySelector(".tk-variants-track")!;
          // Measured as the CSS draws it, to the fraction of a px: a bar shown past its value shows whole.
          if (length > track.getBoundingClientRect().width) setWhole({ length, at: row.getBoundingClientRect() });
        };
        return (
          <div key={entry.variable.name} class="tk-variants-row is-length" onPointerEnter={show} onPointerLeave={() => setWhole(null)}>
            <span class="tk-variants-name">{entry.variable.name}</span>
            <span class="tk-variants-track">
              <span class="tk-variants-bar" style={{ "--tk-length": `${length}px` }} />
            </span>
            <span class="tk-variants-value">{valueOf(entry)}</span>
          </div>
        );
      })}
      {whole && <WholeLength length={whole.length} at={whole.at} />}
    </>
  );
}

/** How far the whole bar's box keeps from its row, and from the window's left. */
const ABOVE = 4;
const GAP = 8;

/** A bar too long for its row, whole: above the row, ending at its right, out over the canvas; cut only by the window. */
function WholeLength({ length, at }: { length: number; at: DOMRect }) {
  return (
    <div class="tk-variants-whole" aria-hidden="true" style={{ right: `${window.innerWidth - at.right}px`, top: `${at.top - ABOVE}px`, maxWidth: `${at.right - GAP}px` }}>
      <span class="tk-variants-bar" style={{ width: `${length}px` }} />
    </div>
  );
}

/** At least this many colors a prefix numbers (`brand-1`, `brand-2`, `brand-3`) make a ramp; fewer are named colors (designer, 2026-11-08). */
const RAMP_MIN = 3;
/**
 * The most steps a palette line holds: past them a ramp goes on in a line
 * under its first, the steps shared evenly (designer, 2026-11-08). In the
 * Design panel's 320px, 16 steps are still 12px wide each.
 */
const LINE_MAX = 16;

/** Ramps on the same steps: a row each, each step in its column; undefined where a ramp has no color for it. */
export interface Scale {
  steps: string[];
  ramps: [string, (Resolved | undefined)[]][];
}

/**
 * A group's colors as a palette (designer, 2026-11-08): the ramps, by scale,
 * then the named colors, in groups by the first word of their name, in the
 * order the project defines them. A prefix with a numbered suffix and
 * `RAMP_MIN` colors or more is a ramp (`brand-50`, `gray-1`, `blue-10`,
 * `gray-1000`). Ramps on Tailwind's steps share its 11 columns, as before;
 * the others share columns, sorted by number, with the ramps mostly on their
 * steps, and are not put on Tailwind's. A name a prefix numbers too few times
 * (a lone `accent-500`), or with a word for a suffix (`brand-hover`), is
 * named: its name tells what it is.
 */
export function palette(entries: Resolved[]): { scales: Scale[]; named: Resolved[][] } {
  const numbered = new Map<string, [string, Resolved][]>();
  for (const entry of entries) {
    const step = STEP_NUMBER.exec(bare(entry));
    if (!step) continue;
    // A step named twice (`--gray-1`, `--color-gray-1`; `gray-01`, `gray-1`): the second is named, not lost.
    const steps = numbered.get(step[1]) ?? [];
    const number = `${Number(step[2])}`;
    if (!steps.some(([s]) => s === number)) numbered.set(step[1], [...steps, [number, entry]]);
  }
  const inRamp = new Set<Resolved>();
  const scales: { steps: Set<string>; tailwind: boolean; ramps: [string, [string, Resolved][]][] }[] = [];
  for (const [name, colors] of numbered) {
    if (colors.length < RAMP_MIN) continue;
    for (const [, entry] of colors) inRamp.add(entry);
    const steps = new Set(colors.map(([step]) => step));
    const tailwind = [...steps].every((step) => STEPS.includes(step));
    // A scale of its own shares columns with one mostly on its steps: Radix's 1–12 with a 1–11, not with a 10–90.
    const into = scales.find((scale) =>
      tailwind ? scale.tailwind : !scale.tailwind && [...steps].filter((step) => scale.steps.has(step)).length * 2 >= Math.min(steps.size, scale.steps.size),
    );
    if (into) {
      for (const step of steps) into.steps.add(step);
      into.ramps.push([name, colors]);
    } else scales.push({ steps: tailwind ? new Set(STEPS) : steps, tailwind, ramps: [[name, colors]] });
  }
  const rampNames = scales.flatMap(({ ramps }) => ramps.map(([name]) => name)).sort((a, b) => b.length - a.length);
  const named = new Map<string, Resolved[]>();
  for (const entry of entries) {
    if (inRamp.has(entry)) continue;
    // A ramp's state (`blue-gray-hover`) under the ramp's name, the others under the first word of theirs.
    const name = bare(entry);
    const word = rampNames.find((ramp) => name.startsWith(`${ramp}-`)) ?? name.split("-")[0];
    named.set(word, [...(named.get(word) ?? []), entry]);
  }
  return {
    scales: scales.map(({ steps, tailwind, ramps }) => {
      const order = tailwind ? STEPS : [...steps].sort((a, b) => Number(a) - Number(b));
      return { steps: order, ramps: ramps.map(([name, colors]) => [name, order.map((step) => colors.find(([s]) => s === step)?.[1])]) };
    }),
    named: [...named.values()],
  };
}

/** A color's name without what CSS adds to it: `--color-brand-500` as `brand-500`. */
const bare = (entry: Resolved) => entry.variable.name.replace(/^--(color-)?/, "");

/** A scale's ramps as palette lines, a ramp of more than `LINE_MAX` steps in more than one; a ramp's lines after its first are unnamed. */
export function paletteLines({ steps, ramps }: Scale): [string, (Resolved | undefined)[]][] {
  const lines = Math.ceil(steps.length / LINE_MAX);
  const width = Math.ceil(steps.length / lines);
  return ramps.flatMap(([name, cells]) =>
    Array.from({ length: lines }, (_, i): [string, (Resolved | undefined)[]] => [i ? "" : name, cells.slice(i * width, (i + 1) * width)]),
  );
}

/**
 * Colors as a palette: a ramp a row, under its name, each step in its
 * column; ramps on other steps than Tailwind's in rows of their own columns.
 * Then the named colors (designer, 2026-11-08), under "Named": each its
 * swatch and its name, two a row; the names sharing a first word (`primary`,
 * `primary-foreground`) together, from a row's start, the next after them on
 * a row of its own; a word's only color pairs with the next such. A ramp's
 * state (`brand-hover`) is named too, not after the ramp's row: there it
 * would break the ramps' columns, and its name, starting with the ramp's,
 * tells whose it is.
 */
function Palette({ entries, item }: { entries: Resolved[]; item: Item }) {
  const { scales, named } = palette(entries);
  const swatch = (entry: Resolved | undefined, i: number) =>
    entry ? item(entry, "tk-variants-swatch", undefined, { "--tk-swatch": cssColor(entry.drawn as Color) }) : <span key={`empty ${i}`} class="tk-variants-empty" />;
  return (
    <div class="tk-variants-palette">
      {scales.flatMap((scale, s) =>
        paletteLines(scale).map(([name, steps], r) => (
          <div key={`${s} ${r}`} class="tk-variants-ramp" style={{ "--tk-steps": `${steps.length}` }}>
            <span class="tk-variants-ramp-name">{name}</span>
            {steps.map(swatch)}
          </div>
        )),
      )}
      {named.length > 0 && (
        <div class="tk-variants-named" role="group" aria-label="Named">
          {scales.length > 0 && <p class="tk-variants-named-title">Named</p>}
          <div class="tk-variants-names">
            {named.flatMap((group, g) =>
              group.map((entry, i) =>
                item(
                  entry,
                  // A group starts a row; so does the color after one.
                  `tk-variants-named-item${!i && (group.length > 1 || named[g - 1]?.length > 1) ? " is-start" : ""}`,
                  <>
                    <span class="tk-variants-named-swatch" style={{ "--tk-swatch": cssColor(entry.drawn as Color) }} />
                    <span class="tk-variants-named-name">{bare(entry)}</span>
                  </>,
                ),
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Over the Variable pointed at: its name and value, and what clicking it does. The color picker's palette shows it too (designer, 2026-11-08). */
export function Tip({ entry, at, hint, inUse }: { entry: Resolved; at: DOMRect; hint: string | undefined; inUse: boolean }) {
  return (
    <div class="tk-variants-tip" role="tooltip" style={{ left: `${at.left + at.width / 2}px`, top: `${at.top - 4}px` }}>
      <span>
        <span class="tk-variants-tip-name">{entry.variable.name}</span> <span class="tk-variants-tip-value">{valueOf(entry)}</span>
      </span>
      {inUse ? <span class="tk-variants-tip-hint">In use</span> : hint && <span class="tk-variants-tip-hint">Click to set the {hint}</span>}
    </div>
  );
}

/** How far the shadow's panel keeps from the Design panel, and from the window's top and bottom. */
const BESIDE = 8;

/**
 * A shadow Variable's layers, read-only, in a white panel at the Design
 * panel's left, over the canvas, level with its tile (designer, 2026-11-08:
 * its CSS in one line was hard to read). Its name, then each shadow as the
 * Effects section has it: numbered, its type, X, Y, Blur and Spread, and its
 * color as a swatch, hex and opacity. Effects' + shows it too, at its Variables' panel's left (designer, 2026-11-08).
 */
export function ShadowDetails({ entry, at, panel }: { entry: Resolved; at: DOMRect; panel: DOMRect }) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(at.top);
  // Whole in the window: one taller than the room under its tile rises.
  useLayoutEffect(() => {
    const height = box.current!.getBoundingClientRect().height;
    setTop(Math.max(BESIDE, Math.min(at.top, window.innerHeight - height - BESIDE)));
  }, [entry, at]);
  const number = (n: number) => `${Math.round(n * 100) / 100}`;
  return (
    <div ref={box} class="tk-variants-details" aria-hidden="true" style={{ right: `${window.innerWidth - panel.left + BESIDE}px`, top: `${top}px` }}>
      <span class="tk-variants-details-name">{entry.variable.name}</span>
      {(entry.drawn as Shadow[]).map((s, i) => (
        <div key={i} class="tk-variants-details-layer">
          <div class="tk-variants-details-head">
            <span class="tk-variants-details-title">Shadow {i + 1}</span>
            <span class="tk-variants-details-label">{s.type === "inner" ? "Inner shadow" : "Drop shadow"}</span>
          </div>
          <dl class="tk-variants-details-grid">
            {(
              [
                ["X", s.x],
                ["Y", s.y],
                ["Blur", s.blur],
                ["Spread", s.spread],
              ] as const
            ).map(([label, value]) => (
              <div key={label} class="tk-variants-details-pair">
                <dt class="tk-variants-details-label">{label}</dt>
                <dd class="tk-variants-details-value">{number(value)}</dd>
              </div>
            ))}
            <div class="tk-variants-details-pair is-color">
              <dt class="tk-variants-details-label">Color</dt>
              <dd class="tk-variants-details-value">
                {/* The swatch whole: a shadow's color is often a few % opaque, and would show as nothing; its opacity is told beside it. */}
                <span class="tk-variants-details-swatch" style={{ "--tk-swatch": s.color }} />
                {s.color.slice(1).toUpperCase()}
                <span class="tk-variants-details-opacity">{Math.round(s.opacity * 100)}%</span>
              </dd>
            </div>
          </dl>
        </div>
      ))}
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
