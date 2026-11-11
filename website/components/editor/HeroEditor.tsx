"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DemoPage, type Selection } from "./DemoPage";
import { Icon } from "./Icon";
import type { IconName } from "./icon-paths";
import { COLOR_VARIABLES, INITIAL, LAYERS, NO_EDITS, TREE, VIEWS, countChanges, styleIn, type Edits, type Key, type Prop, type ViewName } from "./model";

/** The editor is laid out at this size, then scaled to the hero. */
const W = 1280;
const H = 640;
const PANEL = 240;
const CANVAS_PAD = 28;
const VIEW_GAP = 28;
const ZOOM = (W - 2 * PANEL - 2 * CANVAS_PAD - (VIEWS.length - 1) * VIEW_GAP) / VIEWS.reduce((sum, v) => sum + v.width, 0);

/**
 * The hero: Human Touch's editor, small, on a backdrop. It works: select a layer on any view or in the Layers panel,
 * change it in the Design panel, and the three views follow. Made in the Tablet or Phone view, a change holds only at
 * that view's breakpoint.
 */
export function HeroEditor() {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [selection, setSelection] = useState<Selection>({ key: "card", index: 0 });
  const [hover, setHover] = useState<Selection>(null);
  const [view, setView] = useState<ViewName>("Desktop");

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function set(key: Key, prop: Prop, value: string | number) {
    setEdits((all) => ({ ...all, [view]: { ...all[view], [key]: { ...all[view][key], [prop]: value } } }));
  }

  const changes = countChanges(edits);

  return (
    <section aria-label="Human Touch's editor, to try" className="relative w-full max-w-[1200px] overflow-hidden rounded-[4px] bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/backdrops/hero.jpg" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="relative px-[4.5%] pt-[4.5%] pb-[4.5%]">
        <div ref={frame} className="overflow-hidden rounded-[8px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.3),0_24px_64px_-12px_rgb(0_0_0/0.5)]" style={{ height: H * scale }}>
          <div
            className="ht-ed grid origin-top-left font-editor text-[11px] leading-4 text-[var(--ed-text)] select-none"
            style={{ width: W, height: H, transform: `scale(${scale})`, gridTemplateColumns: `${PANEL}px 1fr ${PANEL}px`, background: "var(--ed-canvas)" }}
          >
            <LayersPanel selection={selection} hover={hover} onSelect={setSelection} onHover={setHover} />
            <Canvas scale={scale} edits={edits} selection={selection} hover={hover} view={view} onSelect={(s, v) => { setSelection(s); if (s) setView(v); }} onHover={setHover} />
            <DesignPanel
              selection={selection}
              view={view}
              edits={edits}
              changes={changes}
              onSet={set}
              onReset={() => setEdits(NO_EDITS)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function LayersPanel({ selection, hover, onSelect, onHover }: { selection: Selection; hover: Selection; onSelect: (s: Selection) => void; onHover: (s: Selection) => void }) {
  return (
    <div className="flex min-h-0 flex-col border-r border-[var(--ed-border)] bg-[var(--ed-panel)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--ed-border)] px-3">
        <span className="text-[12px] font-medium">Layers</span>
        <Icon name="sidebar" className="text-[var(--ed-icon)]" />
      </div>
      <ul className="min-h-0 flex-1 overflow-hidden py-1.5" onPointerLeave={() => onHover(null)}>
        {TREE.map((row, i) => {
          const layer = LAYERS[row.key];
          const selected = selection?.key === row.key && (selection.index === undefined || selection.index === row.index);
          const inSelected = !selected && selection?.key === "card" && row.index === selection.index && row.key !== "card";
          const hovered = hover?.key === row.key && hover.index === row.index;
          const name = row.index !== undefined && row.key !== "card" ? (row.key === "cardTitle" ? ["Plan", "Vote", "Go"][row.index] : layer.name) : layer.name;
          return (
            <li
              key={i}
              onPointerDown={() => onSelect({ key: row.key, index: row.index })}
              onPointerEnter={() => onHover({ key: row.key, index: row.index })}
              className={`flex h-6 cursor-default items-center gap-1.5 pr-3 ${selected ? "bg-[var(--ed-row-selected)]" : inSelected ? "bg-[color-mix(in_srgb,var(--ed-row-selected)_45%,transparent)]" : hovered ? "bg-[var(--ed-row-hover)]" : ""}`}
              style={{ paddingLeft: 10 + row.depth * 14 }}
            >
              <span className={`size-1.5 rounded-[1px] ${layer.kind === "text" ? "opacity-0" : "bg-[var(--ed-muted)] opacity-60"}`} />
              <Icon name={iconOf(row.key)} className={layer.instance ? "text-purple-600" : "text-[var(--ed-icon)]"} />
              <span className={`truncate ${layer.instance ? "text-purple-600" : ""}`}>{name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function iconOf(key: Key): IconName {
  const layer = LAYERS[key];
  if (layer.instance) return "instance";
  if (layer.kind === "stack-horizontal") return "stack-horizontal";
  if (layer.kind === "stack") return "stack-vertical";
  return layer.kind;
}

type Camera = { x: number; y: number; k: number };

/**
 * The canvas: the three views side by side. Drag its empty space to pan; pinch, or scroll with ⌘ or Ctrl held, to zoom
 * around the pointer. Plain scrolling is left to the page.
 */
function Canvas({ scale, edits, selection, hover, view, onSelect, onHover }: { scale: number; edits: Edits; selection: Selection; hover: Selection; view: ViewName; onSelect: (s: Selection, v: ViewName) => void; onHover: (s: Selection) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; cam: Camera; moved: boolean } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const px = (e.clientX - box.left) / scaleRef.current - CANVAS_PAD;
      const py = (e.clientY - box.top) / scaleRef.current - 64;
      setCam((c) => {
        const k = Math.min(4, Math.max(0.5, c.k * Math.exp(-e.deltaY * 0.01)));
        return { k, x: px - ((px - c.x) * k) / c.k, y: py - ((py - c.y) * k) / c.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoom = ZOOM * cam.k;

  return (
    <div
      ref={root}
      className={`relative min-w-0 overflow-hidden ${drag.current?.moved ? "cursor-grabbing" : ""}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, cam, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = (e.clientX - d.x) / scale;
        const dy = (e.clientY - d.y) / scale;
        if (!d.moved && Math.hypot(dx, dy) < 3) return;
        d.moved = true;
        setCam({ ...d.cam, x: d.cam.x + dx, y: d.cam.y + dy });
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) onSelect(null, view);
        drag.current = null;
      }}
      onDoubleClick={() => setCam({ x: 0, y: 0, k: 1 })}
    >
      <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex gap-0.5 rounded-[8px] bg-[var(--ed-panel)] p-0.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.08)]">
        {(["pointer", "frame", "text", "brief-add"] as IconName[]).map((tool) => (
          <span key={tool} className={`flex size-7 items-center justify-center rounded-[6px] ${tool === "pointer" ? "bg-blue-500 text-white" : "text-[var(--ed-icon)]"}`}>
            <Icon name={tool} />
          </span>
        ))}
      </div>
      <p className="pointer-events-none absolute bottom-2.5 left-3 z-10 text-[var(--ed-muted)] tabular-nums">{Math.round(zoom * 100)}%</p>
      <div className="absolute origin-top-left" style={{ left: CANVAS_PAD, top: 64, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
        <div className="flex items-start" style={{ gap: VIEW_GAP }}>
          {VIEWS.map((v) => (
            <div key={v.name} style={{ width: v.width * ZOOM }}>
              <div
                className={`mb-1.5 flex items-center gap-1.5 truncate text-[11px] ${v.name === view ? "font-medium text-[var(--ed-view-label)]" : "text-[var(--ed-muted)]"}`}
                style={{ transform: `scale(${1 / cam.k})`, transformOrigin: "left bottom", width: v.width * ZOOM * cam.k }}
              >
                <span>{v.name}</span>
                <span className="text-[var(--ed-muted)]">{v.width}</span>
                {v.note && <span className="font-mono text-[10px] text-purple-600">{v.note}</span>}
              </div>
              <div className="overflow-hidden shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.08)]" style={{ width: v.width * ZOOM }}>
                <div className="origin-top-left" style={{ transform: `scale(${ZOOM})`, width: v.width }}>
                  <ZoomedHeight zoom={ZOOM}>
                    <DemoPage view={v.name} width={v.width} zoom={zoom} edits={edits} selection={selection} hover={hover} onSelect={onSelect} onHover={onHover} />
                  </ZoomedHeight>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Scaling leaves the page's layout height behind: this sets the box to the page's height times the zoom. */
function ZoomedHeight({ zoom, children }: { zoom: number; children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const fit = () => setHeight(el.offsetHeight);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div style={{ height: height === undefined ? undefined : height * zoom }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

function DesignPanel({ selection, view, edits, changes, onSet, onReset }: { selection: Selection; view: ViewName; edits: Edits; changes: number; onSet: (key: Key, prop: Prop, value: string | number) => void; onReset: () => void }) {
  const key = selection?.key;
  const layer = key ? LAYERS[key] : null;
  const style = key ? styleIn(edits, view, key) : null;
  const changed = (prop: Prop) => key !== undefined && style !== null && String(style[prop]).toUpperCase() !== String(INITIAL[key][prop]).toUpperCase();

  return (
    <div className="flex min-h-0 flex-col border-l border-[var(--ed-border)] bg-[var(--ed-panel)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--ed-border)] px-3">
        <span className="flex items-center gap-1.5 text-[12px] font-medium">
          Design
          {changes > 0 && (
            <button
              type="button"
              onClick={onReset}
              title="Discard all"
              className="flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-gradient-to-b from-blue-400 to-blue-500 px-1.5 text-[11px] font-medium text-blue-100 tabular-nums shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.15)]"
            >
              {changes}
            </button>
          )}
        </span>
        <Icon name="close" className="text-[var(--ed-icon)]" />
      </div>
      {!key || !layer || !style ? (
        <div className="p-3 text-[var(--ed-muted)]">
          <p className="mb-2 font-medium text-[var(--ed-title)]">Variables</p>
          <ul className="flex flex-col gap-1.5">
            {COLOR_VARIABLES.map((v) => (
              <li key={v.name} className="flex items-center gap-2">
                <span className="size-3.5 rounded-[3px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" style={{ background: v.value }} />
                <span className="text-[var(--ed-text)]">{v.name}</span>
                <span className="ml-auto font-mono text-[10px]">{v.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="border-b border-[var(--ed-border)] px-3 py-2.5">
            <p className={`flex items-center gap-1.5 font-medium ${layer.instance ? "text-purple-600" : ""}`}>
              <Icon name={iconOf(key)} />
              {layer.name}
            </p>
            <dl className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 text-[11px]">
              <dt className="text-[var(--ed-muted)]">Type</dt>
              <dd>{{ stack: "Vertical Stack", "stack-horizontal": "Horizontal Stack", grid: "Grid", frame: "Frame", text: "Text" }[layer.kind]}</dd>
              {layer.instance && (
                <>
                  <dt className="text-[var(--ed-muted)]">Component</dt>
                  <dd>Card</dd>
                  <dt className="text-[var(--ed-muted)]">Instances</dt>
                  <dd>3</dd>
                </>
              )}
              <dt className="text-[var(--ed-muted)]">View</dt>
              <dd>{view === "Desktop" ? "Desktop, every width" : `${view} only`}</dd>
            </dl>
          </div>
          {(layer.props.includes("gap") || layer.props.includes("padding")) && (
            <Section title={layer.kind === "grid" ? "Grid" : "Stack"}>
              <div className="grid grid-cols-2 gap-1.5">
                {layer.props.includes("gap") && <NumberField icon="gap" value={Number(style.gap)} changed={changed("gap")} onChange={(v) => onSet(key, "gap", v)} />}
                {layer.props.includes("padding") && <NumberField icon="padding-left" value={Number(style.padding)} changed={changed("padding")} onChange={(v) => onSet(key, "padding", v)} />}
              </div>
            </Section>
          )}
          {layer.props.includes("radius") && (
            <Section title="Appearance">
              <div className="grid grid-cols-2 gap-1.5">
                <NumberField icon="opacity" value={100} suffix="%" onChange={() => {}} />
                <NumberField icon="radius" value={Number(style.radius)} changed={changed("radius")} onChange={(v) => onSet(key, "radius", v)} />
              </div>
            </Section>
          )}
          {layer.props.includes("fill") && (
            <Section title="Fill">
              <ColorField value={String(style.fill)} changed={changed("fill")} onChange={(v) => onSet(key, "fill", v)} />
            </Section>
          )}
          {layer.props.includes("fontSize") && (
            <Section title="Text">
              <div className="flex flex-col gap-1.5">
                <NumberField icon="font-size" value={Number(style.fontSize)} changed={changed("fontSize")} onChange={(v) => onSet(key, "fontSize", v)} />
                <ColorField value={String(style.color)} changed={changed("color")} onChange={(v) => onSet(key, "color", v)} />
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--ed-border)] px-3 pt-2.5 pb-3">
      <p className="mb-2 font-medium text-[var(--ed-title)]">{title}</p>
      {children}
    </div>
  );
}

const FIELD = "flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 shadow-[var(--ed-input-shadow)]";

/** A number field: type a value, press ↑ or ↓, or drag its icon sideways to scrub. */
function NumberField({ icon, value, suffix, changed, onChange }: { icon: IconName; value: number; suffix?: string; changed?: boolean; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; value: number } | null>(null);

  return (
    <label className={`${FIELD} ${changed ? "bg-blue-100 dark:bg-blue-700" : "bg-[var(--ed-input)]"}`}>
      <span
        className="cursor-ew-resize text-[var(--ed-muted)]"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, value };
        }}
        onPointerMove={(e) => {
          if (!scrub.current) return;
          onChange(Math.max(0, Math.round(scrub.current.value + (e.clientX - scrub.current.x) / 2)));
        }}
        onPointerUp={() => (scrub.current = null)}
      >
        <Icon name={icon} size={12} />
      </span>
      <input
        inputMode="numeric"
        aria-label={icon}
        value={draft ?? `${value}${suffix ?? ""}`}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (draft !== null) {
            const n = parseFloat(draft);
            if (Number.isFinite(n)) onChange(Math.max(0, n));
          }
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            onChange(Math.max(0, value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)));
          }
        }}
        className="w-full min-w-0 bg-transparent tabular-nums outline-none"
      />
    </label>
  );
}

/** A color: its swatch opens the project's Variables; the hex can be typed. */
function ColorField({ value, changed, onChange }: { value: string; changed?: boolean; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const variable = COLOR_VARIABLES.find((v) => v.value.toUpperCase() === value.toUpperCase());

  return (
    <div className="relative">
      <div className={`${FIELD} ${changed ? "bg-blue-100 dark:bg-blue-700" : "bg-[var(--ed-input)]"}`}>
        <button
          type="button"
          aria-label="Pick a color"
          onClick={() => setOpen((o) => !o)}
          className="size-3.5 shrink-0 rounded-[3px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.25)]"
          style={{ background: value }}
        />
        {variable && draft === null ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 truncate">
            <Icon name="variable" size={12} className="text-[var(--ed-muted)]" />
            {variable.name}
          </button>
        ) : (
          <input
            aria-label="Hex"
            value={draft ?? value.replace("#", "")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null && /^[0-9a-f]{6}$/i.test(draft)) onChange(`#${draft.toUpperCase()}`);
              setDraft(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full min-w-0 bg-transparent uppercase outline-none"
          />
        )}
        <span className="ml-auto text-[var(--ed-muted)]">100%</span>
      </div>
      {open && (
        <ul className="absolute top-7 right-0 left-0 z-20 rounded-[8px] bg-[var(--ed-panel)] p-1 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_8px_24px_-4px_rgb(0_0_0/0.2)]">
          {COLOR_VARIABLES.map((v) => (
            <li key={v.name}>
              <button
                type="button"
                onClick={() => {
                  onChange(v.value);
                  setOpen(false);
                }}
                className="flex h-6 w-full items-center gap-2 rounded-[4px] px-1.5 hover:bg-[var(--ed-row-hover)]"
              >
                <span className="size-3.5 rounded-[3px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" style={{ background: v.value }} />
                {v.name}
                {v.value.toUpperCase() === value.toUpperCase() && <Icon name="check" size={12} className="ml-auto text-blue-500" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
