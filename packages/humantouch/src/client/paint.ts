/**
 * Fills and strokes in design language, read from and written as CSS: a fill
 * is a layer's background (a color, or one gradient over no color), a stroke
 * its border. Colors read back in sRGB hex whatever CSS color space set them.
 */

/** A color as `#RRGGBB`, and its opacity from 0 to 1. */
export interface Color {
  color: string;
  opacity: number;
}

/** A solid fill. */
export interface Solid extends Color {
  type: "solid";
}

/**
 * A gradient's color stop: where along the gradient it is, in the unit the
 * page writes it in: % of the gradient's length (0 to 100), or px, which stays
 * the same length however big the layer is. New stops are in %.
 */
export interface ColorStop extends Color {
  position: number;
  unit: "%" | "px";
}

/** A length as the page writes it: in % (of the layer's width or height) or in px. */
export interface Length {
  value: number;
  unit: "%" | "px";
}

/** How far a radial gradient reaches by keyword: to the side or corner of the layer closest to its center, or farthest from it. */
export type Extent = "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner";

/** A linear gradient: `angle` in degrees, clockwise from bottom-to-top (0) as CSS turns it; 90 runs left to right. */
export interface LinearGradient {
  type: "linear";
  angle: number;
  stops: ColorStop[];
}

/**
 * A radial gradient, out from its center: across from the layer's left edge
 * and down from its top. Its size: to an extent of the layer, as a circle or an
 * ellipse; or a radius across and one down, a circle when they are the same in
 * px. Both in the units the page writes them in. CSS turns no ellipse, so neither does the editor.
 */
export interface RadialGradient {
  type: "radial";
  center: { x: Length; y: Length };
  size: { extent: Extent; circle: boolean } | { x: Length; y: Length };
  stops: ColorStop[];
}

/**
 * A radial gradient the page centers or sizes in a way the editor does not
 * model, as with `calc()` (Chrome writes one offset from the right or bottom
 * edge, `at right 10px bottom 20px`, as `calc(100% - 10px)`): its center and
 * size kept as the page has them, its stops and type changed. `shape`: its
 * shape, size and center as CSS computes them.
 */
export interface KeptRadialGradient {
  type: "radial";
  shape: string;
  stops: ColorStop[];
}

/** A conic gradient the page already has: shown, not edited. `css`: as the page has it. */
export interface ConicGradient {
  type: "conic";
  css: string;
}

export type Gradient = LinearGradient | RadialGradient | KeptRadialGradient;
export type Fill = Solid | Gradient | ConicGradient;

/** A fill added to a layer that has none, as in Figma; and what a Frame made in the blank space has (ticket 106). */
export const NEW_FILL: Fill = { type: "solid", color: "#FFFFFF", opacity: 1 };

/**
 * A stroke: one color and line for the layer, drawn `weight` px wide on every
 * side, or on each side as it says (top, right, bottom, left; 0 for none).
 */
export interface Stroke extends Color {
  weight: number | [number, number, number, number];
  style: "solid" | "dashed";
}

export interface ColorReader {
  /** Any CSS color (oklch included) in sRGB. */
  color(css: string): Color;
}

const readers = new WeakMap<Document, ColorReader>();

/** Reads colors back by painting them: the one way that handles every CSS color space. One per document. */
export function colorReader(doc: Document): ColorReader {
  let reader = readers.get(doc);
  if (!reader) readers.set(doc, (reader = paintingReader(doc)));
  return reader;
}

