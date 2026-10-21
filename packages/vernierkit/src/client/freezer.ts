/**
 * The freezer: turns the live page into a canvas, a static copy of the whole
 * page inside a same-origin iframe, laid out at the page's original width.
 * The live page itself is left untouched.
 */
import { HOST_TAG } from "./host";
import { FONT_STACK } from "./styles";

export interface Canvas {
  /** The frozen copy. Lives in the iframe that was passed to `freeze`. */
  document: Document;
  /** Laid-out size of the whole page, in CSS px. */
  width: number;
  height: number;
  /** How far the page was scrolled down when it was frozen. */
  scrollY: number;
  /** Fixed layers that covered the whole screen, like a dialog's dimming. */
  backdrops: Backdrop[];
}

/**
 * A fixed layer that covered the whole screen when the page was frozen. On the
 * canvas it still covers only that screen (so what it centers stays put); the
 * canvas view paints its look over the rest of the page.
 */
export interface Backdrop {
  /** The screen it covered, in page px. */
  top: number;
  height: number;
  /** Its background color, backdrop filter and effective opacity. */
  color: string;
  filter: string;
  opacity: number;
}

/** The window the designer was looking at when the page was frozen. */
interface Viewport {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

/** Added to every canvas: style changes made while editing apply at once. */
const CANVAS_STYLES = `
*, *::before, *::after { transition: none !important; }
html { scrollbar-width: none !important; }
`;

/** Marks what the canvas shows in place of content it cannot copy. */
const FROZEN = "data-vk-frozen";

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
  const viewport: Viewport = { width: page.innerWidth, height: page.innerHeight, scrollX: page.scrollX, scrollY: page.scrollY };
  const animationEnds = readAnimationEnds(live);
  const copy = root.cloneNode(true) as HTMLElement;

