import { loadFont } from "@remotion/google-fonts/Geist";
import { CameraMotionBlur } from "@remotion/motion-blur";
import type React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { Icon } from "@/components/editor/Icon";
import { ACME_COLORS } from "@/components/editor/model";
import { STEPS, TAILWIND_RAMPS } from "@/components/editor/tailwind-variables";
import { VariablesPanel } from "@/components/editor/VariablesPanel";

/*
 * The Variables card's video (designer, 2026-11-11): a close-up of the Design panel in 3D. The panel rises from below;
 * then each color drops onto it like a piece onto a board, the project's first, then Tailwind's row by row, till it is
 * the Variables as the panel shows them. Shallow depth of field (sharp in a band across the middle) and motion blur.
 * Render from website/: `npx remotion render Variables public/videos/variables.mp4`.
 */

const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });

/** The card's fill behind the demo, light (`--sunk`). */
const BACKDROP = "#a0a19f";
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** The camera at its closest; see the Brief video. */
const CLOSEST = 2.12;

/** When each color's piece sets off, in frames: the project's in turn, then Tailwind's along each row, row by row. */
const PROJECT_START = 20;
const TAILWIND_START = 38;
const order = new Map<string, number>([
  ...ACME_COLORS.map((c, i) => [c.name, PROJECT_START + i * 3] as [string, number]),
  ...TAILWIND_RAMPS.flatMap(([ramp], r) => STEPS.map((step, c) => [`${ramp}-${step}`, TAILWIND_START + r * 4 + c * 1.1] as [string, number])),
]);
/** How long a piece takes to fall, in frames; its bounce after. */
const FALL = 11;
const BOUNCE = 7;

/** A piece `t` frames after it set off: high and large, falling faster and faster, a small bounce as it lands. */
function pieceStyle(t: number): React.CSSProperties {
  if (t < 0) return { opacity: 0 };
  const h = t < FALL ? 1 - (t / FALL) ** 2 : t < FALL + BOUNCE ? 0.1 * Math.sin((Math.PI * (t - FALL)) / BOUNCE) : 0;
  return {
    opacity: Math.min(1, t / 3),
    scale: `${1 + 0.9 * h}`,
    translate: `0 ${-46 * h}px`,
    filter: `blur(${(1.6 * h).toFixed(2)}px) drop-shadow(0 ${(1 + 10 * h).toFixed(1)}px ${(1.5 + 12 * h).toFixed(1)}px rgb(0 0 0 / ${(0.26 - 0.12 * h).toFixed(3)}))`,
  };
}

/** The panel on the board, the pieces as they are at `frame`. */
const Stage: React.FC<{ frame: number }> = ({ frame }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ perspective: 2200, perspectiveOrigin: "50% 30%" }}>
      <div
        className="ht-shell"
        style={{
          position: "absolute",
          inset: "auto",
          // Left of the middle: tilted and turned, the panel leans right; so it is centred in a card cut narrow.
          left: "40%",
          // In its own zoomed pixels: 70 on screen.
          top: 70 / CLOSEST,
          transformOrigin: "50% 0",
          display: "block",
          background: "none",
          // The camera: the panel tilted away and turned, close; drifting in a little over the clip. Only ever scaled
          // down: the panel is laid out at the closest (`zoom`), so its text is drawn sharp, not a small one scaled up.
          transform: `translateX(-50%) rotateX(34deg) rotateZ(-12deg) scale(${interpolate(frame, [0, durationInFrames], [2.0, CLOSEST]) / CLOSEST})`,
          zoom: CLOSEST,
          ["--ht-icon-size" as string]: "13.5px",
          ["--ht-icon-stroke" as string]: "1.05px",
          ["--font-geist" as string]: fontFamily,
        }}
      >
        <aside
          className="ht-panel is-design"
          aria-label="Design"
          style={{
            position: "relative",
            width: 320,
            height: 760,
            overflow: "hidden",
            borderRadius: 12,
            boxShadow: "0 1px 1px rgb(0 0 0 / 0.15), 0 0 0 0.5px rgb(0 0 0 / 0.15), 0 40px 90px -20px rgb(0 0 0 / 0.5)",
            // Risen from below the frame.
            translate: `0 ${interpolate(frame, [0, 24], [620, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_OUT })}px`,
            opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          <div className="ht-panel-header" style={{ paddingTop: 16 }}>
            <h2 className="ht-panel-title">Variables</h2>
            <button type="button" className="ht-icon-button" aria-label="Back to preview mode">
              <Icon name="close" />
            </button>
          </div>
          <VariablesPanel piece={(name) => pieceStyle(frame - (order.get(name) ?? 400))} />
        </aside>
      </div>
    </AbsoluteFill>
  );
};

/** The stage at this frame, or at a sample between frames as the motion blur takes them. */
const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Shallow depth of field: the stage sharp in a band across the frame's middle, out of focus above and below it.
  const band = "linear-gradient(to bottom, transparent 0%, #000 24%, #000 66%, transparent 100%)";
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [durationInFrames - 18, durationInFrames - 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <AbsoluteFill style={{ filter: "blur(6px)" }}>
        <Stage frame={frame} />
      </AbsoluteFill>
      <AbsoluteFill style={{ maskImage: band, WebkitMaskImage: band }}>
        <Stage frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Motion blur by the DOM's own copies at moments between frames (`CameraMotionBlur`): HTML-in-canvas, Remotion's first
 * choice, does not render on this Mac (macOS 14). Each copy carries the backdrop, so they average cleanly.
 */
export const VariablesVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <style>{EDITOR_CSS}</style>
      <CameraMotionBlur samples={6} shutterAngle={180}>
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, #aaabaa 0%, ${BACKDROP} 55%, #8e8f8d 100%)` }}>
          <Scene />
        </AbsoluteFill>
      </CameraMotionBlur>
    </AbsoluteFill>
  );
};
