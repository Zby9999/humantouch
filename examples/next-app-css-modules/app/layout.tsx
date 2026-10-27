import type { Metadata } from "next";
import { Vernier } from "vernierkit/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vernier Kit example: Next.js App Router + CSS Modules",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Vernier />
      </body>
    </html>
  );
}