function paintingReader(doc: Document): ColorReader {
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const paint = (css: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  return {
    color(css) {
      const alpha = paint(css)[3];
      // Painted opaque: a see-through color loses precision to premultiplied alpha.
      const [r, g, b] = paint(`rgb(from ${css} r g b / 1)`);
      const color = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      return { color, opacity: Math.round((alpha / 255) * 100) / 100 };
    },
  };
}

export function cssColor({ color, opacity }: Color): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${opacity})`;
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** Whether the layer's fill can be read: a color, or one gradient. An image, or several layers of background, cannot. */
export function fillApplies(el: Element): boolean {
  const image = getComputedStyle(el).backgroundImage;
  return image === "none" || gradientOf(image, el, colorReader(el.ownerDocument)) !== null;
}

/** The CSS a layer's fill is read from: its color, and its gradient when it has one. */
export function fillSets(el: Element): string[] {
  return getComputedStyle(el).backgroundImage === "none" ? ["background-color"] : ["background-color", "background-image"];
}

/** The layer's fill: its gradient if it has one, as that paints over the color; else its color, or none when that is transparent. */
export function readFill(el: Element, colors: ColorReader): Fill | null {
  const style = getComputedStyle(el);
  if (style.backgroundImage !== "none") return gradientOf(style.backgroundImage, el, colors);
  const color = colors.color(style.backgroundColor);
  return color.opacity === 0 ? null : { type: "solid", ...color };
}

/**
 * The CSS that paints the fill. A color clears a gradient the layer has, and a
 * gradient in place of a color clears that color; only what the layer has now is
 * declared, so a plain color change reads as one.
 */
export function writeFill(fill: Fill | null, el: Element): Record<string, string> {
  const style = getComputedStyle(el);
  const image = !fill || fill.type === "solid" ? "none" : gradientCss(fill, el);
  const color = fill?.type === "solid" ? cssColor(fill) : "transparent";
  // A gradient changed where there was one already: a color under it, the page's own, stays.
  const under = fill !== null && fill.type !== "solid" && style.backgroundImage !== "none";
  return {
    ...(!under && (color !== "transparent" || style.backgroundColor !== TRANSPARENT) && { "background-color": color }),
    ...((image !== "none" || style.backgroundImage !== "none") && { "background-image": image }),
  };
}

function gradientCss(gradient: Gradient | ConicGradient, el: Element): string {
  if (gradient.type === "conic") return gradient.css;
  const stops = sortedStops(gradient.stops, gradientLength(gradient, paintArea(el))).map((stop) => `${cssColor(stop)} ${stop.position}${stop.unit}`);
  const lead = gradient.type === "linear" ? `${gradient.angle}deg` : radialLead(gradient);
  return `${gradient.type}-gradient(${[...(lead ? [lead] : []), ...stops].join(", ")})`;
}

/** A length as CSS writes it: "30%", "20px". */
export const lengthCss = ({ value, unit }: Length) => `${value}${unit}`;

/** Whether a radial gradient is centered in the middle of the layer, where CSS centers it by default. */
export function isMiddle({ x, y }: RadialGradient["center"]): boolean {
  return [x, y].every(({ value, unit }) => value === 50 && unit === "%");
}

/** A radial gradient's shape, size and center as CSS writes them, leaving out the defaults: an ellipse, to the farthest corner, from the middle. */
function radialLead(gradient: RadialGradient | KeptRadialGradient): string {
  if ("shape" in gradient) return gradient.shape;
  const { center, size } = gradient;
  const sizeCss =
    "extent" in size
      ? [size.circle ? "circle" : "", size.extent === "farthest-corner" ? "" : size.extent]
      : isCircle(size)
        ? ["circle", lengthCss(size.x)]
        : [lengthCss(size.x), lengthCss(size.y)];
  return [...sizeCss, ...(isMiddle(center) ? [] : ["at", lengthCss(center.x), lengthCss(center.y)])].filter(Boolean).join(" ");
}

/** Whether a radius across and down is a circle: the same length in px. CSS takes no circle in %. */
export function isCircle(size: { x: Length; y: Length }): boolean {
  return size.x.unit === "px" && size.y.unit === "px" && size.x.value === size.y.value;
}

/** One gradient, as computed style writes it; null for anything else (an image, several layers, a repeating linear or radial gradient). */
function gradientOf(css: string, el: Element, colors: ColorReader): Fill | null {
  const match = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(css.trim());
  if (!match || split(css, ",").length > 1) return null;
  const [, repeating, type, inside] = match;
  if (type === "conic") return { type: "conic", css };
  if (repeating) return null;
  const args = split(inside, ",");
  // What comes before the stops: the direction, the shape, the color space to blend in.
  const lead = colorOf(args[0]) === null ? args.shift()!.replace(INTERPOLATION, "").trim() : "";
  const box = paintArea(el);
  if (type === "linear") {
    const angle = angleOf(lead, box.width, box.height);
    if (angle === null) return null;
    const stops = stopsOf(args, gradientLength({ type: "linear", angle }, box), colors);
    return stops && { type: "linear", angle, stops };
  }
  // A center or size that cannot be told in one length is kept as the page has it.
  const radial = { type: "radial" as const, ...(radialShapeOf(lead) ?? { shape: lead }) };
  const stops = stopsOf(args, gradientLength(radial, box), colors);
  return stops && { ...radial, stops };
}

/** The size of the box a layer's background is laid out in, in px: what its gradient is sized to. */
export interface PaintArea {
  width: number;
  height: number;
}

/** The layer's paint area: inside the border, unless the page says otherwise. */
export function paintArea(el: Element): PaintArea {
  const style = getComputedStyle(el);
  const { width, height } = el.getBoundingClientRect();
  const inset = (sides: string[]) => sides.reduce((sum, side) => sum + (parseFloat(style.getPropertyValue(side)) || 0), 0);
  const origin = style.backgroundOrigin;
  const [across, down] = [
    ["border-left-width", "border-right-width", "padding-left", "padding-right"],
    ["border-top-width", "border-bottom-width", "padding-top", "padding-bottom"],
  ].map((sides) => (origin === "border-box" ? [] : origin === "content-box" ? sides : sides.slice(0, 2)));
  return { width: Math.max(0, width - inset(across)), height: Math.max(0, height - inset(down)) };
}

/**
 * How long a gradient is in px, in a box: what a stop at 100% is as far along
 * as. A linear gradient runs corner to corner along its angle; a radial one
 * out to the right, as far as its ending shape is wide.
 */
export function gradientLength(
  gradient: Pick<LinearGradient, "type" | "angle"> | Omit<RadialGradient, "stops"> | Omit<KeptRadialGradient, "stops">,
  box: PaintArea,
): number {
  if (gradient.type === "linear") {
    const turn = (gradient.angle * Math.PI) / 180;
    return Math.abs(box.width * Math.sin(turn)) + Math.abs(box.height * Math.cos(turn));
  }
  // A shape kept as the page has it, told for this box; the default ellipse, near enough, when it cannot be.
  if ("shape" in gradient) return radiiOf(radialShapeOf(gradient.shape, box) ?? middleOut(), box).x;
  return radiiOf(gradient, box).x;
}

/** A length in px, of `whole` px when in %. */
function lengthPx({ value, unit }: Length, whole: number): number {
  return unit === "px" ? value : (value / 100) * whole;
}

/** Where a radial gradient's center is in a box, in px from its top left. */
function centerOf({ center }: Pick<RadialGradient, "center">, box: PaintArea): { x: number; y: number } {
  return { x: lengthPx(center.x, box.width), y: lengthPx(center.y, box.height) };
}

/** How far a radial gradient's ending shape reaches across and down from its center, in px, as CSS works it out. */
export function radiiOf(gradient: Omit<RadialGradient, "type" | "stops">, box: PaintArea): { x: number; y: number } {
  const { size } = gradient;
  if (!("extent" in size)) return { x: lengthPx(size.x, box.width), y: lengthPx(size.y, box.height) };
  const center = centerOf(gradient, box);
  const [nearX, farX] = [Math.abs(center.x), Math.abs(box.width - center.x)].sort((a, b) => a - b);
  const [nearY, farY] = [Math.abs(center.y), Math.abs(box.height - center.y)].sort((a, b) => a - b);
  const side = size.extent.endsWith("side");
  const [x, y] = size.extent.startsWith("closest") ? [nearX, nearY] : [farX, farY];
  if (size.circle) {
    const r = side ? (size.extent === "closest-side" ? Math.min(x, y) : Math.max(x, y)) : Math.hypot(x, y);
    return { x: r, y: r };
  }
  // To a corner: the ellipse to that side, made big enough to pass through the corner.
  return side ? { x, y } : { x: x * Math.SQRT2, y: y * Math.SQRT2 };
}

/** Where a radial gradient's center is across (x) or down (y), in % of the layer, as the panel shows it. */
export function centerPercent({ center }: Pick<RadialGradient, "center">, axis: "x" | "y", box: PaintArea): number {
  const whole = axis === "x" ? box.width : box.height;
  return center[axis].unit === "%" ? center[axis].value : whole > 0 ? round((center[axis].value / whole) * 100) : 0;
}

/** The gradient centered `percent` % of the layer across (x) or down (y), in the unit the page writes the center in. */
export function withCenter(gradient: RadialGradient, axis: "x" | "y", percent: number, box: PaintArea): RadialGradient {
  const { unit } = gradient.center[axis];
  const value = unit === "%" ? percent : round((percent / 100) * (axis === "x" ? box.width : box.height));
  return { ...gradient, center: { ...gradient.center, [axis]: { value, unit } } };
}

/**
 * The gradient reaching `px` across (x) or down (y) from its center, the other
 * way as far as now. The same both ways is a circle, in px as CSS takes it. A
 * size by keyword goes in % of the layer, as it grows with the layer as the
 * keyword does; a size the page writes in lengths stays in their units.
 */
export function withRadius(gradient: RadialGradient, axis: "x" | "y", px: number, box: PaintArea): RadialGradient {
  const radii = radiiOf(gradient, box);
  const [x, y] = axis === "x" ? [round(px), round(radii.y)] : [round(radii.x), round(px)];
  if (x === y) return { ...gradient, size: { x: { value: x, unit: "px" }, y: { value: y, unit: "px" } } };
  const { size } = gradient;
  const units = "extent" in size ? (["%", "%"] as const) : ([size.x.unit, size.y.unit] as const);
  const as = (radius: number, unit: Length["unit"], whole: number): Length =>
    unit === "%" && whole > 0 ? { value: round((radius / whole) * 100), unit } : { value: radius, unit: "px" };
  return { ...gradient, size: { x: as(x, units[0], box.width), y: as(y, units[1], box.height) } };
}

const EXTENTS: string[] = ["closest-side", "closest-corner", "farthest-side", "farthest-corner"];
const KEYWORD_POSITIONS: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };

/** A length as CSS writes it in % or px (a bare 0 too); null for anything else (`calc()`, a keyword). */
function lengthOf(token: string): Length | null {
  const match = /^(-?(?:\d*\.)?\d+)(%|px)?$/.exec(token);
  if (!match || (!match[2] && parseFloat(match[1]) !== 0)) return null;
  return { value: parseFloat(match[1]), unit: (match[2] as Length["unit"]) ?? "px" };
}

/**
 * A length as CSS writes it, and, given the `whole` px that 100% is, a sum of
 * px and % as Chrome writes one (`calc(100% - 10px)`) in px; null for anything else.
 */
function lengthOrCalc(token: string, whole: number | undefined): Length | null {
  const length = lengthOf(token);
  const inside = /^calc\((.*)\)$/.exec(token)?.[1];
  if (length || whole === undefined || !inside) return length;
  const parts = inside.trim().split(/\s+/);
  if (parts.length % 2 === 0) return null;
  let px = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const term = lengthOf(parts[i]);
    const sign = i === 0 || parts[i - 1] === "+" ? 1 : parts[i - 1] === "-" ? -1 : 0;
    if (!term || !sign) return null;
    px += sign * lengthPx(term, whole);
  }
  return { value: px, unit: "px" };
}

/** The center and size CSS gives a radial gradient when the page says nothing of them: an ellipse from the middle out to the farthest corner. */
function middleOut(): Omit<RadialGradient, "type" | "stops"> {
  return { center: { x: { value: 50, unit: "%" }, y: { value: 50, unit: "%" } }, size: { extent: "farthest-corner", circle: false } };
}

/**
 * A radial gradient's size and center from what comes before its stops
 * (`circle closest-side at 30% 20%`); null for what cannot be told in one
 * length (`calc()`, as Chrome writes a center offset from the right edge).
 * Given the layer's box, a `calc()` of px and % is told, in px, for that box.
 */
function radialShapeOf(lead: string, box?: PaintArea): Omit<RadialGradient, "type" | "stops"> | null {
  const tokens = split(lead, " ");
  const at = tokens.indexOf("at");
  const [shapeTokens, centerTokens] = at < 0 ? [tokens, []] : [tokens.slice(0, at), tokens.slice(at + 1)];
  let circle = false;
  let extent: Extent = "farthest-corner";
  const lengths: Length[] = [];
  for (const token of shapeTokens) {
    // A radius across, then one down.
    const l = lengthOrCalc(token, lengths.length ? box?.height : box?.width);
    if (token === "circle") circle = true;
    else if (EXTENTS.includes(token)) extent = token as Extent;
    else if (l) lengths.push(l);
    else if (token !== "ellipse") return null;
  }
  const center = centerOfTokens(centerTokens, box);
  if (!center) return null;
  if (lengths.length === 1) return { center, size: { x: lengths[0], y: lengths[0] } };
  if (lengths.length === 2) return { center, size: { x: lengths[0], y: lengths[1] } };
  return { center, size: { extent, circle } };
}

/** A center from `at …`: one or two keywords or lengths, across first unless the keyword says otherwise; the middle when there is none. */
function centerOfTokens(tokens: string[], box?: PaintArea): RadialGradient["center"] | null {
  if (tokens.length > 2) return null;
  const [a, b] = tokens;
  // `top left`, `bottom 20%`: down named first.
  const swap = a === "top" || a === "bottom" || b === "left" || b === "right";
  const [across, down] = swap ? [b, a] : [a, b];
  const position = (token: string | undefined, whole: number | undefined): Length | null =>
    token === undefined ? { value: 50, unit: "%" } : token in KEYWORD_POSITIONS ? { value: KEYWORD_POSITIONS[token], unit: "%" } : lengthOrCalc(token, whole);
  const [x, y] = [position(across, box?.width), position(down, box?.height)];
  return x && y ? { x, y } : null;
}

/** `in oklab`, `in oklch longer hue`: how the colors blend. The editor blends in the default space. */
const INTERPOLATION = /\bin\s+[a-z-]+(\s+(shorter|longer|increasing|decreasing)\s+hue)?/i;
const POSITION = /^(-?(\d*\.)?\d+(%|[a-z]+)?|calc\(.*\))$/i;

/** The color of a stop written as CSS (`red 10%`), or null when it has none (a hint, or what comes before the stops). */
function colorOf(stop: string): string | null {
  const color = split(stop, " ").filter((token) => !POSITION.test(token)).join(" ");
  return color && CSS.supports("color", color) ? color : null;
}

/**
 * The stops, at the positions CSS puts them, each in the unit the page writes
 * it in: missing ones spread evenly between their neighbours (in their unit, or
 * in % between px and %), the first at 0% and the last at 100%; one before the
 * one before it is where that one is. `length`: the gradient's length in px, to
 * tell where stops in px and % are against each other.
 */
function stopsOf(args: string[], length: number, colors: ColorReader): ColorStop[] | null {
  const stops: { color: string; at: Length | null }[] = [];
  for (const arg of args) {
    const color = colorOf(arg);
    if (color === null) continue; // A hint: where between two stops their colors meet halfway.
    // A position that cannot be told (`calc()`) is left out, as if the page had.
    const positions = split(arg, " ").filter((token) => POSITION.test(token)).map(lengthOf);
    for (const at of positions.length ? positions : [null]) stops.push({ color, at });
  }
  if (stops.length < 2) return null;
  stops[0].at ??= { value: 0, unit: "%" };
  stops.at(-1)!.at ??= { value: 100, unit: "%" };
  const along = (at: Length) => alongOf({ position: at.value, unit: at.unit }, length);
  let furthest: Length = stops[0].at;
  for (const stop of stops) {
    if (stop.at === null) continue;
    if (along(stop.at) < along(furthest)) stop.at = furthest;
    else furthest = stop.at;
  }
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].at !== null) continue;
    const from = i - 1;
    let to = i;
    while (stops[to].at === null) to++;
    const [a, b] = [stops[from].at!, stops[to].at!];
    const [unit, start, end] = a.unit === b.unit ? [a.unit, a.value, b.value] : (["%", along(a), along(b)] as const);
    for (let j = i; j < to; j++) stops[j].at = { value: start + ((end - start) * (j - from)) / (to - from), unit };
  }
  return stops.map(({ color, at }) => stop(colors.color(color), at!.value, at!.unit));
}

/** How far along the gradient a stop is, in % of its `length` in px. */
export function alongOf({ position, unit }: Pick<ColorStop, "position" | "unit">, length: number): number {
  if (unit === "%") return position;
  return length > 0 ? (position / length) * 100 : 0;
}

/** The stops in the order they are along a gradient `length` px long. */
export function sortedStops(stops: ColorStop[], length: number): ColorStop[] {
  return [...stops].sort((a, b) => alongOf(a, length) - alongOf(b, length));
}

/** An angle in degrees as a linear gradient takes it: within one turn, from 0 up to 360. */
export function turned(degrees: number): number {
  return round(((degrees % 360) + 360) % 360);
}

const SIDE_ANGLES: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };

/** A linear gradient's direction in degrees: an angle, a side (`to right`), or a corner, which depends on the box. */
function angleOf(lead: string, width: number, height: number): number | null {
  if (!lead) return 180;
  const angle = /^(-?(?:\d*\.)?\d+)(deg|grad|rad|turn)$/.exec(lead);
  if (angle) {
    const degrees = parseFloat(angle[1]) * { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }[angle[2] as "deg"];
    return turned(degrees);
  }
  const sides = /^to\s+([a-z]+)(?:\s+([a-z]+))?$/.exec(lead);
  if (!sides || !(sides[1] in SIDE_ANGLES) || (sides[2] && !(sides[2] in SIDE_ANGLES))) return null;
  if (!sides[2]) return SIDE_ANGLES[sides[1]];
  // To a corner: square to the diagonal between the other two corners.
  const horizontal = (side: string) => side === "right" || side === "left";
  const [across, along] = horizontal(sides[1]) ? [sides[1], sides[2]] : [sides[2], sides[1]];
  const turn = (Math.atan2(height, width) * 180) / Math.PI;
  const up = along === "top";
  const degrees = across === "right" ? (up ? turn : 180 - turn) : up ? 360 - turn : 180 + turn;
  return round(degrees);
}

/** The fill as another type, as Figma turns it: a color into a gradient that fades it out, a gradient into its first color. */
export function fillAs(fill: Fill | null, type: "solid" | Gradient["type"]): Fill {
  const stops: ColorStop[] =
    fill && "stops" in fill
      ? fill.stops
      : [stop(fill?.type === "solid" ? fill : BLACK, 0), stop({ ...(fill?.type === "solid" ? fill : BLACK), opacity: 0 }, 100)];
  if (type === "solid") return { type, color: stops[0].color, opacity: stops[0].opacity };
  if (type === "linear") return { type, angle: fill?.type === "linear" ? fill.angle : 180, stops };
  if (fill?.type === "radial") return fill;
  return { type, ...middleOut(), stops };
}

const BLACK: Color = { color: "#000000", opacity: 1 };

/** A stop, its fields in the order the editor reads them back in: a change is told from no change by comparing them as written. */
export function stop({ color, opacity }: Color, position: number, unit: ColorStop["unit"] = "%"): ColorStop {
  return { color, opacity, position: round(position), unit };
}

/** A new stop, in %, `along` % of the way along a gradient `length` px long, in the color the gradient has there. */
export function stopAt(stops: ColorStop[], along: number, length: number): ColorStop {
  const sorted = sortedStops(stops, length).map((s) => ({ ...s, along: alongOf(s, length) }));
  const after = sorted.findIndex((s) => s.along >= along);
  if (after <= 0) return stop(sorted[after === 0 ? 0 : sorted.length - 1], along);
  const [a, b] = [sorted[after - 1], sorted[after]];
  const t = b.along === a.along ? 0 : (along - a.along) / (b.along - a.along);
  const channel = (i: number) => Math.round(parseInt(a.color.slice(i, i + 2), 16) * (1 - t) + parseInt(b.color.slice(i, i + 2), 16) * t);
  const color = `#${[1, 3, 5].map((i) => channel(i).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  return stop({ color, opacity: round(a.opacity * (1 - t) + b.opacity * t) }, along);
}

