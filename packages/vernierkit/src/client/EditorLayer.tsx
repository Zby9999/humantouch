/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { CheckAsk, CheckReport, SavedOffCanvasLayer, RoundStatus, SavedRound } from "../service-protocol";
import { ChangeList } from "./ChangeList";
import { watchStall, type StallWatch } from "./agent-stall";
import { CodeChangeNotice } from "./CodeChangeNotice";
import { watchCodeChanges } from "./code-changes";
import { readMediaBreakpoints, type ProjectBreakpoints } from "./breakpoints";
import { putBackBy, withDependents, type Change, type RangePart } from "./changeset";
import { ENTER_MARK, HOST_TAG } from "./host";
import { Icon } from "./icons";
import { watchPage, type PageChecks } from "./page-checks";
import { whenLetGo } from "./pointer-held";
import { createPartsReader } from "./range-parts";
import { revertSaved, withPartsRead } from "./saved-round";
import { connectRoundStore } from "./service";
import { Shell, type RoundControl } from "./Shell";
import { StalledNotice } from "./StalledNotice";
import { Toggle } from "./Toggle";
import { readViewWidths } from "./ViewLabels";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

/** An undo made from the change list with no canvas up: the saved round before it, and after, and the layers off the canvas. */
interface ListStep {
  before: SavedRound | null;
  after: SavedRound | null;
  offCanvasBefore: SavedOffCanvasLayer[];
  offCanvasAfter: SavedOffCanvasLayer[];
}

/** Where copies of the page at other widths go, for the check and for reading the parts of a change's range: apart from the page, so they never copy themselves. */
const copiesIn = () => document.querySelector(HOST_TAG)?.shadowRoot ?? document.documentElement;

/**
 * The layers off the canvas once `changes` are taken back: but those they
 * moved out, which are back on the canvas instead; and with those they put
 * back, which are off it again, as they were, unless moved out by them too.
 */
function offCanvasWithout(layers: SavedOffCanvasLayer[], changes: Change[]): SavedOffCanvasLayer[] {
  const out = new Set(changes.map((change) => change.offCanvas));
  const known = new Set(layers.map((layer) => layer.id));
  const back = putBackBy(changes).filter((layer) => !out.has(layer.id) && !known.has(layer.id));
  if (!back.length && !layers.some((layer) => out.has(layer.id))) return layers;
  return [...layers.filter((layer) => !out.has(layer.id)), ...back];
}

/**
 * Preview mode shows only the toggle; edit mode adds the shell around the
 * canvas. A round with changes not yet applied keeps its canvas: edit mode
 * comes back to it, after a reload too, and after a round that ended with
 * changes not applied, carried over to the next on it (ticket 68). With none,
 * edit mode freezes the page afresh.
 * The page always shows the code as it is: the changes are seen on the canvas,
 * played at full size (ADR 0010). Once the Agent claims the round, the editor
 * folds into the toggle, locked until the round ends, while the page checks
 * the changes as the code changes, its ring filling as they show (ADR 0013). The toggle's badge opens the change list, where changes
 * are undone one by one, or all discarded, in either mode.
 *
 * It loads after the toggle (`LazyEditorLayer`): `enter` when edit mode was
 * asked for as it loaded, and `saved`, the saved round, when that has loaded already.
 */
