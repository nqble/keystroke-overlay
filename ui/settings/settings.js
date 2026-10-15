// =====================================================================================================================
//  Keystroke Overlay: the settings window.
//  Plain JavaScript, one file, no build step. Read it top to bottom; every section says what it is for.
//
//  TABLE OF CONTENTS
//    1. Shared state                  what the window remembers while it is open
//    2. Small helpers                 building page elements, toasts, talking to the Rust side
//    3. Saving and the live preview   how a change reaches the app, the overlay and the disk
//    4. Per-layout key edits          hidden keys and custom labels, stored separately for every layout
//    5. Style / Animation controls    the table that draws every slider, colour picker and dropdown
//    6. Popups                        dialogs, the right-click menu, release notes, the update dialog
//    7. The six tabs                  Layout, Keys, Style, Animation, Fonts, General
//    8. Drawing the window            the tab bar and the active tab
//    9. Messages from the app         tray actions, update results, download progress
//   10. OBS link and preview          the address bar, copy button, preview scaling, window buttons
//   11. Start-up                      what happens when the window opens
//
//  HOW TO ADD A SETTING: add a line to CONTROLS (section 5); it is drawn automatically. Also add its default value
//  in src-tauri/src/settings.rs and, if the overlay uses it, read it in ui/overlay/overlay.js.
// =====================================================================================================================

// ---------------------------------------------------------------------------------------------------------------------
// 1. Shared state
// ---------------------------------------------------------------------------------------------------------------------
const { invoke } = window.__TAURI__.core; // call a Rust command:  await invoke('name', { args })
const ev = window.__TAURI__.event; // listen for messages the Rust side sends us
const $ = (selector, root = document) => root.querySelector(selector);

let S = null; // the current settings (a copy of what the app keeps on disk)
let layouts = []; // every layout: [{ id, name, keys, user }]
let customFonts = []; // font files the user added
let reg = { animations: [], themes: [], easings: [], layouts: [] }; // lists the live preview sends us
let tab = 'layout'; // which tab is showing
let selKey = null; // the key selected in the Keys tab
let booted = false; // true once the first screen is drawn
let obsUrl = '',
  size = null,
  appVersion = '',
  paused = false;
let lastUpdate = null; // the latest "is there an update?" answer
let upProg = null; // download progress while an update installs
let inputActive = 'hook',
  inputError = null;

const MAX_LAYOUTS = 20; // how many layouts of their own a user may have (must match the Rust side)
const TAB_NAMES = {
  layout: 'Layout',
  keys: 'Keys',
  style: 'Style',
  animation: 'Animation',
  fonts: 'Fonts',
  general: 'General',
};
const WINDOWS_FONTS = [
  // all of these come with Windows 10 and 11
  'Segoe UI',
  'Segoe UI Semibold',
  'Segoe UI Black',
  'Bahnschrift',
  'Arial',
  'Arial Black',
  'Calibri',
  'Candara',
  'Cascadia Code',
  'Cascadia Mono',
  'Consolas',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Georgia',
  'Impact',
  'Lucida Console',
  'Palatino Linotype',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Comic Sans MS',
];

// ---------------------------------------------------------------------------------------------------------------------
// Words the user reads. The longer explanations live here, so the code below stays short and the wording is easy to
// find.
// ---------------------------------------------------------------------------------------------------------------------
const TEXT = {
  layoutLimitReached: (max) =>
    `You can make up to ${max} layouts of your own. Right-click one you no longer need and choose ` +
    `Delete layout to free a spot.`,
  newLayoutHelp: 'It starts as the full-size keyboard. You then pick which keys to keep or hide on the Keys tab.',
  resetBodyWhatChanges:
    'Style, animation, key edits, keyboard input, secure link, start-with-Windows and the other ' +
    'options go back to their defaults. Your own layouts, presets and fonts are kept, and so is your ' +
    'port.',
  resetBodyLinkNote:
    'If the secure link was on, your OBS link goes back to the plain address, so paste it into OBS ' + 'again.',
  manualInstallDialog:
    'This update needs a manual install: download the new installer from GitHub, close this app, and ' +
    'run it. Your settings are kept.',
  layoutTabHelp:
    'Pick a layout, or click + to make your own from the full-size keyboard. Right-click a layout you ' +
    'made to delete it.',
  keysTabHelp:
    'Click a key to edit it, drag it to move it. Disabled keys are hidden in the overlay. Changes are ' +
    'saved automatically for each layout.',
  animationTabNote:
    'Only transform and opacity are animated (GPU friendly). Click keys in the preview to try an ' + 'animation.',
  fontsTabHelp:
    'Add TTF, OTF or WOFF files. They are copied into the app’s fonts folder. After adding, pick it ' +
    'in Style → Font family (under “Your fonts”), or click Use.',
  keyEditorTip:
    'Tip: use symbols like ⎵ or ↑, or words like "Jump". Drag a key on the keyboard to move it, or ' +
    'select it and use the arrow keys (Shift moves a whole key).',
  serverNote:
    'The server only listens on 127.0.0.1 (this PC). Keystrokes are never saved or sent anywhere. OBS ' +
    'reconnects by itself after a restart.',
  secureLinkOff:
    '**Off (default):** your OBS link is simple and needs no extra step. Any program running on this ' +
    'PC can read your key presses through it. Turn this on if you share the PC or want that closed.',
  secureLinkOn:
    '**On:** your OBS link now contains a private key, and only a program that knows the full link ' +
    'can read your key presses. **Copy the new link into your OBS Browser Source once** — the old ' +
    'link stops working. Keep the link off your stream. “Make a new key” cuts off anyone who has the ' +
    'old one.',
  inputStandard:
    '**Standard** is what the app has always used: it listens to your keys through a Windows keyboard ' +
    'hook. It works with nearly every game, so keep it unless keys stop lighting up in one particular ' +
    'game.',
  inputCompatibility:
    '**Compatibility** reads your keys straight from the keyboard (Windows Raw Input) instead of ' +
    'hooking into Windows. Some games and anti-cheat tools block the standard method but not this ' +
    'one, so try it if keys don’t light up in a certain game. It uses the same tiny amount of CPU. If ' +
    'anything looks off, switch back to Standard.',
  inputNote:
    'Both methods read keys the same way and never save or send them. If a game runs as ' +
    'administrator, start Keystroke Overlay as administrator too. Not sure? Leave it on Standard.',
  debugModeHelp:
    'Adds a Debug tab with tools for finding problems. Nothing is recorded while it is off, nothing ' +
    'is saved to disk, and nothing leaves this PC.',
  manualInstallNote:
    'It can’t be installed from inside the app. Download the new installer from GitHub, close this ' +
    'app, and run it; your settings are kept.',
  updateChannelHelp:
    'Stable: the main, well-tested releases (like 1.2.0 or 1.3.0) — recommended. Latest: every ' +
    'release as soon as it is published, including the small fixes in between (like 1.2.1).',
  updatesNote:
    'Updates are never installed without your click. The app only contacts GitHub for the update ' +
    'check (about once an hour while the app runs, and when this window opens) and for release notes, ' +
    'and sends nothing except its version. Your keystrokes never leave this PC.',
};

// ---------------------------------------------------------------------------------------------------------------------
// 2. Small helpers
// ---------------------------------------------------------------------------------------------------------------------
/** Read / write a value inside an object using a dotted path:  get(S, 'style.radius')  /  put(S, 'style.radius', 8) */
const get = (obj, path) => path.split('.').reduce((o, key) => o?.[key], obj);
function put(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, key) => o[key], obj)[last] = value;
}

/** Make a page element:  el('button', { textContent: 'Hi', onclick }, child1, child2) */
function el(tag, props = {}, ...children) {
  const element = Object.assign(document.createElement(tag), props);
  for (const child of children.flat()) if (child != null) element.append(child);
  return element;
}
const heading = (text) => el('h2', { textContent: text });
const note = (text) => el('p', { className: 'note', textContent: text });
const button = (text, onclick, className = '') => el('button', { textContent: text, onclick, className });
/** One settings row: a label on the left, controls on the right. */
const row = (label, ...controls) =>
  el('div', { className: 'row' }, el('label', { textContent: label }), el('div', { className: 'ctl' }, controls));

/** A checkbox row that saves instantly. `onchange` replaces the default save when a toggle needs extra work. */
function toggle(path, label, onchange) {
  const box = el('input', { type: 'checkbox', checked: !!get(S, path) });
  box.onchange = () => {
    put(S, path, box.checked);
    if (onchange) onchange(box.checked);
    else changed(false, true);
  };
  return row(label, box);
}

