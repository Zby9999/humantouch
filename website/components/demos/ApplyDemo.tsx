"use client";

import { EASE, Toggle, Window } from "./parts";
import { usePhases } from "./usePhases";

/** Phases: the designer asks; the Agent claims; 1, 2, 3 show on the page; the report; hold. */
const DURATIONS = [1300, 900, 700, 700, 700, 2600];

/** Apply: one sentence to the Agent, the ring on the toggle fills as each change shows, then the report. */
export function ApplyDemo() {
  const { ref, phase } = usePhases(DURATIONS, 5);
  const claimed = phase >= 1;
  const shown = Math.min(Math.max(phase - 1, 0), 3);
  const report = phase >= 5;

  return (
    <div ref={ref} className="absolute inset-0">
      {/* The conversation with the Agent. */}
      <Window className="top-[8%] left-[7%] w-[58%] p-3">
        <div className="flex flex-col gap-2 text-[11px] leading-[1.45]">
          <p className="self-end rounded-[10px] rounded-br-[3px] bg-neutral-800 px-2.5 py-1.5 text-white dark:bg-neutral-600">Apply my design changes</p>
          <div className="flex flex-col gap-1 transition-opacity duration-300" style={{ opacity: claimed ? 1 : 0 }}>
            {[
              ["npx humantouch claim", claimed],
              ["npx humantouch done 1 2", shown >= 2],
              ["npx humantouch done 3", shown >= 3],
              ["npx humantouch finish", report],
            ].map(([line, on]) => (
              <code key={String(line)} className="font-mono text-[10px] text-[var(--ed-muted)] transition-opacity duration-200" style={{ opacity: on ? 1 : 0 }}>
                <span className="text-blue-500">›</span> {line}
              </code>
            ))}
          </div>
          <div className="grid transition-[grid-template-rows,opacity] duration-500" style={{ gridTemplateRows: report ? "1fr" : "0fr", opacity: report ? 1 : 0, transitionTimingFunction: EASE }}>
            <div className="overflow-hidden">
              <div className="mt-1 flex flex-col gap-1 border-t border-[var(--ed-border)] pt-2">
                <p className="font-medium">✓ Applied</p>
                <p className="text-[var(--ed-muted)]">1. Fill: the cards, white → blue-100</p>
                <p className="text-[var(--ed-muted)]">2. Corner radius: the cards, 8 → 24 on Phone</p>
                <p className="mt-1 font-medium">⚠️ Not applied 1:1</p>
                <p className="text-[var(--ed-muted)]">3. Font: the Badge, set by the component library</p>
              </div>
            </div>
          </div>
        </div>
      </Window>

      {/* The page, and its toggle locked with the ring filling. */}
      <div className="absolute right-[7%] bottom-[8%] w-[46%] bg-neutral-50 p-2.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.3),0_12px_32px_-8px_rgb(0_0_0/0.55)]">
        <div className="mb-2 h-2.5 w-1/2 rounded-[1px] bg-neutral-800" />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-10 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]"
              style={{ background: shown >= 1 ? "#DAECFF" : "#FFFFFF", borderRadius: shown >= 2 ? 8 : 3, transition: `background-color 400ms ${EASE}, border-radius 400ms ${EASE}` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-end">
          <Toggle progress={shown / 3} ring={claimed && !report} />
        </div>
      </div>
    </div>
  );
}
