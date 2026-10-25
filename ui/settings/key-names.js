// =====================================================================================================================
//  The keys the app can see, by code (the DOM `KeyboardEvent.code` names that src-tauri/src/keyboard/keymap.rs gives
//  them), each with a friendly name and a group; and the legend table: which words printed on a keycap name which key
//  (used by kle-layout.js to link a KLE file's keys). Plain logic, so tests/ui/key-names.test.mjs runs it with Node and
//  checks every code here against keymap.rs. A key the app learns to see is one more line here and in keymap.rs.
// =====================================================================================================================
import { systemWord } from './system-words.js';

const TEXT = {
  groups: {
    letters: 'Letters',
    numbers: 'Numbers',
    functionKeys: 'Function keys',
    modifiers: 'Modifiers',
    navigation: 'Navigation',
    numberPad: 'Number pad',
    other: 'Other',
  },
  left: (name) => `Left ${name}`,
  right: (name) => `Right ${name}`,
};

/** The groups of the key list, in the order a list of keys shows them. */
export const KEY_GROUPS = Object.keys(TEXT.groups);

/** The words a group is shown with. */
export const groupName = (group) => TEXT.groups[group];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DIGITS = '1234567890'.split('');
const FUNCTION_KEY_COUNT = 12; // F1..F12: keymap.rs has no F13 and up

/**
 * Every key the app can see that is not a letter, digit or function key: [code, group, name]. The Control, Alt and Meta
 * keys have no name here: they are called differently on each system (keyName below).
 */
const OTHER_KEYS = [
  ['ShiftLeft', 'modifiers', TEXT.left('Shift')],
  ['ShiftRight', 'modifiers', TEXT.right('Shift')],
  ['ControlLeft', 'modifiers'],
  ['ControlRight', 'modifiers'],
  ['AltLeft', 'modifiers'],
  ['AltRight', 'modifiers'],
  ['MetaLeft', 'modifiers'],
  ['MetaRight', 'modifiers'],
  ['ArrowUp', 'navigation', '↑ Up'],
  ['ArrowDown', 'navigation', '↓ Down'],
  ['ArrowLeft', 'navigation', '← Left'],
  ['ArrowRight', 'navigation', '→ Right'],
  ['Insert', 'navigation', 'Insert'],
  ['Delete', 'navigation', 'Delete'],
  ['Home', 'navigation', 'Home'],
  ['End', 'navigation', 'End'],
  ['PageUp', 'navigation', 'Page Up'],
  ['PageDown', 'navigation', 'Page Down'],
  ['NumLock', 'numberPad', 'Num Lock'],
  ...DIGITS.map((digit) => [`Numpad${digit}`, 'numberPad', `Num ${digit}`]),
  ['NumpadDecimal', 'numberPad', 'Num .'],
  ['NumpadAdd', 'numberPad', 'Num +'],
  ['NumpadSubtract', 'numberPad', 'Num -'],
  ['NumpadMultiply', 'numberPad', 'Num *'],
  ['NumpadDivide', 'numberPad', 'Num /'],
  ['NumpadEnter', 'numberPad', 'Num Enter'],
  ['Escape', 'other', 'Esc'],
  ['Backquote', 'other', '` Backquote'],
  ['Minus', 'other', '- Minus'],
  ['Equal', 'other', '= Equal'],
  ['Backspace', 'other', 'Backspace'],
  ['Tab', 'other', 'Tab'],
  ['BracketLeft', 'other', '[ Left bracket'],
  ['BracketRight', 'other', '] Right bracket'],
  ['Backslash', 'other', '\\ Backslash'],
  ['CapsLock', 'other', 'Caps Lock'],
  ['Semicolon', 'other', '; Semicolon'],
  ['Quote', 'other', "' Quote"],
  ['Enter', 'other', 'Enter'],
  ['IntlBackslash', 'other', 'ISO key beside left Shift'],
  ['Comma', 'other', ', Comma'],
  ['Period', 'other', '. Period'],
  ['Slash', 'other', '/ Slash'],
  ['Space', 'other', 'Space'],
  ['PrintScreen', 'other', 'Print Screen'],
  ['ScrollLock', 'other', 'Scroll Lock'],
  ['Pause', 'other', 'Pause'],
  ['ContextMenu', 'other', 'Menu'],
];

/** Every key the app can see: { code, group, name } (name is undefined for Control, Alt and Meta: see keyName). */
export const KNOWN_KEYS = [
  ...LETTERS.map((letter) => ({ code: `Key${letter}`, group: 'letters', name: letter })),
  ...DIGITS.map((digit) => ({ code: `Digit${digit}`, group: 'numbers', name: digit })),
  ...Array.from({ length: FUNCTION_KEY_COUNT }, (_, index) => ({
    code: `F${index + 1}`,
    group: 'functionKeys',
    name: `F${index + 1}`,
  })),
  ...OTHER_KEYS.map(([code, group, name]) => ({ code, group, name })),
];
const KEY_BY_CODE = new Map(KNOWN_KEYS.map((key) => [key.code, key]));

