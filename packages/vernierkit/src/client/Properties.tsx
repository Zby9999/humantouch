/** @jsxImportSource preact */
import type { TargetedFocusEvent, TargetedKeyboardEvent } from "preact";
import { useRef, useState } from "preact/hooks";
import type { Editor, Fill, Property, PropertyValues } from "./edits";
import { Icon, type IconName } from "./icons";
import type { Layer } from "./layers";

interface Props {
  editor: Editor;
  layer: Layer;
  /** Called after each edit, so the panel shows the new values. */
  onEdit(): void;
}

/** A fill added to a layer that has none, as in Figma. */
const NEW_FILL: Fill = { type: "solid", color: "#FFFFFF", opacity: 1 };

/** The Design panel's properties for the selected layer, in design language. */
export function Properties({ editor, layer, onEdit }: Props) {
  if (layer.kind === "locked") {
    return <p class="vk-layer-note vk-section">A locked layer comes from a dependency. It can only be moved and resized as a whole.</p>;
  }
  const set = <P extends Property>(property: P) => (value: PropertyValues[P]) => {
    editor.set(layer, property, value);
    onEdit();
  };
  const radius = editor.can(layer, "radius") && editor.read(layer, "radius");
  const fill = editor.can(layer, "fill") && editor.read(layer, "fill");
  return (
    <>
      {radius !== false && (
        <section class="vk-section" aria-labelledby="vk-appearance">
          <h3 id="vk-appearance" class="vk-section-title">Appearance</h3>
          <NumberField
            label="Corner radius"
            icon="radius"
            value={typeof radius === "number" ? radius : null}
            min={0}
            onChange={set("radius")}
          />
        </section>
      )}
      {fill !== false && <FillSection fill={fill} onChange={set("fill")} />}
    </>
  );
}

function FillSection({ fill, onChange }: { fill: Fill | null; onChange(fill: Fill | null): void }) {
  return (
    <section class="vk-section" role="group" aria-label="Fill">
      <div class="vk-section-header">
        <h3 class="vk-section-title">Fill</h3>
        {!fill && (
          <button type="button" class="vk-icon-button" aria-label="Add fill" onClick={() => onChange(NEW_FILL)}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {fill && (
        <div class="vk-row">
          <div class="vk-field vk-color-field">
            <input
              type="color"
              class="vk-swatch"
              aria-label="Pick fill color"
              value={fill.color.toLowerCase()}
              onInput={(event) => onChange({ ...fill, color: event.currentTarget.value.toUpperCase() })}
            />
            <TextField label="Fill color" value={fill.color.slice(1)} parse={parseHex} onChange={(color) => onChange({ ...fill, color })} />
            <TextField
              label="Fill opacity"
              class="vk-opacity"
              value={`${Math.round(fill.opacity * 100)}%`}
              parse={(text) => {
                const percent = parseNumber(text, 0, 100);
                return percent === null ? null : percent / 100;
              }}
              onChange={(opacity) => onChange({ ...fill, opacity })}
            />
          </div>
          <button type="button" class="vk-icon-button" aria-label="Remove fill" onClick={() => onChange(null)}>
            <Icon name="minus" />
          </button>
        </div>
      )}
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  icon: IconName;
  /** Null: the value differs from part to part, shown as Mixed. */
  value: number | null;
  min?: number;
  onChange(value: number): void;
}

/** A number typed in, or stepped with ↑ / ↓ (10 at a time with ⇧). */
function NumberField({ label, icon, value, min = -Infinity, onChange }: NumberFieldProps) {
  return (
    <label class="vk-field" title={label}>
      <Icon name={icon} />
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

interface TextFieldProps<T> {
  label: string;
  class?: string;
  value: string;
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
function TextField<T>({ label, class: className, value, parse, step, onChange }: TextFieldProps<T>) {
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
