"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { ACME_COLORS } from "./model";
import { STEPS, TAILWIND_FONT_SIZE, TAILWIND_NAMED, TAILWIND_RADIUS, TAILWIND_RAMPS, TAILWIND_SHADOW, TAILWIND_SPACING } from "./tailwind-variables";

/*
 * What the Design panel shows with nothing selected: the project's Variables, in the product's markup (VariantsPanel.tsx).
 * Each kind is drawn as what it is: colors as swatches, Tailwind's in ramps from 50 to 950, the project's own named;
 * spacing as bars of its length; radius and shadow as tiles; font size as a sample. Search and the source narrow the
 * list; a section folds. Nothing is selected, so nothing takes a Variable: each is only pointed at, for its tip.
 */

type Source = "all" | "own" | "tailwind";
type Entry = { name: string; value: string; own: boolean };

const SAMPLE_MAX = 32;

const colors: Entry[] = [
  ...ACME_COLORS.map((c) => ({ name: c.name, value: c.value, own: true })),
  ...TAILWIND_RAMPS.flatMap(([ramp, hexes]) => hexes.map((hex, i) => ({ name: `${ramp}-${STEPS[i]}`, value: `#${hex}`, own: false }))),
  ...TAILWIND_NAMED.map(([name, value]) => ({ name, value, own: false })),
];
const lengths = (list: [string, number][]): Entry[] => list.map(([name, px]) => ({ name, value: `${px}px`, own: false }));
const GROUPS: { group: string; title: string; entries: Entry[] }[] = [
  { group: "color", title: "Color", entries: colors },
  { group: "spacing", title: "Spacing", entries: lengths(TAILWIND_SPACING) },
  { group: "radius", title: "Radius", entries: lengths(TAILWIND_RADIUS) },
  { group: "fontSize", title: "Font size", entries: lengths(TAILWIND_FONT_SIZE) },
  { group: "shadow", title: "Shadow", entries: TAILWIND_SHADOW.map(([name, value]) => ({ name, value, own: false })) },
];

export function VariablesPanel() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<Source>("all");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const text = search.trim().toLowerCase();
  const groups = GROUPS.map((g) => ({ ...g, entries: g.entries.filter((e) => (source === "all" || (source === "own") === e.own) && (!text || e.name.toLowerCase().includes(text))) })).filter((g) => g.entries.length);

  return (
    <div className="ht-variants">
      <div className="ht-row">
        <label className="ht-field">
          <Icon name="search" />
          <input className="ht-input" type="search" placeholder="Search variables" aria-label="Search variables" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select className="ht-select ht-variants-source" aria-label="Variables shown" value={source} onChange={(e) => setSource(e.target.value as Source)}>
          <option value="all">All</option>
          <option value="own">Project</option>
          <option value="tailwind">Tailwind</option>
        </select>
      </div>
      {!groups.length && <p className="ht-panel-empty">{text ? `No Variable is named “${search.trim()}”.` : "The project has no Variables to show."}</p>}
      {groups.map(({ group, title, entries }) => {
        const open = !closed.has(group);
        const own = entries.filter((e) => e.own);
        const theirs = entries.filter((e) => !e.own);
        return (
          <section key={group} className="ht-section" aria-label={title}>
            <div className="ht-section-header">
              <h3 className="ht-section-title">
                {title}
                <span className="ht-variants-count">{entries.length}</span>
              </h3>
              <button
                type="button"
                className="ht-icon-button"
                aria-label={`${open ? "Fold" : "Unfold"} ${title}`}
                aria-expanded={open}
                onClick={() =>
                  setClosed((s) => {
                    const n = new Set(s);
                    if (!n.delete(group)) n.add(group);
                    return n;
                  })
                }
              >
                <Icon name="chevron-down" />
              </button>
            </div>
            {open &&
              (
                [
                  ["Project", own],
                  ["Tailwind", theirs],
                ] as const
              ).map(([label, list]) =>
                list.length ? (
                  <div key={label} className="ht-variants-part">
                    <p className="ht-variants-subtitle">{label}</p>
                    {view(group, list)}
                  </div>
                ) : null,
              )}
          </section>
        );
      })}
    </div>
  );
}

