"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Steps through a demo's phases, each for its duration, and loops; only while the demo is on screen. With reduced
 * motion it holds the phase given as `still`.
 */
export function usePhases(durations: number[], still: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced) return;
    const timer = setTimeout(() => setPhase((p) => (p + 1) % durations.length), durations[phase]);
    return () => clearTimeout(timer);
  }, [phase, visible, reduced, durations]);

  return { ref, phase: reduced ? still : phase };
}
