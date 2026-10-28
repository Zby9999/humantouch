/**
 * The freezer: turns the live page into a canvas, a static copy of the whole
 * page inside a same-origin iframe, laid out at the page's original width.
 * The live page itself is left untouched.
 */
import { HOST_TAG } from "./host";
import { PIN_OFFSET_ATTR, PINNED_ATTR, SHEET_HREF_ATTR } from "./style-source";
import { FONT_STACK } from "./styles";
import { CHAIN_ATTR, readUsageChain } from "./usage-chain";
import { HAS_VIEWPORT_UNIT, mediaForViews, unitsForViews, VIEWPORT_MEDIA, type FrozenWindow } from "./viewport";

export interface Canvas {
  /** The frozen copy. Lives in the iframe that was passed to `freeze`. */
  document: Document;
  /** Laid-out size of the whole page, in CSS px, when it was frozen or put back. Each view's height follows what it shows since: `View.height`. */
  width: number;
  height: number;
  /** The height of the window the page was frozen in, px: what answers to the height in its CSS answers to this, and no view is shorter. */
  windowHeight: number;
  /** How far the page was scrolled down when it was frozen. */
  scrollY: number;
}

/** The window the designer was looking at when the page was frozen. */
interface Viewport {
  scrollX: number;
  scrollY: number;
}

/**
 * Added to every canvas: style changes made while editing apply at once, and
 * every layer can be hit-tested, even ones the page lets clicks pass through.
 */
const CANVAS_STYLES = `
*, *::before, *::after { transition: none !important; }
* { pointer-events: auto !important; }
html { scrollbar-width: none !important; }
[contenteditable] { outline: none !important; caret-color: #0d99ff !important; }
[contenteditable]::selection, [contenteditable] ::selection { background: rgb(13 153 255 / 0.3) !important; }
`;

/** Marks what the canvas shows in place of content it cannot copy: `video`, `iframe`. */
export const FROZEN = "data-vk-frozen";
/** On the canvas's own style element: added to every canvas, never saved with it. */
const CANVAS_STYLES_ATTR = "data-vk-canvas-styles";
/** An element scrolled when the page was frozen: `left top`. */
const SCROLL_ATTR = "data-vk-scroll";
/** An element in the top layer when the page was frozen: `modal` or `popover`. */
const TOP_LAYER_ATTR = "data-vk-top-layer";
/** On a saved canvas: its pixels, as a data URL. */
const PIXELS_ATTR = "data-vk-pixels";
/** On a saved canvas's root: its size and scroll, as JSON. */
const LAYOUT_ATTR = "data-vk-layout";
/** On the canvas's root: the address of the page it was frozen from, its path and query. */
export const PAGE_ATTR = "data-vk-page";

/** How long to wait at most for the copy's fonts and cross-origin stylesheets. */
const SETTLE_TIMEOUT_MS = 500;

/**
 * Freezes the page shown in `page` into `iframe`. The iframe must already be in
 * the document and should carry `sandbox="allow-same-origin"`, so nothing in
 * the copy can run. The page is copied before this returns its promise; the
 * promise settles once the copy is laid out.
 */
