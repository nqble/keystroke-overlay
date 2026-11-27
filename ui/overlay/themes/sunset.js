import { registerTheme } from '/overlay/registry.js';

// Warm amber and coral on deep plum.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'sunset',
  name: 'Sunset',
  style: {
    keyFill: '#2a1530e6',
    keyFillPressed: '#ff8a4cff',
    borderColor: '#ff8a4c80',
    borderColorPressed: '#ffd3a8ff',
    borderWidth: 2,
    radius: 10,
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 700,
    textColor: '#ffd3a8ff',
    textColorPressed: '#2a1530ff',
    glowColor: '#ff6f61ff',
    glowSize: 18,
  },
  animation: { type: 'glow', speed: 130, easing: 'default', intensity: 1 },
});
