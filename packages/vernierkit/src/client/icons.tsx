/** @jsxImportSource preact */
/*!
 * The icons are Hugeicons (Stroke Rounded, free), https://hugeicons.com
 *
 * MIT License
 *
 * Copyright (c) 2025 Hugeicons
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { role, type Layer } from "./layers";

/**
 * Hugeicons Stroke Rounded, as Iconify serves them: the markup inside a 24px
 * square, drawn in the current text color. Shown at 16px, the 1.5 stroke is 1px.
 * Each is named for what it shows here, and above it, its Hugeicons name.
 */
const ICONS: Record<string, string> = {
  // layout-2-row
  "stack-vertical": '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M20.109 3.891C21.5 5.282 21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391"/><path d="M21.5 12h-19"/></g>',
  // layout-2-column
  "stack-horizontal": '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M3.891 3.891C5.282 2.5 7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12c0-4.478 0-6.718 1.391-8.109"/><path d="M12 2.5v19"/></g>',
  // grid-view
  grid: '<path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="M3.889 9.663C4.393 10 5.096 10 6.5 10s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C10 8.607 10 7.904 10 6.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C8.607 3 7.904 3 6.5 3s-2.107 0-2.611.337a2 2 0 0 0-.552.552C3 4.393 3 5.096 3 6.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm11 0C15.393 10 16.096 10 17.5 10s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C21 8.607 21 7.904 21 6.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C19.607 3 18.904 3 17.5 3s-2.107 0-2.611.337a2 2 0 0 0-.552.552C14 4.393 14 5.096 14 6.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm-11 11C4.393 21 5.096 21 6.5 21s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C10 19.607 10 18.904 10 17.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C8.607 14 7.904 14 6.5 14s-2.107 0-2.611.337a2 2 0 0 0-.552.552C3 15.393 3 16.096 3 17.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm11 0C15.393 21 16.096 21 17.5 21s2.107 0 2.611-.337c.218-.146.406-.334.552-.552C21 19.607 21 18.904 21 17.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C19.607 14 18.904 14 17.5 14s-2.107 0-2.611.337a2 2 0 0 0-.552.552C14 15.393 14 16.096 14 17.5s0 2.107.337 2.611c.146.218.334.406.552.552Z"/>',
  // frame
  frame: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 6h20M2 18h20M6 22V2m12 20V2"/>',
  // text
  text: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path stroke-linejoin="round" d="M15 21.001H9"/><path d="M12 3v18m0-18c1.387 0 3.17.03 4.588.176c.6.062.9.093 1.166.202a2.05 2.05 0 0 1 1.165 1.299C19 4.954 19 5.27 19 5.902M12 3c-1.387 0-3.17.03-4.588.176c-.6.062-.9.093-1.166.202A2.05 2.05 0 0 0 5.08 4.677C5 4.954 5 5.27 5 5.902"/></g>',
  // image-03
  image: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M14 3h-4C6.229 3 4.343 3 3.172 4.172S2 7.229 2 11v2c0 3.771 0 5.657 1.172 6.828S6.229 21 10 21h4c3.771 0 5.657 0 6.828-1.172S22 16.771 22 13v-2c0-3.771 0-5.657-1.172-6.828S17.771 3 14 3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21.5 17l-5.152-5.62a1.17 1.17 0 0 0-1.69-.037L10 16l-2.16-2.16a1.16 1.16 0 0 0-1.686.049L2.5 18"/></g>',
  // play-square
  still: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linejoin="round" d="M14.953 12.395c-.151.627-.867 1.07-2.3 1.955c-1.383.856-2.075 1.285-2.633 1.113a1.4 1.4 0 0 1-.61-.393C9 14.62 9 13.746 9 12s0-2.62.41-3.07c.17-.186.38-.321.61-.392c.558-.173 1.25.256 2.634 1.112c1.432.886 2.148 1.329 2.3 1.955a1.7 1.7 0 0 1 0 .79Z"/><path d="M2.5 12c0-4.478 0-6.718 1.391-8.109S7.521 2.5 12 2.5c4.478 0 6.718 0 8.109 1.391S21.5 7.521 21.5 12c0 4.478 0 6.718-1.391 8.109S16.479 21.5 12 21.5c-4.478 0-6.718 0-8.109-1.391S2.5 16.479 2.5 12Z"/></g>',
  // component
  instance: '<path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="M9.197 6.84c.138.278.395.536.911 1.052s.774.773 1.052.911c.53.263 1.15.263 1.68 0c.278-.138.536-.395 1.052-.911s.773-.774.911-1.052c.263-.53.263-1.15 0-1.68c-.138-.278-.395-.536-.911-1.052s-.774-.773-1.052-.911a1.9 1.9 0 0 0-1.68 0c-.278.138-.536.395-1.052.911s-.773.774-.911 1.052a1.9 1.9 0 0 0 0 1.68Zm-6 6c.138.278.395.536.911 1.052s.774.773 1.052.911c.53.263 1.15.263 1.68 0c.278-.138.536-.395 1.052-.911s.773-.774.911-1.052c.263-.53.263-1.15 0-1.68c-.138-.278-.395-.536-.911-1.052s-.774-.773-1.052-.911a1.9 1.9 0 0 0-1.68 0c-.278.138-.536.395-1.052.911s-.773.774-.911 1.052a1.9 1.9 0 0 0 0 1.68Zm12 0c.138.278.395.536.911 1.052s.774.773 1.052.911c.53.263 1.15.263 1.68 0c.278-.138.536-.395 1.052-.911s.773-.774.911-1.052c.263-.53.263-1.15 0-1.68c-.138-.278-.395-.536-.911-1.052s-.774-.773-1.052-.911a1.9 1.9 0 0 0-1.68 0c-.278.138-.536.395-1.052.911s-.773.774-.911 1.052a1.9 1.9 0 0 0 0 1.68Zm-6 6c.138.278.395.536.911 1.052s.774.773 1.052.911c.53.263 1.15.263 1.68 0c.278-.138.536-.395 1.052-.911s.773-.774.911-1.052c.263-.53.263-1.15 0-1.68c-.138-.278-.395-.536-.911-1.052s-.774-.773-1.052-.911a1.9 1.9 0 0 0-1.68 0c-.278.138-.536.395-1.052.911s-.773.774-.911 1.052a1.9 1.9 0 0 0 0 1.68Z"/>',
  // square-lock-02
  lock: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12 14.5v3m1-3a1 1 0 1 1-2 0a1 1 0 0 1 2 0M16.5 9V6.5a4.5 4.5 0 1 0-9 0V9"/><path d="M4.268 18.845c.225 1.67 1.608 2.979 3.292 3.056c1.416.065 2.855.099 4.44.099s3.024-.034 4.44-.1c1.684-.076 3.067-1.385 3.292-3.055c.147-1.09.268-2.207.268-3.345s-.121-2.255-.268-3.345c-.225-1.67-1.608-2.979-3.292-3.056A95 95 0 0 0 12 9c-1.585 0-3.024.034-4.44.1c-1.684.076-3.067 1.385-3.292 3.055C4.12 13.245 4 14.362 4 15.5s.121 2.255.268 3.345"/></g>',
  // square-round-corner
  radius: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 15c0 2.339 0 3.508-.537 4.362a3.5 3.5 0 0 1-1.1 1.102C18.507 21 17.338 21 15 21h-5c-3.3 0-4.95 0-5.975-1.025S3 17.3 3 14V9c0-2.339 0-3.508.536-4.362a3.5 3.5 0 0 1 1.102-1.102C5.492 3 6.66 3 9 3m12 8c-.262-2.668-.855-4.464-2.196-5.804C17.464 3.856 15.668 3.262 13 3"/>',
  // plus-sign
  plus: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"/>',
  // minus-sign
  minus: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 12H4"/>',
  // align-horizontal-space-between
  gap: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 2v20M5 2v20M5 7.5v8.997c0 .465 0 .697.038.89A2 2 0 0 0 6.61 18.96c.193.038.425.038.89.038s.697 0 .89-.038a2 2 0 0 0 1.572-1.572c.038-.193.038-.425.038-.89V7.5c0-.465 0-.697-.038-.89A2 2 0 0 0 8.39 5.038C8.197 5 7.965 5 7.5 5s-.697 0-.89.038A2 2 0 0 0 5.038 6.61C5 6.803 5 7.035 5 7.5m9 3v2.997c0 .465 0 .697.038.89a2 2 0 0 0 1.572 1.572c.193.038.425.038.89.038s.697 0 .89-.038a2 2 0 0 0 1.572-1.572c.038-.193.038-.425.038-.89V10.5c0-.465 0-.697-.038-.89a2 2 0 0 0-1.572-1.572C17.197 8 16.965 8 16.5 8s-.697 0-.89.038a2 2 0 0 0-1.572 1.572c-.038.193-.038.425-.038.89"/>',
  // cancel-01
  close: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 6L6 18m12 0L6 6"/>',
  // transparency
  opacity: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 9A7 7 0 1 1 2 9a7 7 0 0 1 14 0Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M8.026 15.607a7 7 0 0 1 7.821-7.556m3.15 1.202a7 7 0 1 1-9.744 9.744"/><path d="m6.5 2.5l9 9m-13-5l9 9"/></g>',
  // undo-02
  undo: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12 21A9 9 0 1 0 4.204 7.5"/><path d="M3 3v1.278c0 2.192 0 3.288.707 3.887c.708.6 1.789.42 3.95.059L9 8"/></g>',
  // sidebar-left
  sidebar: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12c0-3.69 0-5.534.814-6.841a4.8 4.8 0 0 1 1.105-1.243C5.08 3 6.72 3 10 3h4c3.28 0 4.919 0 6.081.916c.43.338.804.759 1.105 1.243C22 6.466 22 8.31 22 12s0 5.534-.814 6.841a4.8 4.8 0 0 1-1.105 1.243C18.92 21 17.28 21 14 21h-4c-3.28 0-4.919 0-6.081-.916a4.8 4.8 0 0 1-1.105-1.243C2 17.534 2 15.69 2 12Z"/><path stroke-linejoin="round" d="M9.5 3v18"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 7h1m-1 3h1"/></g>',
  // play
  play: '<path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="M18.89 12.846c-.353 1.343-2.023 2.292-5.364 4.19c-3.23 1.835-4.845 2.752-6.146 2.384a3.25 3.25 0 0 1-1.424-.841C5 17.614 5 15.743 5 12s0-5.614.956-6.579a3.25 3.25 0 0 1 1.424-.84c1.301-.37 2.916.548 6.146 2.383c3.34 1.898 5.011 2.847 5.365 4.19a3.3 3.3 0 0 1 0 1.692Z"/>',
  // cursor-01
  pointer: '<path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5" d="m5.108 14.386l.478-6.473q.048-.666.086-1.251c.178-2.678.273-4.103 1.376-4.552c1.103-.45 2.154.51 4.13 2.312q.43.393.924.839l4.808 4.322c1.353 1.215 2.029 1.823 2.083 2.406c.038.4-.086.797-.344 1.103c-.376.447-1.276.555-3.075.773c-.758.091-1.137.137-1.367.339a1 1 0 0 0-.315.536c-.064.3.079.656.365 1.37l1.482 3.696c.172.427.257.64.256.837a1 1 0 0 1-.296.703c-.14.138-.352.224-.776.396s-.636.26-.83.258a.98.98 0 0 1-.7-.299c-.136-.14-.221-.354-.393-.78l-1.482-3.697c-.286-.713-.43-1.07-.683-1.24a1 1 0 0 0-.596-.165c-.304.015-.608.247-1.217.712c-1.444 1.103-2.167 1.654-2.745 1.596c-.396-.04-.76-.24-1.009-.553c-.362-.457-.295-1.368-.16-3.188Z"/>',
  // sticky-note-03
  brief: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M14 20.5V20c0-2.828 0-4.243.879-5.121C15.757 14 17.172 14 20 14h.5"/><path d="M13 3h-2C7.229 3 5.343 3 4.172 4.172S3 7.229 3 11v2c0 3.771 0 5.657 1.172 6.828S7.229 21 11 21h1.343c.818 0 1.226 0 1.594-.152s.657-.441 1.235-1.02l4.656-4.656c.579-.578.867-.867 1.02-1.235c.152-.368.152-.776.152-1.594V11c0-3.771 0-5.657-1.172-6.828S16.771 3 13 3"/></g>',
};

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg class="vk-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

export function LayerIcon({ layer }: { layer: Layer }) {
  if (role(layer) === "locked") return <Icon name="lock" />;
  if (role(layer) === "instance") return <Icon name="instance" />;
  if (layer.kind === "stack") return <Icon name={layer.direction === "horizontal" ? "stack-horizontal" : "stack-vertical"} />;
  return <Icon name={layer.kind} />;
}
