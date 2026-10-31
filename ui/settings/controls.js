// =====================================================================================================================
//  The table that draws every Style / Animation slider, color picker and dropdown.
// =====================================================================================================================
import { Segmented } from './blocks.js';
import { html, render as drawPreact, useLayoutEffect, useRef } from './html.js';
import { el, get, put, row } from './helpers.js';
import { changed } from './preview.js';
import { settings, customFonts, platform, registry } from './state.js';
import { DEFAULT_FONT, systemFonts } from './system-fonts.js';

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
    path: 'style.keyLabels',
    type: 'segmented',
    // letters follow the user's keyboard (AZERTY, QWERTZ, ...); src-tauri/src/key_labels.rs
    options: () => [
      ['keyboard', 'My keyboard'],
      ['layout', 'Layout file'],
    ],
    label: 'Key labels',
  },
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

/** A color picker plus a transparency slider. Colors are stored as #RRGGBBAA. */
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
 * The font picker: the user's own fonts, this system's fonts (each shown in its own font; Windows or Mac fonts, from
 * system-fonts.js), or "Other" to type any name.
 */
/** One font in the font list, shown in its own font. A font is a name, or { value, label }. */
function fontOption(font) {
  const { value, label } = typeof font === 'string' ? { value: font, label: font } : font;
  const item = el('option', { value, textContent: label });
  item.dataset.font = value;
  item.style.setProperty('--option-font', `"${value}", "${DEFAULT_FONT}", system-ui, sans-serif`); // the list shows each name in its own font
  return item;
}

function fontCtl(control) {
  const system = systemFonts(platform);
  const current = get(settings, control.path);
  const mine = customFonts.map((file) => file.replace(/\.[^.]+$/, '')); // "My Font.ttf" -> "My Font"
  const known = new Set([...mine, ...system.fonts.map((font) => font.value)]);
  const select = el(
    'select',
    { test: testName('control', control.path) },
    [
      mine.length ? el('optgroup', { label: 'Your fonts' }, mine.map(fontOption)) : null,
      el('optgroup', { label: system.group }, system.fonts.map(fontOption)),
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

/** Draw the controls of one group of one tab (a section card gives the title, see ControlGroup). */
function renderGroup(tabName, groupName, parent) {
  const builders = { color: colorCtl, range: rangeCtl, select: selectCtl, font: fontCtl, segmented: segmentedCtl };
  for (const control of CONTROLS.filter((c) => c.tab === tabName && c.group === groupName)) {
    if (control.type === 'gallery' || (control.shownIf && !control.shownIf())) continue;
    parent.append(row(control.label, ...builders[control.type](control)));
  }
}

/**
 * One group of the control table inside a Preact screen (a section card of Style or Animation). The controls are still
 * built by renderGroup, so a setting is still one line in CONTROLS.
 */
export function ControlGroup({ tab, group }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    box.current.replaceChildren();
    renderGroup(tab, group, box.current);
  });
  return html`<div class="control-group" ref=${box}></div>`;
}