export function freeze(page: Window, iframe: HTMLIFrameElement): Promise<Canvas> {
  const live = page.document;
  const root = live.documentElement;
  const viewport: Viewport = { scrollX: page.scrollX, scrollY: page.scrollY };
  const frozen: FrozenWindow = {
    height: page.innerHeight,
    scrollbar: Math.max(0, page.innerWidth - root.clientWidth),
    matches: (query) => page.matchMedia(query).matches,
  };
  const animationEnds = readAnimationEnds(live);
  const copy = root.cloneNode(true) as HTMLElement;
  copy.setAttribute(PAGE_ATTR, page.location.pathname + page.location.search);

  // The clone has the same tree as the page, so the two lists line up one to one.
  const liveEls = [root, ...root.getElementsByTagName("*")];
  const copyEls = [copy, ...copy.getElementsByTagName("*")];
  for (let i = 0; i < liveEls.length; i++) {
    const from = liveEls[i] as HTMLElement;
    let to = copyEls[i] as HTMLElement;
    switch (from.localName) {
      case "script":
      case "noscript": // Scripts are off in the canvas, so this would show.
      case HOST_TAG:
        to.remove();
        continue;
      case "style":
        copyStyleRules(from as HTMLStyleElement, to);
        if ((from as HTMLStyleElement).media) to.setAttribute("media", mediaForViews((from as HTMLStyleElement).media, frozen));
        continue;
      case "link":
        inlineStylesheet(from as HTMLLinkElement, to, frozen);
        continue;
      case "canvas":
        drawInto(to as HTMLCanvasElement, from as HTMLCanvasElement);
        break;
      case "video":
        to = stillOf(from as HTMLVideoElement, to);
        break;
      case "iframe":
        if (!(from as HTMLIFrameElement).contentDocument) to = placeholderFor(from as HTMLIFrameElement, to);
        break;
    }
    // Read once, here on the live page: editing reads only the copy.
    const chain = readUsageChain(from);
    if (chain.length) to.setAttribute(CHAIN_ATTR, JSON.stringify(chain));
    const ends = animationEnds.get(from);
    if (ends) for (const [name, value] of ends) setImportant(to, name, value);
    if (to.hasAttribute("style")) resolveViewportUnits(to.style, frozen);
    pinToViewport(from, to, viewport);
    // The document's own scroll is shown by the canvas view instead.
    if ((from.scrollTop || from.scrollLeft) && from !== live.scrollingElement) {
      to.setAttribute(SCROLL_ATTR, `${from.scrollLeft} ${from.scrollTop}`);
    }
    if (from.matches(":modal")) to.setAttribute(TOP_LAYER_ATTR, "modal");
    else if (from.matches(":popover-open")) to.setAttribute(TOP_LAYER_ATTR, "popover");
  }
  // Constructable stylesheets come after all the others in the cascade.
  for (const sheet of live.adoptedStyleSheets) {
    copy.append(Object.assign(live.createElement("style"), { textContent: serialize(sheet.cssRules, null) }));
  }
  // The page's height chain (`height: 100%` on html, body, …) ends at the window, which the canvas is taller than.
  const rootHeight = root.getBoundingClientRect().height;
  if (Math.abs(rootHeight - root.clientHeight) < 1) setImportant(copy, "height", `${rootHeight}px`);

  const doc = iframe.contentDocument;
  if (!doc) return Promise.reject(new Error("Vernier Kit: the canvas iframe is not in the document"));
  // Writing a doctype puts the copy in the same rendering mode as the page.
  doc.open();
  doc.write(doctypeOf(live));
  doc.close();
  doc.replaceChild(doc.adoptNode(copy), doc.documentElement);
  // Written back as text: every view, and the canvas saved with the round, takes the sheets from their text.
  for (const sheet of [...doc.styleSheets]) {
    const rules = readRules(sheet);
    const owner = sheet.ownerNode;
    if (!rules || !owner || !VIEWPORT_DEPENDENT.test(owner.textContent ?? "")) continue;
    resolveViewport(rules, frozen);
    owner.textContent = serialize(rules, null);
  }
  return present(doc, iframe, { width: root.clientWidth, height: frozen.height, windowHeight: frozen.height, scrollY: viewport.scrollY });
}

/**
 * The canvas as an HTML document, edits included, to save with the round.
 * What lives outside the markup goes in with it: rules changed through the
 * CSSOM, the pixels of stills, the values of form fields.
 */
export function serializeCanvas(canvas: Canvas): string {
  const doc = canvas.document;
  const root = doc.documentElement;
  const copy = root.cloneNode(true) as HTMLElement;
  const els = [root, ...root.getElementsByTagName("*")];
  const copyEls = [copy, ...copy.getElementsByTagName("*")];
  for (let i = 0; i < els.length; i++) {
    const from = els[i];
    const to = copyEls[i];
    switch (from.localName) {
      case "style": {
        if (from.hasAttribute(CANVAS_STYLES_ATTR)) {
          to.remove();
          break;
        }
        const rules = readRules((from as HTMLStyleElement).sheet);
        if (rules) to.textContent = serialize(rules, null);
        break;
      }
      case "canvas":
        try {
          to.setAttribute(PIXELS_ATTR, (from as HTMLCanvasElement).toDataURL());
        } catch {} // Painted from another origin: it cannot be read back.
        break;
      case "input": {
        const input = from as HTMLInputElement;
        if (input.type === "checkbox" || input.type === "radio") to.toggleAttribute("checked", input.checked);
        else if (input.type !== "file") to.setAttribute("value", input.value);
        break;
      }
      case "textarea":
        to.textContent = (from as HTMLTextAreaElement).value;
        break;
      case "option":
        to.toggleAttribute("selected", (from as HTMLOptionElement).selected);
        break;
    }
  }
  const layout: Layout = { width: canvas.width, height: canvas.height, windowHeight: canvas.windowHeight, scrollY: canvas.scrollY };
  copy.setAttribute(LAYOUT_ATTR, JSON.stringify(layout));
  return doctypeOf(doc) + copy.outerHTML;
}

