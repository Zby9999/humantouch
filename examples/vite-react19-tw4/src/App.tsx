import { Badge, Surface } from "acme-ui";
import { useState } from "react";
import { ThirdKind } from "03kind/react";
import { Card } from "./components/Card";
import { Dialog } from "./components/Dialog";

const features = [
  { title: "Freeze", body: "Turn the current page into a canvas." },
  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },
  { title: "Apply", body: "Your Agent writes the changes into code." },
];

export function App() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-6">
      {/* Fills exactly one screen: the canvas has to keep vh units at the viewport height. */}
      <section className="flex h-screen flex-col justify-center" data-testid="hero">
        <header className="flex items-center gap-3">
          <h1 className="font-display text-4xl font-bold text-stone-900">03Kind</h1>
          <Badge>Beta</Badge>
        </header>
        <p className="mt-4 text-stone-600">
          A Framer-style editor layer for <strong>any</strong> page.
        </p>
        <button
          type="button"
          className="mt-6 flex items-center gap-2 self-start px-4 py-2 text-white"
          onClick={() => setDialogOpen(true)}
        >
          Get started
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </section>
      <Surface className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title} body={feature.body} />
        ))}
        <Card title="Your turn" body="Open the editor and try it." />
      </Surface>
      {dialogOpen && <Dialog onClose={() => setDialogOpen(false)} />}
      <ThirdKind />
    </main>
  );
}
