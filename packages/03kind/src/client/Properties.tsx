/** @jsxImportSource preact */
import type { ComponentChildren, TargetedFocusEvent, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Editor, SetOptions } from "./edit-commands";
import type { Align, Alignment, ColorStop, Fill, Gradient, Padding, Property, PropertyValues, Radius, Size, Stroke } from "./property-table";
import { ChangeMarksProvider, NO_MARKS, ResetButton, resetJustClicked, STACK_PROPERTIES, useChangeMarks, type ChangeMarks, type ValuePart } from "./ChangeMarks";
import { matchItems } from "./list-match";
import { Icon, type IconName } from "./icons";
import { DIGIT_BLUR_PX, DIGIT_FADE_MS, DIGIT_ROLL_EM, DIGIT_ROLL_MS, EASE_OUT, FIELD_SETTLE_MS, GRIP_SWAY_MAX_PX, prefersReducedMotion, RESET_POP_MS } from "./motion";
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
import { holdPointer } from "./pointer-held";
import { MenuButton, Select, type MenuItem } from "./Select";
import { stepped } from "./stroke-weight";
import { useToast } from "./Toast";
import { fontsOf, type Font, type LineHeight, type TextAlign, type TextCase, type TextDecoration, type TextLength } from "./typography";
import { weightName } from "../design-values";
import { ColorPanel } from "./ColorPanel";
import { ColorPicker, namesColor, Preview, TypingProvider, useCatalog, useTypeahead, VariableSlot, type Slot } from "./VariablePicker";
import { ShadowDetails } from "./VariantsPanel";
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
  /** The fill's picker opened, or closed, on a gradient: its handles show on the canvas while it is open. */
  onGradientPicker?(open: boolean): void;
}

/** A fill added to a layer that has none, as in Figma. */
const NEW_FILL: Fill = { type: "solid", color: "#FFFFFF", opacity: 1 };
/** A stroke added to a layer that has none, as in Figma. Fields in the order the editor reads them back in. */
const NEW_STROKE: Stroke = { color: "#000000", opacity: 1, weight: 1, style: "solid" };

/** An effect added, as in Figma: a drop shadow. Fields in the order the editor reads them back in. */
const NEW_SHADOW: Shadow = { type: "drop", x: 0, y: 4, blur: 4, spread: 0, color: "#000000", opacity: 0.25 };
/** A layer or background blur added, as in Figma, in px. */
const NEW_BLUR = 4;

/** Set while a field hands on one step of a run of them (`asStep`). */
let stepping = false;

/**
 * Hands on what `change` sets as one step of a run of them: a key held or
 * pressed again and again, a drag on a number or a gradient stop. Any other
 * value is set once (typed, toggled, chosen, picked): the views beside the one
 * worked in show it after the next frame, not once the steps pause (ADR 0011).
 */
export function asStep(change: () => void) {
  const was = stepping;
  stepping = true;
  try {
    change();
  } finally {
    stepping = was;
  }
}

/** How a value is set now: `continues` the adjustment under way or not, and whether it is one step of a run (`asStep`). */
export function stepOptions(continues: boolean): SetOptions {
  return { continues, step: stepping };
}

/** A value the selected layers do not share: shown as Mixed. */
const MIXED = Symbol("mixed");
type Shown<T> = T | typeof MIXED;

/**
 * The Design panel's properties for the selected layers, in design language.
 * With several selected, only what all of them offer shows, and a value they
 * do not share shows as Mixed; a change goes to each of them, as one edit.
 */
export function Properties({ editor, layers, onEdit, onStack, onDissolve, onGradientPicker }: Props) {
  /** The minimums and maximums added with the width field's menu, not set yet (designer, 2026-11-07); gone again for another selection. */
  const [limitsAdded, setLimitsAdded] = useState<{ key: string; added: Limit[] }>({ key: "", added: [] });
  const added = limitsAdded.key === keyOf(layers) ? limitsAdded.added : [];
  const setAdded = (next: Limit[]) => setLimitsAdded({ key: keyOf(layers), added: next });
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
    }, stepOptions(continues));
    onEdit();
  };
  const set = <P extends Property>(property: P) => (value: PropertyValues[P], continues = false) => update(property, () => value, continues);

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
    }, stepOptions(continues));
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
  /** The minimums and maximums shown: those some selected layer has, and those just added. */
  const limits = offers("minWidth") ? LIMITS.filter((property) => added.includes(property) || layers.some((layer) => editor.read(layer, property) !== null)) : [];
  /** In the width or height field, at its end: the menu that adds its minimum or maximum, while one is left to add; shown on hover (designer, 2026-11-07). */
  const addLimit = (axis: "width" | "height") => {
    const addable = offers("minWidth") ? LIMITS.filter((property) => LIMIT_AXES[property] === axis && !limits.includes(property)) : [];
    return (
      addable.length > 0 && (
        // A minimum or maximum, chosen from a menu, as in Figma; it comes in as a row of its own.
        <MenuButton
          class="tk-field-action"
          label={`Add min or max ${axis}`}
          icon="plus"
          items={addable.map((property) => ({ value: property, label: LIMIT_LABELS[property] }))}
          onChoose={(value) => setAdded([...added, value as Limit])}
        />
      )
    );
  };
  /** Takes a minimum or maximum off its layers, and its row away. */
  const removeLimit = (property: Limit) => {
    setAdded(added.filter((other) => other !== property));
    if (layers.some((layer) => editor.read(layer, property) !== null)) set(property)(null);
  };
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
  const marks = useChangeMarks();
  return (
    <>
      {locked && <p class="tk-layer-note tk-section">A locked layer comes from a dependency. It can only be moved and resized as a whole.</p>}
      {x !== undefined && y !== undefined && (
        <section class="tk-section" aria-labelledby="tk-position">
          <div class="tk-section-header">
            <h3 id="tk-position" class="tk-section-title">Position</h3>
            <SectionReset title="Position" properties={["x", "y"]} />
          </div>
          <div class="tk-grid-2">
            <NumberField label="X" glyph="X" property="x" value={number(x)} onChange={set("x")} />
            <NumberField label="Y" glyph="Y" property="y" value={number(y)} onChange={set("y")} />
          </div>
        </section>
      )}
      {(width !== undefined || height !== undefined) && (
        <section class="tk-section" aria-labelledby="tk-size">
          <div class="tk-section-header">
            <h3 id="tk-size" class="tk-section-title">Size</h3>
            {/* A size row is one operation, its number and sizing together, as its one reset takes them; each minimum or maximum, another. */}
            <SectionReset title="Size" properties={[...(width !== undefined ? ["width" as const] : []), ...(height !== undefined ? ["height" as const] : []), ...limits]} />
          </div>
          {width !== undefined && (
            <SizeRow
              axis="width"
              size={width}
              layers={layers}
              offers={offers}
              measure={editor.measure}
              update={update}
              variable={variable("width")}
              after={addLimit("width")}
            />
          )}
          {height !== undefined && (
            <SizeRow axis="height" size={height} layers={layers} offers={offers} measure={editor.measure} update={update} variable={variable("height")} after={addLimit("height")} />
          )}
          {limits.map((property) => {
            // Each its own row, with its button to take it off.
            const label = LIMIT_LABELS[property];
            // Set in this round where there was none: its field unmarked, its − in the accent (designer, 2026-11-08).
            const addedHere = marks.added(property);
            return (
              <div key={property} class="tk-row tk-paint-row">
                <ChangeMarksProvider value={addedHere ? NO_MARKS : marks}>
                  <VariableSlot label={label} slot={variable(property)} property={property}>
                    <LimitField label={label} icon={LIMIT_ICONS[property]} property={property} value={shown(property)!} onChange={set(property)} />
                  </VariableSlot>
                </ChangeMarksProvider>
                <RemoveButton label={`Remove ${label.toLowerCase()}`} added={addedHere} onClick={() => removeLimit(property)} />
              </div>
            );
          })}
        </section>
      )}
      {direction === undefined && (layers.length > 1 || layers[0].kind === "frame") && editor.canStack(layers) && (
        <section class="tk-section" role="group" aria-label="Stack">
          <div class="tk-section-header">
            <h3 class="tk-section-title">Stack</h3>
            <button type="button" class="tk-icon-button" aria-label="Make Stack" data-tk-tip="Make Stack (⇧A)" onClick={onStack}>
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
        <section class="tk-section" aria-labelledby="tk-padding">
          <div class="tk-section-header">
            <h3 id="tk-padding" class="tk-section-title">Padding</h3>
            <SectionReset title="Padding" properties={["padding"]} operations={PADDING_SIDES} />
          </div>
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
        />
      )}
      {textColor !== undefined && (
        // Text is filled with its color, as in Figma.
        <section class="tk-section" role="group" aria-label="Fill">
          <div class="tk-section-header">
            <h3 class="tk-section-title">Fill</h3>
            <SectionReset title="Fill" properties={["textColor"]} />
          </div>
          {textColor === MIXED ? <span class="tk-field tk-mixed">Mixed</span> : <ColorField name="Fill" property="textColor" color={textColor} onChange={set("textColor")} variable={variable("textColor")} />}
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
          onGradientPicker={onGradientPicker}
        />
      )}
      {stroke !== undefined && <StrokeSection key={keyOf(layers)} stroke={stroke} onChange={set("stroke")} update={update} variable={variable("stroke", "color")} />}
      {shadows !== undefined && (
        // A text layer keeps its shadows as text shadows: its fields marked and reset by them as by a box's shadows.
        <ChangeMarksProvider value={texts.length ? withTextShadows(marks) : marks}>
          <EffectsSection
            // Its blurs' places among the shadows are for these layers: others selected, it starts afresh.
            key={keyOf(layers)}
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
        </ChangeMarksProvider>
      )}
    </>
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
const LIMIT_ICONS: Record<keyof typeof LIMIT_LABELS, IconName> = { minWidth: "min-width", minHeight: "min-height", maxWidth: "max-width", maxHeight: "max-height" };
type Limit = keyof typeof LIMIT_LABELS;
/** Which field's menu adds each. */
const LIMIT_AXES: Record<Limit, "width" | "height"> = { minWidth: "width", maxWidth: "width", minHeight: "height", maxHeight: "height" };
/** The minimums and maximums, in the order the menus list them and the panel shows them. */
const LIMITS: Limit[] = ["minWidth", "maxWidth", "minHeight", "maxHeight"];

type Update = <P extends Property>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues?: boolean) => void;
type Setter = <P extends Property>(property: P) => (value: PropertyValues[P], continues?: boolean) => void;

const SIZINGS = [
  { type: "fixed", label: "Fixed" },
  { type: "hug", label: "Hug" },
  { type: "fill", label: "Fill" },
] as const;