/** The doctype that puts a document in `doc`'s rendering mode. */
function doctypeOf(doc: Document): string {
  return doc.compatMode === "CSS1Compat" ? "<!DOCTYPE html>" : "";
}

/** Puts a canvas saved by `serializeCanvas` back into `iframe`, as `freeze` would. */
export function restore(html: string, iframe: HTMLIFrameElement): Promise<Canvas> {
  const doc = iframe.contentDocument;
  if (!doc) return Promise.reject(new Error("Vernier Kit: the canvas iframe is not in the document"));
  doc.open();
  doc.write(html);
  doc.close();
  const root = doc.documentElement;
  const saved = JSON.parse(root.getAttribute(LAYOUT_ATTR) ?? "null") as (Omit<Layout, "windowHeight"> & Partial<Layout>) | null;
  if (!saved) return Promise.reject(new Error("Vernier Kit: the saved canvas has no layout"));
  // Saved before the window's height was: no view shorter than the canvas was then.
  const layout: Layout = { ...saved, windowHeight: saved.windowHeight ?? saved.height };
  root.removeAttribute(LAYOUT_ATTR);
  const pixels = [...doc.querySelectorAll<HTMLCanvasElement>(`canvas[${PIXELS_ATTR}]`)].map((still) => {
    const image = new Image();
    image.src = still.getAttribute(PIXELS_ATTR)!;
    still.removeAttribute(PIXELS_ATTR);
    return image.decode().then(
      () => drawInto(still, image),
      () => {},
    );
  });
  return present(doc, iframe, layout, pixels);
}

/** How a canvas is laid out: its width, its height, the window's height, and how far down the designer was. */
type Layout = Pick<Canvas, "width" | "height" | "windowHeight" | "scrollY">;

/** Brings a copy written into `iframe` to rest, sized to the whole page. */
function present(doc: Document, iframe: HTMLIFrameElement, layout: Layout, loading: Promise<unknown>[] = []): Promise<Canvas> {
  const styles = Object.assign(doc.createElement("style"), { textContent: CANVAS_STYLES });
  styles.setAttribute(CANVAS_STYLES_ATTR, "");
  doc.head.append(styles);
  return layOut(doc, iframe, layout, loading);
}

/**
 * Shows `canvas` in `iframe` too, `width` px wide: one more view of it (ADR
 * 0008). The copy is of the canvas as it is now, edits included, its tree the
 * same node for node; it is made before this returns its promise, which
 * settles once it is laid out.
 */
export function copyCanvas(canvas: Canvas, iframe: HTMLIFrameElement, width: number): Promise<Canvas> {
  const from = canvas.document;
  const doc = iframe.contentDocument;
  if (!doc) return Promise.reject(new Error("Vernier Kit: the view's iframe is not in the document"));
  doc.open();
  doc.write(doctypeOf(from));
  doc.close();
  const copy = doc.importNode(from.documentElement, true);
  doc.replaceChild(copy, doc.documentElement);
  // What lives outside the markup: the pixels of stills, the options chosen.
  const froms = from.documentElement.getElementsByTagName("*");
  const copies = copy.getElementsByTagName("*");
  for (let i = 0; i < froms.length; i++) {
    if (froms[i].localName === "canvas") drawInto(copies[i] as HTMLCanvasElement, froms[i] as HTMLCanvasElement);
    else if (froms[i].localName === "option") (copies[i] as HTMLOptionElement).selected = (froms[i] as HTMLOptionElement).selected;
  }
  return layOut(doc, iframe, { width, height: canvas.height, windowHeight: canvas.windowHeight, scrollY: canvas.scrollY });
}

