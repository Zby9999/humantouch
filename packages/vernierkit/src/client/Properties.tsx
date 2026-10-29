/** @jsxImportSource preact */
import type { ComponentChildren, TargetedFocusEvent, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Align, Alignment, ColorStop, Editor, Fill, Gradient, Padding, Property, PropertyValues, Radius, Size, Stroke } from "./edits";
import { Icon, type IconName } from "./icons";
import { BreakpointMark, BreakpointMarksProvider, breakpointMarks } from "./BreakpointMark";
import { GridSection } from "./GridSection";
import type { Layer } from "./layers";
import { draws, shadow, type Blur, type Shadow } from "./effects";
import {
  alongOf,
  centerPercent,
  cssColor,
  fillAs,
  gradientLength,
  nextStopPosition,
  paintArea,
  radiiOf,
  sortedStops,
  stop,
  stopAt,
  strokeWith,
  turned,
  withCenter,
  withRadius,
  type PaintArea,
  type Color,
  type RadialGradient,
} from "./paint";
import { stepped } from "./stroke-weight";
import { useToast } from "./Toast";
import { fontsOf, type Font, type LineHeight, type TextAlign, type TextCase, type TextDecoration, type TextLength } from "./typography";
import { weightName } from "../design-values";
import { ColorPicker, namesColor, TypingProvider, useCatalog, useTypeahead, VariableSlot, type Slot } from "./VariablePicker";
import { GROUPS, sameVariable, withPart, type Resolved } from "./variables";

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

