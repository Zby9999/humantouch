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
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="label font-sans text-base font-medium text-ink leading-normal normal-case tracking-[-0.005em]">Changelog</h1>
          <Link href="/" className="text-[14px] leading-[1.4] font-[440] text-label transition-colors hover:text-ink">
            Back to home
          </Link>
        </div>
        <Updates />
      </section>
    </main>
  );
}
