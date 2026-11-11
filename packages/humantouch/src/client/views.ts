/**
 * Views: the one canvas shown at several widths (ADR 0008). The canvas is the
 * desktop view's document: every edit is made there, and the layers are read
 * from it. Each other view is a copy of it that follows every change to it,
 * node for node, so every view shows the same canvas, laid out at its own
 * width. A layer is the canvas's; each view finds it in what it shows. Each
 * view is as tall as what it shows there, as it grows and shrinks. As a value
 * changes, the views beside the one worked in lag behind it (`lagBeside`): the
 * frame after draws it in the view worked in alone. A value set once, they show
 * after that frame; the steps of a run of them, once the steps pause, the
 * latest at once. So too the layers making room for a layer dragged
 * (`makeRoom`): in the view dragged in at once, in the others once the
 * pointer pauses (ADR 0011).
 */
import { changesEditStyles, isEditStyles, syncEditStyles } from "./canvas-style";
import { copyCanvas, drawInto, fitHeight, type Canvas } from "./freezer";
import { rangeOf, runAt, type Layer, type LayerTree } from "./layers";
import { createLater } from "./later";

/**
 * How long the steps of a value pause, ms, before the views beside the one
 * worked in catch up with them: longer than macOS repeats a key held down by
 * default (83ms), and half as long as `CAUGHT_UP_MS`, so the selection box
 * comes back over views caught up (ADR 0011).
 */
export const CATCH_UP_AFTER_MS = 100;

/**
 * How long after the last step of a value, or of a handle dragged, the views
 * beside have surely caught up with it: twice as long as they wait to
 * (`CATCH_UP_AFTER_MS`), made from it so it stays the longer (ADR 0011). A
 * handle dragged, the selection box is drawn again in them then.
 */
export const CAUGHT_UP_MS = 2 * CATCH_UP_AFTER_MS;

/**
 * How long after the last step of a value the selection box comes back: long
 * enough to see the change without it, 0.2s and 0.5s having felt quick in use
 * (designer, 2026-11-01), and never before the views beside have caught up.
 */
export const ADJUSTING_MS = Math.max(800, CAUGHT_UP_MS);

/** How far a layer making room for a drag is shifted, px. */
export interface Shift {
  x: number;
  y: number;
}

export interface View {
  /** What the view shows: the canvas itself for the desktop view, a copy of it for any other. */
  readonly document: Document;
  /** How wide it shows the canvas, px: the desktop view as wide as the page was frozen at. */
  readonly width: number;
  /**
   * How tall the view is, px: as tall as what it shows, and no shorter than
   * the window the page was frozen in. It follows what the view shows before
   * the next paint; what answers to the height in the page's CSS does not
   * follow it, but stays as it was in that window.
   */
  readonly height: number;
  /** The deepest layer at a point of this view, in its px, as `LayerTree.layerAt` finds it on the canvas; not `skip`, nor any layer in it. */
  layerAt(tree: LayerTree, x: number, y: number, skip?: Layer): Layer | null;
  /** Where the layer is laid out in this view, in its px; null when the view shows none of it. */
  boxOf(layer: Layer): DOMRect | null;
  /** The element that shows a layer's element in this view, to read how it is laid out there; null when the view has none. */
  elementOf(el: Element): Element | null;
  /**
   * Types in `el`, an element of the canvas, in this view: returns the
   * view's element to type in. What is typed there is written to the canvas
   * as it is typed, so every other view shows it before the next paint; the
   * view typed in is left as it is meanwhile, its caret and any composition
   * with it. `done` hands the element back: the view follows the canvas again.
   */
  typeIn(el: Element): Typing;
}

/** Typing in a view, under way. */
export interface Typing {
  /** The element typed in, in the view. */
  readonly el: HTMLElement;
  /** Ends typing there. */
  done(): void;
}

