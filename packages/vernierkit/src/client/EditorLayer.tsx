/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RoundStatus, SavedRound } from "../service-protocol";
import { ENTER_MARK } from "./CanvasView";
import { ChangeList } from "./ChangeList";
import type { ProjectBreakpoints } from "./breakpoints";
import type { Change } from "./changeset";
import { checkChange, pageAt } from "./check";
import { Icon } from "./icons";
import { revertSaved } from "./saved-round";
import { connectRoundStore } from "./service";
import { Shell, type RoundControl } from "./Shell";
import { Toggle } from "./Toggle";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

/** An undo made from the change list with no canvas up: the saved round before it, and after. */
interface ListStep {
  before: SavedRound | null;
  after: SavedRound | null;
}

/**
 * Preview mode shows only the toggle; edit mode adds the shell around the
 * canvas. A round with changes not yet applied keeps its canvas: edit mode
 * comes back to it, after a reload too. With none, edit mode freezes the page afresh.
 * The page always shows the code as it is: the changes are seen on the canvas,
 * played at full size (ADR 0010). Once the Agent claims the round, the editor
 * folds into the toggle, locked until the round ends, and each change it
 * applies is checked on the page. The toggle's badge opens the change list, where changes
 * are undone one by one, or all discarded, in either mode.
 */
export function EditorLayer() {
  const [mode, setMode] = useState<Mode>("preview");
  const [animate, setAnimate] = useState(true);
  const [store] = useState(connectRoundStore);
  /** The project's breakpoints from its Tailwind theme, as the local service reads them; undefined until it has said. */
  const [breakpoints, setBreakpoints] = useState<ProjectBreakpoints | null | undefined>(store ? undefined : null);
  /** Undefined until the saved round, if any, has loaded. */
  const [round, setRound] = useState<SavedRound | null | undefined>(store ? undefined : null);
  /** Changes not yet applied, for the toggle's badge: the canvas's as of its last edit while edit mode is up, else the saved round's. */
  const [live, setLive] = useState<Change[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  /**
   * Undos made from the change list with no canvas up, for ⌘Z / ⇧⌘Z in the
   * list to undo and redo. They hold only while the saved round is the one
   * they left: once anything else saves it, they are dropped.
   */
  const listSteps = useRef<{ past: ListStep[]; future: ListStep[] }>({ past: [], future: [] });
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
    void load();
    store?.breakpoints().then(setBreakpoints, (error: unknown) => {
      console.warn(error);
      setBreakpoints(null);
    });
  }, []);

  const changes = round?.changeSet.changes ?? [];
  /** Not applied yet. */
  const pending = claimed ? changes.filter((change) => !claimed.done.includes(change.id)) : changes;

  // A done change is checked on the page as it is.
  // A layout effect: an effect would wait for a frame, which a background tab may not draw for a while.
  const checked = useRef<string | null>(null);
  const check = claimed?.check;
  useLayoutEffect(() => {
    if (!check || !store || round === undefined || checked.current === check.at) return;
    checked.current = check.at;
    const change = round?.changeSet.changes.find((c) => c.id === check.id);
    const result = change ? checkChange(document, change, pageAt(window)) : Promise.resolve({ outcome: "unchecked", reason: "the page does not have this round" } as const);
    void result.then((result) => store.report({ ...check, ...result })).catch((error: unknown) => console.warn(error));
  }, [check?.at, round]);

  const lastStatus = useRef(status);
  useEffect(
    () =>
      store?.watch((next) => {
        // Claimed: the round is what the Agent got. Ended: what is left of it, nothing once archived.
        if (lastStatus.current && lastStatus.current.status !== next.status) void load();
        lastStatus.current = next;
        setStatus(next);
      }),
    [],
  );
  const ready = round !== undefined && status !== undefined && breakpoints !== undefined;
  /** Whether the shell was up at the last render: before that, there is no canvas to leave. */
  const shellShown = useRef(false);
  // Claimed: the canvas is out of date as the code changes, so editing stops.
  useEffect(() => {
    if (!claimed || mode !== "edit") return;
    setAnimate(true);
    setMode(shellShown.current ? "leaving" : "preview");
  }, [claimed !== null, mode]);

  const save = (next: SavedRound | null) => {
    // The service keeps a claimed round as the Agent got it; a last edit, too late, goes with the canvas.
    if (lastStatus.current?.status === "claimed") return;
    setRound(next);
    store?.save(next).catch((error: unknown) => console.warn(error));
  };
  /** From the change list. With no canvas up, the saved canvas is changed and saved at once. */
  const revert = (id: number) => {
    if (control.current) control.current.revert(id);
    else if (round) {
      const next = revertSaved(round, id);
      listSteps.current.past.push({ before: round, after: next });
      listSteps.current.future = [];
      save(next);
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
  };
  const discard = () => {
    setListOpen(false);
    control.current?.discard();
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
          breakpoints={breakpoints!}
          onSave={save}
          onChanges={setLive}
          control={control}
          leaving={mode === "leaving"}
          animate={animate}
          onLeft={() => {
            setMode("preview");
            setLive(null);
          }}
        />
      )}
      {!editing && (
        <Toggle
          changeCount={listed.length}
          changesOpen={listOpen && listed.length > 0}
          onShowChanges={() => setListOpen(!listOpen)}
          applying={claimed && { done: claimed.done.length, total: changes.length }}
          onUnlock={() => store?.unlock().catch((error: unknown) => console.warn(error))}
          onToggle={switchMode}
        >
          {list}
        </Toggle>
      )}
    </>
  );
}

