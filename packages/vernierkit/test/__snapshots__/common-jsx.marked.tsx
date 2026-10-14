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
    <section data-vk-loc="src/Gallery.tsx:16:5"
      id="gallery"
      className="grid gap-4"
    >
      {/* a comment between elements */}
      <h2 data-vk-loc="src/Gallery.tsx:21:7">Gallery</h2>
      <img data-vk-loc="src/Gallery.tsx:22:7" src="/hero.png" alt="" />
      <ul data-vk-loc="src/Gallery.tsx:23:7" {...rest}>
        {items.map((item) => (
          <li data-vk-loc="src/Gallery.tsx:25:11" key={item.id}>
            <Card data-vk-usage="src/Gallery.tsx:26:13" title={item.title} icon={<svg data-vk-loc="src/Gallery.tsx:26:44" viewBox="0 0 8 8"><circle data-vk-loc="src/Gallery.tsx:26:67" r="4" /></svg>} />
          </li>
        ))}
      </ul>
      {open && <p data-vk-loc="src/Gallery.tsx:30:16" className="note">Opened</p>}
      {open ? <span data-vk-loc="src/Gallery.tsx:31:15">yes</span> : <span data-vk-loc="src/Gallery.tsx:31:34">no</span>}
      <Dialog.Root data-vk-usage="src/Gallery.tsx:32:7" open={open}>
        <Dialog.Trigger data-vk-usage="src/Gallery.tsx:33:9" onClick={() => setOpen(identity(true))}>Open</Dialog.Trigger>
      </Dialog.Root>
      <my-element data-vk-loc="src/Gallery.tsx:35:7" data-x="1"></my-element>
      <div data-vk-loc="already/marked.tsx:1:1">kept</div>
      {footer as ReactNode}
    </section>
  );
}
