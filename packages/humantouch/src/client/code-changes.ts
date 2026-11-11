/**
 * The project's code changing under the page, as the dev server brings it in
 * (Vite's HMR updates, which the Vite plugin keeps on the page as
 * `CodeUpdates`). A file the page does not use brings nothing in, so it is no
 * change; nor are the editor layer's own saves into `.humantouch/`. With no word
 * from the dev server (Next.js), there is never a change to tell.
 *
 * In edit mode, with the round not claimed (ticket 78), each run of changes is
 * told once the code has rested: whether the page draws anything otherwise
 * than it did before the run (`CodeRun.pageChanged`).
 */
import { LOC_ATTR, USAGE_ATTR } from "../markers";
import { CODE_EVENT, CODE_GLOBAL, type CodeUpdates } from "../service-protocol";
import { HOST_TAG } from "./host";
import { pointerHeld } from "./pointer-held";

/**
 * `POST`, to the local service: the page claims the round, having seen one of
 * its changes show with no Agent claiming it (ticket 78). Its body,
 * `{ since, otherUsages }`: when the run of code changes it saw it in began
 * (ms since the epoch), so `last` takes the round back to the code before it;
 * and what the other usages showed as that run began, as `OtherUsagesKept`,
 * if the page noted any, to keep with the claim (ticket 82). Here rather than
 * in `service-protocol.ts`, whose paths the page loads with the toggle: only
 * edit mode claims.
 */
export const CLAIM_PATH = "/claim";

/**
 * `POST`, to the local service: what a page noted of the other usages of a
 * claimed round's changes for one usage alone, to keep with the claim
 * (ticket 82); a change noted already keeps what was noted first. Its body,
 * `{ at, otherUsages }`: when the page noted them (an ISO time), and the
 * notes, as `OtherUsagesKept`; noted before the round was claimed, they are
 * an earlier round's, and not kept. Here with `CLAIM_PATH`, for the same
 * reason.
 */
export const OTHER_USAGES_PATH = "/other-usages";

/** How the code `win`'s page has stands, as the dev server says; undefined when it says nothing (Next.js). */
export function codeUpdates(win: Window): CodeUpdates | undefined {
  return (win as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL];
}

/** Updates closer together than this are one run: several files saved at once, or one edit's CSS and its module. The code rests once it has been quiet this long. */
export const CODE_QUIET_MS = 1000;
/** While the designer is busy, or code is being brought in, how often to look again. */
const BUSY_EVERY_MS = 250;
/** An update begun this long ago with no word of its end is taken as over: Vite says nothing of one whose code failed to load. */
const UPDATE_LOST_MS = 5000;
/** The longest the page tells in one go before it lets the page have a turn. */
const SLICE_MS = 10;
/** What the page's telling is measured as, a slice at a time (`performance.measure`). */
export const PAGE_CHANGED_MEASURE = "humantouch:page-changed";

/**
 * Tells of each `CODE_EVENT` on `win` whether it brings code in: an update
 * begun, or one in (begun before the telling did). An error brings none.
 * With no word from the dev server, nothing ever does.
 */
function bringsCode(win: Window): () => boolean {
  let at = codeUpdates(win)?.at ?? 0;
  return () => {
    const updates = codeUpdates(win);
    if (!updates) return false;
    const brought = updates.updating > 0 || updates.at > at;
    at = Math.max(at, updates.at);
    return brought;
  };
}

/**
 * Calls `onChange` as the dev server begins to bring code into `win`'s page:
 * once for a run of updates, each within `quietMs` of the one before. Returns
 * the way to stop.
 */
export function watchCodeChanges(win: Window, onChange: () => void, { quietMs = CODE_QUIET_MS } = {}): () => void {
  const brings = bringsCode(win);
  /** When the last update of the run so far came. */
  let lastUpdate = -Infinity;
  const onCode = () => {
    if (!brings()) return;
    const now = performance.now();
    const fresh = now - lastUpdate >= quietMs;
    lastUpdate = now;
    if (fresh) onChange();
  };
  win.addEventListener(CODE_EVENT, onCode);
  return () => win.removeEventListener(CODE_EVENT, onCode);
}

/** A run of code changes, the code at rest since. */
export interface CodeRun<B = undefined> {
  /** When it began, in ms since the epoch. */
  since: number;
  /** What `before` took as it began, before the dev server brought any of its code in; undefined when it could not. */
  before: B | undefined;
  /** Whether the page draws anything otherwise than before the run: told a slice at a time. */
  pageChanged(): Promise<boolean>;
}