/** An effect added, as in Figma: a drop shadow. Fields in the order the editor reads them back in. */
const NEW_SHADOW: Shadow = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };

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
    return shared(layers.map((layer) => editor.read(layer, property)));
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
  /** Changes several properties of each selected layer, to what `next` makes of the layer, as one edit. */
  const updateEach = (next: (layer: Layer) => Partial<PropertyValues>) => {
    editor.batch(() => {
      for (const layer of layers) {
        for (const [property, value] of Object.entries(next(layer))) editor.set(layer, property as Property, value as PropertyValues[Property]);
      }
    });
    onEdit();
  };

  const catalog = useCatalog();
  /**
   * The Variable every selected layer has picked for part `part` of the property `propertyOf` names for it; null when none,
   * or not the same. The property is where the layer keeps the value: a text layer's shadows are its text shadows.
   */
  const boundTo = (propertyOf: (layer: Layer) => Property, part: string) => {
    const [first, ...rest] = layers.map((layer) => editor.variables(layer, propertyOf(layer))?.[part]);
    const same = rest.every((other) => other?.picked && sameVariable(other, first));
    return first?.picked && same ? first : null;
  };
  /** Makes part `part` of the property `propertyOf` names for each selected layer the Variable `entry` draws, as one edit; null detaches it, keeping the value. */
  const pick = (propertyOf: (layer: Layer) => Property, part: string, entry: Resolved | null) => {
    editor.batch(() => {
      for (const layer of layers) {
        const property = propertyOf(layer);
        const current = editor.read(layer, property);
        const next = entry ? withPart(property, current, part, entry.drawn) : current;
        if (next !== null) editor.set(layer, property, next as PropertyValues[Property], { variables: { [part]: entry?.variable ?? null } });
      }
    });
    onEdit();
  };
  /** Part `part` of `property` as a field that can be a Variable; undefined when the project has none. */
  const variable: SlotOf = (property, part = "") => {
    const group = GROUPS[property];
    if (!catalog || !group) return undefined;
    const propertyOf = () => property;
    return { group, selection: keyOf(layers), bound: boundTo(propertyOf, part), onPick: (entry) => pick(propertyOf, part, entry) };
  };

  /** The color of shadow `i` as a field that can be a color Variable, where each layer keeps its shadows; undefined when the project has none. */
  const shadowColor = (i: number): Slot | undefined => {
    if (!catalog) return undefined;
    const part = `shadow ${i + 1}`;
    const kept = (layer: Layer) => effectOf(layer, "shadows")!;
    return { group: "color", selection: keyOf(layers), bound: boundTo(kept, part), onPick: (entry) => pick(kept, part, entry) };
  };

  /** Selected text layers: their shadows are text shadows, and they have no blur. */
  const texts = layers.filter((layer) => editor.can(layer, "textShadows"));
  /** Where a layer keeps an effect: a text layer's shadows are its text shadows; null for a blur, which text has none of. */
  const effectOf = <P extends EffectProperty>(layer: Layer, property: P): P | null => {
    if (!texts.includes(layer)) return property;
    // Text shadows are shadows too, of the same values.
    return property === "shadows" ? ("textShadows" as P) : null;
  };
  /** A layer's effect, where it keeps it; a blur on text is none. */
  const readEffect = <P extends EffectProperty>(layer: Layer, property: P): PropertyValues[P] => {
    const kept = effectOf(layer, property);
    return kept ? editor.read(layer, kept) : (null as PropertyValues[P]);
  };
  /** The effect all selected layers share, or Mixed: text layers' shadows have no spread, and they have no blur. */
  const shownEffect = <P extends EffectProperty>(property: P): Shown<PropertyValues[P]> | undefined => {
    if (!texts.length) return shown(property);
    const others = layers.filter((layer) => !texts.includes(layer));
    // Text alone has no blur.
    if ((property !== "shadows" && !others.length) || !others.every((layer) => editor.can(layer, property))) return undefined;
    return shared(
      layers.map((layer) => {
        const value = readEffect(layer, property);
        return property === "shadows" ? ((value as Shadow[]).map((s) => shadow({ ...s, spread: 0 })) as PropertyValues[P]) : value;
      }),
    );
  };
  /** Changes an effect of each selected layer, where the layer keeps it. */
  const updateEffect: EffectUpdate = (property, next, continues = false) => {
    editor.batch(() => {
      for (const layer of layers) {
        const kept = effectOf(layer, property);
        if (kept) editor.set(layer, kept, next(editor.read(layer, kept), layer));
      }
    }, { continues });
    onEdit();
  };
  /** Changes several effects of each selected layer, where the layer keeps them, as one edit. */
  const updateEffects = (next: (layer: Layer) => Partial<EffectValues>) => {
    editor.batch(() => {
      for (const layer of layers) {
        for (const [property, value] of Object.entries(next(layer))) {
          const kept = effectOf(layer, property as EffectProperty);
          if (kept) editor.set(layer, kept, value as PropertyValues[EffectProperty]);
        }
      }
    });
    onEdit();
  };

  const locked = layers.some((layer) => layer.kind === "locked");
  const x = shown("x");
  const y = shown("y");
  const width = shown("width");
  const height = shown("height");
  const direction = shown("direction");
  const padding = shown("padding");
  const opacity = shown("opacity");
  const visible = shown("visible");
  const radius = shown("radius");
  const clip = shown("clip");
  const fill = shown("fill");
  const stroke = shown("stroke");
  const shadows = shownEffect("shadows");
  const fontSize = shown("fontSize");
  const textColor = shown("textColor");
  return (
    <BreakpointMarksProvider value={breakpointMarks(editor, layers, onEdit)}>
      {locked && <p class="vk-layer-note vk-section">A locked layer comes from a dependency. It can only be moved and resized as a whole.</p>}
      {x !== undefined && y !== undefined && (
        <section class="vk-section" aria-labelledby="vk-position">
          <h3 id="vk-position" class="vk-section-title">Position</h3>
          <div class="vk-grid-2 vk-markable">
            {/* Placed freely at the breakpoint (ADR 0008): its X and Y there are that placement. */}
            <BreakpointMark properties={["x", "y", "absolute"]} />
            <NumberField label="X" glyph="X" value={number(x)} onChange={set("x")} />
            <NumberField label="Y" glyph="Y" value={number(y)} onChange={set("y")} />
          </div>
        </section>
      )}
      {(width !== undefined || height !== undefined) && (
        <section class="vk-section" aria-labelledby="vk-size">
          <h3 id="vk-size" class="vk-section-title">Size</h3>
          {width !== undefined && <SizeRow axis="width" size={width} layers={layers} offers={offers} measure={editor.measure} update={update} variable={variable("width")} />}
          {height !== undefined && <SizeRow axis="height" size={height} layers={layers} offers={offers} measure={editor.measure} update={update} variable={variable("height")} />}
          {offers("minWidth") && (
            <div class="vk-grid-2 vk-markable">
              <BreakpointMark properties={["minWidth", "minHeight", "maxWidth", "maxHeight"]} />
              {/* Width on the left, height on the right; minimum above maximum. */}
              {(["minWidth", "minHeight", "maxWidth", "maxHeight"] as const).map((property) => {
                const label = LIMIT_LABELS[property];
                return (
                  <VariableSlot key={property} label={label} slot={variable(property)}>
                    <LimitField label={label} glyph={property.endsWith("Width") ? "W" : "H"} value={shown(property)!} onChange={set(property)} />
                  </VariableSlot>
                );
              })}
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
          padding={padding!}
          align={shown("align")!}
          wrap={shown("wrap")!}
          set={set}
          update={update}
          variable={variable}
        />
      )}
      {padding !== undefined && layers.some((layer) => layer.kind === "frame" && layer.framesText) && (
        // A Frame around its text alone, as a button is: the room around the text.
        <section class="vk-section" aria-labelledby="vk-padding">
          <h3 id="vk-padding" class="vk-section-title">Padding</h3>
          <PaddingFields padding={padding} update={update} variable={variable} />
        </section>
      )}
      <GridSection editor={editor} layers={layers} onEdit={onEdit} variable={variable} />
      {(opacity !== undefined || visible !== undefined) && (
        <AppearanceSection
          selection={keyOf(layers)}
          opacity={opacity}
          radii={radius === undefined ? undefined : layers.map((layer) => editor.read(layer, "radius"))}
          visible={visible}
          clip={clip}
          set={set}
          update={update}
          variable={variable}
        />
      )}
      {fontSize !== undefined && (
        <TextSection
          size={fontSize}
          families={layers.map((layer) => editor.read(layer, "fontFamily"))}
          weight={shown("fontWeight")!}
          lineHeight={shown("lineHeight")!}
          letterSpacing={shown("letterSpacing")!}
          align={shown("textAlign")!}
          textCase={shown("textCase")!}
          decoration={shown("textDecoration")!}
          fonts={fontsOf(layers[0].el.ownerDocument)}
          fontSize={variable("fontSize")}
          set={set}
          updateEach={updateEach}
        />
      )}
      {textColor !== undefined && (
        // Text is filled with its color, as in Figma.
        <section class="vk-section" role="group" aria-label="Fill">
          <h3 class="vk-section-title">Fill</h3>
          <div class="vk-markable">
            <BreakpointMark properties={["textColor"]} />
            {textColor === MIXED ? <span class="vk-field vk-mixed">Mixed</span> : <ColorField name="Fill" color={textColor} onChange={set("textColor")} variable={variable("textColor")} />}
          </div>
        </section>
      )}
      {fill !== undefined && (
        <FillSection
          fill={fill}
          box={paintArea(layers[0].el)}
          conic={layers.some((layer) => editor.read(layer, "fill")?.type === "conic")}
          onChange={set("fill")}
          update={update}
          variable={variable}
        />
      )}
      {stroke !== undefined && <StrokeSection key={keyOf(layers)} stroke={stroke} onChange={set("stroke")} update={update} variable={variable("stroke", "color")} />}
      {shadows !== undefined && (
        <EffectsSection
          shadows={shadows}
          layerBlur={shownEffect("layerBlur")}
          backgroundBlur={shownEffect("backgroundBlur")}
          withText={texts.length > 0}
          variable={texts.length ? undefined : variable("shadows")}
          colorVariable={shadowColor}
          read={readEffect}
          update={updateEffect}
          updateEach={updateEffects}
        />
      )}
    </BreakpointMarksProvider>
  );
}

/** The value the layers share, or Mixed. */
function shared<T>([first, ...rest]: T[]): Shown<T> {
  return rest.every((value) => JSON.stringify(value) === JSON.stringify(first)) ? first : MIXED;
}

function number(value: Shown<number>): number | null {
  return value === MIXED ? null : value;
}

/** Part `part` of a property's value ("" for all of it) as a field that can be a Variable. */
export type SlotOf = (property: Property, part?: string) => Slot | undefined;

const LIMIT_LABELS = { minWidth: "Min width", minHeight: "Min height", maxWidth: "Max width", maxHeight: "Max height" };

type Update = <P extends Property>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues?: boolean) => void;
type Setter = <P extends Property>(property: P) => (value: PropertyValues[P], continues?: boolean) => void;

