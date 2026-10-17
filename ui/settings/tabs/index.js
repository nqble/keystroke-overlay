// =====================================================================================================================
//  The list of tabs: the ONE place that says which tabs the settings window has, in what order, and what they are called.
//  The tab bar, the tray's "go to tab" message and the start-up check all read this list.
//
//  HOW TO ADD A TAB: write its file in this folder (it exports a function that returns the tab's page), then add one line
//  below. Nothing else needs to change. (The optional Debug tab is not listed here: debug.js is loaded only in Debug mode.)
//
//  Meant to be reused: this file only lists { id, name, render } entries and knows nothing about what a tab shows.
// =====================================================================================================================
import { animationTab } from './animation.js';
import { fontsTab } from './fonts.js';
import { generalTab } from './general.js';
import { keysTab } from './keys.js';
import { layoutTab } from './layout.js';
import { styleTab } from './style.js';

/**
 * `keep: true` means the built page is kept while nothing changes, so coming back to the tab is instant. Any change to the
 * settings throws the kept pages away (see forgetPages in settings.js). Leave it off for a tab whose page changes by itself
 * (General shows update progress; the Keys tab is sized to the window).
 * @type {{ id: string, name: string, render: () => Node | Promise<Node>, keep?: boolean }[]}
 */
export const TABS = [
  { id: 'layout', name: 'Layout', render: layoutTab, keep: true },
  { id: 'keys', name: 'Keys', render: keysTab },
  { id: 'style', name: 'Style', render: styleTab, keep: true },
  { id: 'animation', name: 'Animation', render: animationTab, keep: true },
  { id: 'fonts', name: 'Fonts', render: fontsTab, keep: true },
  { id: 'general', name: 'General', render: generalTab },
];

/** True when `id` is one of the always-present tabs. */
export const isTab = (id) => TABS.some((tab) => tab.id === id);