/** True for a code the app can see (and so can light up). */
export const isKnownKey = (code) => KEY_BY_CODE.has(code);

/** The key's friendly name on this system ("Left Ctrl", "Left ⌘ Command"), or null for a code the app can't see. */
export function keyName(code, platform) {
  const key = KEY_BY_CODE.get(code);
  if (!key) return null;
  if (key.name) return key.name;
  const [modifier, side] = code.split(/(?=Left$|Right$)/); // "ControlLeft" → "Control", "Left"
  const word = systemWord('modifierKeys', platform)[modifier];
  return side === 'Left' ? TEXT.left(word) : TEXT.right(word);
}

// ---- The legend table -----------------------------------------------------------------------------------------------
/**
 * How sure a legend is about its key: its own name, letter or digit (OWN_NAME) beats an unshifted symbol (UNSHIFTED),
 * which beats a shifted one (SHIFTED). So "!\n1" is Digit1 and "<\n," is Comma.
 */
export const RANK = { OWN_NAME: 1, UNSHIFTED: 2, SHIFTED: 3 };

/**
 * The modifiers a legend may name without saying which side ("Shift", "Ctrl"): these codes are not keys, and
 * kle-layout.js turns each into its Left or Right key by where it sits.
 */
export const SIDED_KEYS = {
  Shift: ['ShiftLeft', 'ShiftRight'],
  Control: ['ControlLeft', 'ControlRight'],
  Alt: ['AltLeft', 'AltRight'],
  Meta: ['MetaLeft', 'MetaRight'],
};

/** The words for each sided modifier, lower case. "Win", "Cmd" and "Super" are all Meta: the codes are the same on
 *  every system. */
const MODIFIER_WORDS = {
  Shift: ['shift', '⇧'],
  Control: ['ctrl', 'control', 'ctl', 'strg', '⌃'],
  Alt: ['alt', 'option', 'opt', '⌥'],
  Meta: ['win', 'windows', 'super', 'meta', 'gui', 'os', 'cmd', 'command', '⌘', '❖', '◆'],
};

/** Keys named by their own words: [code, ...legends], lower case, as legends are after cleaning. */
const OWN_NAMES = [
  ['Escape', 'esc', 'escape'],
  ['Backspace', 'backspace', 'back space', 'bksp', 'bkspc', 'bs', '⌫'],
  ['Tab', 'tab', '⇥', '↹'],
  ['CapsLock', 'caps lock', 'capslock', 'caps', '⇪'],
  ['Enter', 'enter', 'return', 'ret', '↵', '⏎', '⌤'],
  ['ContextMenu', 'menu', 'app', 'apps', 'application', 'context menu', '≣', '▤'],
  ['Space', 'space', 'spacebar', 'space bar'],
  ['PrintScreen', 'print screen', 'prtsc', 'prt sc', 'prtscn', 'prt scr', 'print', 'psc', 'sys rq'],
  ['ScrollLock', 'scroll lock', 'scrlk', 'scr lk', 'slck', 'scroll'],
  ['Pause', 'pause', 'pause break', 'break'],
  ['Insert', 'insert', 'ins'],
  ['Delete', 'delete', 'del', '⌦'],
  ['Home', 'home'],
  ['End', 'end'],
  ['PageUp', 'page up', 'pgup', 'pg up', 'pageup'],
  ['PageDown', 'page down', 'pgdn', 'pg dn', 'pagedown'],
  ['ArrowUp', '↑', 'up'],
  ['ArrowDown', '↓', 'down'],
  ['ArrowLeft', '←', 'left'],
  ['ArrowRight', '→', 'right'],
  ['NumLock', 'num lock', 'numlock', 'num', 'nlck'],
  ['AltRight', 'altgr', 'alt gr'], // AltGr is always the right Alt
];

/** The punctuation keys (US places): [code, unshifted symbol, shifted symbol]. */
const SYMBOL_KEYS = [
  ['Backquote', '`', '~'],
  ['Minus', '-', '_'],
  ['Equal', '=', '+'],
  ['BracketLeft', '[', '{'],
  ['BracketRight', ']', '}'],
  ['Backslash', '\\', '|'],
  ['Semicolon', ';', ':'],
  ['Quote', "'", '"'],
  ['Comma', ',', '<'],
  ['Period', '.', '>'],
  ['Slash', '/', '?'],
];
const SHIFTED_DIGITS = '!@#$%^&*()'.split(''); // over 1, 2, ... 9, 0 on a US keyboard

