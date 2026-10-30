/**
 * The page checking a claimed round itself (ADR 0013): each time the code
 * changes, it looks again at the changes it does not show yet, and says what
 * it saw; a change it shows once is not looked at again. `done` asks it too:
 * a change it shows already is answered at once; any other once the code
 * edited before the ask has reached the page, as far as the dev server can
 * say, and then had a moment to show.
 *
 * Looking is spread out so it never holds the page up for long: as many
 * changes as fit in a short slice of time, the rest after the page has had a turn.
 */
import { CHECK_ARRIVE_MS, CHECK_SETTLE_MS, CODE_EVENT, CODE_GLOBAL, type CheckAsk, type CheckReport, type CheckResult, type CodeUpdates } from "../service-protocol";
import type { Change } from "./changeset";
import { checkAcross, uncheckable, widthsOf, type PageWidth } from "./check";
import { CHECK_MEASURE } from "./host";
import { copyPage, type PageCopy } from "./page-copy";

export interface PageChecks {
  /** Answers what `done` asks; each ask once. */
  ask(ask: CheckAsk): void;
  stop(): void;
}

interface Options {
  window: Window;
  /** The claimed round's changes. */
  changes: Change[];
  /** Says what the page saw of a change: as the code changed, or in answer to an ask. */
  report(report: CheckReport): void;
  /** A change shows on the page now, at every width it is to. */
  onShown(id: number): void;
  /** The widths of the views beside the desktop view. */
  viewWidths(): number[];
  /** Where the copies of the page at other widths go: apart from the page, so they never copy themselves. */
  copiesIn(): ParentNode;
}

/** The longest the page looks in one go before it lets the page have a turn. */
const SLICE_MS = 12;
/** After the dev server brings code in, how long the page's own changes (React drawing it anew, say) are looked at too. */
const AFTER_CODE_MS = 3000;
/** With no word from the dev server, the least time between two looks as the page changes. */
const LOOK_EVERY_MS = 250;
/** Once the code an ask waits for has reached the page, how long a change it does not show yet may take to show: from the dev server's last update. */
const SHOW_MS = 1500;
/** How long the dev server is to have brought nothing in before the code an ask waits for counts as in. */
const QUIET_MS = 500;

/**
 * Checks the round on `window`'s page till stopped. A change the page cannot
 * check at all (a brief, a layer new this round) it never looks at by itself:
 * asked, it says why.
 */
