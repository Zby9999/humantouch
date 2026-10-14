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
      className="grid gap-4"
    >
      {/* a comment between elements */}
      <h2>Gallery</h2>
      <img src="/hero.png" alt="" />
      <ul {...rest}>
        {items.map((item) => (
          <li key={item.id}>
            <Card title={item.title} icon={<svg viewBox="0 0 8 8"><circle r="4" /></svg>} />
          </li>
        ))}
      </ul>
      {open && <p className="note">Opened</p>}
      {open ? <span>yes</span> : <span>no</span>}
      <Dialog.Root open={open}>
        <Dialog.Trigger onClick={() => setOpen(identity(true))}>Open</Dialog.Trigger>
      </Dialog.Root>
      <my-element data-x="1"></my-element>
      <div data-vk-loc="already/marked.tsx:1:1">kept</div>
      {footer as ReactNode}
    </section>
  );
}