/** Width or height: Fixed, Hug or Fill, and the size it comes to. Typing a size makes it Fixed. */
function SizeRow({ axis, size, layers, offers, measure, update, variable, after }: {
  axis: "width" | "height";
  /** Inside its field, at the end: the menu that adds its minimum or maximum. */
  after?: ComponentChildren;
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
  // Fixed, the size as set (a size typed in stays as typed); otherwise as it comes to.
  const shownSize = size !== MIXED && size.type === "fixed" ? size.value : sizes.every((s) => s === sizes[0]) ? sizes[0] : null;
  const marks = useChangeMarks();
  // Its sizing changed (Hug to Fixed, say): the choice is marked; the number too when it came to another size, dragged or typed (designer, 2026-11-08).
  const sizingChanged = marks.changed(axis, SIZING);
  const sizeChanged = sizingChanged ? size !== MIXED && size.type === "fixed" && marks.changed(axis, sizeOf(layers, axis)) : marks.changed(axis);
  return (
    <div class="tk-row tk-size-row">
      {/* One reset takes the number and its sizing back together: it stands at the row's left, outside them, the two marked with none of their own (designer, 2026-11-08). */}
      {(sizeChanged || sizingChanged) && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([axis])} />}
      <VariableSlot label={label} slot={variable} property={axis} rowReset>
        <NumberField
          label={label}
          glyph={label}
          property={sizeChanged ? axis : undefined}
          rowReset
          after={after}
          value={shownSize}
          min={0}
          onChange={(value, continues) => update(axis, () => ({ type: "fixed", value }), continues)}
        />
      </VariableSlot>
      <span class={`tk-select-field${sizingChanged ? " is-changed" : ""}`}>
        <Select
          class="tk-select"
          aria-label={`${label} sizing`}
          value={size === MIXED ? "" : size.type}
          onChange={(event) => {
            const type = event.currentTarget.value as Size["type"];
            // Fixed at the size it comes to now.
            update(axis, (_, layer) => {
              if (type !== "fixed") return { type };
              const value = Math.round(measure(layer)[axis] * 100) / 100;
              fixedAt(layer, axis).add(value);
              return { type, value };
            });
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
        </Select>
      </span>
    </div>
  );
}

/** A size's sizing, Fixed, Hug or Fill: its own part of the size, as the choice beside the number shows it. */
const SIZING: ValuePart = { of: (value) => (value as Size | null)?.type, back: (_, before) => before };

/** The sizes the sizing choice fixed each layer at: the size it came to then, unchanged. */
const FIXED_AT = new WeakMap<Element, { width: Set<number>; height: Set<number> }>();
function fixedAt(layer: Layer, axis: "width" | "height"): Set<number> {
  let sizes = FIXED_AT.get(layer.el);
  if (!sizes) FIXED_AT.set(layer.el, (sizes = { width: new Set(), height: new Set() }));
  return sizes[axis];
}

/** The number of a size, as the layers came to it: a size fixed by the sizing choice, at the size it was, is the one it had. */
function sizeOf(layers: Layer[], axis: "width" | "height"): ValuePart {
  const unchanged = new Set(layers.flatMap((layer) => [...fixedAt(layer, axis)]));
  return {
    of: (value) => {
      const size = value as Size | null;
      return size?.type === "fixed" && !unchanged.has(size.value) ? size.value : "as it was";
    },
    back: (_, before) => before,
  };
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
  const outer = useChangeMarks();
  // Made a Stack in this round: an item added, its fields unmarked, with no resets; its − alone in the accent, which takes the Stack back out (designer, 2026-11-08).
  const added = outer.stacked();
  // The chosen point dark till the alignment changes in this round, then the accent; the point it was at before, drawn larger (designer, 2026-11-08).
  const marks = added ? NO_MARKS : outer;
  // The point alone: the gap's Auto, kept in the alignment too, marks the gap's field, not the grid.
  const changed = marks.changed("align", ALIGN_POINT);
  const was = changed ? (marks.before("align") as Align | null) : null;
  // Wrap is clicked again to go back: marked, with no reset of its own (designer, 2026-11-08). The direction, a segmented group, has its own, and counts for the section's reset too.
  const wrapChanged = marks.changed("wrap");
  return (
    <ChangeMarksProvider value={marks}>
    <section class="tk-section" aria-labelledby="tk-stack">
      <div class="tk-section-header">
        <h3 id="tk-stack" class="tk-section-title">Stack</h3>
        <SectionReset
          title="Stack"
          properties={STACK_PROPERTIES}
          operations={[{ property: "direction" }, { property: "wrap" }, { property: "align", part: ALIGN_POINT }, { property: "align", part: DISTRIBUTE }, { property: "gap" }, ...PADDING_SIDES]}
        />
        {added ? (
          <RemoveButton label="Dissolve Stack" added onClick={() => outer.unstack()} />
        ) : (
          dissolve && <RemoveButton label="Dissolve Stack" title="Dissolve Stack (⌥⇧A)" onClick={dissolve} />
        )}
      </div>
      {/* As the designer drew it (2026-11-07): the alignment at the left; the gap, then the direction and wrap, beside it. */}
      <div class="tk-row tk-align-row">
        <div class={`tk-align${changed ? " is-changed" : ""}`} role="radiogroup" aria-label="Alignment">
          {ALIGNMENTS.map((y) =>
            ALIGNMENTS.map((x) => {
              const name = y === "center" && x === "center" ? "Center" : `${ROWS[y]} ${COLUMNS[x]}`;
              const checked = align !== MIXED && align.x === x && align.y === y;
              const before = !!was && was.x === x && was.y === y;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  class={`tk-align-point${before ? " is-before" : ""}`}
                  aria-checked={checked}
                  aria-label={name}
                  onClick={() => update("align", (current) => ({ ...current, x, y }))}
                />
              );
            }),
          )}
        </div>
        <div class="tk-align-options">
          <GapField gap={gap} align={align} set={set} update={update} variable={variable} />
          <div class="tk-row">
            {/* Marked as the Text's groups: its track in the accent, its reset at its right end (designer, 2026-11-08). */}
            <Segmented
              label="Direction"
              property="direction"
              value={direction}
              options={(["horizontal", "vertical"] as const).map((d) => ({
                value: d,
                label: d === "horizontal" ? "Horizontal" : "Vertical",
                content: <Icon name={d === "horizontal" ? "stack-horizontal" : "stack-vertical"} />,
              }))}
              onChange={set("direction")}
            />
            {/* Wrap: a button that stays on, as Figma's; Mixed shows it off. */}
            <button
              type="button"
              class={`tk-icon-button${wrapChanged ? " is-changed" : ""}`}
              aria-label="Wrap"
              data-tk-tip="Wrap"
              aria-pressed={wrap === true}
              onClick={() => set("wrap")(wrap !== true)}
            >
              <Icon name="wrap" />
            </button>
          </div>
        </div>
      </div>
      <PaddingFields padding={padding} update={update} variable={variable} />
    </section>
    </ChangeMarksProvider>
  );
}

/**
 * An item's −, taking it off. Added in this round, it alone is marked: in the accent, as a button that stays on (Wrap, on),
 * and taking it off takes the addition back (designer, 2026-11-08).
 */
function RemoveButton({ label, title, added = false, disabled, onClick }: { label: string; title?: string; added?: boolean; disabled?: boolean; onClick(): void }) {
  return (
    <button type="button" class={`tk-icon-button${added ? " is-added" : ""}`} aria-label={label} data-tk-tip={title ?? label} disabled={disabled} onClick={onClick}>
      <Icon name="minus" />
    </button>
  );
}

/**
 * The gap between a Stack's layers: a number, or Auto, as Figma has it: its
 * layers spread to fill the Stack, the space between them even (what
 * Distribute evenly was). The chevron at its end chooses.
 */
function GapField({ gap, align, set, update, variable }: { gap: Shown<number>; align: Shown<Align>; set: Setter; update: Update; variable: SlotOf }) {
  const marks = useChangeMarks();
  const auto = align === MIXED ? MIXED : align.distribute;
  const mode = (
    <Select
      class="tk-select tk-gap-mode"
      aria-label="Gap sizing"
      value={auto === MIXED ? "" : auto ? "auto" : "fixed"}
      onChange={(event) => update("align", (current) => ({ ...current, distribute: event.currentTarget.value === "auto" }))}
    >
      {auto === MIXED && (
        <option value="" disabled>
          Mixed
        </option>
      )}
      <option value="fixed">Fixed</option>
      <option value="auto">Auto</option>
    </Select>
  );
  if (auto === true) {
    // Auto, as the alignment keeps it: marked when that part of it changed, the point left as it is.
    const changed = marks.changed("align", DISTRIBUTE);
    return (
      <div class={`tk-field${changed ? " is-changed" : ""}`} data-tk-tip="Gap">
        <Icon name="gap" />
        <span class="tk-input tk-auto">Auto</span>
        {mode}
        {changed && <ResetButton label="gap" onReset={() => marks.reset(["align"], DISTRIBUTE)} />}
      </div>
    );
  }
  return (
    <VariableSlot label="Gap" slot={variable("gap")} property="gap">
      <NumberField label="Gap" icon="gap" property="gap" value={number(gap)} min={0} onChange={set("gap")} after={mode} />
    </VariableSlot>
  );
}

/** Padding on each side, top, right, bottom, left. */
function PaddingFields({ padding, update, variable }: { padding: Shown<Padding>; update: Update; variable: SlotOf }) {
  const side = (i: number) => (padding === MIXED ? null : padding[i]);
  const setSide = (i: number) => (value: number, continues?: boolean) =>
    update("padding", (current) => current.map((p, j) => (i === j ? value : p)) as Padding, continues);
  return (
    <div class="tk-grid-2" role="group" aria-label="Padding">
      {["Top", "Right", "Bottom", "Left"].map((name, i) => (
        <VariableSlot key={name} label={`Padding ${name.toLowerCase()}`} slot={variable("padding", name.toLowerCase())} property="padding" part={i}>
          <NumberField label={`Padding ${name.toLowerCase()}`} icon={`padding-${name.toLowerCase()}` as IconName} property="padding" part={i} value={side(i)} min={0} onChange={setSide(i)} />
        </VariableSlot>
      ))}
    </div>
  );
}

/** Each side of the padding, its own field: each its own operation for a section's reset. */
const PADDING_SIDES: Operation[] = [0, 1, 2, 3].map((part) => ({ property: "padding", part }));

/** A Stack's alignment point, the part of its alignment the grid shows. */
const ALIGN_POINT: ValuePart = {
  of: (value) => (value ? [(value as Align).x, (value as Align).y] : null),
  back: (value, before) => (value && before ? { ...(value as Align), x: (before as Align).x, y: (before as Align).y } : before),
};
/** Whether a Stack's layers spread to fill it (the gap's Auto): the part of its alignment the gap's field shows. */
const DISTRIBUTE: ValuePart = {
  of: (value) => (value ? (value as Align).distribute : null),
  back: (value, before) => (value && before ? { ...(value as Align), distribute: (before as Align).distribute } : before),
};

/**
 * A checkbox; Mixed shows as neither checked nor not. `property`: the one it
 * sets, marked when changed in this round. Clicked again it goes back, so it
 * has no reset of its own (designer, 2026-11-08); a section's reset takes it back.
 */
function Check({ label, checked, onChange, property }: { label: string; checked: Shown<boolean>; onChange(checked: boolean): void; property?: Property }) {
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property);
  return (
    <label class={`tk-check${changed ? " is-changed" : ""}`}>
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
function LimitField({ label, icon, value, onChange, property }: {
  label: string;
  icon: IconName;
  value: Shown<number | null>;
  onChange(value: number | null): void;
  /** Marked when changed in this round (`ChangeMarks`). */
  property?: Property;
}) {
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property);
  return (
    <label class={`tk-field${changed ? " is-changed" : ""}`} data-tk-tip={label}>
      <Icon name={icon} />
      <TextField
        label={label}
        value={value === MIXED ? "Mixed" : value === null ? "" : String(value)}
        placeholder="None"
        parse={(text) => (text.trim() === "" ? { value: null } : (n => (n === null ? null : { value: n }))(parseNumber(text, 0)))}
        onChange={({ value }) => onChange(value)}
      />
      {changed && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property!])} />}
    </label>
  );
}

/** A value from 0 to 1, shown and typed as a percentage, and dragged on its icon or grip 1% per 2px (10% with ⇧). */
function PercentField({ label, icon, value, onChange, property }: {
  label: string;
  icon: IconName;
  value: number | null;
  onChange(value: number, continues?: boolean): void;
  /** Marked when changed in this round (`ChangeMarks`). */
  property?: Property;
}) {
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property);
  const scrubbed = { value: value === null ? null : Math.round(value * 100), min: 0, max: 100, onChange: (percent: number, continues: boolean) => onChange(percent / 100, continues) };
  return (
    <label class={`tk-field${changed ? " is-changed" : ""}`} data-tk-tip={label}>
      <Scrub icon={icon} {...scrubbed} />
      <TextField
        label={label}
        rolls
        value={value === null ? "Mixed" : `${Math.round(value * 100)}%`}
        parse={(text) => {
          const percent = parseNumber(text, 0, 100);
          return percent === null ? null : percent / 100;
        }}
        step={(by) => onChange(Math.min(1, Math.max(0, Math.round(((value ?? 1) * 100 + by)) / 100)))}
        onChange={onChange}
      />
      <Scrub grip {...scrubbed} />
      {changed && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property!])} />}
    </label>
  );
}

const CORNER_NAMES = ["Top left", "Top right", "Bottom right", "Bottom left"];
/** The corners as they sit in a 2 × 2 grid: top left, top right, bottom left, bottom right. */
const CORNER_GRID = [0, 1, 3, 2];
/** Each corner's icon, in the order of a radius: top left first, clockwise. */
const CORNER_ICONS: IconName[] = ["corner-top-left", "corner-top-right", "corner-bottom-right", "corner-bottom-left"];