/** Where a new stop goes when none is pointed at, in % along a gradient `length` px long: halfway across the widest gap between two stops. */
export function nextStopPosition(stops: ColorStop[], length: number): number {
  const sorted = sortedStops(stops, length).map((s) => alongOf(s, length));
  let best = { from: sorted[0], to: sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > best.to - best.from) best = { from: sorted[i - 1], to: sorted[i] };
  }
  return round((best.from + best.to) / 2);
}

const SIDES = ["top", "right", "bottom", "left"];

/** Every CSS property a stroke is read from. */
export const STROKE_SETS = ["width", "style", "color"].flatMap((part) => SIDES.map((side) => `border-${side}-${part}`));

/**
 * The layer's border as a stroke: the color and line of the first side drawn
 * (a dotted line reads as dashed), a side with no line as 0; none with no side drawn.
 */
export function readStroke(el: Element, colors: ColorReader): Stroke | null {
  const style = getComputedStyle(el);
  const of = (side: string, part: string) => style.getPropertyValue(`border-${side}-${part}`);
  const weights = SIDES.map((side) => (/^(none|hidden)$/.test(of(side, "style")) ? 0 : round(parseFloat(of(side, "width")) || 0)));
  const first = weights.findIndex((weight) => weight > 0);
  if (first < 0) return null;
  return {
    ...colors.color(of(SIDES[first], "color")),
    weight: weights.every((weight) => weight === weights[0]) ? weights[0] : (weights as Stroke["weight"]),
    style: /^(dashed|dotted)$/.test(of(SIDES[first], "style")) ? "dashed" : "solid",
  };
}