export interface Views {
  /** The canvas, which the desktop view shows. */
  readonly canvas: Canvas;
  /** Every view, the desktop view first. */
  list(): View[];
  /** Shows the canvas in `iframe` too, `width` px wide, as one more view. Settles once it is laid out. */
  add(iframe: HTMLIFrameElement, width: number): Promise<View>;
  /** Stops showing the canvas in `view`, which no longer follows it. The desktop view, the canvas itself, stays. */
  remove(view: View): void;
  /**
   * Shows every change made to the canvas so far in `view` now, rather than
   * before the next paint, and the layers making room as the view dragged
   * in has them. With no view, in every view, but for a value the views
   * beside the one worked in lag behind (`lagBeside`), and the shifts.
   */
  sync(view?: View): void;
  /**
   * Shows every change made to the canvas so far in every view now, what a
   * value the views beside lag behind did too: they wait no more for it. For
   * a change that is not the value's, as an undo or a redo is (ADR 0011). The
   * layers making room stay as each view shows them.
   */
  catchUp(): void;
  /**
   * Runs `change`, which changes a value in the view `worked` tells (null:
   * the desktop view): the other views put off all it does to the canvas
   * (a layer's first value gives its instances edit styles too), and what
   * changes only the edit styles till then, then show it, as it is then, all
   * at once. A value set
   * once, they show once the next frame is drawn; one `step` of a run of them,
   * once the steps pause for `CATCH_UP_AFTER_MS`. The latest change says which:
   * a value set once right after steps shows after the next frame, with no
   * pause to wait for. A view shows it at once on any other change to the
   * canvas, or on `sync` of it. The desktop view is the canvas itself: it
   * always shows every change at once.
   */
  lagBeside(worked: () => View | null, step: boolean, change: () => void): void;
  /**
   * Shifts elements of the canvas straight to their place, as layers make
   * room for one dragged in the view `worked`: each in `shifts` by so
   * much, in that view's px; any shifted before and not in `shifts` goes back.
   * The view dragged in shows it at once; the others, once the shifts pause
   * for `CATCH_UP_AFTER_MS`, as each shift sets the pause going again, or on
   * `sync` of them: then `caughtUp` is called (ADR 0011). It is no change to
   * the canvas for the views to follow: each view shows the shifts as its
   * own, till `stopMakingRoom`. A view not of this canvas (a layer off it) shows
   * them alone.
   */
  makeRoom(worked: View, shifts: ReadonlyMap<Element, Shift>, caughtUp?: () => void): void;
  /** Puts every element that `makeRoom` shifted back where it was, in every view, at once, its style as it was. */
  stopMakingRoom(): void;
  /** Calls `listener` whenever a view's height changes. Returns what stops it. */
  onResize(listener: () => void): () => void;
  /**
   * Keeps every view as tall as it is, whatever is shifted on the canvas
   * meanwhile, as a drag shifts layers: returns what lets go, and each view
   * is as tall as what it shows again before the next paint.
   */
  pinHeights(): () => void;
}

