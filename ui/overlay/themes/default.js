import { registerTheme } from '/overlay/registry.js';

// The default look: dark rounded keys with a blue pressed colour.
// Copy this file to make your own theme (see docs/EXTENDING.md); the overlay loads every file in this folder.
registerTheme({
  id: 'default',
  name: 'Default (dark blue)',
  style: {
    keyFill: '#1e222bd9',
    keyFillPressed: '#4f8cffff',
    borderColor: '#ffffff40',
    borderColorPressed: '#ffffffff',
    borderWidth: 2,
    radius: 8,
    fontFamily: 'Segoe UI',
    fontSize: 18,
    fontWeight: 600,
    textColor: '#e6e9f0ff',
    textColorPressed: '#ffffffff',
    glowColor: '#4f8cffff',
    glowSize: 18,
  },
  animation: { type: 'none', speed: 120, easing: 'default', intensity: 1 },
});
