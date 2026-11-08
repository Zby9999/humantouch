/** @jsxImportSource preact */
import { STALL_MS } from "./agent-stall";

/** What the bench and the tests find this notice by (`data-tk-notice`), whatever its words. */
export const STALLED_NOTICE = "stalled";

interface Props {
  /** The Agent has the whole while again; the notice goes till then. */
  onKeepWaiting(): void;
  /** Ends the round as it is: what pressing and holding the toggle does. */
  onEndRound(): void;
}

/**
 * On the locked toggle, once nothing the page can see has moved for a while
 * (ticket 67): the Agent seems to have stopped. It goes by itself as the Agent
 * moves again. It takes no focus: the designer may be at work on the page.
 */
export function StalledNotice({ onKeepWaiting, onEndRound }: Props) {
  return (
    <div class="tk-notice tk-stalled" role="alert" data-tk-notice={STALLED_NOTICE} aria-labelledby="tk-stalled-title" aria-describedby="tk-stalled-text">
      <h2 id="tk-stalled-title" class="tk-notice-title">
        Your Agent seems to have stopped
      </h2>
      <p id="tk-stalled-text" class="tk-notice-text">
        Nothing has changed in {Math.floor(STALL_MS / 60_000)} minutes: tell it “Continue applying my design changes”, or end this round.
      </p>
      <div class="tk-changes-actions">
        <button type="button" class="tk-button" onClick={onEndRound}>
          End this round
        </button>
        <button type="button" class="tk-button is-primary" onClick={onKeepWaiting}>
          Keep waiting
        </button>
      </div>
    </div>
  );
}