export function EditorLayer({ enter, saved }: { enter?: { animate: boolean }; saved?: SavedRound | null }) {
  const [mode, setMode] = useState<Mode>(enter ? "edit" : "preview");
  const [animate, setAnimate] = useState(enter?.animate ?? true);
  const [store] = useState(connectRoundStore);
  /** The project's breakpoints from its Tailwind theme, as the local service reads them; undefined until it has said. */
  const [breakpoints, setBreakpoints] = useState<ProjectBreakpoints | null | undefined>(store ? undefined : null);
  /** Undefined until the saved round, if any, has loaded. */
  const [round, setRound] = useState<SavedRound | null | undefined>(store ? saved : null);
  /** The layers off the canvas (ADR 0009), which belong to no round; undefined until they have loaded. */
  const [offCanvas, setOffCanvas] = useState<SavedOffCanvasLayer[] | undefined>(store ? undefined : []);
  /** Changes not yet applied, for the toggle's badge: the canvas's as of its last edit while edit mode is up, else the saved round's. */
  const [live, setLive] = useState<Change[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  /**
   * Undos made from the change list with no canvas up, for ⌘Z / ⇧⌘Z in the
   * list to undo and redo. They hold only while the saved round is the one
   * they left: once anything else saves it, they are dropped.
   */
  const listSteps = useRef<{ past: ListStep[]; future: ListStep[] }>({ past: [], future: [] });
  /** Editing is paused: the code changed in edit mode with no Agent claiming the round (ticket 66). */
  const [paused, setPaused] = useState(false);
  /** The canvas, while edit mode is up: the change list works on it then. */
  const control = useRef<RoundControl | null>(null);

  /** Undefined until the local service has said: edit mode waits for it, as it may be claimed. */
  const [status, setStatus] = useState<RoundStatus | undefined>(store ? undefined : { status: "editing" });
  const claimed = status?.status === "claimed" ? status : null;

  const load = () =>
    store?.load().then(setRound, (error: unknown) => {
      console.warn(error);
      setRound(null);
    });
  useEffect(() => {
    if (saved === undefined) void load();
    store?.breakpoints().then(setBreakpoints, (error: unknown) => {
      console.warn(error);
      setBreakpoints(null);
    });
    store?.loadOffCanvas().then(setOffCanvas, (error: unknown) => {
      console.warn(error);
      setOffCanvas([]);
    });
  }, []);

  const changes = round?.changeSet.changes ?? [];
  /** The changes this page has seen show, before the local service says so to every page. */
  const [seen, setSeen] = useState<number[]>([]);
  /** Applied, as the page shows them (ADR 0013). */
  const applied = claimed ? changes.filter((change) => claimed.applied.includes(change.id) || seen.includes(change.id)) : [];
  /** Not applied yet. */
  const pending = claimed ? changes.filter((change) => !applied.includes(change)) : changes;

  // While the round is claimed, the page checks it as the code changes, and answers what `done` asks.
  // Layout effects: an effect would wait for a frame, which a background tab may not draw for a while.
  const checks = useRef<PageChecks | null>(null);
  const isClaimed = claimed !== null;
  useLayoutEffect(() => {
    if (!isClaimed || !store || !round) return;
    const report = (check: CheckReport) => store.report(check).catch((error: unknown) => console.warn(error));
    const watcher = watchPage({
      window,
      changes: round.changeSet.changes,
      report,
      onShown: setSeen,
      viewWidths: readViewWidths,
      copiesIn,
    });
    checks.current = watcher;
    return () => {
      watcher.stop();
      checks.current = null;
      setSeen([]);
    };
  }, [isClaimed, round]);
  // What `claim` asks of the changes carried over from the round before (ticket 68), `done` asks, and `finish` before it ends the round.
  const answer = (ask: CheckAsk | undefined) => {
    if (!ask || !store || round === undefined) return;
    if (checks.current) checks.current.ask(ask);
    else for (const id of ask.ids) store.report({ id, at: new Date().toISOString(), answers: ask.key, outcome: "unchecked", reason: "the page does not have this round" }).catch((error: unknown) => console.warn(error));
  };
  useLayoutEffect(() => answer(claimed?.opening), [claimed?.opening?.key, round]);
  useLayoutEffect(() => answer(claimed?.check), [claimed?.check?.key, round]);
  useLayoutEffect(() => answer(claimed?.closing), [claimed?.closing?.key, round]);

  // Once claimed, till the round ends: nothing the page sees moving for a while, the Agent seems to have stopped (ticket 67).
  // What moves: the code coming in (watched by `watchStall`), the ring, and each `done` and `finish` asking the page.
  const [stalled, setStalled] = useState(false);
  const stall = useRef<StallWatch | null>(null);
  useEffect(() => {
    if (!isClaimed) return;
    const watch = watchStall(window, setStalled);
    stall.current = watch;
    return () => {
      watch.stop();
      stall.current = null;
      setStalled(false);
    };
  }, [isClaimed]);
  const moves = claimed && [applied.map((change) => change.id).join(), claimed.done.join(), claimed.check?.key, claimed.closing?.key].join("|");
  useEffect(() => stall.current?.moved(), [moves]);
  /** Ends a claimed round as it is: pressing and holding the toggle, or the notice that the Agent seems to have stopped. */
  const endRound = () => store?.unlock().catch((error: unknown) => console.warn(error));

  const lastStatus = useRef(status);
  useEffect(
    () =>
      store?.watch((next) => {
        // Claimed: the round is what the Agent got. Ended: what is left of it, carried over to the next round (ticket 68); nothing with all of it applied.
        if (lastStatus.current && lastStatus.current.status !== next.status) void load();
        lastStatus.current = next;
        setStatus(next);
      }),
    [],
  );
  const ready = round !== undefined && status !== undefined && breakpoints !== undefined && offCanvas !== undefined;
  /** Whether the shell was up at the last render: before that, there is no canvas to leave. */
  const shellShown = useRef(false);
  // Claimed: the canvas is out of date as the code changes, so editing stops.
  useEffect(() => {
    if (!claimed || mode !== "edit") return;
    setAnimate(true);
    setMode(shellShown.current ? "leaving" : "preview");
  }, [claimed !== null, mode]);

  /** The round as saved last: what a reading that ends after the canvas has gone is saved into. */
  const roundNow = useRef(round);
  roundNow.current = round;
  const save = (next: SavedRound | null) => {
    // The service keeps a claimed round as the Agent got it; a last edit, too late, goes with the canvas.
    if (lastStatus.current?.status === "claimed") return;
    roundNow.current = next;
    setRound(next);
    store?.save(next).catch((error: unknown) => console.warn(error));
  };

  // What the page shows in each part of the range of a change saved with that yet to be read (ticket 65): read
  // one change after another, whether edit mode is up, going, or over, or the page has been opened since. `claim`
  // waits for it. Not once claimed: the code is the Agent's to change from then on.
  const [partsReader] = useState(() => createPartsReader(document, copiesIn, () => lastStatus.current?.status !== "claimed"));
  const partsRead = (id: number, parts: RangePart[] | null) => {
    if (lastStatus.current?.status === "claimed") return;
    if (control.current) return control.current.partsRead(id, parts);
    const now = roundNow.current;
    if (!now?.changeSet.changes.some((change) => change.id === id && change.parts === null)) return;
    const next = withPartsRead(now, id, parts);
    // The same round, read further: the undos made from the change list still hold.
    for (const step of [...listSteps.current.past, ...listSteps.current.future]) {
      if (step.before === now) step.before = next;
      if (step.after === now) step.after = next;
    }
    save(next);
  };
  useEffect(() => {
    // Not till the local service has said how the round stands: it may be claimed.
    if (!round || !status || claimed || breakpoints === undefined) return;
    const project = breakpoints ?? readMediaBreakpoints(document);
    for (const change of round.changeSet.changes) if (change.parts === null) partsReader.read(change, project, (parts) => partsRead(change.id, parts));
  }, [round, status?.status, breakpoints]);
  const saveOffCanvas = (layers: SavedOffCanvasLayer[]) => {
    setOffCanvas(layers);
    return (
      store?.saveOffCanvas(layers).catch((error: unknown) => {
        console.warn(error);
        return {};
      }) ?? Promise.resolve({})
    );
  };
  /**
   * From the change list. With no canvas up, the saved canvas is changed and
   * saved at once; a layer it moved off the canvas is back on it, and so no
   * longer off it; one it put back is off it again.
   */
  const revert = (id: number) => {
    if (control.current) control.current.revert(id);
    else if (round && offCanvas) {
      const next = revertSaved(round, id);
      const outside = offCanvasWithout(offCanvas, withDependents(round.changeSet.changes, id));
      listSteps.current.past.push({ before: round, after: next, offCanvasBefore: offCanvas, offCanvasAfter: outside });
      listSteps.current.future = [];
      save(next);
      if (outside !== offCanvas) saveOffCanvas(outside);
    }
  };
  /** Undoes (or redoes) the latest undo made from the list, when the saved round is still where it left it. */
  const replayList = (redo: boolean) => {
    const { past, future } = listSteps.current;
    const step = (redo ? future : past).at(-1);
    if (!step || round !== (redo ? step.before : step.after)) {
      listSteps.current = { past: [], future: [] };
      return;
    }
    (redo ? future : past).pop();
    (redo ? past : future).push(step);
    save(redo ? step.after : step.before);
    const outside = redo ? step.offCanvasAfter : step.offCanvasBefore;
    if (outside !== offCanvas) saveOffCanvas(outside);
  };
  const discard = () => {
    setListOpen(false);
    if (control.current) control.current.discard();
    else if (offCanvas && round) {
      const outside = offCanvasWithout(offCanvas, round.changeSet.changes);
      if (outside !== offCanvas) saveOffCanvas(outside);
    }
    setLive(null);
    save(null);
    // The canvas goes with the round: back to the page, which edit mode freezes afresh.
    if (mode === "edit") setMode(shellShown.current ? "leaving" : "preview");
  };

  const listed = claimed ? pending : (live ?? changes);

  // A shell already up folds away once claimed; none starts while claimed.
  shellShown.current = mode !== "preview" && ready && (shellShown.current || !claimed);
  /** Into edit mode, or back out of it: a click animates, a key press switches at once. A click while leaving turns back. */
  const switchMode = (animate: boolean) => {
    setAnimate(animate);
    if (mode === "preview") performance.mark(ENTER_MARK);
    setMode(mode === "edit" ? (animate ? "leaving" : "preview") : "edit");
  };
  // With no canvas up, the list stays open once its last change is undone: ⌘Z can bring it back.
  const list = listOpen && (listed.length > 0 || (!shellShown.current && listSteps.current.past.length > 0)) && (
    <ChangeList
      changes={listed}
      readOnly={!!claimed}
      onRevert={revert}
      // In edit mode ⌘Z is the canvas's already, list undos included.
      onUndo={shellShown.current ? undefined : () => replayList(false)}
      onRedo={shellShown.current ? undefined : () => replayList(true)}
      onDiscard={discard}
      onClose={() => setListOpen(false)}
    />
  );
  // In edit mode, the way back and the changes so far sit beside the Design panel's title, in place of the toggle.
  const editing = mode === "edit" && shellShown.current;

  // In edit mode, with the round not claimed, the code changing under the canvas pauses editing (ticket 66). A file the
  // page does not use brings nothing in; a claim, as the Agent applies the round, folds edit mode away instead. The
  // Agent may claim and edit at once, before the page hears of the claim: the local service is asked how the round stands.
  const unclaimed = editing && !claimed;
  useEffect(() => {
    if (!unclaimed) return setPaused(false);
    let watching = true;
    const waits: (() => void)[] = [];
    const stop = watchCodeChanges(window, () => {
      const asked = store ? store.status().catch(() => lastStatus.current) : Promise.resolve(lastStatus.current);
      void asked.then((status) => {
        // A press under way ends first, as the designer meant it: what it does is an edit made before the pause.
        if (watching && status?.status !== "claimed") waits.push(whenLetGo(() => setPaused(true)));
      });
    });
    return () => {
      watching = false;
      stop();
      for (const callOff of waits) callOff();
    };
  }, [unclaimed]);
  return (
    <>
      {shellShown.current && (
        <Shell
          // Only while in edit mode: leaving, the toggle is back with its badge.
          controls={
            editing && (
              <>
                {listed.length > 0 && (
                  <button
                    type="button"
                    class="vk-count"
                    data-vk-changes-opener=""
                    aria-label={`${listed.length} ${listed.length === 1 ? "change" : "changes"} not applied yet`}
                    aria-haspopup="dialog"
                    aria-expanded={listOpen}
                    onClick={() => setListOpen(!listOpen)}
                  >
                    {listed.length}
                  </button>
                )}
                <button
                  type="button"
                  class="vk-icon-button"
                  aria-label="Vernier Kit: back to preview mode"
                  title="Back to preview mode"
                  onClick={(event) => switchMode(event.detail > 0)}
                >
                  <Icon name="close" />
                </button>
                {list}
              </>
            )
          }
          saved={round!}
          offCanvas={offCanvas!}
          breakpoints={breakpoints!}
          onSave={save}
          onSaveOffCanvas={saveOffCanvas}
          onChanges={setLive}
          control={control}
          paused={unclaimed && paused}
          leaving={mode === "leaving"}
          animate={animate}
          onLeft={() => {
            setMode("preview");
            setLive(null);
          }}
        />
      )}
      {unclaimed && paused && (
        <CodeChangeNotice
          onKeepEditing={() => setPaused(false)}
          onBackToPreview={(animate) => {
            setPaused(false);
            switchMode(animate);
          }}
        />
      )}
      {!editing && (
        <Toggle
          changeCount={listed.length}
          changesOpen={listOpen && listed.length > 0}
          onShowChanges={() => setListOpen(!listOpen)}
          applying={claimed && { done: applied.length, total: changes.length }}
          onUnlock={endRound}
          onToggle={switchMode}
          // Edit mode has been asked for, and the canvas is not up yet: what it needs is still loading.
          busy={mode === "edit" && !ready}
        >
          {list}
          {/* Not over the change list, opened from the badge to look at what is left. */}
          {claimed && stalled && !list && <StalledNotice onKeepWaiting={() => stall.current?.moved()} onEndRound={endRound} />}
        </Toggle>
      )}
    </>
  );
}

