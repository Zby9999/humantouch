/** @jsxImportSource preact */
import type { TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useRef, useState } from "preact/hooks";
import { hexToRgb, hsbToRgb, hslToRgb, oklchToRgb, rgbToHex, rgbToHsb, rgbToHsl, rgbToOklch, type Hsb, type Oklch, type Rgb } from "./color-spaces";
import { Icon } from "./icons";
import type { Color } from "./paint";
import { holdPointer } from "./pointer-held";
import { asStep, parseNumber, TextField } from "./Properties";
import { Select } from "./Select";

type Format = "hex" | "rgb" | "hsl" | "oklch";
const FORMATS: { value: Format; label: string }[] = [
  { value: "hex", label: "Hex" },
  { value: "rgb", label: "RGB" },
  { value: "hsl", label: "HSL" },
  { value: "oklch", label: "OKLCH" },
];
/** The format last chosen: the picker opens in it again. */
let lastFormat: Format = "hex";

/** The most chroma an OKLCH slider offers: about the most any sRGB color has. */
const MAX_CHROMA = 0.37;

/** What the system offers to pick a color from anywhere on screen: Chrome and Edge have it. */
interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
const EyeDropper = (globalThis as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;

/**
 * The Custom tab of a color's picker, as in Figma: a square of saturation and
 * brightness under the hue, the hue and opacity on bars, an eyedropper where
 * the browser has one, and the color typed as Hex, RGB, HSL or OKLCH, the last
 * on bars of its own (designer, 2026-11-05). The color set is always a hex in
 * sRGB with its opacity, as the change set keeps it: OKLCH outside sRGB comes
 * in it with less chroma. Dragging is one adjustment, as on a number's icon.
 */
export function ColorPanel({ color, onChange }: { color: Color; onChange(color: Color, continues?: boolean): void }) {
  /**
   * The hue and the rest as last set here, while the color is still the one they made: a gray, or
   * black, keeps the hue it was given, and the square its place, as no hex says them.
   */
  const [kept, setKept] = useState<{ hex: string; hsb?: Hsb; oklch?: Oklch } | null>(null);
  const [format, setShownFormat] = useState(lastFormat);
  const ours = kept?.hex === color.color ? kept : null;
  const rgb = hexToRgb(color.color);
  const hsb = ours?.hsb ?? rgbToHsb(rgb);
  const oklch = ours?.oklch ?? rgbToOklch(rgb);

  const setRgb = (next: Rgb, continues?: boolean, from?: { hsb?: Hsb; oklch?: Oklch }) => {
    const hex = rgbToHex(next);
    setKept({ hex, ...from });
    if (hex !== color.color) onChange({ color: hex, opacity: color.opacity }, continues);
  };
  const setHsb = (next: Hsb, continues?: boolean) => setRgb(hsbToRgb(next), continues, { hsb: next });
  const setOklch = (next: Oklch, continues?: boolean) => {
    const rgb = oklchToRgb(next);
    // More chroma than sRGB has there shows as what it comes to: the bar's thumb stops at the most there is.
    setRgb(rgb, continues, { oklch: { ...next, c: Math.min(next.c, rgbToOklch(rgb).c) } });
  };
  const setOpacity = (opacity: number, continues?: boolean) => opacity !== color.opacity && onChange({ color: color.color, opacity }, continues);
  const setFormat = (next: Format) => setShownFormat((lastFormat = next));

  const hue = rgbToHex(hsbToRgb({ h: hsb.h, s: 1, b: 1 }));
  const opacityField = (
    <label class="ht-field ht-color-opacity" data-ht-tip="Opacity">
      <TextField
        label="Opacity"
        value={`${Math.round(color.opacity * 100)}%`}
        parse={(text) => {
          const percent = parseNumber(text, 0, 100);
          return percent === null ? null : percent / 100;
        }}
        step={(by) => setOpacity(Math.min(1, Math.max(0, Math.round(color.opacity * 100 + by) / 100)))}
        onChange={setOpacity}
      />
    </label>
  );
  /** A number of the color typed in, from `min` to `max`, shown to `digits` decimals. */
  const part = (label: string, value: number, min: number, max: number, set: (n: number) => void, digits = 0) => (
    <label class="ht-field" data-ht-tip={label} key={label}>
      <TextField
        label={label}
        value={String(Math.round(value * 10 ** digits) / 10 ** digits)}
        parse={(text) => parseNumber(text, min, max)}
        step={(by) => set(Math.min(max, Math.max(min, value + by * (digits ? 10 ** -digits : 1))))}
        onChange={set}
      />
    </label>
  );

  return (
    <div class="ht-color-panel">
      <Area hsb={hsb} hue={hue} onChange={setHsb} />
      <div class="ht-color-bars">
        {EyeDropper && (
          <button
            type="button"
            class="ht-icon-button"
            aria-label="Pick a color from the screen"
            data-ht-tip="Pick a color from the screen"
            onClick={() => {
              new EyeDropper()
                .open()
                .then(({ sRGBHex }) => setRgb(hexToRgb(sRGBHex.length === 7 ? sRGBHex : rgbToHex(parseCssRgb(sRGBHex)))))
                .catch(() => {}); // Esc: nothing picked.
            }}
          >
            <Icon name="eyedropper" />
          </button>
        )}
        <div class="ht-color-sliders">
          <Slider label="Hue" value={hsb.h} min={0} max={360} track={HUE_TRACK} thumb={hue} onChange={(h, continues) => setHsb({ ...hsb, h }, continues)} />
          <Slider
            label="Opacity"
            value={Math.round(color.opacity * 100)}
            min={0}
            max={100}
            unit="%"
            track={`linear-gradient(90deg, transparent, ${color.color}), var(--ht-checker)`}
            thumb={color.color}
            onChange={(percent, continues) => setOpacity(percent / 100, continues)}
          />
        </div>
      </div>
      <div class="ht-row ht-color-values">
        <Select class="ht-select ht-color-format" aria-label="Color format" value={format} onChange={(event) => setFormat(event.currentTarget.value as Format)}>
          {FORMATS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {format === "hex" && (
          <label class="ht-field" data-ht-tip="Hex">
            <TextField label="Hex" value={color.color.slice(1)} parse={parseHexText} onChange={(hex) => setRgb(hexToRgb(hex))} />
          </label>
        )}
        {format === "rgb" && rgb.map((n, i) => part(["Red", "Green", "Blue"][i], n, 0, 255, (v) => setRgb(rgb.map((m, j) => (j === i ? v : m)) as Rgb)))}
        {format === "hsl" &&
          (() => {
            const hsl = rgbToHsl(rgb);
            return [
              part("Hue", hsl.h, 0, 360, (h) => setRgb(hslToRgb({ ...hsl, h }))),
              part("Saturation", hsl.s * 100, 0, 100, (s) => setRgb(hslToRgb({ ...hsl, s: s / 100 }))),
              part("Lightness", hsl.l * 100, 0, 100, (l) => setRgb(hslToRgb({ ...hsl, l: l / 100 }))),
            ];
          })()}
        {opacityField}
      </div>
      {format === "oklch" && (
        <div class="ht-color-oklch">
          <OklchRow label="L" name="OKLCH lightness" value={oklch.l * 100} min={0} max={100} digits={1} step={1} track={oklchTrack((t) => ({ ...oklch, l: t }))} thumb={color.color} onChange={(l, continues) => setOklch({ ...oklch, l: l / 100 }, continues)} />
          <OklchRow label="C" name="OKLCH chroma" value={oklch.c} min={0} max={MAX_CHROMA} digits={3} step={0.01} track={oklchTrack((t) => ({ ...oklch, c: t * MAX_CHROMA }))} thumb={color.color} onChange={(c, continues) => setOklch({ ...oklch, c }, continues)} />
          <OklchRow label="H" name="OKLCH hue" value={oklch.h} min={0} max={360} digits={1} step={1} track={oklchTrack((t) => ({ ...oklch, h: t * 360 }))} thumb={color.color} onChange={(h, continues) => setOklch({ ...oklch, h }, continues)} />
        </div>
      )}
    </div>
  );
}

const HUE_TRACK = "linear-gradient(90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

/** A bar of what an OKLCH value would draw along it, `at(t)` for t from 0 to 1, in sRGB. */
function oklchTrack(at: (t: number) => Oklch): string {
  const stops = Array.from({ length: 13 }, (_, i) => rgbToHex(oklchToRgb(at(i / 12))));
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** `rgb(r, g, b)` or `rgba(…)`, as an eyedropper may give it. */
function parseCssRgb(text: string): Rgb {
  const [r = 0, g = 0, b = 0] = (text.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b];
}

/** `#rgb` or `#rrggbb`, with or without the `#`, as `#RRGGBB`. */
function parseHexText(text: string): string | null {
  let hex = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

/**
 * A press and drag that sets a value from where the pointer is in the
 * element: the press sets it, each move after is one step of the same
 * adjustment, and until it is let go no key edits (ADR 0012).
 */
function useDrag<T>(read: (event: PointerEvent, box: DOMRect) => T, set: (value: T, continues: boolean) => void) {
  const drag = useRef<number | null>(null);
  return {
    onPointerDown: (event: TargetedPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const el = event.currentTarget;
      el.focus();
      el.setPointerCapture(event.pointerId);
      holdPointer(event.pointerId);
      drag.current = event.pointerId;
      set(read(event, el.getBoundingClientRect()), false);
    },
    onPointerMove: (event: TargetedPointerEvent<HTMLElement>) => {
      if (drag.current !== event.pointerId) return;
      const box = event.currentTarget.getBoundingClientRect();
      asStep(() => set(read(event, box), true));
    },
    onPointerUp: (event: TargetedPointerEvent<HTMLElement>) => {
      if (drag.current === event.pointerId) drag.current = null;
    },
    onPointerCancel: () => (drag.current = null),
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The square of saturation, across, and brightness, up, for the hue: its handle moved by pointer or by the arrow keys (10 with ⇧). */
function Area({ hsb, hue, onChange }: { hsb: Hsb; hue: string; onChange(hsb: Hsb, continues: boolean): void }) {
  const drag = useDrag(
    (event, box) => ({ ...hsb, s: clamp01((event.clientX - box.left) / box.width), b: clamp01(1 - (event.clientY - box.top) / box.height) }),
    onChange,
  );
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const by = event.shiftKey ? 0.1 : 0.01;
    const move = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowDown: [0, -by], ArrowUp: [0, by] }[event.key];
    if (!move) return;
    event.preventDefault();
    asStep(() => onChange({ ...hsb, s: clamp01(hsb.s + move[0]), b: clamp01(hsb.b + move[1]) }, false));
  };
  return (
    <div
      class="ht-color-area"
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuetext={`Saturation ${Math.round(hsb.s * 100)}%, brightness ${Math.round(hsb.b * 100)}%`}
      style={{ "--ht-hue": hue }}
      onKeyDown={onKeyDown}
      {...drag}
    >
      <span class="ht-color-thumb" style={{ left: `${hsb.s * 100}%`, top: `${(1 - hsb.b) * 100}%`, "--ht-thumb": rgbToHex(hsbToRgb(hsb)) }} />
    </div>
  );
}

/** A value along a bar drawn with `track`: dragged, clicked, or moved with the arrow keys (10 with ⇧). */
function Slider({ label, value, min, max, unit = "", track, thumb, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  track: string;
  thumb: string;
  onChange(value: number, continues: boolean): void;
}) {
  const drag = useDrag((event, box) => min + clamp01((event.clientX - box.left) / box.width) * (max - min), onChange);
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    if (!by) return;
    event.preventDefault();
    const step = ((max - min) / 100) * (event.shiftKey ? 10 : 1);
    asStep(() => onChange(Math.min(max, Math.max(min, value + by * step)), false));
  };
  return (
    <div
      class="ht-color-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${Math.round(value * 1000) / 1000}${unit}`}
      style={{ "--ht-track": track }}
      onKeyDown={onKeyDown}
      {...drag}
    >
      <span class="ht-color-thumb" style={{ left: `${((value - min) / (max - min)) * 100}%`, "--ht-thumb": thumb }} />
    </div>
  );
}

/** One of OKLCH's lightness, chroma and hue: its letter, its bar, and the number typed in. */
function OklchRow({ label, name, value, min, max, digits, step, track, thumb, onChange }: {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  /** Shown to this many decimals, and typed to them; ↑ / ↓ change it by `step`. */
  digits: number;
  step: number;
  track: string;
  thumb: string;
  onChange(value: number, continues?: boolean): void;
}) {
  const shown = Math.round(value * 10 ** digits) / 10 ** digits;
  return (
    <div class="ht-color-oklch-row">
      <span class="ht-glyph" aria-hidden="true">
        {label}
      </span>
      <Slider label={name} value={value} min={min} max={max} track={track} thumb={thumb} onChange={onChange} />
      <label class="ht-field" data-ht-tip={name}>
        <TextField
          label={`${name} value`}
          value={String(shown)}
          parse={(text) => {
            const n = parseFloat(text);
            return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10 ** digits) / 10 ** digits)) : null;
          }}
          step={(by) => onChange(Math.min(max, Math.max(min, value + by * step)))}
          onChange={(n) => onChange(n)}
        />
      </label>
    </div>
  );
}
