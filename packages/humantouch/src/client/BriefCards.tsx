/** @jsxImportSource preact */
/**
 * The briefs on the canvas (ticket 121): each a card in the blank space
 * beside the view it was written in, with a dashed line to the middle of the
 * side of its layer nearest it (`brief-cards.ts`). On the stage, as a note
 * on the canvas is: they pan and zoom with it. A card is written in, and
 * changed, in place: what is typed is set once it is left, on Enter (⇧Enter
 * for a new line) or by its arrow; Esc leaves it as it was; left empty, it is taken off. Typed, ⌘Z there is the field's own.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BRIEF_ATTR, LAYER_ID_ATTR } from "./canvas-style";
import { CARD_WIDTH, pathOf, placeCards, type Box } from "./brief-cards";
import { transformOf, type Camera } from "./camera";
import { Icon } from "./icons";
import { CHANGE_GLIDE_MS, EASE_IN_OUT, prefersReducedMotion } from "./motion";
import type { Layer, LayerTree } from "./layers";

/** The layers of `doc`, laid out as `tree`, that have a brief: one for each, the first of its instances. */
export function briefedLayers(doc: Document, tree: LayerTree): Layer[] {
  const seen = new Set<string>();
  const layers: Layer[] = [];
  for (const el of doc.querySelectorAll(`[${BRIEF_ATTR}]`)) {
    const id = el.getAttribute(LAYER_ID_ATTR);
    if (id !== null && seen.has(id)) continue;
    const layer = tree.layerOf(el);
    if (!layer) continue;
    if (id !== null) seen.add(id);
    layers.push(layer);
  }
  return layers;
}

/** Where the designer's briefs are kept, by page: each card's view, by the card's key. */
const VIEWS_KEY = "humantouch:brief-views";

/**
 * The view each card is beside, by its key (`keyOf` of the view), as the
 * designer last wrote it there: kept in this browser, by page, so the cards
 * are where they were after a reload or back in edit mode. One not kept is
 * beside the desktop view. Read once, as the first card is drawn.
 */
export const briefViews = (() => {
  let kept: Record<string, string> | null = null;
  const page = () => location.pathname;
  const all = (): Record<string, Record<string, string>> => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "null");
      return saved && typeof saved === "object" ? (saved as Record<string, Record<string, string>>) : {};
    } catch {
      return {};
    }
  };
  return {
    read(key: string): string | undefined {
      kept ??= all()[page()] ?? {};
      return kept[key];
    },
    /** The card's brief taken off: its view is not kept, so a layer that takes its id later starts beside the desktop view. */
    forget(key: string) {
      kept ??= all()[page()] ?? {};
      if (!(key in kept)) return;
      delete kept[key];
      try {
        localStorage.setItem(VIEWS_KEY, JSON.stringify({ ...all(), [page()]: kept }));
      } catch {
        // Not kept: as with `write`.
      }
    },
    write(key: string, view: string) {
      kept ??= all()[page()] ?? {};
      if (kept[key] === view) return;
      kept[key] = view;
      try {
        localStorage.setItem(VIEWS_KEY, JSON.stringify({ ...all(), [page()]: kept }));
      } catch {
        // Not kept (storage full or off): the card is where it is till the page reloads.
      }
    },
  };
})();

/** A card to show. */
export interface BriefCard {
  key: string;
  /** What its layer is called, as the Layers panel names it. */
  name: string;
  /** The brief; "" for one being written that has none yet. */
  text: string;
  /** Where it goes beside, and its layer, on the stage (`CardToPlace`). */
  host: Box;
  free: { left: boolean; right: boolean };
  layer: Box | null;
  /** Its layer is selected. */
  selected: boolean;
}

interface Props {
  cards: BriefCard[];
  /** What a card keeps clear of: the views, with room for their labels, and the layers off the canvas. */
  obstacles: Box[];
  camera: Camera;
  /** The card being written in, by its key; null when none is. */
  writing: string | null;
  /** A card pressed: written in from now on. */
  onWrite(key: string): void;
  /** What was typed in the card left: set as its brief ("" takes it off), or, null, left as it was. */
  onWritten(key: string, text: string | null): void;
  /** The card opened to be written in is not all in sight: the canvas panned by `dx` and `dy` screen px brings it in. */
  onReveal(dx: number, dy: number): void;
  /** Kept up to date with where the cards are on the stage: ⇧1 fits them in with the views. */
  placedNow: { current: Box[] };
}

/** How far in from the viewport's edges a card opened is brought, in screen px. */
const REVEAL_MARGIN = 24;

