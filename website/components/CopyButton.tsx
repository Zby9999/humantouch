"use client";

import { useEffect, useRef, useState } from "react";

/** A pill button that copies `text` and says so for a moment (Figma: "Copy prompt to install", 28px high). */
export function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`relative inline-flex h-7 items-center justify-center rounded-full bg-raised px-[11px] text-[12px] leading-[1.4] tracking-[-0.04px] text-ink-strong shadow-raised transition-transform active:scale-[0.97] ${className}`}
    >
      <span className={`transition-opacity duration-150 ${copied ? "opacity-0" : "opacity-100"}`}>{label}</span>
      <span aria-live="polite" className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${copied ? "opacity-100" : "opacity-0"}`}>
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