/**
 * Whether the designer is in the middle of something: a press held (ADR
 * 0012), or words typed and not yet applied (a field's, a text layer's on
 * the canvas, a brief's).
 */
export function designerBusy(): boolean {
  if (pointerHeld()) return true;
  let el: Element | null = document.activeElement;
  for (;;) {
    const inner: Element | null | undefined = el?.shadowRoot?.activeElement ?? (el instanceof HTMLIFrameElement ? el.contentDocument?.activeElement : null);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el instanceof HTMLElement && (el.isContentEditable || el.localName === "textarea" || el.hasAttribute("data-ht-typing"));
}

/**
 * Calls `onRest` once for each run of code the dev server brings into `win`'s
 * page, each update within `quietMs` of the one before: once the run has
 * been quiet that long, nothing is being brought in, and the designer is not
 * `busy`. What the page does meanwhile is watched, to tell by; `before` is
 * called as a run begins, the page as it was before it, measured as the
 * telling is (ticket 82). Returns the way to stop.
 */
export function watchCodeRuns<B = undefined>(
  win: Window,
  onRest: (run: CodeRun<B>) => void,
  { quietMs = CODE_QUIET_MS, busy = designerBusy, before }: { quietMs?: number; busy?: () => boolean; before?: () => B } = {},
): () => void {
  const doc = win.document;
  const brings = bringsCode(win);
  /** The run under way: when it began, what `before` took then, and what the page did since. */
  let run: { since: number; before: B | undefined; records: MutationRecord[] } | null = null;
  /** When the last update of the run came. */
  let lastUpdate = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One by one: a page of thousands of elements may move as many markers in one go, too many to spread into a call.
  const keep = (records: MutationRecord[]) => {
    for (const record of records) run?.records.push(record);
  };
  const observer = new MutationObserver(keep);
  /** What `before` takes, measured; nothing when it fails, the run told all the same. */
  const take = (before: () => B): B | undefined => {
    const start = performance.now();
    try {
      return before();
    } catch (error) {
      console.warn(error);
      return undefined;
    } finally {
      performance.measure(PAGE_CHANGED_MEASURE, { start, end: performance.now() });
    }
  };
  const rest = () => {
    if (!run) return;
    const updating = !!codeUpdates(win)?.updating && performance.now() - lastUpdate < UPDATE_LOST_MS;
    if (updating || busy()) {
      timer = setTimeout(rest, BUSY_EVERY_MS);
      return;
    }
    keep(observer.takeRecords());
    observer.disconnect();
    const { since, before: was, records } = run;
    run = null;
    onRest({ since, before: was, pageChanged: () => sliced(changedBy(records)) });
  };
  const onCode = () => {
    if (!brings()) return;
    if (!run) {
      run = { since: Date.now(), before: before && take(before), records: [] };
      // As the update begins, before Vite has fetched the code it brings, let alone run it.
      observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
    }
    lastUpdate = performance.now();
    clearTimeout(timer);
    timer = setTimeout(rest, quietMs);
  };
  win.addEventListener(CODE_EVENT, onCode);
  return () => {
    win.removeEventListener(CODE_EVENT, onCode);
    clearTimeout(timer);
    observer.disconnect();
    run = null;
  };
}

/** Runs `work` a slice at a time, each measured, the page having a turn between; resolves with what it returns. */
export function sliced<T>(work: Generator<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const slice = () => {
      const start = performance.now();
      try {
        for (;;) {
          const step = work.next();
          if (step.done) {
            performance.measure(PAGE_CHANGED_MEASURE, { start, end: performance.now() });
            return resolve(step.value);
          }
          if (performance.now() - start > SLICE_MS) break;
        }
      } catch (error) {
        return reject(error);
      }
      performance.measure(PAGE_CHANGED_MEASURE, { start, end: performance.now() });
      setTimeout(slice, 0);
    };
    slice();
  });
}