/** Brings a copy to rest in `iframe`, `layout.width` wide and as tall as the whole page there, once what it loads is in. */
function layOut(doc: Document, iframe: HTMLIFrameElement, layout: Layout, loading: Promise<unknown>[] = []): Promise<Canvas> {
  for (const el of doc.querySelectorAll<HTMLElement>(`[${TOP_LAYER_ATTR}]`)) {
    try {
      if (el.getAttribute(TOP_LAYER_ATTR) === "modal") {
        el.removeAttribute("open");
        (el as HTMLDialogElement).showModal();
      } else el.showPopover();
    } catch {}
  }
  // The copy restarts the page's CSS animations from scratch.
  for (const animation of doc.getAnimations()) {
    try {
      animation.finish();
    } catch {
      animation.cancel(); // Infinite: no end state, so it rests at its base style.
    }
  }

  const { width } = layout;
  iframe.style.width = `${width}px`;
  iframe.style.height = `${layout.height}px`;

  return Promise.all([settle(doc), ...loading]).then(() => {
    const height = fitHeight(doc, iframe, layout.windowHeight);
    for (const el of doc.querySelectorAll(`[${SCROLL_ATTR}]`)) {
      const [left, top] = el.getAttribute(SCROLL_ATTR)!.split(" ").map(Number);
      el.scrollTo(left, top);
    }
    return { document: doc, width, height, windowHeight: layout.windowHeight, scrollY: layout.scrollY };
  });
}

/**
 * Makes `iframe` as tall as what `doc` in it shows, and no shorter than
 * `floor`, the window's height; returns its height, px. What is pinned where
 * the designer saw it counts too: fixed, it would not make the page taller.
 * The page's CSS settled what answers to the height when it was frozen, so
 * nothing in it changes with the iframe's height.
 */
export function fitHeight(doc: Document, iframe: HTMLIFrameElement, floor: number): number {
  // Measured at its shortest: a page shorter than its window is laid out as tall as the window.
  iframe.style.height = `${floor}px`;
  let height = Math.max(floor, doc.documentElement.scrollHeight);
  for (const el of doc.querySelectorAll(`[${PINNED_ATTR}]`)) height = Math.max(height, Math.ceil(el.getBoundingClientRect().bottom));
  iframe.style.height = `${height}px`;
  return height;
}

/** Waits, briefly, for what the copy loads again: fonts and cross-origin stylesheets. */
function settle(doc: Document): Promise<unknown> {
  const sheets = [...doc.querySelectorAll<HTMLLinkElement>("link[rel~=stylesheet]")]
    .filter((link) => !link.sheet)
    .map(
      (link) =>
        new Promise((done) => {
          link.addEventListener("load", done, { once: true });
          link.addEventListener("error", done, { once: true });
        }),
    );
  void doc.documentElement.scrollHeight; // Lay out, so the fonts it needs start loading.
  const timeout = new Promise((done) => setTimeout(done, SETTLE_TIMEOUT_MS));
  return Promise.race([Promise.all([...sheets, doc.fonts.ready]), timeout]);
}

function setImportant(el: Element, name: string, value: string) {
  (el as HTMLElement).style.setProperty(name, value, "important");
}

export function drawInto(still: HTMLCanvasElement, source: CanvasImageSource) {
  try {
    still.getContext("2d")?.drawImage(source, 0, 0);
  } catch {} // A canvas already holding a WebGL context, or a source with no frame yet.
}

/** A video becomes a canvas holding the frame on screen when the page was frozen. */
function stillOf(video: HTMLVideoElement, to: HTMLElement): HTMLElement {
  const still = replaceElement(to, "canvas");
  still.width = video.videoWidth;
  still.height = video.videoHeight;
  drawInto(still, video);
  const style = getComputedStyle(video);
  // The video's own UA and tag styles do not reach a canvas.
  for (const name of ["display", "width", "height", "object-fit", "object-position"]) {
    setImportant(still, name, style.getPropertyValue(name));
  }
  still.setAttribute(FROZEN, "video");
  return still;
}

/** A cross-origin iframe cannot be read; it becomes a gray box with its name. */
function placeholderFor(source: HTMLIFrameElement, to: HTMLElement): HTMLElement {
  const box = replaceElement(to, "div");
  box.textContent = source.title || source.name || hostOf(source.src);
  const style = getComputedStyle(source);
  const look: Record<string, string> = {
    display: style.display === "inline" ? "inline-flex" : "flex",
    "align-items": "center",
    "justify-content": "center",
    "box-sizing": "border-box",
    width: `${source.offsetWidth}px`,
    height: `${source.offsetHeight}px`,
    "vertical-align": style.verticalAlign,
    overflow: "hidden",
    padding: "8px",
    border: "0",
    background: "#e5e5e5",
    color: "#757575",
    font: `500 12px/16px ${FONT_STACK}`,
    "text-align": "center",
  };
  for (const name in look) setImportant(box, name, look[name]);
  box.setAttribute(FROZEN, "iframe");
  return box;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || "Embedded page";
  } catch {
    return "Embedded page";
  }
}

