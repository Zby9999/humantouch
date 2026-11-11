"use client";

import { Icon } from "@/components/editor/Icon";
import { EASE, Window } from "./parts";
import { usePhases } from "./usePhases";

/** Phases: as it is; Fill → blue-100 in Desktop (every view follows); radius 24 in Phone (Phone only); hold. */
const DURATIONS = [1400, 1800, 1800, 1400];

const VIEWS = [
  { name: "Desktop", w: 184, cols: 3 },
  { name: "Tablet", w: 120, cols: 2 },
  { name: "Phone", w: 64, cols: 1 },
] as const;

/** Every width at once: a change in the Design panel shows on all three views; one made in Phone stays there. */
export function DesignPanelDemo() {
  const { ref, phase } = usePhases(DURATIONS, 2);
  const fill = phase >= 1 ? "#DAECFF" : "#FFFFFF";
  const phoneRadius = phase >= 2 ? 10 : 3;
  const active = phase >= 2 ? "Phone" : "Desktop";

  return (
    <div ref={ref} className="absolute inset-0">
      {/* The three views. */}
      <div className="absolute top-[9%] left-[5%] flex items-start gap-3">
        {VIEWS.map((v) => (
          <div key={v.name} style={{ width: v.w }}>
            <p className={`mb-1 font-editor text-[10px] transition-colors ${active === v.name ? "text-white" : "text-white/55"}`}>{v.name}</p>
            <div className="flex flex-col gap-1.5 bg-neutral-50 p-1.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.3),0_8px_24px_-6px_rgb(0_0_0/0.5)]">
              <div className="h-2.5 w-1/2 rounded-[1px] bg-neutral-800" />
              <div className="h-1.5 w-3/4 rounded-[1px] bg-neutral-300" />
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${v.cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: v.cols === 1 ? 3 : 3 }, (_, i) => (
                  <div
                    key={i}
                    className="h-9 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]"
                    style={{
                      background: fill,
                      borderRadius: v.name === "Phone" ? phoneRadius : 3,
                      outline: i === 0 ? `1px solid ${active === v.name ? "var(--color-purple-600)" : "transparent"}` : undefined,
                      transition: `background-color 400ms ${EASE}, border-radius 400ms ${EASE}`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* The Design panel. */}
      <Window className="right-[6%] bottom-[8%] w-[208px]">
        <div className="flex h-8 items-center justify-between border-b border-[var(--ed-border)] px-3 font-medium">
          <span className="flex items-center gap-1.5">
            Design
            <span className="grid h-4 min-w-4 place-items-center rounded-[4px] bg-gradient-to-b from-blue-400 to-blue-500 px-1 text-[10px] text-blue-100 tabular-nums transition-opacity" style={{ opacity: phase >= 1 ? 1 : 0 }}>
              {phase >= 2 ? 2 : 1}
            </span>
          </span>
          <Icon name="close" size={12} />
        </div>
        <div className="flex items-center gap-1.5 border-b border-[var(--ed-border)] px-3 py-2 font-medium text-purple-600">
          <Icon name="instance" size={12} /> Card
          <span className="ml-auto font-normal text-[var(--ed-muted)]">{active === "Phone" ? "Phone only" : "Every width"}</span>
        </div>
        <div className="border-b border-[var(--ed-border)] px-3 py-2.5">
          <p className="mb-2 font-medium text-[var(--ed-title)]">Appearance</p>
          <div className={`flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 shadow-[var(--ed-input-shadow)] transition-colors ${phase >= 2 ? "bg-blue-100 dark:bg-blue-700" : "bg-[var(--ed-input)]"}`}>
            <Icon name="radius" size={12} className="text-[var(--ed-muted)]" />
            <span className="tabular-nums">{phase >= 2 ? 24 : 8}</span>
          </div>
        </div>
        <div className="px-3 py-2.5">
          <p className="mb-2 font-medium text-[var(--ed-title)]">Fill</p>
          <div className={`flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 shadow-[var(--ed-input-shadow)] transition-colors ${phase >= 1 ? "bg-blue-100 dark:bg-blue-700" : "bg-[var(--ed-input)]"}`}>
            <span className="size-3.5 rounded-[3px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.25)] transition-colors duration-300" style={{ background: fill }} />
            <span className="flex items-center gap-1">
              {phase >= 1 && <Icon name="variable" size={12} className="text-[var(--ed-muted)]" />}
              {phase >= 1 ? "blue-100" : "FFFFFF"}
            </span>
            <span className="ml-auto text-[var(--ed-muted)]">100%</span>
          </div>
        </div>
      </Window>
    </div>
  );
}
