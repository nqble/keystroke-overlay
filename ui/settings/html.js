// =====================================================================================================================
//  Preact with htm: the one place screens import them from (docs/proposals/v2-preact.md). Write markup as
//    html`<button class="primary" onClick=${copy}>${TEXT.copy}</button>`
//  and keep state with the hooks. The libraries are copies in ./vendor/ (pinned, never fetched); update them only with
//  tools/vendor.mjs. Plain logic stays in plain, unit-tested functions; components only draw.
// =====================================================================================================================
import { h, render } from './vendor/preact.module.js';
import htm from './vendor/htm.module.js';

export { render };
// useLayoutEffect runs before the browser draws: for a part filled in by plain page code (a note, a control group), so
// the page never shows it empty and has its full height when a tab's scroll position is restored.
export { useEffect, useLayoutEffect, useRef, useState } from './vendor/hooks.module.js';

/** Markup as a tagged template, turned into Preact elements: html`<p>${text}</p>`. */
export const html = htm.bind(h);