/** A card's height till it is measured, in canvas px. */
const UNMEASURED = 120;

export function BriefCards({ cards, obstacles, camera, writing, onWrite, onWritten, onReveal, placedNow }: Props) {
  /** Each card's height as last measured, by its key: what it holds decides it; and which card was written in then. */
  const [measured, setMeasured] = useState<{ heights: Record<string, number>; writing: string | null }>({ heights: {}, writing: null });
  const { heights } = measured;
  const layer = useRef<HTMLDivElement>(null);
  const measure = () => {
    const el = layer.current;
    if (!el) return;
    let changed = false;
    const now: Record<string, number> = {};
    for (const card of el.querySelectorAll<HTMLElement>(".ht-brief-card")) {
      const key = card.dataset.key!;
      now[key] = card.offsetHeight;
      if (heights[key] !== now[key]) changed = true;
    }
    if (changed || measured.writing !== writing) setMeasured({ heights: now, writing });
  };
  // Measured again only once what the cards hold changes: not as a layer is dragged, or the canvas zoomed.
  const holds = cards.map((card) => `${card.key}\u0000${card.name}\u0000${card.text}`).join("\u0001") + `\u0001${writing}`;
  useLayoutEffect(measure, [holds]);
  // A card set before, opened again, is placed as tall as it was, so it grows down from where it is and does not move;
  // the cards below it move down to make room.
  const restHeights = useRef<Record<string, number>>({});
  for (const key in heights) if (key !== measured.writing) restHeights.current[key] = heights[key];
  const restOf = (key: string) => (key === writing && key !== "new" ? restHeights.current[key] : undefined);
  // Just closed, a card is as tall as it was when it was opened till it is measured again, not as tall as it was open:
  // else it would be placed for a moment where it is not, and bounce back.
  const heightOf = (key: string) => (key === measured.writing && key !== writing ? restHeights.current[key] : undefined) ?? heights[key] ?? UNMEASURED;
  const placed = placeCards(
    cards.map((card) => ({
      key: card.key,
      host: card.host,
      free: card.free,
      layer: card.layer,
      height: heightOf(card.key),
      restHeight: restOf(card.key),
    })),
    obstacles,
    // Only a new brief is written beside its layer; one set before is changed where its card is, so it does not jump (designer, 2026-11-10).
    writing === "new" ? writing : null,
  );
  placedNow.current = placed;
  // Written, the card goes from beside its layer back out beside its view (designer, 2026-11-10): it glides there, its
  // line drawn again once it is. Found by its layer, once it is drawn again: a new brief's card is keyed anew as it is set.
  const lastWriting = useRef<{ box: Box; layer: Box } | null>(null);
  const toGlide = useRef<{ box: Box; layer: Box; renders: number } | null>(null);
  useLayoutEffect(() => {
    const now = writing === null ? null : placed.find((p) => p.key === writing);
    const nowLayer = now && cards.find((c) => c.key === writing)?.layer;
    if (now && nowLayer) {
      lastWriting.current = { box: now, layer: nowLayer };
      toGlide.current = null;
      return;
    }
    if (writing === null && lastWriting.current) {
      toGlide.current = { ...lastWriting.current, renders: 0 };
      lastWriting.current = null;
    }
    const was = toGlide.current;
    if (!was) return;
    const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
    const i = cards.findIndex((c) => c.layer && same(c.layer, was.layer));
    // Glides only to where it ends up: once it is drawn again, and measured as it is now, closed.
    if (i < 0 || measured.writing !== writing || heights[cards[i].key] === undefined) {
      // Not drawn again within a few renders (its brief taken off, say): nothing to glide.
      if (++was.renders > 5) toGlide.current = null;
      return;
    }
    toGlide.current = null;
    const key = CSS.escape(cards[i].key);
    const el = layer.current?.querySelector<HTMLElement>(`.ht-brief-card[data-key="${key}"]`);
    const line = layer.current?.querySelector<SVGGElement>(`.ht-brief-lines g[data-key="${key}"]`);
    const to = placed[i];
    const dx = was.box.x - to.x;
    const dy = was.box.y - to.y;
    if (!el || (!dx && !dy) || prefersReducedMotion()) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: CHANGE_GLIDE_MS, easing: EASE_IN_OUT });
    line?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: CHANGE_GLIDE_MS + 120, easing: "linear" });
  });
  // Opened, a card out of sight is brought in, as little as it takes: it may be off the screen, beside the views.
  useLayoutEffect(() => {
    const at = writing === null ? null : placed.find((p) => p.key === writing);
    const viewport = layer.current?.parentElement;
    if (!at || !viewport) return;
    const shift = (from: number, size: number, room: number) => {
      const start = from;
      const end = from + size;
      if (start < REVEAL_MARGIN) return REVEAL_MARGIN - start;
      if (end > room - REVEAL_MARGIN) return Math.max(REVEAL_MARGIN - start, room - REVEAL_MARGIN - end);
      return 0;
    };
    const dx = shift(camera.x + at.x * camera.zoom, at.width * camera.zoom, viewport.clientWidth);
    const dy = shift(camera.y + at.y * camera.zoom, at.height * camera.zoom, viewport.clientHeight);
    if (dx || dy) onReveal(dx, dy);
  }, [writing]);
  return (
    <div ref={layer} class="ht-brief-cards" style={{ transform: transformOf(camera) }}>
      <svg class="ht-brief-lines" width="1" height="1" aria-hidden="true">
        {placed.map(
          (p, i) =>
            p.line && (
              <g key={p.key} data-key={p.key} data-selected={cards[i].selected || undefined}>
                <path d={pathOf(p.line.path)} />
                <circle cx={p.line.to.x} cy={p.line.to.y} r={3 / camera.zoom} />
              </g>
            ),
        )}
      </svg>
      {placed.map((p, i) => (
        <Card
          key={cards[i].key}
          card={cards[i]}
          box={p}
          writing={writing === cards[i].key}
          onWrite={() => onWrite(cards[i].key)}
          onWritten={(text) => onWritten(cards[i].key, text)}
          onResize={measure}
        />
      ))}
    </div>
  );
}

