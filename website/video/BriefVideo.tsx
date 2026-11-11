import { CameraMotionBlur } from "@remotion/motion-blur";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { DemoPage } from "@/components/editor/DemoPage";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { Icon } from "@/components/editor/Icon";
import { FONT_VARS, geist as fontFamily } from "./fonts";

/*
 * The Brief card's video (designer, 2026-11-11, option B): a 3D close-up of the canvas. On Acme's Phone view the button
 * is selected; the camera sets off from it along the brief's dashed line, drawn as it goes, to the card beside the
 * view, where the brief is typed and set with its arrow; then it draws back to show the button, the line and the card.
 * Shallow depth of field (sharp round the middle, where the camera looks) and motion blur.
 * Render from website/: `npx remotion render Brief public/videos/brief.mp4`.
 */

const BACKDROP = "#a0a19f";
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** The brief's line: the product's muted gray is lost on this darker backdrop, so drawn light, as the view's label is. */
const LINE = "rgb(255 255 255 / 0.85)";
/**
 * The camera at its closest. A 3D-transformed layer is drawn at its own size and then scaled, so a plane scaled up
 * comes out soft: the plane is laid out this much larger (CSS zoom) and the camera only ever scales it down.
 */
const CLOSEST = 3.3;
const BRIEF = "Pressed, it shrinks a little and springs back.";
/** The product's card: 220px wide, 40px off the view, on the side of the view its layer is on (brief-cards.ts). */
const CARD_WIDTH = 220;
const CARD_OFFSET = 40;
const VIEW_WIDTH = 390;

type Box = { x: number; y: number; width: number; height: number };

/** The button's box on the page, in the page's own pixels: offsets, which the camera's transforms leave alone. */
function useButton(page: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState<Box | null>(null);
  const [handle] = useState(() => delayRender("Measuring the button"));
  useLayoutEffect(() => {
    const measure = () => {
      const root = page.current!;
      let el = root.querySelector<HTMLElement>('[data-ht="button"]');
      const b = { x: 0, y: 0, width: el!.offsetWidth, height: el!.offsetHeight };
      while (el && el !== root) {
        b.x += el.offsetLeft;
        b.y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      setBox(b);
      continueRender(handle);
    };
    document.fonts.ready.then(measure);
  }, [page, handle]);
  return box;
}

/** The brief trimmed to its capitals and baseline, so the space above it looks the same as below it. */
const TRIM = { textBoxTrim: "trim-both", textBoxEdge: "cap alphabetic" } as React.CSSProperties;

/** The text field's caret; `before` the text it takes no room, so the placeholder stays where it is. */
function Caret({ on, width, before }: { on: boolean; width: number; before?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width,
        height: 13,
        marginLeft: before ? 0 : 1,
        marginRight: before ? -width : 0,
        verticalAlign: -2,
        background: "var(--ht-accent)",
        opacity: on ? 1 : 0,
      }}
    />
  );
}

