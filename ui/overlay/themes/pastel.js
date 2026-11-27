import { registerTheme } from '/overlay/registry.js';

// Soft light colors for calm, cozy scenes.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'pastel',
  name: 'Pastel',
  style: {
    keyFill: '#fdf6ffe6',
    keyFillPressed: '#b8a4f4ff',
    borderColor: '#d9c8f2ff',
    borderColorPressed: '#9c86e6ff',
    borderWidth: 2,
    radius: 14,
    fontFamily: 'Segoe UI',
    fontSize: 17,
    fontWeight: 700,
    textColor: '#6b5a8eff',
    textColorPressed: '#ffffffff',
    glowColor: '#b8a4f4ff',
    glowSize: 14,
  },
  animation: { type: 'bounce', speed: 120, easing: 'default', intensity: 0.8 },
});
