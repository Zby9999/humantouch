# Design changes to apply

4 changes, made by the designer in Human Touch. Apply each one to the source as the project already writes styles, and run `npx humantouch done <number>` after each. When you are through them, run `npx humantouch finish`.

## 1. Fill

- **Kind:** Style
- **Layer:** Card, `<article class="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">` (Page › Stack › App › Grid › Card)
- **Location:** `src/components/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the fill from #FFFFFF to #FF0000.
- **Variables:** no Variable has the fill color's value: use the exact value (with Tailwind, an arbitrary value: `bg-[#FF0000]`), not a class or Variable whose value is close.
- **Reference style:** `background-color: rgb(255 0 0 / 1)`
- **Currently set by:** class `bg-white`: rule `.bg-white` in CSS layer `utilities` of `src/index.css`, `background-color: var(--color-white)`

## 2. Corner radius

- **Kind:** Style
- **Layer:** Card, `<article class="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">` (Page › Stack › App › Grid › Card)
- **Location:** `src/components/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the corner radius from 12px to 4px.
- **Variables:** the corner radius is the Variable `sm`, from the Tailwind theme: use its class, `rounded-sm` (in CSS, `var(--radius-sm)`).
- **Reference style:** `border-radius: 4px`
- **Currently set by:** class `rounded-xl`: rule `.rounded-xl` in CSS layer `utilities` of `src/index.css`, `border-radius: var(--radius-xl)`

## 3. Corner radius

- **Kind:** Style
- **Layer:** Card, `<article class="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">` (Page › Stack › App › Grid › Card)
- **Location:** `src/components/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** below 768px only (`@media (width < 768px)`), as the designer changed it in a narrower view. The project writes these widths with Tailwind's `max-md:`: make the change apply at these widths only that way, and leave the layer as it is at every other width. Its value before is what it showed at these widths.
- **Design intent:** Change the corner radius from 4px to 20px.
- **Variables:** no Variable has the corner radius's value: use the exact value (with Tailwind, an arbitrary value: `rounded-[20px]`), not a class or Variable whose value is close.
- **Reference style:** `border-radius: 20px`
- **Currently set by:** class `rounded-xl`: rule `.rounded-xl` in CSS layer `utilities` of `src/index.css`, `border-radius: var(--radius-xl)`

## 4. Delete

- **Kind:** Delete
- **Layer:** Card, `<article class="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">` (Page › Stack › App › Grid › Card)
- **Location:** `src/components/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:40:11`, inside App used at `src/main.tsx:8:5`. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Delete this layer, and all in it, from Grid (`<div class="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-3">`, at `src/App.tsx:38:7`), where it is 2nd.
- **Data change:** the layer is one of the 3 instances a loop renders: take its item out of the data the loop goes through. If the data comes from outside the code (an API, a CMS), say so in the report.
- **Reference style:** none: the layer goes

