import React, { useState, type ReactNode } from "react";
import * as Dialog from "./dialog";
import { Card } from "./Card";

type Item = { id: string; title: string };

function identity<T,>(value: T): T {
  return value;
}

export function Gallery({ items, footer }: { items: Item[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rest = { role: "list" };

  return (
    <section
      id="gallery"
      className="grid gap-4" data-tk-loc="src/Gallery.tsx:16:5"
    >
      {/* a comment between elements */}
      <h2 data-tk-loc="src/Gallery.tsx:21:7">Gallery</h2>
      <img src="/hero.png" alt="" data-tk-loc="src/Gallery.tsx:22:7" />
      <ul {...rest} data-tk-loc="src/Gallery.tsx:23:7">
        {items.map((item) => (
          <li key={item.id} data-tk-loc="src/Gallery.tsx:25:11">
            <Card title={item.title} icon={<svg viewBox="0 0 8 8" data-tk-loc="src/Gallery.tsx:26:44"><circle r="4" data-tk-loc="src/Gallery.tsx:26:67" /></svg>} data-tk-usage="src/Gallery.tsx:26:13" />
          </li>
        ))}
      </ul>
      {open && <p className="note" data-tk-loc="src/Gallery.tsx:30:16">Opened</p>}
      {open ? <span data-tk-loc="src/Gallery.tsx:31:15">yes</span> : <span data-tk-loc="src/Gallery.tsx:31:34">no</span>}
      <Dialog.Root open={open} data-tk-usage="src/Gallery.tsx:32:7">
        <Dialog.Trigger onClick={() => setOpen(identity(true))} data-tk-usage="src/Gallery.tsx:33:9">Open</Dialog.Trigger>
      </Dialog.Root>
      <my-element data-x="1" data-tk-loc="src/Gallery.tsx:35:7"></my-element>
      <div data-tk-loc="already/marked.tsx:1:1">kept</div>
      {footer as ReactNode}
    </section>
  );
}
