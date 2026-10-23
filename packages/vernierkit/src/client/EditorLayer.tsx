/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { RoundStatus, SavedRound } from "../service-protocol";
import { ENTER_MARK } from "./CanvasView";
import { canPreview, startChangePreview } from "./change-preview";
import { ChangeList } from "./ChangeList";
import type { Change } from "./changeset";
import { checkChange } from "./check";
import { PreviewSwitch } from "./PreviewSwitch";
import { revertSaved } from "./saved-round";
import { connectRoundStore } from "./service";
import { Shell, type RoundControl } from "./Shell";
import { Toggle } from "./Toggle";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

const PREVIEW_KEY = "vernierkit:change-preview";

/**
 * Preview mode shows only the toggle; edit mode adds the shell around the
 * canvas. A round with changes not yet applied keeps its canvas: edit mode
 * comes back to it, after a reload too. With none, edit mode freezes the page afresh.
 * Meanwhile the page shows the round's changes, unless switched to how it is now.
 * Once the Agent claims the round, the editor folds into the toggle, locked
 * until the round ends, and each change it applies leaves the preview and is
 * checked on the page. The toggle's badge opens the change list, where changes
 * are undone one by one, or all discarded, in either mode.
 */
export function EditorLayer() {
  const [mode, setMode] = useState<Mode>("preview");
  const [animate, setAnimate] = useState(true);
  const [store] = useState(connectRoundStore);
  /** Undefined until the saved round, if any, has loaded. */
  const [round, setRound] = useState<SavedRound | null | undefined>(store ? undefined : null);
  /** Changes not yet applied, for the toggle's badge: the canvas's as of its last edit while edit mode is up, else the saved round's. */
  const [live, setLive] = useState<Change[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  /** The canvas, while edit mode is up: the change list works on it then. */
  const control = useRef<RoundControl | null>(null);
  const [previewing, setPreviewing] = useState(readPreviewing);
  const [preview] = useState(() => startChangePreview(document));
  useEffect(() => () => preview.stop(), []);

  /** Undefined until the local service has said: edit mode waits for it, as it may be claimed. */
  const [status, setStatus] = useState<RoundStatus | undefined>(store ? undefined : { status: "editing" });
  const claimed = status?.status === "claimed" ? status : null;

  const load = () =>
    store?.load().then(setRound, (error: unknown) => {
      console.warn(error);
      setRound(null);
    });
  useEffect(() => void load(), []);

  const changes = round?.changeSet.changes ?? [];
  /** Not applied yet: once the Agent has done a change, the page shows what the code makes of it. */
  const pending = claimed ? changes.filter((change) => !claimed.done.includes(change.id)) : changes;
  // Before paint: a canvas leaving at once must find its changes on the page.
  useLayoutEffect(() => preview.show(previewing ? pending : []), [round, previewing, status]);

  // A done change is checked once its preview is off, which the layout effect above has seen to.
  // A layout effect too: an effect would wait for a frame, which a background tab may not draw for a while.
  const checked = useRef<string | null>(null);
  const check = claimed?.check;
  useLayoutEffect(() => {
    if (!check || !store || round === undefined || checked.current === check.at) return;
    checked.current = check.at;
    const change = round?.changeSet.changes.find((c) => c.id === check.id);
    const result = change ? checkChange(document, change) : Promise.resolve({ outcome: "unchecked", reason: "the page does not have this round" } as const);
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
  const ready = round !== undefined && status !== undefined;
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
    else if (round) save(revertSaved(round, id));
  };
  const discard = () => {
    setListOpen(false);
    control.current?.discard();
    setLive(null);
    save(null);
    // The canvas goes with the round: back to the page, which edit mode freezes afresh.
    if (mode === "edit") setMode(shellShown.current ? "leaving" : "preview");
  };

  const switchPreview = (on: boolean) => {
    setPreviewing(on);
    writePreviewing(on);
  };

  const listed = claimed ? pending : (live ?? changes);

  // A shell already up folds away once claimed; none starts while claimed.
  shellShown.current = mode !== "preview" && ready && (shellShown.current || !claimed);
  return (
    <>
      {shellShown.current && (
        <Shell
          saved={round!}
          onSave={save}
          onChanges={setLive}
          control={control}
          previewing={previewing}
          leaving={mode === "leaving"}
          animate={animate}
          onLeft={() => {
            setMode("preview");
            setLive(null);
          }}
        />
      )}
      <Toggle
        editing={mode === "edit"}
        changeCount={listed.length}
        changesOpen={listOpen && listed.length > 0}
        onShowChanges={() => setListOpen(!listOpen)}
        applying={claimed && { done: claimed.done.length, total: changes.length }}
        onUnlock={() => store?.unlock().catch((error: unknown) => console.warn(error))}
        onToggle={(animate) => {
          setAnimate(animate);
          if (mode === "preview") performance.mark(ENTER_MARK);
          // A click while leaving turns back to the same canvas.
          setMode(mode === "edit" ? (animate ? "leaving" : "preview") : "edit");
        }}
      >
        {mode !== "edit" && pending.length > 0 && (
          <PreviewSwitch on={previewing} onChange={switchPreview} unseen={pending.filter((change) => !canPreview(change)).length} />
        )}
        {listOpen && listed.length > 0 && (
          <ChangeList changes={listed} readOnly={!!claimed} onRevert={revert} onDiscard={discard} onClose={() => setListOpen(false)} />
        )}
      </Toggle>
    </>
  );
}

function readPreviewing(): boolean {
  try {
    return localStorage.getItem(PREVIEW_KEY) !== "off";
  } catch {
    return true;
  }
}

function writePreviewing(on: boolean) {
  try {
    localStorage.setItem(PREVIEW_KEY, on ? "on" : "off");
  } catch {}
}
