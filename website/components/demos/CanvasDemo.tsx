"use client";

import { Icon } from "@/components/editor/Icon";
import { Cursor, EASE, Handles, Window } from "./parts";
import { usePhases } from "./usePhases";

/** Phases: loose layers; a marquee selects them; ⇧A; they become a Stack; hold. */
const DURATIONS = [1300, 1000, 900, 1700, 1500];

const LOOSE = [
  { x: 24, y: 26 },
  { x: 196, y: 120 },
  { x: 56, y: 206 },
];
const STACKED = [
  { x: 112, y: 40 },
  { x: 112, y: 124 },
  { x: 112, y: 158 },
];

/** Edit on the canvas: three loose layers, selected and made a Stack with ⇧A. */
export function CanvasDemo() {
  const { ref, phase } = usePhases(DURATIONS, 3);
  const selected = phase >= 1;
  const stacked = phase >= 3;
  const at = stacked ? STACKED : LOOSE;
  const cursor = phase === 0 ? { x: 290, y: 250 } : phase === 1 ? { x: 318, y: 262 } : phase === 2 ? { x: 318, y: 262 } : { x: 300, y: 232 };

  return (
    <div ref={ref} className="absolute inset-0">
      <Window className="inset-x-[8%] top-[13%] bottom-[13%]">
        <div className="flex h-8 items-center justify-between border-b border-[var(--ed-border)] px-3">
          <span className="flex items-center gap-1.5 font-medium">
            <Icon name={stacked ? "stack-vertical" : "frame"} size={12} />
            {stacked ? "Stack" : selected ? "3 layers" : "Frame"}
          </span>
          <span className="text-[var(--ed-muted)]">Desktop 1280</span>
        </div>
        <div className="absolute inset-x-0 top-8 bottom-0 bg-[var(--ed-canvas)] p-3">
          <div className="relative size-full overflow-hidden bg-neutral-50 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]">
            {/* The Stack the three become. */}
            <div
              className="absolute"
              style={{ left: 100, top: 28, width: 164, height: 168, outline: "1px solid var(--color-blue-500)", opacity: stacked ? 1 : 0, transition: `opacity 200ms ${stacked ? "300ms" : "0ms"}` }}
            >
              <Handles />
              <span className="absolute -top-5 left-0 rounded-[3px] bg-blue-500 px-1 text-[10px] leading-4 text-white">Stack</span>
            </div>

            <Layer at={at[0]} selected={selected && !stacked} className="h-[72px] w-[140px] rounded-[8px] bg-gradient-to-br from-blue-200 to-purple-200" />
            <Layer at={at[1]} selected={selected && !stacked} className="flex h-[22px] w-[140px] items-center text-[18px] font-bold tracking-[-0.03em] text-neutral-900">
              Harbor
            </Layer>
            <Layer at={at[2]} selected={selected && !stacked} className="flex h-[26px] w-[96px] items-center justify-center rounded-[6px] bg-neutral-900 text-[11px] font-semibold text-white">
              Get started
            </Layer>

            {/* The marquee. */}
            <div
              className="absolute border border-blue-500 bg-blue-500/10"
              style={{
                left: 14,
                top: 16,
                width: phase === 1 || phase === 2 ? 304 : 0,
                height: phase === 1 || phase === 2 ? 246 : 0,
                opacity: phase === 1 ? 1 : 0,
                transition: phase === 1 ? `width 800ms ${EASE}, height 800ms ${EASE}` : "opacity 150ms",
              }}
            />
          </div>
        </div>
        <Cursor x={cursor.x} y={cursor.y} pressed={phase === 1} duration={phase === 1 ? 800 : 700} />
      </Window>

      {/* ⇧A, pressed. */}
      <div
        className="absolute bottom-[5%] left-1/2 flex -translate-x-1/2 gap-1 transition-[opacity,translate] duration-300"
        style={{ opacity: phase === 2 || phase === 3 ? 1 : 0, translate: phase === 2 || phase === 3 ? "0 0" : "0 6px" }}
      >
        {["⇧", "A"].map((k) => (
          <kbd
            key={k}
            className="grid h-7 min-w-7 place-items-center rounded-[6px] bg-white px-1.5 font-editor text-[13px] text-neutral-800 shadow-[0_1px_0_1px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.15)] transition-transform"
            style={{ transform: phase === 2 ? "translateY(1px)" : undefined }}
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function Layer({ at, selected, className, children }: { at: { x: number; y: number }; selected: boolean; className: string; children?: React.ReactNode }) {
  return (
    <div className={`absolute ${className}`} style={{ left: at.x, top: at.y, outline: selected ? "1px solid var(--color-blue-500)" : "1px solid transparent", transition: `left 600ms ${EASE}, top 600ms ${EASE}, outline-color 150ms` }}>
      {children}
    </div>
  );
}
