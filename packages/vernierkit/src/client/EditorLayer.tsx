/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { SavedRound } from "../service-protocol";
import { ENTER_MARK } from "./CanvasView";
import { canPreview, startChangePreview } from "./change-preview";
import { PreviewSwitch } from "./PreviewSwitch";
import { connectRoundStore } from "./service";
import { Shell } from "./Shell";
import { Toggle } from "./Toggle";

/** `leaving`: back in preview mode, while the canvas grows back over the page. */
type Mode = "preview" | "edit" | "leaving";

const PREVIEW_KEY = "vernierkit:change-preview";

/**
 * Preview mode shows only the toggle; edit mode adds the shell around the
 * canvas. A round with changes not yet applied keeps its canvas: edit mode
 * comes back to it, after a reload too. With none, edit mode freezes the page afresh.
 * Meanwhile the page shows the round's changes, unless switched to how it is now.
 */
export function EditorLayer() {
  const [mode, setMode] = useState<Mode>("preview");
  const [animate, setAnimate] = useState(true);
  const [store] = useState(connectRoundStore);
  /** Undefined until the saved round, if any, has loaded. */
  const [round, setRound] = useState<SavedRound | null | undefined>(store ? undefined : null);
  /** Changes not yet applied, for the toggle's badge. */
  const [changeCount, setChangeCount] = useState(0);
  const [previewing, setPreviewing] = useState(readPreviewing);
  const [preview] = useState(() => startChangePreview(document));
  useEffect(() => () => preview.stop(), []);

  useEffect(() => {
    store?.load().then((saved) => {
      setRound(saved);
      setChangeCount(saved?.changeSet.changes.length ?? 0);
    }, (error: unknown) => {
      console.warn(error);
      setRound(null);
    });
  }, []);

  const changes = round?.changeSet.changes ?? [];
  // Before paint: a canvas leaving at once must find its changes on the page.
  useLayoutEffect(() => preview.show(previewing ? changes : []), [round, previewing]);

  const save = (next: SavedRound | null) => {
    setRound(next);
    store?.save(next).catch((error: unknown) => console.warn(error));
  };
  const switchPreview = (on: boolean) => {
    setPreviewing(on);
    writePreviewing(on);
  };

  return (
    <>
      {mode !== "preview" && round !== undefined && (
        <Shell
          saved={round}
          onSave={save}
          onChangeCount={setChangeCount}
          previewing={previewing}
          leaving={mode === "leaving"}
          animate={animate}
          onLeft={() => setMode("preview")}
        />
      )}
      <Toggle
        editing={mode === "edit"}
        changeCount={changeCount}
        onToggle={(animate) => {
          setAnimate(animate);
          if (mode === "preview") performance.mark(ENTER_MARK);
          // A click while leaving turns back to the same canvas.
          setMode(mode === "edit" ? (animate ? "leaving" : "preview") : "edit");
        }}
      >
        {mode !== "edit" && changes.length > 0 && (
          <PreviewSwitch on={previewing} onChange={switchPreview} unseen={changes.filter((change) => !canPreview(change)).length} />
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