/** A small message at the bottom of the window. */
function toast(message, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.className = isError ? 'err' : '';
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}

/** Run a Rust command; if it fails, show the error in a toast and pass the failure on. */
async function call(command, args) {
  try {
    return await invoke(command, args);
  } catch (error) {
    toast(String(error), true);
    throw error;
  }
}

/** For risky buttons: the first click asks "Click again to confirm", the second click really does it. */
function confirmTwice(btn, normalText, action) {
  let timer = 0;
  btn.onclick = () => {
    if (!timer) {
      btn.textContent = 'Click again to confirm';
      timer = setTimeout(() => {
        timer = 0;
        btn.textContent = normalText;
      }, 3500);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    btn.textContent = normalText;
    action();
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------------------------------------------------
// 3. Saving and the live preview
// ---------------------------------------------------------------------------------------------------------------------
const frame = $('#preview'); // the live preview: the real overlay page, shown in a frame
let saveTimer = 0;

/** Send the current settings to the live preview. */
function push() {
  frame.contentWindow?.postMessage({ type: 'cfg', settings: S }, '*');
}

/**
 * Call this after changing S. It updates the preview straight away and saves to disk.
 *   rebuildUi  redraw the current tab (needed when the change affects what the tab shows)
 *   immediate  save now instead of waiting 150 ms (switches and toggles); sliders and typing wait so they batch up
 */
function changed(rebuildUi = false, immediate = false) {
  push();
  clearTimeout(saveTimer);
  const save = () => {
    saveTimer = 0;
    call('save_settings', { settings: S });
  };
  if (immediate) save();
  else saveTimer = setTimeout(save, 150);
  if (rebuildUi) render();
}

/** Save a pending change right now (used when the window closes or an update starts), so nothing is lost. */
async function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    await invoke('save_settings', { settings: S });
  } catch {
    /* nothing more we can do */
  }
}
addEventListener('pagehide', flushPendingSave);
addEventListener('beforeunload', flushPendingSave);

// ---------------------------------------------------------------------------------------------------------------------
// 4. Per-layout key edits
//    Every layout has its own hidden keys, labels and moved keys in
//    S.layout.profiles[layoutId] = { disabledKeys: [], labels: {}, positions: { KeyW: { x, y } } }.
//    `positions` only lists keys the user moved; every other key stays where the layout file puts it. Units are key
//    widths.
// ---------------------------------------------------------------------------------------------------------------------
const EMPTY_PROFILE = () => ({ disabledKeys: [], labels: {}, positions: {} });
const curLayout = () => layouts.find((l) => l.id === S.layout.id) ?? layouts[0];
/** For reading only. Always has all three parts, even for settings saved by older versions. */
const viewProf = () => {
  const p = S.layout.profiles[curLayout()?.id];
  return p
    ? { disabledKeys: p.disabledKeys ?? [], labels: p.labels ?? {}, positions: p.positions ?? {} }
    : EMPTY_PROFILE();
};
/** For changing: creates the profile on the first edit. */
const editProf = () => {
  const p = (S.layout.profiles[curLayout().id] ??= EMPTY_PROFILE());
  p.positions ??= {};
  return p;
};
const isCustom = (id) => {
  const p = S.layout.profiles[id];
  return (
    !!p &&
    (p.disabledKeys?.length > 0 || Object.keys(p.labels ?? {}).length > 0 || Object.keys(p.positions ?? {}).length > 0)
  );
};

/** Forget an edited profile that no longer differs from the default, so "customized" only shows when it should. */
function tidyProf() {
  const id = curLayout().id,
    p = S.layout.profiles[id];
  if (p && !p.disabledKeys.length && !Object.keys(p.labels).length && !Object.keys(p.positions ?? {}).length)
    delete S.layout.profiles[id];
}

const SNAP = 0.25; // keys snap to quarter-key steps
const snap = (v) => Math.round(v / SNAP) * SNAP;
const round2 = (v) => Math.round(v * 100) / 100;
/** Where a key is drawn: its saved position if the user moved it, otherwise the layout file's. */
const keyPos = (key, profile) => profile.positions[key.code] ?? { x: key.x, y: key.y };
/** Save a key's position (dropping the entry when it is back where the layout file has it). */
function setKeyPos(key, x, y) {
  const prof = editProf();
  x = round2(x);
  y = round2(y);
  if (Math.abs(x - key.x) < 1e-6 && Math.abs(y - key.y) < 1e-6) delete prof.positions[key.code];
  else prof.positions[key.code] = { x, y };
  tidyProf();
}

/**
 * "Tidy up": close the dead space left by hidden keys while keeping the keyboard's shape. Every key keeps its place
 * relative to the
 * others; empty gaps of about a key or more close completely, then everything moves to the top-left corner and snaps to
 * quarter steps.
 * Hidden keys are left alone. Returns { code: { x, y } } for the visible keys.
 */
function tidyPositions(layout, profile) {
  const hidden = new Set(profile.disabledKeys);
  const keys = layout.keys.filter((k) => !hidden.has(k.code)).map((k) => ({ k, ...keyPos(k, profile) }));
  if (!keys.length) return {};
  /** For one axis: a function giving a key's new coordinate once the empty gaps are closed. */
  const closeGaps = (start, size) => {
    const spans = keys.map((it) => [start(it), start(it) + size(it)]).sort((a, b) => a[0] - b[0]);
    const groups = []; // stretches of the axis that at least one key covers
    for (const [from, to] of spans) {
      const g = groups[groups.length - 1];
      if (g && from <= g.end + 1e-6) g.end = Math.max(g.end, to);
      else groups.push({ start: from, end: to, shift: 0 });
    }
    let shift = groups[0].start; // the first stretch moves to 0
    groups[0].shift = shift;
    for (let i = 1; i < groups.length; i++) {
      const gap = groups[i].start - groups[i - 1].end;
      if (gap >= 0.75) shift += gap; // a gap of about a key or more closes completely
      groups[i].shift = shift;
    }
    return (it) => start(it) - groups.find((g) => start(it) >= g.start - 1e-6 && start(it) <= g.end + 1e-6).shift;
  };
  const newX = closeGaps(
      (it) => it.x,
      (it) => it.k.w ?? 1,
    ),
    newY = closeGaps(
      (it) => it.y,
      (it) => it.k.h ?? 1,
    );
  const out = {};
  for (const it of keys) out[it.k.code] = { x: Math.max(0, snap(newX(it))), y: Math.max(0, snap(newY(it))) };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Style / Animation controls
//    One line per control. `type` picks how it is drawn: color, range (slider), select (dropdown) or font.
// ---------------------------------------------------------------------------------------------------------------------
const CONTROLS = [
  { tab: 'style', group: 'Key colors', path: 'style.keyFill', type: 'color', label: 'Fill (idle)' },
  { tab: 'style', group: 'Key colors', path: 'style.keyFillPressed', type: 'color', label: 'Fill (pressed)' },
  { tab: 'style', group: 'Key colors', path: 'style.borderColor', type: 'color', label: 'Border (idle)' },
  { tab: 'style', group: 'Key colors', path: 'style.borderColorPressed', type: 'color', label: 'Border (pressed)' },
  { tab: 'style', group: 'Key colors', path: 'style.glowColor', type: 'color', label: 'Glow color' },
  {
    tab: 'style',
    group: 'Shape',
    path: 'style.borderWidth',
    type: 'range',
    min: 0,
    max: 10,
    step: 1,
    unit: 'px',
    label: 'Border thickness',
  },
  {
    tab: 'style',
    group: 'Shape',
    path: 'style.radius',
    type: 'range',
    min: 0,
    max: 40,
    step: 1,
    unit: 'px',
    label: 'Corner radius',
  },
  {
    tab: 'style',
    group: 'Shape',
    path: 'style.glowSize',
    type: 'range',
    min: 0,
    max: 60,
    step: 1,
    unit: 'px',
    label: 'Glow size',
  },
  { tab: 'style', group: 'Text', path: 'style.fontFamily', type: 'font', label: 'Font family' },
  {
    tab: 'style',
    group: 'Text',
    path: 'style.fontSize',
    type: 'range',
    min: 0,
    max: 48,
    step: 1,
    unit: 'px',
    label: 'Font size',
  },
  {
    tab: 'style',
    group: 'Text',
    path: 'style.fontWeight',
    type: 'range',
    min: 100,
    max: 900,
    step: 100,
    label: 'Font weight',
  },
  { tab: 'style', group: 'Text', path: 'style.textColor', type: 'color', label: 'Text (idle)' },
  { tab: 'style', group: 'Text', path: 'style.textColorPressed', type: 'color', label: 'Text (pressed)' },
  {
    tab: 'style',
    group: 'Size',
    path: 'style.keySize',
    type: 'range',
    min: 24,
    max: 120,
    step: 1,
    unit: 'px',
    label: 'Key size',
  },
  {
    tab: 'style',
    group: 'Size',
    path: 'style.gap',
    type: 'range',
    min: 0,
    max: 24,
    step: 1,
    unit: 'px',
    label: 'Key spacing',
  },
  {
    tab: 'style',
    group: 'Size',
    path: 'style.scale',
    type: 'range',
    min: 0.3,
    max: 3,
    step: 0.05,
    unit: '×',
    label: 'Overall scale',
  },
  { tab: 'style', group: 'Size', path: 'style.opacity', type: 'range', min: 0, max: 1, step: 0.05, label: 'Opacity' },

  {
    tab: 'animation',
    group: 'Animation',
    path: 'animation.type',
    type: 'select',
    options: () => reg.animations.map((a) => [a.id, a.name]),
    label: 'Type',
  },
  {
    tab: 'animation',
    group: 'Animation',
    path: 'animation.speed',
    type: 'range',
    min: 0,
    max: 600,
    step: 10,
    unit: 'ms',
    label: 'Speed (duration)',
  },
  {
    tab: 'animation',
    group: 'Animation',
    path: 'animation.easing',
    type: 'select',
    options: () => [['default', 'Animation default'], ...reg.easings.map((e) => [e.id, e.name])],
    label: 'Easing',
  },
  {
    tab: 'animation',
    group: 'Animation',
    path: 'animation.intensity',
    type: 'range',
    min: 0,
    max: 2.5,
    step: 0.1,
    unit: '×',
    label: 'Intensity',
  },
];

/** A colour picker plus a transparency slider. Colours are stored as #RRGGBBAA. */
function colorCtl(c) {
  const value = get(S, c.path) || '#000000ff';
  const alpha = value.length >= 9 ? parseInt(value.slice(7, 9), 16) : 255;
  const picker = el('input', { type: 'color', value: value.slice(0, 7) });
  const slider = el('input', { type: 'range', min: 0, max: 255, step: 1, value: alpha, title: 'Transparency' });
  const percent = el('span', { className: 'val', textContent: Math.round(alpha / 2.55) + '%' });
  const update = () => {
    const alphaHex = Math.round(+slider.value).toString(16).padStart(2, '0');
    put(S, c.path, picker.value + alphaHex);
    percent.textContent = Math.round(slider.value / 2.55) + '%';
    changed();
  };
  picker.oninput = slider.oninput = update;
  return [picker, slider, percent];
}

/** A slider with its current value written next to it. */
function rangeCtl(c) {
  const slider = el('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: get(S, c.path) });
  const unit = !c.unit ? '' : c.unit === '×' ? '×' : ' ' + c.unit;
  const text = (v) => {
    const number = (+v).toFixed(c.step < 1 ? 2 : 0);
    return (number.endsWith('.00') ? number.slice(0, -3) : number) + unit; // 1.00 shows as "1"
  };
  const output = el('span', { className: 'val', textContent: text(slider.value) });
  slider.oninput = () => {
    put(S, c.path, +slider.value);
    output.textContent = text(slider.value);
    changed();
  };
  return [slider, output];
}

/** A dropdown. `c.options()` gives [value, name] pairs. */
function selectCtl(c) {
  const select = el(
    'select',
    {},
    c.options().map(([value, name]) => el('option', { value, textContent: name })),
  );
  select.value = get(S, c.path);
  select.onchange = () => {
    put(S, c.path, select.value);
    changed();
  };
  return [select];
}

/**
 * The font picker: the user's own fonts, the Windows fonts (each shown in its own font), or "Other" to type any name.
 */
function fontCtl(c) {
  const current = get(S, c.path);
  const mine = customFonts.map((file) => file.replace(/\.[^.]+$/, '')); // "My Font.ttf" -> "My Font"
  const known = new Set([...mine, ...WINDOWS_FONTS]);
  const option = (font) =>
    el('option', { value: font, textContent: font, style: `font-family:"${font}", "Segoe UI", sans-serif` });
  const select = el(
    'select',
    {},
    [
      mine.length ? el('optgroup', { label: 'Your fonts' }, mine.map(option)) : null,
      el('optgroup', { label: 'Windows fonts' }, WINDOWS_FONTS.map(option)),
      el('option', { value: '__custom', textContent: 'Other (type a name)…' }),
    ].filter(Boolean),
  );
  const typed = el('input', { type: 'text', value: current, placeholder: 'Font name', hidden: known.has(current) });
  select.value = known.has(current) ? current : '__custom';
  select.onchange = () => {
    if (select.value === '__custom') {
      typed.hidden = false;
      typed.focus();
      return;
    }
    typed.hidden = true;
    typed.value = select.value;
    put(S, c.path, select.value);
    changed();
  };
  typed.oninput = () => {
    put(S, c.path, typed.value);
    changed();
  };
  return [select, typed];
}

/** Draw every control of one tab, grouped under headings. */
function renderControls(tabName, parent) {
  let group = null;
  for (const c of CONTROLS.filter((c) => c.tab === tabName)) {
    if (c.group !== group) {
      group = c.group;
      parent.append(heading(group));
    }
    parent.append(row(c.label, ...{ color: colorCtl, range: rangeCtl, select: selectCtl, font: fontCtl }[c.type](c)));
  }
}

/** The "Import from file… / Export to file…" pair, identical in the Layout and Style tabs. */
const shareRow = (label, onImport, onExport, exportDisabled = false, tips = {}) =>
  row(
    label,
    el('button', { textContent: 'Import from file…', title: tips.imp || '', onclick: onImport }),
    el('button', {
      textContent: 'Export to file…',
      title: tips.exp || '',
      disabled: exportDisabled,
      onclick: onExport,
    }),
  );

// ---------------------------------------------------------------------------------------------------------------------
// 6. Popups
// ---------------------------------------------------------------------------------------------------------------------

// ---- 6a. The general-purpose dialog (new layout, limit reached, reset). Same look as the release-notes and update
// popups.
/** Show a dialog. buttons: [{ label, primary?, danger?, run? }]. If `run` returns false the dialog stays open. */
function dialog({ title, body, buttons }) {
  $('#dTitle').textContent = title;
  $('#dBody').replaceChildren(...body);
  const close = () => {
    $('#dlg').hidden = true;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  $('#dFoot').replaceChildren(
    ...buttons.map((b) =>
      el('button', {
        type: 'button',
        textContent: b.label,
        className: b.primary ? 'primary' : b.danger ? 'danger' : '',
        onclick: async () => {
          if (!b.run || (await b.run()) !== false) close();
        },
      }),
    ),
  );
  $('#dlg').hidden = false;
  document.addEventListener('keydown', onKey);
  return close;
}

function addLayoutDialog() {
  if (layouts.filter((l) => l.user).length >= MAX_LAYOUTS) {
    dialog({
      title: 'Max layouts reached',
      body: [el('p', { textContent: TEXT.layoutLimitReached(MAX_LAYOUTS) })],
      buttons: [{ label: 'OK', primary: true }],
    });
    return;
  }
  const nameInput = el('input', { type: 'text', placeholder: 'Layout name', maxLength: 30 });
  const create = async () => {
    try {
      const id = await invoke('create_layout', { name: nameInput.value });
      layouts = await call('list_layouts');
      S.layout.id = id;
      selKey = null;
      tab = 'keys';
      toast('Layout created. Click keys to hide the ones you don’t want.');
      render();
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') $('#dFoot .primary').click();
  };
  dialog({
    title: 'New layout',
    body: [el('p', { textContent: TEXT.newLayoutHelp }), nameInput],
    buttons: [{ label: 'Cancel' }, { label: 'Create', primary: true, run: create }],
  });
  nameInput.focus();
}

function resetDialog() {
  const reset = async () => {
    try {
      obsUrl = await invoke('reset_settings');
      frame.src = previewSrc();
      updateObs();
      toast('All settings reset');
      return true;
    } catch (error) {
      toast(String(error), true);
      return false;
    }
  };
  dialog({
    title: 'Reset all settings?',
    body: [el('p', { textContent: TEXT.resetBodyWhatChanges }), el('p', { textContent: TEXT.resetBodyLinkNote })],
    buttons: [{ label: 'Cancel' }, { label: 'Reset everything', danger: true, run: reset }],
  });
}

// ---- 6b. Our own right-click menu. The browser's menu never appears; only layout cards show this one.
let menuEl = null;
function hideMenu() {
  menuEl?.remove();
  menuEl = null;
}
/** Show a small menu at the mouse. items: [{ label, run?, danger?, disabled? }] */
function showMenu(event, items) {
  event.preventDefault();
  event.stopPropagation();
  hideMenu();
  menuEl = el(
    'div',
    { className: 'ctxmenu' },
    items.map((item) =>
      el('button', {
        type: 'button',
        textContent: item.label,
        className: item.danger ? 'danger' : '',
        disabled: !!item.disabled,
        onclick: () => {
          hideMenu();
          item.run?.();
        },
      }),
    ),
  );
  document.body.append(menuEl);
  const box = menuEl.getBoundingClientRect(); // keep the menu fully inside the window
  menuEl.style.left = Math.max(4, Math.min(event.clientX, innerWidth - box.width - 4)) + 'px';
  menuEl.style.top = Math.max(4, Math.min(event.clientY, innerHeight - box.height - 4)) + 'px';
}
// layout cards call showMenu first, which stops this
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener(
  'mousedown',
  (e) => {
    if (menuEl && !menuEl.contains(e.target)) hideMenu();
  },
  true,
);
addEventListener('blur', hideMenu);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu();
});
// nothing in this window can be dragged away
addEventListener('dragstart', (e) => e.preventDefault());

// ---- 6c. Release notes ("What's new"), fetched from GitHub
/** A tiny, safe markdown reader: headings, bullets, **bold** and `code`. Everything is inserted as plain text. */
function md(source) {
  const fragment = document.createDocumentFragment();
  let list = null;
  const inline = (parent, text) => {
    // turns **bold** and `code` into elements
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0,
      m;
    while ((m = pattern.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      parent.append(
        m[0].startsWith('**')
          ? el('strong', { textContent: m[0].slice(2, -2) })
          : el('code', { textContent: m[0].slice(1, -1) }),
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
  };
  for (const rawLine of source.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // links become plain text
    let m;
    if (!line.trim()) {
      list = null;
      continue;
    }
    if ((m = /^#{1,6}\s+(.*)$/.exec(line))) {
      list = null;
      const h = el('h4');
      inline(h, m[1]);
      fragment.append(h);
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      if (!list) {
        list = el('ul');
        fragment.append(list);
      }
      const li = el('li');
      inline(li, m[1]);
      list.append(li);
    } else {
      list = null;
      const p = el('p');
      inline(p, line);
      fragment.append(p);
    }
  }
  return fragment;
}

function closeModal() {
  $('#modal').hidden = true;
  document.removeEventListener('keydown', closeOnKey);
}
const closeOnKey = (e) => {
  if (e.key === 'Escape' || e.key === 'Enter') closeModal();
};

/*
 * "Typing" reveal for the release notes. Each piece of text is split into [typed part][hidden rest]. The hidden rest
 * still takes up its space, so nothing shifts or re-wraps while typing. It runs on animation frames for under a
 * second and leaves no timer behind.
 */
let typingRun = 0;
function typeIn(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // respect the "reduce motion" setting
  const run = ++typingRun;
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) if (node.nodeValue) textNodes.push(node);
  const parts = textNodes.map((node) => {
    const full = node.nodeValue,
      typed = document.createTextNode(''),
      rest = el('span', { textContent: full });
    rest.style.visibility = 'hidden';
    node.replaceWith(typed, rest);
    return { full, typed, rest, done: 0 };
  });
  const total = parts.reduce((sum, p) => sum + p.full.length, 0);
  if (!total) return;
  const duration = Math.min(800, Math.max(300, total * 7)); // always under one second
  let shown = 0,
    index = 0,
    startTime = 0;
  const step = (now) => {
    if (run !== typingRun || $('#modal').hidden) return; // cancelled or closed
    startTime ||= now;
    const want = Math.min(total, Math.ceil((total * (now - startTime)) / duration));
    while (shown < want && index < parts.length) {
      const p = parts[index],
        take = Math.min(p.full.length - p.done, want - shown);
      if (take > 0) {
        p.done += take;
        shown += take;
        p.typed.nodeValue = p.full.slice(0, p.done);
        p.rest.textContent = p.full.slice(p.done);
      }
      if (p.done >= p.full.length) {
        p.rest.remove();
        index++;
      } else break;
    }
    if (shown < total) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // safety net if animation frames are paused
  setTimeout(() => {
    if (run !== typingRun) return;
    for (const p of parts) {
      p.typed.nodeValue = p.full;
      p.rest.remove();
    }
  }, duration + 400);
}

/** Three dots that appear one after another while the notes load (pure CSS animation). */
const loadingDots = () =>
  el(
    'p',
    { className: 'dots', role: 'status', ariaLabel: 'Loading release notes' },
    el('span', { textContent: '.' }),
    el('span', { textContent: '.' }),
    el('span', { textContent: '.' }),
  );

async function showNotes(version, title) {
  typingRun++; // cancel any typing still going
  $('#mTitle').textContent = title || `Release notes — v${version}`;
  const body = $('#mBody');
  body.replaceChildren(loadingDots());
  $('#modal').hidden = false;
  document.addEventListener('keydown', closeOnKey);
  $('#mOk').focus();
  try {
    const notes = await invoke('get_release_notes', { version });
    if ($('#modal').hidden) return;
    body.replaceChildren(
      notes.body.trim()
        ? md(notes.body)
        : el('p', { className: 'hint', textContent: 'This release has no written notes.' }),
    );
    typeIn(body);
  } catch (error) {
    if (!$('#modal').hidden) body.replaceChildren(el('p', { className: 'hint', textContent: String(error) }));
  }
}
$('#mOk').onclick = closeModal;

// ---- 6d. The update button (bottom-left corner) and its dialog.
//      Nothing is downloaded or installed until the user clicks the button AND confirms in the dialog.
let updateBusy = false;

/** Remember the latest update answer and show or hide the corner button. */
function setUpdate(result) {
  lastUpdate = result;
  $('#updateBtn').hidden = !(result && result.available);
  return result;
}

/** A new answer arrived (from a background check); redraw General only if it actually changed. */
function showUpdateResult(result) {
  const isNew = JSON.stringify(result) !== JSON.stringify(lastUpdate);
  setUpdate(result);
  if (isNew && tab === 'general') render();
}

function openUpdateDialog() {
  const r = lastUpdate;
  if (!r?.available) return;
  $('#uTitle').textContent = `Update available — v${r.version}`;
  $('#uBody').replaceChildren(
    ...[
      el('p', {
        className: 'hint',
        textContent: `You have v${r.current} · ${r.channel === 'latest' ? 'Latest' : 'Stable'} channel`,
      }),
      r.manual ? el('p', { textContent: TEXT.manualInstallDialog }) : null,
      r.notes ? md(r.notes) : null,
      // replaceChildren would print "null" for empty slots
    ].filter(Boolean),
  );
  $('#uGo').textContent = r.manual ? 'Open GitHub installer' : 'Update now';
  $('#uGo').disabled = $('#uLater').disabled = false;
  updateBusy = false;
  upProg = null;
  paintProgress();
  $('#uText').textContent = '';
  $('#updModal').hidden = false;
  $('#uGo').focus();
}
$('#updateBtn').onclick = openUpdateDialog;
$('#uLater').onclick = () => {
  if (!updateBusy) $('#updModal').hidden = true;
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !updateBusy && !$('#updModal').hidden) $('#updModal').hidden = true;
});

$('#uGo').onclick = async () => {
  const r = lastUpdate;
  if (!r?.available) return;
  if (r.manual) {
    // cannot be installed from inside the app
    try {
      await invoke('open_release_page', { url: r.url });
    } catch (error) {
      toast(String(error), true);
    }
    return;
  }
  updateBusy = true;
  $('#uGo').disabled = $('#uLater').disabled = true;
  clearTimeout(saveTimer);
  saveTimer = 0;
  // nothing pending when the app restarts
  try {
    await invoke('save_settings', { settings: S });
  } catch {
    /* ignore */
  }
  upProg = { pct: 0, text: 'Starting download…' };
  paintProgress();
  try {
    // downloads, verifies the signature, installs, restarts
    await invoke('install_update');
  } catch (error) {
    updateBusy = false;
    upProg = null;
    paintProgress();
    $('#uText').textContent = String(error);
    $('#uGo').disabled = $('#uLater').disabled = false;
  }
};

/** Draw the download progress bar in the update dialog and, if General is showing, in General too. */
function paintProgress() {
  const dialogBar = $('#uBar');
  if (dialogBar) {
    dialogBar.hidden = !upProg;
    $('#uFill').style.width = (upProg ? Math.max(0, upProg.pct) : 0) + '%';
    // negative = size unknown, show a moving bar
    $('#uFill').classList.toggle('indet', !!upProg && upProg.pct < 0);
    if (upProg) $('#uText').textContent = upProg.text;
  }
  const bar = $('#upBar'),
    fill = $('#upFill'),
    text = $('#upText');
  if (!bar) return; // General is not showing
  bar.hidden = !upProg;
  if (upProg) {
    fill.style.width = upProg.pct + '%';
    fill.classList.toggle('indet', upProg.pct < 0);
    text.textContent = upProg.text;
  } else text.textContent = '';
}

// ---------------------------------------------------------------------------------------------------------------------
// 7. The six tabs. Each one builds and returns the page content.
// ---------------------------------------------------------------------------------------------------------------------
const TABS = {
  // ---- Layout: pick a keyboard, make your own, share them -----------------------------------------------------------
  layout() {
    const page = el('div');
    page.append(heading('Keyboard layout'), note(TEXT.layoutTabHelp));

    const cards = el('div', { className: 'cards' });
    for (const l of layouts) cards.append(layoutCard(l));
    const mine = layouts.filter((l) => l.user).length;
    cards.append(
      el(
        'div',
        { className: 'card add', title: 'Add a layout', onclick: addLayoutDialog },
        el('span', { className: 'plus', textContent: '+' }),
        el('small', { textContent: `${mine}/${MAX_LAYOUTS} layouts` }),
      ),
    );
    page.append(cards, heading('Share'));
    page.append(
      shareRow('Layouts you made', importLayouts, exportLayouts, !layouts.some((l) => l.user), {
        imp: 'Add layouts from a file someone shared (or that you exported)',
        exp: 'Save the layouts you made, with their key edits, to a file',
      }),
    );
    return page;
  },

  // ---- Keys: show / hide keys and rename them -----------------------------------------------------------------------
  keys() {
    const page = el('div'),
      layout = curLayout();
    if (!layout) return page;
    const profile = viewProf();
    page.append(heading('Keys — ' + layout.name), note(TEXT.keysTabHelp));
    page.append(keyboardMap(layout, profile), keyButtons(layout));
    const selected = selKey && layout.keys.find((k) => k.code === selKey);
    if (selected) page.append(keyEditor(selected, profile));
    return page;
  },

  // ---- Style: themes, presets, colours, shape, text, size -----------------------------------------------------------
  async style() {
    const page = el('div');
    page.append(heading('Themes & presets'));

    const themes = el(
      'select',
      {},
      el('option', { value: '', textContent: 'Built-in themes…' }),
      reg.themes.map((t) => el('option', { value: t.id, textContent: t.name })),
    );
    themes.onchange = () => {
      const theme = reg.themes.find((t) => t.id === themes.value);
      if (!theme) return;
      Object.assign(S.style, theme.style);
      Object.assign(S.animation, theme.animation);
      changed(true);
    };
    page.append(row('Built-in theme', themes));

    const names = await call('list_presets');
    const saved = el(
      'select',
      {},
      el('option', { value: '', textContent: names.length ? 'My presets…' : 'No saved presets yet' }),
      names.map((n) => el('option', { value: n, textContent: n })),
    );
    const apply = (data) => {
      // used by Load and by Import
      if (data.style) Object.assign(S.style, data.style);
      if (data.animation) Object.assign(S.animation, data.animation);
      changed(true);
    };
    const currentLook = () => ({ style: S.style, animation: S.animation });
    page.append(
      row(
        'My presets',
        saved,
        button('Load', async () => {
          if (saved.value) apply(await call('load_preset', { name: saved.value }));
        }),
        button(
          'Delete',
          async () => {
            if (saved.value) {
              await call('delete_preset', { name: saved.value });
              render();
            }
          },
          'danger',
        ),
      ),
    );

    const nameInput = el('input', { type: 'text', placeholder: 'Preset name' });
    page.append(
      row(
        'Save current as',
        nameInput,
        button('Save', async () => {
          await call('save_preset', { name: nameInput.value, data: currentLook() });
          toast('Preset saved');
          render();
        }),
      ),
    );
    page.append(
      shareRow(
        'Share style',
        async () => {
          const data = await call('import_preset');
          if (data) {
            apply(data);
            toast('Imported');
          }
        },
        async () => {
          if (await call('export_preset', { data: currentLook() })) toast('Exported');
        },
        false,
        { imp: 'Load a style from a file someone shared', exp: 'Save the current style and animation to a file' },
      ),
    );
    renderControls('style', page);
    return page;
  },

  // ---- Animation ----------------------------------------------------------------------------------------------------
  animation() {
    const page = el('div');
    renderControls('animation', page);
    page.append(note(TEXT.animationTabNote));
    return page;
  },

  // ---- Fonts: add your own font files -------------------------------------------------------------------------------
  async fonts() {
    const page = el('div');
    page.append(heading('Custom fonts'), note(TEXT.fontsTabHelp));
    page.append(
      el(
        'div',
        { className: 'btns' },
        button(
          'Add font…',
          async () => {
            const name = await call('add_font');
            if (name) {
              toast('Added ' + name);
              await reloadFonts();
              render();
            }
          },
          'primary',
        ),
        button('Open fonts folder', () => call('open_folder', { kind: 'fonts' })),
      ),
    );

    const list = el('div', { className: 'fontlist' });
    if (!customFonts.length) list.append(note('No custom fonts yet.'));
    for (const file of customFonts) {
      const family = file.replace(/\.[^.]+$/, '');
      list.append(
        el(
          'div',
          { className: 'fontitem' },
          el('span', { className: 'n', textContent: file }),
          button(S.style.fontFamily === family ? 'In use' : 'Use', () => {
            S.style.fontFamily = family;
            changed(true);
          }),
          button(
            'Remove',
            async () => {
              await call('remove_font', { name: file });
              await reloadFonts();
              render();
            },
            'danger',
          ),
        ),
      );
    }
    page.append(list);
    return page;
  },

  // ---- General: OBS link, server, security, input method, app options, updates --------------------------------------
  general() {
    const page = el('div');
    page.append(
      ...obsSection(),
      ...serverSection(),
      ...secureLinkSection(),
      ...inputSection(),
      ...appSection(),
      ...updatesSection(),
    );
    return page;
  },
};

// ---- Layout tab pieces ----------------------------------------------------------------------------------------------
/** One clickable card in the layout grid. Right-click a layout you made to delete it. */
function layoutCard(l) {
  const deleteItem = l.user
    ? {
        label: 'Delete layout',
        danger: true,
        run: async () => {
          await call('delete_layout', { id: l.id });
          toast(l.name + ' deleted');
        },
      }
    : { label: 'Built-in layouts can’t be deleted', disabled: true };
  return el(
    'div',
    {
      className: 'card' + (S.layout.id === l.id ? ' sel' : ''),
      onclick: () => {
        S.layout.id = l.id;
        selKey = null;
        changed(true);
      },
      oncontextmenu: (e) => showMenu(e, [deleteItem]),
    },
    el('b', { textContent: l.name }),
    el('span', { textContent: l.keys.length + ' keys' + (isCustom(l.id) ? ' · customized' : '') }),
  );
}

async function importLayouts() {
  try {
    const result = await invoke('import_layouts');
    if (!result) return; // the user cancelled the file picker
    const [added, skipped] = result;
    if (added) toast(`Imported ${plural(added, 'layout')}` + (skipped ? `, skipped ${skipped}` : ''));
    else toast('Nothing imported' + (skipped ? ` (${skipped} skipped: empty, or the 20-layout limit)` : ''), true);
    layouts = await call('list_layouts');
    render();
  } catch (error) {
    toast(String(error), true);
  }
}

async function exportLayouts() {
  try {
    const count = await invoke('export_layouts');
    if (count) toast(`Exported ${plural(count, 'layout')}`);
  } catch (error) {
    toast(String(error), true);
  }
}

// ---- Keys tab pieces ------------------------------------------------------------------------------------------------
/** CSS for one key on the keyboard picture: position in key units (plus the 8px margin), size in pixels. */
function keyBoxStyle(left, top, w, h, unit) {
  const px = (n) => n + 'px';
  const fontSize = Math.max(8, Math.round((11 * unit) / 38));
  const box = `left:${px(left * unit + 8)};top:${px(top * unit + 8)};width:${px(w)};height:${px(h)}`;
  return `${box};font-size:${px(fontSize)}`;
}

/** True while the pointer was just released after dragging a key, so the click that follows must not also select it. */
let justDragged = false;

/**
 * The picture of the keyboard. Keys are scaled so the whole layout (plus one spare key of room) fits the box without
 * scrolling.
 */
function keyboardMap(layout, profile) {
  const placed = layout.keys.map((k) => ({ k, ...keyPos(k, profile) }));
  const minX = Math.min(...placed.map((p) => p.x)),
    minY = Math.min(...placed.map((p) => p.y));
  // One spare key of room on the right and at the bottom, so a key can be dragged outwards to make the layout bigger.
  const spanX = Math.max(...placed.map((p) => p.x + (p.k.w ?? 1))) - minX + 1;
  const spanY = Math.max(...placed.map((p) => p.y + (p.k.h ?? 1))) - minY + 1;
  // the pane's inner width minus the box border
  const available = ($('#pane').clientWidth || 860) - 26 * 2 - 2;
  const unit = Math.max(14, Math.min(38, Math.floor((available - 16) / spanX))); // pixels per key, 38 at most
  const grid = { unit, minX, minY, spanX, spanY };
  const hidden = new Set(profile.disabledKeys);

  // Visible keys that overlap each other get a red outline.
  const visible = placed.filter((p) => !hidden.has(p.k.code));
  const clash = new Set();
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i],
        b = visible[j],
        e = 1e-6;
      if (
        a.x < b.x + (b.k.w ?? 1) - e &&
        b.x < a.x + (a.k.w ?? 1) - e &&
        a.y < b.y + (b.k.h ?? 1) - e &&
        b.y < a.y + (a.k.h ?? 1) - e
      ) {
        clash.add(a.k.code);
        clash.add(b.k.code);
      }
    }

  const inner = el('div', { style: 'position:relative' });
  for (const p of placed) {
    const k = p.k,
      w = (k.w ?? 1) * unit - 3,
      h = (k.h ?? 1) * unit - 3;
    const node = el('div', {
      className:
        'kmk' +
        (hidden.has(k.code) ? ' off' : '') +
        (selKey === k.code ? ' sel' : '') +
        (clash.has(k.code) ? ' clash' : '') +
        (profile.positions[k.code] ? ' moved' : ''),
      style: keyBoxStyle(p.x - minX, p.y - minY, w, h, unit),
      textContent: profile.labels[k.code] ?? k.label,
      title: k.code + ' (drag to move)',
    });
    node.dataset.code = k.code;
    node.onclick = () => {
      if (justDragged) return;
      selKey = k.code;
      render();
    };
    node.onpointerdown = (e) => dragKey(e, node, k, grid);
    inner.append(node);
  }
  inner.style.width = spanX * unit + 16 + 'px';
  inner.style.height = spanY * unit + 16 + 'px';
  const box = el('div', { className: 'keymap' }, inner);
  // +2 for the box border, or it scrolls by 2px
  box.style.height = spanY * unit + 16 + 2 + 'px';
  return box;
}

/**
 * Drag a key to a new place: snaps to quarter-key steps, stays inside the box, and the live preview follows while you
 * drag.
 */
function dragKey(e, node, key, grid) {
  if (e.button !== 0) return;
  const startX = e.clientX,
    startY = e.clientY,
    from = keyPos(key, viewProf());
  let moving = false,
    last = null;
  try {
    node.setPointerCapture(e.pointerId);
  } catch {
    /* not a real pointer (tests): events still arrive on the key itself */
  }
  const move = (ev) => {
    const dx = ev.clientX - startX,
      dy = ev.clientY - startY;
    if (!moving && Math.hypot(dx, dy) < 5) return; // a click, not a drag
    if (!moving) {
      moving = true;
      node.classList.add('drag');
      selKey = key.code;
    }
    const maxX = grid.minX + grid.spanX - (key.w ?? 1),
      maxY = grid.minY + grid.spanY - (key.h ?? 1);
    const x = round2(Math.min(maxX, Math.max(grid.minX, snap(from.x + dx / grid.unit))));
    const y = round2(Math.min(maxY, Math.max(grid.minY, snap(from.y + dy / grid.unit))));
    node.style.left = (x - grid.minX) * grid.unit + 8 + 'px';
    node.style.top = (y - grid.minY) * grid.unit + 8 + 'px';
    if (!last || last.x !== x || last.y !== y) {
      last = { x, y };
      setKeyPos(key, x, y);
      push();
    }
  };
  const done = () => {
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', done);
    node.removeEventListener('pointercancel', done);
    if (moving) {
      justDragged = true;
      setTimeout(() => {
        justDragged = false;
      }, 0);
      changed(true);
    }
  };
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', done);
  node.addEventListener('pointercancel', done);
}

// Arrow keys nudge the selected key (Shift = a whole key). Ignored while typing in a field or while a popup is open.
addEventListener('keydown', (e) => {
  if (tab !== 'keys' || !selKey || !e.key.startsWith('Arrow')) return;
  if (
    e.target.closest?.('input, select, textarea, button') ||
    !$('#dlg').hidden ||
    !$('#modal').hidden ||
    !$('#updModal').hidden
  )
    return;
  const layout = curLayout(),
    key = layout?.keys.find((k) => k.code === selKey);
  if (!key) return;
  e.preventDefault();
  const step = e.shiftKey ? 1 : SNAP,
    at = keyPos(key, viewProf());
  const dx = { ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0,
    dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] ?? 0;
  setKeyPos(key, Math.max(0, at.x + dx * step), Math.max(0, at.y + dy * step));
  changed(true);
});

/** Enable all / Disable all / Reset all labels / Tidy up / Reset positions / Revert to Default. */
function keyButtons(layout) {
  const revert = el('button', {
    className: 'danger',
    textContent: 'Revert to Default',
    disabled: !isCustom(layout.id),
    title: 'Undo all key edits (hidden keys, labels and moved keys) for this layout',
  });
  confirmTwice(revert, 'Revert to Default', () => {
    delete S.layout.profiles[layout.id];
    selKey = null;
    changed(true);
    toast(layout.name + ' reverted to default');
  });
  const moved = Object.keys(viewProf().positions).length > 0;
  const tidy = button('Tidy up', () => {
    const prof = editProf(),
      next = tidyPositions(layout, viewProf());
    // keep only positions that differ from the layout file
    for (const k of layout.keys) {
      const n = next[k.code];
      if (!n) continue;
      if (Math.abs(n.x - k.x) < 1e-6 && Math.abs(n.y - k.y) < 1e-6) delete prof.positions[k.code];
      else prof.positions[k.code] = { x: round2(n.x), y: round2(n.y) };
    }
    tidyProf();
    changed(true);
    toast('Gaps closed');
  });
  tidy.title = 'Close the gaps left by hidden keys, keeping the shape of the keyboard';
  const reset = button('Reset positions', () => {
    editProf().positions = {};
    tidyProf();
    changed(true);
  });
  reset.disabled = !moved;
  reset.title = 'Put every moved key back where the layout has it';
  return el(
    'div',
    { className: 'btns' },
    button('Enable all', () => {
      editProf().disabledKeys = [];
      tidyProf();
      changed(true);
    }),
    button('Disable all', () => {
      editProf().disabledKeys = layout.keys.map((k) => k.code);
      changed(true);
    }),
    button('Reset all labels', () => {
      editProf().labels = {};
      tidyProf();
      changed(true);
    }),
    tidy,
    reset,
    revert,
  );
}

/**
 * The small editor under the keyboard for the selected key: show/hide it, give it a label, and set its exact position.
 */
function keyEditor(key, profile) {
  const show = el('input', { type: 'checkbox', checked: !profile.disabledKeys.includes(key.code) });
  show.onchange = () => {
    const edited = editProf(),
      hidden = new Set(edited.disabledKeys);
    if (show.checked) hidden.delete(key.code);
    else hidden.add(key.code);
    edited.disabledKeys = [...hidden];
    tidyProf();
    changed(true);
  };
  const label = el('input', {
    type: 'text',
    value: profile.labels[key.code] ?? key.label ?? '',
    placeholder: 'Label',
    maxLength: 12,
  });
  label.oninput = () => {
    editProf().labels[key.code] = label.value;
    changed();
  };
  const reset = button('Reset', () => {
    delete editProf().labels[key.code];
    tidyProf();
    changed(true);
  });

  const at = keyPos(key, profile);
  const num = (value) =>
    el('input', { type: 'number', min: 0, max: 100, step: SNAP, value: round2(value), style: 'width:84px' });
  const px = num(at.x),
    py = num(at.y);
  const place = () => {
    const x = parseFloat(px.value),
      y = parseFloat(py.value);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setKeyPos(key, Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
      changed();
    }
  };
  px.oninput = py.oninput = place;
  // redraw the keyboard once typing settles
  px.onchange = py.onchange = () => render();
  const back = button('Reset', () => {
    delete editProf().positions[key.code];
    tidyProf();
    changed(true);
  });
  back.disabled = !profile.positions[key.code];

  return el(
    'div',
    { className: 'editor' },
    el('b', { textContent: key.code }),
    row('Show this key', show),
    row('Custom label', label, reset),
    row('Position', el('span', { textContent: 'X' }), px, el('span', { textContent: 'Y' }), py, back),
    note(TEXT.keyEditorTip),
  );
}

// ---- General tab sections (one function per heading, in the order they are shown) ----
async function reloadFonts() {
  customFonts = await call('list_fonts');
}

function obsSection() {
  return [
    heading('OBS'),
    row('Browser Source URL', el('input', { value: obsUrl, readOnly: true }), button('Copy', copyUrl, 'primary')),
    el('p', { className: 'note', id: 'sizeNote', textContent: sizeText() }),
  ];
}

function serverSection() {
  const port = el('input', { type: 'number', min: 1024, max: 65535, value: S.general.port, style: 'width:100px' });
  const applyPort = async () => {
    try {
      obsUrl = await invoke('set_port', { port: +port.value });
      S.general.port = +port.value;
      $('#banner').hidden = true;
      toast('Port changed — update your OBS source URL');
      frame.src = previewSrc();
      updateObs();
      render();
    } catch (error) {
      toast(String(error), true);
    }
  };
  const restart = async (e) => {
    e.target.disabled = true;
    try {
      await invoke('restart_server');
      toast('Server restarted');
    } catch (error) {
      toast(String(error), true);
    }
    e.target.disabled = false;
  };
  return [
    heading('Server'),
    row('Port', port, button('Apply', applyPort)),
    el('div', { className: 'btns' }, button('Restart server', restart)),
    note(TEXT.serverNote),
  ];
}

function secureLinkSection() {
  const OFF = TEXT.secureLinkOff;
  const ON = TEXT.secureLinkOn;
  const checkbox = el('input', { type: 'checkbox', checked: !!S.general.secureLink });
  const explanation = el('div', { className: 'note' });
  const newKey = el('button', { className: 'danger', textContent: 'Make a new key' });
  const buttons = el(
    'div',
    { className: 'btns', hidden: !S.general.secureLink },
    button('Copy secure link', copyUrl, 'primary'),
    newKey,
  );
  const paint = (on) => {
    explanation.replaceChildren(md(on ? ON : OFF));
    buttons.hidden = !on;
  };
  // also reloads the live preview with the new link
  const useLink = (url) => {
    obsUrl = url;
    updateObs();
    frame.src = previewSrc();
  };

  checkbox.onchange = async () => {
    const want = checkbox.checked;
    checkbox.disabled = true;
    try {
      useLink(await invoke('set_secure_link', { enabled: want }));
      S.general.secureLink = want;
      updateObs();
      toast(want ? 'Secure link on — copy the new link into OBS.' : 'Secure link off.');
    } catch (error) {
      checkbox.checked = !want;
      toast(String(error), true);
    }
    checkbox.disabled = false;
    paint(checkbox.checked);
  };
  confirmTwice(newKey, 'Make a new key', async () => {
    try {
      useLink(await invoke('regenerate_link_key'));
      toast('New key made — copy the new link into OBS.');
    } catch (error) {
      toast(String(error), true);
    }
  });
  paint(!!S.general.secureLink);
  return [heading('Secure link'), row('Secure my OBS link', checkbox), explanation, buttons];
}

function inputSection() {
  const METHODS = { hook: 'Standard (keyboard hook) — recommended', rawinput: 'Compatibility (Raw Input)' };
  const INFO = {
    hook: TEXT.inputStandard,
    rawinput: TEXT.inputCompatibility,
  };
  const select = el(
    'select',
    {},
    Object.entries(METHODS).map(([value, name]) => el('option', { value, textContent: name })),
  );
  select.value = inputActive;
  const info = el('div', { className: 'note' });
  const error = el('div', { className: 'errnote', hidden: !inputError, textContent: inputError || '' });
  const showInfo = () => info.replaceChildren(md(INFO[select.value]));

  select.onchange = async () => {
    const want = select.value;
    try {
      await invoke('set_input_method', { method: want });
      inputActive = want;
      S.general.inputMethod = want;
      inputError = null;
      error.hidden = true;
      toast('Keyboard input: ' + METHODS[want].replace(' — recommended', ''));
      // the new method could not start: the old one keeps running
    } catch (e) {
      select.value = inputActive;
      inputError = String(e);
      error.textContent = inputError;
      error.hidden = false;
      toast(inputError, true);
    }
    showInfo();
  };
  showInfo();
  return [heading('Keyboard input'), row('Input method', select), error, info, note(TEXT.inputNote)];
}

function appSection() {
  const setAutostart = async (on) => {
    try {
      await invoke('set_autostart', { enabled: on });
    } catch (error) {
      toast(String(error), true);
      S.general.autostart = !on;
      render();
    }
  };
  return [
    heading('App'),
    toggle('general.autostart', 'Start with Windows', setAutostart),
    toggle('general.minimizeToTray', 'Minimize to tray'),
    toggle('general.openOnLaunch', 'Open this window on launch'),
    toggle('general.debugMode', 'Debug mode (for developers)', () => changed(true, true)),
    note(TEXT.debugModeHelp),
    el(
      'div',
      { className: 'btns' },
      button('Open data folder', () => call('open_folder', { kind: 'root' })),
      button('Reset all settings…', resetDialog, 'danger'),
      button('Quit app', () => call('quit_app'), 'danger'),
    ),
  ];
}

function updatesSection() {
  const status = el('span', { className: 'hint', textContent: '' });
  const installBtn = el('button', { className: 'primary', textContent: 'Install update', hidden: true });
  const checkBtn = el('button', { textContent: 'Check for updates' });
  const details = el('p', { className: 'note', hidden: true });

  /** Show the answer of an update check in the status line and the Install button. */
  const showResult = (r) => {
    installBtn.textContent = 'Install update';
    if (r.available && r.manual) {
      status.textContent = `Version ${r.version} is available — this update needs a manual install`;
      details.textContent = (r.notes ? r.notes + '\n\n' : '') + TEXT.manualInstallNote;
      details.style.whiteSpace = 'pre-line';
      details.hidden = false;
      installBtn.textContent = 'Open GitHub installer';
      installBtn.hidden = false;
    } else if (r.available) {
      status.textContent = `Version ${r.version} is available`;
      details.textContent = r.notes || '';
      details.hidden = !r.notes;
      installBtn.hidden = false;
    } else {
      status.textContent = `You're up to date (version ${r.current})`;
      installBtn.hidden = true;
      details.hidden = true;
    }
  };
  /** Ask the app to check now and show the answer. */
  const checkNow = async () => {
    status.textContent = 'Checking…';
    try {
      showResult(setUpdate(await invoke('check_update')));
    } catch (error) {
      status.textContent = String(error);
    }
  };
  checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    await checkNow();
    checkBtn.disabled = false;
  };
  // same confirm dialog as the corner button
  installBtn.onclick = openUpdateDialog;
  if (lastUpdate) showResult(lastUpdate);

  const channel = el(
    'select',
    {},
    el('option', { value: 'stable', textContent: 'Stable (recommended)' }),
    el('option', { value: 'latest', textContent: 'Latest' }),
  );
  channel.value = S.general.updateChannel;
  channel.onchange = async () => {
    S.general.updateChannel = channel.value;
    // the check below must see the new channel
    try {
      await invoke('save_settings', { settings: S });
    } catch {
      /* ignore */
    }
    setUpdate(null);
    await checkNow();
  };

  const progressBar = el(
    'div',
    { className: 'bar', id: 'upBar', hidden: true },
    el('div', { className: 'fill', id: 'upFill' }),
  );
  const statusRow = el(
    'div',
    { className: 'row' },
    el('label'),
    el(
      'div',
      { className: 'ctl', style: 'flex-direction:column;align-items:stretch;gap:6px' },
      status,
      progressBar,
      el('span', { className: 'hint', id: 'upText' }),
    ),
  );
  // after the page is built, show a download already in progress
  setTimeout(paintProgress, 0);

  return [
    heading('Program updates'),
    row(
      'Current version',
      el('b', { textContent: 'v' + appVersion }),
      button('View release notes', () => showNotes(appVersion)),
    ),
    row('Update channel', channel),
    note(TEXT.updateChannelHelp),
    row('Software update', checkBtn, installBtn),
    statusRow,
    details,
    toggle('general.autoCheckUpdates', 'Check for updates automatically'),
    note(TEXT.updatesNote),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// 8. Drawing the window
// ---------------------------------------------------------------------------------------------------------------------
/** Redraw the tab bar and the active tab, keeping the scroll position. */
async function render() {
  // the Debug tab (ui/settings/debug.js) only exists in Debug mode
  const debugOn = !!(S?.general?.debugMode && window.debugTab);
  if (tab === 'debug' && !debugOn) tab = 'general';
  const names = debugOn ? { ...TAB_NAMES, debug: window.debugTab.name } : TAB_NAMES;
  $('#tabs').replaceChildren(
    ...Object.entries(names).map(([id, name]) =>
      button(
        name,
        () => {
          tab = id;
          render();
        },
        id === tab ? 'active' : '',
      ),
    ),
  );
  const pane = $('#pane'),
    scroll = pane.scrollTop;
  const content = await (tab === 'debug' ? window.debugTab.render() : TABS[tab]());
  pane.replaceChildren(content);
  pane.scrollTop = scroll;
}

// ---------------------------------------------------------------------------------------------------------------------
// 9. Messages from the app (tray actions, update results, download progress)
// ---------------------------------------------------------------------------------------------------------------------
const megabytes = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';
ev.listen('update-progress', (e) => {
  const { done, total } = e.payload;
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : -1; // -1 = size unknown
  upProg = {
    pct: percent,
    text: total
      ? `Downloading… ${megabytes(done)} of ${megabytes(total)} (${percent}%)`
      : `Downloading… ${megabytes(done)}`,
  };
  paintProgress();
});
ev.listen('update-installing', () => {
  upProg = { pct: 100, text: 'Installing… the app will restart in a moment.' };
  paintProgress();
});
// the hourly background check found something
ev.listen('update-result', (e) => showUpdateResult(e.payload));
// e.g. the tray's "Update available"
ev.listen('goto-tab', (e) => {
  if (TAB_NAMES[e.payload]) {
    tab = e.payload;
    render();
  }
});

function paintPause() {
  $('#pausebar').hidden = !paused;
}
$('#resumeBtn').onclick = async () => {
  await call('toggle_pause');
};

function showServerError(message) {
  const banner = $('#banner');
  banner.hidden = !message;
  if (message) banner.textContent = message + ' — pick another port in General → Port.';
}

/** Something changed outside this window (a tray action, a layout created): reload everything and redraw. */
async function resync() {
  try {
    obsUrl = (await invoke('get_state')).url;
  } catch {
    /* keep the old address */
  }
  // never lose an edit that was waiting to save
  await flushPendingSave();
  const state = await invoke('get_state');
  try {
    layouts = await invoke('list_layouts');
  } catch {
    /* keep the old list */
  }
  S = state.settings;
  paused = state.paused;
  inputActive = state.inputActive;
  inputError = state.inputError;
  paintPause();
  showServerError(state.serverError);
  push();
  render();
}
ev.listen('settings-changed', resync);

// ---------------------------------------------------------------------------------------------------------------------
// 10. OBS link and preview
// ---------------------------------------------------------------------------------------------------------------------
const sizeText = () => (size ? `Recommended Browser Source size: ${size.w} × ${size.h}` : '');

/** Refresh the address bar at the top (a secured link is hidden on screen, but Copy still copies it). */
function updateObs() {
  $('#obsUrl').value = obsUrl;
  $('#obsUrl').type = S?.general?.secureLink ? 'password' : 'text';
  $('#obsSize').textContent = size ? `Size: ${size.w}×${size.h}` : '';
  const sizeNote = $('#sizeNote');
  if (sizeNote) sizeNote.textContent = sizeText();
}
async function copyUrl() {
  await call('copy_text', { text: obsUrl });
  toast('OBS URL copied');
}
$('#copyUrl').onclick = copyUrl;

/** The address of the live preview: the OBS link plus ?preview=1 (a secured link keeps its ?key=). */
const previewSrc = () => {
  const url = new URL(obsUrl);
  url.searchParams.set('preview', '1');
  return url.toString();
};

/** Scale the preview frame so the whole overlay fits its box. */
function fitPreview() {
  if (!size) return;
  const box = $('#previewBox');
  const scale = Math.min(1, (box.clientWidth - 24) / size.w, (box.clientHeight - 24) / size.h);
  frame.style.width = size.w + 'px';
  frame.style.height = size.h + 'px';
  frame.style.transform = `scale(${scale})`;
  frame.style.left = Math.max(12, (box.clientWidth - size.w * scale) / 2) + 'px';
  frame.style.top = Math.max(12, (box.clientHeight - size.h * scale) / 2) + 'px';
}

// Messages from the live preview page (it tells us when it is ready, how big it is, and which themes/animations exist).
addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const m = e.data || {};
  if (m.type === 'ready') {
    push();
    frame.contentWindow.postMessage({ type: 'getRegistry' }, '*');
  }
  // only these tabs use the lists
  else if (m.type === 'registry') {
    reg = m;
    if (booted && (tab === 'style' || tab === 'animation')) render();
  } else if (m.type === 'size') {
    size = m;
    fitPreview();
    updateObs();
  }
});

// When the window is resized: refit the preview, close any open menu, and redraw the Keys tab (its keyboard is sized to
// the window).
let resizeTimer = 0;
addEventListener('resize', () => {
  fitPreview();
  hideMenu();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (tab === 'keys') render();
  }, 150);
});