const SIZINGS = [
  { type: "fixed", label: "Fixed" },
  { type: "hug", label: "Hug" },
  { type: "fill", label: "Fill" },
] as const;

/** Width or height: Fixed, Hug or Fill, and the size it comes to. Typing a size makes it Fixed. */
function SizeRow({ axis, size, layers, offers, measure, update, variable }: {
  axis: "width" | "height";
  /** Its size as a Variable, when the project has them. */
  variable: Slot | undefined;
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
    <div class="vk-row vk-size-row vk-markable">
      <BreakpointMark properties={[axis]} />
      <VariableSlot label={label} slot={variable}>
        <NumberField
          label={label}
          glyph={axis === "width" ? "W" : "H"}
          value={shownSize}
          min={0}
          onChange={(value, continues) => update(axis, () => ({ type: "fixed", value }), continues)}
        />
      </VariableSlot>
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

function StackSection({ direction, dissolve, gap, padding, align, wrap, set, update, variable }: {
  direction: Shown<PropertyValues["direction"]>;
  /** Dissolves the Stacks; null when they cannot be. */
  dissolve: (() => void) | null;
  gap: Shown<number>;
  padding: Shown<Padding>;
  align: Shown<Align>;
  wrap: Shown<boolean>;
  set: Setter;
  update: Update;
  variable: SlotOf;
}) {
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
      <div class="vk-row vk-markable">
        <BreakpointMark properties={["direction", "gap"]} />
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
        <VariableSlot label="Gap" slot={variable("gap")}>
          <NumberField label="Gap" icon="gap" value={number(gap)} min={0} onChange={set("gap")} />
        </VariableSlot>
      </div>
      <div class="vk-row vk-align-row vk-markable">
        <BreakpointMark properties={["align", "wrap"]} />
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
      <PaddingFields padding={padding} update={update} variable={variable} />
    </section>
  );
}

/** Padding on each side, top, right, bottom, left. */
function PaddingFields({ padding, update, variable }: { padding: Shown<Padding>; update: Update; variable: SlotOf }) {
  const side = (i: number) => (padding === MIXED ? null : padding[i]);
  const setSide = (i: number) => (value: number, continues?: boolean) =>
    update("padding", (current) => current.map((p, j) => (i === j ? value : p)) as Padding, continues);
  return (
    <div class="vk-grid-2 vk-markable" role="group" aria-label="Padding">
      <BreakpointMark properties={["padding"]} />
      {["Top", "Right", "Bottom", "Left"].map((name, i) => (
        <VariableSlot key={name} label={`Padding ${name.toLowerCase()}`} slot={variable("padding", name.toLowerCase())}>
          <NumberField label={`Padding ${name.toLowerCase()}`} glyph={name[0]} value={side(i)} min={0} onChange={setSide(i)} />
        </VariableSlot>
      ))}
    </div>
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

const CORNER_NAMES = ["Top left", "Top right", "Bottom right", "Bottom left"];
/** The corners as they sit in a 2 × 2 grid: top left, top right, bottom left, bottom right. */
const CORNER_GRID = [0, 1, 3, 2];
/** Each corner as a glyph, in the order of a radius: top left first, clockwise. */
const CORNER_GLYPHS = ["┌", "┐", "┘", "└"];

/** A radius's corners: top left, top right, bottom right, bottom left. */
function cornersOf(radius: Radius): [number, number, number, number] {
  return typeof radius === "number" ? [radius, radius, radius, radius] : radius;
}

/** Corners as the editor reads them back: all alike are one radius. */
function radiusOf(corners: [number, number, number, number]): Radius {
  return corners.every((r) => r === corners[0]) ? corners[0] : corners;
}

/**
 * Opacity, corner radius, visibility and clipping. The corner radius is one
 * for all corners, or each its own, as in Figma: the corners show while
 * Independent corners is on, from the start when they differ.
 * Not remade for each selection: a value typed and not yet applied still goes to the layer it was typed for.
 */
function AppearanceSection({ selection, opacity, radii, visible, clip, set, update, variable }: {
  /** Tells the selected layers apart: Independent corners, turned on or off, holds while they stay selected. */
  selection: string;
  opacity: Shown<number> | undefined;
  /** Each selected layer's radius; undefined when not all of them offer one. */
  radii: Radius[] | undefined;
  visible: Shown<boolean> | undefined;
  clip: Shown<boolean> | undefined;
  set: Setter;
  update: Update;
  variable: SlotOf;
}) {
  /** Counts selections: the same layers selected again are a new one. */
  const selected = useRef({ selection, count: 0 });
  if (selected.current.selection !== selection) selected.current = { selection, count: selected.current.count + 1 };
  const { count } = selected.current;
  const [toggled, setToggled] = useState<{ count: number; on: boolean } | null>(null);
  const independent = toggled?.count === count ? toggled.on : (radii?.some((radius) => typeof radius !== "number") ?? false);
  // Set by hand, the corners stay shown when they come to be alike.
  const toggle = (on: boolean) => setToggled({ count, on });
  /** Corner `i` as all selected layers have it; null when they differ. */
  const corner = (i: number) => {
    const values = radii!.map((radius) => cornersOf(radius)[i]);
    return values.every((v) => v === values[0]) ? values[0] : null;
  };
  const uniform = radii && radii.every((radius) => typeof radius === "number" && radius === radii[0]) ? (radii[0] as number) : null;
  return (
    <section class="vk-section" aria-labelledby="vk-appearance">
      <h3 id="vk-appearance" class="vk-section-title">Appearance</h3>
      <div class="vk-grid-2 vk-markable">
        <BreakpointMark properties={["opacity", "radius"]} />
        {opacity !== undefined && <PercentField label="Opacity" icon="opacity" value={opacity === MIXED ? null : opacity} onChange={set("opacity")} />}
        {radii && (
          <div class="vk-row">
            <VariableSlot label="Corner radius" slot={variable("radius")}>
              <NumberField label="Corner radius" icon="radius" value={uniform} min={0} onChange={set("radius")} />
            </VariableSlot>
            <button
              type="button"
              class="vk-icon-button"
              aria-label="Independent corners"
              title="Independent corners"
              aria-pressed={independent}
              onClick={() => toggle(!independent)}
            >
              <Icon name="corners" />
            </button>
          </div>
        )}
      </div>
      {radii && independent && (
        <div class="vk-grid-2" role="group" aria-label="Radius per corner">
          {CORNER_GRID.map((i) => (
            <VariableSlot key={i} label={`${CORNER_NAMES[i]} radius`} slot={variable("radius", CORNER_NAMES[i].toLowerCase().replace(" ", "-"))}>
            <NumberField
              label={`${CORNER_NAMES[i]} radius`}
              glyph={CORNER_GLYPHS[i]}
              value={corner(i)}
              min={0}
              onChange={(value, continues) => {
                toggle(true);
                update("radius", (current) => radiusOf(cornersOf(current).map((r, j) => (i === j ? value : r)) as [number, number, number, number]), continues);
              }}
            />
            </VariableSlot>
          ))}
        </div>
      )}
      {visible !== undefined && (
        <div class="vk-markable">
          {/* Hidden at the breakpoint: shown again where it inherits. */}
          <BreakpointMark properties={["visible"]} />
          <Check label="Visible" checked={visible} onChange={set("visible")} />
        </div>
      )}
      {clip !== undefined && (
        <div class="vk-markable">
          <BreakpointMark properties={["clip"]} />
          <Check label="Clip content" checked={clip} onChange={set("clip")} />
        </div>
      )}
    </section>
  );
}

const TEXT_ALIGNS: { align: TextAlign; label: string }[] = [
  { align: "left", label: "Align left" },
  { align: "center", label: "Align center" },
  { align: "right", label: "Align right" },
  { align: "justify", label: "Justify" },
];

/** Figma's Case, each shown as it makes "Ag" look; As typed leaves the words as written. */
const TEXT_CASES: { textCase: TextCase; label: string; glyph: string }[] = [
  { textCase: "none", label: "As typed", glyph: "—" },
  { textCase: "upper", label: "Upper case", glyph: "AG" },
  { textCase: "lower", label: "Lower case", glyph: "ag" },
  { textCase: "title", label: "Title case", glyph: "Ag" },
];

const DECORATIONS: { decoration: TextDecoration; label: string; glyph: string }[] = [
  { decoration: "none", label: "No decoration", glyph: "—" },
  { decoration: "underline", label: "Underline", glyph: "U" },
  { decoration: "strikethrough", label: "Strikethrough", glyph: "S" },
];

/**
 * Text, as in Figma: the font (one the page has loaded) and its weight (one it
 * has loaded) and size, line height and letter spacing, alignment, case and
 * decoration. Its color is its Fill.
 */
function TextSection({ size, families, weight, lineHeight, letterSpacing, align, textCase, decoration, fonts, fontSize, set, updateEach }: {
  size: Shown<number>;
  /** Each selected layer's font. */
  families: string[];
  weight: Shown<number>;
  lineHeight: Shown<LineHeight>;
  letterSpacing: Shown<TextLength>;
  align: Shown<TextAlign>;
  textCase: Shown<TextCase>;
  decoration: Shown<TextDecoration>;
  /** The fonts the page has: those it can be set in. */
  fonts: Font[];
  /** The font size as a Variable, when the project has them. */
  fontSize: Slot | undefined;
  set: Setter;
  updateEach(next: (layer: Layer) => Partial<PropertyValues>): void;
}) {
  const family = shared(families);
  const loaded = fonts.filter((font) => families.includes(font.family)).flatMap((font) => font.weights);
  // The text's own font and weight show where the page has not loaded them, and cannot be chosen again.
  const names = [...fonts.map((font) => font.family), ...(family === MIXED || fonts.some((font) => font.family === family) ? [] : [family])];
  const weights = [...new Set([...loaded, ...(weight === MIXED ? [] : [weight])])].sort((a, b) => a - b);
  /** A font changed, as in Figma: in the weight the text has, where the font has it loaded, else the nearest that it has. */
  const changeFont = (next: string) => {
    const has = fonts.find((font) => font.family === next)?.weights ?? [];
    updateEach(() => {
      const own = weight === MIXED ? null : weight;
      if (own === null || !has.length || has.includes(own)) return { fontFamily: next };
      return { fontFamily: next, fontWeight: has.reduce((a, b) => (Math.abs(b - own) < Math.abs(a - own) ? b : a)) };
    });
  };
  return (
    <section class="vk-section" role="group" aria-label="Text">
      <h3 class="vk-section-title">Text</h3>
      <div class="vk-markable">
        <BreakpointMark properties={["fontFamily"]} />
        <Choice
          label="Font"
          class="vk-font"
          value={family === MIXED ? null : family}
          options={names.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name, disabled: !fonts.some((font) => font.family === name) }))}
          onChange={changeFont}
        />
      </div>
      <div class="vk-grid-2 vk-markable">
        <BreakpointMark properties={["fontWeight", "fontSize", "lineHeight", "letterSpacing"]} />
        <Choice
          label="Font weight"
          value={weight === MIXED ? null : String(weight)}
          options={weights.map((w) => ({ value: String(w), label: weightName(w), disabled: !loaded.includes(w) }))}
          onChange={(w) => set("fontWeight")(Number(w))}
        />
        <VariableSlot label="Font size" slot={fontSize}>
          <NumberField label="Font size" glyph="Aa" value={number(size)} min={1} onChange={set("fontSize")} />
        </VariableSlot>
        {/* Auto is about 1.2 times the font size: a drag from it starts there. */}
        <TextLengthField label="Line height" glyph="↕" value={lineHeight} min={0} auto={size === MIXED ? 0 : Math.round(size * 1.2)} onChange={set("lineHeight")} />
        <TextLengthField label="Letter spacing" glyph="↔" value={letterSpacing} onChange={(value, continues) => set("letterSpacing")(value as TextLength, continues)} />
      </div>
      <div class="vk-markable">
        <BreakpointMark properties={["textAlign"]} />
        <Segmented label="Text alignment" value={align} options={TEXT_ALIGNS.map(({ align, label }) => ({ value: align, label, content: <Icon name={`align-${align}`} /> }))} onChange={set("textAlign")} />
      </div>
      <div class="vk-row vk-markable">
        <BreakpointMark properties={["textCase", "textDecoration"]} />
        <Segmented
          label="Case"
          value={textCase}
          options={TEXT_CASES.map(({ textCase, label, glyph }) => ({ value: textCase, label, content: <span class="vk-text-glyph">{glyph}</span> }))}
          onChange={set("textCase")}
        />
        <Segmented
          label="Decoration"
          value={decoration}
          options={DECORATIONS.map(({ decoration, label, glyph }) => ({
            value: decoration,
            label,
            content: <span class={`vk-text-glyph vk-${decoration}`}>{glyph}</span>,
          }))}
          onChange={set("textDecoration")}
        />
      </div>
    </section>
  );
}

