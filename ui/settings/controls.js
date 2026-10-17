// =====================================================================================================================
//  The table that draws every Style / Animation slider, colour picker and dropdown.
// =====================================================================================================================
import { Segmented } from './blocks.js';
import { html, render as drawPreact, useLayoutEffect, useRef } from './html.js';
import { el, get, heading, put, row } from './helpers.js';
import { changed } from './preview.js';
import { settings, customFonts, registry } from './state.js';

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
// 5. Style / Animation controls
//    One line per control. `type` picks how it is drawn: color, range (slider), select (dropdown), font, segmented (a
//    few choices side by side, blocks.js), or gallery (cards the tab draws itself, e.g. the Animation tab's; skipped
//    here). `shownIf` (optional) hides a control while it returns false.
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
    type: 'gallery', // the animation cards, tabs/animation.js
    label: 'Animation',
  },
  {
    tab: 'animation',
    group: 'Fine-tune',
    path: 'animation.speed',
    type: 'range',
    min: 0,
    max: 600,
    step: 10,
    unit: 'ms',
    label: 'Speed',
  },
  {
    tab: 'animation',
    group: 'Fine-tune',
    path: 'animation.intensity',
    type: 'range',
    min: 0,
    max: 2.5,
    step: 0.1,
    unit: '×',
    label: 'Strength',
    shownIf: () => !!currentAnimation()?.usesIntensity,
  },
  {
    tab: 'animation',
    group: 'Fine-tune',
    path: 'animation.easing',
    type: 'segmented',
    options: () => [['default', 'Default'], ...registry.easings.map((e) => [e.id, e.name])],
    label: 'Easing',
  },
];

/** The animation in use, as the live preview described it (registry.animations), if it has reported yet. */
export const currentAnimation = () => registry.animations.find((animation) => animation.id === settings.animation.type);

/**
 * The test hook for a setting, made from its path:  testName('control', 'style.keyFill')  ->  'control-style-key-fill'.
 * Tests find controls by this name instead of by their position or label (see "Test hooks" in tests/README.md).
 */
export const testName = (prefix, path) =>
  [prefix, ...path.split('.').map((part) => part.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()))].join('-');

/** A colour picker plus a transparency slider. Colours are stored as #RRGGBBAA. */
function colorCtl(control) {
  const value = get(settings, control.path) || '#000000ff';
  const alpha = value.length >= 9 ? parseInt(value.slice(7, 9), 16) : 255;
  const hook = testName('control', control.path);
  const picker = el('input', { type: 'color', value: value.slice(0, 7), test: hook });
  const slider = el('input', {
    type: 'range',
    min: 0,
    max: 255,
    step: 1,
    value: alpha,
    title: 'Transparency',
    test: hook + '-alpha',
  });
  const percent = el('span', { className: 'val', textContent: Math.round(alpha / 2.55) + '%' });
  const update = () => {
    const alphaHex = Math.round(+slider.value).toString(16).padStart(2, '0');
    put(settings, control.path, picker.value + alphaHex);
    percent.textContent = Math.round(slider.value / 2.55) + '%';
    changed();
  };
  picker.oninput = slider.oninput = update;
  return [picker, slider, percent];
}

/** A slider with its current value written next to it. */
function rangeCtl(control) {
  const slider = el('input', {
    type: 'range',
    min: control.min,
    max: control.max,
    step: control.step,
    value: get(settings, control.path),
    test: testName('control', control.path),
  });
  const unit = !control.unit ? '' : control.unit === '×' ? '×' : ' ' + control.unit;
  const text = (sliderValue) => {
    const number = (+sliderValue).toFixed(control.step < 1 ? 2 : 0);
    return (number.endsWith('.00') ? number.slice(0, -3) : number) + unit; // 1.00 shows as "1"
  };
  const output = el('span', { className: 'val', textContent: text(slider.value) });
  slider.oninput = () => {
    put(settings, control.path, +slider.value);
    output.textContent = text(slider.value);
    changed();
  };
  return [slider, output];
}

/** A dropdown. `c.options()` gives [value, name] pairs. */
function selectCtl(control) {
  const select = el(
    'select',
    { test: testName('control', control.path) },
    control.options().map(([value, name]) => el('option', { value, textContent: name })),
  );
  select.value = get(settings, control.path);
  select.onchange = () => {
    put(settings, control.path, select.value);
    changed();
  };
  return [select];
}

