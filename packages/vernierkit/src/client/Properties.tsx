/** @jsxImportSource preact */
import type { TargetedFocusEvent, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Align, Alignment, ColorStop, Editor, Fill, Gradient, Padding, Property, PropertyValues, Size, Stroke } from "./edits";
import { Icon, type IconName } from "./icons";
import type { Layer } from "./layers";
import { cssColor, fillAs, nextStopPosition, stop, stopAt, strokeWith, turned, type Color } from "./paint";

interface Props {
  editor: Editor;
  /** The selected layers: one, or several edited together. */
  layers: Layer[];
  /** Called after each edit, so the panel shows the new values. */
  onEdit(): void;
  /** Makes the layers a Stack. */
  onStack(): void;
  /** Dissolves the layers, Stacks. */
  onDissolve(): void;
}

/** A fill added to a layer that has none, as in Figma. */
const NEW_FILL: Fill = { type: "solid", color: "#FFFFFF", opacity: 1 };
/** A stroke added to a layer that has none, as in Figma. Fields in the order the editor reads them back in. */
const NEW_STROKE: Stroke = { color: "#000000", opacity: 1, weight: 1, style: "solid" };

/** A value the selected layers do not share: shown as Mixed. */
const MIXED = Symbol("mixed");
type Shown<T> = T | typeof MIXED;

/**
 * The Design panel's properties for the selected layers, in design language.
 * With several selected, only what all of them offer shows, and a value they
 * do not share shows as Mixed; a change goes to each of them, as one edit.
 */
