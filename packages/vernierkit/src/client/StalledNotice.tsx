/** @jsxImportSource preact */
import { STALL_MS } from "./agent-stall";

/** What the bench and the tests find this notice by (`data-vk-notice`), whatever its words. */
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
    <div class="vk-notice vk-stalled" role="alert" data-vk-notice={STALLED_NOTICE} aria-labelledby="vk-stalled-title" aria-describedby="vk-stalled-text">
      <h2 id="vk-stalled-title" class="vk-notice-title">
        Your Agent seems to have stopped
      </h2>
      <p id="vk-stalled-text" class="vk-notice-text">
        For {Math.floor(STALL_MS / 60_000)} minutes, no change has shown on the page, no change was marked done, and the code has not changed. If your Agent has stopped, tell it
        “Continue applying my design changes”: it gets only those not applied yet. Or end this round as it is, as pressing and holding the toggle does.
      </p>
      <div class="vk-changes-actions">
        <button type="button" class="vk-button" onClick={onEndRound}>
          End this round
        </button>
        <button type="button" class="vk-button is-primary" onClick={onKeepWaiting}>
          Keep waiting
        </button>
      </div>
    </div>
  );
}
