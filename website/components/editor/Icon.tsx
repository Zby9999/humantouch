import { ICONS, type IconName } from "./icon-paths";

/** One of the editor's icons, as the product draws it: a 16px square, lines in the current color. */
export function Icon({ name, size = 14, stroke = 1, className = "" }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 [&_*]:[vector-effect:non-scaling-stroke] ${className}`}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