// ---- The window buttons. The window has no native title bar, so the page draws minimize / maximize / close itself.
// Dragging the header (and double-clicking it to maximize) is handled by the data-tauri-drag-region attribute in
// index.html.
const appWin = window.__TAURI__.window.getCurrentWindow();
$('#wMin').onclick = () => appWin.minimize();
$('#wMax').onclick = () => appWin.toggleMaximize();
$('#wClose').onclick = () => appWin.close();
/** Show the "restore" glyph while the window is maximized, the "maximize" glyph otherwise. */
async function paintMaxButton() {
  const max = await appWin.isMaximized().catch(() => false);
  const b = $('#wMax');
  b.textContent = max ? '\uE923' : '\uE922';
  b.title = b.ariaLabel = max ? 'Restore' : 'Maximize';
}
appWin.onResized(paintMaxButton);

// ---------------------------------------------------------------------------------------------------------------------
// 11. Start-up
// ---------------------------------------------------------------------------------------------------------------------
(async () => {
  // Three independent questions at once, then draw immediately. The live preview loads afterwards in the background,
  // so it never delays the first screen.
  const [state, layoutList, fonts] = await Promise.all([call('get_state'), call('list_layouts'), call('list_fonts')]);
  S = state.settings;
  obsUrl = state.url;
  appVersion = state.version;
  paused = state.paused;
  layouts = layoutList;
  customFonts = fonts;
  inputActive = state.inputActive;
  inputError = state.inputError;
  // e.g. the tray's "Update available" opens General
  if (state.gotoTab && TAB_NAMES[state.gotoTab]) tab = state.gotoTab;
  paintPause();
  updateObs();
  // the overlay can't load, but the port can still be fixed
  if (state.serverError) {
    showServerError(state.serverError);
    tab = 'general';
  }
  booted = true;
  await render();
  window.__uiReady = performance.timeOrigin + performance.now(); // read by the performance tests
  if (!state.serverError)
    requestAnimationFrame(() => {
      frame.src = previewSrc();
    });
  if (state.whatsNew) {
    // shown once after an update
    // mark as seen right away so it can never repeat
    await invoke('ack_whats_new');
    showNotes(appVersion, `What's new in v${appVersion}`);
  }
})();

// A quiet update check shortly after the window opens (setting "Check for updates automatically").
// The Rust side skips it when switched off and reuses an answer from the last hour.
setTimeout(async () => {
  try {
    const result = await invoke('auto_check_update');
    if (result) showUpdateResult(result);
  } catch {
    /* offline: stay quiet */
  }
}, 700);