export function Properties({ editor, layers, onEdit, onStack, onDissolve }: Props) {
  /** Whether every selected layer offers the property, or takes the value. */
  const offers = <P extends Property>(property: P, value?: PropertyValues[P]) => layers.every((layer) => editor.can(layer, property, value));
  /** The value all selected layers share, or Mixed; undefined when not all of them offer it. */
  const shown = <P extends Property>(property: P): Shown<PropertyValues[P]> | undefined => {
    if (!offers(property)) return undefined;
    const [first, ...rest] = layers.map((layer) => editor.read(layer, property));
    return rest.every((value) => JSON.stringify(value) === JSON.stringify(first)) ? first : MIXED;
  };
  /**
   * Changes the property of each selected layer to what `next` makes of its
   * value now. `continues`: one more step of an adjustment under way.
   */
  const update = <P extends Property>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues = false) => {
    editor.batch(() => {
      for (const layer of layers) editor.set(layer, property, next(editor.read(layer, property), layer));
    }, { continues });
    onEdit();
  };
  const set = <P extends Property>(property: P) => (value: PropertyValues[P], continues = false) => update(property, () => value, continues);

  const locked = layers.some((layer) => layer.kind === "locked");
  const x = shown("x");
  const y = shown("y");
  const width = shown("width");
  const height = shown("height");
  const direction = shown("direction");
  const opacity = shown("opacity");
  const visible = shown("visible");
  const radius = shown("radius");
  const clip = shown("clip");
  const fill = shown("fill");
  const stroke = shown("stroke");
  return (
    <>
      {locked && <p class="vk-layer-note vk-section">A locked layer comes from a dependency. It can only be moved and resized as a whole.</p>}
      {x !== undefined && y !== undefined && (
        <section class="vk-section" aria-labelledby="vk-position">
          <h3 id="vk-position" class="vk-section-title">Position</h3>
          <div class="vk-grid-2">
            <NumberField label="X" glyph="X" value={number(x)} onChange={set("x")} />
            <NumberField label="Y" glyph="Y" value={number(y)} onChange={set("y")} />
          </div>
        </section>
      )}
      {(width !== undefined || height !== undefined) && (
        <section class="vk-section" aria-labelledby="vk-size">
          <h3 id="vk-size" class="vk-section-title">Size</h3>
          {width !== undefined && <SizeRow axis="width" size={width} layers={layers} offers={offers} measure={editor.measure} update={update} />}
          {height !== undefined && <SizeRow axis="height" size={height} layers={layers} offers={offers} measure={editor.measure} update={update} />}
          {offers("minWidth") && (
            <div class="vk-grid-2">
              {/* Width on the left, height on the right; minimum above maximum. */}
              <LimitField label="Min width" glyph="W" value={shown("minWidth")!} onChange={set("minWidth")} />
              <LimitField label="Min height" glyph="H" value={shown("minHeight")!} onChange={set("minHeight")} />
              <LimitField label="Max width" glyph="W" value={shown("maxWidth")!} onChange={set("maxWidth")} />
              <LimitField label="Max height" glyph="H" value={shown("maxHeight")!} onChange={set("maxHeight")} />
            </div>
          )}
        </section>
      )}
      {direction === undefined && (layers.length > 1 || layers[0].kind === "frame") && editor.canStack(layers) && (
        <section class="vk-section" role="group" aria-label="Stack">
          <div class="vk-section-header">
            <h3 class="vk-section-title">Stack</h3>
            <button type="button" class="vk-icon-button" aria-label="Make Stack" title="Make Stack (⇧A)" onClick={onStack}>
              <Icon name="plus" />
            </button>
          </div>
        </section>
      )}
      {direction !== undefined && (
        <StackSection
          direction={direction}
          dissolve={layers.every((layer) => editor.canUnstack(layer)) ? onDissolve : null}
          gap={shown("gap")!}
          padding={shown("padding")!}
          align={shown("align")!}
          wrap={shown("wrap")!}
          set={set}
          update={update}
        />
      )}
      {(opacity !== undefined || visible !== undefined) && (
        <section class="vk-section" aria-labelledby="vk-appearance">
          <h3 id="vk-appearance" class="vk-section-title">Appearance</h3>
          <div class="vk-grid-2">
            {opacity !== undefined && (
              <PercentField label="Opacity" icon="opacity" value={opacity === MIXED ? null : opacity} onChange={set("opacity")} />
            )}
            {radius !== undefined && (
              <NumberField label="Corner radius" icon="radius" value={typeof radius === "number" ? radius : null} min={0} onChange={set("radius")} />
            )}
          </div>
          {visible !== undefined && <Check label="Visible" checked={visible} onChange={set("visible")} />}
          {clip !== undefined && <Check label="Clip content" checked={clip} onChange={set("clip")} />}
        </section>
      )}
      {fill !== undefined && (
        <FillSection
          fill={fill}
          conic={layers.some((layer) => editor.read(layer, "fill")?.type === "conic")}
          onChange={set("fill")}
          update={update}
        />
      )}
      {stroke !== undefined && <StrokeSection key={keyOf(layers)} stroke={stroke} onChange={set("stroke")} update={update} />}
    </>
  );
}

function number(value: Shown<number>): number | null {
  return value === MIXED ? null : value;
}

type Update = <P extends Property>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues?: boolean) => void;
type Setter = <P extends Property>(property: P) => (value: PropertyValues[P], continues?: boolean) => void;

const SIZINGS = [
  { type: "fixed", label: "Fixed" },
  { type: "hug", label: "Hug" },
  { type: "fill", label: "Fill" },
] as const;