/** Swaps `el` for a new element with the same attributes, so selectors and source markers still apply. */
function replaceElement<K extends keyof HTMLElementTagNameMap>(el: HTMLElement, tag: K): HTMLElementTagNameMap[K] {
  const next = el.ownerDocument.createElement(tag);
  for (const { name, value } of el.attributes) next.setAttribute(name, value);
  el.replaceWith(next);
  return next;
}

/** Below the end by this much (ms), a seek does not count as finishing, so no page code runs. */
const JUST_BEFORE_END = 0.001;

/**
 * End values of script-driven animations (as motion libraries use), per
 * element. The copy does not inherit these animations, so their end state is
 * written onto it. CSS animations are replayed and finished in the copy itself.
 * Animations are seeked to just before their end and back, so the page carries on.
 */
function readAnimationEnds(live: Document): Map<Element, Map<string, string>> {
  const properties = new Map<Element, Set<string>>();
  const seeked: [Animation, CSSNumberish | null][] = [];
  for (const animation of live.getAnimations()) {
    if (animation instanceof CSSAnimation || animation instanceof CSSTransition) continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target || effect.pseudoElement) continue;
    const end = effect.getComputedTiming().endTime as number;
    if (!Number.isFinite(end)) continue; // Infinite: no end state, so it rests at its base style.
    if (animation.playState === "running") {
      seeked.push([animation, animation.currentTime]);
      animation.currentTime = animation.playbackRate < 0 ? JUST_BEFORE_END : end - JUST_BEFORE_END;
    }
    if (effect.getComputedTiming().progress === null) continue; // Does not apply to the element.
    const names = properties.get(effect.target) ?? new Set();
    for (const keyframe of effect.getKeyframes()) {
      for (const key of Object.keys(keyframe)) {
        if (["offset", "computedOffset", "easing", "composite"].includes(key)) continue;
        names.add(key === "cssFloat" ? "float" : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
      }
    }
    properties.set(effect.target, names);
  }
  const ends = new Map<Element, Map<string, string>>();
  for (const [el, names] of properties) {
    const style = getComputedStyle(el);
    ends.set(el, new Map([...names].map((name) => [name, style.getPropertyValue(name)])));
  }
  for (const [animation, time] of seeked) animation.currentTime = time;
  return ends;
}

/** Rules inserted through the CSSOM (CSS-in-JS) never show up in the element's text. */
function copyStyleRules(from: HTMLStyleElement, to: Element) {
  const rules = readRules(from.sheet);
  if (rules && from.textContent!.trim() === "") to.textContent = serialize(rules, from.sheet!.href);
}

/** Same-origin stylesheets go in as text, so the copy is styled the moment it is inserted. */
function inlineStylesheet(from: HTMLLinkElement, to: Element, frozen: FrozenWindow) {
  if (!from.sheet || !/\bstylesheet\b/i.test(from.rel)) return;
  const rules = readRules(from.sheet);
  if (!rules) return; // Cross-origin: the copy loads it again.
  const style = to.ownerDocument.createElement("style");
  if (from.media) style.media = mediaForViews(from.media, frozen);
  style.textContent = serialize(rules, from.sheet.href);
  // Still known by the file it was loaded from, for the Agent.
  if (from.sheet.href) style.setAttribute(SHEET_HREF_ATTR, from.sheet.href);
  to.replaceWith(style);
}

function readRules(sheet: CSSStyleSheet | null): CSSRuleList | null {
  try {
    return sheet?.cssRules ?? null;
  } catch {
    return null;
  }
}

/** Serializes rules, inlining imports and resolving `url()`s against the sheet they came from. */
function serialize(rules: CSSRuleList, base: string | null): string {
  let text = "";
  for (const rule of rules) {
    if (rule instanceof CSSImportRule) {
      const imported = readRules(rule.styleSheet);
      if (imported) {
        const body = serialize(imported, rule.styleSheet!.href);
        const media = rule.media.mediaText;
        const layer = rule.layerName;
        let wrapped = media ? `@media ${media} {${body}}` : body;
        if (layer !== null) wrapped = layer ? `@layer ${layer} {${wrapped}}` : `@layer {${wrapped}}`;
        text += wrapped;
        continue;
      }
    }
    text += base ? absolutizeUrls(rule.cssText, base) : rule.cssText;
  }
  return text;
}