/** A radius's corners: top left, top right, bottom right, bottom left. */
function cornersOf(radius: Radius): [number, number, number, number] {
  return typeof radius === "number" ? [radius, radius, radius, radius] : radius;
}

/** Corners as the editor reads them back: all alike are one radius. */
function radiusOf(corners: [number, number, number, number]): Radius {
  return corners.every((r) => r === corners[0]) ? corners[0] : corners;
}

/** Each corner of a radius, in the order of a radius: marked and reset on its own, as its field shows it. */
const CORNER_PARTS: ValuePart[] = [0, 1, 2, 3].map((i) => ({
  of: (value) => (value === null || value === undefined ? null : cornersOf(value as Radius)[i]),
  back: (value, before) => {
    if (value === null || value === undefined || before === null || before === undefined) return before;
    const was = cornersOf(before as Radius)[i];
    return radiusOf(cornersOf(value as Radius).map((r, j) => (i === j ? was : r)) as [number, number, number, number]);
  },
}));

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
  /** What the section's reset counts: the corner radius one operation, or, its corners shown, each corner its own; the field for all of them shows theirs. */
  const operations: Operation[] = [
    ...(opacity !== undefined ? [{ property: "opacity" as const }] : []),
    ...(radii ? (independent ? CORNER_PARTS.map((part) => ({ property: "radius" as const, part })) : [{ property: "radius" as const }]) : []),
    ...(visible !== undefined ? [{ property: "visible" as const }] : []),
    ...(clip !== undefined ? [{ property: "clip" as const }] : []),
  ];
  return (
    <section class="tk-section" aria-labelledby="tk-appearance">
      <div class="tk-section-header">
        <h3 id="tk-appearance" class="tk-section-title">Appearance</h3>
        <SectionReset title="Appearance" properties={operations.map(({ property }) => property)} operations={operations} />
      </div>
      {/* The fields first, then the checks, two to a row: opacity beside the corner radius, Visible beside Clip content; with no radius, opacity beside Visible (designer, 2026-11-08). A check alone at the end takes the whole row. */}
      <div class="tk-grid-2">
        {opacity !== undefined && <PercentField label="Opacity" icon="opacity" property="opacity" value={opacity === MIXED ? null : opacity} onChange={set("opacity")} />}
        {radii && (
          <div class="tk-row">
            <VariableSlot label="Corner radius" slot={variable("radius")} property="radius">
              <NumberField label="Corner radius" icon="radius" property="radius" value={uniform} min={0} onChange={set("radius")} />
            </VariableSlot>
            <button
              type="button"
              class="tk-icon-button"
              aria-label="Independent corners"
              data-tk-tip="Independent corners"
              aria-pressed={independent}
              onClick={() => toggle(!independent)}
            >
              <Icon name="corners" />
            </button>
          </div>
        )}
        {visible !== undefined && <Check label="Visible" property="visible" checked={visible} onChange={set("visible")} />}
        {clip !== undefined && <Check label="Clip content" property="clip" checked={clip} onChange={set("clip")} />}
      </div>
      {radii && independent && (
        <div class="tk-grid-2" role="group" aria-label="Radius per corner">
          {CORNER_GRID.map((i) => (
            <VariableSlot key={i} label={`${CORNER_NAMES[i]} radius`} slot={variable("radius", CORNER_NAMES[i].toLowerCase().replace(" ", "-"))} property="radius" part={CORNER_PARTS[i]}>
            <NumberField
              label={`${CORNER_NAMES[i]} radius`}
              icon={CORNER_ICONS[i]}
              property="radius"
              part={CORNER_PARTS[i]}
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

/** The generic families, which name no font and are written unquoted. */
const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"]);

/** A font's name as a `font-family`: quoted; a generic one (system-ui) as it is. */
function cssFamily(name: string): string {
  return GENERIC_FAMILIES.has(name.toLowerCase()) ? name : `"${name.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * Text, as in Figma: the font (one the page has loaded) and its weight (one it
 * has loaded) and size, line height and letter spacing, alignment, case and
 * decoration. Its color is its Fill.
 */
function TextSection({ size, families, weight, lineHeight, letterSpacing, align, textCase, decoration, fonts, fontSize, set }: {
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
}) {
  const family = shared(families);
  const loaded = fonts.filter((font) => families.includes(font.family)).flatMap((font) => font.weights);
  // The text's own font and weight show where the page has not loaded them, and cannot be chosen again.
  const names = [...fonts.map((font) => font.family), ...(family === MIXED || fonts.some((font) => font.family === family) ? [] : [family])];
  const weights = [...new Set([...loaded, ...(weight === MIXED ? [] : [weight])])].sort((a, b) => a - b);
  /**
   * A font changed: the font alone, the weight kept as it is, though the new font has not loaded it; the browser then draws the
   * nearest it has, or makes it bolder itself (designer, 2026-11-08).
   */
  const changeFont = (next: string) => set("fontFamily")(next);
  return (
    <section class="tk-section" role="group" aria-label="Text">
      <div class="tk-section-header">
        <h3 class="tk-section-title">Text</h3>
        <SectionReset title="Text" properties={["fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing", "textAlign", "textCase", "textDecoration"]} />
      </div>
      {/* The font, marked when changed, its reset at the right end; at its left, where a field has its icon, "Aa" in it, as in the designer's Figma (designer, 2026-11-08). */}
      <MarkedSelect label="Font" property="fontFamily" class="tk-font-field">
        {/* Mixed: a plain "Aa", in the editor's font. A font the page never loaded falls back, as the canvas text does. */}
        <span class="tk-font-sample" aria-hidden="true" style={family === MIXED ? undefined : { fontFamily: cssFamily(family) }}>
          Aa
        </span>
        <Choice
          label="Font"
          class="tk-font"
          value={family === MIXED ? null : family}
          options={names
            .sort((a, b) => a.localeCompare(b))
            .map((name) => ({ value: name, label: name, disabled: !fonts.some((font) => font.family === name), font: cssFamily(name) }))}
          onChange={changeFont}
        />
      </MarkedSelect>
      <div class="tk-grid-2">
        <MarkedSelect label="Font weight" property="fontWeight" class="tk-wide">
          <Choice
            label="Font weight"
            value={weight === MIXED ? null : String(weight)}
            options={weights.map((w) => ({ value: String(w), label: weightName(w), disabled: !loaded.includes(w) }))}
            onChange={(w) => set("fontWeight")(Number(w))}
          />
        </MarkedSelect>
        <VariableSlot label="Font size" slot={fontSize} property="fontSize">
          <NumberField label="Font size" icon="font-size" property="fontSize" value={number(size)} min={1} onChange={set("fontSize")} />
        </VariableSlot>
      </div>
      <div class="tk-grid-2">
        {/* Auto is about 1.2 times the font size: a drag from it starts there. */}
        <TextLengthField label="Line height" icon="line-height" property="lineHeight" value={lineHeight} min={0} auto={size === MIXED ? 0 : Math.round(size * 1.2)} onChange={set("lineHeight")} />
        <TextLengthField label="Letter spacing" icon="letter-spacing" property="letterSpacing" value={letterSpacing} onChange={(value, continues) => set("letterSpacing")(value as TextLength, continues)} />
      </div>
      {/* On a row of its own, as wide as its buttons (and its reset), not the row's width; at the left (designer, 2026-11-08). */}
      <Segmented
        label="Text alignment"
        class="tk-hug"
        property="textAlign"
        value={align}
        options={TEXT_ALIGNS.map(({ align, label }) => ({ value: align, label, content: <Icon name={`align-${align}`} /> }))}
        onChange={set("textAlign")}
      />
      <div class="tk-row">
        <Segmented
          label="Case"
          property="textCase"
          value={textCase}
          options={TEXT_CASES.map(({ textCase, label, glyph }) => ({ value: textCase, label, content: <span class="tk-text-glyph">{glyph}</span> }))}
          onChange={set("textCase")}
        />
        <Segmented
          label="Decoration"
          property="textDecoration"
          value={decoration}
          options={DECORATIONS.map(({ decoration, label, glyph }) => ({
            value: decoration,
            label,
            content: <span class={`tk-text-glyph tk-${decoration}`}>{glyph}</span>,
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
  /** `font`: a font's option, drawn with "Aa" in it in the menu (a `font-family`). */
  options: { value: string; label: string; disabled?: boolean; font?: string }[];
  onChange(value: string): void;
}) {
  return (
    <Select class={`tk-select${className ? ` ${className}` : ""}`} aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value)}>
      {value === null && (
        <option value="" disabled>
          Mixed
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled} data-font={option.font}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * Buttons of which one is on, side by side; Mixed: none of them. `property`
 * changed in this round, the one on stays white, the track behind them takes
 * the accent, and the group's reset pops out inside it at its right end, after
 * its buttons (designer, 2026-11-08). Taken back by a click or undo, the reset
 * fades before it goes; changed or taken back by a key, it comes and goes at once.
 */
function Segmented<T extends string>({ label, class: className, property, value, options, onChange }: {
  label: string;
  class?: string;
  property?: Property;
  value: Shown<T>;
  options: { value: T; label: string; content: ComponentChildren }[];
  onChange(value: T): void;
}) {
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property);
  /** Whether the last click on the group came from a key (Space, Enter): no motion then. */
  const keyed = useRef(false);
  const shownBefore = useRef(changed);
  const [leaving, setLeaving] = useState(false);
  // Its reset kept while it fades: from the render that takes the change back, so the same button fades, not a new one.
  const goes = !changed && (leaving || (shownBefore.current && !keyed.current));
  useEffect(() => {
    const was = shownBefore.current;
    shownBefore.current = changed;
    if (changed || !was || keyed.current) return setLeaving(false);
    setLeaving(true);
    const timer = setTimeout(() => setLeaving(false), RESET_POP_MS);
    return () => clearTimeout(timer);
  }, [changed]);
  return (
    <div
      class={`tk-segmented-field${className ? ` ${className}` : ""}${changed ? " is-changed" : ""}${goes ? " is-leaving" : ""}`}
      role="radiogroup"
      aria-label={label}
      data-keyed={keyed.current || undefined}
      onClickCapture={(event) => {
        keyed.current = event.detail === 0;
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          class="tk-icon-button"
          aria-checked={value === option.value}
          aria-label={option.label}
          data-tk-tip={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.content}
        </button>
      ))}
      {(changed || goes) && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property!])} />}
    </div>
  );
}

/**
 * A line height or a letter spacing: in px, or in % of the font size, as
 * typed, and else in the unit it is in; a line height can be Auto. Stepped and
 * dragged in its unit; from Auto, in px from what Auto comes to.
 */
function TextLengthField({ label, icon, property, value, min = -Infinity, auto, onChange }: {
  label: string;
  icon: IconName;
  /** Marked when changed in this round, with its reset at its right end, as a number field is (designer, 2026-11-08). */
  property: Property;
  value: Shown<LineHeight>;
  min?: number;
  /** A line height: it can be Auto, which comes to this many px. */
  auto?: number;
  onChange(value: LineHeight, continues?: boolean): void;
}) {
  const length = value === MIXED || value === "auto" ? null : value;
  const unit = length?.unit ?? "px";
  const change = (n: number, continues?: boolean) => onChange({ value: Math.max(min, Math.round(n * 100) / 100), unit }, continues);
  const marks = useChangeMarks();
  const changed = marks.changed(property);
  /** What a drag starts from: from Auto, what it comes to. */
  const dragged = length?.value ?? (value === "auto" ? auto! : null);
  return (
    <label class={`tk-field${changed ? " is-changed" : ""}`} data-tk-tip={label}>
      <Scrub icon={icon} value={dragged} min={min} onChange={change} />
      <TextField
        label={label}
        rolls
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
      <Scrub grip value={dragged} min={min} onChange={change} />
      {changed && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property])} />}
    </label>
  );
}

const FILL_TYPES = [
  { type: "solid", label: "Solid" },
  { type: "linear", label: "Linear" },
  { type: "radial", label: "Radial" },
] as const;

/**
 * A fill: a color, or a linear or radial gradient. Its swatch opens the color
 * picker, its type in the Custom tab over the picker itself and, for a gradient, the stops dragged along a bar
 * and listed below it, the one chosen set by the picker, as in Figma (designer,
 * 2026-11-05). A conic gradient the page has is shown, not edited.
 */
function FillSection({ fill, box, conic, onChange, update, variable, onGradientPicker }: {
  fill: Shown<Fill | null>;
  /** The first selected layer's box its gradient is sized to, for what the panel shows; each layer changes by its own. */
  box: PaintArea;
  /** Some selected layer has a conic gradient: the fills are shown, and none of them is changed. */
  conic: boolean;
  onChange(fill: Fill | null, continues?: boolean): void;
  update: Update;
  variable: SlotOf;
  onGradientPicker?(open: boolean): void;
}) {
  /** The gradient's stop the picker sets, by where it is among the stops. */
  const [chosen, choose] = useState(0);
  /** Fills of more than one type: the picker open from Mixed, with only their type in it. */
  const [mixedOpen, setMixedOpen] = useState<HTMLElement | null>(null);
  const types = (type: (typeof FILL_TYPES)[number]["type"] | null) => (
    <div class="tk-tabs" role="radiogroup" aria-label="Fill type">
      {FILL_TYPES.map((option) => (
        <button
          key={option.type}
          type="button"
          role="radio"
          class="tk-tab"
          aria-checked={type === option.type}
          onClick={() => option.type !== type && update("fill", (current) => fillAs(current, option.type))}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  const gradient = fill && fill !== MIXED && (fill.type === "linear" || fill.type === "radial") ? fill : null;
  const at = gradient ? Math.min(chosen, gradient.stops.length - 1) : 0;
  const [pickerOpen, setPickerOpen] = useState(false);
  const onGradient = !!gradient && pickerOpen;
  useEffect(() => {
    onGradientPicker?.(onGradient);
    return () => onGradientPicker?.(false);
  }, [onGradient]);
  const marks = useChangeMarks();
  /** Added in this round: its row unmarked, and all in its picker, with no resets; its − alone in the accent (designer, 2026-11-08). */
  const added = marks.added("fill");
  /** At the end of the fill's row, as Figma has it (designer, 2026-11-07). */
  const remove = <RemoveButton label="Remove fill" added={added} onClick={() => onChange(null)} />;
  return (
    <section class="tk-section" role="group" aria-label="Fill">
      <div class="tk-section-header">
        <h3 class="tk-section-title">Fill</h3>
        {/* The fill's one row, its gradient's angle and stops in it, is one operation, as its one reset takes it back: no reset of its own here till a fill has more than one row. */}
        <SectionReset title="Fill" properties={["fill"]} />
        {!fill && (
          <button type="button" class="tk-icon-button" aria-label="Add fill" onClick={() => onChange(NEW_FILL)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      <ChangeMarksProvider value={added ? NO_MARKS : marks}>
      {fill === MIXED && conic ? (
        <span class="tk-field tk-mixed">Mixed</span>
      ) : fill === MIXED ? (
        <div class="tk-row tk-paint-row">
          <div class="tk-field tk-color-field">
            <button
              type="button"
              class="tk-swatch tk-swatch-button tk-mixed-swatch"
              aria-label="Fill color picker"
              aria-haspopup="dialog"
              onClick={(event) => setMixedOpen(mixedOpen ? null : event.currentTarget)}
            />
            <span class="tk-mixed">Mixed</span>
            <ColorPicker label="Fill" anchor={mixedOpen} top={types(null)} onClose={() => setMixedOpen(null)} />
          </div>
          {!conic && remove}
        </div>
      ) : fill?.type === "conic" ? (
        <>
          <div class="tk-row">
            <span class="tk-gradient-swatch" style={{ backgroundImage: fill.css }} aria-hidden="true" />
            <span class="tk-field tk-read-only">Conic gradient</span>
          </div>
          <p class="tk-layer-note">A conic gradient is shown here, not edited.</p>
        </>
      ) : gradient ? (
        // In the place a solid fill's is, the same row and field: its picker stays open as the type changes.
        <div class="tk-row tk-paint-row">
          <ColorField
            name="Fill"
            property="fill"
            color={gradient.stops[at]}
            onChange={(color, continues) => onChange({ ...gradient, stops: gradient.stops.map((s, i) => (i === at ? stop(color, s.position, s.unit) : s)) }, continues)}
            variable={variable("fill", `stop ${at + 1}`)}
            shown={{ swatch: gradientSwatch(gradient, box), text: gradient.type === "linear" ? "Linear" : "Radial" }}
            onPicker={setPickerOpen}
            top={
              <>
                {types(gradient.type)}
                {/* In the picker, what changed is marked, with no reset: the Fill's row has the one, for the whole fill (designer, 2026-11-08). */}
                {gradient.type === "linear" && (
                  <NumberField
                    label="Angle"
                    icon="angle"
                    property="fill"
                    part={GRADIENT_ANGLE}
                    rowReset
                    value={gradient.angle}
                    onChange={(angle, continues) => onChange({ ...gradient, angle: turned(angle) }, continues)}
                  />
                )}
                {/* A center or size the page works out in a way the panel does not show is kept as it is: no fields for it. */}
                {gradient.type === "radial" && "center" in gradient && <RadialFields gradient={gradient} box={box} update={update} />}
                <GradientStops
                  gradient={gradient}
                  length={gradientLength(gradient, box)}
                  chosen={at}
                  onChoose={choose}
                  onChange={(stops, continues) => onChange({ ...gradient, stops }, continues)}
                  variable={(i) => variable("fill", `stop ${i + 1}`)}
                />
              </>
            }
          />
          {remove}
        </div>
      ) : (
        fill?.type === "solid" && (
          <div class="tk-row tk-paint-row">
            <ColorField
              name="Fill"
              property="fill"
              color={fill}
              onChange={(color, continues) => onChange({ type: "solid", ...color }, continues)}
              variable={variable("fill", "color")}
              top={types("solid")}
              onPicker={setPickerOpen}
            />
            {remove}
          </div>
        )
      )}
      </ChangeMarksProvider>
    </section>
  );
}

/** A fill that is a linear or radial gradient; null for another. */
function gradientOf(value: unknown): Gradient | null {
  const fill = value as Fill | null;
  return fill && (fill.type === "linear" || fill.type === "radial") ? fill : null;
}

/**
 * A part of a gradient fill, its own field in the picker: marked and reset on its own (designer, 2026-11-08).
 * `of` reads it, `back` puts it in a gradient as it was in another; a fill not a gradient then, or now, goes back whole.
 */
function gradientPart(of: (gradient: Gradient) => unknown, back: (gradient: Gradient, before: Gradient) => Gradient | null): ValuePart {
  return {
    of: (value) => {
      const gradient = gradientOf(value);
      return gradient ? (of(gradient) ?? null) : null;
    },
    back: (value, before) => {
      const [now, was] = [gradientOf(value), gradientOf(before)];
      return (now && was && back(now, was)) ?? before;
    },
  };
}

/** A linear gradient's angle. */
const GRADIENT_ANGLE = gradientPart(
  (g) => (g.type === "linear" ? g.angle : null),
  (g, before) => (g.type === "linear" && before.type === "linear" ? { ...g, angle: before.angle } : null),
);

/** A radial gradient's center, or reach, along one axis. */
const radialPart = (key: "center" | "size", axis: "x" | "y") =>
  gradientPart(
    (g) => (g.type === "radial" && "center" in g && axis in g[key] ? JSON.stringify((g[key] as Record<"x" | "y", unknown>)[axis]) : null),
    (g, before) => {
      if (g.type !== "radial" || before.type !== "radial" || !("center" in g) || !("center" in before) || !(axis in g[key]) || !(axis in before[key])) return null;
      return { ...g, [key]: { ...g[key], [axis]: (before[key] as Record<"x" | "y", unknown>)[axis] } } as Gradient;
    },
  );
const RADIAL_PARTS = { center: { x: radialPart("center", "x"), y: radialPart("center", "y") }, size: { x: radialPart("size", "x"), y: radialPart("size", "y") } };

/** A gradient's stops now matched to their own before, by identity: a stop added or taken off leaves the others matched to theirs (designer, 2026-11-08). */
const matchStops = (before: ColorStop[], after: ColorStop[]) =>
  matchItems(before, after, (was, now) => ((was.position === now.position && was.unit === now.unit ? 1 : 0) + (was.color === now.color && was.opacity === now.opacity ? 1 : 0)) / 2);

/** Whether stop `i` of the gradient now was added to the gradient it was: none of its own before. A gradient from another fill has none added. */
const stopAdded = (i: number) => (before: unknown, after: unknown) => {
  const [was, now] = [gradientOf(before), gradientOf(after)];
  return !!was && !!now && matchStops(was.stops, now.stops)[i] === null;
};

/** Stop `i` of a gradient: its position, or its color with its opacity, as it compares with its own stop before. */
const stopPart = (i: number, which: "position" | "color"): ValuePart => {
  const read = (s: ColorStop | undefined) => (s ? (which === "position" ? [s.position, s.unit] : [s.color, s.opacity]) : null);
  return {
    ...gradientPart(
      (g) => read(g.stops[i]),
      (g, before) => {
        const j = matchStops(before.stops, g.stops)[i];
        const [s, was] = [g.stops[i], j === null || j === undefined ? undefined : before.stops[j]];
        if (!s || !was) return null;
        const back = which === "position" ? stop(s, was.position, was.unit) : stop(was, s.position, s.unit);
        return { ...g, stops: g.stops.map((other, k) => (i === k ? back : other)) } as Gradient;
      },
    ),
    was: (before, after) => {
      const [was, now] = [gradientOf(before), gradientOf(after)];
      if (!was || !now) return null;
      const j = matchStops(was.stops, now.stops)[i];
      return j === null || j === undefined ? null : read(was.stops[j]);
    },
  };
};

/** A gradient as its swatch in the panel shows it. */
function gradientSwatch(gradient: Gradient, box: PaintArea): string {
  const length = gradientLength(gradient, box);
  const stops = gradient.stops.map((s) => `${cssColor(s)} ${alongOf(s, length)}%`).join(", ");
  return gradient.type === "linear" ? `linear-gradient(${gradient.angle}deg, ${stops})` : `radial-gradient(${stops})`;
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
    <div class="tk-grid-2">
      {(["x", "y"] as const).map((axis) => (
        <NumberField
          key={axis}
          label={`Center ${axis.toUpperCase()}`}
          glyph={axis.toUpperCase()}
          unit="%"
          property="fill"
          part={RADIAL_PARTS.center[axis]}
          rowReset
          value={centerPercent(gradient, axis, box)}
          onChange={change((current, value, box) => withCenter(current, axis, value, box))}
        />
      ))}
      {(["x", "y"] as const).map((axis) => (
        <NumberField
          key={axis}
          label={`Radius ${axis.toUpperCase()}`}
          icon={axis === "x" ? "width" : "height"}
          property="fill"
          part={RADIAL_PARTS.size[axis]}
          rowReset
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
 * The stop pressed, or added, is `chosen`: the color picker below sets it.
 */
function GradientStops({ gradient, length, chosen, onChoose, onChange, variable }: {
  gradient: Gradient;
  length: number;
  chosen: number;
  onChoose(index: number): void;
  onChange(stops: ColorStop[], continues?: boolean): void;
  /** Stop `index`'s color as a Variable, when the project has them. */
  variable(index: number): Slot | undefined;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const catalog = useCatalog();
  const marks = useChangeMarks();
  /** The handle being dragged: the stop, by where it is in the sorted stops as it moves among them, and whether it has moved yet. */
  const drag = useRef<{ pointerId: number; index: number; moved: boolean } | null>(null);
  const { stops } = gradient;
  /** Puts stop `index` at `position` in `unit`, no further back than the start: returns where it is among the stops now. */
  const place = (index: number, position: number, unit: ColorStop["unit"], continues = false) => {
    const moved = stop(stops[index], Math.max(0, unit === "%" ? Math.min(100, position) : position), unit);
    const next = sortedStops(stops.map((s, i) => (i === index ? moved : s)), length);
    onChange(next, continues);
    const at = next.indexOf(moved);
    if (index === chosen) onChoose(at);
    return at;
  };
  /** Where `along` % of the bar is, within it, in `unit`: whole % or whole px. */
  const positionAt = (along: number, unit: ColorStop["unit"]) => {
    const clamped = Math.min(100, Math.max(0, along));
    return Math.round(unit === "%" ? clamped : (clamped / 100) * length);
  };
  const remove = (index: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, i) => i !== index));
    if (chosen >= index && chosen > 0) onChoose(chosen - 1);
  };
  const add = (along: number) => {
    const added = stopAt(stops, along, length);
    const next = sortedStops([...stops, added], length);
    onChange(next);
    onChoose(next.indexOf(added));
  };
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
        class="tk-gradient-bar"
        role="group"
        aria-label="Gradient stops"
        style={{ "--tk-gradient": preview }}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.target !== event.currentTarget) return;
          add(Math.round(along(event.clientX)));
        }}
      >
        {stops.map((s, index) => (
          <span
            key={index}
            class={`tk-stop-handle${index === chosen ? " is-chosen" : ""}`}
            role="slider"
            tabIndex={0}
            aria-label={`Stop ${index + 1} position`}
            aria-valuemin={0}
            aria-valuemax={s.unit === "%" ? 100 : Math.round(length)}
            aria-valuenow={s.position}
            aria-valuetext={`${s.position}${s.unit}`}
            style={{ left: `${shownAt(s)}%`, "--tk-stop": cssColor(s) }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              // Until it is let go, no key edits: an undo that changed the stops would leave this drag moving another one (ADR 0012).
              holdPointer(event.pointerId);
              drag.current = { pointerId: event.pointerId, index, moved: false };
              onChoose(index);
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (d?.pointerId !== event.pointerId) return;
              const { unit } = stops[d.index];
              const position = positionAt(along(event.clientX), unit);
              if (position === stops[d.index].position) return;
              asStep(() => (d.index = place(d.index, position, unit, d.moved)));
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
                asStep(() => place(index, s.position + by * (event.shiftKey ? 10 : 1), s.unit));
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                remove(index);
              }
            }}
          />
        ))}
      </div>
      <div class="tk-section-header">
        <h4 class="tk-section-title tk-subtitle">Stops</h4>
        <button type="button" class="tk-icon-button" aria-label="Add stop" onClick={() => add(nextStopPosition(stops, length))}>
          <Icon name="plus" />
        </button>
      </div>
      {stops.map((s, index) => {
        const slot = variable(index);
        // Its position and its color, each marked when changed in this round, with no reset of its own: the Fill's row has the one, for the
        // whole fill. A stop added in this round, unmarked: its − alone in the accent (designer, 2026-11-08).
        const added = marks.added("fill", stopAdded(index));
        const [movedHere, coloredHere] = added ? [false, false] : [marks.changed("fill", stopPart(index, "position")), marks.changed("fill", stopPart(index, "color"))];
        return (
          <div
            class={`tk-row tk-stop-row${index === chosen ? " is-chosen" : ""}`}
            key={index}
            role="group"
            aria-label={`Stop ${index + 1}`}
            // Pressed anywhere in its row, the stop is the one the picker sets.
            onPointerDown={() => onChoose(index)}
          >
            <label class={`tk-field tk-stop-position${movedHere ? " is-changed" : ""}`} data-tk-tip="Position">
              <TextField
                label={`Stop ${index + 1} at`}
                value={`${s.position}${s.unit}`}
                parse={(text) => parseStopPosition(text, s.unit)}
                step={(by) => place(index, s.position + by, s.unit)}
                onChange={({ position, unit }) => place(index, position, unit)}
              />
            </label>
            <div class={`tk-field tk-color-field${coloredHere ? " is-changed" : ""}`}>
              <button type="button" class="tk-swatch tk-swatch-button" aria-label={`Choose stop ${index + 1}`} style={{ "--tk-swatch": cssColor(s) }} onClick={() => onChoose(index)} />
              <ColorValue
                name={`Stop ${index + 1}`}
                color={s}
                onChange={(color) => onChange(stops.map((other, i) => (i === index ? stop(color, s.position, s.unit) : other)))}
                offered={slot && catalog?.of("color").length ? slot : undefined}
                onOpen={() => onChoose(index)}
              />
            </div>
            <RemoveButton label={`Remove stop ${index + 1}`} added={added} disabled={stops.length <= 2} onClick={() => remove(index)} />
          </div>
        );
      })}
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

/** A stroke's parts, each in a field of its own, marked and reset on its own: the color with its opacity, the weight, the line, the sides (designer, 2026-11-07). */
const STROKE_PARTS = (() => {
  const part = (of: (stroke: Stroke) => unknown, back: (stroke: Stroke, before: Stroke) => Stroke | null): ValuePart => ({
    of: (value) => (value ? of(value as Stroke) : null),
    back: (value, before) => (value && before ? back(value as Stroke, before as Stroke) : before),
  });
  return {
    color: part(({ color, opacity }) => [color, opacity], (stroke, { color, opacity }) => ({ ...stroke, color, opacity })),
    style: part(({ style }) => style, (stroke, { style }) => ({ ...stroke, style })),
    weight: part(
      ({ weight }) => widest(weight),
      (stroke, before) => strokeWith(stroke, typeof stroke.weight === "number" ? widest(before.weight) : (stroke.weight.map((w) => (w > 0 ? widest(before.weight) : 0)) as Stroke["weight"])),
    ),
    sides: part(
      ({ weight }) => (typeof weight === "number" ? "all" : weight.map((w) => w > 0)),
      (stroke, before) =>
        strokeWith(stroke, typeof before.weight === "number" ? widest(stroke.weight) : sidesOf(before.weight) === "custom" ? before.weight : (before.weight.map((w) => (w > 0 ? widest(stroke.weight) : 0)) as Stroke["weight"])),
    ),
    /** Each side's weight, as Custom shows it in a field of its own. */
    side: SIDE_NAMES.map((_, i) =>
      part(
        ({ weight }) => weightsOf(weight)[i],
        (stroke, before) => strokeWith(stroke, weightsOf(stroke.weight).map((w, j) => (i === j ? weightsOf(before.weight)[i] : w)) as Stroke["weight"]),
      ),
    ),
  };
})();

/** A stroke's weight on each side, top first. */
function weightsOf(weight: Stroke["weight"]): [number, number, number, number] {
  return typeof weight === "number" ? [weight, weight, weight, weight] : weight;
}

/**
 * A choice of a property, or of `part` of one: in the accent when it is changed in this round, with its reset, as a changed field is.
 * `class`: `tk-wide`, as wide as its place (a font's weight); `tk-font-field`, the font's, with "Aa" before its name (designer, 2026-11-08).
 */
function MarkedSelect({ label, property, part, class: className, children }: { label: string; property: Property; part?: ValuePart; class?: string; children: ComponentChildren }) {
  const marks = useChangeMarks();
  const changed = marks.changed(property, part);
  return (
    <span class={`tk-select-field${className ? ` ${className}` : ""}${changed ? " is-changed" : ""}`}>
      {children}
      {changed && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property], part)} />}
    </span>
  );
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
  const marks = useChangeMarks();
  /** Added in this round: its fields unmarked, with no resets; its − alone in the accent, one operation for the section's reset (designer, 2026-11-08). */
  const added = marks.added("stroke");
  /** Each field its own operation: the color row, the weight (or, Custom, each side's), the line, the sides. */
  const operations: Operation[] = added
    ? [{ property: "stroke" }]
    : [STROKE_PARTS.color, ...(sides === "custom" ? STROKE_PARTS.side : [STROKE_PARTS.weight]), STROKE_PARTS.style, STROKE_PARTS.sides].map((part) => ({
        property: "stroke",
        part,
      }));
  return (
    <section class="tk-section" role="group" aria-label="Stroke">
      <div class="tk-section-header">
        <h3 class="tk-section-title">Stroke</h3>
        <SectionReset title="Stroke" properties={["stroke"]} operations={operations} />
        {!stroke && (
          <button type="button" class="tk-icon-button" aria-label="Add stroke" onClick={() => onChange(NEW_STROKE)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      <ChangeMarksProvider value={added ? NO_MARKS : marks}>
      {stroke && (
        <div class="tk-row tk-paint-row">
          {stroke === MIXED ? (
            <span class="tk-field tk-mixed">Mixed</span>
          ) : (
            <ColorField
              name="Stroke"
              property="stroke"
              part={STROKE_PARTS.color}
              color={stroke}
              onChange={(color, continues) => onChange({ ...color, weight: stroke.weight, style: stroke.style }, continues)}
              variable={variable}
            />
          )}
          <RemoveButton label="Remove stroke" added={added} onClick={() => onChange(null)} />
        </div>
      )}
      {stroke && stroke !== MIXED && (
        <div class="tk-row tk-joined">
          {sides !== "custom" && (
            <NumberField
              label="Stroke weight"
              icon="stroke-weight"
              property="stroke"
              part={STROKE_PARTS.weight}
              value={widest(stroke.weight)}
              min={0}
              onChange={(typed, continues) =>
                changeWeight(typed, (weight) => strokeWith(stroke, typeof stroke.weight === "number" ? weight : stroke.weight.map((w) => (w > 0 ? weight : 0)) as Stroke["weight"]), continues)
              }
            />
          )}
          <MarkedSelect label="Stroke style" property="stroke" part={STROKE_PARTS.style}>
            <Select
              class="tk-select"
              aria-label="Stroke style"
              value={stroke.style}
              onChange={(event) => onChange({ ...stroke, style: event.currentTarget.value as Stroke["style"] })}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
            </Select>
          </MarkedSelect>
          <MarkedSelect label="Stroke sides" property="stroke" part={STROKE_PARTS.sides}>
            <Select
              class="tk-select"
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
            </Select>
          </MarkedSelect>
        </div>
      )}
      {stroke && stroke !== MIXED && sides === "custom" && (
        <div class="tk-grid-2" role="group" aria-label="Stroke weight per side">
          {SIDE_NAMES.map((name, i) => {
            const weights = typeof stroke.weight === "number" ? [stroke.weight, stroke.weight, stroke.weight, stroke.weight] : stroke.weight;
            return (
              <NumberField
                key={name}
                label={`Stroke ${name.toLowerCase()}`}
                icon={`stroke-${name.toLowerCase()}` as IconName}
                property="stroke"
                part={STROKE_PARTS.side[i]}
                value={weights[i]}
                min={0}
                onChange={(typed, continues) => changeWeight(typed, (weight) => strokeWith(stroke, weights.map((w, j) => (i === j ? weight : w)) as Stroke["weight"]), continues)}
              />
            );
          })}
        </div>
      )}
      </ChangeMarksProvider>
    </section>
  );
}

type BlurProperty = "layerBlur" | "backgroundBlur";
const BLURS: BlurProperty[] = ["layerBlur", "backgroundBlur"];
type EffectProperty = "shadows" | BlurProperty;
type EffectValues = Pick<PropertyValues, EffectProperty>;
type EffectUpdate = <P extends EffectProperty>(property: P, next: (current: PropertyValues[P], layer: Layer) => PropertyValues[P], continues?: boolean) => void;
type EffectType = Shadow["type"] | BlurProperty;

const isShadow = (type: EffectType): type is Shadow["type"] => type === "drop" || type === "inner";

/** A shadow's fields, each marked and reset on its own; its color with its opacity, one. */
type ShadowKey = "type" | "x" | "y" | "blur" | "spread" | "color";
const SHADOW_KEYS: ShadowKey[] = ["type", "x", "y", "blur", "spread", "color"];

const readShadow = (s: Shadow, key: ShadowKey) => (key === "color" ? [s.color, s.opacity] : s[key]);

/**
 * The shadows now, each matched to its own before, by identity, not by position: one taken off, or added before
 * another, leaves the others matched to theirs, unmarked (designer, 2026-11-08). Null: a shadow added in this round.
 */
function matchShadows(before: unknown, after: unknown): (number | null)[] {
  const [was, now] = [(before as Shadow[] | null) ?? [], (after as Shadow[] | null) ?? []];
  return matchItems(was, now, (a, b) => SHADOW_KEYS.filter((key) => JSON.stringify(readShadow(a, key)) === JSON.stringify(readShadow(b, key))).length / SHADOW_KEYS.length);
}

/** Shadow `i`'s own shadow before this round; undefined for one added in it. */
function shadowBefore(i: number, before: unknown, after: unknown): Shadow | undefined {
  const j = matchShadows(before, after)[i];
  return j === null || j === undefined ? undefined : (before as Shadow[])[j];
}

/** Whether shadow `i` was added in this round: an item added, its fields unmarked, its − alone in the accent (designer, 2026-11-08). */
const shadowAdded = (i: number) => (before: unknown, after: unknown) => i < ((after as Shadow[] | null)?.length ?? 0) && !shadowBefore(i, before, after);

/**
 * Shadow `i`'s field `key`, a part of the shadows, marked and reset on its own, as it compares with its own shadow
 * before (designer, 2026-11-08). A shadow added in this round has no field marked: its − takes it back off.
 */
function shadowPart(i: number, key: ShadowKey): ValuePart {
  return {
    of: (value) => {
      const s = (value as Shadow[] | null)?.[i];
      return s ? readShadow(s, key) : null;
    },
    was: (before, after) => {
      // One with none of its own before (new on some of the layers only): its fields unmarked, as a new one's, with no reset that would do nothing.
      const was = shadowBefore(i, before, after) ?? (after as Shadow[] | null)?.[i];
      return was ? readShadow(was, key) : null;
    },
    back: (value, before) => {
      const now = (value as Shadow[] | null) ?? [];
      const was = shadowBefore(i, before, value);
      if (!was) return now;
      return now.map((s, j) => (i !== j ? s : key === "color" ? { ...s, color: was.color, opacity: was.opacity } : { ...s, [key]: was[key] }));
    },
  };
}

/** Shadow `i`, added in this round, as one operation for the section's reset: taken back as the section's reset takes the shadows. */
const shadowWhole = (i: number): ValuePart => ({
  of: (value) => (value as Shadow[] | null)?.[i] ?? null,
  was: (before, after) => shadowBefore(i, before, after) ?? null,
  back: (_, before) => before,
});

/** The shadows taken off in this round, one operation for the section's reset: those before no shadow now is matched to. */
const SHADOWS_TAKEN_OFF: ValuePart = {
  of: () => 0,
  was: (before, after) => ((before as Shadow[] | null) ?? []).length - matchShadows(before, after).filter((j) => j !== null).length,
  back: (_, before) => before,
};

/** The marks, with a text layer's text shadows marked and reset as its shadows are: the Effects section shows both as shadows. */
function withTextShadows(marks: ChangeMarks): ChangeMarks {
  const kept = (property: Property): Property[] => (property === "shadows" ? ["shadows", "textShadows"] : [property]);
  return {
    changed: (property, part) => kept(property).some((each) => marks.changed(each, part)),
    reset: (properties, part) => {
      const all = properties.flatMap(kept);
      if (!part) return marks.reset(all);
      for (const each of all) if (marks.changed(each, part)) marks.reset([each], part);
    },
    before: (property) => kept(property).map((each) => marks.before(each)).find((value) => value !== null) ?? null,
    added: (property, item) => kept(property).some((each) => marks.added(each, item)),
    stacked: () => marks.stacked(),
    unstack: () => marks.unstack(),
  };
}

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
  /**
   * Where a blur made from a shadow is listed: before the shadow at this index, where the shadow was, not after
   * them all (designer, 2026-11-08). CSS keeps no order between a layer's shadows and its blurs: the panel keeps it
   * while the layers are selected. A blur with none is after the shadows; two at one index, the layer blur first.
   */
  const [blurAt, setBlurAt] = useState<Partial<Record<BlurProperty, number>>>({});
  /** The blurs' places with shadow `i` taken out, or (`by` 1) one put in before them, as `from` was. */
  const shiftBlurs = (i: number, by: 1 | -1, from?: BlurProperty) =>
    setBlurAt((at) => {
      const next: Partial<Record<BlurProperty, number>> = {};
      for (const property of BLURS) {
        const place = at[property];
        if (place === undefined || property === from) continue;
        const after = place > i || (by === 1 && place === i && from !== undefined && BLURS.indexOf(property) > BLURS.indexOf(from));
        next[property] = after ? place + by : place;
      }
      return next;
    });
  /** A blur's place forgotten: taken off, or added anew, it is after the shadows. */
  const unplace = (property: BlurProperty) => setBlurAt(({ [property]: _, ...rest }) => rest);
  /** Shadow `i` made another type: a blur takes its blur, in its place. */
  const retypeShadow = (i: number, type: EffectType) => {
    if (isShadow(type)) return changeShadow(i, (s) => ({ ...s, type }));
    updateEach((layer) => {
      const current = read(layer, "shadows");
      return { shadows: current.filter((_, j) => j !== i), [type]: current[i].blur };
    });
    shiftBlurs(i, -1);
    setBlurAt((at) => ({ ...at, [type]: i }));
  };
  /** A blur made another type, on each layer that has it: a shadow in the blur's place, a blur in it too. */
  const retypeBlur = (from: BlurProperty, type: EffectType) => {
    const place = shadows === MIXED ? undefined : Math.min(blurAt[from] ?? shadows.length, shadows.length);
    updateEach((layer) => {
      const value = read(layer, from);
      if (value === null) return {};
      if (isShadow(type)) {
        const current = read(layer, "shadows");
        const at = place ?? current.length;
        return { [from]: null, shadows: [...current.slice(0, at), shadow({ ...NEW_SHADOW, type, blur: value }), ...current.slice(at)] };
      }
      return { [from]: null, [type]: value };
    });
    if (isShadow(type)) {
      if (place !== undefined) shiftBlurs(place, 1, from);
      unplace(from);
    } else
      setBlurAt(({ [from]: was, ...rest }) => (was === undefined ? rest : { ...rest, [type]: was }));
  };
  const catalog = useCatalog();
  /** The shadow Variables: under the effects in the menu of +, as Figma has effect styles (designer, 2026-11-05). */
  const shadowVariables = variable && catalog ? catalog.of(variable.group) : [];
  /** What + adds: an effect of each type the layers can have one more of, and the shadow Variables, each to stand for the shadows. */
  const addable: MenuItem[] = [
    // Text draws drop shadows only.
    ...EFFECT_TYPES.filter(({ type }) => !withText || type === "drop").map(({ type, label }) => ({ value: type, label, disabled: !isShadow(type) && blurs[type] !== null })),
    ...shadowVariables.map((entry, i) => ({
      value: `variable ${entry.variable.name}`,
      label: entry.variable.name,
      preview: <Preview drawn={entry.drawn} />,
      // Pointed at, its layers, as the Variants tab shows them (designer, 2026-11-08).
      details: (at: DOMRect, beside: DOMRect) => <ShadowDetails entry={entry} at={at} panel={beside} />,
      heading: i === 0 ? "Variables" : undefined,
      // In a column of their own, to the right of the types: the menu was one tall strip (designer, 2026-11-08).
      column: 1 as const,
    })),
  ];
  const add = (value: string) => {
    const entry = shadowVariables.find(({ variable }) => `variable ${variable.name}` === value);
    if (entry) return variable!.onPick(entry);
    const type = value as EffectType;
    if (isShadow(type)) update("shadows", (current) => [...(shadows === MIXED ? [] : current), { ...NEW_SHADOW, type }]);
    else {
      unplace(type);
      set(type)(NEW_BLUR);
    }
  };
  const typeSelect = (label: string, from: EffectType, onChange: (type: EffectType) => void) => (
    <Select class="tk-select tk-effect-type" aria-label={label} value={from} onChange={(event) => onChange(event.currentTarget.value as EffectType)}>
      {/* Text draws drop shadows only. */}
      {EFFECT_TYPES.filter(({ type }) => !withText || type === "drop" || type === from).map(({ type, label }) => (
        <option key={type} value={type} disabled={!canBecome(type, from)}>
          {label}
        </option>
      ))}
    </Select>
  );
  const marks = useChangeMarks();
  /** Which shadows were added in this round: each unmarked, its − alone in the accent (designer, 2026-11-08). */
  const added = shadows === MIXED || variable?.bound ? [] : shadows.map((_, i) => marks.added("shadows", shadowAdded(i)));
  /**
   * Each field its own operation: each shadow's type, numbers and color row, each blur; a shadow Variable, one.
   * A shadow added, one; those taken off, one (designer, 2026-11-08).
   */
  const operations: Operation[] = [
    ...(variable?.bound || shadows === MIXED
      ? [{ property: "shadows" as const }]
      : [
          ...shadows.flatMap((_, i) =>
            added[i]
              ? [{ property: "shadows" as const, part: shadowWhole(i) }]
              : SHADOW_KEYS.filter((key) => !withText || key !== "spread").map((key) => ({ property: "shadows" as const, part: shadowPart(i, key) })),
          ),
          { property: "shadows" as const, part: SHADOWS_TAKEN_OFF },
        ]),
    { property: "layerBlur" },
    { property: "backgroundBlur" },
  ];
  /** The shadows listed one by one: none for a shadow Variable or shadows the layers do not share. */
  const listed = variable?.bound || shadows === MIXED ? [] : shadows;
  /** The blurs listed before shadow `i`, as `blurAt` places them; at the shadows' count, those after them all. */
  const placedAt = (i: number) => BLURS.filter((property) => Math.min(blurAt[property] ?? listed.length, listed.length) === i);
  const blurEffect = (property: BlurProperty) => {
    const value = blurs[property];
    if (value === undefined || value === null) return null;
    const label = EFFECT_TYPES.find(({ type }) => type === property)!.label;
    // Added in this round: its field unmarked, its − alone in the accent (designer, 2026-11-08).
    const addedHere = marks.added(property);
    return (
      <div class="tk-effect" key={property} role="group" aria-label={label}>
        <div class="tk-row tk-paint-row">
          {typeSelect(`${label} type`, property, (type) => retypeBlur(property, type))}
          <RemoveButton
            label={`Remove ${label.toLowerCase()}`}
            added={addedHere}
            onClick={() => {
              set(property)(null);
              unplace(property);
            }}
          />
        </div>
        <NumberField label={label} icon="blur" property={addedHere ? undefined : property} value={typeof value === "number" ? value : null} min={0} onChange={set(property)} />
      </div>
    );
  };
  return (
    <section class="tk-section" role="group" aria-label="Effects">
      <div class="tk-section-header">
        <h3 class="tk-section-title">Effects</h3>
        <SectionReset title="Effects" properties={["shadows", "layerBlur", "backgroundBlur"]} operations={operations} />
        <MenuButton label="Add effect" icon="plus" items={addable} onChoose={add} />
      </div>
      {variable?.bound ? (
        // A shadow Variable stands for the shadows, as an effect style does in Figma.
        <VariableSlot label="Shadow" slot={variable} property="shadows">{null}</VariableSlot>
      ) : shadows === MIXED ? (
        <div class="tk-row">
          <span class="tk-field tk-mixed">Mixed shadows</span>
          <button type="button" class="tk-icon-button" aria-label="Remove shadows" onClick={() => set("shadows")([])}>
            <Icon name="minus" />
          </button>
        </div>
      ) : (
        shadows.flatMap((s, i) => {
          const name = `Shadow ${i + 1}`;
          const lengthField = (key: "x" | "y" | "blur" | "spread", label: string, glyph: string, min?: number) => (
            <NumberField
              label={`${name} ${label}`}
              glyph={glyph}
              small={glyph.length > 1}
              property="shadows"
              part={shadowPart(i, key)}
              value={s[key]}
              min={min}
              onChange={(value, continues) => changeShadow(i, (current) => ({ ...current, [key]: value }), continues)}
            />
          );
          return [
            ...placedAt(i).map(blurEffect),
            // Rows made again when a shadow comes or goes: a drag that took a shadow off ends there, and does not go on in the next one.
            <div class="tk-effect" key={`${shadows.length}:${i}`} role="group" aria-label={name}>
              <ChangeMarksProvider value={added[i] ? NO_MARKS : marks}>
              <div class="tk-row tk-paint-row">
                <MarkedSelect label={`${name} type`} property="shadows" part={shadowPart(i, "type")} class="tk-effect-type-field">
                  {typeSelect(`${name} type`, s.type, (type) => retypeShadow(i, type))}
                </MarkedSelect>
                <RemoveButton
                  label={`Remove shadow ${i + 1}`}
                  added={added[i]}
                  onClick={() => {
                    update("shadows", (current) => current.filter((_, j) => j !== i));
                    shiftBlurs(i, -1);
                  }}
                />
              </div>
              <div class="tk-grid-2">
                {/* Words, not icons: X, Y, Blur and Spread read more plainly so, as a place's X and Y do (designer, 2026-11-07). */}
                {lengthField("x", "X", "X")}
                {lengthField("y", "Y", "Y")}
                {lengthField("blur", "blur", "Blur", 0)}
                {!withText && lengthField("spread", "spread", "Spread")}
              </div>
              <ColorField name={name} property="shadows" part={shadowPart(i, "color")} color={s} onChange={(color, continues) => changeShadow(i, (current) => ({ ...current, ...color }), continues)} variable={colorVariable(i)} />
              </ChangeMarksProvider>
            </div>,
          ];
        })
      )}
      {placedAt(listed.length).map(blurEffect)}
    </section>
  );
}

/**
 * A color and its opacity: picked, or typed as hex and as a percentage. `name`
 * names its fields: "Fill color", "Fill opacity". Its swatch opens the color
 * picker, the editor layer's own (designer, 2026-11-05), with a Variables tab
 * where the project has color Variables, as in Figma; a Variable picked shows
 * by name in place of the hex and opacity. `top` heads its Custom tab: a
 * fill's type and gradient. `shown`, a gradient's swatch and name in place of the
 * color: the picker then sets `color`, the stop chosen in `top`.
 */
function ColorField({ name, color, onChange, variable, top, shown, onPicker, property, part }: {
  name: string;
  /** The property the color is of, and `part`, the part of it the color is (a stroke's): marked when changed in this round, with its reset (`ChangeMarks`). */
  property?: Property;
  part?: ValuePart;
  color: Color;
  onChange(color: Color, continues?: boolean): void;
  variable?: Slot;
  top?: ComponentChildren;
  shown?: { swatch: string; text: string };
  /** The picker opened, or closed. */
  onPicker?(open: boolean): void;
}) {
  const catalog = useCatalog();
  /** The swatch or the Variable's name the picker is open from. */
  const [open, setOpen] = useState<HTMLElement | null>(null);
  useEffect(() => onPicker?.(!!open), [!!open]);
  const offered = variable && catalog?.of("color").length ? variable : undefined;
  const toggle = (event: { currentTarget: HTMLElement }) => setOpen(open ? null : event.currentTarget);
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property, part);
  /** Typed as hex: its opacity in a field of its own, joined to it, as the designer drew it (2026-11-07). */
  const typed = !shown && !offered?.bound;
  return (
    <div class={`tk-color-row${changed ? " is-changed" : ""}`}>
      {/* One reset takes the color and its opacity back together (a gradient, all of it): at the row's left, outside the fields, both marked with none of their own (designer, 2026-11-08). */}
      {changed && <ResetButton label={name.toLowerCase()} onReset={() => marks.reset([property!], part)} />}
      <div class={`tk-field tk-color-field${typed ? " is-joined" : ""}${changed ? " is-changed" : ""}`}>
        <button
          type="button"
          class="tk-swatch tk-swatch-button"
          aria-label={`${name} color picker`}
          aria-haspopup="dialog"
          style={{ "--tk-swatch": shown?.swatch ?? cssColor(color) }}
          onClick={toggle}
        />
        {shown ? <span class="tk-read-only">{shown.text}</span> : <ColorValue name={name} color={color} onChange={onChange} offered={offered} onOpen={toggle} />}
        <ColorPicker label={name} anchor={open} slot={offered} top={top} custom={<ColorPanel color={color} onChange={onChange} />} onClose={() => setOpen(null)} />
      </div>
      {typed && (
        <label class={`tk-field tk-color-opacity${changed ? " is-changed" : ""}`}>
          <TextField
            label={`${name} opacity`}
            value={`${Math.round(color.opacity * 100)}%`}
            parse={(text) => {
              const percent = parseNumber(text, 0, 100);
              return percent === null ? null : percent / 100;
            }}
            onChange={(opacity) => onChange({ color: color.color, opacity })}
          />
          {/* Dragged left and right, 1% per 2px, on its grip, as every number is (designer, 2026-11-08): with no icon, its grip alone. */}
          <Scrub grip value={Math.round(color.opacity * 100)} min={0} max={100} onChange={(percent, continues) => onChange({ color: color.color, opacity: percent / 100 }, continues)} />
        </label>
      )}
    </div>
  );
}

/**
 * A color's value in its field: the Variable it is set to, by name, to pick
 * another (`onOpen`) or detach it; or its hex, typed (its opacity is in the
 * field joined to it, `ColorField`).
 */
function ColorValue({ name, color, onChange, offered, onOpen }: {
  name: string;
  color: Color;
  onChange(color: Color): void;
  offered: Slot | undefined;
  onOpen(event: { currentTarget: HTMLElement }): void;
}) {
  const lower = name.toLowerCase();
  if (offered?.bound) {
    return (
      <>
        <button type="button" class="tk-variable-chip-name" aria-label={`${name} color variable`} aria-haspopup="dialog" data-tk-tip={`${offered.bound.name}: ${offered.bound.value}`} onClick={onOpen}>
          {offered.bound.name}
        </button>
        <button type="button" class="tk-icon-button" aria-label={`Detach ${lower} color variable`} data-tk-tip="Detach variable" onClick={() => offered.onPick(null)}>
          <Icon name="detach" />
        </button>
      </>
    );
  }
  return (
    <>
      {/* Around the hex whether the Variables are in or not: they can come in as it is typed into, and it keeps what is typed (ticket 98). */}
      <TypingProvider
        value={
          offered
            ? {
                group: "color",
                selection: offered.selection,
                read: (text) => {
                  const hex = parseHex(text);
                  return hex ? { color: hex, opacity: color.opacity } : null;
                },
                naming: namesColor,
                onPick: offered.onPick,
              }
            : null
        }
      >
        <TextField label={`${name} color`} value={color.color.slice(1)} parse={parseHex} onChange={(hex) => onChange({ color: hex, opacity: color.opacity })} />
      </TypingProvider>
    </>
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
  /** What the field's handle shows: an icon, or a letter or two; `small`, a word set small (Blur, Spread). */
  icon?: IconName;
  glyph?: string;
  small?: boolean;
  /** Null: the value differs from part to part, shown as Mixed. */
  value: number | null;
  /** Shown after the number: "%". */
  unit?: string;
  min?: number;
  /** `continues`: one more step of a drag on the icon. */
  onChange(value: number, continues?: boolean): void;
  /** The property the field sets, and `part`, the part of it (a side of the padding, a stroke's weight): marked when changed in this round, with its reset (`ChangeMarks`). */
  property?: Property;
  part?: number | ValuePart;
  /** After the number, inside the field: a button of its own. */
  after?: ComponentChildren;
  /**
   * Its reset is its row's, at the row's left, taking more than this field back, or, in a color's picker (a gradient's angle),
   * the color's row's, for all of it: marked, it has none of its own (designer, 2026-11-08).
   */
  rowReset?: boolean;
}

/** A number typed in, stepped with ↑ / ↓, or dragged on its icon (10 at a time with ⇧). */
export function NumberField({ label, icon, glyph, small, value, unit = "", min = -Infinity, onChange, property, part, after, rowReset }: NumberFieldProps) {
  const marks = useChangeMarks();
  const changed = !!property && marks.changed(property, part);
  return (
    <label class={`tk-field${changed ? " is-changed" : ""}`} data-tk-tip={label}>
      <Scrub icon={icon} glyph={glyph} small={small} value={value} min={min} onChange={onChange} />
      <TextField
        label={label}
        rolls
        value={value === null ? "Mixed" : `${value}${unit}`}
        parse={(text) => parseNumber(text, min)}
        step={(by) => onChange(Math.max(min, (value ?? 0) + by))}
        onChange={onChange}
      />
      {after}
      {/* Every number that can be dragged has a grip at its right end, left of its reset (designer, 2026-11-08). */}
      <Scrub grip value={value} min={min} onChange={onChange} />
      {changed && !rowReset && <ResetButton label={label.toLowerCase()} onReset={() => marks.reset([property!], typeof part === "object" ? part : undefined)} />}
    </label>
  );
}

/** What the user takes back as one: a field, a row with one reset, a toggle; `part`, the part of `property` it shows. */
export interface Operation {
  property: Property;
  part?: number | ValuePart;
}

/**
 * In a section's header: its reset, which takes all of the section's changes
 * in this round back out. Every section with something to reset has one; it
 * shows only while two or more of its operations are changed, each counted as
 * the user sees it, a row with one reset as one (designer, 2026-11-08): one
 * change alone has its own reset, or is clicked again to go back.
 * `operations`: what it counts; by default, each of `properties` one.
 */
export function SectionReset({ title, properties, operations }: { title: string; properties: Property[]; operations?: Operation[] }) {
  const marks = useChangeMarks();
  const counted = (operations ?? properties.map((property): Operation => ({ property }))).filter(({ property, part }) => marks.changed(property, part)).length;
  if (counted < 2) return null;
  return <ResetButton label={title} onReset={() => marks.reset(properties.filter((property) => marks.changed(property)))} />;
}

/** Pointer travel per unit scrubbed, in px: half as fast as Figma's 1 per px, which was hard to land on (designer, 2026-11-08). */
const SCRUB_PX_PER_STEP = 2;
/*
 * The grip's sway follows the drag's speed in px per ms, not per frame, so it is the same on a 60Hz screen and a 120Hz one, where every
 * other frame has no pointer event. Faster, or turned the other way, it follows within about `SWAY_RISE_MS`; a pause in the drag shorter
 * than `SWAY_HOLD_MS` leaves it where it is; stopped, it comes back over about `SWAY_FALL_MS`. It had come back within a few frames of
 * any pause, springing back mid-drag (designer, 2026-11-08).
 */
const SWAY_RISE_MS = 40;
const SWAY_HOLD_MS = 150;
const SWAY_FALL_MS = 160;
/** The longest a pointer's movement is taken to have been spread over, after a pause: the speed of the first move after it. */
const SWAY_MOVE_SPAN_MS = 50;
/** The grip's sway per px/ms of the drag's speed: at 8px a 60th of a second, at its most. */
const SWAY_PX_PER_SPEED = GRIP_SWAY_MAX_PX / (8 / (1000 / 60));
/** A grip not swaying. */
const STILL = { frameDx: 0, speed: 0, frame: 0, last: 0, movedAt: 0 };

/**
 * What drags a number field's value left and right: its icon or label, at its
 * start, and its grip, a short upright bar at its right end, just left of its
 * reset when it has one (designer, 2026-11-08). 1 per 2px (10 with ⇧). The
 * pointer is locked while dragging, so it never runs into the edge of the
 * screen. Held, the field's whole grip sways left and right with the drag's
 * speed, upright, and nothing else moves (designer, 2026-11-08).
 */
function Scrub({ icon, glyph, small, grip, value, min, max = Infinity, onChange }: {
  icon?: IconName;
  glyph?: string;
  small?: boolean;
  /** The grip, at the field's right end; else, its icon or label. */
  grip?: boolean;
  value: number | null;
  min: number;
  max?: number;
  onChange(value: number, continues: boolean): void;
}) {
  /** The drag under way: the value so far, movement of less than a step not yet counted, whether it has changed the value yet, the field it marks as chosen and the grip it sways. */
  const drag = useRef<{ pointerId: number; value: number; rest: number; moved: boolean; field: Element | null; grip: HTMLElement | null } | null>(null);
  /** The grip's sway: movement since the last frame, its speed in px per ms smoothed, the frame asked for, when the last frame was and when the pointer last moved. */
  const sway = useRef({ ...STILL });

  /** Each frame while held: the grip's sway. */
  const heldFrame = (now: number) => {
    const d = drag.current;
    const t = sway.current;
    const dt = t.last ? Math.min(now - t.last, SWAY_MOVE_SPAN_MS) : 1000 / 60;
    t.last = now;
    if (t.frameDx !== 0) {
      // Over the time since it last moved: on a 120Hz screen, two frames for each pointer event.
      const v = t.frameDx / Math.max(dt, Math.min(now - t.movedAt, SWAY_MOVE_SPAN_MS));
      const follows = Math.abs(v) >= Math.abs(t.speed) || Math.sign(v) !== Math.sign(t.speed);
      t.speed += (v - t.speed) * (1 - Math.exp(-dt / (follows ? SWAY_RISE_MS : SWAY_FALL_MS)));
      t.movedAt = now;
    } else if (now - t.movedAt > SWAY_HOLD_MS) t.speed *= Math.exp(-dt / SWAY_FALL_MS);
    t.frameDx = 0;
    const x = Math.max(-GRIP_SWAY_MAX_PX, Math.min(GRIP_SWAY_MAX_PX, t.speed * SWAY_PX_PER_SPEED));
    // The whole bar moves across, upright: it does not lean (designer, 2026-11-08).
    if (d?.grip) d.grip.style.transform = `translateX(${Math.abs(x) < 0.02 ? 0 : x.toFixed(2)}px)`;
    t.frame = d ? requestAnimationFrame(heldFrame) : 0;
  };

  const settle = (g: HTMLElement | null) => {
    cancelAnimationFrame(sway.current.frame);
    sway.current = { ...STILL };
    if (!g?.style.transform) return;
    // Let go, it settles back to the middle, eased (designer, 2026-11-08).
    g.style.transition = `transform ${FIELD_SETTLE_MS}ms ${EASE_OUT}`;
    g.style.transform = "translateX(0px)";
  };

  // Gone mid-drag while its field stays, it takes the field's mark with it, and its grip's sway.
  useEffect(
    () => () => {
      drag.current?.field?.removeAttribute("data-scrubbing");
      if (drag.current?.grip) drag.current.grip.style.transform = "";
      cancelAnimationFrame(sway.current.frame);
    },
    [],
  );

  const onPointerDown = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    Promise.resolve(handle.requestPointerLock()).catch(() => {}); // Without the lock, the drag still works.
    // Until it is let go, no key edits: the next move would set again a value undone (ADR 0012).
    holdPointer(event.pointerId);
    const field = handle.closest(".tk-field");
    // Held, the field is the one chosen: its darker ground and accent edge, till let go (designer, 2026-11-08).
    field?.setAttribute("data-scrubbing", "");
    // Its grip sways as it is dragged, by either end; with reduced motion, it stays still.
    const g = prefersReducedMotion() ? null : (field?.querySelector<HTMLElement>(".tk-grip") ?? null);
    if (g) g.style.transition = "";
    drag.current = { pointerId: event.pointerId, value: value ?? 0, rest: 0, moved: false, field, grip: g };
    cancelAnimationFrame(sway.current.frame);
    sway.current = { ...STILL, frame: requestAnimationFrame(heldFrame) };
  };

  const onPointerMove = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    sway.current.frameDx += event.movementX;
    d.rest += event.movementX / SCRUB_PX_PER_STEP;
    const steps = Math.trunc(d.rest);
    if (!steps) return;
    d.rest -= steps;
    const by = event.shiftKey ? 10 : 1;
    const next = Math.min(max, Math.max(min, d.value + steps * by));
    if (next === d.value) return;
    d.value = next;
    asStep(() => onChange(next, d.moved));
    d.moved = true;
  };

  const end = (event: TargetedPointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    d.field?.removeAttribute("data-scrubbing");
    drag.current = null;
    settle(d.grip);
    const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
    if (root.pointerLockElement === event.currentTarget) document.exitPointerLock();
  };

  return (
    <span
      class={grip ? "tk-scrub-grip" : "tk-scrub"}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      // A click on the icon is not a click on the field's label: it does not start typing.
      onClick={(event) => event.preventDefault()}
    >
      {grip ? <span class="tk-grip" /> : icon ? <Icon name={icon} /> : <span class={small ? "tk-glyph is-small" : "tk-glyph"}>{glyph}</span>}
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
  /** A number: its digits roll as it is scrubbed or reset (`DigitRoll`), shown with figures all as wide. */
  rolls?: boolean;
}

/**
 * A value typed in and applied on Enter or on leaving the field, as in Figma.
 * Esc puts back what it showed. What is typed applies to the layer it was typed
 * for, even when leaving the field selects another layer.
 */
export function TextField<T>({ label, class: className, value, placeholder, parse, step, onChange, rolls = false }: TextFieldProps<T>) {
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
  const [focused, setFocused] = useState(false);
  const typeahead = useTypeahead({ text: draft, value, focused, input, reset: () => setDraft(null) });
  const roll = useRoll(rolls, value, input, draftNow);

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
      const by = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
      asStep(() => step(by));
    }
  };

  return (
    <>
    <input
      ref={input}
      type="text"
      class={`tk-input${className ? ` ${className}` : ""}${rolls ? " tk-number" : ""}${roll.shown ? " is-rolled" : ""}`}
      aria-label={label}
      {...typeahead.input}
      // Something typed, not yet applied: ⌘Z is the field's own until then.
      data-tk-typing={draft !== null && draft !== value ? "" : undefined}
      placeholder={placeholder}
      spellcheck={false}
      autocomplete="off"
      value={draft ?? value}
      onFocus={(event: TargetedFocusEvent<HTMLInputElement>) => {
        // Edited, the field's own text, at once.
        roll.stop();
        target.current = onChange;
        setFocused(true);
        event.currentTarget.select();
      }}
      onInput={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
    />
    {roll.shown && input.current && <DigitRoll input={input.current} from={roll.shown.from} to={roll.shown.to} up={roll.shown.up} />}
    {typeahead.after}
    </>
  );
}

/** A number's text as a number, for which way it rolls: null when it is not one (Mixed, Auto). */
function rolledNumber(text: string): number | null {
  return /^\s*-?\.?\d/.test(text) ? parseFloat(text) : null;
}

/** A roll under way: the text its digits started from, the text they roll to, and whether the number grew. */
interface Roll {
  from: string;
  to: string;
  up: boolean;
}

/**
 * Whether a number field's digits roll to its value now (designer, 2026-11-08): as it is scrubbed on its icon or grip, and as its reset
 * is clicked; never as it is typed, stepped with ↑ / ↓, undone or otherwise changed from the keyboard, nor while it is focused. The roll
 * lasts till its digits have settled and the field is let go; focused, it stops at once.
 */
function useRoll(rolls: boolean, value: string, input: { current: HTMLInputElement | null }, draft: { current: string | null }) {
  const [shown, setShown] = useState<Roll | null>(null);
  const was = useRef(value);
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);
  const stop = () => {
    clearTimeout(settle.current);
    setShown(null);
  };
  useLayoutEffect(() => {
    const before = was.current;
    was.current = value;
    if (!rolls || before === value) return;
    const el = input.current;
    const field = el?.closest(".tk-field");
    const scrubbedOrReset = !!field?.hasAttribute("data-scrubbing") || resetJustClicked();
    const [older, newer] = [rolledNumber(before), rolledNumber(value)];
    if (!el || !scrubbedOrReset || draft.current !== null || el.matches(":focus") || older === null || newer === null || older === newer) return void stop();
    setShown((roll) => ({ from: roll?.from ?? before, to: value, up: newer > older }));
    clearTimeout(settle.current);
    // Gone once the last digit has settled (40ms past its roll, a frame or two to spare), but not while the field is still held, so the
    // overlay is not taken down and put up again between steps: the next step rolls on from where it is (the agent's, to confirm).
    const rolling = () => !!field?.querySelector(":scope > .tk-roll")?.getAnimations({ subtree: true }).some((anim) => anim.playState === "running");
    const later = () => {
      settle.current = setTimeout(() => (field?.hasAttribute("data-scrubbing") || rolling() ? later() : setShown(null)), DIGIT_ROLL_MS + 40);
    };
    later();
  }, [value]);
  return { shown, stop };
}

/** A digit's place as it rolls: how far below its place, in em (above, less than 0), how opaque, how blurred, in px. */
type Pose = [y: number, opacity: number, blur: number];
const SETTLED: Pose = [0, 1, 0];

/** A digit shown, and its roll: from where, to where. */
interface Glyph {
  el: HTMLSpanElement;
  from: Pose;
  to: Pose;
  anim: Animation | null;
}

/** One digit's place, counted from the text's end: the digit there, and those still rolling out of it. */
interface Cell {
  el: HTMLSpanElement;
  char: string;
  glyph: Glyph | null;
}

/**
 * Over a number field's text while it rolls (designer, 2026-11-08): the same text in the same place, a digit to each place, the input's
 * own text clear beneath it. A digit that changes rolls out as its new one rolls in, over `DIGIT_ROLL_MS`, eased out; the others stay
 * still. Places are counted from the text's end, so a unit stays put and a new leading digit comes in at the start. Hidden from screen
 * readers: the input keeps the value. Digits move with the Web Animations API, on transform, opacity and filter alone: one mid-roll,
 * rolled again, goes on from where it is now, as its animation's own progress says, read without the page working out its styles.
 */
function DigitRoll({ input, from, to, up }: { input: HTMLInputElement; from: string; to: string; up: boolean }) {
  const root = useRef<HTMLSpanElement>(null);
  /** From the text's end. */
  const cells = useRef<Cell[]>([]);
  const reduce = useRef(prefersReducedMotion());

  /** A new place, at the text's start. */
  const place = (): Cell => {
    const cell: Cell = { el: document.createElement("span"), char: "", glyph: null };
    cell.el.className = "tk-roll-cell";
    root.current!.prepend(cell.el);
    cells.current.push(cell);
    return cell;
  };

  useLayoutEffect(() => {
    const el = root.current!;
    // Over the input's text: read once, as the roll begins, not as it goes on.
    el.style.left = `${input.offsetLeft - input.scrollLeft}px`;
    el.style.top = `${input.offsetTop}px`;
    el.style.height = `${input.offsetHeight}px`;
    // The text as it was before this change, still: it rolls from there.
    for (const char of [...from].reverse()) {
      const cell = place();
      cell.char = char;
      cell.glyph = { el: glyphIn(cell, char), from: SETTLED, to: SETTLED, anim: null };
    }
  }, []);

  useLayoutEffect(() => {
    const chars = [...to].reverse();
    const ms = reduce.current ? DIGIT_FADE_MS : DIGIT_ROLL_MS;
    const away = reduce.current ? 0 : up ? DIGIT_ROLL_EM : -DIGIT_ROLL_EM;
    const blur = reduce.current ? 0 : DIGIT_BLUR_PX;
    for (let i = 0; i < Math.max(chars.length, cells.current.length); i++) {
      const cell = cells.current[i] ?? place();
      const char = chars[i] ?? "";
      if (cell.char === char) continue;
      cell.char = char;
      // Out the way the number goes, up as it grows, down as it falls; then taken away.
      const going = cell.glyph;
      if (going) {
        going.el.classList.add("is-leaving");
        rollGlyph(going, [-away, 0, blur], ms, reduce.current);
        going.anim!.onfinish = () => going.el.remove();
      }
      // In from the other side, out of a blur.
      cell.glyph = null;
      if (char) {
        const start: Pose = [away, 0, blur];
        cell.glyph = { el: glyphIn(cell, char), from: start, to: start, anim: null };
        rollGlyph(cell.glyph, SETTLED, ms, reduce.current);
      }
    }
  }, [to]);

  return <span ref={root} class="tk-roll" aria-hidden="true" />;
}

/** A digit's own element, in its place. */
function glyphIn(cell: Cell, char: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "tk-roll-glyph";
  el.textContent = char;
  cell.el.append(el);
  return el;
}

/** Where a digit is in its roll now. */
function poseOf(glyph: Glyph): Pose {
  const progress = glyph.anim?.effect?.getComputedTiming().progress;
  if (progress === null || progress === undefined) return glyph.to;
  return glyph.from.map((at, i) => at + (glyph.to[i] - at) * progress) as Pose;
}

/** As a keyframe; with reduced motion, its opacity alone. */
function frameOf([y, opacity, blur]: Pose, reduce: boolean): Keyframe {
  return reduce ? { opacity } : { transform: `translateY(${y}em)`, opacity, filter: `blur(${blur}px)` };
}

/** Rolls a digit to `to` from wherever it is now. */
function rollGlyph(glyph: Glyph, to: Pose, ms: number, reduce: boolean) {
  const from = poseOf(glyph);
  glyph.anim?.cancel();
  Object.assign(glyph, { from, to });
  glyph.anim = glyph.el.animate([frameOf(from, reduce), frameOf(to, reduce)], { duration: ms, easing: EASE_OUT, fill: "forwards" });
}

/** A number typed in, kept within bounds and to two decimals. */
export function parseNumber(text: string, min = -Infinity, max = Infinity): number | null {
  const n = parseFloat(text);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : null;
}

/** `#rgb` or `#rrggbb`, with or without the `#`, as `#RRGGBB`. */
function parseHex(text: string): string | null {
  let hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}
