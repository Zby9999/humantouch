/** @jsxImportSource preact */
import { STALL_MS } from "./agent-stall";

/** What the bench and the tests find this notice by (`data-ht-notice`), whatever its words. */
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
    <div class="ht-notice ht-stalled" role="alert" data-ht-notice={STALLED_NOTICE} aria-labelledby="ht-stalled-title" aria-describedby="ht-stalled-text">
      <h2 id="ht-stalled-title" class="ht-notice-title">
        Your Agent seems to have stopped
      </h2>
      <p id="ht-stalled-text" class="ht-notice-text">
        Nothing has changed in {Math.floor(STALL_MS / 60_000)} minutes: tell it “Continue applying my design changes”, or end this round.
      </p>
      <div class="ht-changes-actions">
        <button type="button" class="ht-button" onClick={onEndRound}>
          End this round
        </button>
        <button type="button" class="ht-button is-primary" onClick={onKeepWaiting}>
          Keep waiting
        </button>
      </div>
    </div>
  );
}
