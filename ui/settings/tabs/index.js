// =====================================================================================================================
//  Every tab, in the order the tab bar shows them: the one place to add, remove or reorder a tab (docs/EXTENDING.md).
//  A tab is its own file in this folder plus one line here. `render` returns the tab's content as a Preact element
//  (docs/for-claude/proposals/done/v2-preact.md), which settings.js draws.
//  `debugOnly` tabs show only in Debug mode, and their code loads only then. `hidesPreview` hides the live preview
//  above the tabs while the tab is open (the Keys tab shows the keyboard itself).
// =====================================================================================================================
import { animationTab } from './animation.js';
import { generalTab } from './general.js';
import { keysTab } from './keys.js';
import { layoutTab } from './layout.js';
import { styleTab } from './style.js';

const loadDebugTab = async () => (await import('../debug/index.js')).debugTab.render();

export const TABS = [
  { id: 'layout', name: 'Layout', render: layoutTab },
  { id: 'keys', name: 'Keys', render: keysTab, hidesPreview: true },
  { id: 'style', name: 'Style', render: styleTab },
  { id: 'animation', name: 'Animation', render: animationTab },
  { id: 'general', name: 'General', render: generalTab },
  { id: 'debug', name: 'Debug', render: loadDebugTab, debugOnly: true },
];

/** The tabs to show: every tab, plus the Debug-only ones while Debug mode is on. */
export const visibleTabs = (debugMode) => TABS.filter((tab) => debugMode || !tab.debugOnly);

/** The tab with this id, if it is one we show now (a request from the tray may name any tab). */
export const findTab = (id, debugMode = false) => visibleTabs(debugMode).find((tab) => tab.id === id);