/** A choice of one of `options`; null shows Mixed. */
function Choice({ label, class: className, value, options, onChange }: {
  label: string;
  class?: string;
  value: string | null;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange(value: string): void;
}) {
  return (
    <select class={`vk-select${className ? ` ${className}` : ""}`} aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value)}>
      {value === null && (
        <option value="" disabled>
          Mixed
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Buttons of which one is on, side by side; Mixed: none of them. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: Shown<T>;
  options: { value: T; label: string; content: ComponentChildren }[];
  onChange(value: T): void;
}) {
  return (
    <div class="vk-segmented-field" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          class="vk-icon-button"
          aria-checked={value === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.content}
        </button>
      ))}
    </div>
  );
}

/**
 * A line height or a letter spacing: in px, or in % of the font size, as
 * typed, and else in the unit it is in; a line height can be Auto. Stepped and
 * dragged in its unit; from Auto, in px from what Auto comes to.
 */
function TextLengthField({ label, glyph, value, min = -Infinity, auto, onChange }: {
  label: string;
  glyph: string;
  value: Shown<LineHeight>;
  min?: number;
  /** A line height: it can be Auto, which comes to this many px. */
  auto?: number;
  onChange(value: LineHeight, continues?: boolean): void;
}) {
  const length = value === MIXED || value === "auto" ? null : value;
  const unit = length?.unit ?? "px";
  const change = (n: number, continues?: boolean) => onChange({ value: Math.max(min, Math.round(n * 100) / 100), unit }, continues);
  return (
    <label class="vk-field" title={label}>
      <Scrub glyph={glyph} value={length?.value ?? (value === "auto" ? auto! : null)} min={min} onChange={change} />
      <TextField
        label={label}
        value={value === MIXED ? "Mixed" : value === "auto" ? "Auto" : `${value.value}${value.unit}`}
        parse={(text): LineHeight | null => {
          if (/^\s*auto\s*$/i.test(text)) return auto === undefined ? null : "auto";
          const n = parseNumber(text, min);
          if (n === null) return null;
          const typed = /(px|%)\s*$/i.exec(text.trim())?.[1].toLowerCase() as TextLength["unit"] | undefined;
          return { value: n, unit: typed ?? unit };
        }}
        step={length ? (by) => change(length.value + by) : value === "auto" ? (by) => change(auto! + by) : undefined}
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
function FillSection({ fill, box, conic, onChange, update, variable }: {
  fill: Shown<Fill | null>;
  /** The first selected layer's box its gradient is sized to, for what the panel shows; each layer changes by its own. */
  box: PaintArea;
  /** Some selected layer has a conic gradient: the fills are shown, and none of them is changed. */
  conic: boolean;
  onChange(fill: Fill | null, continues?: boolean): void;
  update: Update;
  variable: SlotOf;
}) {
  return (
    <section class="vk-section" role="group" aria-label="Fill">
      <div class="vk-section-header vk-markable">
        <BreakpointMark properties={["fill"]} />
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
        <ColorField name="Fill" color={fill} onChange={(color, continues) => onChange({ type: "solid", ...color }, continues)} variable={variable("fill", "color")} />
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
            {/* A center or size the page works out in a way the panel does not show is kept as it is: no fields for it. */}
            {fill.type === "radial" && "center" in fill && <RadialFields gradient={fill} box={box} update={update} />}
            <GradientStops
              gradient={fill}
              length={gradientLength(fill, box)}
              onChange={(stops, continues) => onChange({ ...fill, stops }, continues)}
              variable={(i) => variable("fill", `stop ${i + 1}`)}
            />
          </>
        )
      )}
    </section>
  );
}

