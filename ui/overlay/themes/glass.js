import { registerTheme } from '/overlay/registry.js';

// A frosted, see-through look.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'glass',
  name: 'Frosted glass',
  style: {
    keyFill: '#ffffff1f',
    keyFillPressed: '#ffffff80',
    borderColor: '#ffffff59',
    borderColorPressed: '#ffffffd9',
    borderWidth: 1,
    radius: 14,
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 500,
    textColor: '#ffffffff',
    textColorPressed: '#ffffffff',
    glowColor: '#ffffffff',
    glowSize: 14,
  },
  animation: { type: 'scale', speed: 140, easing: 'default', intensity: 0.8 },
});
