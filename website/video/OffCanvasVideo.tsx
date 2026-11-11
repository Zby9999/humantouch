import { CameraMotionBlur } from "@remotion/motion-blur";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, interpolateColors, useCurrentFrame, useVideoConfig } from "remotion";
import { PointerShape, TIP } from "@/components/demos/parts";
import { DemoPage } from "@/components/editor/DemoPage";
import { EDITOR_CSS } from "@/components/editor/editor-css.generated";
import { FONT_VARS, geist } from "./fonts";

/*
 * The Off canvas card's video (designer, 2026-11-11): a 3D close-up of the canvas. Beside Acme's Phone view, off the
 * page, a new layer is made on its own: a frame drawn, filled, its corners rounded, its words typed: a sign-up card. Then
 * it is dragged into the page; the line where it will go shows under the hero, and as it is let go the page opens for it,
 * the layers under it moving down. The camera draws back to show the page with the card in it. Shallow depth of field
 * and motion blur, as the Brief and Variables videos.
 * Render from website/: `npx remotion render OffCanvas public/videos/off-canvas.mp4`.
 */

const BACKDROP = "#a0a19f";
const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const VIEW_WIDTH = 390;
/** The camera at its closest; the plane is laid out this much larger and only ever scaled down (see the Brief video). */
const CLOSEST = 2.4;
/** The card: as wide as the page's column, this tall; made this far left of the view, this far above where it goes. */
const CARD_HEIGHT = 112;
const OFF_GAP = 72;
const OFF_RISE = 150;
const WORDS = "Get the next issue in your inbox.";
const FILL = "#e8d9c5";
const RADIUS = 12;

/** The video's moments, in frames. */
const T = {
  draw: [16, 42],
  fill: [50, 62],
  radius: [64, 76],
  click: 84,
  type: [90, 122],
  grab: 130,
  carry: [134, 170],
  open: [170, 184],
  pullBack: [186, 214],
} as const;

type Box = { x: number; y: number; width: number; height: number };

/**
 * The cover's box on the page as it first is, in the page's own pixels: offsets, which the camera's transforms leave
 * alone, on a copy of the page kept as it is, unseen. The card goes in above it, as wide as it.
 */
