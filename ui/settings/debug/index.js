// =====================================================================================================================
//  Keystroke Overlay: the Debug tab (developer tools), shown only while General → Advanced → "Debug mode" is on, and only
//  then loaded (tabs/index.js). The Rust half is src-tauri/src/debug.rs. Full guide: docs/DEBUGGING.md.
//
//  PRIVACY: nothing here is saved to disk or sent anywhere. The event log is the app's own memory and records what the
//  app did, never which keys you pressed. The Key monitor shows key presses, so it only runs when you press Start, and
//  stops by itself after 60 seconds or when you leave this tab.
//
//  Preact, like the other tabs (html.js); each section is a small component in its own file.
//
//  HOW TO ADD A DEBUG TOOL (about ten lines):
//    1. A new file here exporting { id: 'my-tool', title: 'My tool', Body: MyTool }, where MyTool is a component
//       (html`...`, with Button, Hint and Facts from shared.js), and its name in SECTIONS below.
//    2. Need data from the app? Add a #[tauri::command] in src-tauri/src/debug.rs, list it in main.rs, then call it with
//       await invoke('my_command', { arg })
//    3. Need something to refresh by itself? useEvery(2000, async () => { ...set state... }) from shared.js: it runs only
//       while the tab is open.
// =====================================================================================================================
import { invoke } from '../helpers.js';
import { html } from '../html.js';
import { render } from '../settings.js';
import { layouts, setTab, settings } from '../state.js';
import { Hint, TEXT } from './shared.js';
import { thisApp } from './this-app.js';
import { selfTest } from './self-test.js';
import { eventLog } from './event-log.js';
import { keyMonitor } from './key-monitor.js';
import { rawSettings } from './raw-settings.js';
import { testHelpers } from './test-helpers.js';
import { developerTools } from './developer-tools.js';
import { bugReportSection } from './bug-report.js';

// The sections, top to bottom. A new debug tool is a new file in this folder and one line here.
const SECTIONS = [thisApp, selfTest, eventLog, keyMonitor, rawSettings, testHelpers, developerTools, bugReportSection];

/** A titled box. `id` goes into data-card, so the tests can pick one box without reading its title. */
function Card({ section }) {
  return html`<section class="dbg-card" data-test="debug-card" data-card=${section.id}>
    <h3 data-test="debug-card-title">${section.title}</h3>
    <${section.Body} />
  </section>`;
}

/** Shortcuts for the inspector's console (see "Developer tools"): ko.info(), ko.log(), ko.settings(), ko.goto('style'). */
function installConsoleShortcuts() {
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
}

function DebugTab() {
  return html`<div class="debug">
    <h2 data-test="section-heading">Debug</h2>
    <${Hint} text=${TEXT.debugToolsIntro} />
    ${SECTIONS.map((section) => html`<${Card} key=${section.id} section=${section} />`)}
  </div>`;
}

function renderDebugTab() {
  installConsoleShortcuts();
  return html`<${DebugTab} />`;
}

export const debugTab = { name: 'Debug', render: renderDebugTab };
