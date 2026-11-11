/**
 * Open shadow roots on the canvas (ticket 135). The freezer copies each open
 * shadow root of the page, the styles in it with it, onto its host's copy.
 * Attached as `ON_CANVAS` says, a shadow root goes along with its host
 * wherever the canvas is copied (into each view, a layer duplicated) and is
 * written out with it when the canvas is saved, as a declarative shadow root
 * (`<template shadowrootmode="open">`), which the parser makes a shadow root
 * again when the canvas is put back. A closed shadow root cannot be read: its
 * host shows on the canvas as one with none would.
 */

/**
 * Hosts whose shadow roots are the dev server's or the framework's, not the
 * page's: Next.js's dev overlay and its route announcer, Vite's error
 * overlay. On the canvas they stay as they were before shadow roots were
 * copied, empty.
 */
export const NOT_THE_PAGES = new Set(["nextjs-portal", "next-route-announcer", "vite-error-overlay"]);

/** How a shadow root is attached on the canvas: open, as the page's was; copied with its host; written out with it. */
export const ON_CANVAS: ShadowRootInit = { mode: "open", clonable: true, serializable: true };

/**
 * `root` and every element in it, in tree order, then the elements in each
 * open shadow root among them, the same way, nested ones too. Two trees the
 * same node for node list theirs in the same order. With no shadow root, what
 * `[root, ...root.getElementsByTagName("*")]` lists.
 */
export function elementsWithin(root: Element): Element[] {
  const els: Element[] = [root, ...root.getElementsByTagName("*")];
  for (let i = 0; i < els.length; i++) {
    const shadow = els[i].shadowRoot;
    if (shadow) for (const el of shadow.querySelectorAll("*")) els.push(el);
  }
  return els;
}

/** Whether `root`, or an element in it, hosts an open shadow root. */
function hostsShadowRoots(root: Element): boolean {
  if (root.shadowRoot) return true;
  for (const el of root.getElementsByTagName("*")) if (el.shadowRoot) return true;
  return false;
}

/**
 * `el` as HTML: its `outerHTML`, with the open shadow roots in it that are
 * written out (`ON_CANVAS`) written in as declarative shadow roots. With none,
 * its `outerHTML` as it is.
 */
export function htmlOf(el: Element): string {
  if (!hostsShadowRoots(el)) return el.outerHTML;
  // Its own tags, around what is in it: a copy of it alone is written with nothing in it.
  const end = `</${el.localName}>`;
  const empty = (el.cloneNode(false) as Element).outerHTML;
  return empty.slice(0, -end.length) + el.getHTML({ serializableShadowRoots: true }) + end;
}

/**
 * Makes every declarative shadow root in `root` (nested ones too) a shadow
 * root of its host, as the parser does where it reads them: for a browser
 * whose `document.write` leaves them as templates.
 */
export function attachDeclared(root: ParentNode) {
  for (const template of root.querySelectorAll<HTMLTemplateElement>("template[shadowrootmode]")) {
    const host = template.parentElement;
    const mode = template.getAttribute("shadowrootmode");
    if (!host || host.shadowRoot || (mode !== "open" && mode !== "closed")) continue;
    let shadow: ShadowRoot;
    try {
      shadow = host.attachShadow({ mode, clonable: template.hasAttribute("shadowrootclonable"), serializable: template.hasAttribute("shadowrootserializable") });
    } catch {
      continue; // Not an element that can host one.
    }
    shadow.append(template.content);
    template.remove();
    attachDeclared(shadow);
  }
}