/**
 * A radial gradient's center, in % of the layer as Figma places a gradient,
 * and how far it reaches across and down, in px: the same both ways is a
 * circle. Each layer changes by its own box, in the units its page writes them in.
 */
function RadialFields({ gradient, box, update }: { gradient: RadialGradient; box: PaintArea; update: Update }) {
  const radii = radiiOf(gradient, box);
  const change = (next: (current: RadialGradient, value: number, box: PaintArea) => RadialGradient) => (value: number, continues?: boolean) =>
    update("fill", (current, layer) => (current?.type === "radial" && "center" in current ? next(current, value, paintArea(layer.el)) : current), continues);
  return (
    <div class="vk-grid-2">
      {(["x", "y"] as const).map((axis) => (
        <NumberField
          key={axis}
          label={`Center ${axis.toUpperCase()}`}
          glyph={axis.toUpperCase()}
          unit="%"
          value={centerPercent(gradient, axis, box)}
          onChange={change((current, value, box) => withCenter(current, axis, value, box))}
        />
      ))}
      {(["x", "y"] as const).map((axis) => (
        <NumberField
          key={axis}
          label={`Radius ${axis.toUpperCase()}`}
          glyph={axis === "x" ? "↔" : "↕"}
          // To a tenth of a px: a radius typed in px and kept in % reads back as typed.
          value={Math.round(radii[axis] * 10) / 10}
          min={0}
          onChange={change((current, value, box) => withRadius(current, axis, value, box))}
        />
      ))}
    </div>
  );
}

