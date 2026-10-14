import { Badge } from "acme-ui";
import { Vernier } from "vernierkit/react";
import { Card } from "./components/Card";

const features = [
  { title: "Freeze", body: "Turn the current page into a canvas." },
  { title: "Arrange", body: "Drag layers, build Stacks, tune spacing." },
  { title: "Apply", body: "Your Agent writes the changes into code." },
];

export function App() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="flex items-center gap-3">
        <h1 className="text-4xl font-bold text-stone-900">Vernier Kit</h1>
        <Badge>Beta</Badge>
      </header>
      <p className="mt-4 text-stone-600">A Framer-style editor layer for any page.</p>
      <button type="button" className="mt-6 px-4 py-2 text-white">
        Get started
      </button>
      <section className="mt-12 grid grid-cols-3 gap-4">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title} body={feature.body} />
        ))}
      </section>
      <Vernier />
    </main>
  );
}
