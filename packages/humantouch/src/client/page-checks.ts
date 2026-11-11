/**
 * The page checking a claimed round itself (ADR 0013): each time the code
 * changes, it looks again at the changes it does not show yet, and says what
 * it saw; a change it shows already it looks at again as wide as its window
 * only (a later edit may have undone it), its copies at other widths left
 * for `done` and `finish` to bring up to date. `done` asks it too:
 * a change it shows already is answered at once; any other once the code
 * edited before the ask has reached the page, as far as the dev server can
 * say, and then had a moment to show.
 *
 * A change for one usage of a component alone is not shown, though its layer
 * shows it, where the component's other usages show its property otherwise
 * than when the page began to check (ticket 77, `other-usages.ts`).
 *
 * Looking is spread out so it never holds the page up for long: as many
 * changes as fit in a short slice of time, the rest after the page has had a turn.
 */
import { CHECK_ARRIVE_MS, CHECK_SETTLE_MS, CODE_EVENT, type CheckAsk, type CheckReport, type CheckResult } from "../service-protocol";
import type { Change } from "./changeset";
import { checkAcross, checkHere, effectNotes, itself, outsideOf, uncheckable, widthsOf, type EffectNotes, type PageWidth } from "./check";
import { codeUpdates, sliced } from "./code-changes";
import { otherUsagesChanged, looksAtOtherUsages, noteChange, noteOutside, outsideChanged, unnoted, withOutside, type OtherUsagesNoted } from "./other-usages";
import { CHECK_MEASURE } from "./host";
import type { NotShownOutside } from "../outside-protocol";
import type { RoundOnCanvas } from "./moves";
import { copyPage, type PageCopy } from "./page-copy";

export interface PageChecks {
  /** Answers what `done` asks; each ask, by its key, once. */
  ask(ask: CheckAsk): void;
  stop(): void;
}

interface Options {
  window: Window;
  /** The claimed round's changes, placed on its canvas as saved: where its new layers are (ticket 76). */
  changes: RoundOnCanvas;
  /** Says what the page saw of a change: as the code changed, or in answer to an ask. */
  report(report: CheckReport): void;
  /** The changes the page shows now, at every width each is to: each time they change. */
  onShown(ids: number[]): void;
  /** The widths of the views beside the desktop view. */
  viewWidths(): number[];
  /** Where the copies of the page at other widths go: apart from the page, so they never copy themselves. */
  copiesIn(): ParentNode;
  /**
   * What the components' other usages showed of each change for one usage
   * alone, by its id, as the page first looked (ticket 77): kept by the
   * caller for as long as the round is claimed, so a page that checks it
   * anew, the round read again, still goes by what they showed at the claim;
   * with what was kept in `.humantouch/` in it, a page reloaded too (ticket 82).
   */
  otherUsages?: Map<number, OtherUsagesNoted | null>;
  /** Each note taken into `otherUsages` as the page first looks at a change, to be kept with the claim (ticket 82). */
  onNoted?(id: number, noted: OtherUsagesNoted | null): void;
  /**
   * What each change's style moved as the page first looked at it (ADR 0016,
   * `EffectNotes`): kept by the caller for as long as the round is claimed,
   * as `otherUsages` is, so a page that checks the round anew, read again,
   * goes by what was noted before the code changed. Not kept in `.humantouch/`:
   * a page reloaded goes without.
   */
  effects?: EffectNotes;
}

/** The longest the page looks in one go before it lets the page have a turn. */
const SLICE_MS = 12;
/** After the dev server brings code in, or the page begins to check, how long the page's own changes (React drawing it anew, say) are looked at too. */
const FOLLOW_PAGE_MS = 3000;
/** With no word from the dev server, the least time between two looks as the page changes. */
const LOOK_EVERY_MS = 250;
/** Once the code an ask waits for has reached the page, how long a change it does not show yet may take to show: from the dev server's last update. */
const SHOW_MS = 1500;
/** How long the dev server is to have brought nothing in before the code an ask waits for counts as in. */
const QUIET_MS = 500;
/**
 * An update begun this long ago with no word of its end is taken as over by
 * the page's checks (ticket 123): one whose code never came, Vite's queue of
 * updates held up behind it. Longer than the code changes' `UPDATE_LOST_MS`,
 * so a slow update on a busy machine is still waited for; short enough to
 * leave `SHOW_MS` within `CHECK_ARRIVE_MS`.
 */