/**
 * A gradient's stops: on a bar showing the gradient, each a handle dragged
 * left and right or moved with the arrow keys (10 with ⇧) and taken off with
 * Delete; a click on the bar adds one there. Below, each stop's position and
 * color. A stop stays in the unit the page writes it in, % or px; the bar shows
 * it where it falls along the gradient, `length` px long. New stops are in %.
 */
function GradientStops({ gradient, length, onChange, variable }: {
  gradient: Gradient;
  length: number;
  onChange(stops: ColorStop[], continues?: boolean): void;
  /** Stop `index`'s color as a Variable, when the project has them. */
  variable(index: number): Slot | undefined;
}) {
  const bar = useRef<HTMLDivElement>(null);
  /** The handle being dragged: the stop, by where it is in the sorted stops as it moves among them, and whether it has moved yet. */
  const drag = useRef<{ pointerId: number; index: number; moved: boolean } | null>(null);
  const { stops } = gradient;
  /** Puts stop `index` at `position` in `unit`, no further back than the start: returns where it is among the stops now. */
  const place = (index: number, position: number, unit: ColorStop["unit"], continues = false) => {
    const moved = stop(stops[index], Math.max(0, unit === "%" ? Math.min(100, position) : position), unit);
    const next = sortedStops(stops.map((s, i) => (i === index ? moved : s)), length);
    onChange(next, continues);
    return next.indexOf(moved);
  };
  /** Where `along` % of the bar is, within it, in `unit`: whole % or whole px. */
  const positionAt = (along: number, unit: ColorStop["unit"]) => {
    const clamped = Math.min(100, Math.max(0, along));
    return Math.round(unit === "%" ? clamped : (clamped / 100) * length);
  };
  const remove = (index: number) => stops.length > 2 && onChange(stops.filter((_, i) => i !== index));
  const add = (along: number) => onChange(sortedStops([...stops, stopAt(stops, along, length)], length));
  const along = (clientX: number) => {
    const box = bar.current!.getBoundingClientRect();
    return ((clientX - box.left) / box.width) * 100;
  };
  const shownAt = (s: ColorStop) => Math.min(100, Math.max(0, alongOf(s, length)));
  const preview = `linear-gradient(90deg, ${stops.map((s) => `${cssColor(s)} ${alongOf(s, length)}%`).join(", ")})`;
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
          add(Math.round(along(event.clientX)));
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
            aria-valuemax={s.unit === "%" ? 100 : Math.round(length)}
            aria-valuenow={s.position}
            aria-valuetext={`${s.position}${s.unit}`}
            style={{ left: `${shownAt(s)}%`, "--vk-stop": cssColor(s) }}
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
              const { unit } = stops[d.index];
              const position = positionAt(along(event.clientX), unit);
              if (position === stops[d.index].position) return;
              d.index = place(d.index, position, unit, d.moved);
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
                place(index, s.position + by * (event.shiftKey ? 10 : 1), s.unit);
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
        <button type="button" class="vk-icon-button" aria-label="Add stop" onClick={() => add(nextStopPosition(stops, length))}>
          <Icon name="plus" />
        </button>
      </div>
      {stops.map((s, index) => (
        <div class="vk-row" key={index} role="group" aria-label={`Stop ${index + 1}`}>
          <label class="vk-field vk-stop-position" title="Position">
            <TextField
              label={`Stop ${index + 1} at`}
              value={`${s.position}${s.unit}`}
              parse={(text) => parseStopPosition(text, s.unit)}
              step={(by) => place(index, s.position + by, s.unit)}
              onChange={({ position, unit }) => place(index, position, unit)}
            />
          </label>
          <ColorField
            name={`Stop ${index + 1}`}
            color={s}
            onChange={(color, continues) => onChange(stops.map((other, i) => (i === index ? stop(color, s.position, s.unit) : other)), continues)}
            variable={variable(index)}
          />
          <button type="button" class="vk-icon-button" aria-label={`Remove stop ${index + 1}`} disabled={stops.length <= 2} onClick={() => remove(index)}>
            <Icon name="minus" />
          </button>
        </div>
      ))}
    </>
  );
}

