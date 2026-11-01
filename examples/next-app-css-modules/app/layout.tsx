import type { Metadata } from "next";
import { ThirdKind } from "03kind/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "03Kind example: Next.js App Router + CSS Modules",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ThirdKind />
      </body>
    </html>
  );
}
