import { HumanTouch } from "humantouch/react";
import { useEffect, useRef, useState } from "react";

const SLIDES = ["Plan", "Build", "Ship"];
const STEPS = ["Sketch", "Prototype", "Review", "Polish"];

/**
 * A page that moves, as many do (ticket 141): a CSS animation, a script
 * animation and one that writes the style attribute each frame, a 12-hour
 * clock, a carousel turning by a class, a list in another order on each
 * load, and a note that shows after a while (`LATE_MS`), as a page drawn by
 * the time does. With the code the same, it is the same page, loaded again.
 */
/** How long after it loads the page shows its note. */
const LATE_MS = 3000;

export function MotionPage() {
  const [now, setNow] = useState(() => new Date());
  const [slide, setSlide] = useState(0);
  const [steps] = useState(() => [...STEPS].sort(() => Math.random() - 0.5));
  const [late, setLate] = useState(false);
  const pulse = useRef<HTMLParagraphElement>(null);
  const drift = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ticking = setInterval(() => setNow(new Date()), 250);
    const turning = setInterval(() => setSlide((n) => (n + 1) % SLIDES.length), 400);
    const showing = setTimeout(() => setLate(true), LATE_MS);
    const pulsing = pulse.current!.animate([{ opacity: 1 }, { opacity: 0.3 }], { duration: 600, iterations: Infinity, direction: "alternate" });
    let frame = requestAnimationFrame(function move(at) {
      drift.current!.style.transform = `translateX(${Math.round((Math.sin(at / 300) + 1) * 40)}px)`;
      frame = requestAnimationFrame(move);
    });
    return () => {
      clearInterval(ticking);
      clearInterval(turning);
      clearTimeout(showing);
      pulsing.cancel();
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <main className="motion-page">
      <h1>Always moving</h1>
      <div className="spinner" />
      <p ref={pulse}>Pulsing</p>
      <div ref={drift}>Drifting</div>
      <time>{now.toLocaleTimeString("en-US")}</time>
      {late && <p className="motion-late">Still here after {Math.round(LATE_MS / 1000)} seconds</p>}
      <section>
        {SLIDES.map((name, i) => (
          <div key={name} className={i === slide ? "slide is-active" : "slide"}>
            {name}
          </div>
        ))}
      </section>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <HumanTouch />
    </main>
  );
}
