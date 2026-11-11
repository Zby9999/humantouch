"use client";

import { useEffect, useRef, useState } from "react";
import { NumberField } from "./fields";
import { Icon } from "./Icon";
import type { IconName } from "./icon-paths";
import { ACME_COLORS, RADIUS_VARIABLES, SPACING_VARIABLES, TEXT_VARIABLES, type Layer, type Prop, type Style } from "./model";

/**
 * The Design panel's sections for one selected layer, in the product's markup (Properties.tsx), after its header: the
 * hero's panel and the Canvas card's both draw them. Everything in them can be pointed at, opened, dragged and typed
 * into, but they keep nothing: a number rolls back once let go, a choice stays as it was, a Variable picked leaves the
 * one bound. `open: "fill"` holds the fill's colors open, for a demo to pick from; `shadows`, the drop shadows listed;
 * `changed`, the properties changed here, their fields in the accent with a reset, as the product marks them; `follows`,
 * numbers given from outside roll to their digits.
 */
export function DesignSections({
  layer,
  style,
  icon,
  size,
  badge,
  shadows = 0,
  open,
  changed = [],
  follows = false,
}: {
  layer: Layer;
  style: Style;
  icon: IconName;
  size: [number, number];
  badge?: { range: string; label: string };
  shadows?: number;
  open?: "fill";
  changed?: Prop[];
  follows?: boolean;
}) {
  const isText = layer.kind === "text";
  const owner = layer.instance?.component ?? layer.inComponent?.component;
  const type = layer.kind === "stack" ? (style.direction === "row" ? "Horizontal Stack" : "Vertical Stack") : { grid: "Grid", frame: "Frame", text: "Text" }[layer.kind];
  const padding = style.padding as number[] | undefined;

  return (
    <>
      <section className="ht-layer-info" aria-label="Selected layer">
        <div className="ht-layer-head">
          <h3 className={`ht-layer-name${layer.instance ? " is-instance" : ""}`}>
            <Icon name={icon} />
            <span>{isText ? "Text" : layer.name}</span>
          </h3>
          {badge && (
            <span className="ht-breakpoint-badge" role="note" aria-label={badge.label}>
              {badge.range}
            </span>
          )}
        </div>
        <dl>
          <dt>Type</dt>
          <dd>{type}</dd>
          {owner && (
            <>
              <dt>Component</dt>
              <dd>{owner}</dd>
            </>
          )}
          <dt>Source</dt>
          <dd className="ht-source">{layer.source}</dd>
          {layer.instance && (
            <>
              <dt>Usage</dt>
              <dd className="ht-source">{layer.instance.usage}</dd>
              <dt>Instances</dt>
              <dd>{layer.instance.count}</dd>
            </>
          )}
          {layer.inComponent && (
            <>
              <dt>Repeated</dt>
              <dd>In {layer.inComponent.count} instances</dd>
            </>
          )}
        </dl>
      </section>

      <section className="ht-section" aria-labelledby="ht-size">
        <div className="ht-section-header">
          <h3 id="ht-size" className="ht-section-title">
            Size
          </h3>
        </div>
        {(["Width", "Height"] as const).map((dim, i) => (
          <div key={dim} className="ht-row ht-size-row">
            <div className="ht-variable-slot">
              <NumberField
                tip={dim}
                glyph={dim}
                value={size[i]}
                after={
                  <button type="button" className="ht-icon-button ht-field-action" aria-label={`Add min or max ${dim.toLowerCase()}`} aria-haspopup="listbox" aria-expanded="false">
                    <Icon name="plus" />
                  </button>
                }
              />
            </div>
            <span className="ht-select-field">
              <select className="ht-select" aria-label={`${dim} sizing`} value={layer.sizing[i].toLowerCase()} onChange={() => {}}>
                <option value="fixed">Fixed</option>
                <option value="hug">Hug</option>
                <option value="fill">Fill</option>
              </select>
            </span>
          </div>
        ))}
      </section>

      {(layer.kind === "stack" || layer.kind === "grid") && (
        <section className="ht-section" aria-labelledby="ht-stack">
          <div className="ht-section-header">
            <h3 id="ht-stack" className="ht-section-title">
              Layout
            </h3>
            <button type="button" className="ht-icon-button" aria-label="Dissolve Stack" data-tip="Dissolve Stack (⌥⇧A)">
              <Icon name="minus" />
            </button>
          </div>
          <div className="ht-row ht-align-row">
            <div className="ht-align" role="radiogroup" aria-label="Alignment">
              {["Top left", "Top center", "Top right", "Center left", "Center", "Center right", "Bottom left", "Bottom center", "Bottom right"].map((a, i) => (
                <button key={a} type="button" role="radio" className="ht-align-point" aria-checked={i === 0} aria-label={a} />
              ))}
            </div>
            <div className="ht-align-options">
              <ValueField
                tip="Gap"
                icon="gap"
                value={Number(style.gap)}
                variables={SPACING_VARIABLES}
                after={
                  <select className="ht-select ht-gap-mode" aria-label="Gap sizing" value="fixed" onChange={() => {}}>
                    <option value="fixed">Fixed</option>
                    <option value="auto">Auto</option>
                  </select>
                }
              />
              <div className="ht-row">
                <div className="ht-segmented-field" role="radiogroup" aria-label="Direction">
                  {(
                    [
                      ["Horizontal", "stack-horizontal", "row"],
                      ["Vertical", "stack-vertical", "column"],
                      ["Grid", "grid", "grid"],
                    ] as const
                  ).map(([label, icon, dir]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      className="ht-icon-button"
                      aria-checked={layer.kind === "grid" ? dir === "grid" : style.direction === dir}
                      aria-label={label}
                      data-tip={label}
                    >
                      <Icon name={icon} />
                    </button>
                  ))}
                </div>
                <button type="button" className="ht-icon-button" aria-label="Wrap" data-tip="Wrap" aria-pressed="false">
                  <Icon name="wrap" />
                </button>
              </div>
            </div>
          </div>
          {padding && <PaddingFields value={padding} />}
        </section>
      )}

      {layer.kind === "frame" && padding && (
        <section className="ht-section" aria-label="Padding">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Padding</h3>
          </div>
          <PaddingFields value={padding} />
        </section>
      )}

      <section className="ht-section" aria-labelledby="ht-appearance">
        <div className="ht-section-header">
          <h3 id="ht-appearance" className="ht-section-title">
            Appearance
          </h3>
        </div>
        <div className="ht-grid-2">
          <NumberField tip="Opacity" icon="opacity" value={Number(style.opacity)} unit="%" max={100} />
          {!isText && (
            <div className="ht-row">
              <ValueField tip="Corner radius" icon="radius" value={Number(style.radius ?? 0)} variables={RADIUS_VARIABLES} changed={changed.includes("radius")} follows={follows} />
              <button type="button" className="ht-icon-button" aria-label="Independent corners" data-tip="Independent corners" aria-pressed="false">
                <Icon name="corners" />
              </button>
            </div>
          )}
          <label className="ht-check">
            <input type="checkbox" checked readOnly />
            Visible
          </label>
          {!isText && (
            <label className="ht-check">
              <input type="checkbox" checked={false} readOnly />
              Clip content
            </label>
          )}
        </div>
      </section>

      {isText && (
        <section className="ht-section" role="group" aria-label="Text">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Text</h3>
          </div>
          <span className="ht-select-field ht-font-field">
            <span className="ht-font-sample" aria-hidden="true" style={{ fontFamily: layer.font === "Instrument Serif" ? "var(--font-instrument-serif)" : "var(--font-inter)" }}>
              Aa
            </span>
            <select className="ht-select ht-font" aria-label="Font" value={layer.font} onChange={() => {}}>
              <option>Instrument Serif</option>
              <option>Inter</option>
            </select>
          </span>
          <div className="ht-grid-2">
            <span className="ht-select-field ht-wide">
              <select className="ht-select" aria-label="Font weight" value={layer.weight} onChange={() => {}}>
                <option>Regular</option>
                <option>Medium</option>
                <option>Semi Bold</option>
                <option>Bold</option>
              </select>
            </span>
            <ValueField tip="Font size" icon="font-size" value={Number(style.fontSize)} variables={TEXT_VARIABLES} />
          </div>
          <div className="ht-grid-2">
            <NumberField tip="Line height" icon="line-height" value={135} unit="%" />
            <NumberField tip="Letter spacing" icon="letter-spacing" value={0} unit="%" />
          </div>
          <div className="ht-segmented-field ht-hug" role="radiogroup" aria-label="Text alignment">
            {(["Align left", "Align center", "Align right", "Justify"] as const).map((label, i) => (
              <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                <Icon name={(["align-left", "align-center", "align-right", "align-justify"] as IconName[])[i]} />
              </button>
            ))}
          </div>
          <div className="ht-row">
            <div className="ht-segmented-field" role="radiogroup" aria-label="Case">
              {(
                [
                  ["As typed", "—"],
                  ["Upper case", "AG"],
                  ["Lower case", "ag"],
                  ["Title case", "Ag"],
                ] as const
              ).map(([label, glyph], i) => (
                <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                  <span className="ht-text-glyph">{glyph}</span>
                </button>
              ))}
            </div>
            <div className="ht-segmented-field" role="radiogroup" aria-label="Decoration">
              {(
                [
                  ["No decoration", "—", "ht-none"],
                  ["Underline", "U", "ht-underline"],
                  ["Strikethrough", "S", "ht-strikethrough"],
                ] as const
              ).map(([label, glyph, cls], i) => (
                <button key={label} type="button" role="radio" className="ht-icon-button" aria-checked={i === 0} aria-label={label} data-tip={label}>
                  <span className={`ht-text-glyph ${cls}`}>{glyph}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="ht-section" role="group" aria-label="Fill">
        <div className="ht-section-header">
          <h3 className="ht-section-title">Fill</h3>
          {!isText && style.fill === undefined && (
            <button type="button" className="ht-icon-button" aria-label="Add fill" data-tip="Add fill">
              <Icon name="plus" />
            </button>
          )}
        </div>
        {(isText || style.fill !== undefined) && <ColorField name="Fill" value={String(style[isText ? "color" : "fill"])} removable={!isText} open={open === "fill"} changed={changed.includes(isText ? "color" : "fill")} />}
      </section>

      {!isText && (
        <section className="ht-section" role="group" aria-label="Stroke">
          <div className="ht-section-header">
            <h3 className="ht-section-title">Stroke</h3>
            {!layer.stroke && (
              <button type="button" className="ht-icon-button" aria-label="Add stroke" data-tip="Add stroke">
                <Icon name="plus" />
              </button>
            )}
          </div>
          {layer.stroke && (
            <>
              <ColorField name="Stroke" value={layer.stroke.color} opacity={layer.stroke.opacity} removable />
              <div className="ht-row ht-joined">
                <NumberField tip="Stroke weight" icon="stroke-weight" value={layer.stroke.weight} />
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke style" value="solid" onChange={() => {}}>
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                  </select>
                </span>
                <span className="ht-select-field">
                  <select className="ht-select" aria-label="Stroke sides" value={layer.stroke.sides} onChange={() => {}}>
                    <option>All</option>
                    <option>Top</option>
                    <option>Bottom</option>
                  </select>
                </span>
              </div>
            </>
          )}
        </section>
      )}

      <section className="ht-section" role="group" aria-label="Effects">
        <div className="ht-section-header">
          <h3 className="ht-section-title">Effects</h3>
          <button type="button" className="ht-icon-button" aria-label="Add effect" aria-haspopup="listbox" aria-expanded="false">
            <Icon name="plus" />
          </button>
        </div>
        {Array.from({ length: shadows }, (_, i) => (
          <div key={i} className="ht-effect" role="group" aria-label={`Shadow ${i + 1}`}>
            <div className="ht-row ht-paint-row">
              <button type="button" className="ht-fold" aria-label={`Shadow ${i + 1} details`} aria-expanded="false">
                <Icon name="chevron-down" />
              </button>
              <span className="ht-select-field ht-effect-type-field">
                <select className="ht-select ht-effect-type" aria-label={`Shadow ${i + 1} type`} value="drop" onChange={() => {}}>
                  <option value="drop">Drop shadow</option>
                  <option value="inner">Inner shadow</option>
                </select>
              </span>
              <button type="button" className="ht-icon-button" aria-label={`Remove shadow ${i + 1}`} data-tip={`Remove shadow ${i + 1}`}>
                <Icon name="minus" />
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}


/** Opens a list on the panel; anything picked in it, or a click outside, closes it, and nothing changes. */
function usePopover(shown = false) {
  const [open, setOpen] = useState(shown);
  // Opened from outside (a demo), it follows.
  useEffect(() => setOpen(shown), [shown]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const root = ref.current?.getRootNode() as ShadowRoot | undefined;
    const close = (e: Event) => !ref.current?.contains(e.composedPath()[0] as Node) && setOpen(false);
    root?.addEventListener("pointerdown", close, true);
    return () => root?.removeEventListener("pointerdown", close, true);
  }, [open]);
  return { open, setOpen, ref };
}

/** A value bound to a Variable, by name: click it for the others; detached, a number. Neither is kept. */
function ValueField({ tip, icon, value, variables, after, changed = false, follows = false }: { tip: string; icon: IconName; value: number; variables: { name: string; value: number }[]; after?: React.ReactNode; changed?: boolean; follows?: boolean }) {
  const pop = usePopover();
  const bound = variables.find((v) => v.value === value);
  if (!bound)
    return (
      <div className="ht-variable-slot">
        <NumberField tip={tip} icon={icon} value={value} className={changed ? "is-changed" : ""} follows={follows} after={<>{after}{changed && <Reset label={tip} />}</>} />
      </div>
    );
  return (
    <div ref={pop.ref} className="ht-variable-slot" style={{ position: "relative" }}>
      <div className={`ht-field ht-variable-chip${changed ? " is-changed" : ""}`}>
        <Icon name={icon} />
        <button type="button" className="ht-variable-chip-name" aria-label={`${tip} variable`} aria-haspopup="dialog" aria-expanded={pop.open} data-tip={`${bound.name}: ${bound.value}px`} onClick={() => pop.setOpen((o) => !o)}>
          {bound.name}
        </button>
        <button type="button" className="ht-icon-button" aria-label={`Detach ${tip.toLowerCase()} variable`} data-tip="Detach variable">
          <Icon name="detach" />
        </button>
        {changed && <Reset label={tip} />}
      </div>
      {pop.open && (
        <div className="ht-pop" style={{ top: 28, left: 0, width: 160 }}>
          {variables.map((v) => (
            <button key={v.name} type="button" aria-current={v.name === bound.name} onClick={() => pop.setOpen(false)}>
              {v.name}
              <span className="ht-pop-value">{v.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PaddingFields({ value }: { value: number[] }) {
  const sides: [string, IconName][] = [
    ["Padding top", "padding-top"],
    ["Padding right", "padding-right"],
    ["Padding bottom", "padding-bottom"],
    ["Padding left", "padding-left"],
  ];
  return (
    <div className="ht-grid-2" role="group" aria-label="Padding">
      {sides.map(([tip, icon], i) => (
        <ValueField key={tip} tip={tip} icon={icon} value={value[i]} variables={SPACING_VARIABLES} />
      ))}
    </div>
  );
}

/** A color: its swatch opens the project's colors; its value is the Variable it equals, or its hex, typed in and taken back. */
function ColorField({ name, value, opacity = 100, removable, open = false, changed = false }: { name: string; value: string; opacity?: number; removable?: boolean; open?: boolean; changed?: boolean }) {
  const pop = usePopover(open);
  const [draft, setDraft] = useState<string | null>(null);
  const bound = ACME_COLORS.find((v) => v.value.toUpperCase() === value.toUpperCase());
  const row = (
    <div className={`ht-color-row${changed ? " is-changed" : ""}`}>
      {/* Changed: one reset for the color and its opacity, at the row's left, as the product has it. */}
      {changed && <Reset label={name} />}
      <div className={`ht-field ht-color-field${bound ? "" : " is-joined"}${changed ? " is-changed" : ""}`}>
        <button type="button" className="ht-swatch ht-swatch-button" aria-label={`${name} color picker`} aria-haspopup="dialog" aria-expanded={pop.open} style={{ ["--ht-swatch" as string]: value }} onClick={() => pop.setOpen((o) => !o)} />
        {bound ? (
          <>
            <button type="button" className="ht-variable-chip-name" aria-label={`${name} color variable`} aria-haspopup="dialog" data-tip={`${bound.name}: ${bound.value}`} onClick={() => pop.setOpen((o) => !o)}>
              {bound.name}
            </button>
            <button type="button" className="ht-icon-button" aria-label={`Detach ${name.toLowerCase()} color variable`} data-tip="Detach variable">
              <Icon name="detach" />
            </button>
          </>
        ) : (
          <input
            type="text"
            className="ht-input"
            aria-label={`${name} hex`}
            spellCheck={false}
            value={draft ?? value.replace("#", "").toUpperCase()}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
          />
        )}
      </div>
      {!bound && <NumberField tip={`${name} opacity`} className="ht-color-opacity" value={opacity} unit="%" max={100} rolls={false} />}
    </div>
  );
  const picker = pop.open && (
    <div className="ht-pop" style={{ top: 28, left: 0, right: 0 }}>
      {ACME_COLORS.map((v) => (
        <button key={v.name} type="button" aria-current={v.value.toUpperCase() === value.toUpperCase()} onClick={() => pop.setOpen(false)}>
          <span className="ht-pop-swatch" style={{ background: v.value }} />
          {v.name}
          <span className="ht-pop-value">{v.value}</span>
        </button>
      ))}
    </div>
  );
  // A text's fill is its color row alone; a frame's paint has a remove button after it.
  if (!removable)
    return (
      <div ref={pop.ref} style={{ position: "relative" }}>
        {row}
        {picker}
      </div>
    );
  return (
    <div ref={pop.ref} className="ht-row ht-paint-row" style={{ position: "relative" }}>
      {row}
      <button type="button" className="ht-icon-button" aria-label={`Remove ${name.toLowerCase()}`} data-tip={`Remove ${name.toLowerCase()}`}>
        <Icon name="minus" />
      </button>
      {picker}
    </div>
  );
}

/** A changed field's reset, as the product's (ChangeMarks.tsx); here it takes nothing back. */
function Reset({ label }: { label: string }) {
  return (
    <button type="button" className="ht-reset" aria-label={`Reset ${label.toLowerCase()}`} data-tip={`Reset ${label.toLowerCase()}`}>
      <Icon name="reset" />
    </button>
  );
}