export function watchPage({ window: win, changes, report, onShown, viewWidths, copiesIn }: Options): PageChecks {
  const doc = win.document;
  const code = () => (win as unknown as Record<string, CodeUpdates | undefined>)[CODE_GLOBAL];
  const shown = new Set<number>();
  /** What was last said of each change as the code changed, to say it again only when it changes. */
  const said = new Map<number, string>();
  const checkable = changes.filter((change) => !uncheckable(change));
  const copies = new Map<number, PageCopy>();
  /** The copies laid out as they are since they last changed. */
  const laidOut = new Set<number>();
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (then: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) then();
    }, ms);
    timers.add(timer);
  };

  /**
   * Readies the copy of the page `width` px wide for a look, a step at a time:
   * made, or brought up to date and laid out. Whether it took a step, the
   * costly part of looking at it, which is then done in a task of its own.
   */
  const prepare = (width: number): boolean => {
    const copy = copies.get(width);
    if (!copy) {
      copies.set(width, copyPage(doc, width, copiesIn()));
      return true;
    }
    if (copy.sync()) laidOut.delete(width);
    if (laidOut.has(width)) return false;
    copy.layOut();
    laidOut.add(width);
    return true;
  };
  /** The page `width` px wide, as a copy of it kept up to date; null while its stylesheets load. */
  const at = (width: number): PageWidth | null => {
    let copy = copies.get(width);
    if (!copy) {
      copy = copyPage(doc, width, copiesIn());
      copies.set(width, copy);
    }
    if (copy.sync()) laidOut.delete(width);
    if (!copy.ready()) {
      void copy.loaded().then(() => look());
      return null;
    }
    return { width, doc: copy.doc, own: false, of: copy.of };
  };
  /** Looks at `change` now; what looking puts in the page is not the code changing. */
  const check = (change: Change): CheckResult => {
    const start = performance.now();
    try {
      return lookNow(change);
    } finally {
      performance.measure(CHECK_MEASURE, { start, end: performance.now(), detail: change.id });
    }
  };
  const lookNow = (change: Change): CheckResult => {
    let loading = false;
    const result = checkAcross(doc, change, changes, viewWidths(), (width) => {
      const copy = at(width);
      loading ||= !copy;
      return copy;
    });
    observer.takeRecords();
    // A copy still loading its stylesheets: looked at again once it has.
    return loading && result.outcome === "unchecked" ? { outcome: "unchecked", reason: "loading" } : result;
  };
  const saw = (change: Change, result: CheckResult) => {
    if (result.outcome === "unchecked" && result.reason === "loading") return;
    if (result.outcome === "shown" && !shown.has(change.id)) {
      shown.add(change.id);
      onShown(change.id);
    }
    const text = JSON.stringify(result);
    if (said.get(change.id) === text) return;
    said.set(change.id, text);
    report({ id: change.id, at: new Date().toISOString(), ...result });
  };

  // Looking at every change not shown yet, a slice at a time.
  let looking = false;
  let again = false;
  let lastLook = 0;
  const look = () => {
    if (stopped) return;
    if (looking) {
      again = true;
      return;
    }
    looking = true;
    const todo = checkable.filter((change) => !shown.has(change.id));
    const slice = () => {
      if (stopped) return;
      const start = performance.now();
      while (todo.length) {
        const change = todo[0];
        // A copy of the page the change is looked at on, readied first, a step to a task: the costly part.
        const stepStart = performance.now();
        const step = !shown.has(change.id) && widthsOf(change, changes, win.innerWidth, viewWidths()).others.some((width) => prepare(width));
        if (step) {
          performance.measure(CHECK_MEASURE, { start: stepStart, end: performance.now() });
          return later(slice, 0);
        }
        todo.shift();
        if (!shown.has(change.id)) saw(change, check(change));
        if (todo.length && performance.now() - start > SLICE_MS) return later(slice, 0);
      }
      looking = false;
      lastLook = performance.now();
      if (again) {
        again = false;
        look();
      }
      if (shown.size === checkable.length) observer.disconnect();
    };
    slice();
  };

  // When to look: as the dev server brings code in, and the page changes with it.
  let codeCameAt = -Infinity;
  let waiting = false;
  const observer = new MutationObserver(() => {
    if (code()) {
      if (performance.now() - codeCameAt < AFTER_CODE_MS) look();
      return;
    }
    // No word from the dev server: any change to the page may be the code's, but the page may change all the time.
    const wait = lastLook + LOOK_EVERY_MS - performance.now();
    if (wait <= 0) look();
    else if (!waiting) {
      waiting = true;
      later(() => {
        waiting = false;
        look();
      }, wait);
    }
  });
  const onCode = () => {
    codeCameAt = performance.now();
    look();
  };
  win.addEventListener(CODE_EVENT, onCode);
  if (checkable.length) observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  later(look, 0);

  /**
   * Resolves once the code edited at `codeAt` has reached the page, as the dev
   * server says: no update under way, and the last one at least as new. One
   * that never comes (a file the page does not use) is waited for a while;
   * one under way, longer. With no word from the dev server, at once.
   */
  const arrived = (codeAt: number | null | undefined, deadline: number): Promise<void> =>
    new Promise((resolve) => {
      const since = performance.now();
      const test = () => {
        const updates = code();
        const waited = performance.now() - since;
        if (stopped || !updates || performance.now() >= deadline) return done();
        // The dev server has gone quiet too: one file's update may come in before another's has begun.
        const quiet = performance.now() - codeCameAt >= QUIET_MS;
        if (!updates.updating && quiet && (codeAt == null || updates.at >= codeAt || waited >= CHECK_SETTLE_MS)) return done();
        later(test, 100);
      };
      const done = () => {
        win.removeEventListener(CODE_EVENT, test);
        resolve();
      };
      win.addEventListener(CODE_EVENT, test);
      test();
    });

  /**
   * Looks at `change` till it shows, or `ms` have passed since the dev server
   * last brought code in (or since now): each time the page changes.
   */
  const showsWithin = (change: Change, ms: number, deadline: number): Promise<CheckResult> =>
    new Promise((resolve) => {
      const first = check(change);
      if (first.outcome === "shown" || stopped) return resolve(first);
      const since = performance.now();
      let last: CheckResult = first;
      const watch = new MutationObserver(() => {
        last = check(change);
        // What looking put in the page and took out again is not the code's.
        watch.takeRecords();
        if (last.outcome === "shown") end();
      });
      watch.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      let timer: ReturnType<typeof setTimeout>;
      const wait = () => {
        const updates = code();
        const now = performance.now();
        const until = Math.min(deadline, Math.max(since, codeCameAt) + ms);
        if (!stopped && now < deadline && (updates?.updating || now < until)) timer = setTimeout(wait, Math.max(50, Math.min(until - now, 250)));
        else {
          last = check(change);
          end();
        }
      };
      timer = setTimeout(wait, ms);
      function end() {
        watch.disconnect();
        clearTimeout(timer);
        resolve(last);
      }
    });

  const asked = new Set<string>();
  return {
    ask(ask) {
      if (asked.has(ask.at) || stopped) return;
      asked.add(ask.at);
      const answer = (id: number, result: CheckResult) => {
        if (!stopped) report({ id, at: ask.at, ...result });
      };
      const waitFor: Change[] = [];
      for (const id of ask.ids) {
        const change = changes.find((c) => c.id === id);
        if (!change) answer(id, { outcome: "unchecked", reason: "the page does not have this round" });
        else if (shown.has(id)) answer(id, { outcome: "shown" });
        else {
          const reason = uncheckable(change);
          if (reason) answer(id, { outcome: "unchecked", reason });
          else waitFor.push(change);
        }
      }
      if (!waitFor.length) return;
      // With no word from the dev server, a change may take a while to show: as long as it ever did.
      const settle = code() ? SHOW_MS : CHECK_SETTLE_MS;
      // The page's whole answer, the code reaching it and the change showing, within one wait.
      const deadline = performance.now() + CHECK_ARRIVE_MS;
      void arrived(ask.codeAt, deadline).then(() =>
        Promise.all(
          waitFor.map(async (change) => {
            let result: CheckResult = await showsWithin(change, settle, deadline);
            // A copy still loading: once it has.
            if (result.outcome === "unchecked" && result.reason === "loading") {
              await Promise.all([...copies.values()].map((copy) => copy.loaded()));
              result = check(change);
              if (result.outcome === "unchecked" && result.reason === "loading") result = { outcome: "unchecked", reason: "the page could not be shown at every width the change applies at, to check it" };
            }
            saw(change, result);
            answer(change.id, result);
          }),
        ),
      );
    },
    stop() {
      stopped = true;
      observer.disconnect();
      win.removeEventListener(CODE_EVENT, onCode);
      for (const timer of timers) clearTimeout(timer);
      for (const copy of copies.values()) copy.close();
    },
  };
}
