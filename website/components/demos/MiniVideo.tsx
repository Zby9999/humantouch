"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small card's picture as a video, made with Remotion from the site's own components (website/video/): cut to the
 * card's shape, muted, looping, playing only while on screen. With reduced motion, its poster (the last of it) stays.
 * Its poster and video are asked for only as the card nears the screen (800px off), so they do not take the network
 * from the hero (designer, 2026-11-12); on a fast network they are in before it is there.
 */
export function MiniVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const video = ref.current!;
    const nearing = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: "800px 0px" });
    nearing.observe(video);
    return () => nearing.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    const video = ref.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? video.play().catch(() => {}) : video.pause()), { threshold: 0.3 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [near]);
  return <video ref={ref} className="absolute inset-0 size-full object-cover" src={near ? src : undefined} poster={near ? poster : undefined} muted loop playsInline preload="metadata" aria-hidden="true" />;
}