function useCover(page: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState<Box | null>(null);
  const [handle] = useState(() => delayRender("Measuring the cover"));
  useLayoutEffect(() => {
    const measure = () => {
      const root = page.current!;
      let el = root.querySelector<HTMLElement>('[data-ht="cover"]');
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

/** The selection's handles, at its corners, `px` a screen pixel on the plane. */
function Handles({ px, opacity }: { px: number; opacity: number }) {
  const size = 16 * px;
  return (
    <>
      {(["0 0", "1 0", "0 1", "1 1"] as const).map((corner) => {
        const [x, y] = corner.split(" ").map(Number);
        return (
          <div
            key={corner}
            style={{
              position: "absolute",
              left: `calc(${x * 100}% - ${size / 2}px)`,
              top: `calc(${y * 100}% - ${size / 2}px)`,
              width: size,
              height: size,
              boxSizing: "border-box",
              border: `${2.5 * px}px solid var(--ht-accent)`,
              background: "#fff",
              opacity,
            }}
          />
        );
      })}
    </>
  );
}

/** The sign-up card, as it is at a moment of its making: its fill, corners and words so far, the caret after them. */
function Card({ width, height, fill, radius, words, caret, caretWidth }: { width: number; height: number; fill: string; radius: number; words: string; caret?: boolean; caretWidth?: number }) {
  return (
    <div style={{ position: "relative", boxSizing: "border-box", width, height, padding: 20, background: fill, borderRadius: radius }}>
      <p style={{ margin: 0, maxWidth: 260, fontFamily: "var(--font-instrument-serif), Georgia, serif", fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.01em", color: "#161614" }}>
        {words}
        {caret !== undefined && <span style={{ display: "inline-block", width: caretWidth, height: 28, marginLeft: 1, verticalAlign: -5, background: "var(--ht-accent)", opacity: caret ? 1 : 0 }} />}
      </p>
    </div>
  );
}

const Stage: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const reference = useRef<HTMLDivElement>(null);
  const cover = useCover(reference);
  const c = cover ?? { x: 24, y: 420, width: 342, height: 260 };
  const W = c.width;
  // Where it is made, off the page; where it goes, above the cover, in the room the page opens for it.
  const off = { x: -OFF_GAP - W, y: c.y - OFF_RISE };
  const slot = { x: c.x, y: c.y };

  // Made: drawn from its top left corner to its bottom right, then filled, rounded and written in.
  const drawn = interpolate(frame, T.draw, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const made = frame >= T.draw[0];
  const fill = interpolateColors(frame, T.fill, ["#ffffff", FILL]);
  const radius = interpolate(frame, T.radius, [0, RADIUS], { ...clamp, easing: EASE_IN_OUT });
  const typed = Math.round(interpolate(frame, T.type, [0, WORDS.length], clamp));
  const writing = frame >= T.click && frame < T.grab;

  // Carried in, and let go: the page opens for it, and it is the page's.
  const carry = interpolate(frame, T.carry, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const at = { x: off.x + (slot.x - off.x) * carry, y: off.y + (slot.y - off.y) * carry };
  const dragging = frame >= T.carry[0] && frame < T.carry[1];
  const inPage = frame >= T.carry[1];
  const open = interpolate(frame, T.open, [0, 1], { ...clamp, easing: EASE_OUT });
  // Over the view, the line where it will go.
  const over = interpolate(frame, [T.carry[0] + 18, T.carry[0] + 24], [0, 1], clamp) * interpolate(frame, [T.carry[1] - 1, T.carry[1]], [1, 0], clamp);

  // The camera: on the canvas where it is made; with it into the page; then drawn back to see the page.
  const atMaking = { x: off.x + W / 2 + 40, y: off.y + CARD_HEIGHT / 2 };
  const atSlot = { x: slot.x + W / 2 - 40, y: slot.y + CARD_HEIGHT / 2 };
  const atPage = { x: VIEW_WIDTH / 2 - 20, y: c.y - 30 };
  const follow = interpolate(frame, [T.carry[0], T.carry[1] + 6], [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const back = interpolate(frame, T.pullBack, [0, 1], { ...clamp, easing: EASE_IN_OUT });
  const look = {
    x: atMaking.x + (atSlot.x - atMaking.x) * follow + (atPage.x - atSlot.x) * back,
    y: atMaking.y + (atSlot.y - atMaking.y) * follow + (atPage.y - atSlot.y) * back,
  };
  const zoom = interpolate(frame, [0, T.draw[1], T.carry[0], T.carry[1], T.pullBack[1]], [CLOSEST, 2.25, 2.15, 2.0, 1.3], { ...clamp, easing: EASE_IN_OUT });
  const px = 1 / zoom;
  const hair = 2.5 * px;

  // The pointer: draws the frame corner to corner; clicks into it to write; takes it by its middle left and carries it in.
  const start = { x: off.x + 40, y: off.y + CARD_HEIGHT + 90 };
  const grip = (box: { x: number; y: number }) => ({ x: box.x + W * 0.3, y: box.y + CARD_HEIGHT * 0.62 });
  const pointerAt = (() => {
    if (frame < T.draw[0]) {
      const t = interpolate(frame, [4, T.draw[0] - 1], [0, 1], { ...clamp, easing: EASE_OUT });
      return { x: start.x + (off.x - start.x) * t, y: start.y + (off.y - start.y) * t };
    }
    if (frame < T.draw[1] + 4) return { x: off.x + W * drawn, y: off.y + CARD_HEIGHT * drawn };
    const toText = interpolate(frame, [T.draw[1] + 6, T.click - 1], [0, 1], { ...clamp, easing: EASE_IN_OUT });
    const corner = { x: off.x + W, y: off.y + CARD_HEIGHT };
    const text = { x: off.x + 34, y: off.y + 40 };
    // Out of the words' way while they are typed, then to the card to carry it.
    const aside = interpolate(frame, [T.click + 4, T.type[0] + 4], [0, 1], { ...clamp, easing: EASE_OUT });
    const toGrip = interpolate(frame, [T.type[1] + 2, T.grab - 1], [0, 1], { ...clamp, easing: EASE_IN_OUT });
    if (frame < T.grab) {
      const p = { x: corner.x + (text.x - corner.x) * toText, y: corner.y + (text.y - corner.y) * toText };
      const q = { x: p.x + 30 * aside, y: p.y + 70 * aside };
      const g = grip(off);
      return { x: q.x + (g.x - q.x) * toGrip, y: q.y + (g.y - q.y) * toGrip };
    }
    const g = grip(at);
    const leave = interpolate(frame, [T.carry[1] + 2, T.carry[1] + 20], [0, 1], { ...clamp, easing: EASE_OUT });
    return { x: g.x + 60 * leave, y: g.y + 120 * leave };
  })();
  const pressed = (frame >= T.draw[0] && frame < T.draw[1]) || (frame >= T.click && frame < T.click + 3) || (frame >= T.grab && frame < T.carry[1]);

  const selected = made && frame < T.carry[1] + 8;
  const selection = interpolate(frame, [T.carry[1] + 2, T.carry[1] + 8], [1, 0], clamp);
  const handles = !dragging && frame >= T.draw[1] ? selection : 0;
  const size = { width: Math.max(W * drawn, 1), height: Math.max(CARD_HEIGHT * drawn, 1) };

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
          transform: `translate(${width / 2}px, ${height / 2}px) rotateX(30deg) rotateZ(${interpolate(frame, [0, 240], [-9, -6])}deg) scale(${zoom / CLOSEST})`,
          ["--ht-icon-size" as string]: "13.5px",
          ["--ht-icon-stroke" as string]: "1.05px",
          ...FONT_VARS,
        }}
      >
        <div style={{ position: "absolute", left: -look.x, top: -look.y, zoom: CLOSEST }}>
          {/* The page as it first is, unseen: where the card goes is measured on it. */}
          <div ref={reference} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: VIEW_WIDTH, visibility: "hidden" }}>
            <DemoPage view="Phone" width={VIEW_WIDTH} onPick={() => {}} onHover={() => {}} hug />
          </div>

          {/* The view: its label, and Acme at Phone, opening for the card once it is let go. */}
          <div className="ht-view-label" style={{ left: 0, top: -24, width: VIEW_WIDTH, color: "rgb(255 255 255 / 0.6)" }}>
            <span className="ht-view-title">
              <span className="ht-view-name is-active" style={{ color: "#fff" }}>
                Phone
              </span>
              <span className="ht-view-range">≤ 767</span>
            </span>
          </div>
          <div style={{ position: "absolute", left: 0, top: 0, width: VIEW_WIDTH, boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.2), 0 30px 80px -20px rgb(0 0 0 / 0.45)" }}>
            <DemoPage
              view="Phone"
              width={VIEW_WIDTH}
              onPick={() => {}}
              onHover={() => {}}
              hug
              inserted={inPage ? { node: <Card width={W} height={CARD_HEIGHT} fill={FILL} radius={RADIUS} words={WORDS} />, height: CARD_HEIGHT, open } : undefined}
            />
          </div>

          {/* Where it will go: the line under the hero, as it is carried over the view. */}
          {over > 0 && <div style={{ position: "absolute", left: slot.x, top: slot.y - hair, width: W, height: 2 * hair, borderRadius: hair, background: "var(--ht-accent)", opacity: over }} />}

          {/* The card off the page: drawn, made, then carried in. */}
          {made && !inPage && (
            <div style={{ position: "absolute", left: at.x, top: at.y, boxShadow: dragging ? "0 18px 36px -12px rgb(0 0 0 / 0.4)" : "none", borderRadius: radius }}>
              {frame < T.draw[1] ? (
                <div style={{ width: size.width, height: size.height, background: "#ffffff" }} />
              ) : (
                <Card width={W} height={CARD_HEIGHT} fill={fill} radius={radius} words={WORDS.slice(0, typed)} caret={writing ? Math.floor(frame / 12) % 2 === 0 : undefined} caretWidth={hair} />
              )}
            </div>
          )}
          {selected && (
            <div style={{ position: "absolute", left: inPage ? slot.x : at.x, top: inPage ? slot.y : at.y, width: frame < T.draw[1] ? size.width : W, height: frame < T.draw[1] ? size.height : CARD_HEIGHT }}>
              <div style={{ position: "absolute", inset: 0, border: `${hair}px solid var(--ht-accent)`, opacity: selection }} />
              <Handles px={px} opacity={handles} />
            </div>
          )}

          {/* The pointer. */}
          <svg
            width={20}
            height={20}
            viewBox="0 0 20 20"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: pointerAt.x - TIP.x,
              top: pointerAt.y - TIP.y,
              overflow: "visible",
              transformOrigin: `${TIP.x}px ${TIP.y}px`,
              scale: `${1.3 * (pressed ? 0.88 : 1)}`,
              opacity: interpolate(frame, [4, 10, T.carry[1] + 12, T.carry[1] + 20], [0, 1, 1, 0], clamp),
            }}
          >
            <PointerShape />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The stage at this frame, sharp round the middle and out of focus outside it, wider in the last shot; faded at the ends. */
const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const wide = interpolate(frame, T.pullBack, [0, 1], clamp);
  const focus = `radial-gradient(ellipse ${40 + 14 * wide}% ${44 + 8 * wide}% at 50% 50%, #000 45%, transparent 100%)`;
  return (
    <AbsoluteFill style={{ opacity: interpolate(frame, [0, 10, durationInFrames - 8, durationInFrames - 1], [0, 1, 1, 0], clamp) }}>
      <AbsoluteFill style={{ filter: "blur(7px)" }}>
        <Stage frame={frame} />
      </AbsoluteFill>
      <AbsoluteFill style={{ maskImage: focus, WebkitMaskImage: focus }}>
        <Stage frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const OffCanvasVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: geist }}>
      <style>{EDITOR_CSS}</style>
      <CameraMotionBlur samples={6} shutterAngle={180}>
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, #aaabaa 0%, ${BACKDROP} 55%, #8e8f8d 100%)` }}>
          <Scene />
        </AbsoluteFill>
      </CameraMotionBlur>
    </AbsoluteFill>
  );
};