/** Attributes that say where the code is, not what the page draws: they move as code above them is edited. */
const MARKERS = new Set([LOC_ATTR, USAGE_ATTR]);
/** Nodes the page draws by no code of its own: the editor layer, and Vite's overlay for an error in the code, which brings none in. */
const ignored = (node: Node) => node instanceof Element && (node.localName === HOST_TAG || node.localName === "vite-error-overlay");
/** Nodes that are drawn: not comments, nor what is ignored. */
const drawn = (node: Node) => (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) && !ignored(node);
/** How many nodes are looked at between two looks at the time. */
const STEP = 100;

/**
 * Whether what `records` saw the page do left it drawing anything
 * otherwise: an attribute but a source marker, a text, or the nodes of an
 * element (a stylesheet's text among them), as they were before and are now.
 * Nodes put in are looked at as wholes: what was done in them since does not
 * count apart. Yields now and then, to be run a slice at a time.
 */
function* changedBy(records: MutationRecord[]): Generator<undefined, boolean> {
  const lists = new Map<Node, MutationRecord[]>();
  const attributes = new Map<Element, Map<string, string | null>>();
  const texts = new Map<CharacterData, string | null>();
  const added = new Set<Node>();
  for (const record of records) {
    if (record.type === "childList") {
      lists.set(record.target, [...(lists.get(record.target) ?? []), record]);
      for (const node of record.addedNodes) added.add(node);
    } else if (record.type === "attributes") {
      if (MARKERS.has(record.attributeName!)) continue;
      const element = record.target as Element;
      const olds = attributes.get(element) ?? new Map<string, string | null>();
      // The first: what it was before the run.
      if (!olds.has(record.attributeName!)) olds.set(record.attributeName!, record.oldValue);
      attributes.set(element, olds);
    } else if (!texts.has(record.target as CharacterData)) texts.set(record.target as CharacterData, record.oldValue);
  }
  /** Still on the page, and in no node put in since the run began, nor ignored. */
  const asItWas = (node: Node) => {
    if (!node.isConnected) return false;
    for (let at: Node | null = node; at; at = at.parentNode) if (added.has(at) || ignored(at)) return false;
    return true;
  };
  for (const [element, olds] of attributes) {
    if (!asItWas(element)) continue;
    for (const [name, old] of olds) if (element.getAttribute(name) !== old) return true;
  }
  for (const [text, old] of texts) if (asItWas(text) && text.data !== old) return true;
  yield;
  for (const [parent, changes] of lists) {
    if (!asItWas(parent)) continue;
    const now = [...parent.childNodes];
    const before = childrenBefore(now, changes);
    const [a, b] = [before.filter(drawn), now.filter(drawn)];
    if (a.length === b.length && a.every((node, i) => node === b[i])) continue;
    const [was, is] = [[] as string[], [] as string[]];
    yield* written(a, was);
    yield* written(b, is);
    if (was.join("") !== is.join("")) return true;
  }
  return false;
}

/** The children of an element as they were before `changes` to them, from the children it has now: each change undone, the last first. */
function childrenBefore(now: Node[], changes: MutationRecord[]): Node[] {
  const list = [...now];
  for (const change of [...changes].reverse()) {
    for (const node of change.addedNodes) {
      const i = list.indexOf(node);
      if (i >= 0) list.splice(i, 1);
    }
    const i = change.previousSibling ? list.indexOf(change.previousSibling) + 1 : change.nextSibling ? Math.max(0, list.indexOf(change.nextSibling)) : 0;
    list.splice(i, 0, ...change.removedNodes);
  }
  return list;
}

/** Writes out what `nodes` draw, into `out`: each element's tag and attributes but its source markers, its nodes within, and each text. */
function* written(nodes: Node[], out: string[]): Generator<undefined> {
  const stack: (Node | string)[] = [...nodes].reverse();
  let count = 0;
  while (stack.length) {
    const next = stack.pop()!;
    if (typeof next === "string") {
      out.push(next);
      continue;
    }
    if (!drawn(next)) continue;
    if (++count % STEP === 0) yield;
    if (next.nodeType === Node.TEXT_NODE) {
      out.push(`"${(next as Text).data}"`);
      continue;
    }
    const el = next as Element;
    const attributes = [...el.attributes].filter((attribute) => !MARKERS.has(attribute.name)).map((attribute) => `${attribute.name}=${JSON.stringify(attribute.value)}`);
    out.push(`<${el.localName} ${attributes.sort().join(" ")}>`);
    stack.push(`</${el.localName}>`);
    for (let i = el.childNodes.length - 1; i >= 0; i--) stack.push(el.childNodes[i]);
  }
}