export const PAGE_UPDATE_LOST_MS = 12_000;

/**
 * What the page's checks keep of the dev server's updates (ticket 123), for
 * as long as the page is open, from one round to the next.
 * - `began`: when the latest update began, as the count of them rose; as the
 *   page first checked, if one was under way then.
 * - `was`: the count, as last heard.
 * - `lost`: of the count, the updates whose end will never come: those
 *   counted as another began, where Vite begins one only once the one before
 *   is over (its handler threw before it said so; `CodeUpdates.inTurn`,
 *   6.3.0 on). Where updates run side by side, as before 6.3.0, another's
 *   beginning says nothing of those under way (ticket 125): only those begun
 *   `PAGE_UPDATE_LOST_MS` before it are counted lost then.
 */
interface HotUpdates {
  began: number;
  was: number;
  lost: number;
}
const hotUpdatesOf = new WeakMap<Window, HotUpdates>();

/** `win`'s `HotUpdates`, kept from the first time its checks begin; undefined with no word from the dev server (Next.js). */
function hotUpdates(win: Window): HotUpdates | undefined {
  const kept = hotUpdatesOf.get(win);
  if (kept) return kept;
  const updates = codeUpdates(win);
  if (!updates) return undefined;
  const hot: HotUpdates = { began: updates.updating ? performance.now() : -Infinity, was: updates.updating, lost: 0 };
  hotUpdatesOf.set(win, hot);
  // Never taken off: the page's checks come and go with the round, the updates they go by run on.
  win.addEventListener(CODE_EVENT, () => {
    const updates = codeUpdates(win);
    const count = updates?.updating ?? 0;
    if (count > hot.was) {
      if (updates?.inTurn || performance.now() - hot.began >= PAGE_UPDATE_LOST_MS) hot.lost = Math.max(hot.lost, hot.was);
      hot.began = performance.now();
    }
    hot.was = count;
    hot.lost = Math.min(hot.lost, count);
  });
  return hot;
}

/**
 * Checks the round on `window`'s page till stopped. A change the page cannot
 * check at all (a brief, a copy made this round) it never looks at by itself:
 * asked, it says why.
 */
