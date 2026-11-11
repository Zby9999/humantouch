import { Icon } from "@/components/editor/Icon";
import { COLOR_VARIABLES } from "@/components/editor/model";

/** The pictures on the three small cards, drawn with the editor's parts. */

const SURFACE = "ht-ed absolute font-editor text-[11px] leading-4 text-[var(--ed-text)]";

/** A layer on the canvas, its Brief on a card beside it, a dashed line between them. */
export function BriefMini() {
  return (
    <div className={`${SURFACE} inset-0 bg-[#B7B8B9]`}>
      <div className="absolute top-[22%] left-[10%] w-[44%] bg-neutral-50 p-3 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]">
        <div className="mb-2 h-2 w-2/3 rounded-[1px] bg-neutral-800" />
        <div className="mb-3 h-1.5 w-full rounded-[1px] bg-neutral-300" />
        <div className="relative inline-flex rounded-[5px] bg-neutral-900 px-2.5 py-1 text-[10px] font-semibold text-white outline outline-1 outline-blue-500">Get started</div>
      </div>
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        <line x1="38%" y1="48%" x2="60%" y2="58%" stroke="var(--color-blue-500)" strokeDasharray="3 3" />
      </svg>
      <div className="absolute top-[50%] right-[8%] w-[44%] rounded-[8px] bg-[var(--ed-panel)] p-2.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_6px_20px_-6px_rgb(0_0_0/0.3)]">
        <p className="mb-1 flex items-center gap-1 font-medium">
          <Icon name="brief" size={12} /> Brief · Button
        </p>
        <p className="text-[var(--ed-muted)]">Pressed, it shrinks a little and springs back.</p>
      </div>
    </div>
  );
}

/** A view, and a layer moved off it, waiting beside it. */
export function OffCanvasMini() {
  return (
    <div className={`${SURFACE} inset-0 bg-[#A4AAAF]`}>
      <p className="absolute top-[10%] left-[8%] text-[var(--ed-muted)]">Desktop</p>
      <div className="absolute top-[17%] bottom-[12%] left-[8%] w-[48%] bg-neutral-50 p-3 shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]">
        <div className="mb-2 h-2 w-2/3 rounded-[1px] bg-neutral-800" />
        <div className="mb-3 h-1.5 w-full rounded-[1px] bg-neutral-300" />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="h-10 rounded-[3px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <div className="h-10 rounded-[3px] border border-dashed border-neutral-300" />
        </div>
      </div>
      <div className="absolute top-[40%] right-[9%] w-[26%]">
        <p className="mb-1 text-[var(--ed-muted)]">Off canvas</p>
        <div className="relative h-14 rounded-[3px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_6px_16px_-6px_rgb(0_0_0/0.3)] outline outline-1 outline-blue-500">
          <div className="m-2 h-1.5 w-2/3 rounded-[1px] bg-neutral-800" />
          <div className="mx-2 h-1 w-1/2 rounded-[1px] bg-neutral-300" />
        </div>
      </div>
    </div>
  );
}

/** The Design panel with nothing selected: the project's Variables. */
export function VariablesMini() {
  return (
    <div className={`${SURFACE} inset-0 bg-[#B4AEAA]`}>
      <div className="absolute inset-x-[14%] top-[10%] bottom-0 rounded-t-[10px] bg-[var(--ed-panel)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_6px_20px_-6px_rgb(0_0_0/0.3)]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[var(--ed-border)] px-3 font-medium">
          <Icon name="variable" size={12} /> Variables
        </div>
        <ul className="flex flex-col gap-1.5 p-3">
          {COLOR_VARIABLES.slice(0, 6).map((v) => (
            <li key={v.name} className="flex items-center gap-2">
              <span className="size-3.5 rounded-[3px] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" style={{ background: v.value }} />
              {v.name}
              <span className="ml-auto font-mono text-[10px] text-[var(--ed-muted)]">{v.value}</span>
            </li>
          ))}
          <li className="mt-1 flex items-center gap-2">
            <Icon name="gap" size={12} className="text-[var(--ed-muted)]" /> space-4
            <span className="ml-auto font-mono text-[10px] text-[var(--ed-muted)]">16</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
