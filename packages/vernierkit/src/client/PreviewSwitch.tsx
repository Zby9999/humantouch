/** @jsxImportSource preact */
import type { TargetedKeyboardEvent } from "preact";

interface Props {
  /** The page shows the changes not yet applied (Changed), or the site as it is (Now). */
  on: boolean;
  onChange(on: boolean): void;
  /** Changes the page cannot show until they are applied. */
  unseen: number;
}

/** Beside the toggle in preview mode: compares the page with the changes and without. */
export function PreviewSwitch({ on, onChange, unseen }: Props) {
  // A radio group moves with the arrow keys.
  const onKeyDown = (event: TargetedKeyboardEvent<HTMLDivElement>) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
    event.preventDefault();
    onChange(!on);
    const next = event.currentTarget.querySelector<HTMLButtonElement>(`[aria-checked="${on ? "false" : "true"}"]`);
    next?.focus();
  };
  return (
    <div class="vk-preview">
      <div class="vk-segmented" role="radiogroup" aria-label="Change Preview" onKeyDown={onKeyDown}>
        <Segment label="Changed" checked={on} onSelect={() => onChange(true)} />
        <Segment label="Now" checked={!on} onSelect={() => onChange(false)} />
      </div>
      {on && unseen > 0 && (
        <p class="vk-preview-note">
          {unseen} {unseen === 1 ? "change shows" : "changes show"} once applied
        </p>
      )}
    </div>
  );
}

function Segment({ label, checked, onSelect }: { label: string; checked: boolean; onSelect(): void }) {
  return (
    <button type="button" role="radio" class="vk-segment" aria-checked={checked} tabIndex={checked ? 0 : -1} onClick={onSelect}>
      {label}
    </button>
  );
}
