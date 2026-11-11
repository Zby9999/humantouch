# Design changes to apply

13 changes, made by the designer in Human Touch. Apply each one to the source as the project already writes styles, and run `npx humantouch done <number>` after each. When you are through them, run `npx humantouch finish`.

## 1. Fill

- **Kind:** Style
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the fill from #FFFFFF to #FF0000.
- **Reference style:** `background-color: rgb(255 0 0 / 1)`
- **Currently set by:** the element's style attribute, `background-color: rgb(255, 255, 255)`

## 2. Corner radius

- **Kind:** Style
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the corner radius from 12px to 4px.
- **Reference style:** `border-radius: 4px`
- **Currently set by:** the element's style attribute, `border-radius: 12px`

## 3. Corner radius

- **Kind:** Style
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** below 600px only (`@media (width < 600px)`), as the designer changed it in a narrower view. Make it apply at these widths only, the way the project already writes breakpoints (Tailwind's responsive prefixes, its media queries), and leave the layer as it is at every other width. Its value before is what it showed at these widths.
- **Design intent:** Change the corner radius from 4px to 20px.
- **Reference style:** `border-radius: 20px`
- **Currently set by:** the element's style attribute, `border-radius: 12px`

## 4. Opacity

- **Kind:** Style
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** below 600px only (`@media (width < 600px)`), as the designer changed it in a narrower view. Make it apply at these widths only, the way the project already writes breakpoints (Tailwind's responsive prefixes, its media queries), and leave the layer as it is at every other width. Its value before is what it showed at these widths.
- **Design intent:** Change the opacity from 100% to 80%.
- **Reference style:** `opacity: 0.8`
- **Currently set by:** nothing: the browser default applies

## 5. Fill

- **Kind:** Style
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** 600px to 799px only (`@media (600px <= width < 800px)`), as the designer changed it in a narrower view. Make it apply at these widths only, the way the project already writes breakpoints (Tailwind's responsive prefixes, its media queries), and leave the layer as it is at every other width. Its value before is what it showed at these widths.
- **Design intent:** Change the fill from #FF0000 to #0000FF.
- **Reference style:** `background-color: rgb(0 0 255 / 1)`
- **Currently set by:** the element's style attribute, `background-color: rgb(255, 255, 255)`

## 6. Corner radius

- **Kind:** Style
- **Layer:** App, `<main>` (Page › App)
- **Location:** `src/App.tsx:2:5`
- **Scope:** **Usage not determined.** App is used from code Human Touch could not locate. Change only the usage the layer is in, found from its place on the page (Layer, above), and leave the other usages of App as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the corner radius from 0px to 6px.
- **Reference style:** `border-radius: 6px`
- **Currently set by:** nothing: the browser default applies

## 7. Absolute

- **Kind:** Absolute
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Take it out of the layout of App (`<main>`, at `src/App.tsx:2:5`), where it is 4th, and place it absolute in the same Frame, at X 10px and Y 400px from the Frame's top left (CSS `left` and `top`). Make the Frame its positioning reference (`position: relative`) if it is not one already.
- **Data change:** the layer is one of the 4 instances a loop renders, so its place comes from the order of the data the loop goes through. Reorder the data where it is written in the code; if the data comes from outside the code (an API, a CMS), say so in the report.
- **Reference style:** `position: absolute`, `left: 10px`, `top: 400px`, `right: auto`, `bottom: auto`, `width: 142px`, `height: 80px`

## 8. Delete

- **Kind:** Delete
- **Layer:** Card, `<article>` (Page › App › Card)
- **Location:** `src/Card.tsx:3:5`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 4 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Delete this layer, and all in it, from App (`<main>`, at `src/App.tsx:2:5`), where it is 4th.
- **Data change:** the layer is one of the 4 instances a loop renders: take its item out of the data the loop goes through. If the data comes from outside the code (an API, a CMS), say so in the report.
- **Reference style:** none: the layer goes

## 9. Duplicate

- **Kind:** Duplicate
- **Layer:** Card 1, `<h3>` (Page › App › Card › Card 1)
- **Location:** `src/Card.tsx:4:7`
- **Scope:** This usage only: Card used at `src/App.tsx:6:9`, inside App used at an undetermined place. It renders 3 instances, which change together. Other usages of Card stay as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Copy this layer, with all in it, and put the copy in the layout of Card (`<article>`, at `src/Card.tsx:3:5`, in Card used at `src/App.tsx:6:9`), as its 2nd layer.
- **Reference style:** none: the copy is as the layer is

## 10. Fill

- **Kind:** Style
- **Layer:** Button, `<button>` (Page › App › Card › Button)
- **Location:** `src/Button.tsx:2:3`
- **Scope:** The component itself: Button. Change Button where it writes the layer, at Location (`src/Button.tsx:2:3`), so every usage of Button shows it, not only the usage the designer made it on (`src/Card.tsx:5:7`, inside Card used at `src/App.tsx:6:9`, inside App used at an undetermined place). Changes listed for one usage only stay with that usage.
- **Breakpoint:** all breakpoints.
- **Design intent:** Change the fill from #C8C8C8 to #00FF00.
- **Reference style:** `background-color: rgb(0 255 0 / 1)`
- **Currently set by:** the element's style attribute, `background-color: rgb(200, 200, 200)`

## 11. Delete

- **Kind:** Delete
- **Layer:** App, `<aside>` (Page › App)
- **Location:** `src/App.tsx:10:5`
- **Scope:** **Usage not determined.** App is used from code Human Touch could not locate. Change only the usage the layer is in, found from its place on the page (Layer, above), and leave the other usages of App as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Delete this layer, and all in it, from Page (`<body>`, not located, at Page on the page), where it is 2nd.
- **Put back:** the layer was moved off the canvas and is put back in change 12. Do not delete its code: move it to where change 12 puts it.
- **Reference style:** none: the layer goes

## 12. Put back

- **Kind:** Put back
- **Layer:** App, `<aside>`, moved off the canvas, put back in App (`<main>`, at `src/App.tsx:2:5`)
- **Location:** `src/App.tsx:2:5`
- **Scope:** **Usage not determined.** App is used from code Human Touch could not locate. Change only the usage the layer is in, found from its place on the page (Layer, above), and leave the other usages of App as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Put this layer back, moved off the canvas this round (change 11): its code is still where it was. Move that code here rather than deleting it and writing it again, in the layout of App (`<main>`, at `src/App.tsx:2:5`), as its 2nd layer: the Grid's 2nd cell.
- **Source:** not kept: the layer had no source of its own when moved off the canvas. Write it from its look, below, as the project writes markup and styles.
- **Look**, as it was off the canvas, every style it had written onto it (its classes as they were, in `data-ht-class`). Where its classes no longer give it this look, their rules gone with its code, give it the styles that do, as the project writes styles:

  ```html
  <html><head><style data-ht-look-styles="">[data-ht-look="0"]{column-gap:4px;display:flex;height:auto;perspective-origin:400px 11px;row-gap:4px;transform-origin:400px 11px;unicode-bidi:isolate;width:800px;top:auto;right:auto;bottom:auto;left:auto;margin-top:0px;margin-right:0px;margin-bottom:0px;margin-left:0px;float:none}[data-ht-look="1"]{background-color:rgb(230, 230, 230);column-gap:normal;display:block;height:auto;min-height:auto;min-width:auto;padding-bottom:2px;padding-left:2px;padding-right:2px;padding-top:2px;perspective-origin:23.5625px 11px;row-gap:normal;transform-origin:23.5625px 11px;unicode-bidi:normal;width:auto}[data-ht-look="2"]{background-color:rgb(230, 230, 230);column-gap:normal;display:block;height:auto;min-height:auto;min-width:auto;padding-bottom:2px;padding-left:2px;padding-right:2px;padding-top:2px;perspective-origin:23.5625px 11px;row-gap:normal;transform-origin:23.5625px 11px;unicode-bidi:normal;width:auto}[data-ht-look="3"]{background-color:rgb(230, 230, 230);column-gap:normal;display:block;height:auto;min-height:auto;min-width:auto;padding-bottom:2px;padding-left:2px;padding-right:2px;padding-top:2px;perspective-origin:23.5625px 11px;row-gap:normal;transform-origin:23.5625px 11px;unicode-bidi:normal;width:auto}</style><style data-ht-edit-styles="" data-ht-rules-for="1" data-ht-rules="{&quot;lifted&quot;:{},&quot;edits&quot;:{&quot;base&quot;:{&quot;style&quot;:{&quot;background-color&quot;:&quot;rgb(255 0 0 / 1)&quot;}},&quot;at&quot;:[]}}">@layer human-touch-edits{[data-ht-style="1"]{background-color:rgb(255 0 0 / 1)!important}}</style><style data-ht-edit-styles="" data-ht-rules-for="2" data-ht-rules="{&quot;lifted&quot;:{},&quot;edits&quot;:{&quot;base&quot;:{&quot;style&quot;:{&quot;background-color&quot;:&quot;rgb(255 0 0 / 1)&quot;}},&quot;at&quot;:[]}}">@layer human-touch-edits{[data-ht-style="2"]{background-color:rgb(255 0 0 / 1)!important}}</style><style data-ht-edit-styles="" data-ht-rules-for="3" data-ht-rules="{&quot;lifted&quot;:{},&quot;edits&quot;:{&quot;base&quot;:{&quot;style&quot;:{&quot;background-color&quot;:&quot;rgb(255 0 0 / 1)&quot;}},&quot;at&quot;:[]}}">@layer human-touch-edits{[data-ht-style="3"]{background-color:rgb(255 0 0 / 1)!important}}</style></head><body><aside data-ht-loc="src/App.tsx:10:5" data-ht-chain="[{&quot;component&quot;:&quot;App&quot;,&quot;usage&quot;:null,&quot;thirdParty&quot;:false}]" data-ht-look="0">
      <span data-ht-loc="src/Chip.tsx:2:3" data-ht-chain="[{&quot;component&quot;:&quot;Chip&quot;,&quot;usage&quot;:&quot;src/App.tsx:11:9&quot;,&quot;thirdParty&quot;:false},{&quot;component&quot;:&quot;App&quot;,&quot;usage&quot;:null,&quot;thirdParty&quot;:false}]" data-ht-look="1" data-ht-original-style="" data-ht-style="1" data-ht-layer="1">Chip 1</span><span data-ht-loc="src/Chip.tsx:2:3" data-ht-chain="[{&quot;component&quot;:&quot;Chip&quot;,&quot;usage&quot;:&quot;src/App.tsx:11:9&quot;,&quot;thirdParty&quot;:false},{&quot;component&quot;:&quot;App&quot;,&quot;usage&quot;:null,&quot;thirdParty&quot;:false}]" data-ht-look="2" data-ht-original-style="" data-ht-style="2" data-ht-layer="1">Chip 2</span><span data-ht-loc="src/Chip.tsx:2:3" data-ht-chain="[{&quot;component&quot;:&quot;Chip&quot;,&quot;usage&quot;:&quot;src/App.tsx:11:9&quot;,&quot;thirdParty&quot;:false},{&quot;component&quot;:&quot;App&quot;,&quot;usage&quot;:null,&quot;thirdParty&quot;:false}]" data-ht-look="3" data-ht-original-style="" data-ht-style="3" data-ht-layer="1">Chip 3</span>
    </aside></body></html>
  ```
- **Edited off the canvas:** give it these too, as the designer made them there:
  - Fill of Chip (`<span>`): Change the fill from #E6E6E6 to #FF0000.
- **Reference style:** none: it is to look as its look shows

## 13. Delete

- **Kind:** Delete
- **Layer:** App, `<section>` (Page › App)
- **Location:** `src/App.tsx:14:5`
- **Scope:** **Usage not determined.** App is used from code Human Touch could not locate. Change only the usage the layer is in, found from its place on the page (Layer, above), and leave the other usages of App as they are.
- **Breakpoint:** all breakpoints.
- **Design intent:** Delete this layer, and all in it, from Page (`<body>`, not located, at Page on the page), where it is 2nd.
- **Reference style:** none: the layer goes

