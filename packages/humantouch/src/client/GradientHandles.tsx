/** @jsxImportSource preact */
import type { TargetedPointerEvent } from "preact";
import { useRef } from "preact/hooks";
import type { Camera } from "./camera";
import type { Editor } from "./edit-commands";
import type { Layer } from "./layers";
import { alongOf, colorReader, cssColor, gradientLength, paintArea, radiiOf, readFill, sortedStops, stop, turned, withCenter, withRadius, type PaintArea, type RadialGradient } from "./paint";
import { holdPointer } from "./pointer-held";
import { asStep, stepOptions } from "./Properties";
import type { ColorStop, Fill } from "./property-table";
import type { View } from "./views";

/** How far past each end of a linear gradient's line its knob is, on screen. */
const KNOB_OUT = 16;
/** A handle's radius on screen, and how near the pointer must come to press it. */
const KNOB = 5;
const HIT = 9;

type Part = { knob: "start" | "end" | "center" | "radius x" | "radius y" } | { stop: number };
type Point = { x: number; y: number };
type Gradient = Extract<Fill, { type: "linear" }> | RadialGradient;

/** A linear or radial gradient the handles can change: a radial one with a center and size of the page's own kept as they are (`calc()`) has none. */
function editable(fill: Fill | null): Gradient | null {
  if (fill?.type === "linear") return fill;
  if (fill?.type === "radial" && "center" in fill) return fill;
  return null;
}

/** Where a gradient's line runs in its paint area, in its px, and how long it is: a linear one corner to corner along its angle through the middle, a radial one from its center out to the right. */
function lineOf(gradient: Gradient, box: PaintArea): { from: Point; to: Point; length: number } {
  const length = gradientLength(gradient, box);
  if (gradient.type === "linear") {
    const turn = (gradient.angle * Math.PI) / 180;
    const [dx, dy] = [Math.sin(turn), -Math.cos(turn)];
    const [cx, cy] = [box.width / 2, box.height / 2];
    return { from: { x: cx - (dx * length) / 2, y: cy - (dy * length) / 2 }, to: { x: cx + (dx * length) / 2, y: cy + (dy * length) / 2 }, length };
  }
  const center = centerPx(gradient, box);
  return { from: center, to: { x: center.x + length, y: center.y }, length };
}

function centerPx({ center }: RadialGradient, box: PaintArea): Point {
  const px = ({ value, unit }: { value: number; unit: string }, whole: number) => (unit === "%" ? (value / 100) * whole : value);
  return { x: px(center.x, box.width), y: px(center.y, box.height) };
}

/** Where the layer's paint area starts in its box: inside its border, unless the page says otherwise (`paintArea`). */
function paintOffset(el: Element): Point {
  const style = getComputedStyle(el);
  const n = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
  if (style.backgroundOrigin === "border-box") return { x: 0, y: 0 };
  const content = style.backgroundOrigin === "content-box";
  return { x: n("border-left-width") + (content ? n("padding-left") : 0), y: n("border-top-width") + (content ? n("padding-top") : 0) };
}

/**
 * On the layer selected alone, while its fill's picker is open on a gradient,
 * in every view: the gradient drawn as Figma draws it, to change on the canvas
 * (designer, 2026-11-05). A linear one's line runs through the middle along
 * its angle, a knob past each end turning it (15° at a time with ⇧); a radial
 * one's center moves it and the knobs on its ellipse's left and top size it
 * across and down. Its stops sit on the line, each dragged along it. Dragged in
 * a view, it changes at that view's breakpoint, as a handle does; one drag is
 * one step to undo, and no key edits until it is let go (ADR 0012). Drawn by
 * the editor layer alone: nothing of it goes into the page.
 */