/** One Variable, to point at: its name and value in its tip. */
function Item({ entry, className, style, children }: { entry: Entry; className: string; style?: React.CSSProperties; children?: ReactNode }) {
  return (
    <button type="button" className={className} style={style} aria-label={`${entry.name}, ${entry.value}`} aria-disabled="true" data-tip={`${entry.name}  ${entry.value}`}>
      {children}
    </button>
  );
}

function view(group: string, entries: Entry[]) {
  if (group === "color") return <Palette entries={entries} />;
  if (group === "spacing")
    return entries.map((e) => (
      <div key={e.name} className="ht-variants-row is-length">
        <span className="ht-variants-name">{e.name}</span>
        <span className="ht-variants-track">
          <span className="ht-variants-bar" style={{ ["--ht-length" as string]: e.value }} />
        </span>
        <span className="ht-variants-value">{e.value}</span>
      </div>
    ));
  if (group === "radius")
    return (
      <div className="ht-variants-tiles is-four">
        {entries.map((e) => (
          <Item key={e.name} entry={e} className="ht-variants-tile">
            <span className="ht-variants-radius" style={{ borderTopLeftRadius: `${Math.min(parseFloat(e.value), 40)}px` }} />
            <span className="ht-variants-label is-stacked">
              <span className="ht-variants-tile-name">{e.name}</span>
              <span className="ht-variants-value">{e.value}</span>
            </span>
          </Item>
        ))}
      </div>
    );
  if (group === "fontSize")
    return entries.map((e) => (
      <Item key={e.name} entry={e} className="ht-variants-row is-button">
        <span className="ht-variants-sample" style={{ fontSize: `${Math.min(parseFloat(e.value), SAMPLE_MAX)}px` }}>
          Aa
        </span>
        <span className="ht-variants-name">{e.name}</span>
        <span className="ht-variants-value">{e.value}</span>
      </Item>
    ));
  return (
    <div className="ht-variants-tiles is-three">
      {entries.map((e) => (
        <Item key={e.name} entry={e} className="ht-variants-tile">
          <span className="ht-variants-shadow" style={{ boxShadow: e.value }} />
          <span className="ht-variants-label is-center">{e.name}</span>
        </Item>
      ))}
    </div>
  );
}

/** Colors: those in a ramp (a name and its steps, 50 to 950), a row each; the others, named, after them. */
function Palette({ entries }: { entries: Entry[] }) {
  const ramps = new Map<string, (Entry | undefined)[]>();
  const named: Entry[] = [];
  for (const e of entries) {
    const m = /^(.+)-(\d+)$/.exec(e.name);
    if (m && STEPS.includes(m[2])) {
      const steps = ramps.get(m[1]) ?? Array<Entry | undefined>(STEPS.length).fill(undefined);
      steps[STEPS.indexOf(m[2])] = e;
      ramps.set(m[1], steps);
    } else named.push(e);
  }
  return (
    <div className="ht-variants-palette">
      {[...ramps].map(([name, steps]) => (
        <div key={name} className="ht-variants-ramp" style={{ ["--ht-steps" as string]: `${steps.length}` }}>
          <span className="ht-variants-ramp-name">{name}</span>
          {steps.map((e, i) => (e ? <Item key={e.name} entry={e} className="ht-variants-swatch" style={{ ["--ht-swatch" as string]: e.value }} /> : <span key={`empty ${i}`} className="ht-variants-empty" />))}
        </div>
      ))}
      {named.length > 0 && (
        <div className="ht-variants-named" role="group" aria-label="Named">
          {ramps.size > 0 && <p className="ht-variants-named-title">Named</p>}
          <div className="ht-variants-names">
            {named.map((e) => (
              <Item key={e.name} entry={e} className="ht-variants-named-item">
                <span className="ht-variants-named-swatch" style={{ ["--ht-swatch" as string]: e.value }} />
                <span className="ht-variants-named-name">{e.name}</span>
              </Item>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
