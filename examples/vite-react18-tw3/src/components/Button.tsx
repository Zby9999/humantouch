import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/** Each variant's own classes: a usage picks one by its `variant` prop. */
const variants = {
  primary: "bg-brand-500 text-white hover:bg-brand-700",
  secondary: "border border-brand-100 bg-white text-ink hover:border-brand-500",
};

export function Button({ variant = "primary", children }: { variant?: keyof typeof variants; children: ReactNode }) {
  return (
    <button type="button" className={cn("rounded-pill px-gutter py-2 text-caption", variants[variant])}>
      {children}
    </button>
  );
}
