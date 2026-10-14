// One-off helper that generated the built-in layout JSON files. You don't need
// it to add a layout: just drop a .json file in ui/overlay/layouts/ (see README).
// Run: node tools/gen-layouts.mjs
import { writeFileSync } from 'node:fs';

const K = (code, label, x, y, w = 1, h = 1) => ({ code, label, x, y, ...(w !== 1 && { w }), ...(h !== 1 && { h }) });
const row = (y, x0, items) => { let x = x0; return items.map(([c, l, w = 1]) => { const k = K(c, l, x, y, w); x += w; return k; }); };
const letters = s => [...s].map(ch => ['Key' + ch, ch]);

function main(withFn = true) {
  const k = [];
  k.push(K('Escape', 'Esc', 0, 0));
  [[2, 1], [6.5, 5], [11, 9]].forEach(([x0, n]) => { for (let i = 0; i < 4; i++) k.push(K('F' + (n + i), 'F' + (n + i), x0 + i, 0)); });
  k.push(...row(1.5, 0, [['Backquote', '`'], ...'1234567890'.split('').map(d => ['Digit' + d, d]), ['Minus', '-'], ['Equal', '='], ['Backspace', 'Bksp', 2]]));
  k.push(...row(2.5, 0, [['Tab', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]]));
  k.push(...row(3.5, 0, [['CapsLock', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]]));
  k.push(...row(4.5, 0, [['ShiftLeft', 'Shift', 2.25], ...letters('ZXCVBNM'), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]]));
  k.push(...row(5.5, 0, [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', 'Win', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', 'Win', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]]));
  // navigation cluster
  k.push(K('PrintScreen', 'PrtSc', 15.25, 0), K('ScrollLock', 'ScrLk', 16.25, 0), K('Pause', 'Pause', 17.25, 0));
  k.push(K('Insert', 'Ins', 15.25, 1.5), K('Home', 'Home', 16.25, 1.5), K('PageUp', 'PgUp', 17.25, 1.5));
  k.push(K('Delete', 'Del', 15.25, 2.5), K('End', 'End', 16.25, 2.5), K('PageDown', 'PgDn', 17.25, 2.5));
  k.push(K('ArrowUp', '↑', 16.25, 4.5), K('ArrowLeft', '←', 15.25, 5.5), K('ArrowDown', '↓', 16.25, 5.5), K('ArrowRight', '→', 17.25, 5.5));
  return k;
}
function numpad() {
  return [
    K('NumLock', 'Num', 18.5, 1.5), K('NumpadDivide', '/', 19.5, 1.5), K('NumpadMultiply', '*', 20.5, 1.5), K('NumpadSubtract', '-', 21.5, 1.5),
    K('Numpad7', '7', 18.5, 2.5), K('Numpad8', '8', 19.5, 2.5), K('Numpad9', '9', 20.5, 2.5), K('NumpadAdd', '+', 21.5, 2.5, 1, 2),
    K('Numpad4', '4', 18.5, 3.5), K('Numpad5', '5', 19.5, 3.5), K('Numpad6', '6', 20.5, 3.5),
    K('Numpad1', '1', 18.5, 4.5), K('Numpad2', '2', 19.5, 4.5), K('Numpad3', '3', 20.5, 4.5), K('NumpadEnter', 'Ent', 21.5, 4.5, 1, 2),
    K('Numpad0', '0', 18.5, 5.5, 2), K('NumpadDecimal', '.', 20.5, 5.5),
  ];
}
const gameplay = [
  ...row(0, 0.5, [['Tab', 'Tab', 1.5], ...letters('QWERT')]),
  ...row(1, 0.75, [['CapsLock', 'Caps', 1.25], ...letters('ASDFG')]),
  ...row(2, 0, [['ShiftLeft', 'Shift', 2], ...letters('ZXC')]),
  ...row(3, 0, [['ControlLeft', 'Ctrl', 1.5], ['AltLeft', 'Alt', 1.25], ['Space', '', 4.25]]),
];
const wasd = [
  K('KeyQ', 'Q', 0, 0), K('KeyW', 'W', 1, 0), K('KeyE', 'E', 2, 0), K('KeyR', 'R', 3, 0),
  K('ShiftLeft', 'Shift', -1.5, 1, 1.5), K('KeyA', 'A', 0, 1), K('KeyS', 'S', 1, 1), K('KeyD', 'D', 2, 1), K('KeyF', 'F', 3, 1),
  K('ControlLeft', 'Ctrl', -1.5, 2, 1.5), K('Space', '', 0, 2, 4),
].map(k => ({ ...k, x: k.x + 1.5 }));

const out = {
  full: { name: 'Full size (104)', keys: [...main(), ...numpad()] },
  tkl: { name: 'Tenkeyless (TKL)', keys: main() },
  wasd: { name: 'WASD gameplay', keys: wasd },
  gameplay: { name: 'Gameplay (left hand)', keys: gameplay },
};
for (const [id, v] of Object.entries(out)) {
  const lines = v.keys.map(k => '    ' + JSON.stringify(k).replace(/,/g, ', ').replace(/:/g, ': '));
  writeFileSync(`ui/overlay/layouts/${id}.json`,
    `{\n  "id": "${id}",\n  "name": "${v.name}",\n  "keys": [\n${lines.join(',\n')}\n  ]\n}\n`);
}
console.log('layouts written');
