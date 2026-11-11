/** Pieces the demos share, drawn as the editor draws them. */

export const EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** A floating editor surface on the backdrop. */
export function Window({ className = "", style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      className={`ht-ed absolute overflow-hidden rounded-[10px] bg-[var(--ed-panel)] font-editor text-[11px] leading-4 text-[var(--ed-text)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.25),0_16px_48px_-8px_rgb(0_0_0/0.55)] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** The four white squares at a selected layer's corners. */
export function Handles({ color = "var(--color-blue-500)" }: { color?: string }) {
  return (
    <>
      {["-left-[3px] -top-[3px]", "-right-[3px] -top-[3px]", "-left-[3px] -bottom-[3px]", "-right-[3px] -bottom-[3px]"].map((at) => (
        <span key={at} className={`absolute ${at} size-1.5 bg-white`} style={{ boxShadow: `inset 0 0 0 1px ${color}` }} />
      ))}
    </>
  );
}

/** The pointer, as the system draws it. */
export function Cursor({ x, y, pressed = false, duration = 700 }: { x: number; y: number; pressed?: boolean; duration?: number }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="pointer-events-none absolute z-20 drop-shadow-[0_1px_2px_rgb(0_0_0/0.35)]"
      style={{ left: x, top: y, transition: `left ${duration}ms ${EASE}, top ${duration}ms ${EASE}, scale 120ms`, scale: pressed ? 0.9 : 1 }}
    >
      <path d="M2 1.5 L2 14.5 L5.6 11.2 L8 16.5 L10.4 15.4 L8.1 10.3 L13 10.3 Z" fill="#0a0a09" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Human Touch's toggle: 28px, white, a pencil; while the Agent applies, a ring round it fills. */
export function Toggle({ progress, ring }: { progress: number; ring: boolean }) {
  return (
    <div className="relative size-9">
      <svg viewBox="0 0 36 36" className="absolute inset-0 transition-opacity duration-300" style={{ opacity: ring ? 1 : 0 }} aria-hidden="true">
        <rect x="3.25" y="3.25" width="29.5" height="29.5" rx="6.75" fill="none" strokeWidth="1.5" stroke="rgb(30 30 30 / 0.16)" pathLength={1} />
        <rect
          x="3.25"
          y="3.25"
          width="29.5"
          height="29.5"
          rx="6.75"
          fill="none"
          strokeWidth="1.5"
          stroke="#0d99ff"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - progress}
          style={{ transition: `stroke-dashoffset 240ms ${EASE}` }}
        />
      </svg>
      <div className="absolute inset-1 grid place-items-center rounded-[6px] bg-white text-neutral-600 shadow-[0_1px_1px_rgb(0_0_0/0.15),0_0_0_0.5px_rgb(0_0_0/0.15)]" style={{ color: ring ? "rgb(82 83 81 / 0.5)" : undefined }}>
        <svg width="13.5" height="13.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M13.05 5.15a.55.55 0 0 0-2.19-2.19L3.51 10.3a1.1 1.1 0 0 0-.27.46l-.73 2.39a.28.28 0 0 0 .34.34l2.39-.73a1.1 1.1 0 0 0 .46-.27zM9.65 4.15l2.2 2.2" />
        </svg>
      </div>
    </div>
  );
}
