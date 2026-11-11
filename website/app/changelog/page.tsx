import type { Metadata } from "next";
import Link from "next/link";
import { Updates } from "@/components/Updates";

export const metadata: Metadata = {
  title: "Human Touch, changelog",
  description: "What has changed in Human Touch, newest first.",
};

/** Every entry of the changelog, in the home page's cards (designer, 2026-11-12). */
export default function ChangelogPage() {
  return (
    <main className="flex flex-col items-center px-4 pt-[120px] pb-[120px] md:pt-[160px]">
      <section className="flex w-full max-w-[800px] flex-col gap-3">
        {/* Back to home at the top left, over the title (designer, 2026-11-12). */}
        <Link
          href="/"
          className="group mb-5 inline-flex items-center gap-1 self-start text-[14px] leading-[1.4] font-[440] text-label transition-colors hover:text-ink"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="transition-transform duration-200 ease-out group-hover:-translate-x-0.5"
          >
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
          Back to home
        </Link>
        <h1 className="label font-sans text-base font-medium text-ink leading-normal normal-case tracking-[-0.005em]">Changelog</h1>
        <Updates />
      </section>
    </main>
  );
}