export function GradientHandles({ layer, view, name, camera, editor, onBegin, onEdit }: {
  layer: Layer;
  view: View;
  name: string;
  camera: Camera;
  editor: Editor;
  /** Pressed: the view pressed in is the one worked in from now on. */
  onBegin(): void;
  onEdit(): void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointerId: number; part: Part; moved: boolean; release(): void } | null>(null);
  const el = view.elementOf(layer.el);
  const r = view.boxOf(layer);
  if (!el || !r) return null;
  // As this view shows it: at its own width, and at a breakpoint of its own.
  const gradient = editable(readFill(el, colorReader(el.ownerDocument)));
  if (!gradient) return null;
  const box = paintArea(el);
  const offset = paintOffset(el);
  const screen = (p: Point): Point => ({ x: camera.x + (r.left + offset.x + p.x) * camera.zoom, y: camera.y + (r.top + offset.y + p.y) * camera.zoom });
  const line = lineOf(gradient, box);
  const [from, to] = [screen(line.from), screen(line.to)];
  const along = (s: ColorStop) => {
    const t = alongOf(s, line.length) / 100;
    return screen({ x: line.from.x + (line.to.x - line.from.x) * t, y: line.from.y + (line.to.y - line.from.y) * t });
  };

  /** Where the pointer is, in the paint area's px, as this view lays the layer out now. */
  const pointAt = (event: PointerEvent): Point => {
    const area = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - area.left - camera.x) / camera.zoom - r.left - offset.x, y: (event.clientY - area.top - camera.y) / camera.zoom - r.top - offset.y };
  };

  /** The gradient as the part dragged to `p` makes it, from `current`, the layer's fill as the view worked in has it. */
  const dragged = (current: Gradient, part: Part, p: Point, shift: boolean, d: { part: Part }): Gradient => {
    const area = paintArea(el);
    const { from: start, length } = lineOf(current, area);
    if ("stop" in part) {
      const end = lineOf(current, area).to;
      const [dx, dy] = [(end.x - start.x) / (length || 1), (end.y - start.y) / (length || 1)];
      const t = Math.min(1, Math.max(0, ((p.x - start.x) * dx + (p.y - start.y) * dy) / (length || 1)));
      const s = current.stops[part.stop];
      const moved = stop(s, Math.round(s.unit === "%" ? t * 100 : t * length), s.unit);
      const stops = sortedStops(current.stops.map((other, i) => (i === part.stop ? moved : other)), length);
      // Passing another stop, the one dragged is where it is among them now.
      d.part = { stop: stops.indexOf(moved) };
      return { ...current, stops };
    }
    if (current.type === "linear") {
      const center = { x: area.width / 2, y: area.height / 2 };
      let angle = (Math.atan2(p.x - center.x, -(p.y - center.y)) * 180) / Math.PI + (part.knob === "start" ? 180 : 0);
      angle = shift ? Math.round(angle / 15) * 15 : Math.round(angle);
      return { ...current, angle: turned(angle) };
    }
    const percent = (n: number, whole: number) => Math.min(100, Math.max(0, Math.round((n / (whole || 1)) * 100)));
    if (part.knob === "center") return withCenter(withCenter(current, "x", percent(p.x, area.width), area), "y", percent(p.y, area.height), area);
    const center = centerPx(current, area);
    if (part.knob === "radius x") return withRadius(current, "x", Math.max(1, Math.round(center.x - p.x)), area);
    return withRadius(current, "y", Math.max(1, Math.round(center.y - p.y)), area);
  };

  const press = (part: Part) => (event: TargetedPointerEvent<SVGElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    onBegin();
    svg.current!.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, part, moved: false, release: holdPointer(event.pointerId) };
  };
  const onPointerMove = (event: TargetedPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    const current = editable(editor.read(layer, "fill"));
    if (!current) return;
    const next = dragged(current, d.part, pointAt(event), event.shiftKey, d);
    asStep(() => {
      editor.batch(() => editor.set(layer, "fill", next), stepOptions(d.moved));
      onEdit();
    });
    d.moved = true;
  };
  const end = (event: TargetedPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d?.pointerId !== event.pointerId) return;
    d.release();
    drag.current = null;
  };

  const knob = (at: Point, part: Part, label: string, cursor: string, square = false) => (
    <g class="ht-gradient-knob" style={{ cursor }} onPointerDown={press(part)} aria-label={label}>
      <circle cx={at.x} cy={at.y} r={HIT} fill="transparent" />
      {square ? <rect x={at.x - KNOB + 1} y={at.y - KNOB + 1} width={(KNOB - 1) * 2} height={(KNOB - 1) * 2} rx={2} /> : <circle cx={at.x} cy={at.y} r={KNOB} />}
    </g>
  );
  const unit = { x: (to.x - from.x) / (Math.hypot(to.x - from.x, to.y - from.y) || 1), y: (to.y - from.y) / (Math.hypot(to.x - from.x, to.y - from.y) || 1) };
  const radii = gradient.type === "radial" ? radiiOf(gradient, box) : null;
  return (
    <svg ref={svg} class="ht-gradient-handles" data-view={name} data-ht-keeps-popover="" aria-hidden="true" onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}>
      {radii && <ellipse class="ht-gradient-shape" cx={from.x} cy={from.y} rx={radii.x * camera.zoom} ry={radii.y * camera.zoom} />}
      <line class="ht-gradient-line" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      {gradient.stops.map((s, i) => {
        const at = along(s);
        return (
          <g key={i} class="ht-gradient-stop" style={{ cursor: "grab" }} onPointerDown={press({ stop: i })}>
            <circle cx={at.x} cy={at.y} r={HIT} fill="transparent" />
            <rect x={at.x - 6} y={at.y - 6} width={12} height={12} rx={3} style={{ fill: cssColor(s) }} />
          </g>
        );
      })}
      {/* Over the stops: a radial gradient's stop at 0% is under its center, which is pressed first. */}
      {gradient.type === "linear" ? (
        <>
          {knob({ x: from.x - unit.x * KNOB_OUT, y: from.y - unit.y * KNOB_OUT }, { knob: "start" }, "Turn the gradient", "grab")}
          {knob({ x: to.x + unit.x * KNOB_OUT, y: to.y + unit.y * KNOB_OUT }, { knob: "end" }, "Turn the gradient", "grab")}
        </>
      ) : (
        <>
          {knob(from, { knob: "center" }, "Move the gradient's center", "move")}
          {knob({ x: from.x - radii!.x * camera.zoom, y: from.y }, { knob: "radius x" }, "Size the gradient across", "ew-resize", true)}
          {knob({ x: from.x, y: from.y - radii!.y * camera.zoom }, { knob: "radius y" }, "Size the gradient down", "ns-resize", true)}
        </>
      )}
    </svg>
  );
}
