// =====================================================================================================================
//  Keystroke Overlay: the Debug tab (developer tools), shown only while General → Advanced → "Debug mode" is on, and only
//  then loaded (tabs/index.js). The Rust half is src-tauri/src/debug.rs. Full guide: docs/DEBUGGING.md.
//
//  PRIVACY: nothing here is saved to disk or sent anywhere. The event log is the app's own memory and records what the
//  app did, never which keys you pressed. The Key monitor shows key presses, so it only runs when you press Start, and
//  stops by itself after 60 seconds or when you leave this tab.
//
//  HOW TO ADD A DEBUG TOOL (about ten lines):
//    1. A new file here exporting { id: 'my-tool', title: 'My tool', build() { return [ ...page elements... ]; } },
//       and its name in SECTIONS below.
//    2. Need data from the app? Add a #[tauri::command] in src-tauri/src/debug.rs, list it in main.rs, then call it with
//       await invoke('my_command', { arg })
//    3. Need something to refresh by itself? every(root, 2000, () => { ...update the page... }) from shared.js.
// =====================================================================================================================
import { el, heading, invoke, note } from '../helpers.js';
import { render } from '../settings.js';
import { layouts, setTab, settings } from '../state.js';
import { TEXT } from './shared.js';
import { thisApp } from './this-app.js';
import { selfTest } from './self-test.js';
import { eventLog } from './event-log.js';
import { keyMonitor } from './key-monitor.js';
import { rawSettings } from './raw-settings.js';
import { testHelpers } from './test-helpers.js';
import { developerTools } from './developer-tools.js';
import { bugReportSection } from './bug-report.js';

/** A titled box. `id` goes into data-card, so the tests can pick one box without reading its title. */
function card(id, title, ...content) {
  const box = el(
    'section',
    { className: 'dbg-card', test: 'debug-card' },
    el('h3', { textContent: title, test: 'debug-card-title' }),
    content.flat(),
  );
  box.dataset.card = id;
  return box;
}

// The sections, top to bottom. A new debug tool is a new file in this folder and one line here.
const SECTIONS = [thisApp, selfTest, eventLog, keyMonitor, rawSettings, testHelpers, developerTools, bugReportSection];

// -------------------------------------------------------------------------------------------------------------------
async function renderDebugTab() {
  // Handy from the inspector's console (see "Developer tools" above).
  window.ko = {
    invoke,
    info: () => invoke('debug_info'),
    log: () => invoke('debug_log'),
    state: () => invoke('get_state'),
    settings: () => settings,
    layouts: () => layouts,
    goto: (name) => {
      setTab(name);
      render();
    },
  };
  const page = el('div', { className: 'debug' }, heading('Debug'), note(TEXT.debugToolsIntro));
  for (const section of SECTIONS) page.append(card(section.id, section.title, section.build()));
  return page;
}

export const debugTab = { name: 'Debug', render: renderDebugTab };