/** A few choices side by side (the Segmented block from blocks.js, drawn into the row by Preact). */
function segmentedCtl(control) {
  const box = el('span', { className: 'segmented-box' });
  const draw = () =>
    drawPreact(
      html`<${Segmented}
        label=${control.label}
        choices=${control.options().map(([value, text]) => ({ value, text }))}
        value=${get(settings, control.path)}
        test=${testName('control', control.path)}
        onChange=${(value) => {
          put(settings, control.path, value);
          changed();
          draw();
        }}
      />`,
      box,
    );
  draw();
  return [box];
}

/**
 * The font picker: the user's own fonts, the Windows fonts (each shown in its own font), or "Other" to type any name.
 */
function fontCtl(control) {
  const current = get(settings, control.path);
  const mine = customFonts.map((file) => file.replace(/\.[^.]+$/, '')); // "My Font.ttf" -> "My Font"
  const known = new Set([...mine, ...WINDOWS_FONTS]);
  const option = (font) => {
    const item = el('option', { value: font, textContent: font });
    item.dataset.font = font;
    item.style.setProperty('--option-font', `"${font}", "Segoe UI", sans-serif`); // the list shows each name in its own font
    return item;
  };
  const select = el(
    'select',
    { test: testName('control', control.path) },
    [
      mine.length ? el('optgroup', { label: 'Your fonts' }, mine.map(option)) : null,
      el('optgroup', { label: 'Windows fonts' }, WINDOWS_FONTS.map(option)),
      el('option', { value: '__custom', textContent: 'Other (type a name)…' }),
    ].filter(Boolean),
  );
  const typed = el('input', {
    type: 'text',
    value: current,
    placeholder: 'Font name',
    hidden: known.has(current),
    test: testName('control', control.path) + '-name',
  });
  select.value = known.has(current) ? current : '__custom';
  select.onchange = () => {
    if (select.value === '__custom') {
      typed.hidden = false;
      typed.focus();
      return;
    }
    typed.hidden = true;
    typed.value = select.value;
    put(settings, control.path, select.value);
    changed();
  };
  typed.oninput = () => {
    put(settings, control.path, typed.value);
    changed();
  };
  return [select, typed];
}

/**
 * Draw every control of one tab, grouped under headings. With `onlyGroup`, only that group's controls and no heading
 * (a v2.0 section card gives the title, see ControlGroup).
 */
export function renderControls(tabName, parent, onlyGroup = null) {
  let group = null;
  for (const control of CONTROLS.filter((c) => c.tab === tabName && (!onlyGroup || c.group === onlyGroup))) {
    if (control.type === 'gallery' || (control.shownIf && !control.shownIf())) continue;
    if (!onlyGroup && control.group !== group) {
      group = control.group;
      parent.append(heading(group));
    }
    parent.append(
      row(
        control.label,
        ...{ color: colorCtl, range: rangeCtl, select: selectCtl, font: fontCtl, segmented: segmentedCtl }[
          control.type
        ](control),
      ),
    );
  }
}

/**
 * The "Import from file… / Export to file…" pair, identical in the Layout and Style tabs. `hookPrefix` names the test
 * hooks: 'layout' gives layout-import and layout-export.
 */
export const shareRow = (label, onImport, onExport, exportDisabled, tips, hookPrefix) =>
  row(
    label,
    el('button', {
      textContent: 'Import from file…',
      title: tips.imp || '',
      onclick: onImport,
      test: hookPrefix + '-import',
    }),
    el('button', {
      textContent: 'Export to file…',
      title: tips.exp || '',
      disabled: exportDisabled,
      onclick: onExport,
      test: hookPrefix + '-export',
    }),
  );

/**
 * One group of the control table inside a Preact screen (a section card of Style or Animation). The controls are still
 * built by renderControls, so a setting is still one line in CONTROLS.
 */
export function ControlGroup({ tab, group }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    box.current.replaceChildren();
    renderControls(tab, box.current, group);
  });
  return html`<div class="control-group" ref=${box}></div>`;
}