/** Width or height: Fixed, Hug or Fill, and the size it comes to. Typing a size makes it Fixed. */
function SizeRow({ axis, size, layers, offers, measure, update }: {
  axis: "width" | "height";
  measure(layer: Layer): DOMRect;
  size: Shown<Size>;
  layers: Layer[];
  offers<P extends Property>(property: P, value?: PropertyValues[P]): boolean;
  update: Update;
}) {
  const label = axis === "width" ? "Width" : "Height";
  const sizes = layers.map((layer) => Math.round(measure(layer)[axis] * 100) / 100);
  const shownSize = sizes.every((s) => s === sizes[0]) ? sizes[0] : null;
  return (
    <div class="vk-row vk-size-row">
      <NumberField
        label={label}
        glyph={axis === "width" ? "W" : "H"}
        value={shownSize}
        min={0}
        onChange={(value, continues) => update(axis, () => ({ type: "fixed", value }), continues)}
      />
      <select
        class="vk-select"
        aria-label={`${label} sizing`}
        value={size === MIXED ? "" : size.type}
        onChange={(event) => {
          const type = event.currentTarget.value as Size["type"];
          // Fixed at the size it comes to now.
          update(axis, (_, layer) => (type === "fixed" ? { type, value: Math.round(measure(layer)[axis] * 100) / 100 } : { type }));
        }}
      >
        {size === MIXED && (
          <option value="" disabled>
            Mixed
          </option>
        )}
        {SIZINGS.map(({ type, label }) => (
          <option key={type} value={type} disabled={!offers(axis, type === "fixed" ? { type, value: 0 } : { type })}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

const ALIGNMENTS: Alignment[] = ["start", "center", "end"];
const ROWS = { start: "Top", center: "Center", end: "Bottom" };
const COLUMNS = { start: "left", center: "center", end: "right" };

function StackSection({ direction, dissolve, gap, padding, align, wrap, set, update }: {
  direction: Shown<PropertyValues["direction"]>;
  /** Dissolves the Stacks; null when they cannot be. */
  dissolve: (() => void) | null;
  gap: Shown<number>;
  padding: Shown<Padding>;
  align: Shown<Align>;
  wrap: Shown<boolean>;
  set: Setter;
  update: Update;
}) {
  const side = (i: number) => (padding === MIXED ? null : padding[i]);
  const setSide = (i: number) => (value: number, continues?: boolean) =>
    update("padding", (current) => current.map((p, j) => (i === j ? value : p)) as Padding, continues);
  return (
    <section class="vk-section" aria-labelledby="vk-stack">
      <div class="vk-section-header">
        <h3 id="vk-stack" class="vk-section-title">Stack</h3>
        {dissolve && (
          <button type="button" class="vk-icon-button" aria-label="Dissolve Stack" title="Dissolve Stack (⌥⇧A)" onClick={dissolve}>
            <Icon name="minus" />
          </button>
        )}
      </div>
      <div class="vk-row">
        <div class="vk-segmented-field" role="radiogroup" aria-label="Direction">
          {(["horizontal", "vertical"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              class="vk-icon-button"
              aria-checked={direction === d}
              aria-label={d === "horizontal" ? "Horizontal" : "Vertical"}
              onClick={() => set("direction")(d)}
            >
              <Icon name={d === "horizontal" ? "stack-horizontal" : "stack-vertical"} />
            </button>
          ))}
        </div>
        <NumberField label="Gap" icon="gap" value={number(gap)} min={0} onChange={set("gap")} />
      </div>
      <div class="vk-row vk-align-row">
        <div class="vk-align" role="radiogroup" aria-label="Alignment">
          {ALIGNMENTS.map((y) =>
            ALIGNMENTS.map((x) => {
              const name = y === "center" && x === "center" ? "Center" : `${ROWS[y]} ${COLUMNS[x]}`;
              const checked = align !== MIXED && align.x === x && align.y === y;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  class="vk-align-point"
                  aria-checked={checked}
                  aria-label={name}
                  onClick={() => update("align", (current) => ({ ...current, x, y }))}
                />
              );
            }),
          )}
        </div>
        <div class="vk-align-options">
          <Check
            label="Distribute evenly"
            checked={align === MIXED ? MIXED : align.distribute}
            onChange={(distribute) => update("align", (current) => ({ ...current, distribute }))}
          />
          <Check label="Wrap" checked={wrap} onChange={set("wrap")} />
        </div>
      </div>
      <div class="vk-grid-2" role="group" aria-label="Padding">
        {["Top", "Right", "Bottom", "Left"].map((name, i) => (
          <NumberField key={name} label={`Padding ${name.toLowerCase()}`} glyph={name[0]} value={side(i)} min={0} onChange={setSide(i)} />
        ))}
      </div>
    </section>
  );
}

/** A checkbox; Mixed shows as neither checked nor not. */
function Check({ label, checked, onChange }: { label: string; checked: Shown<boolean>; onChange(checked: boolean): void }) {
  return (
    <label class="vk-check">
      <input
        type="checkbox"
        checked={checked === true}
        indeterminate={checked === MIXED}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {label}
    </label>
  );
}

/** A minimum or maximum: a size, or none when left empty. */
function LimitField({ label, glyph, value, onChange }: { label: string; glyph: string; value: Shown<number | null>; onChange(value: number | null): void }) {
  return (
    <label class="vk-field" title={label}>
      <span class="vk-glyph" aria-hidden="true">
        {label.startsWith("Min") ? `↓${glyph}` : `↑${glyph}`}
      </span>
      <TextField
        label={label}
        value={value === MIXED ? "Mixed" : value === null ? "" : String(value)}
        placeholder="None"
        parse={(text) => (text.trim() === "" ? { value: null } : (n => (n === null ? null : { value: n }))(parseNumber(text, 0)))}
        onChange={({ value }) => onChange(value)}
      />
    </label>
  );
}

/** A value from 0 to 1, shown and typed as a percentage, and dragged on its icon 1% per px (10% with ⇧). */
function PercentField({ label, icon, value, onChange }: {
  label: string;
  icon: IconName;
  value: number | null;
  onChange(value: number, continues?: boolean): void;
}) {
  return (
    <label class="vk-field" title={label}>
      <Scrub
        icon={icon}
        value={value === null ? null : Math.round(value * 100)}
        min={0}
        max={100}
        onChange={(percent, continues) => onChange(percent / 100, continues)}
      />
      <TextField
        label={label}
        value={value === null ? "Mixed" : `${Math.round(value * 100)}%`}
        parse={(text) => {
          const percent = parseNumber(text, 0, 100);
          return percent === null ? null : percent / 100;
        }}
        step={(by) => onChange(Math.min(1, Math.max(0, Math.round(((value ?? 1) * 100 + by)) / 100)))}
        onChange={onChange}
      />
    </label>
  );
}

const FILL_TYPES = [
  { type: "solid", label: "Solid" },
  { type: "linear", label: "Linear" },
  { type: "radial", label: "Radial" },
] as const;

/**
 * A fill: a color, or a linear or radial gradient, its stops dragged along a
 * bar and listed below it, as in Figma. A conic gradient the page has is shown, not edited.
 */
function FillSection({ fill, conic, onChange, update }: {
  fill: Shown<Fill | null>;
  /** Some selected layer has a conic gradient: the fills are shown, and none of them is changed. */
  conic: boolean;
  onChange(fill: Fill | null, continues?: boolean): void;
  update: Update;
}) {
  return (
    <section class="vk-section" role="group" aria-label="Fill">
      <div class="vk-section-header">
        <h3 class="vk-section-title">Fill</h3>
        {!fill ? (
          <button type="button" class="vk-icon-button" aria-label="Add fill" onClick={() => onChange(NEW_FILL)}>
            <Icon name="plus" />
          </button>
        ) : (
          !conic && (
            <div class="vk-row">
              <select
                class="vk-select"
                aria-label="Fill type"
                value={fill === MIXED ? "" : fill.type}
                onChange={(event) => update("fill", (current) => fillAs(current, event.currentTarget.value as (typeof FILL_TYPES)[number]["type"]))}
              >
                {fill === MIXED && (
                  <option value="" disabled>
                    Mixed
                  </option>
                )}
                {FILL_TYPES.map(({ type, label }) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="button" class="vk-icon-button" aria-label="Remove fill" onClick={() => onChange(null)}>
                <Icon name="minus" />
              </button>
            </div>
          )
        )}
      </div>
      {fill === MIXED ? (
        <span class="vk-field vk-mixed">Mixed</span>
      ) : fill?.type === "solid" ? (
        <ColorField name="Fill" color={fill} onChange={(color, continues) => onChange({ type: "solid", ...color }, continues)} />
      ) : fill?.type === "conic" ? (
        <>
          <div class="vk-row">
            <span class="vk-gradient-swatch" style={{ backgroundImage: fill.css }} aria-hidden="true" />
            <span class="vk-field vk-read-only">Conic gradient</span>
          </div>
          <p class="vk-layer-note">A conic gradient is shown here, not edited.</p>
        </>
      ) : (
        fill && (
          <>
            {fill.type === "linear" && (
              <NumberField
                label="Angle"
                glyph="∠"
                value={fill.angle}
                onChange={(angle, continues) => onChange({ ...fill, angle: turned(angle) }, continues)}
              />
            )}
            <GradientStops gradient={fill} onChange={(stops, continues) => onChange({ ...fill, stops }, continues)} />
          </>
        )
      )}
    </section>
  );
}

/** The stops sorted by position, as the editor reads them back. */
function sorted(stops: ColorStop[]): ColorStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * A gradient's stops: on a bar showing the gradient, each a handle dragged
 * left and right or moved with the arrow keys (10% with ⇧) and taken off with
 * Delete; a click on the bar adds one there. Below, each stop's position and color.
 */
function GradientStops({ gradient, onChange }: { gradient: Gradient; onChange(stops: ColorStop[], continues?: boolean): void }) {
  const bar = useRef<HTMLDivElement>(null);
  /** The handle being dragged: the stop, by where it is in the sorted stops as it moves among them, and whether it has moved yet. */
  const drag = useRef<{ pointerId: number; index: number; moved: boolean } | null>(null);
  const { stops } = gradient;
  /** Moves stop `index` to `position`: returns where it is among the stops now. */
  const move = (index: number, position: number, continues = false) => {
    const moved = stop(stops[index], Math.min(100, Math.max(0, position)));
    const next = sorted(stops.map((s, i) => (i === index ? moved : s)));
    onChange(next, continues);
    return next.indexOf(moved);
  };
  const remove = (index: number) => stops.length > 2 && onChange(stops.filter((_, i) => i !== index));
  const add = (position: number) => onChange(sorted([...stops, stopAt(stops, position)]));
  const along = (clientX: number) => {
    const box = bar.current!.getBoundingClientRect();
    return Math.round(((clientX - box.left) / box.width) * 100);
  };
  const preview = `linear-gradient(90deg, ${stops.map((s) => `${cssColor(s)} ${s.position}%`).join(", ")})`;
  return (
    <>
      <div
        ref={bar}
        class="vk-gradient-bar"
        role="group"
        aria-label="Gradient stops"
        style={{ "--vk-gradient": preview }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.target !== event.currentTarget) return;
          add(along(event.clientX));
        }}
      >
        {stops.map((s, index) => (
          <span
            key={index}
            class="vk-stop-handle"
            role="slider"
            tabIndex={0}
            aria-label={`Stop ${index + 1} position`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={s.position}
            aria-valuetext={`${s.position}%`}
            style={{ left: `${s.position}%`, "--vk-stop": cssColor(s) }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { pointerId: event.pointerId, index, moved: false };
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (d?.pointerId !== event.pointerId) return;
              const position = Math.min(100, Math.max(0, along(event.clientX)));
              if (position === stops[d.index].position) return;
              d.index = move(d.index, position, d.moved);
              d.moved = true;
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointerId === event.pointerId) drag.current = null;
            }}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(event) => {
              const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
              if (by) {
                event.preventDefault();
                move(index, s.position + by * (event.shiftKey ? 10 : 1));
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                remove(index);
              }
            }}
          />
        ))}
      </div>
      <div class="vk-section-header">
        <h4 class="vk-section-title vk-subtitle">Stops</h4>
        <button type="button" class="vk-icon-button" aria-label="Add stop" onClick={() => add(nextStopPosition(stops))}>
          <Icon name="plus" />
        </button>
      </div>
      {stops.map((s, index) => (
        <div class="vk-row" key={index} role="group" aria-label={`Stop ${index + 1}`}>
          <label class="vk-field vk-stop-position" title="Position">
            <TextField
              label={`Stop ${index + 1} at`}
              value={`${s.position}%`}
              parse={(text) => parseNumber(text, 0, 100)}
              step={(by) => move(index, s.position + by)}
              onChange={(position) => move(index, position)}
            />
          </label>
          <ColorField
            name={`Stop ${index + 1}`}
            color={s}
            onChange={(color, continues) => onChange(stops.map((other, i) => (i === index ? stop(color, s.position) : other)), continues)}
          />
          <button type="button" class="vk-icon-button" aria-label={`Remove stop ${index + 1}`} disabled={stops.length <= 2} onClick={() => remove(index)}>
            <Icon name="minus" />
          </button>
        </div>
      ))}
    </>
  );
}

const SIDE_NAMES = ["Top", "Right", "Bottom", "Left"];
type Sides = "all" | "custom" | 0 | 1 | 2 | 3;

/** Which sides a stroke is drawn on: all of them, one of them (by index, top first), or each as it says. */
function sidesOf(weight: Stroke["weight"]): Sides {
  if (typeof weight === "number") return "all";
  const drawn = weight.flatMap((w, i) => (w > 0 ? [i] : []));
  return drawn.length === 1 ? (drawn[0] as Sides) : "custom";
}

/** The weight a stroke is drawn at, wherever it is drawn: its widest side. */
function widest(weight: Stroke["weight"]): number {
  return typeof weight === "number" ? weight : Math.max(...weight);
}

/**
 * A stroke: its color, weight and line, and the sides it is drawn on, as in
 * Figma: all, one side, or each side its own weight (Custom).
 */
function StrokeSection({ stroke, onChange, update }: { stroke: Shown<Stroke | null>; onChange(stroke: Stroke | null, continues?: boolean): void; update: Update }) {
  /** Custom chosen with every side alike: the four sides stay out until another choice. */
  const [custom, setCustom] = useState(false);
  const sides = stroke && stroke !== MIXED ? (custom ? "custom" : sidesOf(stroke.weight)) : null;
  return (
    <section class="vk-section" role="group" aria-label="Stroke">
      <div class="vk-section-header">
        <h3 class="vk-section-title">Stroke</h3>
        {!stroke && (
          <button type="button" class="vk-icon-button" aria-label="Add stroke" onClick={() => onChange(NEW_STROKE)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {stroke && (
        <div class="vk-row">
          {stroke === MIXED ? (
            <span class="vk-field vk-mixed">Mixed</span>
          ) : (
            <ColorField name="Stroke" color={stroke} onChange={(color, continues) => onChange({ ...color, weight: stroke.weight, style: stroke.style }, continues)} />
          )}
          <button type="button" class="vk-icon-button" aria-label="Remove stroke" onClick={() => onChange(null)}>
            <Icon name="minus" />
          </button>
        </div>
      )}
      {stroke && stroke !== MIXED && (
        <div class="vk-row">
          {sides !== "custom" && (
            <NumberField
              label="Stroke weight"
              glyph="≡"
              value={widest(stroke.weight)}
              min={0}
              onChange={(weight, continues) => onChange(strokeWith(stroke, typeof stroke.weight === "number" ? weight : stroke.weight.map((w) => (w > 0 ? weight : 0)) as Stroke["weight"]), continues)}
            />
          )}
          <select
            class="vk-select"
            aria-label="Stroke style"
            value={stroke.style}
            onChange={(event) => onChange({ ...stroke, style: event.currentTarget.value as Stroke["style"] })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
          </select>
          <select
            class="vk-select"
            aria-label="Stroke sides"
            value={String(sides)}
            onChange={(event) => {
              const choice = event.currentTarget.value;
              setCustom(choice === "custom");
              update("stroke", (current) => {
                if (!current) return current;
                const weight = widest(current.weight) || 1;
                // Custom keeps the weights as they are: the four sides show, to be set one by one.
                if (choice === "all" || choice === "custom") return strokeWith(current, choice === "all" ? weight : current.weight);
                return strokeWith(current, SIDE_NAMES.map((_, i) => (i === Number(choice) ? weight : 0)) as Stroke["weight"]);
              });
            }}
          >
            <option value="all">All</option>
            {SIDE_NAMES.map((name, i) => (
              <option key={name} value={String(i)}>
                {name}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </div>
      )}
      {stroke && stroke !== MIXED && sides === "custom" && (
        <div class="vk-grid-2" role="group" aria-label="Stroke weight per side">
          {SIDE_NAMES.map((name, i) => {
            const weights = typeof stroke.weight === "number" ? [stroke.weight, stroke.weight, stroke.weight, stroke.weight] : stroke.weight;
            return (
              <NumberField
                key={name}
                label={`Stroke ${name.toLowerCase()}`}
                glyph={name[0]}
                value={weights[i]}
                min={0}
                onChange={(weight, continues) => onChange(strokeWith(stroke, weights.map((w, j) => (i === j ? weight : w)) as Stroke["weight"]), continues)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A color and its opacity: picked, or typed as hex and as a percentage. `name` names its fields: "Fill color", "Fill opacity". */
function ColorField({ name, color, onChange }: { name: string; color: Color; onChange(color: Color, continues?: boolean): void }) {
  /** The color picker is open and has moved: the colors it goes through are one adjustment. */
  const picking = useRef(false);
  const lower = name.toLowerCase();
  return (
    <div class="vk-field vk-color-field">
      <input
        type="color"
        class="vk-swatch"
        aria-label={`Pick ${lower} color`}
        value={color.color.toLowerCase()}
        onInput={(event) => {
          onChange({ color: event.currentTarget.value.toUpperCase(), opacity: color.opacity }, picking.current);
          picking.current = true;
        }}
        onChange={() => (picking.current = false)}
      />
      <TextField label={`${name} color`} value={color.color.slice(1)} parse={parseHex} onChange={(hex) => onChange({ color: hex, opacity: color.opacity })} />
      <TextField
        label={`${name} opacity`}
        class="vk-opacity"
        value={`${Math.round(color.opacity * 100)}%`}
        parse={(text) => {
          const percent = parseNumber(text, 0, 100);
          return percent === null ? null : percent / 100;
        }}
        onChange={(opacity) => onChange({ color: color.color, opacity })}
      />
    </div>
  );
}

/** Each element is given a number the first time it is asked for, to tell selections apart by. */
const elementKeys = new WeakMap<Element, number>();
let lastKey = 0;

/** A key that changes with the selected layers: state a section keeps for them goes when they do. */
function keyOf(layers: Layer[]): string {
  return layers
    .map((layer) => {
      if (!elementKeys.has(layer.el)) elementKeys.set(layer.el, ++lastKey);
      return elementKeys.get(layer.el);
    })
    .join(" ");
}

interface NumberFieldProps {
  label: string;
  /** What the field's handle shows: an icon, or a letter or two. */
  icon?: IconName;
  glyph?: string;
  /** Null: the value differs from part to part, shown as Mixed. */
  value: number | null;
  min?: number;
  /** `continues`: one more step of a drag on the icon. */
  onChange(value: number, continues?: boolean): void;
}

/** A number typed in, stepped with ↑ / ↓, or dragged on its icon (10 at a time with ⇧). */
function NumberField({ label, icon, glyph, value, min = -Infinity, onChange }: NumberFieldProps) {
  return (
    <label class="vk-field" title={label}>
      <Scrub icon={icon} glyph={glyph} value={value} min={min} onChange={onChange} />
      <TextField
        label={label}
        value={value === null ? "Mixed" : String(value)}
        parse={(text) => parseNumber(text, min)}
        step={(by) => onChange(Math.max(min, (value ?? 0) + by))}
        onChange={onChange}
      />
    </label>
  );
}

/**
 * The icon of a number field: dragging left and right changes the value, 1 per
 * px (10 with ⇧), as in Figma. The pointer is locked while dragging, so it
 * never runs into the edge of the screen.
 */
function Scrub({ icon, glyph, value, min, max = Infinity, onChange }: {
  icon?: IconName;
  glyph?: string;
  value: number | null;
  min: number;
  max?: number;
  onChange(value: number, continues: boolean): void;
}) {
  /** The drag under way: the value so far, movement of less than 1px not yet counted, and whether it has changed the value yet. */
  const drag = useRef<{ pointerId: number; value: number; rest: number; moved: boolean } | null>(null);

  const onPointerDown = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    Promise.resolve(handle.requestPointerLock()).catch(() => {}); // Without the lock, the drag still works.
    drag.current = { pointerId: event.pointerId, value: value ?? 0, rest: 0, moved: false };
  };

  const onPointerMove = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    d.rest += event.movementX;
    const px = Math.trunc(d.rest);
    if (!px) return;
    d.rest -= px;
    const next = Math.min(max, Math.max(min, d.value + px * (event.shiftKey ? 10 : 1)));
    if (next === d.value) return;
    d.value = next;
    onChange(next, d.moved);
    d.moved = true;
  };

  const end = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
    if (root.pointerLockElement === event.currentTarget) document.exitPointerLock();
  };

  return (
    <span
      class="vk-scrub"
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      // A click on the icon is not a click on the field's label: it does not start typing.
      onClick={(event) => event.preventDefault()}
    >
      {icon ? <Icon name={icon} /> : <span class="vk-glyph">{glyph}</span>}
    </span>
  );
}

interface TextFieldProps<T> {
  label: string;
  class?: string;
  value: string;
  /** Shown when there is no value. */
  placeholder?: string;
  /** The value typed in, or null when it makes no sense: the field goes back to what it showed. */
  parse(text: string): T | null;
  /** ↑ / ↓ pressed: change the value by this much. */
  step?(by: number): void;
  onChange(value: T): void;
}

/**
 * A value typed in and applied on Enter or on leaving the field, as in Figma.
 * Esc puts back what it showed. What is typed applies to the layer it was typed
 * for, even when leaving the field selects another layer.
 */
function TextField<T>({ label, class: className, value, placeholder, parse, step, onChange }: TextFieldProps<T>) {
  const [draft, setDraft] = useState<string | null>(null);
  /** Set on focus: where the typed value goes. */
  const target = useRef(onChange);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = parse(draft);
    if (parsed !== null && draft !== value) target.current(parsed);
  };

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit();
      event.currentTarget.select();
    } else if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    } else if (step && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      setDraft(null);
      step((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
    }
  };

  return (
    <input
      type="text"
      class={`vk-input${className ? ` ${className}` : ""}`}
      aria-label={label}
      // Something typed, not yet applied: ⌘Z is the field's own until then.
      data-vk-typing={draft !== null && draft !== value ? "" : undefined}
      placeholder={placeholder}
      spellcheck={false}
      autocomplete="off"
      value={draft ?? value}
      onFocus={(event: TargetedFocusEvent<HTMLInputElement>) => {
        target.current = onChange;
        event.currentTarget.select();
      }}
      onInput={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

/** A number typed in, kept within bounds and to two decimals. */
function parseNumber(text: string, min = -Infinity, max = Infinity): number | null {
  const n = parseFloat(text);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : null;
}

/** `#rgb` or `#rrggbb`, with or without the `#`, as `#RRGGBB`. */
function parseHex(text: string): string | null {
  let hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}