/** A stop's position typed in: in % or px as typed, else in the unit it is in now; % from 0 to 100, px from 0. */
function parseStopPosition(text: string, unit: ColorStop["unit"]): Pick<ColorStop, "position" | "unit"> | null {
  const typed = /(%|px)\s*$/i.exec(text.trim())?.[1].toLowerCase() as ColorStop["unit"] | undefined;
  const as = typed ?? unit;
  const position = parseNumber(text, 0, as === "%" ? 100 : Infinity);
  return position === null ? null : { position, unit: as };
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
function StrokeSection({ stroke, onChange, update, variable }: {
  stroke: Shown<Stroke | null>;
  onChange(stroke: Stroke | null, continues?: boolean): void;
  update: Update;
  /** The stroke's color as a Variable, when the project has them. */
  variable: Slot | undefined;
}) {
  /** Custom chosen with every side alike: the four sides stay out until another choice. */
  const [custom, setCustom] = useState(false);
  const showToast = useToast();
  /** A weight typed in, in 0.5px steps, and the stroke `make` makes with it: a toast says so when it is rounded. */
  const changeWeight = (typed: number, make: (weight: number) => Stroke | null, continues?: boolean) => {
    const weight = stepped(typed);
    const next = make(weight);
    if (weight !== typed && next) showToast(`Stroke weights go in 0.5px steps: ${typed}px is now ${weight}px.`);
    onChange(next, continues);
  };
  const sides = stroke && stroke !== MIXED ? (custom ? "custom" : sidesOf(stroke.weight)) : null;
  return (
    <section class="vk-section" role="group" aria-label="Stroke">
      <div class="vk-section-header vk-markable">
        <BreakpointMark properties={["stroke"]} />
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
            <ColorField
              name="Stroke"
              color={stroke}
              onChange={(color, continues) => onChange({ ...color, weight: stroke.weight, style: stroke.style }, continues)}
              variable={variable}
            />
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
              onChange={(typed, continues) =>
                changeWeight(typed, (weight) => strokeWith(stroke, typeof stroke.weight === "number" ? weight : stroke.weight.map((w) => (w > 0 ? weight : 0)) as Stroke["weight"]), continues)
              }
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
                onChange={(typed, continues) => changeWeight(typed, (weight) => strokeWith(stroke, weights.map((w, j) => (i === j ? weight : w)) as Stroke["weight"]), continues)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

type BlurProperty = "layerBlur" | "backgroundBlur";
type EffectProperty = "shadows" | BlurProperty;
type EffectValues = Pick<PropertyValues, EffectProperty>;
type EffectUpdate = <P extends EffectProperty>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues?: boolean) => void;
type EffectType = Shadow["type"] | BlurProperty;

const isShadow = (type: EffectType): type is Shadow["type"] => type === "drop" || type === "inner";

const EFFECT_TYPES: { type: EffectType; label: string }[] = [
  { type: "drop", label: "Drop shadow" },
  { type: "inner", label: "Inner shadow" },
  { type: "layerBlur", label: "Layer blur" },
  { type: "backgroundBlur", label: "Background blur" },
];

/**
 * Effects, as in Figma: drop and inner shadows, as many as wanted, first on
 * top; one layer blur and one background blur. Each can be made another type,
 * keeping its blur, and taken off; a new one is a drop shadow, in place of
 * shadows the layers do not share. Text has drop shadows only, with no
 * spread, and no blur: with text selected, the shadows are drop shadows
 * without spread, and a blur only the other layers have shows as Mixed.
 */
function EffectsSection({ shadows, layerBlur, backgroundBlur, withText, variable, colorVariable, read, update, updateEach }: {
  shadows: Shown<Shadow[]>;
  /** Undefined when not all selected layers offer it. */
  layerBlur: Shown<Blur> | undefined;
  backgroundBlur: Shown<Blur> | undefined;
  /** Whether text is among the selected layers. */
  withText: boolean;
  /** The shadows as one Variable, when the project has them: picked, it stands for all of them. */
  variable: Slot | undefined;
  /** The color of shadow `i` as a color Variable, when the project has them. */
  colorVariable(i: number): Slot | undefined;
  /** A layer's effect; a blur on a layer that cannot have one is none. */
  read<P extends EffectProperty>(layer: Layer, property: P): PropertyValues[P];
  /** Changes an effect of each selected layer that can have it. */
  update: EffectUpdate;
  updateEach(next: (layer: Layer) => Partial<EffectValues>): void;
}) {
  const set = <P extends EffectProperty>(property: P) => (value: PropertyValues[P], continues = false) => update(property, () => value, continues);
  const blurs = { layerBlur, backgroundBlur };
  /** Whether an effect of type `from` can become `type`: not a blur the layers have already, or cannot have. */
  const canBecome = (type: EffectType, from: EffectType) => type === from || isShadow(type) || blurs[type] === null;
  /** A shadow changed so that it draws nothing (no offset, blur or spread) is none, as a stroke of weight 0 is. */
  const changeShadow = (i: number, next: (s: Shadow) => Shadow, continues?: boolean) =>
    update("shadows", (current) => current.map((s, j) => (i === j ? shadow(next(s)) : s)).filter(draws), continues);
  /** Shadow `i` made another type: a blur takes its blur. */
  const retypeShadow = (i: number, type: EffectType) => {
    if (isShadow(type)) return changeShadow(i, (s) => ({ ...s, type }));
    updateEach((layer) => {
      const current = read(layer, "shadows");
      return { shadows: current.filter((_, j) => j !== i), [type]: current[i].blur };
    });
  };
  /** A blur made another type, on each layer that has it. */
  const retypeBlur = (from: BlurProperty, type: EffectType) =>
    updateEach((layer) => {
      const value = read(layer, from);
      if (value === null) return {};
      if (isShadow(type)) return { [from]: null, shadows: [...read(layer, "shadows"), shadow({ ...NEW_SHADOW, type, blur: value })] };
      return { [from]: null, [type]: value };
    });
  const typeSelect = (label: string, from: EffectType, onChange: (type: EffectType) => void) => (
    <select class="vk-select vk-effect-type" aria-label={label} value={from} onChange={(event) => onChange(event.currentTarget.value as EffectType)}>
      {/* Text draws drop shadows only. */}
      {EFFECT_TYPES.filter(({ type }) => !withText || type === "drop" || type === from).map(({ type, label }) => (
        <option key={type} value={type} disabled={!canBecome(type, from)}>
          {label}
        </option>
      ))}
    </select>
  );
  return (
    <section class="vk-section" role="group" aria-label="Effects">
      <div class="vk-section-header vk-markable">
        {/* The shadows, text's among them, and the blurs: a blur taken off at the breakpoint has no row of its own there. */}
        <BreakpointMark properties={["shadows", "textShadows", "layerBlur", "backgroundBlur"]} />
        <h3 class="vk-section-title">Effects</h3>
        <div class="vk-row">
          {!variable?.bound && <VariableSlot label="Shadow" slot={variable}>{null}</VariableSlot>}
          <button type="button" class="vk-icon-button" aria-label="Add effect" onClick={() => update("shadows", (current) => (shadows === MIXED ? [NEW_SHADOW] : [...current, NEW_SHADOW]))}>
            <Icon name="plus" />
          </button>
        </div>
      </div>
      {variable?.bound ? (
        // A shadow Variable stands for the shadows, as an effect style does in Figma.
        <VariableSlot label="Shadow" slot={variable}>{null}</VariableSlot>
      ) : shadows === MIXED ? (
        <div class="vk-row">
          <span class="vk-field vk-mixed">Mixed shadows</span>
          <button type="button" class="vk-icon-button" aria-label="Remove shadows" onClick={() => set("shadows")([])}>
            <Icon name="minus" />
          </button>
        </div>
      ) : (
        shadows.map((s, i) => {
          const name = `Shadow ${i + 1}`;
          const lengthField = (key: "x" | "y" | "blur" | "spread", label: string, glyph: string, min?: number) => (
            <NumberField
              label={`${name} ${label}`}
              glyph={glyph}
              value={s[key]}
              min={min}
              onChange={(value, continues) => changeShadow(i, (current) => ({ ...current, [key]: value }), continues)}
            />
          );
          return (
            // Rows made again when a shadow comes or goes: a drag that took a shadow off ends there, and does not go on in the next one.
            <div class="vk-effect" key={`${shadows.length}:${i}`} role="group" aria-label={name}>
              <div class="vk-row">
                {typeSelect(`${name} type`, s.type, (type) => retypeShadow(i, type))}
                <button type="button" class="vk-icon-button" aria-label={`Remove shadow ${i + 1}`} onClick={() => update("shadows", (current) => current.filter((_, j) => j !== i))}>
                  <Icon name="minus" />
                </button>
              </div>
              <div class="vk-grid-2">
                {lengthField("x", "X", "X")}
                {lengthField("y", "Y", "Y")}
                {lengthField("blur", "blur", "B", 0)}
                {!withText && lengthField("spread", "spread", "S")}
              </div>
              <ColorField name={name} color={s} onChange={(color, continues) => changeShadow(i, (current) => ({ ...current, ...color }), continues)} variable={colorVariable(i)} />
            </div>
          );
        })
      )}
      {(["layerBlur", "backgroundBlur"] as const).map((property) => {
        const value = blurs[property];
        if (value === undefined || value === null) return null;
        const label = EFFECT_TYPES.find(({ type }) => type === property)!.label;
        return (
          <div class="vk-effect" key={property} role="group" aria-label={label}>
            <div class="vk-row">
              {typeSelect(`${label} type`, property, (type) => retypeBlur(property, type))}
              <button type="button" class="vk-icon-button" aria-label={`Remove ${label.toLowerCase()}`} onClick={() => set(property)(null)}>
                <Icon name="minus" />
              </button>
            </div>
            <NumberField label={label} glyph="B" value={typeof value === "number" ? value : null} min={0} onChange={set(property)} />
          </div>
        );
      })}
    </section>
  );
}

/**
 * A color and its opacity: picked, or typed as hex and as a percentage. `name`
 * names its fields: "Fill color", "Fill opacity". Where the project has color
 * Variables, its swatch opens a picker with a Variables tab, as in Figma, and a
 * Variable picked shows by name in place of the hex and opacity.
 */
function ColorField({ name, color, onChange, variable }: { name: string; color: Color; onChange(color: Color, continues?: boolean): void; variable?: Slot }) {
  /** The color picker is open and has moved: the colors it goes through are one adjustment. */
  const picking = useRef(false);
  const catalog = useCatalog();
  /** The swatch or the Variable's name the picker is open from. */
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const lower = name.toLowerCase();
  const offered = variable && catalog?.of("color").length ? variable : undefined;
  const system = (
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
  );
  const hex = <TextField label={`${name} color`} value={color.color.slice(1)} parse={parseHex} onChange={(hex) => onChange({ color: hex, opacity: color.opacity })} />;
  const typed = (
    <>
      {offered ? (
        <TypingProvider
          value={{
            group: "color",
            selection: offered.selection,
            read: (text) => {
              const hex = parseHex(text);
              return hex ? { color: hex, opacity: color.opacity } : null;
            },
            naming: namesColor,
            onPick: offered.onPick,
          }}
        >
          {hex}
        </TypingProvider>
      ) : (
        hex
      )}
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
    </>
  );
  if (!offered) {
    return (
      <div class="vk-field vk-color-field">
        {system}
        {typed}
      </div>
    );
  }
  const toggle = (event: { currentTarget: HTMLElement }) => setOpen(open ? null : event.currentTarget);
  return (
    <div class="vk-field vk-color-field">
      <button
        type="button"
        class="vk-swatch vk-swatch-button"
        aria-label={`${name} color picker`}
        aria-haspopup="dialog"
        style={{ "--vk-swatch": cssColor(color) }}
        onClick={toggle}
      />
      {offered.bound ? (
        <>
          <button type="button" class="vk-variable-chip-name" aria-label={`${name} color variable`} aria-haspopup="dialog" title={`${offered.bound.name}: ${offered.bound.value}`} onClick={toggle}>
            {offered.bound.name}
          </button>
          <button type="button" class="vk-icon-button" aria-label={`Detach ${lower} color variable`} title="Detach variable" onClick={() => offered.onPick(null)}>
            <Icon name="detach" />
          </button>
        </>
      ) : (
        typed
      )}
      {open && (
        <ColorPicker
          label={name}
          anchor={open}
          slot={offered}
          custom={
            <label class="vk-field">
              {system}
              <span class="vk-read-only">{color.color}</span>
            </label>
          }
          onClose={() => setOpen(null)}
        />
      )}
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
  /** Shown after the number: "%". */
  unit?: string;
  min?: number;
  /** `continues`: one more step of a drag on the icon. */
  onChange(value: number, continues?: boolean): void;
}

/** A number typed in, stepped with ↑ / ↓, or dragged on its icon (10 at a time with ⇧). */
export function NumberField({ label, icon, glyph, value, unit = "", min = -Infinity, onChange }: NumberFieldProps) {
  return (
    <label class="vk-field" title={label}>
      <Scrub icon={icon} glyph={glyph} value={value} min={min} onChange={onChange} />
      <TextField
        label={label}
        value={value === null ? "Mixed" : `${value}${unit}`}
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
  const [draft, setShownDraft] = useState<string | null>(null);
  /** The draft as of now, for a blur that follows at once: Esc drops it before the blur would apply it. */
  const draftNow = useRef<string | null>(null);
  const setDraft = (text: string | null) => {
    draftNow.current = text;
    setShownDraft(text);
  };
  /** Set on focus: where the typed value goes. */
  const target = useRef(onChange);
  const input = useRef<HTMLInputElement>(null);
  /** Where the field's value can be a Variable: those found as it is typed into. */
  const typeahead = useTypeahead({ text: draft, value, input, reset: () => setDraft(null) });

  const commit = () => {
    const typed = draftNow.current;
    if (typed === null) return;
    setDraft(null);
    const parsed = parse(typed);
    if (parsed !== null && typed !== value) {
      target.current(parsed);
      typeahead.applied(typed);
    }
  };

  const onKeyDown = (event: TargetedKeyboardEvent<HTMLInputElement>) => {
    if (typeahead.keyDown(event)) return;
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
    <>
    <input
      ref={input}
      type="text"
      class={`vk-input${className ? ` ${className}` : ""}`}
      aria-label={label}
      {...typeahead.input}
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
    {typeahead.after}
    </>
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