/**
 * The stroke drawn at `weight`, as the editor reads it back: every side alike
 * is one weight. No side drawn is a stroke at 0, as in Figma: only taking the
 * stroke off is no stroke.
 */
export function strokeWith({ color, opacity, style }: Stroke, weight: Stroke["weight"]): Stroke {
  const alike = typeof weight === "number" ? weight : weight.every((w) => w === weight[0]) ? weight[0] : weight;
  return { color, opacity, weight: alike, style };
}

/** The CSS that draws the stroke; no stroke takes the border off and leaves its color as it is. */
export function writeStroke(stroke: Stroke | null): Record<string, string> {
  if (!stroke) return { "border-width": "0px", "border-style": "none" };
  const { weight } = stroke;
  return {
    "border-width": typeof weight === "number" ? `${weight}px` : weight.map((w) => `${w}px`).join(" "),
    "border-style": stroke.style,
    "border-color": cssColor(stroke),
  };
}

/** Splits CSS at a separator outside parentheses, trimmed, leaving out empty parts. */
export function split(css: string, separator: "," | " "): string[] {
  const parts: string[] = [];
  let depth = 0;
  let part = "";
  for (const char of css) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (depth === 0 && (separator === " " ? /\s/.test(char) : char === separator)) {
      parts.push(part);
      part = "";
    } else part += char;
  }
  parts.push(part);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