/** The canvas, shown so far in the desktop view only. */
export function createViews(canvas: Canvas): Views {
  const followers = new Map<View, Follower>();
  const listeners = new Set<() => void>();
  const fittings = new Map<View, Fitting>();
  const desktop = viewOf(canvas.document, canvas.width, ITSELF, () => fittings.get(desktop)?.height ?? canvas.height);
  const views: View[] = [desktop];

  /** Each view made as tall as what it shows, once a frame, when anything may have changed it. */
  let frame = 0;
  /** What pins every view as tall as it is: while any does, none is fitted. */
  const pins = new Set<object>();
  const fit = () => {
    frame = 0;
    if (pins.size) return;
    let changed = false;
    for (const fitting of fittings.values()) {
      const height = fitHeight(fitting.doc, fitting.iframe, canvas.windowHeight);
      if (height !== fitting.height) changed = true;
      fitting.height = height;
    }
    if (changed) for (const listener of listeners) listener();
  };
  const refit = () => {
    frame ||= requestAnimationFrame(fit);
  };
  /** Keeps `view`, `height` px tall now, as tall as what it shows from now on. */
  const keepFitted = (view: View, height: number) => {
    const doc = view.document;
    const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    if (!iframe) return;
    // What the view shows can change size by itself too, as images load: watched in its own window.
    const Observer = doc.defaultView!.ResizeObserver;
    const observer = new Observer(refit);
    observer.observe(doc.documentElement);
    if (doc.body) observer.observe(doc.body);
    fittings.set(view, { doc, iframe, height, observer });
  };
  keepFitted(desktop, canvas.height);
  // Anything changed on the canvas may change how tall a view is: each is fitted again before the next frame.
  new MutationObserver(refit).observe(canvas.document.documentElement, EVERYTHING);
  /**
   * The layers making room for a drag: the view dragged in, where it has
   * them, what each view shows of them so far, the style attribute each
   * view's element had before, and the pause the views beside wait for.
   */
  let room: {
    worked: View;
    wanted: ReadonlyMap<Element, Shift>;
    shown: Map<View, Map<Element, Shift>>;
    styles: Map<Element, string | null>;
    pause?: ReturnType<typeof setTimeout>;
  } | null = null;
  /** Shows the layers making room in `view` as `wanted` has them: whether anything changed there. */
  const showRoomIn = (view: View, wanted: ReadonlyMap<Element, Shift>): boolean => {
    const { shown, styles } = room!;
    let showing = shown.get(view);
    if (!showing) shown.set(view, (showing = new Map()));
    const changed = [...showing.keys()].filter((el) => !wanted.has(el));
    for (const [el, to] of wanted) if (showing.get(el)?.x !== to.x || showing.get(el)?.y !== to.y) changed.push(el);
    if (!changed.length) return false;
    const write = () => {
      for (const el of changed) {
        const to = wanted.get(el);
        const at = view.elementOf(el) as HTMLElement | null;
        if (!at) continue;
        if (!styles.has(at)) styles.set(at, at.getAttribute("style"));
        if (to) {
          at.style.setProperty("translate", `${to.x}px ${to.y}px`, "important");
          at.style.setProperty("transition", "none", "important");
          showing.set(el, to);
        } else {
          // Set first, then taken off: as `style` was changed, its attribute may not be there yet to take off.
          const style = styles.get(at)!;
          at.setAttribute("style", style ?? "");
          if (style === null) at.removeAttribute("style");
          styles.delete(at);
          showing.delete(el);
        }
      }
    };
    if (view.document !== canvas.document) write();
    else {
      // On the canvas, the desktop view's own: the views beside take in what came before, and nothing of this.
      for (const follower of followers.values()) follower.sync();
      write();
      for (const follower of followers.values()) follower.pass();
    }
    return true;
  };
  const sync = (view?: View) => {
    if (view) {
      followers.get(view)?.catchUp();
      if (room && view !== room.worked) showRoomIn(view, room.wanted);
    } else for (const follower of followers.values()) follower.sync();
  };
  /**
   * While the views beside lag behind a value changed, till they catch up:
   * which view is worked in, whether they wait for the steps to pause or for
   * the next frame, and what stops that wait. None: no view is behind.
   */
  let lagging: { worked: () => View | null; step: boolean; cancel: () => void } | null = null;
  /** Set while a value is changed (`lagBeside`): whatever the canvas takes from it is the value's, and lags with it. */
  let changing = false;
  const catchUp = () => {
    lagging?.cancel();
    lagging = null;
    for (const follower of followers.values()) follower.catchUp();
  };

  /** Has the other views lag behind a value changed in the view `worked` tells: till the next frame is drawn or, for a `step`, till the steps pause. */
  const startLagging = (worked: () => View | null, step: boolean) => {
    // Set once again before the views beside catch up: they still do after the frame they wait for.
    if (lagging && !lagging.step && !step) {
      lagging.worked = worked;
      return;
    }
    lagging?.cancel();
    if (step) {
      // Each step puts the catching up off again: it comes once the steps pause.
      const timer = setTimeout(catchUp, CATCH_UP_AFTER_MS);
      lagging = { worked, step, cancel: () => clearTimeout(timer) };
    } else {
      // Once the next frame, with the value in the view worked in, is drawn.
      const later = createLater();
      later.add(catchUp);
      lagging = { worked, step, cancel: later.cancel };
    }
  };

  const stopMakingRoom = () => {
    if (!room) return;
    clearTimeout(room.pause);
    for (const view of room.shown.keys()) showRoomIn(view, new Map());
    room = null;
  };

  return {
    canvas,
    list: () => [...views],
    add(iframe, width) {
      const doc = iframe.contentDocument;
      if (!doc) return Promise.reject(new Error("Human Touch: the view's iframe is not in the document"));
      const laidOut = copyCanvas(canvas, iframe, width);
      // What is typed in this view is in every other view at once, as it is on the canvas.
      const follower = follow(
        canvas.document,
        doc,
        () => sync(),
        () => !!lagging && lagging.worked() !== view,
        () => changing,
      );
      const view = viewOf(doc, width, follower, () => fittings.get(view)?.height ?? iframe.offsetHeight);
      followers.set(view, follower);
      views.push(view);
      return laidOut.then((copy) => {
        if (views.includes(view)) keepFitted(view, copy.height);
        refit();
        return view;
      });
    },
    remove(view) {
      if (view === views[0]) throw new Error("Human Touch: the desktop view shows the canvas itself, and stays");
      followers.get(view)?.stop();
      followers.delete(view);
      fittings.get(view)?.observer.disconnect();
      fittings.delete(view);
      const i = views.indexOf(view);
      if (i >= 0) views.splice(i, 1);
    },
    sync,
    catchUp,
    lagBeside(worked, step, change) {
      // What came before is taken in as ever: only what `change` does is the value's.
      for (const follower of followers.values()) follower.sync();
      startLagging(worked, step);
      const was = changing;
      changing = true;
      try {
        change();
        // What the change did that no view has taken yet: the views beside take it with the value.
        for (const follower of followers.values()) follower.sync();
      } finally {
        changing = was;
      }
    },
    makeRoom(worked, shifts, caughtUp) {
      if (room && room.worked !== worked) stopMakingRoom();
      room ??= { worked, wanted: shifts, shown: new Map(), styles: new Map() };
      const wanted = (room.wanted = new Map(shifts));
      showRoomIn(worked, wanted);
      clearTimeout(room.pause);
      if (!views.includes(worked)) return;
      room.pause = setTimeout(() => {
        let changed = false;
        for (const view of views) if (view !== worked && showRoomIn(view, wanted)) changed = true;
        if (changed) caughtUp?.();
      }, CATCH_UP_AFTER_MS);
    },
    stopMakingRoom,
    onResize(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    pinHeights() {
      const pin = {};
      pins.add(pin);
      return () => {
        if (pins.delete(pin)) refit();
      };
    },
  };
}

/** How tall a view is, and what keeps it as tall as what it shows. */
interface Fitting {
  doc: Document;
  iframe: HTMLIFrameElement;
  height: number;
  observer: ResizeObserver;
}

/** Which node of a view is which node of the canvas, both ways, and how text is typed in it. */
interface Correspondence {
  /** The view's node that is `node` of the canvas. */
  inView(node: Node): Node | null;
  /** The canvas node that is `node` of the view. */
  onCanvas(node: Node): Node | null;
  typeIn(el: Element): Typing;
}

/** The desktop view shows the canvas itself, and is typed in on the canvas. */
const ITSELF: Correspondence = { inView: (node) => node, onCanvas: (node) => node, typeIn: (el) => ({ el: el as HTMLElement, done() {} }) };

/** A view of the canvas, as `document` shows it. */
function viewOf(document: Document, width: number, { inView, onCanvas, typeIn }: Correspondence, height: () => number): View {
  const rangeIn = (run: Text[]) => {
    const nodes = run.map(inView);
    return nodes.every((node) => node !== null) ? rangeOf(nodes as Text[]) : null;
  };
  return {
    document,
    width,
    get height() {
      return height();
    },
    layerAt(tree, x, y, skip) {
      let layer: Layer | null = null;
      const skipped = skip && !skip.text ? inView(skip.el) : null;
      const hit = skipped ? (document.elementsFromPoint(x, y).find((e) => !skipped.contains(e)) ?? null) : document.elementFromPoint(x, y);
      for (let e = hit; e && !layer; e = e.parentElement) {
        const node = onCanvas(e);
        layer = node && tree.layerOf(node as Element);
      }
      return layer && runAt(layer, x, y, rangeIn);
    },
    boxOf(layer) {
      if (layer.text) return rangeIn(layer.text)?.getBoundingClientRect() ?? null;
      const el = inView(layer.el) as Element | null;
      // Not drawn at this width (`display: none` at a breakpoint): nothing to show.
      return el && (el === layer.el || el.getClientRects().length) ? el.getBoundingClientRect() : null;
    },
    elementOf: (el) => inView(el) as Element | null,
    typeIn,
  };
}

/** A copy of the canvas kept the same as it, node for node. */
interface Follower extends Correspondence {
  /** Takes in the changes to the canvas not taken in yet, but those it puts off while it lags. */
  sync(): void;
  /** Takes in every change to the canvas not taken in yet, those put off too. */
  catchUp(): void;
  /** Takes in none of the changes to the canvas not taken in yet: they are the canvas's alone. */
  pass(): void;
  /** Stops following the canvas. */
  stop(): void;
}

/**
 * Keeps `copy`, made from `canvas` node for node, the same as it: each change
 * to the canvas is taken in before the next paint, or at once on `sync`. What
 * changed is copied as it is now, so changes are taken in in any order. While
 * text is typed in the copy, it goes the other way for the element typed in:
 * what is typed there is written to the canvas, and that element of the copy
 * takes in nothing from it; `typed` is called once what is typed is on it.
 * While it `lags`, changes to the edit styles alone, and whatever a value
 * does while it is `valueChanging`, are put off till it catches up, or till any other change comes.
 */
function follow(canvas: Document, copy: Document, typed: () => void, lags: () => boolean, valueChanging: () => boolean): Follower {
  /** Each canvas node's node in the copy, and back. */
  const inCopy = new WeakMap<Node, Node>();
  const onCanvas = new WeakMap<Node, Node>();
  /** Pairs `from` and `to`, made the same, and every node in them, those in their open shadow roots too, one way and back. */
  const pair = (from: Node, to: Node, way: Way) => {
    way.to.set(from, to);
    way.back.set(to, from);
    for (let a = from.firstChild, b = to.firstChild; a && b; a = a.nextSibling, b = b.nextSibling) pair(a, b, way);
    const shadow = (from as Element).shadowRoot;
    const copied = (to as Element).shadowRoot;
    if (!shadow || !copied) return;
    // What changes in a shadow root of the canvas is taken in as what changes outside them (ticket 135).
    if (way === down) observer.observe(shadow, EVERYTHING);
    pair(shadow, copied, way);
  };
  /** From the canvas to the copy, and, for the element typed in, back. */
  const down: Way = { to: inCopy, back: onCanvas, doc: copy };
  const up: Way = { to: onCanvas, back: inCopy, doc: canvas };
  /** The element typed in: the canvas's, and the copy's. */
  let typing: { canvas: Element; copy: Element; observer: MutationObserver } | null = null;

  /** A new node of `way`'s source, made in its other document: the nodes in it it has already go in it. */
  const copyOf = (node: Node, way: Way): Node => {
    const template = isTemplate(node);
    // Its open shadow root, if it hosts one, comes whole with it (`shadow-roots.ts`).
    const made = way.doc.importNode(node, template);
    way.to.set(node, made);
    way.back.set(made, node);
    const shadow = (node as Element).shadowRoot;
    const copied = (made as Element).shadowRoot;
    if (shadow && copied) {
      if (way === down) observer.observe(shadow, EVERYTHING);
      pair(shadow, copied, way);
    }
    if (node.nodeName.toLowerCase() === "canvas") drawInto(made as HTMLCanvasElement, node as HTMLCanvasElement);
    if (!template) update(node, made, false, way);
    return made;
  };
  /**
   * Makes `to` the same as `from`: its attributes or text, and its children,
   * in order. Children it has already are kept as they are, unless they come
   * from elsewhere or `deep`: they may have changed while out of the canvas.
   * The element typed in is left alone in the copy, and its own attributes
   * (it is editable there) stay there.
   */
  const update = (from: Node, to: Node, deep: boolean, way: Way) => {
    if (way === down && from === typing?.canvas) return;
    if (from.nodeType === Node.ELEMENT_NODE) {
      if (from !== typing?.copy) copyAttributes(from as Element, to as Element);
    } else if (hasData(from)) (to as CharacterData).data = (from as CharacterData).data;
    if (isTemplate(from)) return; // What it holds is its content, which the copy took whole.
    if (way === down && isEditStyles(to)) {
      // Its text may be behind its rules on the canvas, which change in place (`canvas-style.ts`).
      syncEditStyles(to);
      return;
    }
    const wanted = [...from.childNodes].map((child) => {
      const known = way.to.get(child);
      if (!known) return copyOf(child, way);
      if (deep || known.parentNode !== to) update(child, known, true, way);
      return known;
    });
    const children = to.childNodes;
    wanted.forEach((child, i) => {
      if (children[i] !== child) to.insertBefore(child, children[i] ?? null);
    });
    while (children.length > wanted.length) to.removeChild(to.lastChild!);
    // What is in its shadow root may have changed with it.
    const shadow = deep ? (from as Element).shadowRoot : null;
    const copied = shadow && way.to.get(shadow);
    if (copied) update(shadow, copied, true, way);
  };
  const takeIn = (records: MutationRecord[], way: Way) => {
    const lists = new Set<Node>();
    for (const record of records) {
      const { target } = record;
      // The copy's element typed in takes in nothing from the canvas; its editable state stays in the copy.
      if (way === down ? typing?.canvas.contains(target) : record.type === "attributes" && target === typing?.copy) continue;
      const to = way.to.get(target);
      // A node the other side has none of yet is made whole once it is in place.
      if (!to) continue;
      if (record.type === "childList") lists.add(target);
      else if (record.type === "characterData") (to as CharacterData).data = (target as CharacterData).data;
      else {
        copyAttribute(target as Element, to as Element, record.attributeNamespace, record.attributeName!);
        if (way === down && isEditStyles(to)) syncEditStyles(to);
      }
    }
    for (const node of lists) update(node, way.to.get(node)!, false, way);
  };
  /** Changes put off while the copy lags: to the edit styles alone, or made as a value changed. */
  let behind: MutationRecord[] = [];
  /** Takes in `records` from the canvas, and what was put off: as the canvas is now, so in any order. */
  const catchUpWith = (records: MutationRecord[]) => {
    const put = behind;
    behind = [];
    takeIn([...put, ...records], down);
  };
  /** Takes in `records` from the canvas; while the copy lags, puts them off if they change only the edit styles, or are made as a value changes. */
  const keepUpWith = (records: MutationRecord[]) => {
    if ((valueChanging() || records.every(changesEditStyles)) && lags()) behind.push(...records);
    else catchUpWith(records);
  };
  const observer = new MutationObserver(keepUpWith);
  observer.observe(canvas.documentElement, EVERYTHING);
  pair(canvas.documentElement, copy.documentElement, down);
  const catchUp = () => catchUpWith(observer.takeRecords());
  const doneTyping = () => {
    if (!typing) return;
    const { canvas: el, observer: typedIn } = typing;
    takeIn(typedIn.takeRecords(), up);
    typedIn.disconnect();
    // What the canvas wrote meanwhile, which the element typed in skips.
    catchUp();
    typing = null;
    update(el, inCopy.get(el)!, true, down);
  };
  return {
    inView: (node) => inCopy.get(node) ?? null,
    onCanvas: (node) => onCanvas.get(node) ?? null,
    typeIn(el) {
      doneTyping();
      catchUp();
      const at = inCopy.get(el) as Element | undefined;
      if (!at) throw new Error("Human Touch: the view shows no such element");
      const observer = new MutationObserver((records) => {
        takeIn(records, up);
        typed();
      });
      observer.observe(at, EVERYTHING);
      const session = (typing = { canvas: el, copy: at, observer });
      return { el: at as HTMLElement, done: () => typing === session && doneTyping() };
    },
    sync: () => keepUpWith(observer.takeRecords()),
    catchUp,
    pass: () => void observer.takeRecords(),
    stop: () => {
      // What was typed last is kept on the canvas.
      if (typing) takeIn(typing.observer.takeRecords(), up);
      typing?.observer.disconnect();
      typing = null;
      observer.disconnect();
    },
  };
}

/** One way nodes are copied: from a node to its counterpart, made in `doc`. */
interface Way {
  to: WeakMap<Node, Node>;
  back: WeakMap<Node, Node>;
  doc: Document;
}

const EVERYTHING: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true };

/** Text and comments: what they hold is their data. */
function hasData(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.CDATA_SECTION_NODE;
}

function isTemplate(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === "template";
}

function copyAttributes(from: Element, to: Element) {
  for (const attr of [...to.attributes]) if (!from.hasAttributeNS(attr.namespaceURI, attr.localName)) to.removeAttributeNode(attr);
  for (const attr of from.attributes) copyAttribute(from, to, attr.namespaceURI, attr.localName);
}

function copyAttribute(from: Element, to: Element, namespace: string | null, name: string) {
  const attr = from.getAttributeNodeNS(namespace, name);
  if (!attr) to.removeAttributeNS(namespace, name);
  else if (to.getAttributeNS(namespace, name) !== attr.value) {
    if (namespace) to.setAttributeNS(namespace, attr.name, attr.value);
    else to.setAttribute(attr.name, attr.value);
  }
}