  // The clone has the same tree as the page, so the two lists line up one to one.
  const liveEls = [root, ...root.getElementsByTagName("*")];
  const copyEls = [copy, ...copy.getElementsByTagName("*")];
  const scrolled: [Element, number, number][] = [];
  const topLayer: [HTMLElement, "modal" | "popover"][] = [];
  const backdrops: Backdrop[] = [];
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
        continue;
      case "link":
        inlineStylesheet(from as HTMLLinkElement, to, page);
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
    const ends = animationEnds.get(from);
    if (ends) for (const [name, value] of ends) setImportant(to, name, value);
    if (to.hasAttribute("style")) resolveViewportUnits(to.style, viewport);
    const backdrop = pinToViewport(from, to, viewport);
    if (backdrop) backdrops.push(backdrop);
    // The document's own scroll is shown by the canvas view instead.
    if ((from.scrollTop || from.scrollLeft) && from !== live.scrollingElement) {
      scrolled.push([to, from.scrollLeft, from.scrollTop]);
    }
    if (from.matches(":modal")) topLayer.push([to, "modal"]);
    else if (from.matches(":popover-open")) topLayer.push([to, "popover"]);
  }
  // Constructable stylesheets come after all the others in the cascade.
  for (const sheet of live.adoptedStyleSheets) {
    copy.append(Object.assign(live.createElement("style"), { textContent: serialize(sheet.cssRules, null) }));
  }
  // The page's height chain (`height: 100%` on html, body, …) ends at the viewport.
  setImportant(copy, "height", `${root.getBoundingClientRect().height}px`);

  const doc = iframe.contentDocument;
  if (!doc) return Promise.reject(new Error("Vernier Kit: the canvas iframe is not in the document"));
  // Writing a doctype puts the copy in the same rendering mode as the page.
  doc.open();
  doc.write(live.compatMode === "CSS1Compat" ? "<!DOCTYPE html>" : "");
  doc.close();
  doc.replaceChild(doc.adoptNode(copy), doc.documentElement);
  doc.head.append(Object.assign(doc.createElement("style"), { textContent: CANVAS_STYLES }));
  for (const [el, kind] of topLayer) {
    try {
      if (kind === "modal") {
        (el as HTMLDialogElement).removeAttribute("open");
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
  for (const sheet of doc.styleSheets) {
    const rules = readRules(sheet);
    if (rules && VIEWPORT_DEPENDENT.test(sheet.ownerNode?.textContent ?? "")) resolveViewport(rules, page, viewport);
  }

  const width = root.clientWidth;
  iframe.style.width = `${width}px`;
  iframe.style.height = `${viewport.height}px`;

  return settle(doc).then(() => {
    const height = Math.max(viewport.height, doc.documentElement.scrollHeight);
    iframe.style.height = `${height}px`;
    for (const [el, left, top] of scrolled) el.scrollTo(left, top);
    return { document: doc, width, height, scrollY: viewport.scrollY, backdrops };
  });
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

function drawInto(still: HTMLCanvasElement, source: CanvasImageSource) {
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
function inlineStylesheet(from: HTMLLinkElement, to: Element, page: Window) {
  if (!from.sheet || !/\bstylesheet\b/i.test(from.rel)) return;
  const rules = readRules(from.sheet);
  if (!rules) return; // Cross-origin: the copy loads it again.
  const style = to.ownerDocument.createElement("style");
  if (from.media) style.media = VIEWPORT_MEDIA.test(from.media) ? frozenMedia(from.media, page) : from.media;
  style.textContent = serialize(rules, from.sheet.href);
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
 * The canvas is as tall as the whole page and no wider than its layout (no
 * scrollbar), so viewport units and media queries would resolve against the
 * wrong size. They are resolved against the viewport the designer had instead.
 */
const VIEWPORT_MEDIA = /width|height|aspect-ratio|orientation/i;
const VIEWPORT_DEPENDENT = /\d[sld]?v(?:h|w|min|max|i|b)\b|@media[^{]*(?:width|height|aspect-ratio|orientation)/i;
const VIEWPORT_UNIT = /(?<![\w#.])(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[sld]?(vh|vw|vmin|vmax|vi|vb)\b/gi;
const HAS_VIEWPORT_UNIT = new RegExp(VIEWPORT_UNIT.source, "i");
/** `url()`s and strings are left alone. */
const LITERALS = /(url\([^)]*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;

function frozenMedia(query: string, page: Window): string {
  return page.matchMedia(query).matches ? "all" : "not all";
}

function resolveViewport(rules: CSSRuleList, page: Window, viewport: Viewport) {
  for (const rule of rules) {
    // Rules live in the iframe's realm, so they are checked by shape, not `instanceof`.
    if ("conditionText" in rule && "media" in rule && VIEWPORT_MEDIA.test(rule.conditionText as string)) {
      (rule.media as MediaList).mediaText = frozenMedia(rule.conditionText as string, page);
    }
    if ("style" in rule) resolveViewportUnits(rule.style as CSSStyleDeclaration, viewport);
    if ("cssRules" in rule) resolveViewport(rule.cssRules as CSSRuleList, page, viewport);
  }
}

function resolveViewportUnits(style: CSSStyleDeclaration, viewport: Viewport) {
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    const value = style.getPropertyValue(name);
    if (!HAS_VIEWPORT_UNIT.test(value)) continue;
    const resolved = value
      .split(LITERALS)
      .map((part, j) => (j % 2 ? part : part.replace(VIEWPORT_UNIT, (_, n: string, unit: string) => toPx(Number(n), unit, viewport))))
      .join("");
    style.setProperty(name, resolved, style.getPropertyPriority(name));
  }
}

function toPx(n: number, unit: string, { width, height }: Viewport): string {
  const base = { vh: height, vb: height, vw: width, vi: width, vmin: Math.min(width, height), vmax: Math.max(width, height) }[
    unit.toLowerCase() as "vh"
  ];
  return `${Math.round(((n * base) / 100) * 1000) / 1000}px`;
}

/**
 * The canvas has no viewport of its own. Elements placed against the viewport
 * (fixed, or absolute with no positioned ancestor) are pinned where the
 * designer saw them, margins included (auto margins center dialogs). Returns
 * the element as a backdrop when it covered the whole screen.
 */
function pinToViewport(from: HTMLElement, to: HTMLElement, viewport: Viewport): Backdrop | null {
  const style = getComputedStyle(from);
  const fixed = style.position === "fixed" && fixedToViewport(from);
  if (!fixed && !(style.position === "absolute" && absoluteToViewport(from))) return null;
  const top = parseFloat(style.top) + (fixed ? viewport.scrollY : 0);
  const left = parseFloat(style.left) + (fixed ? viewport.scrollX : 0);
  setImportant(to, "top", `${top}px`);
  setImportant(to, "left", `${left}px`);
  setImportant(to, "bottom", "auto");
  setImportant(to, "right", "auto");
  for (const name of ["width", "height", "margin-top", "margin-right", "margin-bottom", "margin-left"]) {
    setImportant(to, name, style.getPropertyValue(name));
  }
  return fixed ? backdropOf(from, style, viewport) : null;
}

function backdropOf(el: HTMLElement, style: CSSStyleDeclaration, viewport: Viewport): Backdrop | null {
  const r = el.getBoundingClientRect();
  const coversScreen = r.left <= 0 && r.top <= 0 && r.right >= viewport.width && r.bottom >= viewport.height;
  const paints = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(style.backgroundColor) || style.backdropFilter !== "none";
  if (!coversScreen || !paints) return null;
  let opacity = 1;
  for (let a: Element | null = el; a; a = a.parentElement) opacity *= Number(getComputedStyle(a).opacity);
  return {
    top: viewport.scrollY,
    height: viewport.height,
    color: style.backgroundColor,
    filter: style.backdropFilter,
    opacity,
  };
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