interface CardProps {
  card: BriefCard;
  box: Box;
  writing: boolean;
  onWrite(): void;
  onWritten(text: string | null): void;
  /** Its field grew or shrank as it was typed in. */
  onResize(): void;
}

/**
 * A card as the designer drew it in Figma (2026-11-10): the brief alone, 220px wide, looking as the Design panel's
 * fields do; written in, the accent's arrow under it on the right sets it, as the count of changes is drawn. Its
 * layer's name is its label, not shown. Left empty, the brief is taken off.
 */
function Card({ card, box, writing, onWrite, onWritten, onResize }: CardProps) {
  return (
    <div
      class="ht-brief-card"
      role="group"
      aria-label={`Brief on ${card.name}`}
      data-key={card.key}
      data-selected={card.selected || undefined}
      data-writing={writing || undefined}
      style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${CARD_WIDTH}px` }}
      // A press here is not on the canvas: it writes in the card.
      onPointerDown={(event) => {
        event.stopPropagation();
        if (writing || event.button !== 0 || (event.target as Element).closest("button")) return;
        // Another card written in is left first, and what was typed there set, before this one opens.
        const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
        if (root.activeElement instanceof HTMLElement) root.activeElement.blur();
        onWrite();
      }}
      // Written in, a press on the card around its field keeps the field focused: opened by a press, the card grows
      // under the pointer, and what is typed is not set till the field is left.
      onMouseDown={(event) => {
        if (writing && !(event.target as Element).closest("textarea")) event.preventDefault();
      }}
    >
      {writing ? <Field text={card.text} onWritten={onWritten} onResize={onResize} /> : <p class="ht-brief-card-text">{card.text}</p>}
      {writing && (
        <button
          type="button"
          class="ht-brief-card-set"
          aria-label="Set brief"
          // The field keeps the focus till it is left, by this: what is typed is set as it is left.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => (event.currentTarget.closest(".ht-brief-card")!.querySelector("textarea") as HTMLTextAreaElement | null)?.blur()}
        >
          <Icon name="arrow-up" />
        </button>
      )}
    </div>
  );
}

/** The card's field, focused as it shows, as tall as what is typed in it. */
function Field({ text, onWritten, onResize }: { text: string; onWritten(text: string | null): void; onResize(): void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  /** Esc pressed: left as it was. */
  const cancelled = useRef(false);
  const fit = () => {
    const el = field.current!;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, []);
  useEffect(() => {
    const el = field.current!;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={field}
      class="ht-brief-card-text ht-brief-card-field"
      aria-label="Brief"
      placeholder="What should the Agent achieve here?"
      defaultValue={text}
      rows={1}
      onInput={() => {
        fit();
        onResize();
      }}
      onBlur={(event) => onWritten(cancelled.current ? null : event.currentTarget.value.trim())}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
