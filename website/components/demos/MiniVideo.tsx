"use client";

import { useEffect, useRef } from "react";

/**
 * A small card's picture as a video, made with Remotion from the site's own components (website/video/): cut to the
 * card's shape, muted, looping, playing only while on screen. With reduced motion, its poster (the last of it) stays.
 */
export function MiniVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current!;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? video.play().catch(() => {}) : video.pause()), { threshold: 0.3 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return <video ref={ref} className="absolute inset-0 size-full object-cover" src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" />;
}