const Stage: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const page = useRef<HTMLDivElement>(null);
  const button = useButton(page);
  const b = button ?? { x: 24, y: 360, width: 150, height: 48 };

  // The card: left of the view, its middle level with the button's, where the line runs straight between them.
  const lineY = b.y + b.height / 2;
  const card = { x: -CARD_OFFSET - CARD_WIDTH, y: lineY };
  const from = b.x;
  const to = card.x + CARD_WIDTH;

  // Where the camera looks, and how close: the button, along the line to the card, then back to see them all.
  const atButton = { x: b.x + b.width / 2, y: lineY };
  const atCard = { x: card.x + CARD_WIDTH / 2, y: lineY };
  const atAll = { x: (card.x + b.x + b.width) / 2, y: lineY - 20 };
  const along = interpolate(frame, [38, 98], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const back = interpolate(frame, [170, 192], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const look = {
    x: atButton.x + (atCard.x - atButton.x) * along + (atAll.x - atCard.x) * back,
    y: atButton.y + (atCard.y - atButton.y) * along + (atAll.y - atCard.y) * back,
  };
  const zoom = interpolate(frame, [0, 38, 98, 170, 192], [CLOSEST, 3.0, 2.9, 2.9, 1.75], { ...clamp, easing: EASE_IN_OUT });
  /**
   * A screen pixel, on the plane. The product draws its lines and handles at one screen pixel, whatever the zoom; the
   * video is seen at about a quarter of its size in the card, so they are drawn here at a few screen pixels, as wide
   * as the product's would look at the card's size.
   */
  const px = 1 / zoom;
  const hair = 2.5 * px;

  const drawn = interpolate(frame, [34, 70], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const typed = Math.round(interpolate(frame, [104, 160], [0, BRIEF.length], clamp));
  const writing = frame >= 70 && frame < 168;
  const caret = writing && Math.floor(frame / 14) % 2 === 0;
  const pressed = interpolate(frame, [160, 164, 168], [1, 0.86, 1], clamp);

  return (
    <AbsoluteFill style={{ perspective: 2000 }}>
      <div
        className="ht-shell"
        style={{
          position: "absolute",
          inset: "auto",
          left: 0,
          top: 0,
          display: "block",
          background: "none",
          transformOrigin: "0 0",
          // Only ever scaled down: the plane is laid out at its closest (`zoom`), so its text and lines are drawn sharp.
          transform: `translate(${width / 2}px, ${height / 2}px) rotateX(30deg) rotateZ(${interpolate(frame, [0, 210], [-9, -6])}deg) scale(${zoom / CLOSEST})`,
          ["--ht-icon-size" as string]: "13.5px",
          ["--ht-icon-stroke" as string]: "1.05px",
          ...FONT_VARS,
        }}
      >
        <div style={{ position: "absolute", left: -look.x, top: -look.y, zoom: CLOSEST }}>
          {/* The view: its label, and Acme at Phone. */}
          <div className="ht-view-label" style={{ left: 0, top: -24, width: VIEW_WIDTH, color: "rgb(255 255 255 / 0.6)" }}>
            <span className="ht-view-title">
              <span className="ht-view-name is-active" style={{ color: "#fff" }}>
                Phone
              </span>
              <span className="ht-view-range">≤ 767</span>
            </span>
          </div>
          <div ref={page} style={{ position: "absolute", left: 0, top: 0, width: VIEW_WIDTH, boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.2), 0 30px 80px -20px rgb(0 0 0 / 0.45)" }}>
            <DemoPage view="Phone" width={VIEW_WIDTH} onPick={() => {}} onHover={() => {}} hug />
          </div>

          {/* The button, selected. */}
          <div
            className="ht-selection"
            style={{ left: b.x, top: b.y, width: b.width, height: b.height, borderWidth: hair, opacity: interpolate(frame, [6, 14], [0, 1], clamp) }}
          />
          {[
            [b.x, b.y],
            [b.x + b.width, b.y],
            [b.x, b.y + b.height],
            [b.x + b.width, b.y + b.height],
          ].map(([x, y]) => (
            <div
              key={`${x} ${y}`}
              style={{
                position: "absolute",
                left: x - 8 * px,
                top: y - 8 * px,
                width: 16 * px,
                height: 16 * px,
                boxSizing: "border-box",
                border: `${hair}px solid var(--ht-accent)`,
                background: "#fff",
                opacity: interpolate(frame, [8, 16], [0, 1], clamp),
              }}
            />
          ))}

          {/* The brief's line, drawn from the button to the card as the camera goes; the dot on the button's edge. */}
          <svg className="ht-brief-lines" width="1" height="1" aria-hidden="true" style={{ overflow: "visible" }}>
            <g data-selected="true">
              <path d={`M ${from} ${lineY} H ${from + (to - from) * drawn}`} style={{ vectorEffect: "none", stroke: LINE, strokeWidth: hair, strokeDasharray: `${10 * px} ${8 * px}` }} />
              <circle style={{ fill: LINE }} cx={from} cy={lineY} r={7 * px * interpolate(frame, [26, 34], [0, 1], { ...clamp, easing: EASE_OUT })} />
            </g>
          </svg>

          {/* The card: written in, then set. */}
          <div
            className="ht-brief-card"
            data-selected="true"
            data-writing={writing || undefined}
            style={{
              left: card.x,
              top: card.y,
              // Its middle on the line, whatever its height, written in or set.
              translate: "0 -50%",
              width: CARD_WIDTH,
              opacity: interpolate(frame, [68, 78], [0, 1], clamp),
              scale: `${interpolate(frame, [68, 84], [0.94, 1], { ...clamp, easing: EASE_OUT })}`,
              transformOrigin: "100% 50%",
            }}
          >
            <p className="ht-brief-card-text" style={{ ...TRIM, ...(typed ? {} : { color: "var(--ht-text-muted)" }) }}>
              {/* The caret where the next letter goes: at the start, over the placeholder, till the first is typed. */}
              {writing && !typed && <Caret on={caret} width={hair} before />}
              {typed ? BRIEF.slice(0, typed) : "What should the Agent achieve here?"}
              {writing && typed > 0 && <Caret on={caret} width={hair} />}
            </p>
            {writing && (
              <button type="button" className="ht-brief-card-set" aria-label="Set brief" style={{ scale: `${pressed}` }}>
                <Icon name="arrow-up" />
              </button>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The stage at this frame, sharp round the middle and out of focus outside it; faded out at the end, for the loop. */
const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Wider as the camera draws back, so the button, the line and the card are all sharp in the last shot.
  const wide = interpolate(frame, [170, 192], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const focus = `radial-gradient(ellipse ${34 + 16 * wide}% ${40 + 6 * wide}% at 50% 50%, #000 45%, transparent 100%)`;
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 10, durationInFrames - 15, durationInFrames - 1], [0, 1, 1, 0], clamp) }}>
      <AbsoluteFill style={{ filter: "blur(7px)" }}>
        <Stage frame={frame} />
      </AbsoluteFill>
      <AbsoluteFill style={{ maskImage: focus, WebkitMaskImage: focus }}>
        <Stage frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Motion blur by the DOM's own copies between frames (CameraMotionBlur), as in the Variables video. */
export const BriefVideo: React.FC = () => {
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