/** One sided modifier's words, with and without a side: "shift", "left shift", "lshift", "right shift", "rshift". */
function modifierEntries(generic, words) {
  const [leftCode, rightCode] = SIDED_KEYS[generic];
  const entries = [];
  for (const word of words) {
    entries.push({ legend: word, code: generic, rank: RANK.OWN_NAME });
    entries.push({ legend: `left ${word}`, code: leftCode, rank: RANK.OWN_NAME });
    entries.push({ legend: `right ${word}`, code: rightCode, rank: RANK.OWN_NAME });
    if (!/^[a-z]{2,}$/.test(word)) continue; // "l⌘" is not a thing; "lctrl" is
    entries.push({ legend: `l${word}`, code: leftCode, rank: RANK.OWN_NAME });
    entries.push({ legend: `r${word}`, code: rightCode, rank: RANK.OWN_NAME });
  }
  return entries;
}

/** Every legend the table knows: { legend, code, rank }. A legend appears once (a test checks it). */
export const LEGEND_ENTRIES = [
  ...LETTERS.map((letter) => ({ legend: letter.toLowerCase(), code: `Key${letter}`, rank: RANK.OWN_NAME })),
  ...DIGITS.map((digit) => ({ legend: digit, code: `Digit${digit}`, rank: RANK.OWN_NAME })),
  ...SHIFTED_DIGITS.map((symbol, index) => ({ legend: symbol, code: `Digit${DIGITS[index]}`, rank: RANK.SHIFTED })),
  ...Array.from({ length: FUNCTION_KEY_COUNT }, (_, index) => ({
    legend: `f${index + 1}`,
    code: `F${index + 1}`,
    rank: RANK.OWN_NAME,
  })),
  ...OWN_NAMES.flatMap(([code, ...legends]) => legends.map((legend) => ({ legend, code, rank: RANK.OWN_NAME }))),
  ...SYMBOL_KEYS.flatMap(([code, unshifted, shifted]) => [
    { legend: unshifted, code, rank: RANK.UNSHIFTED },
    { legend: shifted, code, rank: RANK.SHIFTED },
  ]),
  ...Object.entries(MODIFIER_WORDS).flatMap(([generic, words]) => modifierEntries(generic, words)),
];
const ENTRY_BY_LEGEND = new Map(LEGEND_ENTRIES.map((entry) => [entry.legend, entry]));

/** What a cleaned, lower-case legend names: { code, rank }, or null when it names no key the table knows. */
export function legendMatch(legend) {
  const entry = ENTRY_BY_LEGEND.get(legend);
  return entry ? { code: entry.code, rank: entry.rank } : null;
}

// ---- KLE's key icons ------------------------------------------------------------------------------------------------
/**
 * KLE draws some legends as icons from its own font: <i class='kb kb-Arrows-Up'></i>. Each class name that starts
 * with one of these names the key (from KLE's kbd-webfont.css). Meta, Alt and Control get their side by place.
 */
const ICON_CLASSES = [
  ['kb-Arrows-Up', 'ArrowUp'],
  ['kb-Arrows-Down', 'ArrowDown'],
  ['kb-Arrows-Left', 'ArrowLeft'],
  ['kb-Arrows-Right', 'ArrowRight'],
  ['kb-Unicode-BackSpace-DeleteLeft-', 'Backspace'],
  ['kb-Unicode-DeleteRight-', 'Delete'],
  ['kb-Unicode-Enter-', 'Enter'],
  ['kb-Return-', 'Enter'],
  ['kb-Tab-', 'Tab'],
  ['kb-Unicode-Escape-', 'Escape'],
  ['kb-Unicode-Insert-', 'Insert'],
  ['kb-Unicode-Page-Up-', 'PageUp'],
  ['kb-Unicode-Page-Down-', 'PageDown'],
  ['kb-Line-Start', 'Home'],
  ['kb-Line-End', 'End'],
  ['kb-Hamburger-Menu', 'ContextMenu'],
  ['kb-logo-windows-', 'Meta'],
  ['kb-logo-apple', 'Meta'],
  ['kb-Unicode-Command-', 'Meta'],
  ['kb-Unicode-Option-', 'Alt'],
  ['kb-Unicode-Alternate-', 'Alt'],
  ['kb-Unicode-Control-', 'Control'],
];

/** The codes the icons name (for the test against keymap.rs). */
export const ICON_CODES = ICON_CLASSES.map(([, code]) => code);

/** The code a KLE icon class names ("kb-Arrows-Up" → "ArrowUp"), or null. */
export function iconCode(className) {
  const found = ICON_CLASSES.find(([prefix]) => className.startsWith(prefix));
  return found ? found[1] : null;
}
