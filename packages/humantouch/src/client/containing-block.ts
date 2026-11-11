/**
 * The box that places a layer (CSS 2.1, 10.1; CSS Position 3): the one its
 * `left`, `top`, `right` and `bottom` go from, whose size its percentages
 * are shares of, and whose direction says which of its `left` and `right`
 * the browser goes by when it is given both (ticket 89). Read from computed
 * styles, with nothing laid out; the freezer goes by it too, for what holds
 * a layer placed fixed.
 */
import { flatParent } from "./shadow-roots";

/**
 * Whether an element, by its computed `style`, is the box that places layers
 * placed absolute or fixed in it whatever its `position` (CSS Transforms,
 * Filter Effects, Containment, Will Change): transformed, as `transform`,
 * `translate`, `rotate`, `scale` and `perspective` do; filtered, through
 * `filter` or `backdrop-filter`, but not the page's root (`root`), which
 * the window holds what is fixed in all the same; contained in its layout or
 * paint, by `contain` or `content-visibility`; keeping its layers in 3D
 * (`transform-style: preserve-3d`); or soon to be one of these, as
 * `will-change` says. Not as a container for queries: the browser places
 * nothing in it so (`container-type`). As Chromium does (ticket 89, review
 * and re-review, each probed).
 */
function holdsPlacedLayers(style: CSSStyleDeclaration, root = false): boolean {
  return (
    style.transform !== "none" ||
    style.translate !== "none" ||
    style.rotate !== "none" ||
    style.scale !== "none" ||
    style.perspective !== "none" ||
    (!root && (style.filter !== "none" || style.backdropFilter !== "none")) ||
    /paint|layout|strict|content/.test(style.contain) ||
    /^(auto|hidden)$/.test(style.contentVisibility) ||
    style.transformStyle === "preserve-3d" ||
    /\b(transform|translate|rotate|scale|perspective|filter|contain)\b/.test(style.willChange)
  );
}

/**
 * The element whose box places `el`, by its computed `position`; null for
 * the window, which places a layer placed fixed, and one placed absolute in
 * no box placed otherwise than static (the page's initial containing block).
 * In its container's layout, relative or sticky: the block it is laid out in,
 * past boxes that lay out nothing of their own (`display: contents`, an
 * inline element). Absolute: the nearest box placed otherwise than static,
 * or that holds placed layers (`holdsPlacedLayers`); the page's root too,
 * placed so. Fixed: the nearest that holds placed layers.
 */
export function containingBlockOf(el: Element): Element | null {
  const { position } = getComputedStyle(el);
  const placed = position === "absolute" || position === "fixed";
  for (let at = flatParent(el); at; at = flatParent(at)) {
    const style = getComputedStyle(at);
    if (style.display === "contents") continue;
    if (!placed) {
      if (style.display !== "inline") return at;
    } else if (holdsPlacedLayers(style, at === el.ownerDocument.documentElement) || (position === "absolute" && style.position !== "static")) return at;
  }
  return null;
}

/**
 * Which way text runs in the box that places `el` (`containingBlockOf`):
 * `rtl`, right to left, or `ltr`. The window's, and the page's root's, are
 * the body's (CSS Writing Modes 3, 8: the root takes its direction from its
 * body, and the window from the root), however the root is marked.
 */
export function directionPlacing(el: Element): "ltr" | "rtl" {
  const block = containingBlockOf(el);
  const doc = el.ownerDocument;
  const root = !block || block === doc.documentElement;
  return getComputedStyle(root ? (doc.body ?? doc.documentElement) : block).direction === "rtl" ? "rtl" : "ltr";
}
