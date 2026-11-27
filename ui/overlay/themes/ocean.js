import { registerTheme } from '/overlay/registry.js';

// Cool teal and blue on deep navy.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'ocean',
  name: 'Ocean',
  style: {
    keyFill: '#0c1d2ee6',
    keyFillPressed: '#2ec4d6ff',
    borderColor: '#2ec4d666',
    borderColorPressed: '#b8f3faff',
    borderWidth: 2,
    radius: 10,
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 700,
    textColor: '#b8f3faff',
    textColorPressed: '#0c1d2eff',
    glowColor: '#2ec4d6ff',
    glowSize: 16,
  },
  animation: { type: 'scale', speed: 110, easing: 'default', intensity: 1 },
});