function absolutizeUrls(css: string, base: string): string {
  return css.replace(/url\("((?:[^"\\]|\\.)*)"\)/g, (match, url: string) => {
    try {
      return `url("${new URL(url.replace(/\\(.)/g, "$1"), base).href.replace(/["\\]/g, "\\$&")}")`;
    } catch {
      return match;
    }
  });
}

/*
 * The canvas is as tall as the whole page, and shown at several widths: what
 * answers to the window's size is rewritten so that it answers to each view's
 * width, and to the height of the window the designer had (`viewport.ts`).
 */
const VIEWPORT_DEPENDENT = /\d[sld]?v(?:h|w|min|max|i|b)\b|@media[^{]*(?:width|height|aspect-ratio|orientation)/i;

function resolveViewport(rules: CSSRuleList, frozen: FrozenWindow) {
  for (const rule of rules) {
    // Rules live in the iframe's realm, so they are checked by shape, not `instanceof`.
    if ("conditionText" in rule && "media" in rule && VIEWPORT_MEDIA.test(rule.conditionText as string)) {
      (rule.media as MediaList).mediaText = mediaForViews(rule.conditionText as string, frozen);
    }
    if ("style" in rule) resolveViewportUnits(rule.style as CSSStyleDeclaration, frozen);
    if ("cssRules" in rule) resolveViewport(rule.cssRules as CSSRuleList, frozen);
  }
}

function resolveViewportUnits(style: CSSStyleDeclaration, frozen: FrozenWindow) {
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    const value = style.getPropertyValue(name);
    if (HAS_VIEWPORT_UNIT.test(value)) style.setProperty(name, unitsForViews(value, frozen), style.getPropertyPriority(name));
  }
}

/** What the freezer pins on an element placed against the viewport: down it, and, when the page was scrolled sideways, across it too. */
const PINNED_DOWN = ["top", "bottom", "height", "margin-top", "margin-bottom"];
const PINNED_ACROSS = ["left", "right", "width", "margin-left", "margin-right"];

/**
 * The canvas has no viewport of its own: each view is as tall as the whole
 * page. Elements placed against the viewport (fixed, or absolute with no
 * positioned ancestor) are pinned where the designer saw them down the page,
 * margins included (auto margins center dialogs). Across, the view is as wide
 * as the window it stands for, so they are left to be placed in each view, as
 * the page places them. What is pinned is marked, so it is not taken for the
 * page's own style, and so is how far a fixed element moved with the page's scroll.
 */
function pinToViewport(from: HTMLElement, to: HTMLElement, viewport: Viewport) {
  const style = getComputedStyle(from);
  const fixed = style.position === "fixed" && fixedToViewport(from);
  if (!fixed && !(style.position === "absolute" && absoluteToViewport(from))) return;
  const across = fixed && viewport.scrollX !== 0;
  const pin = (side: "top" | "left", far: "bottom" | "right", names: string[], scrolled: number) => {
    setImportant(to, side, `${parseFloat(style.getPropertyValue(side)) + (fixed ? scrolled : 0)}px`);
    setImportant(to, far, "auto");
    for (const name of names.slice(2)) setImportant(to, name, style.getPropertyValue(name));
  };
  pin("top", "bottom", PINNED_DOWN, viewport.scrollY);
  if (across) pin("left", "right", PINNED_ACROSS, viewport.scrollX);
  to.setAttribute(PINNED_ATTR, (across ? [...PINNED_DOWN, ...PINNED_ACROSS] : PINNED_DOWN).join(" "));
  if (fixed && (viewport.scrollX || viewport.scrollY)) to.setAttribute(PIN_OFFSET_ATTR, `${viewport.scrollX} ${viewport.scrollY}`);
}

/** False when a transformed (or similar) ancestor holds the fixed element instead of the viewport. */
function fixedToViewport(el: HTMLElement): boolean {
  for (let a = el.parentElement; a; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (
      s.transform !== "none" ||
      s.translate !== "none" ||
      s.rotate !== "none" ||
      s.scale !== "none" ||
      s.perspective !== "none" ||
      s.filter !== "none" ||
      s.backdropFilter !== "none" ||
      s.containerType !== "normal" ||
      /paint|layout|strict|content/.test(s.contain) ||
      /transform|perspective|filter/.test(s.willChange)
    ) {
      return false;
    }
  }
  return true;
}

function absoluteToViewport(el: HTMLElement): boolean {
  const body = el.ownerDocument.body;
  return (
    el.offsetParent === body &&
    getComputedStyle(body).position === "static" &&
    getComputedStyle(el.ownerDocument.documentElement).position === "static"
  );
}
