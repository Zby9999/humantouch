import { Badge, Surface } from "acme-ui";
import { ThirdKind } from "03kind/react";
import { Button } from "./components/Button";
import { Card } from "./components/Card";
import { cn } from "./lib/utils";

const features = [
  { title: "Freeze", body: "Turn the current page into a canvas." },
  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },
  { title: "Apply", body: "Your Agent writes the changes into code." },
];

/** Paid yearly, how much less a plan costs; with none, the page says nothing of it. */
const yearlySaving = 20;

export function App() {
  return (
    <main className="mx-auto max-w-4xl px-gutter md:px-section">
      <section className="flex flex-col gap-4 py-section md:items-center md:text-center" data-testid="hero">
        <header className="flex items-center gap-3 md:justify-center">
          <h1 className="text-display font-bold text-ink">Third Kind</h1>
          <Badge>Beta</Badge>
        </header>
        <p className="text-lead text-muted">
          A Framer-style editor layer for <strong>any</strong> page, on React 18 and Tailwind v3.
        </p>
        <button type="button" className="self-start rounded-pill bg-brand-500 px-gutter py-2 text-caption text-white hover:bg-brand-700 md:self-center">
          Get started
        </button>
      </section>
      <Surface data-testid="features" className="grid grid-cols-1 gap-gutter pb-section sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title} body={feature.body} />
        ))}
        <Card title="Your turn" body="Open the editor and try it." />
      </Surface>
      <section className="flex flex-col gap-4 pb-section" data-testid="pricing">
        <h2 className="text-xl font-semibold text-ink">Pricing</h2>
        {yearlySaving > 0 && <span className="self-start rounded-pill bg-brand-50 px-2 py-0.5 text-caption text-brand-700">Save {yearlySaving}% yearly</span>}
        <p className={cn("text-caption", yearlySaving > 0 ? "text-ink" : "text-muted")}>Free while in beta, then per seat.</p>
        <div className="flex flex-wrap gap-3">
          <Button>Start free</Button>
          <Button variant="secondary">Compare plans</Button>
          <Button variant="secondary">Talk to us</Button>
        </div>
      </section>
      <ThirdKind />
    </main>
  );
}
