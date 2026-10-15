// =====================================================================================================================
//  The table that draws every Style / Animation slider, colour picker and dropdown.
// =====================================================================================================================
import { el, get, heading, put, row } from './helpers.js';
import { changed } from './preview.js';
import { S, customFonts, reg } from './state.js';

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
export function renderControls(tabName, parent) {
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
export const shareRow = (label, onImport, onExport, exportDisabled = false, tips = {}) =>
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

/** A checkbox row that saves instantly. `onchange` replaces the default save when a toggle needs extra work. */
export function toggle(path, label, onchange) {
  const box = el('input', { type: 'checkbox', checked: !!get(S, path) });
  box.onchange = () => {
    put(S, path, box.checked);
    if (onchange) onchange(box.checked);
    else changed(false, true);
  };
  return row(label, box);
}