export function watchPage({ window: win, changes, report, onShown, viewWidths, copiesIn, otherUsages: others = new Map(), onNoted, effects = effectNotes(true) }: Options): PageChecks {
  const doc = win.document;
  const code = () => codeUpdates(win);
  const shown = new Set<number>();
  /** What was last said of each change as the code changed, to say it again only when it changes. */
  const said = new Map<number, string>();
  const checkable = changes.filter((change) => !uncheckable(change, changes));
  const copies = new Map<number, PageCopy>();
  /** Of a change at a breakpoint, the widths outside its range its layer is to show its property at as it did (ticket 104). */
  const outside = (change: Change) => outsideOf(change, changes, win.innerWidth, viewWidths());
  /** Noted, at every width outside its range it is looked at now too: one the page could not be shown at, or had not the layer at, or a view added since, is noted as soon as it can be. */
  const noted = (change: Change) => (others.has(change.id) || !looksAtOtherUsages(change)) && !unnoted(others.get(change.id), outside(change)).length;
  /** The page `width` px wide: itself, as wide as its window, else a copy of it; null while the copy's stylesheets load. */
  const pageAt = (width: number) => (width === win.innerWidth ? itself(doc) : copyAt(width));
  const note = (change: Change) => {
    if (!others.has(change.id)) {
      const notes = noteChange(doc, change, changes, win.innerWidth, outside(change), pageAt);
      others.set(change.id, notes);
      onNoted?.(change.id, notes);
      return;
    }
    // Noted before, but not at every width outside its range (ticket 104): the rest, as soon as they can be.
    const was = others.get(change.id) ?? null;
    const notes = withOutside(was, win.innerWidth, noteOutside(doc, change, changes, unnoted(was, outside(change)), pageAt));
    if (notes === was) return;
    others.set(change.id, notes);
    onNoted?.(change.id, notes);
  };
  /**
   * Shown on its layer (or not looked at there, at this width): not shown
   * after all where other usages of its component show it too (ticket 77),
   * or, at a breakpoint, widths outside its range (ticket 104): of those, as
   * wide as the window alone when not `everywhere`.
   */
  const orAtOtherUsages = (change: Change, result: CheckResult | null, everywhere: boolean): CheckResult | null => {
    if (result && result.outcome !== "shown") return result;
    if (!noted(change)) note(change);
    const notes = others.get(change.id) ?? null;
    const changed = otherUsagesChanged(doc, change, notes, win.innerWidth);
    const widths = everywhere ? outside(change) : outside(change).filter((width) => width === win.innerWidth);
    const beyond = !changed.length && widths.length ? outsideChanged(doc, change, changes, notes, widths, pageAt) : { changed: [], loading: false };
    observer.takeRecords();
    if (changed.length) return { outcome: "not shown", actual: change.after, otherUsages: changed };
    if (beyond.changed.length) {
      const notShown: NotShownOutside = { outcome: "not shown", actual: change.after, outside: beyond.changed };
      return notShown;
    }
    // A copy outside its range still loading: looked at again once it has, as one in its range is.
    return beyond.loading ? { outcome: "unchecked", reason: "loading" } : result;
  };
  /** The changes whose copies outside their range the page has waited to load once, to note them (ticket 104). */
  const waitedFor = new Set<number>();
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
  /** The widths `change` is looked at on copies of the page at: those it is to show at, and those outside its range it is to show as it did (ticket 104). */
  const copiesFor = (change: Change) => [...new Set([...widthsOf(change, changes, win.innerWidth, viewWidths()).others, ...outside(change).filter((width) => width !== win.innerWidth)])];
  /** The page `width` px wide, as a copy of it kept up to date; null while its stylesheets load. */
  const copyAt = (width: number): PageWidth | null => {
    if (!copies.has(width)) prepare(width);
    const copy = copies.get(width)!;
    if (copy.sync()) laidOut.delete(width);
    if (!copy.ready()) {
      void copy.loaded().then(() => look());
      return null;
    }
    return { width, doc: copy.doc, own: false, of: copy.of };
  };
  /** Looks at `change` now; what looking puts in the page is not the code changing. `sources`: not shown, what sets the value shown instead too. */
  const check = (change: Change, sources = false): CheckResult => measured(change, () => orAtOtherUsages(change, lookNow(change, sources), true)!);
  /** Looks at `change`, shown, again as wide as the window; null when it is to show on copies of the page only. */
  const checkAgain = (change: Change): CheckResult | null =>
    measured(change, () => {
      const result = checkHere(doc, change, changes, viewWidths(), effects);
      observer.takeRecords();
      return orAtOtherUsages(change, result, false);
    });
  const measured = <T,>(change: Change, look: () => T): T => {
    const start = performance.now();
    try {
      return look();
    } finally {
      performance.measure(CHECK_MEASURE, { start, end: performance.now(), detail: change.id });
    }
  };
  const lookNow = (change: Change, sources: boolean): CheckResult => {
    let loading = false;
    const at = (width: number) => {
      const copy = copyAt(width);
      loading ||= !copy;
      return copy;
    };
    const result = checkAcross(doc, change, changes, viewWidths(), at, sources, effects);
    observer.takeRecords();
    // A copy still loading its stylesheets: looked at again once it has.
    return loading && result.outcome === "unchecked" ? { outcome: "unchecked", reason: "loading" } : result;
  };
  const saw = (change: Change, result: CheckResult) => {
    if (stopped || (result.outcome === "unchecked" && result.reason === "loading")) return;
    // Not shown where it was: a later edit undid it. Not to be checked now (the layer not on the page, on another route say) is no word of that.
    const undone = shown.has(change.id) && result.outcome === "not shown";
    if ((result.outcome === "shown") !== shown.has(change.id)) {
      if (result.outcome === "shown") shown.add(change.id);
      else shown.delete(change.id);
      onShown([...shown]);
    }
    const text = JSON.stringify(result);
    if (said.get(change.id) === text) return;
    said.set(change.id, text);
    report({ id: change.id, at: new Date().toISOString(), ...result, ...(undone && { undone: true as const }) });
  };

  // Looking at every change, a slice at a time: those not shown yet at every width, those shown as wide as the window.
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
    /** The changes noted in this look: what is not noted yet, at a width the page cannot be shown at or has not the layer at, is left for the next. */
    const tried = new Set<number>();
    const todo = [...checkable.filter((change) => !shown.has(change.id)), ...checkable.filter((change) => shown.has(change.id))];
    const slice = () => {
      if (stopped) return;
      const start = performance.now();
      while (todo.length) {
        const change = todo[0];
        // What the other usages of its component show, noted first: before the code changes, if it may (ticket 77).
        const noting = !noted(change) && !tried.has(change.id);
        if (noting || !shown.has(change.id)) {
          // A copy of the page the change is looked at on, readied first, a step to a task: the costly part. To note it too, at widths outside a breakpoint's range (ticket 104).
          const stepStart = performance.now();
          if (copiesFor(change).some((width) => prepare(width))) {
            performance.measure(CHECK_MEASURE, { start: stepStart, end: performance.now() });
            return later(slice, 0);
          }
        }
        if (noting) {
          // Loaded first, waited for once: a copy that never loads, the rest noted as the copies come, the round's other changes looked at meanwhile.
          const loading = copiesFor(change).map((width) => copies.get(width)!).filter((copy) => !copy.ready());
          if (loading.length && !waitedFor.has(change.id)) {
            waitedFor.add(change.id);
            looking = false;
            void Promise.all(loading.map((copy) => copy.loaded())).then(() => look());
            return;
          }
          tried.add(change.id);
          measured(change, () => note(change));
          if (performance.now() - start > SLICE_MS) return later(slice, 0);
          continue;
        }
        todo.shift();
        if (shown.has(change.id)) {
          // Undone by a later edit, it is not shown: looked at at every width again from now on.
          const result = checkAgain(change);
          if (result && result.outcome !== "shown") saw(change, result);
        } else saw(change, check(change));
        if (todo.length && performance.now() - start > SLICE_MS) return later(slice, 0);
      }
      looking = false;
      lastLook = performance.now();
      if (again) {
        again = false;
        look();
      }
    };
    slice();
  };

  /** Readies the copies `change` is looked at on, a step to a task, then calls `then`. */
  const whenReady = (change: Change, then: () => void) => {
    const start = performance.now();
    if (copiesFor(change).some((width) => prepare(width))) {
      performance.measure(CHECK_MEASURE, { start, end: performance.now() });
      later(() => whenReady(change, then), 0);
    } else then();
  };

  // When to look: as the dev server brings code in, and the page changes with it.
  let codeCameAt = -Infinity;
  const hot = hotUpdates(win);
  /**
   * An update under way, as the dev server says, but for one that lost its
   * end (ticket 123): one counted lost as another began (`HotUpdates.lost`), or
   * the latest begun `PAGE_UPDATE_LOST_MS` ago with no word of its end. Else
   * it would hold every ask after it for all of `CHECK_ARRIVE_MS`. Unlike
   * the code changes' `UPDATE_LOST_MS`, timed from the latest update's
   * beginning, not the last word, and with the lost ones taken off the count.
   */
  const updating = () => {
    const count = code()?.updating ?? 0;
    if (!hot) return count > 0;
    return count > hot.lost && performance.now() - hot.began < PAGE_UPDATE_LOST_MS;
  };
  /**
   * Till when the page's own changes are looked at too, with word from the
   * dev server: a while after it brought code in, and after the page began to
   * check, as the code may have come in just before (the Agent editing as it
   * claims), the page drawing it only after its first look.
   */
  let followUntil = -Infinity;
  const follow = () => (followUntil = performance.now() + FOLLOW_PAGE_MS);
  follow();
  let waiting = false;
  const observer = new MutationObserver(() => {
    // The page changing, its code may have: what a change's style moves is noted no more (ADR 0016).
    effects.open = false;
    if (code()) {
      if (performance.now() < followUntil) look();
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
    effects.open = false;
    codeCameAt = performance.now();
    follow();
    look();
  };
  win.addEventListener(CODE_EVENT, onCode);
  // Watched all along: a change shown may be undone by a later edit.
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
        if (!updating() && quiet && (codeAt == null || updates.at >= codeAt || waited >= CHECK_SETTLE_MS)) return done();
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
   * last brought code in (or since now): as the page changes, at most once a
   * turn, its copies readied first. `sources`: as `check`.
   */
  const showsWithin = (change: Change, ms: number, deadline: number, sources: boolean): Promise<CheckResult> =>
    new Promise((resolve) => {
      const since = performance.now();
      let last: CheckResult | null = null;
      let looking = false;
      let ended = false;
      const lookAgain = (then?: () => void) => {
        if (looking || ended) return;
        looking = true;
        later(
          () =>
            whenReady(change, () => {
              looking = false;
              last = check(change, sources);
              if (last.outcome === "shown" || then) end();
            }),
          0,
        );
      };
      const watch = new MutationObserver(() => {
        watch.takeRecords();
        lookAgain();
      });
      watch.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      const wait = () => {
        const now = performance.now();
        const until = Math.min(deadline, Math.max(since, codeCameAt) + ms);
        if (!stopped && now < deadline && (updating() || now < until)) later(wait, Math.max(50, Math.min(until - now, 250)));
        else {
          looking = false;
          lookAgain(end);
        }
      };
      lookAgain();
      later(wait, ms);
      function end() {
        if (ended) return;
        ended = true;
        watch.disconnect();
        resolve(last ?? { outcome: "unchecked", reason: "the page did not answer in time" });
      }
      if (stopped) end();
    });

  const asked = new Set<string>();
  return {
    ask(ask) {
      if (asked.has(ask.key) || stopped) return;
      asked.add(ask.key);
      // Under the ask's key: what the page says as the code changes carries none, so is never taken for an answer.
      const answer = (id: number, result: CheckResult) => {
        if (!stopped) report({ id, at: new Date().toISOString(), answers: ask.key, ...result });
      };
      // With no word from the dev server, a change may take a while to show: as long as it ever did.
      const settle = code() ? SHOW_MS : CHECK_SETTLE_MS;
      // The page's whole answer, the code reaching it and the change showing, within one wait.
      const deadline = performance.now() + CHECK_ARRIVE_MS;
      const waitFor = (change: Change) =>
        arrived(ask.codeAt, deadline).then(async () => {
          let result = await showsWithin(change, settle, deadline, !!ask.sources);
          // A copy still loading: once it has.
          if (result.outcome === "unchecked" && result.reason === "loading") {
            await Promise.all([...copies.values()].map((copy) => copy.loaded()));
            result = check(change, !!ask.sources);
            if (result.outcome === "unchecked" && result.reason === "loading") result = { outcome: "unchecked", reason: "the page could not be shown at every width the change applies at, to check it" };
          }
          saw(change, result);
          answer(change.id, result);
        });
      for (const id of ask.ids) {
        const change = changes.find((c) => c.id === id);
        const reason = change ? uncheckable(change, changes) : "the page does not have this round";
        if (!change || reason) answer(id, { outcome: "unchecked", reason: reason!, ...(change && { anyPage: true as const }) });
        // Shown already: looked at again, at once, as a later edit may have undone it.
        else if (shown.has(id))
          whenReady(change, () => {
            const result = check(change);
            if (result.outcome === "shown") return answer(id, result);
            saw(change, result);
            void waitFor(change);
          });
        else void waitFor(change);
      }
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

/**
 * Whether the page, as wide as its window, shows any of `changes`, the round
 * not claimed: the Agent applying it with no claim (ticket 78). Looked at as
 * the claimed round's check looks again (`checkHere`), on the round placed on
 * its canvas as that is (ticket 76): only what the window shows, with no copy
 * of the page at other widths to make; a change shown there is enough to tell
 * the round is being applied. Looked at a slice at a time.
 */
export function showsAnyHere(doc: Document, changes: RoundOnCanvas, viewWidths: number[]): Promise<boolean> {
  return sliced(
    (function* () {
      for (const change of changes) {
        if (checkHere(doc, change, changes, viewWidths)?.outcome === "shown") return true;
        yield;
      }
      return false;
    })(),
  );
}
