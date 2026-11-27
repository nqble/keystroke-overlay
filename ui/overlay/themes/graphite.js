import { registerTheme } from '/overlay/registry.js';

// Quiet dark gray keys that blend into most scenes.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'graphite',
  name: 'Graphite',
  style: {
    keyFill: '#1e2024e6',
    keyFillPressed: '#e6e8ebff',
    borderColor: '#3a3d44ff',
    borderColorPressed: '#e6e8ebff',
    borderWidth: 1,
    radius: 8,
    fontFamily: 'Segoe UI',
    fontSize: 17,
    fontWeight: 600,
    textColor: '#c9ccd1ff',
    textColorPressed: '#1e2024ff',
    glowColor: '#e6e8ebff',
    glowSize: 8,
  },
  animation: { type: 'pressdown', speed: 100, easing: 'default', intensity: 0.8 },
});
